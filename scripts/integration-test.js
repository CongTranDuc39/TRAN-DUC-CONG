'use strict';

const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');

const baseUrl = new URL(process.env.TEST_BASE_URL || 'http://localhost:8082');
const cookies = new Map();
const suffix = `${Date.now().toString(36)}${randomBytes(2).toString('hex')}`.toUpperCase();
const prefix = `IT${suffix}`;
const entities = [];
let checks = 0;

function pass(message) {
  checks += 1;
  console.log(`OK ${message}`);
}

async function request(method, pathname, fields) {
  const headers = { Accept: 'text/html,application/json' };
  if (cookies.size) headers.Cookie = [...cookies].map(([key, value]) => `${key}=${value}`).join('; ');
  const options = { method, headers, redirect: 'manual', signal: AbortSignal.timeout(15000) };
  if (fields) {
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
    options.body = new URLSearchParams(fields);
  }
  const response = await fetch(new URL(pathname, baseUrl), options);
  for (const cookie of response.headers.getSetCookie()) {
    const pair = cookie.split(';', 1)[0];
    const equals = pair.indexOf('=');
    cookies.set(pair.slice(0, equals), pair.slice(equals + 1));
  }
  return { status: response.status, location: response.headers.get('location'), body: await response.text() };
}

function attributes(tag) {
  const result = {};
  for (const match of tag.matchAll(/([\w-]+)\s*=\s*(["'])(.*?)\2/gs)) result[match[1]] = match[3];
  return result;
}

function csrfToken(html) {
  for (const tag of html.matchAll(/<input\b[^>]*>/gi)) {
    const attrs = attributes(tag[0]);
    if (attrs.name === '_csrf') return attrs.value;
  }
  assert.fail('Form phải chứa input _csrf.');
}

async function page(pathname) {
  const result = await request('GET', pathname);
  assert.equal(result.status, 200, `GET ${pathname} phải trả 200`);
  return result.body;
}

async function post(pathname, fields, formPath) {
  const formHtml = await page(formPath);
  return request('POST', pathname, { ...fields, _csrf: csrfToken(formHtml) });
}

function expectRedirect(result, action) {
  assert.ok([302, 303].includes(result.status), `${action}: kỳ vọng redirect, nhận ${result.status}`);
  assert.ok(result.location, `${action}: thiếu Location`);
}

function tableRow(html, values) {
  return [...html.matchAll(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi)].map((match) => match[0])
    .find((row) => values.every((value) => row.includes(value)));
}

async function findId(type, values) {
  const html = await page(`/${type}`);
  const row = tableRow(html, values);
  assert.ok(row, `Không tìm thấy bản ghi kiểm thử ${type}.`);
  const match = row.match(new RegExp(`/${type}/(\\d+)/edit`));
  assert.ok(match, `Bản ghi ${type} phải có đường dẫn sửa.`);
  return Number(match[1]);
}

async function create(type, fields, markers) {
  const entity = { type, markers, id: null };
  entities.push(entity);
  expectRedirect(await post(`/${type}`, fields, `/${type}/new`), `Tạo ${type}`);
  entity.id = await findId(type, markers);
  return entity;
}

async function update(entity, fields) {
  expectRedirect(await post(`/${entity.type}/${entity.id}`, fields, `/${entity.type}/${entity.id}/edit`), `Sửa ${entity.type}`);
}

function hasNumber(html, value) {
  const literal = value.toFixed(2).replace('.', '[.,]');
  return new RegExp(`(^|[^0-9])${literal}([^0-9]|$)`).test(html);
}

async function cleanup() {
  const failures = [];
  for (const entity of [...entities].reverse()) {
    try {
      if (!entity.id) {
        const html = await page(`/${entity.type}`);
        const row = tableRow(html, entity.markers);
        if (!row) continue;
        const match = row.match(new RegExp(`/${entity.type}/(\\d+)/edit`));
        assert.ok(match, `Không thể xác định ID để dọn ${entity.type}`);
        entity.id = Number(match[1]);
      }
      expectRedirect(await post(`/${entity.type}/${entity.id}/delete`, {}, `/${entity.type}`), `Xóa ${entity.type}`);
      const html = await page(`/${entity.type}`);
      assert.ok(!tableRow(html, entity.markers), `Bản ghi ${entity.type} vẫn còn sau khi xóa`);
    } catch (error) {
      failures.push(`${entity.type} ${entity.id || entity.markers.join('/')}: ${error.message}`);
    }
  }
  if (failures.length) throw new Error(`Dọn dữ liệu kiểm thử thất bại: ${failures.join('; ')}`);
  if (entities.length) pass('Xóa toàn bộ dữ liệu kiểm thử, giữ nguyên dữ liệu có sẵn');
}

async function main() {
  const health = await request('GET', '/health');
  assert.equal(health.status, 200, 'Healthcheck phải trả 200');
  const healthData = JSON.parse(health.body);
  assert.equal(healthData.status, 'ok');
  assert.equal(healthData.database, 'connected');
  pass('Healthcheck xác nhận kết nối MySQL');

  const dashboard = await page('/');
  assert.match(dashboard, /sinh viên/iu);
  assert.match(dashboard, /lớp/iu);
  assert.match(dashboard, /môn học/iu);
  for (const pathname of ['/classes', '/students', '/subjects', '/scores']) {
    const html = await page(pathname);
    assert.match(html, /<html\b/iu);
    assert.match(html, /(?:sinh viên|lớp|môn học|điểm)/iu);
  }
  let assets = 0;
  for (const tag of dashboard.matchAll(/<(?:link|script)\b[^>]*>/gi)) {
    const attrs = attributes(tag[0]);
    const source = attrs.src || (attrs.rel === 'stylesheet' ? attrs.href : null);
    if (!source) continue;
    const assetUrl = new URL(source, baseUrl);
    if (assetUrl.origin !== baseUrl.origin) continue;
    const asset = await request('GET', assetUrl.pathname + assetUrl.search);
    assert.equal(asset.status, 200, `Tài nguyên ${assetUrl.pathname} phải trả 200`);
    assets += 1;
  }
  assert.ok(assets > 0, 'Dashboard phải phục vụ CSS hoặc JavaScript cục bộ');
  assert.equal((await request('GET', '/students/2147483647/edit')).status, 404, 'ID sinh viên không tồn tại phải trả 404');
  assert.equal((await request('GET', '/classes/invalid/edit')).status, 404, 'ID sai định dạng phải trả 404');
  assert.equal((await request('GET', '/not-a-real-page')).status, 404, 'Trang không tồn tại phải trả 404');
  pass('Dashboard, 4 danh sách và tài nguyên giao diện hoạt động');

  const classFields = { code: `${prefix}C`, name: `Lớp kiểm thử ${suffix}`, school_year: '2026-2027' };
  assert.equal((await request('POST', '/classes', classFields)).status, 403, 'Thiếu CSRF phải trả 403');
  assert.equal((await request('POST', '/classes', { ...classFields, _csrf: '0'.repeat(64) })).status, 403, 'CSRF không khớp phải trả 403');
  assert.equal((await request('POST', '/classes', { ...classFields, _csrf: 'đ'.repeat(64) })).status, 403, 'CSRF Unicode không hợp lệ phải trả 403');
  pass('Từ chối POST thiếu CSRF, token sai và token Unicode không hợp lệ');
  const classEntity = await create('classes', classFields, [classFields.code]);
  assert.equal((await post('/classes', classFields, '/classes/new')).status, 409, 'Mã lớp trùng phải trả 409');
  classFields.name += ' cập nhật';
  await update(classEntity, classFields);
  assert.ok((await page(`/classes?q=${encodeURIComponent(classFields.code)}`)).includes(classFields.name));
  assert.ok(!tableRow(await page(`/classes?q=${classFields.code}NONE`), [classFields.code]), 'Tìm kiếm lớp phải loại bản ghi không khớp');
  for (const query of [`${prefix}%`, `${prefix}_`, "' OR 1=1 --"]) {
    assert.ok(!tableRow(await page(`/classes?q=${encodeURIComponent(query)}`), [classFields.code]), 'Tìm kiếm phải xử lý ký tự đặc biệt như văn bản');
  }
  const originalClassName = classFields.name;
  classFields.name = `Lớp ${suffix} <script>alert(1)</script>`;
  await update(classEntity, classFields);
  const escapedHtml = await page('/classes');
  assert.ok(escapedHtml.includes('&lt;script&gt;alert(1)&lt;/script&gt;'), 'Tên lớp phải được escape HTML');
  assert.ok(!escapedHtml.includes('<script>alert(1)</script>'), 'Không được chèn mã script từ dữ liệu tên lớp');
  classFields.name = originalClassName;
  await update(classEntity, classFields);
  pass('Thêm, sửa, tìm lớp và chặn mã lớp trùng');
  pass('Escape HTML, tìm kiếm ký tự đặc biệt và xử lý trang 404');

  const studentFields = {
    student_code: `${prefix}S`, full_name: `Sinh viên kiểm thử ${suffix}`, dob: '2005-01-01',
    gender: 'Nam', email: '', phone: '', address: 'Thái Nguyên', class_id: String(classEntity.id),
  };
  const student = await create('students', studentFields, [studentFields.student_code]);
  let row = tableRow(await page(`/students?class_id=${classEntity.id}&q=${encodeURIComponent(studentFields.student_code)}`), [studentFields.student_code]);
  assert.ok(row && row.includes(classFields.name), 'Sinh viên phải được gán đúng lớp');
  assert.ok(!tableRow(await page('/students?class_id=2147483647'), [studentFields.student_code]), 'Lọc lớp phải loại sinh viên ở lớp khác');
  assert.equal((await post(`/classes/${classEntity.id}/delete`, {}, '/classes')).status, 409, 'Không được xóa lớp có sinh viên');
  studentFields.full_name += ' cập nhật';
  studentFields.class_id = '';
  await update(student, studentFields);
  row = tableRow(await page('/students'), [studentFields.student_code]);
  assert.ok(row && row.includes(studentFields.full_name));
  assert.ok(!row.includes(classFields.name), 'Bỏ gán lớp phải được lưu');
  studentFields.class_id = String(classEntity.id);
  await update(student, studentFields);
  pass('CRUD sinh viên, email tùy chọn, gán/bỏ gán lớp và bảo vệ khóa ngoại');

  const subjectFields = { code: `${prefix}M1`, name: `Môn kiểm thử ${suffix}`, credits: '3' };
  const subject = await create('subjects', subjectFields, [subjectFields.code]);
  subjectFields.name += ' cập nhật';
  await update(subject, subjectFields);
  assert.ok((await page(`/subjects?q=${encodeURIComponent(subjectFields.code)}`)).includes(subjectFields.name));
  assert.ok(!tableRow(await page(`/subjects?q=${subjectFields.code}NONE`), [subjectFields.code]), 'Tìm kiếm môn học phải loại bản ghi không khớp');
  const secondSubjectFields = { code: `${prefix}M2`, name: `Môn thứ hai ${suffix}`, credits: '2' };
  const secondSubject = await create('subjects', secondSubjectFields, [secondSubjectFields.code]);
  pass('Thêm, sửa và tìm kiếm môn học');

  const scoreFields = {
    student_id: String(student.id), subject_id: String(subject.id), semester: '1', academic_year: '2026-2027',
    attendance_score: '8', midterm_score: '7', final_score: '9',
  };
  assert.equal((await post('/scores', { ...scoreFields, final_score: '10.01' }, '/scores/new')).status, 422, 'Điểm > 10 phải trả 422');
  assert.equal((await post('/scores', { ...scoreFields, subject_id: '2147483647' }, '/scores/new')).status, 409, 'Môn học không tồn tại phải trả 409');
  const score = await create('scores', scoreFields, [studentFields.student_code, subjectFields.name]);
  row = tableRow(await page(`/scores?student_id=${student.id}&subject_id=${subject.id}&semester=1&academic_year=2026-2027`), [studentFields.student_code, subjectFields.name]);
  assert.ok(row && hasNumber(row, 8.3), 'Điểm tổng kết 8/7/9 phải là 8,30');
  assert.equal((await post('/scores', scoreFields, '/scores/new')).status, 409, 'Điểm cùng sinh viên/môn/học kỳ/năm phải trả 409');
  assert.equal((await post(`/subjects/${subject.id}/delete`, {}, '/subjects')).status, 409, 'Không được xóa môn có điểm');
  assert.equal((await post(`/students/${student.id}/delete`, {}, '/students')).status, 409, 'Không được xóa sinh viên có điểm');
  await create('scores', { ...scoreFields, subject_id: String(secondSubject.id), attendance_score: '9', midterm_score: '9', final_score: '9' }, [studentFields.student_code, secondSubjectFields.name]);
  const filteredScores = await page(`/scores?student_id=${student.id}`);
  assert.ok(hasNumber(filteredScores, 8.58), 'Điểm trung bình tín chỉ (8,30×3 + 9×2)/5 phải là 8,58');
  assert.ok(!tableRow(await page(`/scores?subject_id=${secondSubject.id}`), [studentFields.student_code, subjectFields.name]), 'Lọc môn học phải loại điểm của môn khác');
  scoreFields.final_score = '10';
  await update(score, scoreFields);
  row = tableRow(await page(`/scores?q=${encodeURIComponent(studentFields.student_code)}`), [studentFields.student_code, subjectFields.name]);
  assert.ok(row && hasNumber(row, 8.9), 'Sửa điểm cuối kỳ phải cập nhật tổng kết thành 8,90');
  pass('CRUD điểm, lọc dữ liệu, tỷ trọng 10/30/60, trung bình tín chỉ và ràng buộc dữ liệu');
}

(async () => {
  let failed = false;
  try {
    await main();
  } catch (error) {
    failed = true;
    console.error(`FAIL ${error.message}`);
  } finally {
    try {
      await cleanup();
    } catch (error) {
      failed = true;
      console.error(`FAIL ${error.message}`);
    }
  }
  console.log(`Kiểm tra tích hợp: ${checks} nhóm đạt${failed ? ', có lỗi' : ', hoàn tất'}.`);
  process.exitCode = failed ? 1 : 0;
})();
