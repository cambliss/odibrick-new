require('dotenv').config({ path: require('path').resolve(__dirname, '../apps/api/.env') });
const mysql = require('mysql2/promise');

async function main() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3307,
    user: process.env.DB_USER || 'odibrick',
    password: process.env.DB_PASSWORD || 'odibrick_dev',
    database: process.env.DB_NAME || 'odibrick',
  });

  const query = `
    SELECT 
      p.status,
      COUNT(DISTINCT p.id) as total_properties,
      SUM(CASE WHEN img_count.cnt = 0 OR img_count.cnt IS NULL THEN 1 ELSE 0 END) as zero_photos,
      SUM(CASE WHEN img_count.cnt BETWEEN 1 AND 3 THEN 1 ELSE 0 END) as one_to_three_photos,
      SUM(CASE WHEN img_count.cnt >= 4 THEN 1 ELSE 0 END) as four_plus_photos
    FROM properties p
    LEFT JOIN (
      SELECT property_id, COUNT(*) as cnt FROM property_images GROUP BY property_id
    ) img_count ON img_count.property_id = p.id
    WHERE p.deleted_at IS NULL
    GROUP BY p.status
    ORDER BY p.status
  `;

  const [rows] = await conn.query(query);
  console.log('\n================================================================');
  console.log('ODIBRICK PROPERTY INVENTORY RECONCILIATION BY STATUS & PHOTOS');
  console.log('================================================================');
  console.table(rows);

  const [tot] = await conn.query('SELECT COUNT(*) as total FROM properties WHERE deleted_at IS NULL');
  console.log(`Total non-deleted properties in database: ${tot[0].total}`);

  await conn.end();
}

main().catch(console.error);
