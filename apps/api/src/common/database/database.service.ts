import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { Injectable, OnModuleDestroy, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import mysql, { Pool, PoolConnection, RowDataPacket, ResultSetHeader } from 'mysql2/promise';

/**
 * Thin data-access layer over a mysql2 pool.
 * Every query is parameterised — string interpolation of user input is never allowed.
 */
@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  private pool!: Pool;

  constructor(private readonly config: ConfigService) {}

  async onModuleInit(): Promise<void> {
    const db = this.config.get('db');
    const ca =
      db.sslCaCert ||
      (db.sslCa && fs.existsSync(db.sslCa) ? fs.readFileSync(db.sslCa, 'utf8') : undefined);

    const ssl = db.ssl
      ? {
          minVersion: 'TLSv1.2',
          rejectUnauthorized: true,
          ...(ca ? { ca } : {}),
        }
      : undefined;

    this.pool = mysql.createPool({
      host: db.host,
      port: db.port,
      user: db.user,
      password: db.password,
      database: db.database,
      ssl,
      waitForConnections: true,
      connectionLimit: db.connectionLimit,
      maxIdle: db.connectionLimit,
      enableKeepAlive: true,
      timezone: 'Z',
      dateStrings: ['DATE'],
      decimalNumbers: true,
      supportBigNumbers: true,
      namedPlaceholders: false,
      multipleStatements: false,
    });

    try {
      const conn = await this.pool.getConnection();
      await conn.ping();
      conn.release();
      this.logger.log(`Connected to MySQL ${db.host}:${db.port}/${db.database}`);

      // Verify migration state on startup; only execute DDL if explicitly opted in via AUTO_RUN_MIGRATIONS=true
      await this.verifyOrRunMigrations(db, ssl);
    } catch (error) {
      await this.pool?.end().catch(() => undefined);
      throw error;
    }
  }

  /**
   * Returns true ONLY when AUTO_RUN_MIGRATIONS has the exact string value 'true'.
   * By default, startup never executes DDL automatically.
   */
  isAutoMigrationEnabled(db?: any): boolean {
    if (db?.autoRunMigrations !== undefined) {
      return db.autoRunMigrations === 'true';
    }
    const configured = this.config.get<string>('db.autoRunMigrations');
    if (configured !== undefined) {
      return configured === 'true';
    }
    return process.env.AUTO_RUN_MIGRATIONS === 'true';
  }

  private resolveMigrationsDir(): string | null {
    const candidates = [
      path.resolve(process.cwd(), 'database/migrations'),
      path.resolve(process.cwd(), '../../database/migrations'),
      path.resolve(__dirname, '../../../../database/migrations'),
      path.resolve(__dirname, '../../../database/migrations'),
      path.resolve(__dirname, '../../database/migrations'),
    ];

    for (const dir of candidates) {
      if (fs.existsSync(dir) && fs.statSync(dir).isDirectory()) {
        return dir;
      }
    }
    return null;
  }

  private async verifyOrRunMigrations(db: any, ssl: any): Promise<void> {
    const migrationsDir = this.resolveMigrationsDir();
    if (!migrationsDir) {
      this.logger.warn('Migrations directory not found, skipping startup migration verification.');
      return;
    }

    const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();
    const diskMigrations = files.map((file) => {
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
      const checksum = crypto.createHash('sha256').update(sql).digest('hex');
      return { file, sql, checksum };
    });

    const autoRun = this.isAutoMigrationEnabled(db);

    if (!autoRun) {
      let appliedRows: Array<{ filename: string; checksum: string }> = [];
      try {
        appliedRows = await this.query<{ filename: string; checksum: string }>(
          'SELECT filename, checksum FROM schema_migrations',
        );
      } catch (err: any) {
        if (err?.code === 'ER_NO_SUCH_TABLE' || err?.errno === 1146) {
          appliedRows = [];
        } else {
          throw err;
        }
      }

      const appliedMap = new Map(appliedRows.map((r) => [r.filename, r.checksum]));
      for (const m of diskMigrations) {
        if (appliedMap.has(m.file) && appliedMap.get(m.file) !== m.checksum) {
          this.logger.warn(
            `Migration ${m.file} has changed since it was applied. Add a new migration instead of editing an applied one.`,
          );
        }
      }

      const pendingFiles = diskMigrations.filter((m) => !appliedMap.has(m.file)).map((m) => m.file);
      if (pendingFiles.length > 0) {
        const diagnostic =
          `Pending database migration(s) detected while automatic startup migrations are disabled ` +
          `(${pendingFiles.length} pending: ${pendingFiles.join(', ')}). ` +
          `Inspect with "npm run db:status" and apply deliberately with "npm run db:migrate" ` +
          `(or set AUTO_RUN_MIGRATIONS=true to opt in).`;
        this.logger.error(diagnostic);
        throw new Error(diagnostic);
      }

      this.logger.log(
        `Database schema verified (${appliedMap.size} migration(s) applied; AUTO_RUN_MIGRATIONS is disabled).`,
      );
      return;
    }

    let migConn: mysql.Connection | null = null;
    try {
      migConn = await mysql.createConnection({
        host: db.host,
        port: db.port,
        user: db.user,
        password: db.password,
        database: db.database,
        ssl,
        multipleStatements: true,
      });

      await migConn.query(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
          filename   VARCHAR(190) NOT NULL,
          checksum   CHAR(64)     NOT NULL,
          applied_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (filename)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `);

      const [applied] = await migConn.query<any[]>('SELECT filename, checksum FROM schema_migrations');
      const appliedMap = new Map(applied.map((r: any) => [r.filename, r.checksum]));

      let count = 0;
      for (const m of diskMigrations) {
        if (appliedMap.has(m.file)) {
          if (appliedMap.get(m.file) !== m.checksum) {
            this.logger.warn(
              `Migration ${m.file} has changed since it was applied. Add a new migration instead of editing an applied one.`,
            );
          }
          continue;
        }

        this.logger.log(`Applying migration ${m.file} (AUTO_RUN_MIGRATIONS=true)...`);
        try {
          await migConn.query(m.sql);
          await migConn.query('INSERT INTO schema_migrations (filename, checksum) VALUES (?, ?)', [
            m.file,
            m.checksum,
          ]);
          count++;
        } catch (fileErr: any) {
          const msg = `Database migration failed during startup on ${m.file}: ${fileErr.message}`;
          this.logger.error(msg, fileErr.stack);
          throw new Error(msg);
        }
      }

      if (count > 0) {
        this.logger.log(`Successfully applied ${count} database migration(s).`);
      } else {
        this.logger.log(`Database schema is already up to date (${appliedMap.size} migration(s) applied).`);
      }
    } finally {
      if (migConn) {
        await migConn.end().catch(() => undefined);
      }
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool?.end();
  }

  async query<T = RowDataPacket>(sql: string, params: unknown[] = []): Promise<T[]> {
    const [rows] = await this.pool.query(sql, params as any[]);
    return rows as T[];
  }

  async one<T = RowDataPacket>(sql: string, params: unknown[] = []): Promise<T | null> {
    const rows = await this.query<T>(sql, params);
    return rows.length ? rows[0] : null;
  }

  async execute(sql: string, params: unknown[] = []): Promise<ResultSetHeader> {
    const [result] = await this.pool.execute(sql, params as any[]);
    return result as ResultSetHeader;
  }

  async insert(table: string, data: Record<string, unknown>): Promise<number> {
    const keys = Object.keys(data).filter((k) => data[k] !== undefined);
    const cols = keys.map((k) => `\`${k}\``).join(', ');
    const placeholders = keys.map(() => '?').join(', ');
    const values = keys.map((k) => data[k] as unknown);
    const result = await this.execute(
      `INSERT INTO \`${table}\` (${cols}) VALUES (${placeholders})`,
      values,
    );
    return result.insertId;
  }

  async update(table: string, id: number | string, data: Record<string, unknown>, idColumn = 'id'): Promise<number> {
    const keys = Object.keys(data).filter((k) => data[k] !== undefined);
    if (!keys.length) return 0;
    const assignments = keys.map((k) => `\`${k}\` = ?`).join(', ');
    const values = [...keys.map((k) => data[k] as unknown), id];
    const result = await this.execute(
      `UPDATE \`${table}\` SET ${assignments} WHERE \`${idColumn}\` = ?`,
      values,
    );
    return result.affectedRows;
  }

  /** Runs the callback inside a transaction and rolls back on any throw. Supports bounded retry on deadlock (errno 1213). */
  async transaction<T>(fn: (conn: PoolConnection) => Promise<T>, maxRetries = 2): Promise<T> {
    let attempt = 0;
    while (true) {
      attempt++;
      const conn = await this.pool.getConnection();
      try {
        await conn.beginTransaction();
        const result = await fn(conn);
        await conn.commit();
        return result;
      } catch (error: any) {
        await conn.rollback();
        const isDeadlock = error?.errno === 1213 || error?.code === 'ER_LOCK_DEADLOCK';
        if (isDeadlock && attempt <= maxRetries) {
          this.logger.warn(`Deadlock detected (errno 1213). Retrying transaction (attempt ${attempt}/${maxRetries})...`);
          await new Promise((resolve) => setTimeout(resolve, 50 * Math.pow(2, attempt - 1)));
          continue;
        }
        throw error;
      } finally {
        conn.release();
      }
    }
  }

  /**
   * Generates the next atomic sequence number for a named sequence.
   * Concurrency-safe across all threads and connections using MySQL row-level locking.
   */
  async nextSequence(sequenceName: string, conn?: PoolConnection): Promise<number> {
    const runner = conn || this.pool;
    await runner.execute(
      `INSERT INTO reference_sequences (sequence_name, current_value)
       VALUES (?, LAST_INSERT_ID(1))
       ON DUPLICATE KEY UPDATE current_value = LAST_INSERT_ID(current_value + 1)`,
      [sequenceName],
    );
    const [rows]: any = await runner.execute('SELECT LAST_INSERT_ID() AS next_val');
    return Number(rows[0]?.next_val || 1);
  }

  get raw(): Pool {
    return this.pool;
  }
}
