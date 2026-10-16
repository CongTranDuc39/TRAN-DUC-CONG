'use strict';

const mysql = require('mysql2/promise');

for (const name of ['DB_HOST', 'DB_NAME', 'DB_USER', 'DB_PASSWORD']) {
  if (!process.env[name]) throw new Error(`Thiếu biến môi trường ${name}. Hãy xem .env.example và README.md.`);
}

module.exports = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  charset: 'utf8mb4',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 50,
  connectTimeout: 5000,
  enableKeepAlive: true,
  dateStrings: true,
  decimalNumbers: true,
  multipleStatements: false
});
