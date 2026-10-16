'use strict';

// Optional local browser evidence. Credentials remain in memory and are never logged.
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { once } = require('node:events');
const { setTimeout: delay } = require('node:timers/promises');

const root = path.resolve(__dirname, '..');
const evidence = path.resolve(root, process.env.LOGGING_EVIDENCE_DIR || 'docs/evidence/phase4');
const grafana = 'http://localhost:3001';
const browserPaths = [process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'
].filter(Boolean);

async function main() {
  const executable = browserPaths.find(candidate => fs.existsSync(candidate));
  if (!executable) throw new Error('Set CHROME_PATH to an installed Chromium browser.');
  const queries = JSON.parse(fs.readFileSync(path.join(root, 'monitoring', 'logql', 'queries.json'), 'utf8'));
  const password = fs.readFileSync(path.join(root, '.local', 'secrets', 'grafana-admin-password.txt'), 'utf8').trim();
  fs.mkdirSync(evidence, { recursive: true });
  const browser = spawn(executable, [
    '--headless', '--disable-gpu', '--no-first-run', '--remote-debugging-port=0',
    `--user-data-dir=${path.join(root, '.local', 'browser-logging')}`, 'about:blank'
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
      const timer = setTimeout(() => { pending.delete(id); reject(new Error(`${method} timed out.`)); }, 30000);
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
    const waitFor = async (expression, description, attempts = 120) => {
      for (let attempt = 0; attempt < attempts; attempt++) {
        if (await evaluate(expression)) return;
        await delay(500);
      }
      throw new Error(`Browser did not render ${description}.`);
    };
    const screenshot = async (filename, fullPage = false) => {
      await delay(1200);
      const options = { format: 'png', captureBeyondViewport: fullPage };
      if (fullPage) {
        const metrics = await send('Page.getLayoutMetrics', {}, sessionId);
        const size = metrics.cssContentSize || metrics.contentSize;
        options.clip = { x: 0, y: 0, width: Math.ceil(size.width), height: Math.ceil(size.height), scale: 1 };
      }
      const result = await send('Page.captureScreenshot', options, sessionId);
      fs.writeFileSync(path.join(evidence, filename), Buffer.from(result.data, 'base64'));
      console.log(`Saved ${path.relative(root, path.join(evidence, filename)).split(path.sep).join('/')}`);
    };
    await send('Emulation.setDeviceMetricsOverride', { width: 1680, height: 1180, deviceScaleFactor: 1, mobile: false }, sessionId);
    await send('Page.navigate', { url: `${grafana}/login` }, sessionId);
    await waitFor(`document.readyState === 'complete' && location.port === '3001'`, 'Grafana login');
    const loginStatus = await evaluate(`fetch('/login', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({user:'admin',password:${JSON.stringify(password)}})}).then(response => response.status)`);
    if (loginStatus !== 200) throw new Error('Grafana browser login failed.');

    await send('Page.navigate', { url: `${grafana}/connections/datasources/edit/loki` }, sessionId);
    await waitFor(`document.body.innerText.includes('Loki') && [...document.querySelectorAll('input')].some(input => input.value === 'http://loki:3100')`, 'provisioned Loki internal URL');
    const tested = await evaluate(`(() => {
      const button = [...document.querySelectorAll('button')].find(element => /^(Save & test|Save & Test|Test)$/.test(element.innerText.trim()));
      if (!button || button.disabled) return false;
      button.click();
      return true;
    })()`);
    if (!tested) throw new Error('Loki connection test button was unavailable.');
    await waitFor(`/successfully (connected|queried)|data source is working|connection successful/i.test(document.body.innerText)`, 'successful Loki connection test');
    await evaluate('window.scrollTo(0, 0)');
    await screenshot('loki-datasource.png', true);

    const noEmptyResults = `!/No data|Empty results|No logs found|No matching logs/i.test(document.body.innerText)`;
    for (const id of ['all', 'health', 'errors', 'count']) {
      const query = queries.find(item => item.id === id);
      if (!query) throw new Error(`Missing canonical LogQL query: ${id}.`);
      const panes = { main: {
        datasource: 'loki',
        queries: [{ refId: 'A', datasource: { type: 'loki', uid: 'loki' }, editorMode: 'code', expr: query.query, queryType: query.type }],
        range: { from: id === 'count' ? 'now-15m' : 'now-24h', to: 'now' }
      } };
      const url = `${grafana}/explore?schemaVersion=1&panes=${encodeURIComponent(JSON.stringify(panes))}&orgId=1`;
      await send('Page.navigate', { url }, sessionId);
      await waitFor(`document.body.innerText.includes('Explore') && document.body.innerText.includes('Loki')`, `Explore ${id} query`);
      if (id === 'all') {
        await waitFor(`${noEmptyResults} && /GET \\/health[^\\n]*200/.test(document.body.innerText)`, 'all logs with a successful health request');
      } else if (id === 'health') {
        await waitFor(`${noEmptyResults} && /GET \\/health[^\\n]*200/.test(document.body.innerText)`, 'HTTP 200 health logs');
      } else if (id === 'errors') {
        await waitFor(`${noEmptyResults} && /HTTP\\/[0-9.]+[" ]+404\\b/.test(document.body.innerText)`, 'intentional HTTP 404 logs');
      } else {
        await waitFor(`${noEmptyResults} && (document.querySelector('canvas') || document.querySelector('[role="table"]') || document.querySelector('table'))`, 'count result visualization');
        // Confirm the same canonical instant query returns an actual positive value.
        const positive = await evaluate(`(async () => {
          const response = await fetch('/api/ds/query', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({
            from:String(Date.now()-15*60*1000), to:String(Date.now()),
            queries:[{refId:'A',datasource:{type:'loki',uid:'loki'},expr:${JSON.stringify(query.query)},queryType:'instant',maxDataPoints:1000,intervalMs:15000}]
          }) });
          if (!response.ok) return false;
          const data = await response.json();
          return (data.results?.A?.frames || []).some(frame => frame.schema.fields.some((field,index) => field.type === 'number' && (frame.data.values[index] || []).some(value => Number(value) > 0)));
        })()`);
        if (!positive) throw new Error('Loki log count is not positive.');
      }
      await screenshot(`explore-${id}.png`);
    }
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
