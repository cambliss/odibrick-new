import * as fs from 'fs';
import * as crypto from 'crypto';
import mysql from 'mysql2/promise';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { DatabaseService } from './database.service';

jest.mock('fs', () => {
  const actual = jest.requireActual('fs');
  return {
    ...actual,
    existsSync: jest.fn(actual.existsSync),
    statSync: jest.fn(actual.statSync),
    readdirSync: jest.fn(actual.readdirSync),
    readFileSync: jest.fn(actual.readFileSync),
  };
});

describe('DatabaseService - Transaction & Deadlock Retry', () => {
  let service: DatabaseService;
  let mockConn: any;
  let mockPool: any;

  beforeEach(async () => {
    mockConn = {
      beginTransaction: jest.fn().mockResolvedValue(undefined),
      commit: jest.fn().mockResolvedValue(undefined),
      rollback: jest.fn().mockResolvedValue(undefined),
      release: jest.fn(),
      execute: jest.fn(),
      ping: jest.fn().mockResolvedValue(undefined),
    };

    mockPool = {
      getConnection: jest.fn().mockResolvedValue(mockConn),
      execute: jest.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        DatabaseService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue({
              host: 'localhost',
              port: 3306,
              user: 'root',
              password: 'pw',
              database: 'odibrick',
              connectionLimit: 5,
            }),
          },
        },
      ],
    }).compile();

    service = moduleRef.get(DatabaseService);
    // Inject the mock pool directly onto the service
    (service as any).pool = mockPool;
  });

  it('commits successfully when no error occurs', async () => {
    const result = await service.transaction(async (conn) => {
      return 'success';
    });

    expect(result).toBe('success');
    expect(mockConn.beginTransaction).toHaveBeenCalledTimes(1);
    expect(mockConn.commit).toHaveBeenCalledTimes(1);
    expect(mockConn.rollback).not.toHaveBeenCalled();
    expect(mockConn.release).toHaveBeenCalledTimes(1);
  });

  it('rolls back and rethrows immediately on non-deadlock error without retrying', async () => {
    const normalError = new Error('Constraint violation or syntax error');
    let callCount = 0;

    await expect(
      service.transaction(async () => {
        callCount++;
        throw normalError;
      }),
    ).rejects.toThrow('Constraint violation or syntax error');

    expect(callCount).toBe(1);
    expect(mockConn.rollback).toHaveBeenCalledTimes(1);
    expect(mockConn.commit).not.toHaveBeenCalled();
  });

  it('retries on MySQL deadlock error 1213 and succeeds if subsequent attempt succeeds', async () => {
    const deadlockError: any = new Error('Deadlock found when trying to get lock; try restarting transaction');
    deadlockError.errno = 1213;
    deadlockError.code = 'ER_LOCK_DEADLOCK';

    let attempts = 0;
    const result = await service.transaction(async () => {
      attempts++;
      if (attempts === 1) {
        throw deadlockError;
      }
      return 'recovered';
    });

    expect(result).toBe('recovered');
    expect(attempts).toBe(2);
    // First attempt rolls back, second attempt commits
    expect(mockConn.rollback).toHaveBeenCalledTimes(1);
    expect(mockConn.commit).toHaveBeenCalledTimes(1);
  });

  it('rethrows deadlock error when maxRetries is exceeded', async () => {
    const deadlockError: any = new Error('Persistent deadlock');
    deadlockError.errno = 1213;

    let attempts = 0;
    await expect(
      service.transaction(async () => {
        attempts++;
        throw deadlockError;
      }, 2), // maxRetries = 2 -> total attempts = 3 (initial + 2 retries)
    ).rejects.toThrow('Persistent deadlock');

    expect(attempts).toBe(3);
    expect(mockConn.rollback).toHaveBeenCalledTimes(3);
    expect(mockConn.commit).not.toHaveBeenCalled();
  });
});

describe('DatabaseService - Startup Migration Safety Policy', () => {
  const sql001 = 'CREATE TABLE IF NOT EXISTS users (id INT PRIMARY KEY);';
  const sql025 = 'ALTER TABLE users ADD COLUMN terms_accepted_at DATETIME NULL;';
  const checksum001 = crypto.createHash('sha256').update(sql001).digest('hex');
  const checksum025 = crypto.createHash('sha256').update(sql025).digest('hex');

  let mockPoolConn: any;
  let mockPool: any;
  let mockMigConn: any;
  let createPoolSpy: jest.SpyInstance;
  let createConnectionSpy: jest.SpyInstance;
  let existsSyncSpy: jest.SpyInstance;
  let statSyncSpy: jest.SpyInstance;
  let readdirSyncSpy: jest.SpyInstance;
  let readFileSyncSpy: jest.SpyInstance;
  const originalAutoRunEnv = process.env.AUTO_RUN_MIGRATIONS;

  beforeEach(() => {
    delete process.env.AUTO_RUN_MIGRATIONS;

    mockPoolConn = {
      ping: jest.fn().mockResolvedValue(undefined),
      release: jest.fn(),
    };

    mockPool = {
      getConnection: jest.fn().mockResolvedValue(mockPoolConn),
      query: jest.fn(),
      execute: jest.fn(),
      end: jest.fn().mockResolvedValue(undefined),
    };

    mockMigConn = {
      query: jest.fn().mockResolvedValue([[]]),
      end: jest.fn().mockResolvedValue(undefined),
    };

    createPoolSpy = jest.spyOn(mysql, 'createPool').mockReturnValue(mockPool as any);
    createConnectionSpy = jest.spyOn(mysql, 'createConnection').mockResolvedValue(mockMigConn as any);

    existsSyncSpy = jest.spyOn(fs, 'existsSync').mockImplementation((p: fs.PathLike) => {
      return String(p).replace(/\\/g, '/').endsWith('database/migrations');
    });
    statSyncSpy = jest.spyOn(fs, 'statSync').mockReturnValue({
      isDirectory: () => true,
    } as any);
    readdirSyncSpy = jest
      .spyOn(fs, 'readdirSync')
      .mockReturnValue(['001_init.sql', '025_registration_consent_and_otp_verification.sql'] as any);
    readFileSyncSpy = jest.spyOn(fs, 'readFileSync').mockImplementation((p: fs.PathOrFileDescriptor) => {
      const normalized = String(p).replace(/\\/g, '/');
      if (normalized.endsWith('001_init.sql')) return sql001;
      if (normalized.endsWith('025_registration_consent_and_otp_verification.sql')) return sql025;
      return '';
    });
  });

  afterEach(() => {
    if (originalAutoRunEnv === undefined) {
      delete process.env.AUTO_RUN_MIGRATIONS;
    } else {
      process.env.AUTO_RUN_MIGRATIONS = originalAutoRunEnv;
    }
    jest.restoreAllMocks();
  });

  function createServiceWithConfig(autoRunMigrations?: string): DatabaseService {
    const dbConfig: Record<string, any> = {
      host: 'localhost',
      port: 3306,
      user: 'odibrick_staging_user',
      password: 'pw',
      database: 'odibrick_staging',
      ssl: false,
      connectionLimit: 5,
    };
    if (autoRunMigrations !== undefined) {
      dbConfig.autoRunMigrations = autoRunMigrations;
    }

    const configService = {
      get: jest.fn((key: string) => {
        if (key === 'db') return dbConfig;
        if (key === 'db.autoRunMigrations') return dbConfig.autoRunMigrations;
        return undefined;
      }),
    } as unknown as ConfigService;

    return new DatabaseService(configService);
  }

  it('does not execute migrations on default startup and succeeds when all disk migrations are already applied', async () => {
    mockPool.query.mockResolvedValueOnce([
      [
        { filename: '001_init.sql', checksum: checksum001 },
        { filename: '025_registration_consent_and_otp_verification.sql', checksum: checksum025 },
      ],
    ]);

    const service = createServiceWithConfig('false');
    await expect(service.onModuleInit()).resolves.toBeUndefined();

    expect(createPoolSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        database: 'odibrick_staging',
        multipleStatements: false,
      }),
    );
    expect(createConnectionSpy).not.toHaveBeenCalled();
    expect(mockPool.query).toHaveBeenCalledTimes(1);
    expect(mockPool.query).toHaveBeenCalledWith('SELECT filename, checksum FROM schema_migrations', []);
    expect(mockPool.end).not.toHaveBeenCalled();
  });

  it('fails safely with a clear diagnostic and never executes DDL when pending migrations exist on default startup', async () => {
    mockPool.query.mockResolvedValueOnce([[{ filename: '001_init.sql', checksum: checksum001 }]]);

    const service = createServiceWithConfig('false');

    await expect(service.onModuleInit()).rejects.toThrow(
      /Pending database migration\(s\) detected while automatic startup migrations are disabled \(1 pending: 025_registration_consent_and_otp_verification\.sql\)/,
    );

    expect(createConnectionSpy).not.toHaveBeenCalled();
    expect(mockMigConn.query).not.toHaveBeenCalled();
    expect(mockPool.end).toHaveBeenCalledTimes(1);
  });

  it('treats non-exact values (unset, "false", "1", "TRUE", "yes") as disabled for automatic migrations', () => {
    for (const val of [undefined, 'false', '0', '1', 'TRUE', 'True', 'yes']) {
      const service = createServiceWithConfig(val);
      expect(service.isAutoMigrationEnabled()).toBe(false);
    }
    const enabledService = createServiceWithConfig('true');
    expect(enabledService.isAutoMigrationEnabled()).toBe(true);
  });

  it('executes only pending migrations and records tracking rows when explicitly opted in via AUTO_RUN_MIGRATIONS=true', async () => {
    mockMigConn.query
      .mockResolvedValueOnce([[]]) // CREATE TABLE IF NOT EXISTS schema_migrations
      .mockResolvedValueOnce([[{ filename: '001_init.sql', checksum: checksum001 }]]) // SELECT filename, checksum
      .mockResolvedValueOnce([[]]) // execute sql025
      .mockResolvedValueOnce([[]]); // INSERT INTO schema_migrations

    const service = createServiceWithConfig('true');
    await expect(service.onModuleInit()).resolves.toBeUndefined();

    expect(createConnectionSpy).toHaveBeenCalledTimes(1);
    expect(createConnectionSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        database: 'odibrick_staging',
        multipleStatements: true,
      }),
    );

    // 1. CREATE TABLE IF NOT EXISTS schema_migrations
    // 2. SELECT filename, checksum FROM schema_migrations
    // 3. sql025 (001_init.sql skipped because already tracked)
    // 4. INSERT INTO schema_migrations for 025
    expect(mockMigConn.query).toHaveBeenCalledTimes(4);
    expect(mockMigConn.query).toHaveBeenNthCalledWith(3, sql025);
    expect(mockMigConn.query).toHaveBeenNthCalledWith(
      4,
      'INSERT INTO schema_migrations (filename, checksum) VALUES (?, ?)',
      ['025_registration_consent_and_otp_verification.sql', checksum025],
    );
    expect(mockMigConn.end).toHaveBeenCalledTimes(1);
    expect(mockPool.end).not.toHaveBeenCalled();
  });

  it('handles migration errors safely by halting startup, not recording the failed migration, and closing connections', async () => {
    mockMigConn.query
      .mockResolvedValueOnce([[]]) // CREATE TABLE IF NOT EXISTS schema_migrations
      .mockResolvedValueOnce([[{ filename: '001_init.sql', checksum: checksum001 }]]) // SELECT filename, checksum
      .mockRejectedValueOnce(new Error('Duplicate column name terms_accepted_at')); // sql025 fails

    const service = createServiceWithConfig('true');

    await expect(service.onModuleInit()).rejects.toThrow(
      'Database migration failed during startup on 025_registration_consent_and_otp_verification.sql: Duplicate column name terms_accepted_at',
    );

    // Failed migration must not be inserted into schema_migrations
    expect(mockMigConn.query).toHaveBeenCalledTimes(3);
    expect(mockMigConn.end).toHaveBeenCalledTimes(1);
    expect(mockPool.end).toHaveBeenCalledTimes(1);
  });

  it('preserves existing migration tracking and warns when an already-applied migration checksum differs', async () => {
    mockPool.query.mockResolvedValueOnce([
      [
        { filename: '001_init.sql', checksum: 'outdated_checksum_value' },
        { filename: '025_registration_consent_and_otp_verification.sql', checksum: checksum025 },
      ],
    ]);

    const service = createServiceWithConfig('false');
    const warnSpy = jest.spyOn((service as any).logger, 'warn');

    await expect(service.onModuleInit()).resolves.toBeUndefined();

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Migration 001_init.sql has changed since it was applied'),
    );
  });
});
