import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import * as path from 'path';
import { DatabaseService } from '../../common/database/database.service';
import { AuthUser } from '../../common/auth/auth.types';
import { newPublicId } from '../../common/util/ids';
import { sha256 } from '../../common/util/crypto';

export type DocumentCategory =
  | 'KYC' | 'OWNERSHIP' | 'PROPERTY' | 'AGREEMENT' | 'RECEIPT' | 'INSPECTION'
  | 'INSURANCE' | 'LEGAL' | 'MAINTENANCE' | 'DISPUTE' | 'MARKETING' | 'OTHER';

const ALLOWED = new Map<string, string[]>([
  ['image/jpeg', ['.jpg', '.jpeg']],
  ['image/png', ['.png']],
  ['image/webp', ['.webp']],
  ['image/heic', ['.heic']],
  ['video/mp4', ['.mp4']],
  ['video/quicktime', ['.mov']],
  ['audio/mpeg', ['.mp3']],
  ['audio/mp4', ['.m4a']],
  ['audio/webm', ['.weba']],
  ['application/pdf', ['.pdf']],
]);

const MAX_BYTES: Record<string, number> = { image: 12_000_000, video: 250_000_000, audio: 25_000_000, application: 25_000_000 };

// Magic-number check: extension and declared mime type are both attacker-controlled.
const SIGNATURES: Array<{ mime: string; bytes: number[]; offset: number }> = [
  { mime: 'image/jpeg', bytes: [0xff, 0xd8, 0xff], offset: 0 },
  { mime: 'image/png', bytes: [0x89, 0x50, 0x4e, 0x47], offset: 0 },
  { mime: 'application/pdf', bytes: [0x25, 0x50, 0x44, 0x46], offset: 0 },
  { mime: 'image/webp', bytes: [0x52, 0x49, 0x46, 0x46], offset: 0 },
  { mime: 'video/mp4', bytes: [0x66, 0x74, 0x79, 0x70], offset: 4 },
  { mime: 'video/quicktime', bytes: [0x66, 0x74, 0x79, 0x70], offset: 4 },
];

export interface StoredFile {
  storageKey: string;
  sizeBytes: number;
  checksum: string;
  mimeType: string;
}

interface StorageDriver {
  put(key: string, data: Buffer): Promise<void>;
  get(key: string): Promise<Buffer>;
  remove(key: string): Promise<void>;
}

class LocalDriver implements StorageDriver {
  constructor(private readonly root: string) {}
  private full(key: string) {
    const resolved = path.resolve(this.root, key);
    if (!resolved.startsWith(path.resolve(this.root))) throw new BadRequestException('Invalid file path.');
    return resolved;
  }
  async put(key: string, data: Buffer) {
    const target = this.full(key);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, data, { mode: 0o640 });
  }
  async get(key: string) {
    return fs.readFile(this.full(key));
  }
  async remove(key: string) {
    await fs.rm(this.full(key), { force: true });
  }
}

/** Placeholder so the swap to object storage is a config change, not a rewrite. */
class S3Driver implements StorageDriver {
  async put(): Promise<void> {
    throw new BadRequestException('S3 storage is configured but the adapter is not enabled on this server.');
  }
  async get(): Promise<Buffer> {
    throw new BadRequestException('S3 storage is configured but the adapter is not enabled on this server.');
  }
  async remove(): Promise<void> {
    throw new BadRequestException('S3 storage is configured but the adapter is not enabled on this server.');
  }
}

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly driver: StorageDriver;
  private readonly driverName: 'LOCAL' | 'S3';

  constructor(private readonly config: ConfigService, private readonly db: DatabaseService) {
    this.driverName = this.config.get('storage.driver') === 'S3' ? 'S3' : 'LOCAL';
    this.driver =
      this.driverName === 'S3' ? new S3Driver() : new LocalDriver(this.config.get('storage.localRoot')!);
  }

  async store(file: Express.Multer.File, folder: string): Promise<StoredFile> {
    if (!file?.buffer?.length) throw new BadRequestException('The file is empty.');

    const ext = path.extname(file.originalname).toLowerCase();
    const allowedExts = ALLOWED.get(file.mimetype);
    if (!allowedExts || !allowedExts.includes(ext)) {
      throw new BadRequestException('Upload a JPG, PNG, WEBP, MP4, MOV, M4A or PDF file.');
    }
    const family = file.mimetype.split('/')[0];
    if (file.buffer.length > (MAX_BYTES[family] ?? 10_000_000)) {
      throw new BadRequestException('That file is larger than the limit for this type.');
    }
    if (!this.signatureMatches(file.buffer, file.mimetype)) {
      throw new BadRequestException('The file contents do not match its type.');
    }

    const checksum = sha256(file.buffer);
    const key = `${folder}/${new Date().toISOString().slice(0, 7)}/${randomUUID()}${ext}`;
    await this.driver.put(key, file.buffer);
    return { storageKey: key, sizeBytes: file.buffer.length, checksum, mimeType: file.mimetype };
  }

  /** Registers a stored file in the vault with role-based visibility. */
  async registerDocument(params: {
    user: AuthUser;
    file: StoredFile;
    category: DocumentCategory;
    title: string;
    entityType?: string;
    entityId?: number;
    visibility?: 'PRIVATE' | 'PARTIES' | 'STAFF' | 'PUBLIC';
  }) {
    const publicId = newPublicId();
    const id = await this.db.insert('documents', {
      public_id: publicId,
      owner_user_id: params.user.id,
      category: params.category,
      entity_type: params.entityType ?? null,
      entity_id: params.entityId ?? null,
      title: params.title,
      storage_driver: this.driverName,
      storage_key: params.file.storageKey,
      mime_type: params.file.mimeType,
      size_bytes: params.file.sizeBytes,
      checksum_sha256: params.file.checksum,
      visibility: params.visibility ?? 'PRIVATE',
      scan_status: 'PENDING',
    });
    await this.db.insert('document_access_logs', { document_id: id, user_id: params.user.id, action: 'UPLOAD' });
    return { id, publicId, storageKey: params.file.storageKey };
  }

  async listVault(user: AuthUser, filters: { category?: string; entityType?: string; entityId?: number }) {
    const where = ['d.deleted_at IS NULL'];
    const params: unknown[] = [];
    if (!user.permissions.includes('document.read.any')) {
      where.push('d.owner_user_id = ?');
      params.push(user.id);
    }
    if (filters.category) {
      where.push('d.category = ?');
      params.push(filters.category);
    }
    if (filters.entityType) {
      where.push('d.entity_type = ?');
      params.push(filters.entityType);
    }
    if (filters.entityId) {
      where.push('d.entity_id = ?');
      params.push(filters.entityId);
    }
    return this.db.query(
      `SELECT d.id, d.public_id, d.title, d.category, d.entity_type, d.entity_id, d.mime_type,
              d.size_bytes, d.version, d.scan_status, d.created_at
         FROM documents d WHERE ${where.join(' AND ')} ORDER BY d.created_at DESC LIMIT 200`,
      params,
    );
  }

  /**
   * Short-lived HMAC token instead of a public URL: the file is never reachable
   * from the web root and the link dies with the TTL.
   */
  async signedLink(user: AuthUser, documentId: number): Promise<{ url: string; expiresIn: number }> {
    const doc = await this.assertReadable(user, documentId);
    const ttl = this.config.get<number>('storage.signedUrlTtl')!;
    const expiresAt = Math.floor(Date.now() / 1000) + ttl;
    const signature = this.sign(`${doc.id}.${user.id}.${expiresAt}`);
    return {
      url: `/api/documents/${doc.id}/download?exp=${expiresAt}&sig=${signature}&u=${user.id}`,
      expiresIn: ttl,
    };
  }

  async readSigned(documentId: number, userId: number, exp: number, sig: string) {
    if (exp < Math.floor(Date.now() / 1000)) throw new ForbiddenException('This link expired. Open the document again.');
    if (this.sign(`${documentId}.${userId}.${exp}`) !== sig) throw new ForbiddenException('This link is not valid.');

    const doc = await this.db.one<any>('SELECT * FROM documents WHERE id = ? AND deleted_at IS NULL', [documentId]);
    if (!doc) throw new NotFoundException('Document not found.');
    const buffer = await this.driver.get(doc.storage_key);
    await this.db.insert('document_access_logs', { document_id: documentId, user_id: userId, action: 'DOWNLOAD' });
    return { buffer, mimeType: doc.mime_type, filename: doc.title };
  }

  async assertReadable(user: AuthUser, documentId: number) {
    const doc = await this.db.one<any>('SELECT * FROM documents WHERE id = ? AND deleted_at IS NULL', [documentId]);
    if (!doc) throw new NotFoundException('Document not found.');
    if (doc.owner_user_id === user.id) return doc;
    if (user.permissions.includes('document.read.any')) return doc;
    if (doc.visibility === 'PUBLIC') return doc;

    if (doc.visibility === 'PARTIES' && doc.entity_type === 'tenancy') {
      const party = await this.db.one<any>(
        'SELECT id FROM tenancies WHERE id = ? AND (owner_user_id = ? OR tenant_user_id = ?)',
        [doc.entity_id, user.id, user.id],
      );
      if (party) return doc;
    }
    await this.db.insert('document_access_logs', { document_id: documentId, user_id: user.id, action: 'VIEW' });
    throw new ForbiddenException('You do not have access to this document.');
  }

  private sign(payload: string): string {
    return createHmac('sha256', this.config.get('auth.accessSecret')!).update(payload).digest('hex').slice(0, 32);
  }

  private signatureMatches(buffer: Buffer, mime: string): boolean {
    const rules = SIGNATURES.filter((s) => s.mime === mime);
    if (!rules.length) return true; // types without a stable magic number (heic, some audio)
    return rules.some((rule) => rule.bytes.every((b, i) => buffer[rule.offset + i] === b));
  }
}
