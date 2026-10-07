const mysql = require('mysql2/promise');

async function main() {
  const conn = await mysql.createConnection({
    host: 'localhost',
    port: 3307,
    user: 'root',
    password: 'cambliss@123',
    database: 'odibrick'
  });

  console.log('Restoring User ID 3 full_name to Adv. Shalini Menon...');
  await conn.execute(
    `UPDATE users SET full_name = 'Adv. Shalini Menon' WHERE id = 3 AND email = 'legal_team@demo.odibrick.test'`
  );

  const [res] = await conn.query(
    `SELECT id, email, full_name, status FROM users WHERE id = 3`
  );
  console.table(res);

  console.log('\nChecking legal cases assigned to Adv. Shalini Menon...');
  const [cases] = await conn.query(`
    SELECT lc.id, lc.case_number, lc.case_type, lc.status, lc.assigned_to, u.email as assignee_email, u.full_name as assignee_name
    FROM legal_cases lc
    LEFT JOIN users u ON lc.assigned_to = u.id
    WHERE lc.case_number IN ('ODB-LGL-2026-000001', 'ODB-LGL-2026-000002', 'ODB-LGL-2026-000043') OR lc.assigned_to = 3
    LIMIT 10
  `);
  console.table(cases);

  await conn.end();
}

main().catch(console.error);
