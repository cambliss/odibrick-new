const mysql = require('mysql2/promise');

async function main() {
  const conn = await mysql.createConnection({
    host: 'localhost',
    port: 3307,
    user: 'root',
    password: 'cambliss@123',
    database: 'odibrick'
  });

  const [props] = await conn.query('SELECT COUNT(*) as total FROM properties WHERE deleted_at IS NULL');
  console.log('Total Properties in DB:', props[0].total);

  const [counts] = await conn.query(`
    SELECT 
      p.status,
      COUNT(p.id) as property_count,
      SUM(CASE WHEN img_count = 0 THEN 1 ELSE 0 END) as zero_photos,
      SUM(CASE WHEN img_count BETWEEN 1 AND 3 THEN 1 ELSE 0 END) as one_to_three_photos,
      SUM(CASE WHEN img_count >= 4 THEN 1 ELSE 0 END) as four_plus_photos
    FROM (
      SELECT p.id, p.status, COUNT(pi.id) as img_count
      FROM properties p
      LEFT JOIN property_images pi ON p.id = pi.property_id
      WHERE p.deleted_at IS NULL
      GROUP BY p.id, p.status
    ) p
    GROUP BY p.status
  `);
  console.table(counts);

  const [sampleImages] = await conn.query(`
    SELECT pi.id, pi.property_id, pi.storage_key, pi.caption, pi.room_tag, pi.is_cover, pi.sort_order
    FROM property_images pi
    LIMIT 10
  `);
  console.log('Sample property_images rows:');
  console.table(sampleImages);

  await conn.end();
}

main().catch(console.error);
