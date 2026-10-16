'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { setTimeout: delay } = require('node:timers/promises');

const root = path.resolve(__dirname, '..');
const evidence = path.join(root, 'docs', 'evidence', 'phase5');
const project = 'qlsv-trancong';
const runningServices = ['app', 'cadvisor', 'container-metadata', 'db', 'grafana', 'loki', 'mysql-exporter', 'nginx', 'nginx-exporter', 'phpmyadmin', 'prometheus', 'promtail'];
const initServices = ['app-permissions-init', 'mysql-exporter-init'];
const exceptions = {
  cadvisor: 'Privileged host observer required by Docker Desktop/containerd; internal only, rootfs/socket mounts read-only. Capabilities are not restricted by cap_drop under privileged mode.',
  db: 'Root entrypoint prepares owned writable data/socket paths, then mysqld drops to mysql; CHOWN,DAC_OVERRIDE,SETUID,SETGID are retained.',
  nginx: 'Root master binds port 80 and starts nginx workers; CHOWN,SETUID,SETGID,NET_BIND_SERVICE are retained; rootfs is read-only.',
  phpmyadmin: 'Official root Apache entrypoint writes generated configuration under /etc/phpmyadmin; writable rootfs and CHOWN,DAC_OVERRIDE,SETUID,SETGID,NET_BIND_SERVICE retained.',
  promtail: 'Root reads read-only Docker socket; the socket mount does not restrict Docker API methods.',
  'container-metadata': 'Supplementary group 0 permits read-only Docker socket access; the socket mount does not restrict Docker API methods.',
};
const checks = [];
function check(message) { checks.push(message); console.log('OK ' + message); }
function command(program, args, input) {
  return execFileSync(program, args, { cwd: root, encoding: 'utf8', input, timeout: 20000, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] }).trim();
}
function appNode(source) {
  return JSON.parse(command('docker', ['exec', '-i', project + '-app-1', 'node'], source));
}
async function json(url, authorization) {
  const response = await fetch(url, { headers: authorization ? { Authorization: authorization } : {}, signal: AbortSignal.timeout(10000) });
  assert.equal(response.status, 200, new URL(url).pathname + ': expected HTTP 200');
  return response.json();
}

async function main() {
  await fs.mkdir(evidence, { recursive: true });
  const startedAt = new Date();
  const names = command('docker', ['ps', '-a', '--filter', 'label=com.docker.compose.project=' + project, '--format', '{{.Names}}']).split(/\r?\n/).filter(Boolean);
  assert.equal(names.length, runningServices.length + initServices.length, 'Unexpected number of project containers');
  const template = '{"name":{{json .Name}},"service":{{json (index .Config.Labels "com.docker.compose.service")}},"project":{{json (index .Config.Labels "com.docker.compose.project")}},"user":{{json .Config.User}},"readOnly":{{json .HostConfig.ReadonlyRootfs}},"capDrop":{{json .HostConfig.CapDrop}},"capAdd":{{json .HostConfig.CapAdd}},"securityOpt":{{json .HostConfig.SecurityOpt}},"privileged":{{json .HostConfig.Privileged}},"ports":{{json .HostConfig.PortBindings}},"tmpfs":{{json .HostConfig.Tmpfs}},"mounts":{{json .Mounts}},"logDriver":{{json .HostConfig.LogConfig.Type}},"status":{{json .State.Status}},"exitCode":{{json .State.ExitCode}},"health":{{if .State.Health}}{{json .State.Health.Status}}{{else}}null{{end}}}';
  const containers = names.map(name => JSON.parse(command('docker', ['inspect', '--format', template, name]))).sort((a, b) => a.service.localeCompare(b.service));
  assert.deepEqual(containers.map(c => c.service).sort(), [...runningServices, ...initServices].sort());
  for (const c of containers) {
    assert.equal(c.project, project, 'Inspection must stay within this project');
    assert.ok((c.securityOpt || []).some(value => /^no-new-privileges(?::true)?$/.test(value)), c.service + ': no-new-privileges is required');
    if (c.service !== 'cadvisor') {
      assert.equal(c.privileged, false, c.service + ': unexpected privileged container');
      assert.ok((c.capDrop || []).some(value => value.toUpperCase() === 'ALL'), c.service + ': cap_drop ALL missing');
      const allowedCapabilities = {
        db: ['CHOWN', 'DAC_OVERRIDE', 'SETGID', 'SETUID'],
        nginx: ['CHOWN', 'NET_BIND_SERVICE', 'SETGID', 'SETUID'],
        phpmyadmin: ['CHOWN', 'DAC_OVERRIDE', 'NET_BIND_SERVICE', 'SETGID', 'SETUID'],
      };
      assert.deepEqual((c.capAdd || []).map(value => value.toUpperCase().replace(/^CAP_/, '')).sort(), allowedCapabilities[c.service] || [], c.service + ': unexpected added capabilities');
    }
    assert.equal(c.readOnly, c.service !== 'phpmyadmin', c.service + ': root filesystem policy mismatch');
    if (initServices.includes(c.service)) { assert.equal(c.status, 'exited'); assert.equal(c.exitCode, 0); }
    else { assert.equal(c.status, 'running', c.service + ': service stopped'); if (c.health) assert.equal(c.health, 'healthy', c.service + ': healthcheck must pass'); }
    assert.ok(['json-file', 'local'].includes(c.logDriver), c.service + ': Docker log driver must support log collection');
    for (const mount of c.mounts) {
      if (mount.Type === 'bind') assert.equal(mount.RW, false, c.service + ': bind mount must be read-only');
    }
  }
  check('All 14 project containers match runtime hardening policy; 12 running and two initialization services exited 0');
  const expectedPorts = { nginx: ['80/tcp', '8082'], phpmyadmin: ['80/tcp', '5056'], prometheus: ['9090/tcp', '9091'], grafana: ['3000/tcp', '3001'] };
  for (const c of containers) {
    if (!expectedPorts[c.service]) assert.deepEqual(Object.keys(c.ports || {}), [], c.service + ': internal port published');
    else {
      const [port, hostPort] = expectedPorts[c.service];
      assert.deepEqual(Object.keys(c.ports), [port]);
      assert.deepEqual(c.ports[port], [{ HostIp: '127.0.0.1', HostPort: hostPort }]);
    }
  }
  for (const [service, destination, volume] of [['db', '/var/lib/mysql', 'mysql_data'], ['prometheus', '/prometheus', 'prometheus_data'], ['grafana', '/var/lib/grafana', 'grafana_data'], ['loki', '/loki', 'loki_data'], ['promtail', '/run/promtail', 'promtail_positions']]) {
    assert.ok(containers.find(c => c.service === service).mounts.some(m => m.Type === 'volume' && m.Destination === destination && m.Name === project + '_' + volume && m.RW), service + ': original named data volume missing');
  }
  check('Only four loopback host ports are published; all five persistent data/positions volumes are preserved');

  const appRuntime = appNode(`
    const fs=require('node:fs');
    const status=fs.readFileSync('/proc/1/status','utf8');
    const probe='/app/src/.hardening-probe-'+process.pid;
    let rootfsError;
    try { fs.writeFileSync(probe,'probe',{flag:'wx'}); fs.unlinkSync(probe); rootfsError='WRITE_SUCCEEDED'; } catch(e) { rootfsError=e.code; }
    const temp='/tmp/qlsv-hardening-'+process.pid; fs.writeFileSync(temp,'temporary'); fs.unlinkSync(temp);
    console.log(JSON.stringify({uid:process.getuid(),pid1Uid:status.match(/^Uid:\\s+(\\d+)/m)[1],noNewPrivileges:status.match(/^NoNewPrivs:\\s+(\\d+)/m)[1],effectiveCapabilities:status.match(/^CapEff:\\s+(\\w+)/m)[1],rootfsError,tmpfsWritable:true}));
  `);
  assert.ok(appRuntime.uid > 0 && Number(appRuntime.pid1Uid) > 0, 'App and PID1 must be non-root');
  assert.equal(appRuntime.noNewPrivileges, '1');
  assert.match(appRuntime.effectiveCapabilities, /^0+$/);
  assert.equal(appRuntime.rootfsError, 'EROFS', 'App rootfs write must fail with EROFS');
  assert.ok(Object.hasOwn(containers.find(c => c.service === 'app').tmpfs, '/tmp'));
  check('Web PID1 is non-root with zero effective capabilities, NoNewPrivs=1, EROFS rootfs and writable temporary tmpfs');

  const database = appNode(`
    const crypto=require('node:crypto'); const pool=require('./src/db');
    (async()=>{try{
      const [[identity]]=await pool.query('SELECT CURRENT_USER() account, DATABASE() db');
      const [grantRows]=await pool.query('SHOW GRANTS'); const grants=grantRows.map(row=>Object.values(row)[0]);
      let systemTableRead; try { await pool.query('SELECT COUNT(*) FROM mysql.user'); systemTableRead='ALLOWED'; } catch(e) { systemTableRead=e.code; }
      let temporaryTableCreate; const con=await pool.getConnection();
      try { await con.query('CREATE TEMPORARY TABLE phase5_privilege_probe (id INT)'); temporaryTableCreate='ALLOWED'; await con.query('DROP TEMPORARY TABLE phase5_privilege_probe'); } catch(e) { temporaryTableCreate=e.code; } finally { con.release(); }
      const tables={}; for(const name of ['classes','students','subjects','scores']) { const [rows]=await pool.query('SELECT * FROM ?? ORDER BY id',[name]); tables[name]={rows:rows.length,sha256:crypto.createHash('sha256').update(JSON.stringify(rows)).digest('hex')}; }
      console.log(JSON.stringify({identity,grants,systemTableRead,temporaryTableCreate,tables}));
    }finally{await pool.end()}})().catch(e=>{console.error(e.code||'DB_CHECK_FAILED');process.exitCode=1});
  `);
  assert.equal(database.identity.account, 'qlsv_app@%');
  assert.equal(database.identity.db, 'qlsv');
  assert.equal(database.grants.length, 5, 'Only USAGE plus four table grants are allowed');
  assert.ok(database.grants.some(g => /^GRANT USAGE ON \*\.\* TO /.test(g)));
  for (const table of ['classes', 'students', 'subjects', 'scores']) {
    const grant = database.grants.find(g => g.includes('ON `qlsv`.`' + table + '` TO '));
    assert.ok(grant, table + ': table-specific grant missing');
    assert.deepEqual(grant.match(/^GRANT (.+) ON /)[1].split(', ').sort(), ['DELETE', 'INSERT', 'SELECT', 'UPDATE']);
    assert.ok(!grant.includes('GRANT OPTION'));
  }
  assert.equal(database.systemTableRead, 'ER_TABLEACCESS_DENIED_ERROR');
  assert.ok(['ER_TABLEACCESS_DENIED_ERROR', 'ER_DBACCESS_DENIED_ERROR'].includes(database.temporaryTableCreate), 'Temporary DDL must be denied by privileges');
  const baseline = JSON.parse(await fs.readFile(path.join(evidence, 'baseline-data.json'), 'utf8'));
  assert.deepEqual(database.tables, baseline.tables, 'Existing data row counts and hashes must match the pre-deployment baseline');
  check('MySQL account has CRUD on four tables only; system-table reads and temporary DDL are denied; all data hashes match baseline');

  const endpoints = [];
  for (const url of ['http://localhost:8082/', 'http://localhost:8082/health', 'http://localhost:5056/', 'http://localhost:9091/', 'http://localhost:3001/']) {
    const r = await fetch(url, { signal: AbortSignal.timeout(10000) });
    assert.equal(r.status, 200, url + ': HTTP must be 200 after redirects');
    await r.arrayBuffer(); endpoints.push({ url, status: r.status, finalUrl: r.url });
  }
  const r = await fetch('http://localhost:8082/health', { signal: AbortSignal.timeout(10000) });
  assert.equal(r.status, 200); const health = await r.json(); assert.equal(health.status, 'ok');
  const headers = Object.fromEntries(['x-content-type-options', 'x-frame-options', 'referrer-policy', 'permissions-policy'].map(name => [name, r.headers.get(name)]));
  assert.deepEqual(headers, { 'x-content-type-options': 'nosniff', 'x-frame-options': 'DENY', 'referrer-policy': 'strict-origin-when-cross-origin', 'permissions-policy': 'camera=(), microphone=(), geolocation=()' });
  check('All five public URLs return HTTP 200; /health confirms MySQL and all four security headers remain present');

  const password = (await fs.readFile(path.join(root, '.local', 'secrets', 'grafana-admin-password.txt'), 'utf8')).trim();
  const auth = 'Basic ' + Buffer.from('admin:' + password).toString('base64');
  const since = process.env.FINAL_VERIFY_STARTED_AT;
  assert.ok(since && Number.isFinite(Date.parse(since)), 'FINAL_VERIFY_STARTED_AT must mark the post-startup test window');
  // Freeze the acceptance end, then wait for a subsequent successful health log
  // from the same ordered Nginx stdout stream before accepting an empty query.
  const acceptanceEnd = new Date();
  const endNanoseconds = String(BigInt(acceptanceEnd.getTime()) * 1000000n);
  const barrierResponse = await fetch('http://localhost:8082/health', { signal: AbortSignal.timeout(10000) });
  assert.equal(barrierResponse.status, 200); await barrierResponse.arrayBuffer();
  let ingestionBarrier;
  for (let attempt = 1; attempt <= 20; attempt += 1) {
    const barrierParams = new URLSearchParams({ query: '{project="student-management", service="nginx"} |= "GET /health"', start: endNanoseconds, end: String(BigInt(Date.now()) * 1000000n), limit: '20' });
    const payload = await json('http://localhost:3001/api/datasources/proxy/uid/loki/loki/api/v1/query_range?' + barrierParams, auth);
    assert.equal(payload.status, 'success');
    ingestionBarrier = payload.data.result.flatMap(stream => stream.values.map(([timestamp, line]) => ({ timestamp, line }))).find(item => BigInt(item.timestamp) >= BigInt(endNanoseconds) && /" 200 /.test(item.line));
    if (ingestionBarrier) break;
    if (attempt < 20) await delay(2000);
  }
  assert.ok(ingestionBarrier, 'A successful health log after the acceptance cutoff must reach Loki');
  const params = new URLSearchParams({ query: '{project="student-management", service="nginx"} |~ "\\\" 5[0-9]{2} "', start: String(BigInt(Date.parse(since)) * 1000000n), end: endNanoseconds, limit: '100' });
  const errors = await json('http://localhost:3001/api/datasources/proxy/uid/loki/loki/api/v1/query_range?' + params, auth);
  assert.equal(errors.status, 'success'); assert.equal(errors.data.resultType, 'streams');
  assert.deepEqual(errors.data.result, [], 'Unexpected HTTP 5xx during the post-startup verification window');
  check('No Nginx HTTP 5xx logs occurred during the post-startup acceptance-test window');

  const tracked = command('git', ['ls-files', '-z']).split('\0').filter(Boolean);
  assert.ok(!tracked.some(name => /(^|\/)\.env($|\.(?!example$))|(^|\/)(\.local|node_modules|test-results)(\/|$)/.test(name)), 'Git tracks forbidden secret/runtime paths');
  assert.equal(command('git', ['check-ignore', '--no-index', '.env']), '.env');
  command('git', ['diff', '--check']);
  check('Git ignores .env, tracks no forbidden runtime/secret paths and passes diff --check');

  const summary = { phase: 5, passed: true, startedAt: startedAt.toISOString(), completedAt: new Date().toISOString(), acceptanceWindowStart: since, acceptanceWindowEnd: acceptanceEnd.toISOString(), checks, containerCount: containers.length, runningContainerCount: runningServices.length, initializationServiceCount: initServices.length, exceptions };
  for (const [name, payload] of Object.entries({ 'hardening-results.json': { ...summary, containers, appRuntime, database }, 'http-results.json': { endpoints, health, headers }, 'no-http-5xx.json': { windowStart: since, windowEnd: acceptanceEnd.toISOString(), checkedAt: new Date().toISOString(), ingestionBarrier, query: params.get('query'), response: errors }, 'hardening-summary.json': summary })) {
    await fs.writeFile(path.join(evidence, name), JSON.stringify(payload, null, 2) + '\n', 'utf8');
  }
  console.log('PASS hardening: ' + checks.length + ' verification groups. Evidence: docs/evidence/phase5/');
}

main().catch(error => { console.error('FAIL hardening: ' + (error.code && error.code !== 'ERR_ASSERTION' && /^[A-Z0-9_]+$/.test(error.code) ? error.code : error.message.split('\n')[0])); process.exitCode = 1; });
