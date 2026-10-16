'use strict';

const methods = new Set(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'CONNECT', 'TRACE']);

function createRequestLogger({ writeLine = (line) => process.stdout.write(`${line}\n`) } = {}) {
  return function requestLogger(req, res, next) {
    // Prometheus scrapes every 15 seconds; keep request logs focused on the web app.
    if ((req.method === 'GET' || req.method === 'HEAD') && /^\/metrics\/?$/i.test(req.path)) return next();
    const start = process.hrtime.bigint();
    const method = methods.has(req.method) ? req.method : 'OTHER';
    const fallback = /^\/css(?:\/|$)/i.test(req.path) ? '/css/*'
      : /^\/js(?:\/|$)/i.test(req.path) ? '/js/*' : '__unmatched__';

    res.once('finish', () => {
      // Use only route templates, never URLs, IDs, search queries, bodies or headers.
      const template = req.route?.path;
      const route = typeof template === 'string' && template.length <= 120 && /^\/[a-zA-Z0-9_/:.*-]*$/.test(template)
        ? template : fallback;
      const entry = {
        time: new Date().toISOString(),
        service: 'app',
        method,
        route,
        status: res.statusCode,
        duration_ms: Math.round(Number(process.hrtime.bigint() - start) / 1e3) / 1e3
      };
      // A failing log sink must not change a completed HTTP response.
      try { writeLine(JSON.stringify(entry)); } catch { /* Docker stdout may be unavailable during shutdown. */ }
    });
    return next();
  };
}

module.exports = { createRequestLogger };
