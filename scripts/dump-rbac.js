const mysql = require('mysql2/promise');
const fs = require('fs');

async function main() {
  const conn = await mysql.createConnection({
    host: 'localhost',
    port: 3307,
    user: 'root',
    password: 'cambliss@123',
    database: 'odibrick'
  });

  const [roles] = await conn.query(`SELECT id, name, created_at FROM roles ORDER BY id`);
  const [permissions] = await conn.query(`SELECT id, code, resource, action, description FROM permissions ORDER BY id`);
  const [rolePerms] = await conn.query(`
    SELECT r.name as role_name, p.code, p.resource, p.action, p.description 
    FROM role_permissions rp 
    JOIN roles r ON rp.role_id = r.id 
    JOIN permissions p ON rp.permission_id = p.id 
    ORDER BY r.name, p.code
  `);
  const [users] = await conn.query(`
    SELECT u.id, u.email, u.full_name, u.status, u.phone, GROUP_CONCAT(r.name ORDER BY r.name) as assigned_roles
    FROM users u
    LEFT JOIN user_roles ur ON u.id = ur.user_id
    LEFT JOIN roles r ON ur.role_id = r.id
    GROUP BY u.id, u.email, u.full_name, u.status, u.phone
    ORDER BY u.id
  `);

  const roleMap = {};
  for (const r of roles) {
    roleMap[r.name] = rolePerms.filter(rp => rp.role_name === r.name).map(rp => rp.code);
  }

  const dump = {
    roles,
    permissionsCount: permissions.length,
    permissions,
    rolePermissions: roleMap,
    usersCount: users.length,
    users
  };

  fs.writeFileSync('scripts/db-rbac-dump.json', JSON.stringify(dump, null, 2));
  console.log('RBAC dump written to scripts/db-rbac-dump.json successfully!');
  console.log(`Total Roles: ${roles.length}, Total Permissions: ${permissions.length}, Total Users: ${users.length}`);

  await conn.end();
}

main().catch(console.error);
