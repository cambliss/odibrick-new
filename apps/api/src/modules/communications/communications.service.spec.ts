import { Test } from '@nestjs/testing';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
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

  it('includes tenant, owner, and listing agent without duplicate participants when creating an ENQUIRY conversation', async () => {
    (db.one as jest.Mock)
      .mockResolvedValueOnce(null) // existing conversation lookup
      .mockResolvedValueOnce({
        id: 42,
        user_id: 10, // tenant
        prop_id: 300,
        prop_title: '1 BHK Studio in Viman Nagar',
        owner_user_id: 20, // property owner
        assigned_user_id: 30, // assigned agent
        assigned_agent_id: 30, // same agent
        listed_by_user_id: 30, // listing agent (duplicate of assigned_user_id)
      })
      .mockResolvedValueOnce({
        id: 701,
        public_id: 'ODB-CNV-2026-000701',
        context_type: 'ENQUIRY',
        context_id: 42,
      });

    const result = await service.getOrCreateConversation(
      ConversationContextType.ENQUIRY,
      42,
      undefined,
      undefined,
      testUser,
    );

    expect(result.id).toBe(701);
    const participantCalls = (db.execute as jest.Mock).mock.calls.filter(([sql]) =>
      typeof sql === 'string' && sql.includes('INSERT IGNORE INTO conversation_participants'),
    );
    const addedUserIds = participantCalls.map(([, params]) => params[1]);
    expect(addedUserIds).toEqual([10, 20, 30]);
    expect(new Set(addedUserIds).size).toBe(addedUserIds.length);
  });

  it('grants access to the listing agent and denies unrelated users for an ENQUIRY conversation', async () => {
    const listingAgent: AuthUser = {
      id: 30,
      publicId: 'USR-30',
      email: 'agent@test.com',
      fullName: 'Compass Realty 3',
      roles: ['AGENT'],
      permissions: ['conversation.read', 'conversation.send'],
    };
    const unrelatedUser: AuthUser = {
      id: 99,
      publicId: 'USR-99',
      email: 'stranger@test.com',
      fullName: 'Unrelated User',
      roles: ['TENANT'],
      permissions: ['conversation.read'],
    };

    const enquiryRow = {
      id: 42,
      user_id: 10,
      prop_id: 300,
      prop_title: '1 BHK Studio in Viman Nagar',
      owner_user_id: 20,
      assigned_user_id: null,
      assigned_agent_id: null,
      listed_by_user_id: 30,
    };
    const convRow = {
      id: 701,
      context_type: ConversationContextType.ENQUIRY,
      context_id: 42,
      created_by: 10,
    };

    // Listing agent authorized via listed_by_user_id
    (db.one as jest.Mock)
      .mockResolvedValueOnce(convRow)
      .mockResolvedValueOnce(null) // not yet in conversation_participants
      .mockResolvedValueOnce(enquiryRow);

    const allowed = await service.assertConversationAccess(listingAgent, 701);
    expect(allowed.id).toBe(701);

    // Unrelated user denied with ForbiddenException
    (db.one as jest.Mock)
      .mockResolvedValueOnce(convRow)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(enquiryRow);

    await expect(service.assertConversationAccess(unrelatedUser, 701)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('does not duplicate the initial message when an existing ENQUIRY conversation already has messages or loses a concurrent claim', async () => {
    const existingConv = {
      id: 59,
      public_id: 'ODB-CNV-2026-000059',
      context_type: ConversationContextType.ENQUIRY,
      context_id: 171,
      status: 'ACTIVE',
    };
    const sendSpy = jest.spyOn(service, 'sendMessage').mockResolvedValue({ id: 999 } as any);

    (db.one as jest.Mock)
      .mockResolvedValueOnce(existingConv) // existing conversation lookup
      .mockResolvedValueOnce({
        id: 171,
        tenant_user_id: 10,
        prop_id: 300,
        prop_title: '1 BHK Studio in Viman Nagar',
        city: 'Pune',
        owner_user_id: 20,
        listed_by_user_id: 30,
      }); // resolveContextMetadata
    (db.execute as jest.Mock).mockImplementation(async (sql: string) => {
      if (sql.includes('UPDATE conversations')) {
        return { affectedRows: 0 } as any;
      }
      return { affectedRows: 1 } as any;
    });

    const result = await service.getOrCreateConversation(
      ConversationContextType.ENQUIRY,
      171,
      undefined,
      'Original enquiry message',
      testUser,
    );

    expect(result.id).toBe(59);
    expect(sendSpy).not.toHaveBeenCalled();
  });

  it('seeds the initial message exactly once when an existing ENQUIRY conversation has zero messages', async () => {
    const existingEmptyConv = {
      id: 59,
      public_id: 'ODB-CNV-2026-000059',
      context_type: ConversationContextType.ENQUIRY,
      context_id: 171,
      status: 'OPEN',
    };
    const sendSpy = jest.spyOn(service, 'sendMessage').mockResolvedValue({ id: 802 } as any);

    (db.one as jest.Mock)
      .mockResolvedValueOnce(existingEmptyConv) // existing conversation lookup
      .mockResolvedValueOnce({
        id: 171,
        tenant_user_id: 10,
        prop_id: 300,
        prop_title: '1 BHK Studio in Viman Nagar',
        city: 'Pune',
        owner_user_id: 20,
        listed_by_user_id: 30,
      }); // resolveContextMetadata
    (db.execute as jest.Mock).mockResolvedValue({ affectedRows: 1 } as any);

    const result = await service.getOrCreateConversation(
      ConversationContextType.ENQUIRY,
      171,
      undefined,
      'Original enquiry message',
      testUser,
    );

    expect(result.id).toBe(59);
    expect(sendSpy).toHaveBeenCalledTimes(1);
    expect(sendSpy).toHaveBeenCalledWith(testUser, 59, { body: 'Original enquiry message' });
  });

  it('does not misattribute the initial ENQUIRY message when a non-tenant party opens an empty conversation', async () => {
    const listingAgent: AuthUser = {
      id: 30,
      publicId: 'USR-30',
      email: 'agent@test.com',
      fullName: 'Compass Realty 3',
      roles: ['AGENT'],
      permissions: ['conversation.read', 'conversation.send'],
    };
    const existingEmptyConv = {
      id: 59,
      public_id: 'ODB-CNV-2026-000059',
      context_type: ConversationContextType.ENQUIRY,
      context_id: 171,
      status: 'OPEN',
    };
    const sendSpy = jest.spyOn(service, 'sendMessage').mockResolvedValue({ id: 803 } as any);

    (db.one as jest.Mock)
      .mockResolvedValueOnce(existingEmptyConv)
      .mockResolvedValueOnce({
        id: 171,
        tenant_user_id: 10,
        prop_id: 300,
        prop_title: '1 BHK Studio in Viman Nagar',
        city: 'Pune',
        owner_user_id: 20,
        listed_by_user_id: 30,
      });

    await service.getOrCreateConversation(
      ConversationContextType.ENQUIRY,
      171,
      undefined,
      'Original enquiry message',
      listingAgent,
    );

    expect(sendSpy).not.toHaveBeenCalled();
    const updateCalls = (db.execute as jest.Mock).mock.calls.filter(([sql]) =>
      typeof sql === 'string' && sql.includes('UPDATE conversations'),
    );
    expect(updateCalls).toHaveLength(0);
  });
});
