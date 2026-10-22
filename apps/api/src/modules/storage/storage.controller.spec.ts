import { Test } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { StorageController } from './storage.controller';
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
});
