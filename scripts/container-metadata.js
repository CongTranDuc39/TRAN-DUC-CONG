'use strict';

const http = require('node:http');
const client = require('prom-client');

const projectLabel = 'com.docker.compose.project';
const serviceLabel = 'com.docker.compose.service';
const defaultProject = 'qlsv-trancong';

function dockerError(code) {
  return Object.assign(new Error('Docker metadata is unavailable.'), { code });
}

function validateProject(project) {
  if (typeof project !== 'string' || !/^[a-z0-9][a-z0-9_-]{0,62}$/.test(project)) {
    throw dockerError('INVALID_PROJECT_NAME');
  }
}

function listContainers(project, { socketPath = '/var/run/docker.sock', timeoutMs = 3000 } = {}) {
  validateProject(project);
  const filters = encodeURIComponent(JSON.stringify({ label: [`${projectLabel}=${project}`] }));
  return new Promise((resolve, reject) => {
    // The only Docker API operation performed by this service is a scoped read.
    const request = http.get({ socketPath, path: `/containers/json?filters=${filters}` }, (response) => {
      if (response.statusCode !== 200) {
        response.resume();
        clearTimeout(timer);
        reject(dockerError('DOCKER_API_STATUS'));
        return;
      }
      const chunks = [];
      let bytes = 0;
      response.on('data', (chunk) => {
        bytes += chunk.length;
        if (bytes > 2 * 1024 * 1024) {
          request.destroy(dockerError('DOCKER_RESPONSE_TOO_LARGE'));
          return;
        }
        chunks.push(chunk);
      });
      response.on('end', () => {
        clearTimeout(timer);
        try {
          const containers = JSON.parse(Buffer.concat(chunks).toString('utf8'));
          if (!Array.isArray(containers)) throw dockerError('DOCKER_INVALID_RESPONSE');
          resolve(containers);
        } catch {
          reject(dockerError('DOCKER_INVALID_RESPONSE'));
        }
      });
      response.on('error', () => {
        clearTimeout(timer);
        reject(dockerError('DOCKER_RESPONSE_FAILED'));
      });
    });
    const timer = setTimeout(() => request.destroy(dockerError('DOCKER_TIMEOUT')), timeoutMs);
    timer.unref();
    request.on('error', () => {
      clearTimeout(timer);
      reject(dockerError('DOCKER_CONNECTION_FAILED'));
    });
  });
}

function buildMetrics(containers, project = defaultProject) {
  validateProject(project);
  if (!Array.isArray(containers)) throw dockerError('DOCKER_INVALID_RESPONSE');
  // Build a complete new snapshot instead of retaining deleted container labels.
  const registry = new client.Registry();
  const info = new client.Gauge({
    name: 'qlsv_container_info',
    help: 'Running Docker container identity from current Compose project and service labels.',
    labelNames: ['container_id', 'service', 'name', 'project'],
    registers: [registry]
  });
  const seen = new Set();
  for (const container of containers) {
    if (!container || container.State !== 'running' || container.Labels?.[projectLabel] !== project) continue;
    const containerId = container.Id;
    const service = container.Labels[serviceLabel];
    const name = Array.isArray(container.Names) && typeof container.Names[0] === 'string'
      ? container.Names[0].replace(/^\//, '') : '';
    if (typeof containerId !== 'string' || !/^[a-f0-9]{64}$/.test(containerId) || seen.has(containerId)) continue;
    if (typeof service !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,99}$/.test(service)) continue;
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/.test(name)) continue;
    seen.add(containerId);
    info.set({ container_id: containerId, service, name, project }, 1);
  }
  return registry;
}

function createMetadataServer({ project = defaultProject, fetchContainers = listContainers } = {}) {
  validateProject(project);
  return http.createServer(async (request, response) => {
    if (request.method !== 'GET' || !['/metrics', '/health'].includes(request.url)) {
      response.writeHead(404, { 'Content-Type': 'text/plain' });
      response.end('Not found.\n');
      return;
    }
    try {
      const registry = buildMetrics(await fetchContainers(project), project);
      if (request.url === '/health') {
        response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        response.end(JSON.stringify({ status: 'ok', docker: 'connected' }));
        return;
      }
      const metrics = await registry.metrics();
      response.writeHead(200, { 'Content-Type': registry.contentType, 'Cache-Control': 'no-store' });
      response.end(metrics);
    } catch {
      // Docker responses may contain credentials in unrelated labels: never log them.
      response.writeHead(503, { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' });
      response.end('DOCKER_METADATA_UNAVAILABLE\n');
    }
  });
}

if (require.main === module) {
  const port = Number(process.env.PORT || 9256);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw dockerError('INVALID_PORT');
  const server = createMetadataServer({ project: process.env.PROJECT_NAME || defaultProject });
  server.listen(port, '0.0.0.0', () => console.log(`Container metadata metrics listening on ${port}.`));
  server.on('error', () => {
    console.error('Container metadata service failed (SERVER_ERROR).');
    process.exitCode = 1;
  });
  for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => server.close());
}

module.exports = { listContainers, buildMetrics, createMetadataServer };
