const mysql = require('mysql2/promise');

async function test() {
  const conn = await mysql.createConnection({
    host: 'localhost',
    port: 3307,
    user: 'root',
    password: 'cambliss@123',
    database: 'odibrick'
  });

  const providerUserIds = [8, 38, 43]; // owner1, agent1, builder1

  for (const providerUserId of providerUserIds) {
    console.log(`\nTesting for User ID ${providerUserId}...`);
    const [properties] = await conn.query(
      'SELECT id, title, locality, city, rent_amount, status, created_at FROM properties WHERE (owner_id = ? OR listed_by_user_id = ?) AND deleted_at IS NULL',
      [providerUserId, providerUserId]
    );
    console.log('  Found properties:', properties.length);
    const propIds = properties.map(p => p.id);

    if (propIds.length === 0) {
      console.log('  Empty properties list (graceful empty return)');
      continue;
    }

    const placeholders = propIds.map(() => '?').join(',');

    const [pendingEnquiries] = await conn.query(
      `SELECT pe.id, pe.property_id, pe.tenant_user_id, pe.message, pe.status, pe.created_at,
              p.title AS property_title, u.full_name AS user_name, u.email AS user_email, u.phone AS user_phone
         FROM enquiries pe
         JOIN properties p ON p.id = pe.property_id
         JOIN users u ON u.id = pe.tenant_user_id
        WHERE pe.property_id IN (${placeholders}) AND pe.status IN ('NEW','PENDING')
        ORDER BY pe.created_at DESC LIMIT 10`,
      propIds
    );
    console.log('  Pending enquiries:', pendingEnquiries.length);

    const [unansweredLeads] = await conn.query(
      `SELECT l.id, l.property_id, l.name, l.email, l.phone, l.status, l.channel AS source, l.created_at,
              p.title AS property_title
         FROM campaign_leads l
         LEFT JOIN properties p ON p.id = l.property_id
        WHERE l.property_id IN (${placeholders}) AND l.status IN ('NEW','CONTACTED')
        ORDER BY l.created_at DESC LIMIT 10`,
      propIds
    );
    console.log('  Unanswered leads:', unansweredLeads.length);

    const [upcomingVisits] = await conn.query(
      `SELECT pv.id, pv.property_id, pv.customer_user_id, pv.scheduled_start, pv.status,
              p.title AS property_title, u.full_name AS visitor_name, u.phone AS visitor_phone
         FROM property_visits pv
         JOIN properties p ON p.id = pv.property_id
         JOIN users u ON u.id = pv.customer_user_id
        WHERE pv.property_id IN (${placeholders}) AND pv.status IN ('SCHEDULED','CONFIRMED')
        ORDER BY pv.scheduled_start ASC LIMIT 10`,
      propIds
    );
    console.log('  Upcoming visits:', upcomingVisits.length);

    const [pendingApplications] = await conn.query(
      `SELECT ra.id, ra.property_id, ra.tenant_user_id, ra.status, ra.offered_rent, ra.created_at,
              p.title AS property_title, u.full_name AS applicant_name, u.email AS applicant_email
         FROM applications ra
         JOIN properties p ON p.id = ra.property_id
         JOIN users u ON u.id = ra.tenant_user_id
        WHERE ra.property_id IN (${placeholders}) AND ra.status IN ('SUBMITTED','UNDER_REVIEW')
        ORDER BY ra.created_at DESC LIMIT 10`,
      propIds
    );
    console.log('  Pending applications:', pendingApplications.length);
  }

  await conn.end();
  console.log('\nAll SQL provider queries executed successfully without error!');
}

test().catch(console.error);
