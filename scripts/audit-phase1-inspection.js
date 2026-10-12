const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../apps/api/.env') });

async function fullLocalAudit() {
  console.log('=== STARTING LOCAL DATABASE AUDIT ===');
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3307),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || 'odibrick',
  });

  const [serverInfo] = await conn.query('SELECT VERSION() as version, DATABASE() as db, @@character_set_database as charset, @@collation_database as collation, @@sql_mode as sql_mode');

  const [tables] = await conn.query("SHOW FULL TABLES WHERE Table_type = 'BASE TABLE'");
  const tableKey = Object.keys(tables[0])[0];
  const tableNames = tables.map(t => t[tableKey]);

  console.log(`Found ${tableNames.length} tables in local MySQL.`);

  const tableInventory = {};
  let totalRows = 0;

  for (const t of tableNames) {
    const [[countRes]] = await conn.query(`SELECT COUNT(*) as count FROM \`${t}\``);
    const [cols] = await conn.query(`SHOW FULL COLUMNS FROM \`${t}\``);
    const [indexes] = await conn.query(`SHOW INDEX FROM \`${t}\``);
    const [fkRes] = await conn.query(`
      SELECT CONSTRAINT_NAME, COLUMN_NAME, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME
      FROM information_schema.KEY_COLUMN_USAGE
      WHERE TABLE_SCHEMA = 'odibrick' AND TABLE_NAME = ? AND REFERENCED_TABLE_NAME IS NOT NULL
    `, [t]);

    tableInventory[t] = {
      rowCount: countRes.count,
      columnsCount: cols.length,
      columns: cols.map(c => ({
        field: c.Field,
        type: c.Type,
        collation: c.Collation,
        null: c.Null,
        key: c.Key,
        default: c.Default,
        extra: c.Extra,
        comment: c.Comment,
      })),
      indexes: indexes.map(i => ({
        name: i.Key_name,
        column: i.Column_name,
        nonUnique: i.Non_unique,
        seq: i.Seq_in_index,
      })),
      foreignKeys: fkRes,
    };
    totalRows += countRes.count;
  }

  // Users by role
  const [usersByRole] = await conn.query(`
    SELECT r.code as role, COUNT(u.id) as user_count,
           SUM(CASE WHEN u.status = 'ACTIVE' THEN 1 ELSE 0 END) as active_count
    FROM roles r
    LEFT JOIN user_roles ur ON ur.role_id = r.id
    LEFT JOIN users u ON u.id = ur.user_id
    GROUP BY r.code
    ORDER BY user_count DESC
  `);

  // Canonical demo accounts
  const [demoUsers] = await conn.query(`
    SELECT u.id, u.public_id, u.email, u.full_name, u.status, u.is_demo,
           CASE WHEN u.email_verified_at IS NOT NULL THEN 1 ELSE 0 END as email_verified,
           CASE WHEN u.phone_verified_at IS NOT NULL THEN 1 ELSE 0 END as phone_verified,
           GROUP_CONCAT(r.code) as roles,
           u.created_at
    FROM users u
    LEFT JOIN user_roles ur ON ur.user_id = u.id
    LEFT JOIN roles r ON r.id = ur.role_id
    WHERE u.email LIKE '%demo%' OR u.email LIKE '%odibrick%' OR u.email LIKE '%test%' OR u.is_demo = 1
    GROUP BY u.id
    ORDER BY u.id ASC
  `);

  // All users
  const [allUsers] = await conn.query(`
    SELECT u.id, u.public_id, u.email, u.full_name, u.status,
           GROUP_CONCAT(r.code) as roles
    FROM users u
    LEFT JOIN user_roles ur ON ur.user_id = u.id
    LEFT JOIN roles r ON r.id = ur.role_id
    GROUP BY u.id
    ORDER BY u.id ASC
  `);

  // Properties breakdown
  const [propSummary] = await conn.query(`
    SELECT status, property_type, listing_type, COUNT(*) as count
    FROM properties
    WHERE deleted_at IS NULL
    GROUP BY status, property_type, listing_type
  `);

  const [propTotals] = await conn.query(`
    SELECT status, COUNT(*) as count
    FROM properties
    GROUP BY status
  `);

  // Specific domain counts
  const domainCounts = {};
  const domainTables = [
    'users', 'roles', 'user_roles', 'permissions', 'role_permissions', 'user_profiles',
    'properties', 'property_images', 'property_amenities', 'property_verifications', 'property_visits',
    'applications', 'agreements', 'agreement_clauses', 'agreement_signatories', 'tenancies', 'tenants', 'owners', 'agents', 'builders',
    'payments', 'payment_transactions', 'payment_accounts', 'invoices', 'invoice_lines', 'owner_payouts', 'owner_payout_items', 'financial_reconciliation_runs',
    'maintenance_requests', 'maintenance_updates', 'disputes', 'dispute_evidence',
    'legal_cases', 'legal_meetings', 'legal_notes',
    'documents', 'kyc_records', 'inspections', 'insurance_policies',
    'saved_properties', 'saved_searches', 'user_property_preferences', 'property_interactions',
    'enquiries', 'campaigns', 'campaign_leads',
    'operational_tasks', 'operational_task_events', 'workflow_rules', 'workflow_executions',
    'risk_cases', 'risk_signals', 'security_events',
    'external_integrations', 'webhook_events', 'integration_events',
    'conversations', 'messages', 'notifications', 'notification_templates', 'audit_logs',
    'schema_migrations'
  ];

  for (const dt of domainTables) {
    if (tableInventory[dt]) {
      domainCounts[dt] = tableInventory[dt].rowCount;
    }
  }

  // Check for orphan records in key relational tables
  const orphanChecks = {};
  const orphanQueries = [
    { name: 'property_images_without_property', query: 'SELECT COUNT(*) as count FROM property_images pi LEFT JOIN properties p ON p.id = pi.property_id WHERE p.id IS NULL' },
    { name: 'user_roles_without_user', query: 'SELECT COUNT(*) as count FROM user_roles ur LEFT JOIN users u ON u.id = ur.user_id WHERE u.id IS NULL' },
    { name: 'user_roles_without_role', query: 'SELECT COUNT(*) as count FROM user_roles ur LEFT JOIN roles r ON r.id = ur.role_id WHERE r.id IS NULL' },
    { name: 'properties_without_lister', query: 'SELECT COUNT(*) as count FROM properties p LEFT JOIN users u ON u.id = p.listed_by_user_id WHERE p.listed_by_user_id IS NOT NULL AND u.id IS NULL' },
    { name: 'applications_without_property', query: 'SELECT COUNT(*) as count FROM applications a LEFT JOIN properties p ON p.id = a.property_id WHERE p.id IS NULL' },
    { name: 'applications_without_tenant', query: 'SELECT COUNT(*) as count FROM applications a LEFT JOIN users u ON u.id = a.tenant_user_id WHERE u.id IS NULL' },
    { name: 'agreements_without_tenancy', query: 'SELECT COUNT(*) as count FROM agreements ag LEFT JOIN tenancies t ON t.id = ag.tenancy_id WHERE t.id IS NULL' },
    { name: 'tenancies_without_property', query: 'SELECT COUNT(*) as count FROM tenancies t LEFT JOIN properties p ON p.id = t.property_id WHERE p.id IS NULL' },
    { name: 'tenancies_without_tenant', query: 'SELECT COUNT(*) as count FROM tenancies t LEFT JOIN users u ON u.id = t.tenant_user_id WHERE u.id IS NULL' },
    { name: 'tenancies_without_owner', query: 'SELECT COUNT(*) as count FROM tenancies t LEFT JOIN users u ON u.id = t.owner_user_id WHERE u.id IS NULL' },
    { name: 'payments_without_tenancy', query: 'SELECT COUNT(*) as count FROM payments p LEFT JOIN tenancies t ON t.id = p.tenancy_id WHERE p.tenancy_id IS NOT NULL AND t.id IS NULL' },
    { name: 'maintenance_without_property', query: 'SELECT COUNT(*) as count FROM maintenance_requests mr LEFT JOIN properties p ON p.id = mr.property_id WHERE p.id IS NULL' },
    { name: 'disputes_without_tenancy', query: 'SELECT COUNT(*) as count FROM disputes d LEFT JOIN tenancies t ON t.id = d.tenancy_id WHERE d.tenancy_id IS NOT NULL AND t.id IS NULL' },
    { name: 'documents_without_owner', query: 'SELECT COUNT(*) as count FROM documents doc LEFT JOIN users u ON u.id = doc.owner_user_id WHERE u.id IS NULL' },
    { name: 'legal_cases_without_tenancy', query: 'SELECT COUNT(*) as count FROM legal_cases lc LEFT JOIN tenancies t ON t.id = lc.tenancy_id WHERE t.id IS NULL' },
  ];

  for (const oq of orphanQueries) {
    try {
      const [[res]] = await conn.query(oq.query);
      orphanChecks[oq.name] = res.count;
    } catch (e) {
      orphanChecks[oq.name] = `Error: ${e.message}`;
    }
  }

  // Media inspection
  const [images] = await conn.query('SELECT id, property_id, storage_key, caption, is_cover, sort_order FROM property_images');
  const [documents] = await conn.query('SELECT id, owner_user_id, category, storage_key, title, size_bytes, mime_type FROM documents');

  // Check physical storage files
  const localStorageRoot = path.resolve(__dirname, '../storage');
  function scanDir(dir, base = '') {
    let files = [];
    if (!fs.existsSync(dir)) return files;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      const full = path.join(dir, e.name);
      const rel = base ? `${base}/${e.name}` : e.name;
      if (e.isDirectory()) {
        files = files.concat(scanDir(full, rel));
      } else {
        const stats = fs.statSync(full);
        files.push({ path: rel, size: stats.size });
      }
    }
    return files;
  }
  const physicalFiles = scanDir(localStorageRoot);

  const auditOutput = {
    sourceDatabase: {
      serverInfo: serverInfo[0],
      totalTables: tableNames.length,
      totalRows,
      tableInventory,
      usersByRole,
      canonicalDemoUsers: demoUsers,
      allUsersCount: allUsers.length,
      allUsersList: allUsers,
      propertySummary: propSummary,
      propertyTotals: propTotals,
      domainCounts,
      orphanChecks,
      mediaInventory: {
        databasePropertyImagesCount: images.length,
        databaseDocumentsCount: documents.length,
        physicalFilesCount: physicalFiles.length,
        physicalFilesSample: physicalFiles.slice(0, 20),
        databaseImagesSample: images.slice(0, 10),
      },
    },
  };

  fs.writeFileSync(
    path.resolve(__dirname, '../ODIBRICK_DATABASE_INVENTORY.json'),
    JSON.stringify(auditOutput, null, 2),
    'utf8'
  );

  console.log('Successfully wrote ODIBRICK_DATABASE_INVENTORY.json');
  console.log(`Total Tables: ${tableNames.length}, Total Rows: ${totalRows}`);
  console.log('Domain Counts:', domainCounts);
  console.log('Orphan Checks:', orphanChecks);
  console.log(`Property Images: ${images.length}, Documents: ${documents.length}, Physical Files: ${physicalFiles.length}`);

  await conn.end();
  return auditOutput;
}

fullLocalAudit().catch(console.error);
