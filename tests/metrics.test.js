'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const express = require('express');
const { createMetrics } = require('../src/metrics');
const { createApp } = require('../src/app');

async function serve(t, app) {
  const server = await new Promise((resolve) => {
    const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
  });
  t.after(() => new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
    server.closeAllConnections();
  }));
  return `http://127.0.0.1:${server.address().port}`;
}

async function values(registry, name) {
  const metrics = await registry.getMetricsAsJSON();
  return metrics.find((metric) => metric.name === name).values;
}

test('HTTP metrics count completed responses, errors and durations without student IDs or search data', async (t) => {
  const metrics = createMetrics();
  const app = express();
  app.use(metrics.middleware);
  app.get('/metrics', metrics.handler);
  app.get('/students/:id', (req, res) => res.send('ok'));
  app.post('/invalid', (req, res) => res.sendStatus(422));
  app.get('/failure', (req, res) => { throw new Error('Expected failure'); });
  app.use((req, res) => res.sendStatus(404));
  app.use((error, req, res, next) => res.sendStatus(500));
  const base = await serve(t, app);

  assert.equal((await fetch(`${base}/students/123456?q=private-email%40example.test`)).status, 200);
  assert.equal((await fetch(`${base}/students/987654`)).status, 200);
  assert.equal((await fetch(`${base}/invalid`, { method: 'POST' })).status, 422);
  assert.equal((await fetch(`${base}/failure`)).status, 500);
  assert.equal((await fetch(`${base}/unknown-private-student`)).status, 404);

  const requests = await values(metrics.registry, 'qlsv_http_requests_total');
  assert.equal(requests.reduce((total, value) => total + value.value, 0), 5);
  assert.equal(requests.find((value) => value.labels.route === '/students/:id').value, 2);
  assert.equal(requests.find((value) => value.labels.status_code === '404').labels.route, '__unmatched__');
  const errors = await values(metrics.registry, 'qlsv_http_errors_total');
  assert.deepEqual(errors.map((value) => value.labels.status_code).sort(), ['404', '422', '500']);
  assert.ok(errors.every((value) => value.value === 1));
  const histogram = await values(metrics.registry, 'qlsv_http_request_duration_seconds');
  assert.equal(histogram.filter((value) => value.metricName.endsWith('_count')).reduce((total, value) => total + value.value, 0), 5);
  assert.ok(histogram.filter((value) => value.metricName.endsWith('_sum')).every((value) => value.value >= 0));

  const scrape = await fetch(`${base}/metrics`);
  assert.match(scrape.headers.get('content-type'), /text\/plain; version=0\.0\.4/);
  const text = await scrape.text();
  assert.doesNotMatch(text, /123456|987654|private-email|unknown-private-student/);
  assert.match(text, /qlsv_process_cpu_user_seconds_total/);
  assert.equal((await fetch(`${base}/metrics`, { method: 'HEAD' })).status, 200);
  assert.equal((await fetch(`${base}/METRICS/`)).status, 200);
  assert.deepEqual(await values(metrics.registry, 'qlsv_http_requests_total'), requests);
});

test('Static and unknown-method requests use bounded labels', async () => {
  const metrics = createMetrics();
  for (const request of [
    { method: 'GET', path: '/css/private-student.css' },
    { method: 'GET', path: '/js/private-student.js' },
    { method: 'PROPFIND', path: '/private-student-id' }
  ]) {
    const response = Object.assign(new EventEmitter(), { statusCode: 200 });
    let next = false;
    metrics.middleware(request, response, () => { next = true; });
    assert.equal(next, true);
    response.emit('finish');
  }
  const requests = await values(metrics.registry, 'qlsv_http_requests_total');
  assert.deepEqual(requests.map((value) => value.labels.route), ['/css/*', '/js/*', '__unmatched__']);
  assert.equal(requests[2].labels.method, 'OTHER');
  assert.doesNotMatch(await metrics.registry.metrics(), /private-student/);
});

test('App registries remain independent and instrument health plus CSRF middleware responses', async (t) => {
  const pool = { query: async () => [[{ healthy: 1 }]] };
  const first = await serve(t, createApp(pool));
  const second = await serve(t, createApp(pool));
  assert.equal((await fetch(`${first}/health`)).status, 200);
  assert.equal((await fetch(`${first}/students`, { method: 'POST' })).status, 403);
  const firstMetrics = await (await fetch(`${first}/metrics`)).text();
  assert.match(firstMetrics, /qlsv_http_requests_total\{method="GET",route="\/health",status_code="200"\} 1/);
  assert.match(firstMetrics, /qlsv_http_errors_total\{method="POST",route="__unmatched__",status_code="403"\} 1/);
  const secondMetrics = await (await fetch(`${second}/metrics`)).text();
  assert.doesNotMatch(secondMetrics, /qlsv_http_requests_total\{/);
  assert.match(secondMetrics, /qlsv_process_cpu_user_seconds_total/);
});
