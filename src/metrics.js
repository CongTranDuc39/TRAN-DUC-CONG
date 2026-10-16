'use strict';

const client = require('prom-client');

const methods = new Set(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'CONNECT', 'TRACE']);
const labels = ['method', 'route', 'status_code'];

function routeLabel(req, fallback) {
  // Express route templates contain :id instead of student IDs or query strings.
  // Never use originalUrl, request parameters, body fields or arbitrary paths as labels.
  const route = req.route?.path;
  if (typeof route === 'string' && route.length <= 120 && /^\/[a-zA-Z0-9_/:.*-]*$/.test(route)) return route;
  return fallback;
}

function createMetrics() {
  // Each app owns a registry; tests and multiple app instances cannot register duplicates.
  const registry = new client.Registry();
  client.collectDefaultMetrics({ register: registry, prefix: 'qlsv_' });
  const requests = new client.Counter({
    name: 'qlsv_http_requests_total',
    help: 'Completed HTTP responses by method, route template and status code.',
    labelNames: labels,
    registers: [registry]
  });
  const duration = new client.Histogram({
    name: 'qlsv_http_request_duration_seconds',
    help: 'HTTP response duration in seconds, including middleware and rendering.',
    labelNames: labels,
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
    registers: [registry]
  });
  const errors = new client.Counter({
    name: 'qlsv_http_errors_total',
    help: 'Completed HTTP responses with status 400 or higher.',
    labelNames: labels,
    registers: [registry]
  });

  function middleware(req, res, next) {
    if ((req.method === 'GET' || req.method === 'HEAD') && /^\/metrics\/?$/i.test(req.path)) return next();
    const start = process.hrtime.bigint();
    const method = methods.has(req.method) ? req.method : 'OTHER';
    const fallback = /^\/css(?:\/|$)/i.test(req.path) ? '/css/*'
      : /^\/js(?:\/|$)/i.test(req.path) ? '/js/*' : '__unmatched__';
    res.once('finish', () => {
      const dimensions = { method, route: routeLabel(req, fallback), status_code: String(res.statusCode) };
      requests.inc(dimensions);
      duration.observe(dimensions, Number(process.hrtime.bigint() - start) / 1e9);
      if (res.statusCode >= 400) errors.inc(dimensions);
    });
    return next();
  }

  async function handler(req, res, next) {
    try {
      const metrics = await registry.metrics();
      return res.set('Content-Type', registry.contentType).set('Cache-Control', 'no-store').send(metrics);
    } catch (error) {
      return next(error);
    }
  }

  return { registry, middleware, handler };
}

module.exports = { createMetrics };
