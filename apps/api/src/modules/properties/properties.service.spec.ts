import { Test } from '@nestjs/testing';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { PropertiesService } from './properties.service';
import { DatabaseService } from '../../common/database/database.service';
import { AuditService } from '../../common/audit/audit.service';
import { AuthUser } from '../../common/auth/auth.types';

import { NotificationsService } from '../notifications/notifications.service';

const owner: AuthUser = {
  id: 10, publicId: 'P1', email: 'o@example.com', fullName: 'Owner',
  roles: ['OWNER'], permissions: ['property.create', 'property.update.own'],
};
const stranger: AuthUser = { ...owner, id: 99, permissions: [] };
const verifier: AuthUser = {
  ...owner, id: 5, roles: ['KYC_TEAM'], permissions: ['property.moderate', 'property.read.private'],
};

describe('PropertiesService', () => {
  let service: PropertiesService;
  let db: jest.Mocked<Partial<DatabaseService>>;

  beforeEach(async () => {
    db = {
      one: jest.fn(),
      query: jest.fn().mockResolvedValue([]),
      insert: jest.fn().mockResolvedValue(1),
      update: jest.fn().mockResolvedValue(1),
      execute: jest.fn().mockResolvedValue({ affectedRows: 1, insertId: 1 } as any),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        PropertiesService,
        { provide: DatabaseService, useValue: db },
        { provide: AuditService, useValue: { record: jest.fn() } },
        { provide: NotificationsService, useValue: { send: jest.fn(), sendMany: jest.fn() } },
      ],
    }).compile();
    service = moduleRef.get(PropertiesService);
  });

  it('hides the exact address from anonymous viewers', async () => {
    (db.one as jest.Mock).mockResolvedValue({
      id: 1, public_id: 'X', slug: 's', status: 'ACTIVE', listed_by_user_id: 10,
      address_line1: '12 Rose Villa', locality: 'Gachibowli', city: 'Hyderabad',
    });
    const result = await service.findBySlugOrPublicId('s');
    expect(result.addressLine1).toBeUndefined();
    expect(result.locality).toBe('Gachibowli');
  });

  it('shows the address to the lister', async () => {
    (db.one as jest.Mock).mockResolvedValue({
      id: 1, public_id: 'X', slug: 's', status: 'ACTIVE', listed_by_user_id: 10,
      address_line1: '12 Rose Villa', locality: 'Gachibowli', city: 'Hyderabad',
    });
    const result = await service.findBySlugOrPublicId('s', owner);
    expect(result.addressLine1).toBe('12 Rose Villa');
  });

  it('refuses edits from an account that does not own the listing', async () => {
    (db.one as jest.Mock).mockResolvedValue({ id: 1, listed_by_user_id: 10, status: 'DRAFT' });
    await expect(service.update(stranger, 1, {} as any)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('blocks property creation when email or mobile OTP verification is incomplete', async () => {
    const unverifiedOwner: AuthUser = {
      ...owner,
      emailVerified: false,
      phoneVerified: true,
      contactVerified: false,
    };
    await expect(service.create(unverifiedOwner, {} as any)).rejects.toThrow(
      /Verify your email address via OTP/i,
    );
  });

  it('blocks submission until the listing is complete', async () => {
    (db.one as jest.Mock).mockResolvedValue({
      id: 1, listed_by_user_id: 10, status: 'DRAFT', title: 'Flat', listing_type: 'RENT',
      address_line1: 'x', locality: 'y', city: 'z', pincode: '500032', rent_amount: null, description: 'short',
    });
    await expect(service.submitForVerification(owner, 1)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('requires a reason when a listing is rejected', async () => {
    (db.one as jest.Mock).mockResolvedValue({ id: 1, status: 'PENDING_VERIFICATION' });
    await expect(service.moderate(verifier, 1, 'REJECT')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuses approval of a listing that is still in DRAFT status (D-08)', async () => {
    (db.one as jest.Mock).mockResolvedValue({ id: 1, status: 'DRAFT' });
    await expect(service.moderate(verifier, 1, 'APPROVE')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('approving a PENDING_VERIFICATION listing activates property without auto-verifying checks (D-09)', async () => {
    (db.one as jest.Mock).mockResolvedValue({ id: 1, status: 'PENDING_VERIFICATION', published_at: null });
    const result = await service.moderate(verifier, 1, 'APPROVE');
    expect(result.status).toBe('ACTIVE');
    expect(db.update).toHaveBeenCalledWith('properties', 1, expect.objectContaining({ status: 'ACTIVE' }));
    // Verify that property_verifications table was NOT auto-stamped with VERIFIED
    expect(db.execute).not.toHaveBeenCalledWith(expect.stringContaining('UPDATE property_verifications'), expect.anything());
  });

  describe('attachImage - D-18 storage key validation', () => {
    beforeEach(() => {
      (db.one as jest.Mock).mockImplementation((sql: string) => {
        if (sql.includes('SELECT * FROM properties')) {
          return Promise.resolve({ id: 1, listed_by_user_id: 10, status: 'DRAFT' });
        }
        if (sql.includes('SELECT COUNT(*)')) {
          return Promise.resolve({ c: 0 });
        }
        return Promise.resolve(null);
      });
    });

    it('rejects attachment of private vault or kyc documents with ForbiddenException', async () => {
      await expect(
        service.attachImage(owner, 1, 'vault/USR-VICTIM/kyc/passport.pdf'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects attachment outside properties/ namespace with BadRequestException', async () => {
      await expect(
        service.attachImage(owner, 1, 'misc/other/image.jpg'),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects cross-user property images with ForbiddenException', async () => {
      // owner.publicId is 'P1', attempting to attach 'properties/OTHER_USER/photo.jpg'
      await expect(
        service.attachImage(owner, 1, 'properties/OTHER_USER/photo.jpg'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('allows attachment of authorized image key belonging to owner prefix', async () => {
      const res = await service.attachImage(owner, 1, 'properties/P1/photo.jpg');
      expect(res.storageKey).toBe('properties/P1/photo.jpg');
      expect(db.insert).toHaveBeenCalledWith(
        'property_images',
        expect.objectContaining({ storage_key: 'properties/P1/photo.jpg' }),
      );
    });
  });
});

