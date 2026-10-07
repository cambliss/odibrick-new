const mysql = require('mysql2/promise');
const argon2 = require('argon2');
const fs = require('fs');
const path = require('path');

function loadEnv() {
  const envPath = path.join(__dirname, '..', 'apps', 'api', '.env');
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf8').split('\n');
    for (const line of lines) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (match && !process.env[match[1]]) {
        process.env[match[1]] = match[2].trim().replace(/^["']|["']$/g, '');
      }
    }
  }
}
loadEnv();

async function fixPassword() {
  const conn = await mysql.createConnection({
    host: 'localhost',
    port: 3307,
    user: 'root',
    password: 'cambliss@123',
    database: 'odibrick',
  });

  const hash = await argon2.hash('OdibrickDemo2026' + (process.env.PASSWORD_PEPPER || ''), { type: argon2.argon2id });
  await conn.execute("UPDATE users SET password_hash = ? WHERE email = 'insurance_partner@demo.odibrick.test'", [hash]);
  console.log('Updated password hash for insurance_partner@demo.odibrick.test with pepper!');
  await conn.end();
}

fixPassword().catch(console.error);
