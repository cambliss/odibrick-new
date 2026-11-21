import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  escapeXml,
  generateFallbackSvg,
  LocalDriver,
  S3Driver,
  StorageService,
} from './storage.service';
import * as fs from 'fs';
import * as path from 'path';

describe('Storage Module & Fallback SVG Tests', () => {
  describe('escapeXml', () => {
    it('escapes unescaped ampersands correctly', () => {
      expect(escapeXml('Living Room & Lounge')).toBe('Living Room &amp; Lounge');
    });

    it('avoids double-escaping already escaped XML entities', () => {
      expect(escapeXml('Living Room &amp; Lounge')).toBe('Living Room &amp; Lounge');
      expect(escapeXml('Tag &lt;tag&gt; &amp; &quot;quote&quot; &apos;apostrophe&apos;')).toBe(
        'Tag &lt;tag&gt; &amp; &quot;quote&quot; &apos;apostrophe&apos;',
      );
      expect(escapeXml('Unicode entity &#160; and hex &#x20; & more')).toBe(
        'Unicode entity &#160; and hex &#x20; &amp; more',
      );
    });

    it('escapes <, >, ", and \' characters correctly', () => {
      const input = `<Chef's "Delight" & Master's Suite>`;
      const expected = `&lt;Chef&apos;s &quot;Delight&quot; &amp; Master&apos;s Suite&gt;`;
      expect(escapeXml(input)).toBe(expected);
    });

    it('handles empty and falsy input safely', () => {
      expect(escapeXml('')).toBe('');
      expect(escapeXml(null as any)).toBe('');
      expect(escapeXml(undefined as any)).toBe('');
    });
  });

  describe('generateFallbackSvg', () => {
    it('generates valid SVG with escaped default "Living Room &amp; Lounge"', () => {
      const svg = generateFallbackSvg('properties/sample/photo-1.jpg');
      expect(svg).toContain('<svg xmlns="http://www.w3.org/2000/svg"');
      expect(svg).toContain('</svg>');
      expect(svg).toContain('Living Room &amp; Lounge');
      expect(svg).not.toContain('Living Room & Lounge'); // Raw unescaped ampersand must NOT be present
    });

    it('handles dynamic titles containing &, <, >, quotes, and apostrophes safely', () => {
      const complexTitle = `Hall & Kitchen <VIP "Suite's">`;
      const svg = generateFallbackSvg('properties/sample/custom.jpg', complexTitle);
      expect(svg).toContain('Hall &amp; Kitchen &lt;VIP &quot;Suite&apos;s&quot;&gt;');
      expect(svg).not.toContain('Hall & Kitchen');
    });

    it('generates Modular Kitchen fallback for kitchen keys', () => {
      const svg = generateFallbackSvg('properties/unit-101/kitchen-main.jpg');
      expect(svg).toContain('Modular Kitchen');
      expect(svg).toContain('#f59e0b');
    });

    it('generates Master Bedroom fallback for bedroom keys', () => {
      const svg = generateFallbackSvg('properties/unit-101/bedroom-suite.jpg');
      expect(svg).toContain('Master Bedroom');
      expect(svg).toContain('#ec4899');
    });

    it('generates Balcony View fallback for balcony keys', () => {
      const svg = generateFallbackSvg('properties/unit-101/balcony-terrace.jpg');
      expect(svg).toContain('Balcony View');
      expect(svg).toContain('#10b981');
    });

    it('produces an XML-well-formed SVG document', () => {
      const svg = generateFallbackSvg('properties/unit-101/general-living.jpg');
      // Verify well-formedness: every opening tag has matching closing tag or self-closing
      expect(svg.startsWith('<svg')).toBe(true);
      expect(svg.endsWith('</svg>')).toBe(true);
      // No unescaped ampersand that is not part of an entity
      const unescapedAmpersand = /&(?!(?:amp|lt|gt|quot|apos);)/;
      expect(unescapedAmpersand.test(svg)).toBe(false);
    });
  });

  describe('LocalDriver', () => {
    const testDir = path.resolve(__dirname, '../../../../storage/unit-test-tmp');
    let driver: LocalDriver;

    beforeAll(async () => {
      await fs.promises.mkdir(testDir, { recursive: true });
      driver = new LocalDriver(testDir);
    });

    afterAll(async () => {
      await fs.promises.rm(testDir, { recursive: true, force: true });
    });

    it('reads back exact binary content for an existing valid image', async () => {
      const key = 'properties/test/existing-photo.jpg';
      const fakeBinary = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
      await driver.put(key, fakeBinary, 'image/jpeg');

      const retrieved = await driver.get(key);
      expect(Buffer.compare(retrieved, fakeBinary)).toBe(0);
      expect(await driver.exists(key)).toBe(true);

      await driver.remove(key);
      expect(await driver.exists(key)).toBe(false);
    });

    it('returns well-formed SVG fallback for missing property photos and never writes to disk (D-16)', async () => {
      const missingKey = 'properties/non-existent-prop/2026-10/photo-living.jpg';
      const retrieved = await driver.get(missingKey);
      const content = retrieved.toString('utf8');

      expect(content).toContain('<svg');
      expect(content).toContain('Living Room &amp; Lounge');
      expect(content).not.toContain('Living Room & Lounge');

      // D-16 regression verification: file must not have been created on disk
      expect(fs.existsSync(path.join(testDir, missingKey))).toBe(false);
      expect(fs.existsSync(path.join(testDir, 'properties/non-existent-prop'))).toBe(false);
    });

    it('throws NotFoundException for missing private documents (never SVG fallback)', async () => {
      const missingVaultKey = 'vault/user_123/kyc/pan_card.pdf';
      await expect(driver.get(missingVaultKey)).rejects.toThrow(NotFoundException);
    });
  });

  describe('S3Driver', () => {
    it('throws configuration error if bucket is empty', () => {
      expect(() => new S3Driver({ bucket: '' })).toThrow(
        'S3 storage driver requires S3_BUCKET configuration.',
      );
    });

    it('returns SVG fallback for missing property photos when S3 returns NotFound', async () => {
      const driver = new S3Driver({
        bucket: 'test-bucket',
        region: 'auto',
        accessKeyId: 'test-key',
        secretAccessKey: 'test-secret',
        endpoint: 'https://test-account.r2.cloudflarestorage.com',
      });

      // Mock S3Client send to simulate NoSuchKey
      const notFoundErr: any = new Error('NoSuchKey');
      notFoundErr.name = 'NoSuchKey';
      notFoundErr.$metadata = { httpStatusCode: 404 };
      jest.spyOn((driver as any).client, 'send').mockRejectedValueOnce(notFoundErr);

      const result = await driver.get('properties/test-prop/kitchen-view.jpg');
      const content = result.toString('utf8');

      expect(content).toContain('<svg');
      expect(content).toContain('Modular Kitchen');
    });

    it('throws NotFoundException for missing private vault files (never returns SVG fallback)', async () => {
      const driver = new S3Driver({
        bucket: 'test-bucket',
        region: 'auto',
        accessKeyId: 'test-key',
        secretAccessKey: 'test-secret',
        endpoint: 'https://test-account.r2.cloudflarestorage.com',
      });

      const notFoundErr: any = new Error('NoSuchKey');
      notFoundErr.name = 'NoSuchKey';
      notFoundErr.$metadata = { httpStatusCode: 404 };
      jest.spyOn((driver as any).client, 'send').mockRejectedValueOnce(notFoundErr);

      await expect(driver.get('vault/user-abc/agreement.pdf')).rejects.toThrow(NotFoundException);
    });

    it('returns exact binary data when object exists in S3/R2', async () => {
      const driver = new S3Driver({
        bucket: 'test-bucket',
        region: 'auto',
        accessKeyId: 'test-key',
        secretAccessKey: 'test-secret',
        endpoint: 'https://test-account.r2.cloudflarestorage.com',
      });

      const expectedBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      jest.spyOn((driver as any).client, 'send').mockResolvedValueOnce({
        Body: {
          transformToByteArray: async () => expectedBytes,
        },
      } as any);

      const result = await driver.get('properties/test-prop/photo.png');
      expect(Buffer.compare(result, Buffer.from(expectedBytes))).toBe(0);
    });
  });

  describe('StorageService Configuration Fail-Safe', () => {
    it('throws fast error on boot when STORAGE_DRIVER=S3 and S3_BUCKET is missing', () => {
      const mockConfig = {
        get: jest.fn((key: string) => {
          if (key === 'storage.driver') return 'S3';
          if (key === 'storage.s3Bucket') return '';
          return undefined;
        }),
      } as unknown as ConfigService;

      expect(
        () => new StorageService(mockConfig, {} as any, {} as any, {} as any),
      ).toThrow('STORAGE_DRIVER is set to S3 but S3_BUCKET is not configured.');
    });

    it('initializes LocalDriver when STORAGE_DRIVER=LOCAL', () => {
      const mockConfig = {
        get: jest.fn((key: string) => {
          if (key === 'storage.driver') return 'LOCAL';
          if (key === 'storage.localRoot') return '/tmp/storage-test';
          return undefined;
        }),
      } as unknown as ConfigService;

      const service = new StorageService(mockConfig, {} as any, {} as any, {} as any);
      expect(service.getDriverName()).toBe('LOCAL');
    });

    it('reports health status without exposing credentials', async () => {
      const mockConfig = {
        get: jest.fn((key: string) => {
          if (key === 'storage.driver') return 'LOCAL';
          if (key === 'storage.localRoot') return '/tmp/storage-test';
          return undefined;
        }),
      } as unknown as ConfigService;

      const service = new StorageService(mockConfig, {} as any, {} as any, {} as any);
      const health = await service.checkHealth();
      expect(health.driver).toBe('LOCAL');
      expect(health.status).toBe('up');
      expect((health as any).accessKeyId).toBeUndefined();
      expect((health as any).secretAccessKey).toBeUndefined();
      expect((health as any).bucket).toBeUndefined();
    });

    it('rejects unsafe development signing-secret fallbacks in production', () => {
      const mockConfig = {
        get: jest.fn((key: string) => {
          if (key === 'app.env') return 'production';
          if (key === 'auth.accessSecret') return 'dev-access-secret';
          if (key === 'storage.driver') return 'LOCAL';
          return undefined;
        }),
      } as unknown as ConfigService;

      expect(
        () => new StorageService(mockConfig, {} as any, {} as any, {} as any),
      ).toThrow('Unsafe or missing JWT_ACCESS_SECRET in production');
    });

    it('reports S3 health down when bucket access is denied (403)', async () => {
      const mockConfig = {
        get: jest.fn((key: string) => {
          if (key === 'app.env') return 'production';
          if (key === 'auth.accessSecret') return 'prod-secret-key-at-least-32-chars-long';
          if (key === 'storage.driver') return 'S3';
          if (key === 'storage.s3Bucket') return 'odibrick-prod-r2';
          if (key === 'storage.awsRegion') return 'auto';
          if (key === 'storage.s3Endpoint') return 'https://acct.r2.cloudflarestorage.com';
          if (key === 'storage.awsAccessKeyId') return 'key';
          if (key === 'storage.awsSecretAccessKey') return 'secret';
          return undefined;
        }),
      } as unknown as ConfigService;

      const service = new StorageService(mockConfig, {} as any, {} as any, {} as any);
      const accessDenied: any = new Error('AccessDenied');
      accessDenied.name = 'AccessDenied';
      accessDenied.$metadata = { httpStatusCode: 403 };
      jest.spyOn((service as any).driver.client, 'send').mockRejectedValueOnce(accessDenied);

      const health = await service.checkHealth();
      expect(health.driver).toBe('S3');
      expect(health.status).toBe('down');
    });
  });

  describe('Signed URLs & Document Authorization Security', () => {
    const createService = (dbOverrides: any = {}) => {
      const mockConfig = {
        get: jest.fn((key: string) => {
          if (key === 'app.env') return 'production';
          if (key === 'auth.accessSecret') return 'prod-secret-key-at-least-32-chars-long';
          if (key === 'storage.driver') return 'LOCAL';
          if (key === 'storage.localRoot') return '/tmp/storage-test';
          if (key === 'storage.signedUrlTtl') return 300;
          return undefined;
        }),
      } as unknown as ConfigService;
      const mockDb = {
        one: jest.fn(),
        insert: jest.fn().mockResolvedValue(1),
        ...dbOverrides,
      };
      return new StorageService(mockConfig, mockDb as any, {} as any, {} as any);
    };

    it('rejects expired, tampered, and malformed signed download tokens', async () => {
      const service = createService({
        one: jest.fn().mockResolvedValue({
          id: 10,
          owner_user_id: 1,
          uploaded_by: 1,
          visibility: 'PRIVATE',
          storage_key: 'vault/USR-1/kyc/2026-10/doc.pdf',
          mime_type: 'application/pdf',
          title: 'Passport',
        }),
      });

      const ownerUser: any = { id: 1, roles: ['USER'], permissions: [] };
      const { url } = await service.signedLink(ownerUser, 10);
      const parsed = new URL(`https://api.odibrick.com${url}`);
      const exp = Number(parsed.searchParams.get('exp'));
      const sig = parsed.searchParams.get('sig')!;
      const u = Number(parsed.searchParams.get('u'));

      // Expired
      await expect(service.readSigned(10, u, Math.floor(Date.now() / 1000) - 10, sig)).rejects.toThrow(
        ForbiddenException,
      );
      // Tampered signature
      await expect(service.readSigned(10, u, exp, `${sig.slice(0, -1)}0`)).rejects.toThrow(
        ForbiddenException,
      );
      // Tampered userId
      await expect(service.readSigned(10, u + 1, exp, sig)).rejects.toThrow(ForbiddenException);
      // Malformed / NaN inputs
      await expect(service.readSigned(10, Number.NaN, exp, sig)).rejects.toThrow(ForbiddenException);
      await expect(service.readSigned(10, u, Number.NaN, sig)).rejects.toThrow(ForbiddenException);
    });

    it('enforces ownership/RBAC on authenticated document downloads', async () => {
      const service = createService({
        one: jest.fn().mockResolvedValue({
          id: 10,
          owner_user_id: 1,
          uploaded_by: 1,
          visibility: 'PRIVATE',
          context_type: null,
          context_id: null,
          storage_key: 'vault/USR-1/kyc/2026-10/doc.pdf',
        }),
      });

      const otherUser: any = { id: 99, roles: ['USER'], permissions: [] };
      await expect(service.streamAuthenticated(otherUser, 10)).rejects.toThrow(ForbiddenException);
    });

    it('throws NotFoundException (never SVG) for missing documents/ and inspections/ keys in S3Driver', async () => {
      const driver = new S3Driver({
        bucket: 'test-bucket',
        region: 'auto',
        accessKeyId: 'test-key',
        secretAccessKey: 'test-secret',
        endpoint: 'https://test-account.r2.cloudflarestorage.com',
      });

      for (const privateKey of ['documents/USR-1/2026-10/deed.pdf', 'inspections/USR-1/2026-10/photo.jpg']) {
        const notFoundErr: any = new Error('NoSuchKey');
        notFoundErr.name = 'NoSuchKey';
        notFoundErr.$metadata = { httpStatusCode: 404 };
        jest.spyOn((driver as any).client, 'send').mockRejectedValueOnce(notFoundErr);
        await expect(driver.get(privateKey)).rejects.toThrow(NotFoundException);
      }
    });
  });
});

