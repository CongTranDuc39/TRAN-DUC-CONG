'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildMetrics, createMetadataServer } = require('../scripts/container-metadata');

const project = 'qlsv-trancong';
const container = (id, service, extra = {}) => ({
  Id: id.repeat(64),
  Names: [`/${project}-${service}-1`],
  State: 'running',
  Labels: {
    'com.docker.compose.project': project,
    'com.docker.compose.service': service,
    'unrelated.private.label': 'PRIVATE_LABEL_MUST_NOT_APPEAR'
  },
  ...extra
});

async function serve(t, server) {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
    server.closeAllConnections();
  }));
  return `http://127.0.0.1:${server.address().port}`;
}

test('Container identity contains only running valid containers from the chosen Compose project', async () => {
  const app = container('a', 'app');
  const rows = [
    app,
    app,
    container('b', 'db', { State: 'exited' }),
    container('c', 'nginx', { Labels: { 'com.docker.compose.project': 'other', 'com.docker.compose.service': 'nginx' } }),
    container('d', 'invalid service'),
    container('e', 'db', { Labels: { 'com.docker.compose.project': project } }),
    container('f', 'db', { Id: 'invalid' }),
    container('f', 'db', { Names: ['/bad name'] }),
    container('f', 'db', { Names: [] }),
    null
  ];
  const registry = buildMetrics(rows, project);
  const metrics = await registry.getMetricsAsJSON();
  assert.equal(metrics.length, 1);
  assert.equal(metrics[0].name, 'qlsv_container_info');
  assert.deepEqual(metrics[0].values, [{
    value: 1,
    labels: { container_id: 'a'.repeat(64), service: 'app', name: 'qlsv-trancong-app-1', project }
  }]);
  assert.doesNotMatch(await registry.metrics(), /PRIVATE_LABEL_MUST_NOT_APPEAR|unrelated/);
});

test('Each scrape rebuilds current identities and drops removed containers without caching stale labels', async (t) => {
  let rows = [container('a', 'app'), container('b', 'db')];
  let calls = 0;
  const base = await serve(t, createMetadataServer({ project, fetchContainers: async (requestedProject) => {
    assert.equal(requestedProject, project);
    calls += 1;
    return rows;
  } }));
  const first = await fetch(`${base}/metrics`);
  assert.equal(first.status, 200);
  assert.match(first.headers.get('content-type'), /text\/plain; version=0\.0\.4/);
  assert.match(await first.text(), /service="db"/);
  rows = [container('a', 'app')];
  const second = await (await fetch(`${base}/metrics`)).text();
  assert.match(second, /service="app"/);
  assert.doesNotMatch(second, /service="db"/);
  assert.equal(calls, 2);
  const health = await fetch(`${base}/health`);
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), { status: 'ok', docker: 'connected' });
  assert.equal((await fetch(`${base}/containers/json`)).status, 404);
});

test('Docker failure produces 503 instead of stale info and never exposes underlying API errors', async (t) => {
  const base = await serve(t, createMetadataServer({ fetchContainers: async () => {
    throw new Error('PRIVATE_DOCKER_RESPONSE');
  } }));
  for (const path of ['/metrics', '/health']) {
    const response = await fetch(`${base}${path}`);
    assert.equal(response.status, 503);
    assert.equal(await response.text(), 'DOCKER_METADATA_UNAVAILABLE\n');
  }
  assert.throws(() => buildMetrics([], 'wrong project'), { code: 'INVALID_PROJECT_NAME' });
});
