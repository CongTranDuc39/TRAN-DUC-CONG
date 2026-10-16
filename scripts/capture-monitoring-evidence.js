'use strict';

// Optional local browser evidence; credentials stay in memory and are never logged.
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { once } = require('node:events');
const { setTimeout: delay } = require('node:timers/promises');

const root = path.resolve(__dirname, '..');
const evidence = path.join(root, 'docs', 'evidence', 'phase3');
const browserPaths = [process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'
].filter(Boolean);

async function main() {
  const executable = browserPaths.find(candidate => fs.existsSync(candidate));
  if (!executable) throw new Error('Set CHROME_PATH to an installed Chromium browser.');
  const password = fs.readFileSync(path.join(root, '.local', 'secrets', 'grafana-admin-password.txt'), 'utf8').trim();
  fs.mkdirSync(evidence, { recursive: true });
  const browser = spawn(executable, [
    '--headless', '--disable-gpu', '--no-first-run', '--remote-debugging-port=0',
    `--user-data-dir=${path.join(root, '.local', 'browser-monitoring')}`, 'about:blank'
  ], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
  const pending = new Map();
  let socket;
  let nextId = 0;
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
      const timer = setTimeout(() => { pending.delete(id); reject(new Error(`${method} timed out.`)); }, 20000);
      pending.set(id, { resolve, reject, timer });
      socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
    const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
    const evaluate = async expression => {
      const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, sessionId);
      if (result.exceptionDetails) throw new Error('Browser page operation failed.');
      return result.result.value;
    };
    const waitFor = async (expression, description) => {
      for (let attempt = 0; attempt < 60; attempt++) {
        if (await evaluate(expression)) return;
        await delay(500);
      }
      throw new Error(`Browser did not render ${description}.`);
    };
    const screenshot = async filename => {
      await delay(1000);
      const result = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }, sessionId);
      fs.writeFileSync(path.join(evidence, filename), Buffer.from(result.data, 'base64'));
      console.log(`Saved docs/evidence/phase3/${filename}`);
    };
    await send('Emulation.setDeviceMetricsOverride', { width: 1680, height: 1180, deviceScaleFactor: 1, mobile: false }, sessionId);
    await send('Page.navigate', { url: 'http://localhost:9091/targets' }, sessionId);
    await waitFor(`document.readyState === 'complete' && document.body.innerText.includes('docker-metadata') && document.body.innerText.includes('cadvisor')`, 'Prometheus Targets');
    await screenshot('prometheus-targets.png');

    await send('Page.navigate', { url: 'http://localhost:3001/login' }, sessionId);
    await waitFor(`document.readyState === 'complete' && location.port === '3001'`, 'Grafana login');
    const loginStatus = await evaluate(`fetch('/login', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({user:'admin',password:${JSON.stringify(password)}})}).then(response => response.status)`);
    if (loginStatus !== 200) throw new Error('Grafana browser login failed.');
    await send('Page.navigate', { url: 'http://localhost:3001/d/student-management/student-management-monitoring?orgId=1&from=now-15m&to=now&timezone=browser&kiosk=tv' }, sessionId);
    await waitFor(`document.body.innerText.includes('Student Management Monitoring') && document.querySelectorAll('canvas').length >= 2`, 'Grafana dashboard');
    await delay(6000);
    await waitFor(`!document.body.innerText.includes('No data')`, 'measured container and web data');
    await screenshot('container-web.png');

    const scrolled = await evaluate(`(() => {
      const heading = [...document.querySelectorAll('h1,h2,h3,span,div')].find(element => element.children.length === 0 && element.textContent.startsWith('Database & Nginx'));
      if (!heading) return false;
      heading.scrollIntoView({block:'start'});
      return true;
    })()`);
    if (!scrolled) throw new Error('Database dashboard section was not found.');
    await waitFor(`document.body.innerText.includes('MySQL') && document.body.innerText.includes('Nginx')`, 'database panels');
    await delay(5000);
    await waitFor(`!document.body.innerText.includes('No data')`, 'measured database and Nginx data');
    await screenshot('database-nginx.png');
    await send('Browser.close');
  } finally {
    if (socket) socket.close();
    browser.kill();
    for (const item of pending.values()) clearTimeout(item.timer);
  }
}

main().catch(error => {
  console.error(`Evidence capture failed: ${error.message}`);
  process.exitCode = 1;
});
