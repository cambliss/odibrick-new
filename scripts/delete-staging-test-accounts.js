#!/usr/bin/env node
/**
 * Local-only staging maintenance script to delete ONLY the two specified
 * newly created test accounts (IDs 1 and 2) from `odibrick_staging`.
 *
 * Safety guarantees:
 * - Hard-restricted to database `odibrick_staging`, user `odibrick_staging_app`,
 *   port `11843`, and the exact configured Aiven staging hostname (`EXPECTED_DB_HOST`).
 * - Enforces TLSv1.2+ with CA certificate verification (`rejectUnauthorized: true`).
 * - Requires exact 4-way match on `(id, email, phone, is_demo = 0)` for both targets.
 * - Never prints phone numbers, passwords, or certificates in logs or error messages.
 * - Requires interactive operator confirmation (`DELETE STAGING TEST ACCOUNTS 1 AND 2`).
 * - Runs inside a single database transaction with `FOR UPDATE` row locks, restrictive
 *   foreign-key checks, post-delete absence verification, and automatic rollback on any error.
 * - Never touches `audit_logs` (preserving append-only audit history) or unrelated records.
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const mysql = require('mysql2/promise');
require('dotenv').config({ path: path.resolve('apps/api/.env') });

const TARGET_DB = 'odibrick_staging';
const EXPECTED_DB_USER = 'odibrick_staging_app';
const EXPECTED_DB_PORT = 11843;
const EXPECTED_DB_HOST = (process.env.EXPECTED_DB_HOST || '').trim();
const AIVEN_HOST_PATTERN = /^[a-z0-9-]+(?:\.[a-z0-9-]+)*\.aivencloud\.com$/i;
const REQUIRED_CONFIRMATION = 'DELETE STAGING TEST ACCOUNTS 1 AND 2';

const targets = [
  {
    id: 1,
    email: 'saideepak.pokuri@gmail.com',
    phone: '9701814936',
  },
  {
    id: 2,
    email: 'kongondashushwanth19@gmail.com',
    phone: '8497980017',
  },
];

function validateTargetsConfig() {
  if (!Array.isArray(targets) || targets.length !== 2) {
    throw new Error('Safety stop: targets list must contain exactly the 2 approved test accounts.');
  }

  for (const target of targets) {
    if (
      !Number.isInteger(target.id) ||
      target.id <= 0 ||
      typeof target.email !== 'string' ||
      !target.email.trim() ||
      typeof target.phone !== 'string' ||
      !/^[0-9]{10}$|^\+[0-9]{11,14}$/.test(target.phone.trim())
    ) {
      throw new Error(
        `Safety stop: invalid target configuration for account ID ${target?.id}. Both email and exact phone are required.`
      );
    }
  }
}

function makeSslConfig() {
  if (process.env.DB_SSL !== 'true' && process.env.DB_SSL !== '1') {
    throw new Error('Safety stop: DB_SSL must be "true".');
  }

  const caPath = process.env.DB_SSL_CA;
  const caInline = process.env.DB_SSL_CA_CERT;

  if (caPath && fs.existsSync(caPath)) {
    return {
      minVersion: 'TLSv1.2',
      ca: fs.readFileSync(caPath, 'utf8'),
      rejectUnauthorized: true,
    };
  }

  if (caInline && caInline.trim()) {
    return {
      minVersion: 'TLSv1.2',
      ca: caInline.replace(/\\n/g, '\n'),
      rejectUnauthorized: true,
    };
  }

  throw new Error('Safety stop: staging TLS CA certificate not found in DB_SSL_CA or DB_SSL_CA_CERT.');
}

function promptConfirmation(promptText) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error(
      'Safety stop: interactive TTY is required to confirm account deletion.'
    );
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(promptText, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

async function main() {
  validateTargetsConfig();

  const configuredHost = (process.env.DB_HOST || '').trim();
  const configuredPort = Number(process.env.DB_PORT);
  const configuredUser = (process.env.DB_USER || '').trim();
  const configuredDb = (process.env.DB_NAME || '').trim();

  if (
    !EXPECTED_DB_HOST ||
    !AIVEN_HOST_PATTERN.test(EXPECTED_DB_HOST) ||
    !configuredHost ||
    !AIVEN_HOST_PATTERN.test(configuredHost) ||
    configuredHost.toLowerCase() !== EXPECTED_DB_HOST.toLowerCase()
  ) {
    throw new Error(
      'Safety stop: DB_HOST and EXPECTED_DB_HOST must both be set and match the exact Aiven staging hostname (*.aivencloud.com).'
    );
  }

  if (
    configuredDb !== TARGET_DB ||
    configuredUser !== EXPECTED_DB_USER ||
    configuredPort !== EXPECTED_DB_PORT ||
    !process.env.DB_PASSWORD
  ) {
    throw new Error(
      `Safety stop: configure staging environment variables (DB_NAME=${TARGET_DB}, DB_USER=${EXPECTED_DB_USER}, DB_PORT=${EXPECTED_DB_PORT}, and DB_PASSWORD).`
    );
  }

  const sslConfig = makeSslConfig();

  console.log('Target database:', TARGET_DB);
  console.log('Target accounts queued for verification and deletion:');
  for (const t of targets) {
    console.log(`  - ID ${t.id}: email=${t.email} (expected phone configured: yes)`);
  }

  const typed = await promptConfirmation(
    `\nType "${REQUIRED_CONFIRMATION}" to proceed: `
  );

  if (typed !== REQUIRED_CONFIRMATION) {
    throw new Error(
      `Safety stop: confirmation phrase did not match "${REQUIRED_CONFIRMATION}". Nothing was deleted.`
    );
  }

  const connection = await mysql.createConnection({
    host: configuredHost,
    port: configuredPort,
    user: configuredUser,
    password: process.env.DB_PASSWORD,
    database: TARGET_DB,
    ssl: sslConfig,
    multipleStatements: false,
  });

  let transactionStarted = false;

  try {
    const [identityRows] = await connection.query(`
      SELECT DATABASE() AS db,
             CURRENT_USER() AS db_user,
             @@port AS port
    `);

    const identity = identityRows[0];
    const authenticatedUser = String(identity?.db_user || '').split('@')[0];

    if (
      !identity ||
      identity.db !== TARGET_DB ||
      authenticatedUser !== EXPECTED_DB_USER ||
      Number(identity.port) !== EXPECTED_DB_PORT
    ) {
      throw new Error(
        `Safety stop: connected database identity (${JSON.stringify(identity)}) does not match ${TARGET_DB} / ${EXPECTED_DB_USER} / ${EXPECTED_DB_PORT}.`
      );
    }

    console.log('Verified database:', identity.db);
    console.log('Connected DB user:', identity.db_user);
    console.log('DB port:', identity.port);

    await connection.beginTransaction();
    transactionStarted = true;

    // 1. Lock both target rows and verify exact 4-way identity match:
    //    (id, email, phone, is_demo = 0). Never log phone numbers.
    for (const target of targets) {
      const [rows] = await connection.execute(
        `SELECT id, email, phone, is_demo
           FROM users
          WHERE id = ?
          FOR UPDATE`,
        [target.id]
      );

      if (rows.length !== 1) {
        throw new Error(
          `Safety stop: account ID ${target.id} was not found in ${TARGET_DB}.`
        );
      }

      const row = rows[0];
      const dbEmail = String(row.email || '').trim().toLowerCase();
      const dbPhone = String(row.phone || '').trim();
      const expectedEmail = target.email.trim().toLowerCase();
      const expectedPhone = target.phone.trim();

      const idMatched = Number(row.id) === target.id;
      const emailMatched = dbEmail === expectedEmail;
      const phoneMatched = dbPhone === expectedPhone;
      const isNonDemo = Number(row.is_demo) === 0;

      if (!idMatched || !emailMatched || !phoneMatched || !isNonDemo) {
        throw new Error(
          `Safety stop: account ID ${target.id} failed identity verification (emailMatched=${emailMatched}, phoneMatched=${phoneMatched}, is_demo=${row.is_demo}).`
        );
      }

      console.log(
        `Locked & verified account ${target.id}: email=${row.email}, phoneMatched=true, is_demo=${row.is_demo}`
      );
    }

    // 2. Discover all direct foreign keys referencing users.id that restrict
    //    deletion, and check them inside the active transaction.
    const [foreignKeys] = await connection.execute(
      `SELECT k.TABLE_NAME AS table_name,
              k.COLUMN_NAME AS column_name,
              r.DELETE_RULE AS delete_rule
         FROM information_schema.KEY_COLUMN_USAGE k
         JOIN information_schema.REFERENTIAL_CONSTRAINTS r
           ON r.CONSTRAINT_SCHEMA = k.CONSTRAINT_SCHEMA
          AND r.TABLE_NAME = k.TABLE_NAME
          AND r.CONSTRAINT_NAME = k.CONSTRAINT_NAME
        WHERE k.CONSTRAINT_SCHEMA = DATABASE()
          AND k.REFERENCED_TABLE_NAME = 'users'
          AND k.REFERENCED_COLUMN_NAME = 'id'
          AND r.DELETE_RULE IN ('RESTRICT', 'NO ACTION')`
    );

    for (const fk of foreignKeys) {
      const table = '`' + String(fk.table_name).replace(/`/g, '``') + '`';
      const column = '`' + String(fk.column_name).replace(/`/g, '``') + '`';

      const [counts] = await connection.execute(
        `SELECT COUNT(*) AS total
           FROM ${table}
          WHERE ${column} IN (?, ?)`,
        [targets[0].id, targets[1].id]
      );

      if (Number(counts[0].total) > 0) {
        throw new Error(
          `Safety stop: restrictive reference found in ${fk.table_name}.${fk.column_name} (${counts[0].total} row(s)). No accounts will be deleted.`
        );
      }
    }

    console.log(
      `Restrictive foreign-key checks passed (${foreignKeys.length} constraint(s) verified with 0 blocking rows).`
    );

    // 3. Delete only the two exact, previously locked and validated user rows.
    //    Append-only audit_logs are intentionally preserved and never deleted.
    for (const target of targets) {
      const [result] = await connection.execute(
        `DELETE FROM users
          WHERE id = ?
            AND email = ?
            AND phone = ?
            AND is_demo = 0`,
        [target.id, target.email, target.phone]
      );

      if (result.affectedRows !== 1) {
        throw new Error(
          `Safety stop: expected to delete exactly 1 row for account ${target.id}, but affectedRows was ${result.affectedRows}.`
        );
      }
    }

    // 4. Verify both accounts (and their emails/phones) are absent before committing.
    for (const target of targets) {
      const [rows] = await connection.execute(
        'SELECT id FROM users WHERE id = ? OR email = ? OR phone = ?',
        [target.id, target.email, target.phone]
      );

      if (rows.length !== 0) {
        throw new Error(
          `Verification failed for account ${target.id}: row or contact identifier still present; rolling back.`
        );
      }
    }

    await connection.commit();
    transactionStarted = false;

    console.log(
      'SUCCESS: both specified test accounts (IDs 1 and 2) were deleted from odibrick_staging.'
    );
    console.log(
      'Append-only audit_logs were preserved and no unrelated records were modified.'
    );
  } catch (error) {
    if (transactionStarted) {
      try {
        await connection.rollback();
        console.error('Transaction rolled back. No partial deletion committed.');
      } catch (rollbackError) {
        console.error('Rollback error:', rollbackError.message);
      }
    }
    throw error;
  } finally {
    await connection.end().catch(() => undefined);
  }
}

main().catch((error) => {
  console.error('Deletion stopped:', error.message);
  process.exitCode = 1;
});
