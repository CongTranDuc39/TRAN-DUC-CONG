'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const express = require('express');
const { createRequestLogger } = require('../src/request-logging');

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

test('Request logs contain completed HTTP status and duration without student data or credentials', async (t) => {
  const lines = [];
  const app = express();
  app.use(createRequestLogger({ writeLine: (line) => lines.push(line) }));
  app.use(express.urlencoded({ extended: false }));
  app.get('/health', (req, res) => res.json({ status: 'ok' }));
  app.get('/students/:id', (req, res) => res.send('ok'));
  app.post('/students', (req, res) => res.sendStatus(422));
  app.get('/failure', (req, res) => { throw new Error('Expected test error'); });
  app.use((req, res) => res.sendStatus(404));
  app.use((error, req, res, next) => res.sendStatus(500));
  const base = await serve(t, app);

  assert.equal((await fetch(`${base}/health`)).status, 200);
  assert.equal((await fetch(`${base}/students/123456?q=private-email%40example.test`, {
    headers: { cookie: 'secret-cookie=private-value', authorization: 'Bearer secret-token' }
  })).status, 200);
  assert.equal((await fetch(`${base}/students`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: 'full_name=Nguy%E1%BB%85n+Ri%C3%AAng+T%C6%B0&password=secret-password'
  })).status, 422);
  assert.equal((await fetch(`${base}/private-student-987654`)).status, 404);
  assert.equal((await fetch(`${base}/failure`)).status, 500);

  const entries = lines.map((line) => JSON.parse(line));
  assert.deepEqual(entries.map(({ route, status }) => ({ route, status })), [
    { route: '/health', status: 200 },
    { route: '/students/:id', status: 200 },
    { route: '/students', status: 422 },
    { route: '__unmatched__', status: 404 },
    { route: '/failure', status: 500 }
  ]);
  for (const entry of entries) {
    assert.deepEqual(Object.keys(entry), ['time', 'service', 'method', 'route', 'status', 'duration_ms']);
    assert.equal(entry.service, 'app');
    assert.equal(new Date(entry.time).toISOString(), entry.time);
    assert.ok(Number.isFinite(entry.duration_ms) && entry.duration_ms >= 0);
  }
  assert.equal(entries[2].method, 'POST');
  assert.doesNotMatch(lines.join('\n'), /123456|987654|private-email|secret-|Nguyễn|Riêng|Expected test error/);
});

test('Static and unknown requests have bounded routes; metrics scrapes do not generate logs', () => {
  const entries = [];
  const middleware = createRequestLogger({ writeLine: (line) => entries.push(JSON.parse(line)) });
  for (const request of [
    { method: 'GET', path: '/css/private-student.css' },
    { method: 'GET', path: '/js/private-student.js' },
    { method: 'PROPFIND', path: '/private-student' },
    { method: 'GET', path: '/metrics' },
    { method: 'HEAD', path: '/METRICS/' }
  ]) {
    const response = Object.assign(new EventEmitter(), { statusCode: 200 });
    let called = false;
    middleware(request, response, () => { called = true; });
    assert.equal(called, true);
    response.emit('finish');
    response.emit('finish');
  }
  assert.deepEqual(entries.map((entry) => entry.route), ['/css/*', '/js/*', '__unmatched__']);
  assert.equal(entries[2].method, 'OTHER');
  assert.doesNotMatch(JSON.stringify(entries), /private-student/);
});

test('Unavailable log sink does not throw after the response finishes', () => {
  const middleware = createRequestLogger({ writeLine: () => { throw new Error('Sink closed'); } });
  const response = Object.assign(new EventEmitter(), { statusCode: 200 });
  middleware({ method: 'GET', path: '/health', route: { path: '/health' } }, response, () => {});
  assert.doesNotThrow(() => response.emit('finish'));
});
