'use strict';

// Run before app starts; never rotate passwords or modify application data.
const fs = require('node:fs/promises');
const mysql = require('mysql2/promise');
const { setTimeout: delay } = require('node:timers/promises');

async function bootstrap() {
  const database = process.env.DB_NAME || 'qlsv';
  const user = process.env.DB_USER || 'qlsv_app';
  if (!/^[a-zA-Z0-9_]{1,64}$/.test(database) || !/^[a-zA-Z0-9_]{1,32}$/.test(user)
      || ['mysql', 'sys', 'information_schema', 'performance_schema'].includes(database.toLowerCase())
      || ['root', 'qlsv_exporter'].includes(user.toLowerCase())) {
    throw Object.assign(new Error('Invalid application account configuration.'), { code: 'INVALID_APP_ACCOUNT' });
  }
  const password = await fs.readFile('/run/secrets/mysql_root_password', 'utf8');
  if (!password) throw Object.assign(new Error('Missing secret.'), { code: 'INVALID_SECRET' });
  let connection;
  for (let attempt = 1; attempt <= 10; attempt += 1) {
    try {
      connection = await mysql.createConnection({
        host: process.env.DB_HOST || 'db', port: Number(process.env.DB_PORT || 3306),
        user: 'root', password, database, connectTimeout: 5000, multipleStatements: false,
      });
      break;
    } catch (error) {
      if (attempt === 10) throw error;
      await delay(1000);
    }
  }
  try {
    // The existing account/password comes from MySQL initialization. Fail if absent.
    const [accounts] = await connection.query('SELECT User FROM mysql.user WHERE User = ? AND Host = ?', [user, '%']);
    if (accounts.length !== 1) throw Object.assign(new Error('Application account missing.'), { code: 'APP_ACCOUNT_MISSING' });
    // GRANT/REVOKE implicitly commit; app depends on successful completion of all four grants.
    await connection.query('REVOKE ALL PRIVILEGES, GRANT OPTION FROM ?@?', [user, '%']);
    for (const table of ['classes', 'students', 'subjects', 'scores']) {
      await connection.query('GRANT SELECT, INSERT, UPDATE, DELETE ON ??.?? TO ?@?', [database, table, user, '%']);
    }
    console.log('Application account ready: SELECT/INSERT/UPDATE/DELETE on four application tables only.');
  } finally {
    await connection.end();
  }
}

bootstrap().catch((error) => {
  const code = typeof error.code === 'string' && /^[A-Z0-9_]+$/.test(error.code) ? error.code : 'APP_PERMISSIONS_FAILED';
  console.error(`Application permissions initialization failed (${code}).`);
  process.exitCode = 1;
});
