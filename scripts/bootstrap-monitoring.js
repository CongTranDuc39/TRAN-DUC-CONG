'use strict';

// This one-shot service provisions an exporter account on existing MySQL volumes.
// Secret values are read from Docker secret files and never written to logs.
const fs = require('node:fs/promises');
const mysql = require('mysql2/promise');
const { setTimeout: delay } = require('node:timers/promises');

const exporterUser = 'qlsv_exporter';
const exporterHost = '%';

async function bootstrap() {
  const rootPassword = await fs.readFile('/run/secrets/mysql_root_password', 'utf8');
  const exporterPassword = await fs.readFile('/run/secrets/mysql_exporter_password', 'utf8');
  if (!rootPassword || !/^[0-9a-f]{64}$/.test(exporterPassword)) {
    throw Object.assign(new Error('Invalid monitoring secret.'), { code: 'INVALID_SECRET' });
  }

  let connection;
  for (let attempt = 1; attempt <= 10; attempt += 1) {
    try {
      connection = await mysql.createConnection({
        host: process.env.DB_HOST || 'db',
        port: Number(process.env.DB_PORT || 3306),
        user: 'root',
        password: rootPassword,
        database: process.env.DB_NAME || 'qlsv',
        connectTimeout: 5000,
        multipleStatements: false,
      });
      break;
    } catch (error) {
      if (attempt === 10) throw error;
      await delay(1000);
    }
  }

  try {
    // mysql2 query placeholders safely escape account names and passwords.
    // CREATE/ALTER USER are DDL, so use text protocol instead of prepared DDL.
    await connection.query(
      'CREATE USER IF NOT EXISTS ?@? IDENTIFIED BY ? WITH MAX_USER_CONNECTIONS 3',
      [exporterUser, exporterHost, exporterPassword],
    );
    await connection.query(
      'ALTER USER ?@? IDENTIFIED BY ? WITH MAX_USER_CONNECTIONS 3',
      [exporterUser, exporterHost, exporterPassword],
    );
    await connection.query(
      'GRANT PROCESS, REPLICATION CLIENT, SELECT ON *.* TO ?@?',
      [exporterUser, exporterHost],
    );
    console.log('MySQL monitoring account is ready (maximum 3 connections).');
  } finally {
    await connection.end();
  }
}

bootstrap().catch((error) => {
  // mysql2 errors can include SQL containing credentials; emit only a safe code.
  const code = typeof error.code === 'string' && /^[A-Z0-9_]+$/.test(error.code)
    ? error.code : 'MONITORING_BOOTSTRAP_FAILED';
  console.error(`MySQL monitoring initialization failed (${code}).`);
  process.exitCode = 1;
});
