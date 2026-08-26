import { Test } from '@nestjs/testing';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { PropertiesService } from './properties.service';
import { DatabaseService } from '../../common/database/database.service';
import { AuditService } from '../../common/audit/audit.service';
import { AuthUser } from '../../common/auth/auth.types';

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
});
