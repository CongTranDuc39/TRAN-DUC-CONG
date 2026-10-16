'use strict';

// Read-only browser evidence for the final report. No credentials are required.
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { once } = require('node:events');
const { setTimeout: delay } = require('node:timers/promises');

const root = path.resolve(__dirname, '..');
const evidence = path.resolve(root, process.env.FINAL_EVIDENCE_DIR || 'docs/evidence/phase5/website');
const website = process.env.TEST_BASE_URL || 'http://localhost:8082';
const browserPaths = [process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
].filter(Boolean);

async function main() {
  const executable = browserPaths.find(candidate => fs.existsSync(candidate));
  assert.ok(executable, 'Set CHROME_PATH to an installed Chromium browser.');
  fs.mkdirSync(evidence, { recursive: true });
  const browser = spawn(executable, [
    '--headless', '--disable-gpu', '--no-first-run', '--remote-debugging-port=0',
    `--user-data-dir=${path.join(root, '.local', 'browser-final')}`, 'about:blank',
  ], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
  const pending = new Map();
  let socket;
  let nextId = 0;
  const captures = [];
  try {
    const endpoint = await new Promise((resolve, reject) => {
      let output = '';
      const timer = setTimeout(() => reject(new Error('Browser startup timed out.')), 15000);
      browser.stderr.on('data', chunk => {
        output += chunk;
        const match = output.match(/DevTools listening on (ws:\/\/[^\s]+)/);
        if (match) { clearTimeout(timer); resolve(match[1]); }
      });
      browser.on('error', () => { clearTimeout(timer); reject(new Error('Browser could not start.')); });
    });
    socket = new WebSocket(endpoint);
    await once(socket, 'open');
    socket.addEventListener('message', event => {
      const data = JSON.parse(event.data);
      const item = pending.get(data.id);
      if (!item) return;
      clearTimeout(item.timer);
      pending.delete(data.id);
      if (data.error) item.reject(new Error('Browser protocol operation failed.'));
      else item.resolve(data.result);
    });
    const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
      const id = ++nextId;
      const timer = setTimeout(() => { pending.delete(id); reject(new Error(`${method} timed out.`)); }, 30000);
      pending.set(id, { resolve, reject, timer });
      socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
    const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
    const evaluate = async expression => {
      const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, sessionId);
      assert.ok(!result.exceptionDetails, 'Browser page operation failed.');
      return result.result.value;
    };
    const waitFor = async (expression, description) => {
      for (let attempt = 0; attempt < 80; attempt++) {
        if (await evaluate(expression)) return;
        await delay(500);
      }
      throw new Error(`Browser did not render ${description}.`);
    };
    const screenshot = async (filename, url, fullPage = true) => {
      await delay(1000);
      const options = { format: 'png', captureBeyondViewport: fullPage };
      if (fullPage) {
        const metrics = await send('Page.getLayoutMetrics', {}, sessionId);
        const size = metrics.cssContentSize || metrics.contentSize;
        options.clip = { x: 0, y: 0, width: Math.ceil(size.width), height: Math.ceil(size.height), scale: 1 };
      }
      const result = await send('Page.captureScreenshot', options, sessionId);
      fs.writeFileSync(path.join(evidence, filename), Buffer.from(result.data, 'base64'));
      captures.push({ filename, url, capturedAt: new Date().toISOString() });
      console.log(`Saved ${path.relative(root, path.join(evidence, filename)).split(path.sep).join('/')}`);
    };

    await send('Emulation.setDeviceMetricsOverride', { width: 1680, height: 1180, deviceScaleFactor: 1, mobile: false }, sessionId);
    for (const [resource, heading, filename] of [
      ['/', 'Tổng quan hệ thống', 'website-dashboard.png'],
      ['/students', 'Quản lý sinh viên', 'website-students.png'],
      ['/classes', 'Quản lý lớp học', 'website-classes.png'],
      ['/subjects', 'Quản lý môn học', 'website-subjects.png'],
      ['/scores', 'Quản lý điểm số', 'website-scores.png'],
    ]) {
      const url = new URL(resource, website).href;
      const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(8000) });
      assert.equal(response.status, 200, resource + ': page must return HTTP 200 before capture');
      await response.arrayBuffer();
      await send('Page.navigate', { url }, sessionId);
      await waitFor(`document.readyState === 'complete' && location.href === ${JSON.stringify(url)} && document.querySelector('h1')?.innerText === ${JSON.stringify(heading)}`, heading);
      if (resource === '/') {
        const counts = await evaluate(`[...document.querySelectorAll('.stat-number')].map(element => Number(element.innerText))`);
        assert.equal(counts.length, 4, 'The dashboard must render all four live counters.');
        assert.ok(counts.every(value => Number.isInteger(value) && value > 0), 'The dashboard must show positive real data counts.');
      } else {
        await waitFor(`document.querySelectorAll('tbody tr').length > 0`, 'real table rows');
      }
      await screenshot(filename, url);
    }
    const healthUrl = new URL('/health', website).href;
    const healthResponse = await fetch(healthUrl, { signal: AbortSignal.timeout(8000) });
    assert.equal(healthResponse.status, 200, 'Health must return HTTP 200.');
    const health = await healthResponse.json();
    assert.equal(health.status, 'ok', 'Health payload must confirm status ok.');
    await send('Page.navigate', { url: healthUrl }, sessionId);
    await waitFor(`document.readyState === 'complete' && location.href === ${JSON.stringify(healthUrl)} && document.body.innerText.includes('ok')`, 'health JSON');
    await screenshot('website-health.png', healthUrl, false);

    if (process.env.CAPTURE_GITHUB_HISTORY === '1') {
      const historyUrl = 'https://github.com/CongTranDuc39/TRAN-DUC-CONG/commits/master/';
      await send('Page.navigate', { url: historyUrl }, sessionId);
      await waitFor(`document.readyState === 'complete' && location.hostname === 'github.com' && document.body.innerText.includes('TRAN-DUC-CONG') && document.body.innerText.includes('centralized logging')`, 'GitHub master commit history');
      await screenshot('github-commit-history.png', historyUrl);
    }
    fs.writeFileSync(path.join(evidence, 'capture-summary.json'), JSON.stringify({
      passed: true,
      completedAt: new Date().toISOString(),
      note: 'Screenshots were captured from running pages after HTTP and content checks. No image editing or mock data was used.',
      captures,
    }, null, 2) + '\n');
    await send('Browser.close');
  } finally {
    if (socket) socket.close();
    browser.kill();
    for (const item of pending.values()) clearTimeout(item.timer);
  }
}

main().catch(error => {
  console.error(`Final evidence capture failed: ${error.message}`);
  process.exitCode = 1;
});
