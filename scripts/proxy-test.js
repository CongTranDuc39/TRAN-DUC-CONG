'use strict';

const assert = require('node:assert/strict');

const baseUrl = new URL(process.env.TEST_BASE_URL || 'http://localhost:8082');
const securityHeaders = {
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'permissions-policy': 'camera=(), microphone=(), geolocation=()',
};
let checks = 0;

async function request(pathname, expectedStatus, options = {}) {
  const response = await fetch(new URL(pathname, baseUrl), {
    ...options,
    redirect: 'manual',
    signal: AbortSignal.timeout(10000),
  });
  assert.equal(response.status, expectedStatus, `${pathname}: mã HTTP không đúng`);
  for (const [header, expected] of Object.entries(securityHeaders)) {
    // Fetch joins repeated headers with a comma; exact equality also rejects duplicates.
    assert.equal(response.headers.get(header), expected, `${pathname}: ${header} phải đúng giá trị và chỉ xuất hiện một lần`);
  }
  if (expectedStatus !== 413) {
    assert.match(response.headers.get('content-security-policy') || '', /(?:^|;)\s*frame-ancestors\s+'none'\s*(?:;|$)/i,
      `${pathname}: CSP phải cấm mọi trang nhúng để thống nhất với X-Frame-Options DENY`);
  }
  assert.equal(response.headers.get('server'), 'nginx', `${pathname}: phải đi qua Nginx và không lộ phiên bản`);
  const body = await response.text();
  checks += 1;
  console.log(`OK ${options.method || 'GET'} ${pathname}: HTTP ${expectedStatus}, 4 security headers và Server nginx`);
  return { body, headers: response.headers };
}

async function main() {
  const health = await request('/health', 200);
  assert.deepEqual(JSON.parse(health.body), { status: 'ok', database: 'connected' }, 'Healthcheck phải xác nhận kết nối MySQL qua Nginx');
  await request('/proxy-test-not-found', 404);
  await request('/classes', 403, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'code=PROXY_TEST',
  });
  const oversized = await request('/classes', 413, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `value=${'x'.repeat(64 * 1024)}`,
  });
  assert.match(oversized.body, /<title>413 Request Entity Too Large<\/title>/i, 'Nginx phải từ chối body quá lớn trước khi chuyển đến Express');
  assert.match(oversized.body, /<center>nginx<\/center>/i, 'Trang 413 phải có dấu nhận diện của Nginx');
  assert.doesNotMatch(oversized.body, /\/css\/style\.css|Quản lý sinh viên/iu, 'Trang 413 phải do Nginx tạo, không dùng giao diện EJS');

  const dashboard = await request('/', 200);
  const stylesheets = [...dashboard.body.matchAll(/<link\b[^>]*>/gi)]
    .map(([tag]) => {
      const attributes = Object.fromEntries([...tag.matchAll(/([\w-]+)\s*=\s*(["'])(.*?)\2/gs)]
        .map((match) => [match[1].toLowerCase(), match[3]]));
      return attributes.rel === 'stylesheet' && attributes.href ? new URL(attributes.href, baseUrl) : null;
    })
    .filter((url) => url && url.origin === baseUrl.origin);
  assert.ok(stylesheets.length, 'Dashboard phải có CSS cục bộ để kiểm tra qua Nginx');
  const stylesheet = stylesheets[0];
  const asset = await request(stylesheet.pathname + stylesheet.search, 200);
  assert.match(asset.headers.get('content-type') || '', /^text\/css\b/i, 'Tài nguyên CSS phải giữ đúng Content-Type qua proxy');
  console.log(`Kiểm tra Nginx: ${checks} yêu cầu đạt; không tạo hoặc sửa dữ liệu.`);
}

main().catch((error) => {
  console.error(`FAIL kiểm tra Nginx: ${error.message}`);
  process.exitCode = 1;
});
