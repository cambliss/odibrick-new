const mysql = require('mysql2/promise');
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

async function run() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3307),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'cambliss@123',
    database: process.env.DB_NAME || 'odibrick',
  });

  const [roles] = await conn.query('SELECT * FROM roles ORDER BY id ASC');
  console.log('--- ALL SYSTEM ROLES ---');
  console.table(roles);

  const [rolePerms] = await conn.query(`
    SELECT r.code AS role_code, COUNT(rp.permission_id) AS perm_count
      FROM roles r
      LEFT JOIN role_permissions rp ON rp.role_id = r.id
     GROUP BY r.id
     ORDER BY r.id ASC
  `);
  console.log('--- PERMISSION COUNTS PER ROLE ---');
  console.table(rolePerms);

  const [users] = await conn.query(`
    SELECT u.id, u.email, u.full_name, u.status, r.code AS role
      FROM users u
      LEFT JOIN user_roles ur ON ur.user_id = u.id
      LEFT JOIN roles r ON r.id = ur.role_id
     ORDER BY u.id ASC
  `);
  console.log('--- ALL SEEDED USERS ---');
  console.table(users);
  console.log(`Total users: ${users.length}`);

  const insuranceUser = users.find(u => u.role === 'INSURANCE_PARTNER');
  if (!insuranceUser) {
    console.log('No INSURANCE_PARTNER user found, let us create one for exhaustive testing.');
    const [insRole] = await conn.query("SELECT id FROM roles WHERE code = 'INSURANCE_PARTNER'");
    if (insRole.length > 0) {
      const argon2 = require('argon2');
      const hash = await argon2.hash('OdibrickDemo2026', { type: argon2.argon2id });
      const [res] = await conn.execute(
        "INSERT INTO users (public_id, email, phone, password_hash, full_name, status, email_verified_at, is_demo) VALUES ('INSURANCE0000000000000001', 'insurance_partner@demo.odibrick.test', '9999988888', ?, 'Bajaj Allianz Desk', 'ACTIVE', NOW(), 1)",
        [hash]
      );
      await conn.execute("INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)", [res.insertId, insRole[0].id]);
      console.log('Created insurance_partner@demo.odibrick.test with ID:', res.insertId);
    }
  }

  await conn.end();
}

run().catch(console.error);
