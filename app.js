'use strict';

const pool = require('./src/db');
const { createApp } = require('./src/app');
const app = createApp(pool);
const port = Number(process.env.PORT || 3000);
const server = app.listen(port, '0.0.0.0', () => console.log(`QLSV đang chạy tại cổng ${port}.`));

let stopping = false;
async function shutdown() {
  if (stopping) return;
  stopping = true;
  const timer = setTimeout(() => process.exit(1), 10000);
  timer.unref();
  server.close(async () => {
    try { await pool.end(); process.exitCode = 0; }
    catch { process.exitCode = 1; }
    finally { clearTimeout(timer); }
  });
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
