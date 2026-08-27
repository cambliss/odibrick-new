import * as fs from 'fs';
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
    const conn = await this.pool.getConnection();
    await conn.ping();
    conn.release();
    this.logger.log(`Connected to MySQL ${db.host}:${db.port}/${db.database}`);
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

  /** Runs the callback inside a transaction and rolls back on any throw. */
  async transaction<T>(fn: (conn: PoolConnection) => Promise<T>): Promise<T> {
    const conn = await this.pool.getConnection();
    try {
      await conn.beginTransaction();
      const result = await fn(conn);
      await conn.commit();
      return result;
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }
  }

  get raw(): Pool {
    return this.pool;
  }
}
