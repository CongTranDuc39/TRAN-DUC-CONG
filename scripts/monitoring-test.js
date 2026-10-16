'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { setTimeout: delay } = require('node:timers/promises');

const projectRoot = path.resolve(__dirname, '..');
const prometheusUrl = process.env.TEST_PROMETHEUS_URL || 'http://localhost:9091';
const grafanaUrl = process.env.TEST_GRAFANA_URL || 'http://localhost:3001';
const websiteUrl = process.env.TEST_BASE_URL || 'http://localhost:8082';
const expectedJobs = ['cadvisor', 'docker-metadata', 'express', 'mysql', 'nginx', 'prometheus'];
const requiredServices = ['app', 'cadvisor', 'container-metadata', 'db', 'grafana', 'mysql-exporter', 'nginx', 'nginx-exporter', 'phpmyadmin', 'prometheus'];
const evidenceDir = path.resolve(projectRoot, process.env.MONITORING_EVIDENCE_DIR || 'docs/evidence/phase3');
const requestTimeoutMs = 8000;
const maxAttempts = 3;
const deadline = Date.now() + 110000;
let authorization;

function endpoint(base, resource) {
  // Assign pathname separately: //metrics must remain a path on localhost.
  const url = new URL(base);
  const queryIndex = resource.indexOf('?');
  url.pathname = queryIndex < 0 ? resource : resource.slice(0, queryIndex);
  url.search = queryIndex < 0 ? '' : resource.slice(queryIndex + 1);
  return url;
}

async function request(base, resource, authenticated = false) {
  const remainingMs = deadline - Date.now();
  assert.ok(remainingMs > 0, 'Monitoring verification exceeded its 110 second time limit');
  return fetch(endpoint(base, resource), {
    headers: authenticated ? { Authorization: authorization } : {},
    redirect: 'manual',
    signal: AbortSignal.timeout(Math.min(requestTimeoutMs, remainingMs)),
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

function assertVector(payload, name, { positive = false } = {}) {
  assert.equal(payload.status, 'success', name + ': Prometheus query must succeed');
  assert.equal(payload.data?.resultType, 'vector', name + ': expected instant vector');
  const values = payload.data.result;
  assert.ok(Array.isArray(values) && values.length > 0, name + ': no real metric samples');
  for (const item of values) {
    assert.ok(Array.isArray(item.value), name + ': missing sample');
    assert.ok(Number.isFinite(Number(item.value[1])), name + ': sample must be finite');
    assert.ok(Math.abs(Date.now() / 1000 - Number(item.value[0])) < 90, name + ': sample timestamp is stale');
    if (positive) assert.ok(Number(item.value[1]) > 0, name + ': expected positive measurement');
  }
  return values;
}

async function runChecks(dashboardDefinition) {
  const checks = [];
  const check = (message) => {
    checks.push(message);
    console.log('OK ' + message);
  };

  for (const resource of ['/metrics', '/metrics/', '/METRICS', '/metrics//', '//metrics', '/m%65trics', '/metrics?probe=monitoring', '/stub_status', '/stub_status/']) {
    const response = await request(websiteUrl, resource);
    assert.equal(response.status, 404, resource + ': internal monitoring must not be exposed by Nginx');
    await response.arrayBuffer();
  }
  check('Nginx blocks internal metrics/status endpoints, including slash and case variants');
  for (const resource of ['/', '/health', '/students', '/classes', '/subjects', '/scores']) {
    const response = await request(websiteUrl, resource);
    assert.equal(response.status, 200, resource + ': website and CRUD pages must remain available');
    await response.arrayBuffer();
  }
  check('Website, /health and all four CRUD list pages return HTTP 200 through Nginx');

  const targetsPayload = await jsonRequest(prometheusUrl, '/api/v1/targets');
  assert.equal(targetsPayload.status, 'success');
  const targets = targetsPayload.data.activeTargets.map((item) => ({
    job: item.labels.job,
    instance: item.labels.instance,
    scrapeUrl: item.scrapeUrl,
    health: item.health,
    lastScrape: item.lastScrape,
    lastScrapeDuration: item.lastScrapeDuration,
    lastError: item.lastError,
  })).sort((a, b) => a.job.localeCompare(b.job));
  assert.deepEqual(targets.map((item) => item.job), expectedJobs, 'Prometheus must have exactly the six configured jobs');
  for (const item of targets) {
    assert.equal(item.health, 'up', item.job + ': scrape target must be UP');
    assert.equal(item.lastError, '', item.job + ': scrape must have no error');
    assert.ok(Date.now() - new Date(item.lastScrape).getTime() < 90000, item.job + ': scrape is stale');
  }
  check('All six Prometheus targets are UP with fresh scrapes');

  const upPayload = await jsonRequest(prometheusUrl, '/api/v1/query?query=up');
  const upValues = assertVector(upPayload, 'up');
  assert.deepEqual(upValues.map((item) => item.metric.job).sort(), expectedJobs);
  for (const item of upValues) assert.equal(Number(item.value[1]), 1, item.metric.job + ': up must be 1');
  check('Prometheus query up returns 1 for every target');

  const health = await jsonRequest(grafanaUrl, '/api/health');
  assert.equal(health.database, 'ok', 'Grafana database health must be ok');
  check('Grafana /api/health database is ok');

  const datasource = await jsonRequest(grafanaUrl, '/api/datasources/uid/prometheus', true);
  assert.equal(datasource.name, 'Prometheus');
  assert.equal(datasource.type, 'prometheus');
  assert.equal(datasource.url, 'http://prometheus:9090');
  assert.equal(datasource.isDefault, true);
  assert.equal(datasource.readOnly, true);
  const datasourceHealth = await jsonRequest(grafanaUrl, '/api/datasources/uid/prometheus/health', true);
  assert.equal(datasourceHealth.status, 'OK', 'Provisioned Prometheus datasource must be healthy');
  check('Grafana provisioned default Prometheus datasource is read-only and healthy');

  const dashboardPayload = await jsonRequest(grafanaUrl, '/api/dashboards/uid/student-management', true);
  const dashboard = dashboardPayload.dashboard;
  assert.equal(dashboard.title, 'Student Management Monitoring');
  assert.equal(dashboard.uid, 'student-management');
  assert.equal(dashboardPayload.meta.provisioned, true);
  const panels = dashboard.panels.filter((panel) => panel.type !== 'row');
  assert.ok(panels.length >= 16, 'Dashboard must have at least 16 real metric panels');
  const sourcePanels = dashboardDefinition.panels.filter((panel) => panel.type !== 'row');
  assert.deepEqual(panels.map((panel) => panel.id), sourcePanels.map((panel) => panel.id), 'Provisioned dashboard must match repository panel IDs');
  const definitions = panels.flatMap((panel) => panel.targets.map((target) => ({
    panelId: panel.id, title: panel.title, refId: target.refId, expr: target.expr,
  })));
  const expectedDefinitions = sourcePanels.flatMap((panel) => panel.targets.map((target) => ({
    panelId: panel.id, title: panel.title, refId: target.refId, expr: target.expr,
  })));
  assert.deepEqual(definitions, expectedDefinitions, 'Grafana dashboard queries must match provisioned source');
  check('Student Management Monitoring dashboard is provisioned with ' + panels.length + ' panels');

  // Query through Grafana's actual datasource proxy, exercising its configured connection.
  const queryResults = await Promise.all(definitions.map(async (definition) => {
    const payload = await jsonRequest(grafanaUrl, '/api/datasources/proxy/uid/prometheus/api/v1/query?query=' + encodeURIComponent(definition.expr), true);
    const results = assertVector(payload, definition.title + ' / ' + definition.refId);
    return { ...definition, resultType: payload.data.resultType, results };
  }));
  const metadataPayload = await jsonRequest(grafanaUrl, '/api/datasources/proxy/uid/prometheus/api/v1/query?query=' + encodeURIComponent('qlsv_container_info{job="docker-metadata",project="qlsv-trancong"}'), true);
  const containerMetadata = assertVector(metadataPayload, 'Docker project container metadata');
  const currentServices = [...new Set(containerMetadata.map((item) => item.metric.service))].sort();
  assert.ok(currentServices.length >= requiredServices.length, 'Read-only Docker metadata must cover at least the ten original Compose services');
  for (const service of requiredServices) {
    assert.ok(currentServices.includes(service), 'Docker metadata must include required service ' + service);
  }
  const containerIds = new Set();
  for (const item of containerMetadata) {
    assert.equal(Number(item.value[1]), 1, 'Metadata info sample must equal 1');
    assert.match(item.metric.container_id, /^[a-f0-9]{64}$/, 'Metadata must expose a real Docker container ID');
    assert.equal(item.metric.project, 'qlsv-trancong', 'Metadata must remain scoped to this Compose project');
    assert.match(item.metric.service, /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/, 'Metadata must expose a valid Compose service');
    assert.ok(!containerIds.has(item.metric.container_id), 'Metadata must not repeat a Docker container ID');
    containerIds.add(item.metric.container_id);
  }
  const panelResults = (panelId, refId = 'A') => {
    const result = queryResults.find((item) => item.panelId === panelId && item.refId === refId);
    assert.ok(result, 'Required dashboard panel ' + panelId + ' is missing');
    return result.results;
  };

  const cpu = panelResults(101);
  const ram = panelResults(102);
  assert.deepEqual(cpu.map((item) => item.metric.service).sort(), currentServices, 'CPU must cover every current Compose service exactly once');
  assert.deepEqual(ram.map((item) => item.metric.service).sort(), currentServices, 'RAM must cover every current Compose service exactly once');
  assert.ok(cpu.some((item) => Number(item.value[1]) > 0), 'CPU must show actual nonzero activity');
  for (const item of cpu) assert.ok(Number(item.value[1]) >= 0, 'CPU cannot be negative');
  for (const item of ram) assert.ok(Number(item.value[1]) > 0, 'Container RAM must be positive');
  assert.ok(Number(panelResults(103)[0].value[1]) > 0, 'Web request counter must be positive');
  assert.ok(Number(panelResults(104)[0].value[1]) > 0, 'Error counter must include real test errors');
  const statusValues = panelResults(108);
  for (const code of ['200', '403', '404', '409', '422']) {
    assert.ok(statusValues.some((item) => item.metric.status_code === code && Number(item.value[1]) > 0), 'Expected actual HTTP ' + code + ' traffic from integration checks');
  }
  assert.equal(Number(panelResults(201)[0].value[1]), 1, 'mysql_up must confirm a live database connection');
  assert.ok(Number(panelResults(202)[0].value[1]) > 0, 'MySQL connection count must be positive');
  assert.ok(Number(panelResults(203)[0].value[1]) >= Number(panelResults(202)[0].value[1]), 'MySQL connection count cannot exceed max_connections');
  assert.equal(Number(panelResults(204)[0].value[1]), 1, 'nginx_up must confirm a working stub_status endpoint');
  const scrapeSamples = panelResults(208);
  assert.equal(scrapeSamples.length, expectedJobs.length);
  for (const item of scrapeSamples) assert.equal(Number(item.value[1]), 1);
  check('All ' + queryResults.length + ' dashboard queries return fresh finite measurements through Grafana');
  check('CPU/RAM cover all ' + currentServices.length + ' current services using actual cAdvisor samples joined with Docker metadata; HTTP status/error, MySQL and Nginx panels contain real data');

  return {
    checks,
    containerServiceCount: currentServices.length,
    files: {
      'prometheus-targets.json': { collectedAt: new Date().toISOString(), targets },
      'prometheus-up.json': upPayload,
      'grafana-health.json': { database: health.database, version: health.version, commit: health.commit },
      'grafana-datasource-health.json': { datasource: { uid: datasource.uid, name: datasource.name, type: datasource.type, url: datasource.url, isDefault: datasource.isDefault, readOnly: datasource.readOnly }, health: datasourceHealth },
      'dashboard-query-results.json': { title: dashboard.title, uid: dashboard.uid, provisioned: dashboardPayload.meta.provisioned, panelCount: panels.length, queries: queryResults, containerMetadata },
    },
  };
}

async function main() {
  const password = process.env.GRAFANA_TEST_PASSWORD || (await fs.readFile(path.join(projectRoot, '.local', 'secrets', 'grafana-admin-password.txt'), 'utf8')).trim();
  assert.ok(password, 'Grafana test password must be supplied through the environment or ignored local secret file');
  authorization = 'Basic ' + Buffer.from((process.env.GRAFANA_TEST_USER || 'admin') + ':' + password).toString('base64');
  const dashboardDefinition = JSON.parse(await fs.readFile(path.join(projectRoot, 'monitoring', 'grafana', 'dashboards', 'student-management.json'), 'utf8'));
  let result;
  const startedAt = new Date();
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    console.log('Monitoring verification attempt ' + attempt + '/' + maxAttempts);
    try {
      result = await runChecks(dashboardDefinition);
      break;
    } catch (error) {
      if (attempt === maxAttempts) throw error;
      assert.ok(deadline - Date.now() > 15000, 'Monitoring verification exceeded its retry time budget');
      console.log('Not ready: ' + error.message + '. Retrying in 15 seconds for the next scrape.');
      await delay(15000);
    }
  }

  const summary = {
    phase: 3,
    passed: true,
    startedAt: startedAt.toISOString(),
    completedAt: new Date().toISOString(),
    checks: result.checks,
    targetCount: expectedJobs.length,
    containerServiceCount: result.containerServiceCount,
    dashboardTitle: 'Student Management Monitoring',
    dashboardPanelCount: dashboardDefinition.panels.filter((panel) => panel.type !== 'row').length,
    dashboardQueryCount: result.files['dashboard-query-results.json'].queries.length,
    evidenceNote: 'Only measured metrics and sanitized health metadata are saved. No credentials, request headers, cookies or .env content are included.',
  };
  await fs.mkdir(evidenceDir, { recursive: true });
  for (const [filename, payload] of Object.entries({ ...result.files, 'summary.json': summary })) {
    await fs.writeFile(path.join(evidenceDir, filename), JSON.stringify(payload, null, 2) + '\n', 'utf8');
  }
  console.log('PASS monitoring: ' + result.checks.length + ' verification groups. Evidence: ' + path.relative(projectRoot, evidenceDir).split(path.sep).join('/') + '/');
}

main().catch((error) => {
  // Error messages identify a failed check; authentication material is never logged.
  console.error('FAIL monitoring: ' + error.message);
  process.exitCode = 1;
});
