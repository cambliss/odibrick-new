const mysql = require('mysql2/promise');

async function main() {
  const conn = await mysql.createConnection({
    host: 'localhost',
    port: 3307,
    user: 'root',
    password: 'cambliss@123',
    database: 'odibrick'
  });

  console.log('=== USER ID 3 IN DATABASE ===');
  const [user3] = await conn.query('SELECT id, public_id, email, full_name, phone, status FROM users WHERE id = 3');
  console.table(user3);

  console.log('=== ALL STAFF USERS IN DATABASE ===');
  const [staff] = await conn.query(`
    SELECT u.id, u.email, u.full_name, u.status, GROUP_CONCAT(r.name) as roles
    FROM users u
    JOIN user_roles ur ON u.id = ur.user_id
    JOIN roles r ON ur.role_id = r.id
    WHERE r.id IN (1, 2, 3, 4, 5, 6, 7, 8)
    GROUP BY u.id, u.email, u.full_name, u.status
  `);
  console.table(staff);

  console.log('=== LEGAL CASES SCHEMA ===');
  const [cols] = await conn.query('DESCRIBE legal_cases');
  console.table(cols);

  console.log('=== LEGAL CASES (SAMPLE) ===');
  const [cases] = await conn.query(`
    SELECT lc.*, u.email as assignee_email, u.full_name as assignee_name
    FROM legal_cases lc
    LEFT JOIN users u ON lc.assigned_to_user_id = u.id
    ORDER BY lc.id ASC
    LIMIT 5
  `);
  console.table(cases);

  await conn.end();
}

main().catch(console.error);
