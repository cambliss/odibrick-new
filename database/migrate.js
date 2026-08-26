#!/usr/bin/env node
/**
 * Odibrick migration runner.
 *
 * Applies every .sql file in database/migrations in filename order, records
 * each one in schema_migrations, and skips anything already applied. Safe to
 * re-run; it is the only supported way to change the schema.
 *
 *   node database/migrate.js            apply pending migrations
 *   node database/migrate.js --status   show what is applied and what is pending
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const mysql = require('mysql2/promise');

loadEnv();

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

async function main() {
  const statusOnly = process.argv.includes('--status');
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'odibrick',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'odibrick',
    multipleStatements: true,
  });

  await conn.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename   VARCHAR(190) NOT NULL,
      checksum   CHAR(64)     NOT NULL,
      applied_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (filename)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  const [applied] = await conn.query('SELECT filename, checksum FROM schema_migrations');
  const appliedMap = new Map(applied.map((r) => [r.filename, r.checksum]));

  const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();

  if (statusOnly) {
    for (const file of files) {
      console.log(`${appliedMap.has(file) ? '  applied' : '  PENDING'}  ${file}`);
    }
    await conn.end();
    return;
  }

  let count = 0;
  for (const file of files) {
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    const checksum = crypto.createHash('sha256').update(sql).digest('hex');

    if (appliedMap.has(file)) {
      if (appliedMap.get(file) !== checksum) {
        console.warn(
          `!  ${file} has changed since it was applied. Add a new migration instead of editing this one.`,
        );
      }
      continue;
    }

    process.stdout.write(`   applying ${file} ... `);
    try {
      await conn.query(sql);
      await conn.query('INSERT INTO schema_migrations (filename, checksum) VALUES (?, ?)', [file, checksum]);
      console.log('done');
      count += 1;
    } catch (error) {
      console.log('failed');
      console.error(`\n${file}: ${error.message}\n`);
      await conn.end();
      process.exit(1);
    }
  }

  console.log(count ? `\n${count} migration(s) applied.` : '\nSchema is already up to date.');
  await conn.end();
}

/** Minimal .env reader so the scripts run without extra dependencies. */
function loadEnv() {
  const candidates = [
    path.join(__dirname, '..', 'apps', 'api', '.env'),
    path.join(__dirname, '..', '.env'),
  ];
  for (const file of candidates) {
    if (!fs.existsSync(file)) continue;
    for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (match && !process.env[match[1]]) {
        process.env[match[1]] = match[2].replace(/^["']|["']$/g, '');
      }
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
