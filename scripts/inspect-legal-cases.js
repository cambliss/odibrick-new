const mysql = require('mysql2/promise');

async function main() {
  const conn = await mysql.createConnection({
    host: 'localhost',
    port: 3307,
    user: 'root',
    password: 'cambliss@123',
    database: 'odibrick'
  });

  const [cols] = await conn.query('DESCRIBE legal_cases');
  console.log('legal_cases columns:', cols.map(c => c.Field));

  const [cases] = await conn.query('SELECT * FROM legal_cases LIMIT 5');
  console.log('Sample cases:', cases);

  const [user3] = await conn.query('SELECT id, public_id, email, full_name, phone, status FROM users WHERE id = 3');
  console.log('User 3:', user3);

  await conn.end();
}

main().catch(console.error);
