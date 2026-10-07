const mysql = require('mysql2/promise');

async function main() {
  const conn = await mysql.createConnection({
    host: 'localhost',
    port: 3307,
    user: 'root',
    password: 'cambliss@123',
    database: 'odibrick'
  });

  console.log('=== PERMISSIONS SCHEMA ===');
  const [cols] = await conn.query(`DESCRIBE permissions`);
  console.table(cols);

  const [roles] = await conn.query(`
    SELECT r.id, r.name, COUNT(rp.permission_id) as perms 
    FROM roles r 
    LEFT JOIN role_permissions rp ON r.id = rp.role_id 
    GROUP BY r.id, r.name
    ORDER BY r.id
  `);
  console.table(roles);

  const [demoUsers] = await conn.query(`
    SELECT u.id, u.email, u.full_name, u.status, u.phone, GROUP_CONCAT(r.name ORDER BY r.name) as assigned_roles
    FROM users u
    LEFT JOIN user_roles ur ON u.id = ur.user_id
    LEFT JOIN roles r ON ur.role_id = r.id
    WHERE u.email IN (
      'superadmin@demo.odibrick.test',
      'legal_team@demo.odibrick.test',
      'kyc_team@demo.odibrick.test',
      'owner1@demo.odibrick.test',
      'tenant1@demo.odibrick.test',
      'agent1@demo.odibrick.test',
      'builder1@demo.odibrick.test'
    )
    GROUP BY u.id, u.email, u.full_name, u.status, u.phone
  `);
  console.table(demoUsers);

  console.log('=== ALL PERMISSIONS ===');
  const [allPerms] = await conn.query(`SELECT * FROM permissions LIMIT 20`);
  console.table(allPerms);

  await conn.end();
}

main().catch(console.error);
