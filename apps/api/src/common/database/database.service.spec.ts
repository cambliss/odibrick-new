import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { DatabaseService } from './database.service';

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
