const mysql = require('mysql2/promise');

async function inspectViews() {
  const conn = await mysql.createConnection({
    host: '127.0.0.1',
    port: 3307,
    user: 'root',
    password: 'cambliss@123',
    database: 'odibrick'
  });

  const [views] = await conn.query("SHOW FULL TABLES WHERE Table_type = 'VIEW'");
  console.log('Total Views in database:', views.length);
  for (const v of views) {
    const vName = Object.values(v)[0];
    const [create] = await conn.query(`SHOW CREATE VIEW \`${vName}\``);
    console.log(`\n=== View: ${vName} ===`);
    console.log(create[0]['Create View']);
  }
  await conn.end();
}

inspectViews().catch(console.error);
