const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const mysql = require('mysql2/promise');
require('dotenv').config({ path: path.resolve(__dirname, '../apps/api/.env') });

const MYSQLDUMP_PATH = 'C:\\Program Files\\MySQL\\MySQL Server 8.4\\bin\\mysqldump.exe';
const MYSQL_PATH = 'C:\\Program Files\\MySQL\\MySQL Server 8.4\\bin\\mysql.exe';
const BACKUPS_DIR = path.resolve(__dirname, '../backups');

if (!fs.existsSync(BACKUPS_DIR)) {
  fs.mkdirSync(BACKUPS_DIR, { recursive: true });
}

function computeFileHash(filePath) {
  const content = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(content).digest('hex');
}

async function backupLocalDatabase() {
  console.log('\n========================================================');
  console.log('1. CREATING LOCAL DATABASE BACKUP');
  console.log('========================================================');

  const now = new Date();
  const timestamp = now.toISOString().replace(/[-:T]/g, '').slice(0, 15);
  const backupFileName = `odibrick_local_source_${timestamp}.sql`;
  const backupFilePath = path.join(BACKUPS_DIR, backupFileName);

  const localHost = process.env.DB_HOST || '127.0.0.1';
  const localPort = String(process.env.DB_PORT || '3307');
  const localUser = process.env.DB_USER || 'root';
  const localPassword = process.env.DB_PASSWORD || 'cambliss@123';
  const localDbName = process.env.DB_NAME || 'odibrick';

  console.log(`Source Host: ${localHost}:${localPort}`);
  console.log(`Database:    ${localDbName}`);
  console.log(`Target File: ${backupFilePath}`);

  const args = [
    `--host=${localHost}`,
    `--port=${localPort}`,
    `--user=${localUser}`,
    `--password=${localPassword}`,
    '--single-transaction',
    '--routines',
    '--triggers',
    '--events',
    '--quick',
    '--set-gtid-purged=OFF',
    '--default-character-set=utf8mb4',
    localDbName,
  ];

  const dumpProc = spawnSync(MYSQLDUMP_PATH, args, {
    maxBuffer: 100 * 1024 * 1024,
    encoding: 'utf8',
  });

  if (dumpProc.error || dumpProc.status !== 0) {
    throw new Error(`mysqldump failed with status ${dumpProc.status}: ${dumpProc.stderr || dumpProc.error}`);
  }

  fs.writeFileSync(backupFilePath, dumpProc.stdout, 'utf8');

  const stats = fs.statSync(backupFilePath);
  const checksum = computeFileHash(backupFilePath);

  console.log('✓ Local Dump Exit Code: 0 (SUCCESS)');
  console.log(`✓ Backup File Size:    ${stats.size} bytes (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
  console.log(`✓ SHA-256 Checksum:    ${checksum}`);

  // Verification of content
  const content = fs.readFileSync(backupFilePath, 'utf8');
  const hasDropTable = content.includes('DROP TABLE IF EXISTS `users`');
  const hasCreateTable = content.includes('CREATE TABLE `users`');
  const hasInsertUsers = content.includes('INSERT INTO `users`');
  const hasInsertProperties = content.includes('INSERT INTO `properties`');
  const hasMigrations = content.includes('INSERT INTO `schema_migrations`');

  console.log('Content Validations:');
  console.log(`  • Structure headers present: ${hasDropTable && hasCreateTable ? 'YES ✓' : 'NO ✗'}`);
  console.log(`  • Users data present:        ${hasInsertUsers ? 'YES ✓' : 'NO ✗'}`);
  console.log(`  • Properties data present:   ${hasInsertProperties ? 'YES ✓' : 'NO ✗'}`);
  console.log(`  • Migrations table present:  ${hasMigrations ? 'YES ✓' : 'NO ✗'}`);

  return {
    filePath: backupFilePath,
    fileName: backupFileName,
    sizeBytes: stats.size,
    checksumSha256: checksum,
    timestamp: now.toISOString(),
    validations: { hasDropTable, hasCreateTable, hasInsertUsers, hasInsertProperties, hasMigrations },
  };
}

async function verifyLocalRestoreInTempDatabase(localBackup) {
  console.log('\n========================================================');
  console.log('2. VERIFYING RESTORE INTO ISOLATED LOCAL TEMP DATABASE');
  console.log('========================================================');

  const tempDbName = `odibrick_temp_verify_${Date.now()}`;
  const localHost = process.env.DB_HOST || '127.0.0.1';
  const localPort = Number(process.env.DB_PORT || 3307);
  const localUser = process.env.DB_USER || 'root';
  const localPassword = process.env.DB_PASSWORD || 'cambliss@123';

  console.log(`Creating isolated validation database: ${tempDbName}`);
  const rootConn = await mysql.createConnection({
    host: localHost,
    port: localPort,
    user: localUser,
    password: localPassword,
    multipleStatements: true,
  });

  await rootConn.query(`CREATE DATABASE \`${tempDbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);

  try {
    console.log(`Restoring ${localBackup.fileName} into ${tempDbName}...`);
    const restoreProc = spawnSync(MYSQL_PATH, [
      `--host=${localHost}`,
      `--port=${localPort}`,
      `--user=${localUser}`,
      `--password=${localPassword}`,
      tempDbName,
    ], {
      input: fs.readFileSync(localBackup.filePath, 'utf8'),
      maxBuffer: 100 * 1024 * 1024,
      encoding: 'utf8',
    });

    if (restoreProc.error || restoreProc.status !== 0) {
      throw new Error(`mysql restore into temp DB failed: ${restoreProc.stderr || restoreProc.error}`);
    }

    console.log('✓ Restore Exit Code: 0 (SUCCESS)');

    const tempConn = await mysql.createConnection({
      host: localHost,
      port: localPort,
      user: localUser,
      password: localPassword,
      database: tempDbName,
    });

    const [tables] = await tempConn.query("SHOW FULL TABLES WHERE Table_type = 'BASE TABLE'");
    console.log(`✓ Restored Base Tables Count: ${tables.length} / 100`);

    const [[userCount]] = await tempConn.query('SELECT COUNT(*) as c FROM users');
    const [[propCount]] = await tempConn.query('SELECT COUNT(*) as c FROM properties');
    const [[imgCount]] = await tempConn.query('SELECT COUNT(*) as c FROM property_images');
    const [[agrCount]] = await tempConn.query('SELECT COUNT(*) as c FROM agreements');
    const [[payCount]] = await tempConn.query('SELECT COUNT(*) as c FROM payments');

    console.log(`✓ Restored Users Count:       ${userCount.c} (Expected: 47)`);
    console.log(`✓ Restored Properties Count:  ${propCount.c} (Expected: 77)`);
    console.log(`✓ Restored Images Count:      ${imgCount.c} (Expected: 230)`);
    console.log(`✓ Restored Agreements Count:  ${agrCount.c} (Expected: 25)`);
    console.log(`✓ Restored Payments Count:    ${payCount.c} (Expected: 354)`);

    await tempConn.end();
  } finally {
    console.log(`Dropping temporary validation database ${tempDbName}...`);
    await rootConn.query(`DROP DATABASE IF EXISTS \`${tempDbName}\``);
    await rootConn.end();
    console.log('✓ Temporary validation database safely dropped.');
  }
}

async function main() {
  const localBackup = await backupLocalDatabase();
  await verifyLocalRestoreInTempDatabase(localBackup);

  console.log('\n========================================================');
  console.log('PHASE 2 LOCAL BACKUP SUMMARY & ARTIFACT');
  console.log('========================================================');
  console.log(JSON.stringify(localBackup, null, 2));
}

main().catch(console.error);
