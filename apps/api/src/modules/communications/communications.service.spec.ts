import { Test } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { CommunicationsService } from './communications.service';
import { DatabaseService } from '../../common/database/database.service';
import { AuditService } from '../../common/audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ConversationContextType } from './communications.dto';
import { AuthUser } from '../../common/auth/auth.types';

const testUser: AuthUser = {
  id: 10,
  publicId: 'USR-10',
  email: 'u10@test.com',
  fullName: 'User Ten',
  roles: ['TENANT'],
  permissions: ['conversation.read', 'conversation.send'],
};

describe('CommunicationsService - D-21 contextType & Concurrency Safety', () => {
  let service: CommunicationsService;
  let db: jest.Mocked<Partial<DatabaseService>>;

  beforeEach(async () => {
    db = {
      one: jest.fn(),
      query: jest.fn().mockResolvedValue([]),
      insert: jest.fn().mockResolvedValue(1),
      update: jest.fn().mockResolvedValue(1),
      execute: jest.fn().mockResolvedValue([{ affectedRows: 1 }] as any),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        CommunicationsService,
        { provide: DatabaseService, useValue: db },
        { provide: AuditService, useValue: { record: jest.fn() } },
        { provide: NotificationsService, useValue: { send: jest.fn() } },
      ],
    }).compile();

    service = moduleRef.get(CommunicationsService);
  });

  it('rejects unsupported contextType with BadRequestException (400)', async () => {
    await expect(
      service.getOrCreateConversation('INVALID_TYPE' as any, 123, undefined, undefined, testUser),
    ).rejects.toThrow(BadRequestException);
  });

  it('creates new conversation when not found for valid contextType', async () => {
    (db.one as jest.Mock)
      .mockResolvedValueOnce(null) // conversation lookup returns null
      .mockResolvedValueOnce({ id: 5, title: 'Sample Property', listed_by_user_id: 2, owner_id: 2 }) // property metadata lookup
      .mockResolvedValueOnce({ id: 1, public_id: 'ODB-CNV-2026-000001', context_type: 'PROPERTY', context_id: 5 }); // re-query created row

    const result = await service.getOrCreateConversation(
      ConversationContextType.PROPERTY,
      5,
      'Property Inquiry',
      undefined,
      testUser,
    );

    expect(db.insert).toHaveBeenCalledWith(
      'conversations',
      expect.objectContaining({
        context_type: ConversationContextType.PROPERTY,
        context_id: 5,
      }),
    );
    expect(result.id).toBe(1);
  });

  it('handles race condition on concurrent creation without throwing 500 error', async () => {
    // Initial lookup: not found
    (db.one as jest.Mock).mockResolvedValueOnce(null);
    // Metadata resolution for property 5
    (db.one as jest.Mock).mockResolvedValueOnce({ id: 5, title: 'Sample Property', listed_by_user_id: 2 });

    // DB insert throws ER_DUP_ENTRY from concurrent thread
    const duplicateError: any = new Error("Duplicate entry 'PROPERTY-5' for key 'conversations.uq_conv_context'");
    duplicateError.code = 'ER_DUP_ENTRY';
    (db.insert as jest.Mock).mockRejectedValueOnce(duplicateError);

    // Concurrent lookup returns the row created by the other thread
    (db.one as jest.Mock).mockResolvedValueOnce({
      id: 99,
      public_id: 'ODB-CNV-2026-000099',
      context_type: 'PROPERTY',
      context_id: 5,
    });

    const result = await service.getOrCreateConversation(
      ConversationContextType.PROPERTY,
      5,
      'Property Inquiry',
      undefined,
      testUser,
    );

    expect(result).toBeDefined();
    expect(result.id).toBe(99);
    expect(result.public_id).toBe('ODB-CNV-2026-000099');
  });
});
