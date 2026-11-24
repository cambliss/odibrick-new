import { Test } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { StorageController, resolvePublicStorageKey } from './storage.controller';
import { StorageService } from './storage.service';
import { AuthUser } from '../../common/auth/auth.types';

const testUser: AuthUser = {
  id: 1,
  publicId: 'USR-TEST-1',
  email: 'test@example.com',
  fullName: 'Test User',
  roles: ['OWNER'],
  permissions: ['property.create'],
};

describe('StorageController - D-17 Upload Restrictions', () => {
  let controller: StorageController;
  let storage: jest.Mocked<Partial<StorageService>>;

  beforeEach(async () => {
    storage = {
      store: jest.fn().mockResolvedValue({
        storageKey: 'properties/USR-TEST-1/photo.jpg',
        sizeBytes: 1024,
        checksum: 'abc123sha',
        mimeType: 'image/jpeg',
      } as any),
      registerDocument: jest.fn().mockResolvedValue({ id: 1 } as any),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [StorageController],
      providers: [{ provide: StorageService, useValue: storage }],
    }).compile();

    controller = moduleRef.get(StorageController);
  });

  it('rejects uploads without a file with BadRequestException', async () => {
    await expect(controller.upload(testUser, null as any, 'properties')).rejects.toThrow(BadRequestException);
  });

  it('rejects folder path traversal with BadRequestException', async () => {
    const fakeFile: Express.Multer.File = {
      buffer: Buffer.from('test image data'),
      originalname: 'test.jpg',
      mimetype: 'image/jpeg',
      size: 15,
    } as any;

    await expect(controller.upload(testUser, fakeFile, '../../vault')).rejects.toThrow(BadRequestException);
    await expect(controller.upload(testUser, fakeFile, 'misc/sub')).rejects.toThrow(BadRequestException);
    await expect(controller.upload(testUser, fakeFile, '..\\secret')).rejects.toThrow(BadRequestException);
  });

  it('rejects unlisted destination folders with BadRequestException', async () => {
    const fakeFile: Express.Multer.File = {
      buffer: Buffer.from('test image data'),
      originalname: 'test.jpg',
      mimetype: 'image/jpeg',
      size: 15,
    } as any;

    await expect(controller.upload(testUser, fakeFile, 'passwords')).rejects.toThrow(BadRequestException);
  });

  it('accepts allowed destination folders and stores with user prefix', async () => {
    const fakeFile: Express.Multer.File = {
      buffer: Buffer.from('test image data'),
      originalname: 'test.jpg',
      mimetype: 'image/jpeg',
      size: 15,
    } as any;

    const result = await controller.upload(testUser, fakeFile, 'properties');
    expect(result.storageKey).toBe('properties/USR-TEST-1/photo.jpg');
    expect(storage.store).toHaveBeenCalledWith(fakeFile, 'properties/USR-TEST-1');
  });

  it('rejects document creation when file is missing', async () => {
    await expect(
      controller.createDocument(testUser, null as any, {} as any, {} as any),
    ).rejects.toThrow(BadRequestException);
  });

  describe('Public vs Private Namespace Policy (servePublicStorage)', () => {
    const createMockRes = () => {
      const headers: Record<string, any> = {};
      const res: any = {
        statusCode: 200,
        body: undefined,
        headers,
        status: jest.fn((code: number) => {
          res.statusCode = code;
          return res;
        }),
        json: jest.fn((payload: any) => {
          res.body = payload;
          return res;
        }),
        setHeader: jest.fn((k: string, v: any) => {
          headers[k] = v;
        }),
        send: jest.fn((buf: any) => {
          res.body = buf;
          return res;
        }),
      };
      return res;
    };

    it('allows public property images, demo property images, profiles, and legacy img_ keys', async () => {
      storage.readRaw = jest.fn().mockResolvedValue(Buffer.from([0xff, 0xd8, 0xff, 0xe0]));

      for (const key of [
        'properties/USR-1/2026-10/photo.jpg',
        'demo/properties/PROP-1/photo-1.jpg',
        'profiles/USR-1/avatar.jpg',
        'img_living_001',
      ]) {
        const res = createMockRes();
        await controller.servePublicStorage(key, res);
        expect(res.statusCode).toBe(200);
        expect(res.headers['X-Content-Type-Options']).toBe('nosniff');
        expect(res.headers['Cache-Control']).toContain('public');
      }
    });

    it('rejects public attempts to retrieve vault, kyc, agreements, documents, inspections, and misc objects with 403', async () => {
      storage.readRaw = jest.fn();

      const blockedKeys = [
        'vault/USR-1/kyc/2026-10/passport.pdf',
        'kyc/USR-1/id.pdf',
        'agreements/TEN-1/lease.pdf',
        'documents/USR-1/2026-10/deed.pdf',
        'inspections/USR-1/2026-10/report.jpg',
        'misc/USR-1/2026-10/notes.pdf',
        'demo/private/secret.pdf',
        'unknown-namespace/file.jpg',
      ];

      for (const key of blockedKeys) {
        const res = createMockRes();
        await controller.servePublicStorage(key, res);
        expect(res.statusCode).toBe(403);
      }
      expect(storage.readRaw).not.toHaveBeenCalled();
    });

    it('rejects traversal, encoded, double-encoded, backslash, and null-byte path variants with 400', async () => {
      storage.readRaw = jest.fn();

      const maliciousKeys = [
        '../vault/secret.pdf',
        'properties/../../vault/secret.pdf',
        '%2e%2e/vault/secret.pdf',
        '%252e%252e/vault/secret.pdf',
        'properties\\..\\vault\\secret.pdf',
        'properties/photo.jpg%00.png',
        '%E0%A4%A',
      ];

      for (const key of maliciousKeys) {
        const resolved = resolvePublicStorageKey(key);
        expect(resolved.ok).toBe(false);
        const res = createMockRes();
        await controller.servePublicStorage(key, res);
        expect(res.statusCode).toBe(400);
      }
      expect(storage.readRaw).not.toHaveBeenCalled();
    });

    it('requires a valid signed link or authenticated user for private document downloads', async () => {
      const res = createMockRes();
      await controller.download(42, '', '', '', undefined as any, res);
      expect(res.statusCode).toBe(401);
      expect(res.body).toEqual({ statusCode: 401, message: 'Unauthorized access to document.' });
    });

    it('sets private no-store headers on signed document downloads', async () => {
      storage.readSigned = jest.fn().mockResolvedValue({
        buffer: Buffer.from('%PDF-1.4'),
        mimeType: 'application/pdf',
        filename: 'kyc-doc.pdf',
      });
      const res = createMockRes();
      await controller.download(42, '1', String(Math.floor(Date.now() / 1000) + 300), 'valid-sig', undefined as any, res);
      expect(res.headers['Cache-Control']).toBe('private, no-store');
      expect(res.headers['X-Content-Type-Options']).toBe('nosniff');
      expect(res.headers['Content-Type']).toBe('application/pdf');
    });

    it('sets ETag, handles 304 If-None-Match, and distinguishes stored vs placeholder vs missing-fallback caching', async () => {
      const createRes = () => {
        const headers: Record<string, any> = {};
        const res: any = {
          statusCode: 200,
          body: undefined,
          headers,
          status: jest.fn((c: number) => { res.statusCode = c; return res; }),
          json: jest.fn((p: any) => { res.body = p; return res; }),
          setHeader: jest.fn((k: string, v: any) => { headers[k] = v; }),
          send: jest.fn((b: any) => { res.body = b; return res; }),
          end: jest.fn(() => res),
        };
        return res;
      };

      // Stored real photograph -> long public cache + ETag + stored header
      storage.readPublicObject = jest.fn().mockResolvedValueOnce({
        buffer: Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
        isFallback: false,
        isSvgPlaceholder: false,
        etag: '"etag-123"',
        mimeType: 'image/jpeg',
      });
      const res1 = createRes();
      await controller.servePublicStorage('properties/USR-1/2026-11/photo.jpg', res1, { headers: {} } as any);
      expect(res1.statusCode).toBe(200);
      expect(res1.headers['ETag']).toBe('"etag-123"');
      expect(res1.headers['X-Odibrick-Media-Status']).toBe('stored');
      expect(res1.headers['Cache-Control']).toBe('public, max-age=86400, stale-while-revalidate=604800');

      // Conditional 304 Not Modified on matching If-None-Match
      storage.readPublicObject = jest.fn().mockResolvedValueOnce({
        buffer: Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
        isFallback: false,
        isSvgPlaceholder: false,
        etag: '"etag-123"',
        mimeType: 'image/jpeg',
      });
      const res304 = createRes();
      await controller.servePublicStorage(
        'properties/USR-1/2026-11/photo.jpg',
        res304,
        { headers: { 'if-none-match': '"etag-123"' } } as any,
      );
      expect(res304.statusCode).toBe(304);
      expect(res304.end).toHaveBeenCalled();

      // Missing-object fallback -> short cache + missing-fallback header
      storage.readPublicObject = jest.fn().mockResolvedValueOnce({
        buffer: Buffer.from('<svg></svg>'),
        isFallback: true,
        isSvgPlaceholder: false,
        etag: '"fallback-1"',
        mimeType: 'image/svg+xml',
      });
      const resFallback = createRes();
      await controller.servePublicStorage('properties/USR-1/2026-11/missing.jpg', resFallback, { headers: {} } as any);
      expect(resFallback.statusCode).toBe(200);
      expect(resFallback.headers['X-Odibrick-Media-Status']).toBe('missing-fallback');
      expect(resFallback.headers['Cache-Control']).toBe('public, max-age=60, must-revalidate');
    });
  });
});
