'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { setTimeout: delay } = require('node:timers/promises');

const projectRoot = path.resolve(__dirname, '..');
const websiteUrl = process.env.TEST_BASE_URL || 'http://localhost:8082';
const phpMyAdminUrl = process.env.TEST_PHPMYADMIN_URL || 'http://localhost:5056';
const grafanaUrl = process.env.TEST_GRAFANA_URL || 'http://localhost:3001';
const prometheusUrl = process.env.TEST_PROMETHEUS_URL || 'http://localhost:9091';
const composeProject = process.env.TEST_COMPOSE_PROJECT || 'qlsv-trancong';
const evidenceDir = path.resolve(projectRoot, process.env.LOGGING_EVIDENCE_DIR || 'docs/evidence/phase4');
const datasourcePrefix = '/api/datasources/proxy/uid/loki';
const allowedServices = ['app', 'db', 'nginx', 'phpmyadmin'];
const expectedJobs = ['cadvisor', 'docker-metadata', 'express', 'mysql', 'nginx', 'prometheus'];
const startedAt = new Date();
const deadline = Date.now() + 140000;
const markerPath = '/__loki_probe_404';
let probeStartedAtNanoseconds;
let authorization;

function endpoint(base, resource) {
  const result = new URL(base);
  const queryIndex = resource.indexOf('?');
  result.pathname = queryIndex < 0 ? resource : resource.slice(0, queryIndex);
  result.search = queryIndex < 0 ? '' : resource.slice(queryIndex + 1);
  return result;
}

async function request(base, resource, authenticated = false) {
  const remainingMs = deadline - Date.now();
  assert.ok(remainingMs > 0, 'Logging verification exceeded its 140 second time limit');
  return fetch(endpoint(base, resource), {
    headers: authenticated ? { Authorization: authorization } : {},
    redirect: 'manual',
    signal: AbortSignal.timeout(Math.min(8000, remainingMs)),
  });
}

async function jsonRequest(base, resource, authenticated = false) {
  const response = await request(base, resource, authenticated);
  assert.equal(response.status, 200, resource + ': HTTP must be 200');
  try {
    return await response.json();
  } catch {
    throw new Error(resource + ': expected JSON response');
  }
}

function sanitizeLine(value) {
  // Never persist cookies, Authorization or password-like values if a dependency logs them.
  return value
    .replace(/\b(Bearer|Basic)\s+[A-Za-z0-9+/=_\-.]+/gi, '$1 [REDACTED]')
    .replace(/((?:password|passwd|pwd|token|secret|authorization|cookie)\s*["']?\s*[:=]\s*["']?)[^\s,"';}]+/gi, '$1[REDACTED]');
}

function sanitizeEvidence(value) {
  if (typeof value === 'string') return sanitizeLine(value);
  if (Array.isArray(value)) return value.map(sanitizeEvidence);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [
      key,
      /password|passwd|authorization|cookie|token|secret/i.test(key) ? '[REDACTED]' : sanitizeEvidence(item),
    ]));
  }
  return value;
}

function logLines(payload) {
  return payload.data.result.flatMap((item) => item.values.map(([timestamp, line]) => ({
    labels: item.stream,
    timestamp,
    line,
  })));
}

function assertStreams(payload, name, expectedService) {
  assert.equal(payload.status, 'success', name + ': Loki query must succeed');
  assert.equal(payload.data?.resultType, 'streams', name + ': expected log streams');
  assert.ok(Array.isArray(payload.data.result) && payload.data.result.length > 0, name + ': no real log streams');
  const lines = logLines(payload);
  assert.ok(lines.length > 0, name + ': expected real log entries');
  // MySQL also writes blank separators during startup; require real content
  // without rejecting those legitimate entries from the Docker log stream.
  assert.ok(lines.some((item) => typeof item.line === 'string' && item.line.trim().length > 0), name + ': expected nonempty log content');
  for (const item of lines) {
    assert.equal(item.labels.project, 'student-management', name + ': project label must match');
    assert.ok(allowedServices.includes(item.labels.service), name + ': a service outside the configured collection scope was collected');
    if (expectedService) assert.equal(item.labels.service, expectedService, name + ': wrong service label');
    assert.ok(typeof item.labels.container === 'string' && item.labels.container.startsWith(composeProject + '-'), name + ': container must belong to the configured Compose project');
    assert.equal(typeof item.line, 'string', name + ': log line must be text');
    assert.match(item.timestamp, /^\d{16,20}$/, name + ': expected a real nanosecond timestamp');
  }
  return lines;
}

async function queryLoki(definition) {
  const params = new URLSearchParams({ query: definition.query });
  if (definition.type === 'range') {
    // Include existing startup records without requiring a database restart or a failed query.
    params.set('start', String(BigInt(Date.now() - 24 * 60 * 60 * 1000) * 1000000n));
    params.set('end', String(BigInt(Date.now()) * 1000000n));
    params.set('limit', '100');
    params.set('direction', 'backward');
  }
  const api = definition.type === 'instant' ? 'query' : 'query_range';
  return jsonRequest(grafanaUrl, datasourcePrefix + '/loki/api/v1/' + api + '?' + params, true);
}

async function collectQueries(definitions) {
  const entries = await Promise.all(definitions.map(async (definition) => [definition.id, {
    ...definition,
    response: await queryLoki(definition),
  }]));
  const results = Object.fromEntries(entries);
  assertStreams(results.all.response, 'All project logs');
  const healthLines = assertStreams(results.health.response, 'Nginx /health', 'nginx');
  assert.ok(healthLines.some((item) => item.line.includes('GET /health') && /" 200 /.test(item.line)), 'Nginx health logs must show a successful real request');
  const errorLines = assertStreams(results.errors.response, 'Nginx HTTP 4xx/5xx', 'nginx');
  const markerLines = errorLines.filter((item) => item.line.includes(markerPath)
    && BigInt(item.timestamp) >= probeStartedAtNanoseconds);
  assert.ok(markerLines.length > 0, 'Error LogQL query must find the controlled 404 marker');
  assert.ok(markerLines.every((item) => /" 404 /.test(item.line)), 'The controlled test must produce HTTP 404, without a 5xx response');
  const appLines = assertStreams(results.app.response, 'Express logs', 'app');
  const appEvents = appLines.flatMap((item) => {
    try { return [JSON.parse(item.line)]; } catch { return []; }
  });
  assert.ok(appEvents.some((event) => event.service === 'app'
    && event.method === 'GET' && event.route === '/health' && event.status === 200
    && Number.isFinite(Date.parse(event.time))
    && Date.parse(event.time) >= startedAt.getTime() - 2000
    && Date.parse(event.time) <= Date.now() + 2000), 'Express must log a fresh successful /health request as structured JSON');
  assertStreams(results.db.response, 'MySQL logs', 'db');
  assertStreams(results.phpmyadmin.response, 'phpMyAdmin logs', 'phpmyadmin');
  const count = results.count.response;
  assert.equal(count.status, 'success', 'count_over_time query must succeed');
  assert.equal(count.data?.resultType, 'vector', 'count_over_time must return an instant vector');
  assert.equal(count.data.result.length, 1, 'sum(count_over_time(...)) must return one sample');
  const countValue = count.data.result[0].value;
  assert.ok(Number.isFinite(Number(countValue[1])) && Number(countValue[1]) > 0, 'count_over_time must count real log events');
  assert.ok(Math.abs(Date.now() / 1000 - Number(countValue[0])) < 90, 'count_over_time sample must be fresh');
  return results;
}

async function main() {
  const password = process.env.GRAFANA_TEST_PASSWORD || (await fs.readFile(path.join(projectRoot, '.local', 'secrets', 'grafana-admin-password.txt'), 'utf8')).trim();
  assert.ok(password, 'Grafana test password must come from the environment or ignored local secret file');
  authorization = 'Basic ' + Buffer.from((process.env.GRAFANA_TEST_USER || 'admin') + ':' + password).toString('base64');
  const definitions = JSON.parse(await fs.readFile(path.join(projectRoot, 'monitoring', 'logql', 'queries.json'), 'utf8'));
  assert.deepEqual(definitions.map((item) => item.id).sort(), ['all', 'app', 'count', 'db', 'errors', 'health', 'phpmyadmin']);
  const checks = [];
  const check = (message) => { checks.push(message); console.log('OK ' + message); };

  for (const resource of ['/', '/health', '/students', '/classes', '/subjects', '/scores']) {
    const response = await request(websiteUrl, resource);
    assert.equal(response.status, 200, resource + ': website and CRUD pages must remain healthy');
    await response.arrayBuffer();
  }
  const phpMyAdminResponse = await request(phpMyAdminUrl, '/');
  assert.equal(phpMyAdminResponse.status, 200, 'phpMyAdmin must remain accessible');
  await phpMyAdminResponse.arrayBuffer();
  check('Website, /health, all CRUD pages and phpMyAdmin return HTTP 200');

  // Exactly one safe missing resource; no body, credentials or query string are submitted.
  probeStartedAtNanoseconds = BigInt(Date.now() - 2000) * 1000000n;
  const missingResponse = await request(websiteUrl, markerPath);
  assert.equal(missingResponse.status, 404, 'Controlled missing resource must return HTTP 404');
  await missingResponse.arrayBuffer();
  check('One safe GET request produces HTTP 404; no deliberate HTTP 5xx is generated');

  const health = await jsonRequest(grafanaUrl, '/api/health');
  assert.equal(health.database, 'ok', 'Grafana database health must be ok');
  const datasource = await jsonRequest(grafanaUrl, '/api/datasources/uid/loki', true);
  assert.equal(datasource.type, 'loki');
  assert.equal(datasource.url, 'http://loki:3100');
  assert.equal(datasource.readOnly, true, 'Provisioned Loki datasource must be read-only');
  const datasourceHealth = await jsonRequest(grafanaUrl, '/api/datasources/uid/loki/health', true);
  assert.equal(datasourceHealth.status, 'OK', 'Grafana must successfully connect to Loki');
  // Loki can briefly return 503 while its ingester completes the minimum ready duration.
  let readyResponse;
  for (let attempt = 1; attempt <= 7; attempt += 1) {
    readyResponse = await request(grafanaUrl, datasourcePrefix + '/ready', true);
    if (readyResponse.status !== 503 || attempt === 7) break;
    await readyResponse.arrayBuffer();
    console.log('Loki is warming up; retrying /ready in 5 seconds.');
    await delay(5000);
  }
  assert.equal(readyResponse.status, 200, 'Loki /ready through the actual datasource proxy must return HTTP 200');
  const readyBody = (await readyResponse.text()).trim();
  assert.equal(readyBody, 'ready', 'Loki readiness response must confirm ready');
  check('Grafana health, provisioned Loki datasource and Loki /ready are healthy');

  let queries;
  for (let attempt = 1; attempt <= 10; attempt += 1) {
    try {
      queries = await collectQueries(definitions);
      break;
    } catch (error) {
      if (attempt === 10 || deadline - Date.now() <= 15000) throw error;
      console.log('Log ingestion not ready: ' + error.message + '. Waiting 10 seconds.');
      await delay(10000);
    }
  }
  check('All seven saved LogQL queries return real results through the Grafana Loki datasource');
  check('Log labels identify only student-management and the four configured Compose services');
  check('Nginx 4xx/5xx filter finds the controlled HTTP 404; Express records a fresh successful /health JSON event');
  check('Real MySQL and phpMyAdmin log streams are collected; count_over_time is positive and fresh');

  const targetsPayload = await jsonRequest(prometheusUrl, '/api/v1/targets');
  assert.equal(targetsPayload.status, 'success');
  const targets = targetsPayload.data.activeTargets.map((item) => ({
    job: item.labels.job,
    instance: item.labels.instance,
    scrapeUrl: item.scrapeUrl,
    health: item.health,
    lastScrape: item.lastScrape,
    lastError: item.lastError,
  })).sort((a, b) => a.job.localeCompare(b.job));
  assert.deepEqual(targets.map((item) => item.job), expectedJobs, 'All six phase 3 jobs must remain configured');
  for (const item of targets) {
    assert.equal(item.health, 'up', item.job + ': target must remain UP');
    assert.equal(item.lastError, '', item.job + ': scrape must be error-free');
    assert.ok(Date.now() - new Date(item.lastScrape).getTime() < 90000, item.job + ': scrape must be fresh');
  }
  const up = await jsonRequest(prometheusUrl, '/api/v1/query?query=up');
  assert.equal(up.status, 'success');
  assert.equal(up.data?.resultType, 'vector');
  assert.deepEqual(up.data.result.map((item) => item.metric.job).sort(), expectedJobs);
  for (const item of up.data.result) assert.equal(Number(item.value[1]), 1, item.metric.job + ': up must equal 1');
  check('All six Prometheus targets stay UP and up remains 1');

  const finalHealth = await request(websiteUrl, '/health');
  assert.equal(finalHealth.status, 200, 'Website /health must remain HTTP 200 after logging checks');
  await finalHealth.arrayBuffer();
  check('Website /health remains HTTP 200 after all logging checks');

  const summary = {
    phase: Number(process.env.LOGGING_EVIDENCE_PHASE || 4),
    passed: true,
    startedAt: startedAt.toISOString(),
    completedAt: new Date().toISOString(),
    checks,
    collectedServices: allowedServices,
    projectLabel: 'student-management',
    composeProject,
    controlledRequest: { method: 'GET', path: markerPath, status: 404, intentional5xx: false },
    queryCount: definitions.length,
    targetCount: targets.length,
    evidenceNote: 'Responses are collected through Grafana datasource proxy; credentials, cookies, headers and .env are excluded. Log lines are redacted defensively before writing.',
  };
  const files = {
    'grafana-health.json': { database: health.database, version: health.version, commit: health.commit },
    'loki-ready.json': { status: readyResponse.status, body: readyBody, access: 'Grafana datasource proxy; Loki has no published host port' },
    'loki-datasource-health.json': {
      datasource: { uid: datasource.uid, name: datasource.name, type: datasource.type, url: datasource.url, readOnly: datasource.readOnly },
      health: datasourceHealth,
    },
    'logql-results.json': { collectedAt: new Date().toISOString(), queries },
    'prometheus-targets.json': { collectedAt: new Date().toISOString(), targets, up },
    'summary.json': summary,
  };
  await fs.mkdir(evidenceDir, { recursive: true });
  for (const [filename, payload] of Object.entries(files)) {
    await fs.writeFile(path.join(evidenceDir, filename), JSON.stringify(sanitizeEvidence(payload), null, 2) + '\n', 'utf8');
  }
  console.log('PASS logging: ' + checks.length + ' verification groups. Evidence: ' + path.relative(projectRoot, evidenceDir).split(path.sep).join('/') + '/');
}

main().catch((error) => {
  // Only a check description is printed; authentication material is never logged.
  console.error('FAIL logging: ' + sanitizeLine(error.message));
  process.exitCode = 1;
});
