'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const targets = ['app.js', 'src', 'scripts', 'tests', 'public'];
const files = [];

function collect(relativePath) {
  const absolutePath = path.join(root, relativePath);
  if (!fs.existsSync(absolutePath)) return;
  const stat = fs.statSync(absolutePath);
  if (stat.isDirectory()) {
    for (const entry of fs.readdirSync(absolutePath, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.isSymbolicLink()) continue;
      collect(path.join(relativePath, entry.name));
    }
  } else if (relativePath.endsWith('.js')) {
    files.push(relativePath);
  }
}

targets.forEach(collect);
let failed = false;
for (const file of files.sort()) {
  const result = spawnSync(process.execPath, ['--check', path.join(root, file)], {
    encoding: 'utf8',
    cwd: root,
    env: process.env,
  });
  if (result.status !== 0 || result.error) {
    failed = true;
    console.error(`FAIL ${file}`);
    console.error(result.error ? result.error.message : result.stderr.trim());
  }
}
if (!files.length) {
  console.error('Không tìm thấy tệp JavaScript để kiểm tra.');
  process.exitCode = 1;
} else if (failed) {
  process.exitCode = 1;
} else {
  console.log(`Cú pháp hợp lệ: ${files.length} tệp JavaScript.`);
}
