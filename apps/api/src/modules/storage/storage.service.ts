import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import * as fsSync from 'fs';
import * as path from 'path';
import { Request } from 'express';
import { DatabaseService } from '../../common/database/database.service';
import { AuditService } from '../../common/audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuthUser } from '../../common/auth/auth.types';
import { newPublicId } from '../../common/util/ids';
import { sha256 } from '../../common/util/crypto';
import { pageParams, paginate } from '../../common/util/pagination';
import { RejectDocumentDto, RequestReplacementDto, VerifyDocumentDto } from './storage.dto';

export type DocumentCategory =
  | 'KYC'
  | 'OWNERSHIP'
  | 'PROPERTY'
  | 'AGREEMENT'
  | 'RECEIPT'
  | 'INSPECTION'
  | 'INSURANCE'
  | 'LEGAL'
  | 'MAINTENANCE'
  | 'DISPUTE'
  | 'MARKETING'
  | 'OTHER';

const ALLOWED = new Map<string, string[]>([
  ['image/jpeg', ['.jpg', '.jpeg', '.jfif', '.jfi', '.jpe']],
  ['image/png', ['.png']],
  ['image/webp', ['.webp']],
  ['image/heic', ['.heic']],
  ['image/heif', ['.heif']],
  ['image/avif', ['.avif']],
  ['image/gif', ['.gif']],
  ['video/mp4', ['.mp4']],
  ['video/quicktime', ['.mov']],
  ['audio/mpeg', ['.mp3']],
  ['audio/mp4', ['.m4a']],
  ['audio/webm', ['.weba']],
  ['application/pdf', ['.pdf']],
]);

const MAX_BYTES: Record<string, number> = {
  image: 10_485_760, // 10 MB
  video: 250_000_000,
  audio: 25_000_000,
  application: 25_000_000,
};

export function detectFileSignature(buffer: Buffer): { mime: string; canonicalExt: string } | null {
  if (!buffer || buffer.length < 4) return null;

  // JPEG / JFIF: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { mime: 'image/jpeg', canonicalExt: '.jpg' };
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return { mime: 'image/png', canonicalExt: '.png' };
  }

  // WebP: RIFF (bytes 0-3) + WEBP (bytes 8-11)
  if (
    buffer.length >= 12 &&
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return { mime: 'image/webp', canonicalExt: '.webp' };
  }

  // GIF: GIF87a or GIF89a
  if (
    buffer.length >= 6 &&
    buffer[0] === 0x47 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x38 &&
    (buffer[4] === 0x37 || buffer[4] === 0x39) &&
    buffer[5] === 0x61
  ) {
    return { mime: 'image/gif', canonicalExt: '.gif' };
  }

  // ISO Base Media File Format (ftyp at bytes 4-7): AVIF, HEIC, HEIF, MP4, MOV
  if (
    buffer.length >= 12 &&
    buffer[4] === 0x66 &&
    buffer[5] === 0x74 &&
    buffer[6] === 0x79 &&
    buffer[7] === 0x70
  ) {
    const brand = buffer.slice(8, 12).toString('ascii').toLowerCase();
    if (brand === 'avif' || brand === 'avis') {
      return { mime: 'image/avif', canonicalExt: '.avif' };
    }
    if (['heic', 'heix', 'hevc', 'hevx'].includes(brand)) {
      return { mime: 'image/heic', canonicalExt: '.heic' };
    }
    if (['mif1', 'msf1', 'heif'].includes(brand)) {
      return { mime: 'image/heif', canonicalExt: '.heif' };
    }
    if (['mp41', 'mp42', 'isom', 'iso2', 'avc1'].includes(brand)) {
      return { mime: 'video/mp4', canonicalExt: '.mp4' };
    }
    if (brand === 'qt  ') {
      return { mime: 'video/quicktime', canonicalExt: '.mov' };
    }
  }

  // PDF: %PDF (25 50 44 46)
  if (
    buffer[0] === 0x25 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x44 &&
    buffer[3] === 0x46
  ) {
    return { mime: 'application/pdf', canonicalExt: '.pdf' };
  }

  return null;
}

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
  private readonly roots: string[];

  constructor(root: string) {
    const primary = path.resolve(root);
    const candidates = [
      primary,
      path.resolve(process.cwd(), 'storage'),
      path.resolve(process.cwd(), '../storage'),
      path.resolve(process.cwd(), 'apps/api/storage'),
      path.resolve(__dirname, '../../../../storage'),
      path.resolve(__dirname, '../../../../../storage'),
    ];
    this.roots = Array.from(new Set(candidates));
  }

  private full(key: string): string {
    const sanitized = key.replace(/\.\./g, '').replace(/^[/\\]+/, '');
    for (const r of this.roots) {
      const candidate = path.resolve(r, sanitized);
      if (fsSync.existsSync(candidate)) {
        return candidate;
      }
    }
    return path.resolve(this.roots[0], sanitized);
  }

  async put(key: string, data: Buffer) {
    const sanitized = key.replace(/\.\./g, '').replace(/^[/\\]+/, '');
    const target = path.resolve(this.roots[0], sanitized);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, data, { mode: 0o640 });
  }

  async get(key: string): Promise<Buffer> {
    const target = this.full(key);
    try {
      return await fs.readFile(target);
    } catch {
      // If a property image is missing on disk, dynamically generate an SVG image
      if (
        key.startsWith('demo/properties') ||
        key.startsWith('properties') ||
        key.startsWith('prop') ||
        key.includes('photo-') ||
        key.startsWith('img_')
      ) {
        const fallbackSvg = this.generateFallbackSvg(key);
        try {
          await fs.mkdir(path.dirname(target), { recursive: true });
          await fs.writeFile(target, Buffer.from(fallbackSvg, 'utf8'));
        } catch {
          // ignore cache write error
        }
        return Buffer.from(fallbackSvg, 'utf8');
      }
      throw new NotFoundException('File not found in storage.');
    }
  }

  async remove(key: string) {
    const target = this.full(key);
    await fs.rm(target, { force: true });
  }

  private generateFallbackSvg(key: string): string {
    const tag = key.toUpperCase();
    let title = 'Property Photograph';
    let themeColor = '#1d4337';
    let accentColor = '#ca8a04';

    if (tag.includes('KITCHEN')) {
      themeColor = '#1e3a5f';
      accentColor = '#f59e0b';
      title = 'Modular Kitchen';
    } else if (tag.includes('BEDROOM')) {
      themeColor = '#3b2d54';
      accentColor = '#ec4899';
      title = 'Master Bedroom';
    } else if (tag.includes('BALCONY')) {
      themeColor = '#155e75';
      accentColor = '#10b981';
      title = 'Balcony View';
    } else {
      themeColor = '#1e293b';
      accentColor = '#0ea5e9';
      title = 'Living Room & Lounge';
    }

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600" width="800" height="600">
      <defs>
        <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="${themeColor}"/>
          <stop offset="50%" stop-color="#0f172a"/>
          <stop offset="100%" stop-color="#020617"/>
        </linearGradient>
      </defs>
      <rect width="800" height="600" fill="url(#bg)"/>
      <g transform="translate(80, 60)" opacity="0.95">
        <polygon points="0,400 640,400 560,320 80,320" fill="#ffffff" fill-opacity="0.04"/>
        <rect x="80" y="40" width="480" height="280" fill="#ffffff" fill-opacity="0.02" stroke="#ffffff" stroke-opacity="0.12" stroke-width="1.5" rx="4"/>
        <rect x="130" y="70" width="160" height="180" fill="#ffffff" fill-opacity="0.08" stroke="${accentColor}" stroke-opacity="0.5" stroke-width="2" rx="2"/>
        <rect x="340" y="90" width="170" height="120" fill="${accentColor}" fill-opacity="0.15" stroke="#ffffff" stroke-opacity="0.2" stroke-width="1.5" rx="2"/>
        <circle cx="425" cy="150" r="35" fill="${accentColor}" fill-opacity="0.3"/>
      </g>
      <g transform="translate(400, 480)" text-anchor="middle">
        <rect x="-170" y="-45" width="340" height="75" rx="10" fill="#0f172a" fill-opacity="0.9" stroke="${accentColor}" stroke-width="1.5"/>
        <text y="-12" fill="#ffffff" font-family="system-ui, sans-serif" font-size="20" font-weight="600">${title}</text>
        <text y="18" fill="${accentColor}" font-family="monospace" font-size="12" font-weight="600">ODIBRICK VERIFIED MEDIA</text>
      </g>
      <g transform="translate(40, 40)">
        <rect width="120" height="30" rx="6" fill="#000000" fill-opacity="0.65" stroke="#ffffff" stroke-opacity="0.2" stroke-width="1"/>
        <text x="60" y="20" text-anchor="middle" fill="#ffffff" font-family="system-ui, sans-serif" font-size="12" font-weight="700">ODIBRICK</text>
      </g>
    </svg>`;
  }
}


class S3Driver implements StorageDriver {
  async put(): Promise<void> {
    throw new BadRequestException(
      'S3 storage is configured but the adapter is not enabled on this server.',
    );
  }
  async get(): Promise<Buffer> {
    throw new BadRequestException(
      'S3 storage is configured but the adapter is not enabled on this server.',
    );
  }
  async remove(): Promise<void> {
    throw new BadRequestException(
      'S3 storage is configured but the adapter is not enabled on this server.',
    );
  }
}

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly driver: StorageDriver;
  private readonly driverName: 'LOCAL' | 'S3';

  constructor(
    private readonly config: ConfigService,
    private readonly db: DatabaseService,
    private readonly audit: AuditService,
    private readonly notify: NotificationsService,
  ) {
    this.driverName = this.config.get('storage.driver') === 'S3' ? 'S3' : 'LOCAL';
    this.driver =
      this.driverName === 'S3'
        ? new S3Driver()
        : new LocalDriver(this.config.get('storage.localRoot')!);
  }

  isStaff(user: AuthUser): boolean {
    if (!user) return false;
    return (
      user.roles?.some((r) =>
        [
          'SUPER_ADMIN',
          'ADMIN',
          'LEGAL_TEAM',
          'KYC_TEAM',
          'PROPERTY_MANAGER',
          'SUPPORT_TEAM',
        ].includes(r),
      ) ||
      user.permissions?.some((p) =>
        [
          'document.internal_note',
          'document.verify',
          'document.manage',
          'compliance.manage',
          'document.read.any',
        ].includes(p),
      )
    );
  }

  async store(file: Express.Multer.File, folder: string): Promise<StoredFile> {
    if (!file?.buffer?.length) throw new BadRequestException('The file is empty.');

    const rawExt = path.extname(file.originalname).toLowerCase();
    const isPropertyUpload = folder.includes('properties');

    // 10 MB limit check for property images
    const maxBytes = isPropertyUpload ? 10_485_760 : (MAX_BYTES[file.mimetype?.split('/')[0]] ?? 10_485_760);
    if (file.buffer.length > maxBytes) {
      throw new BadRequestException('This image exceeds the 10 MB limit.');
    }

    // Inspect actual file binary signature (magic bytes)
    const detected = detectFileSignature(file.buffer);
    if (!detected) {
      throw new BadRequestException(
        'This file is not a valid image. Please upload a valid JPG, JPEG, JFIF, PNG, WebP, HEIC, HEIF or AVIF image.',
      );
    }

    // Property uploads must be valid raster images (SVG and non-images are strictly disallowed)
    if (isPropertyUpload && !detected.mime.startsWith('image/')) {
      throw new BadRequestException(
        'Unsupported photo format. Please upload JPG, JPEG, JFIF, PNG, WebP, HEIC, HEIF or AVIF.',
      );
    }

    const allowedExts = ALLOWED.get(detected.mime);
    if (!allowedExts) {
      throw new BadRequestException(
        'Unsupported photo format. Please upload JPG, JPEG, JFIF, PNG, WebP, HEIC, HEIF or AVIF.',
      );
    }

    // Determine normalized extension: if filename has .jfif or .jifi or valid .jpg, use canonical or valid ext
    let normalizedExt = rawExt;
    if (!allowedExts.includes(rawExt)) {
      normalizedExt = detected.canonicalExt;
    }

    const checksum = sha256(file.buffer);
    const key = `${folder}/${new Date().toISOString().slice(0, 7)}/${randomUUID()}${normalizedExt}`;
    await this.driver.put(key, file.buffer);
    return { storageKey: key, sizeBytes: file.buffer.length, checksum, mimeType: detected.mime };
  }

  /** Registers a stored file in the vault with governance context and versioning. */
  async registerDocument(
    params: {
      user: AuthUser;
      file: StoredFile;
      category: DocumentCategory;
      documentType?: string;
      title: string;
      contextType?: string;
      contextId?: number;
      visibility?: 'PRIVATE' | 'PARTIES' | 'STAFF' | 'PUBLIC';
      expiryDate?: string;
      verificationStatus?: string;
    },
    req?: Request,
  ) {
    const publicId = newPublicId();
    const id = await this.db.insert('documents', {
      public_id: publicId,
      owner_user_id: params.user.id,
      uploaded_by: params.user.id,
      category: params.category,
      document_type: params.documentType ?? 'OTHER',
      entity_type: params.contextType ? params.contextType.toLowerCase() : null,
      entity_id: params.contextId ?? null,
      context_type: params.contextType ? params.contextType.toUpperCase() : null,
      context_id: params.contextId ?? null,
      title: params.title,
      storage_driver: this.driverName,
      storage_key: params.file.storageKey,
      mime_type: params.file.mimeType,
      size_bytes: params.file.sizeBytes,
      checksum_sha256: params.file.checksum,
      version: 1,
      is_active: 1,
      visibility: params.visibility ?? 'PRIVATE',
      verification_status: params.verificationStatus ?? 'UPLOADED',
      expiry_date: params.expiryDate ?? null,
      scan_status: 'PENDING',
    });

    await this.db.insert('document_access_logs', {
      document_id: id,
      user_id: params.user.id,
      action: 'UPLOAD',
    });

    await this.audit.record({
      actor: params.user,
      action: 'document.uploaded',
      objectType: 'document',
      objectId: id,
      metadata: {
        category: params.category,
        documentType: params.documentType,
        contextType: params.contextType,
        contextId: params.contextId,
        title: params.title,
      },
      req,
    });

    return {
      id,
      publicId,
      title: params.title,
      category: params.category,
      documentType: params.documentType ?? 'OTHER',
      verificationStatus: params.verificationStatus ?? 'UPLOADED',
      storageKey: params.file.storageKey,
    };
  }

  /** Creates a new version (v2, v3) of an existing document and supersedes the old one. */
  async createVersion(
    user: AuthUser,
    originalDocId: number,
    file: Express.Multer.File,
    params: { title?: string; expiryDate?: string },
    req?: Request,
  ) {
    const original = await this.assertWritable(user, originalDocId);
    const stored = await this.store(
      file,
      `vault/${user.publicId}/${original.category.toLowerCase()}`,
    );
    const nextVersion = (original.version || 1) + 1;
    const publicId = newPublicId();

    const newId = await this.db.insert('documents', {
      public_id: publicId,
      owner_user_id: original.owner_user_id,
      uploaded_by: user.id,
      category: original.category,
      document_type: original.document_type,
      entity_type: original.entity_type,
      entity_id: original.entity_id,
      context_type: original.context_type,
      context_id: original.context_id,
      title: params.title ?? original.title,
      storage_driver: this.driverName,
      storage_key: stored.storageKey,
      mime_type: stored.mimeType,
      size_bytes: stored.sizeBytes,
      checksum_sha256: stored.checksum,
      version: nextVersion,
      parent_id: original.id,
      is_active: 1,
      visibility: original.visibility,
      verification_status: 'UNDER_REVIEW',
      expiry_date: params.expiryDate ?? original.expiry_date,
      scan_status: 'PENDING',
    });

    // Mark previous version as REPLACED and inactive
    await this.db.execute(
      "UPDATE documents SET verification_status = 'REPLACED', is_active = 0 WHERE id = ?",
      [original.id],
    );

    await this.db.insert('document_access_logs', {
      document_id: newId,
      user_id: user.id,
      action: 'UPLOAD',
    });

    await this.audit.record({
      actor: user,
      action: 'document.version_created',
      objectType: 'document',
      objectId: newId,
      metadata: {
        originalDocumentId: original.id,
        version: nextVersion,
        title: params.title ?? original.title,
      },
      req,
    });

    await this.notify.send(original.owner_user_id, 'DOCUMENT_REPLACED', {
      title: 'New document version submitted',
      body: `Version ${nextVersion} of ${params.title ?? original.title} has been submitted for review.`,
      severity: 'INFO',
      actionUrl: `/dashboard/documents`,
    });

    return {
      id: newId,
      publicId,
      version: nextVersion,
      previousId: original.id,
      verificationStatus: 'UNDER_REVIEW',
    };
  }

  /** Retrieve single document with robust privacy and stripping of internal notes for non-staff. */
  async getDocument(user: AuthUser, documentId: number) {
    const doc = await this.assertReadable(user, documentId);
    const staff = this.isStaff(user);

    const fullDoc = await this.db.one<any>(
      `SELECT d.*, u.full_name AS owner_name, u.email AS owner_email,
              v.full_name AS verifier_name
         FROM documents d
         LEFT JOIN users u ON u.id = d.owner_user_id
         LEFT JOIN users v ON v.id = d.verified_by
        WHERE d.id = ?`,
      [documentId],
    );

    if (!fullDoc) throw new NotFoundException('Document not found.');

    if (!staff) {
      delete fullDoc.internal_notes;
      delete fullDoc.storage_key;
    }

    return fullDoc;
  }

  /** List documents with full contextual filtering and pagination. */
  async listVault(
    user: AuthUser,
    filters: {
      category?: string;
      documentType?: string;
      contextType?: string;
      contextId?: number;
      verificationStatus?: string;
      ownerUserId?: number;
      search?: string;
      onlyActive?: boolean;
      page?: number;
      perPage?: number;
    },
  ) {
    const staff = this.isStaff(user);
    const where = ['d.deleted_at IS NULL'];
    const params: unknown[] = [];

    if (!user.permissions.includes('document.read.any')) {
      // Non-management user: see own documents OR documents in properties/tenancies they participate in
      where.push(
        `(d.owner_user_id = ? OR d.uploaded_by = ? OR d.visibility = 'PUBLIC' OR (
          d.visibility = 'PARTIES' AND d.context_type = 'TENANCY' AND EXISTS (
            SELECT 1 FROM tenancies t WHERE t.id = d.context_id AND (t.owner_user_id = ? OR t.tenant_user_id = ?)
          )
        ) OR (
          d.context_type = 'PROPERTY' AND EXISTS (
            SELECT 1 FROM properties p WHERE p.id = d.context_id AND p.owner_id = ?
          )
        ))`,
      );
      params.push(user.id, user.id, user.id, user.id, user.id);
    } else if (filters.ownerUserId) {
      where.push('d.owner_user_id = ?');
      params.push(filters.ownerUserId);
    }

    if (filters.category) {
      where.push('d.category = ?');
      params.push(filters.category);
    }
    if (filters.documentType) {
      where.push('d.document_type = ?');
      params.push(filters.documentType);
    }
    if (filters.contextType) {
      where.push('(d.context_type = ? OR d.entity_type = ?)');
      params.push(filters.contextType.toUpperCase(), filters.contextType.toLowerCase());
    }
    if (filters.contextId) {
      where.push('(d.context_id = ? OR d.entity_id = ?)');
      params.push(filters.contextId, filters.contextId);
    }
    if (filters.verificationStatus) {
      where.push('d.verification_status = ?');
      params.push(filters.verificationStatus.toUpperCase());
    }
    if (filters.onlyActive !== false) {
      where.push('d.is_active = 1');
    }
    if (filters.search) {
      where.push('(d.title LIKE ? OR d.public_id LIKE ? OR d.document_type LIKE ?)');
      params.push(`%${filters.search}%`, `%${filters.search}%`, `%${filters.search}%`);
    }

    const { page: p, perPage: pp, offset } = pageParams(filters.page, filters.perPage);

    const totalRow = await this.db.one<{ total: number }>(
      `SELECT COUNT(*) AS total FROM documents d WHERE ${where.join(' AND ')}`,
      params,
    );

    const rows = await this.db.query(
      `SELECT d.id, d.public_id, d.title, d.category, d.document_type, d.context_type, d.context_id,
              d.entity_type, d.entity_id, d.mime_type, d.size_bytes, d.version, d.parent_id,
              d.is_active, d.verification_status, d.verified_by, d.verified_at, d.rejection_reason,
              ${staff ? 'd.internal_notes,' : ''}
              d.expiry_date, d.created_at, d.updated_at,
              u.id AS owner_user_id, u.full_name AS owner_name, u.email AS owner_email
         FROM documents d
         LEFT JOIN users u ON u.id = d.owner_user_id
        WHERE ${where.join(' AND ')}
        ORDER BY d.created_at DESC LIMIT ? OFFSET ?`,
      [...params, pp, offset],
    );

    return paginate(rows, totalRow?.total ?? 0, p, pp);
  }

  /** Submit document for Management/Verifier review */
  async submitForReview(user: AuthUser, documentId: number, req?: Request) {
    const doc = await this.assertWritable(user, documentId);
    if (doc.verification_status === 'VERIFIED') {
      throw new BadRequestException('This document is already verified.');
    }

    await this.db.execute(
      "UPDATE documents SET verification_status = 'UNDER_REVIEW', updated_at = NOW() WHERE id = ?",
      [documentId],
    );

    await this.audit.record({
      actor: user,
      action: 'document.review_started',
      objectType: 'document',
      objectId: documentId,
      metadata: { title: doc.title, documentType: doc.document_type },
      req,
    });

    await this.notify.send(doc.owner_user_id, 'DOCUMENT_UNDER_REVIEW', {
      title: 'Document under review',
      body: `Your document "${doc.title}" has been submitted for compliance verification.`,
      severity: 'INFO',
      actionUrl: '/dashboard/documents',
    });

    return { id: documentId, verificationStatus: 'UNDER_REVIEW' };
  }

  /** Verify document (Management / Authorized Verifier only) */
  async verifyDocument(user: AuthUser, documentId: number, dto: VerifyDocumentDto, req?: Request) {
    const doc = await this.db.one<any>(
      'SELECT * FROM documents WHERE id = ? AND deleted_at IS NULL',
      [documentId],
    );
    if (!doc) throw new NotFoundException('Document not found.');

    await this.db.update('documents', documentId, {
      verification_status: 'VERIFIED',
      verified_by: user.id,
      verified_at: new Date(),
      rejection_reason: null,
      internal_notes: dto.internalNotes ?? doc.internal_notes,
    });

    await this.audit.record({
      actor: user,
      action: 'document.verified',
      objectType: 'document',
      objectId: documentId,
      metadata: { title: doc.title, documentType: doc.document_type },
      req,
    });

    await this.notify.send(doc.owner_user_id, 'DOCUMENT_VERIFIED', {
      title: 'Document verified',
      body: `Your document "${doc.title}" has been verified and approved.`,
      severity: 'INFO',
      actionUrl: '/dashboard/documents',
    });

    return { id: documentId, verificationStatus: 'VERIFIED', verifiedAt: new Date() };
  }

  /** Reject document with required rejection reason */
  async rejectDocument(user: AuthUser, documentId: number, dto: RejectDocumentDto, req?: Request) {
    const doc = await this.db.one<any>(
      'SELECT * FROM documents WHERE id = ? AND deleted_at IS NULL',
      [documentId],
    );
    if (!doc) throw new NotFoundException('Document not found.');
    if (!dto.reason || dto.reason.trim().length < 3) {
      throw new BadRequestException('A clear rejection reason is required.');
    }

    await this.db.update('documents', documentId, {
      verification_status: 'REJECTED',
      verified_by: user.id,
      verified_at: new Date(),
      rejection_reason: dto.reason.trim(),
      internal_notes: dto.internalNotes ?? doc.internal_notes,
    });

    await this.audit.record({
      actor: user,
      action: 'document.rejected',
      objectType: 'document',
      objectId: documentId,
      metadata: {
        title: doc.title,
        documentType: doc.document_type,
        reason: dto.reason.trim(),
      },
      req,
    });

    await this.notify.send(doc.owner_user_id, 'DOCUMENT_REJECTED', {
      title: 'Document rejected',
      body: `Your document "${doc.title}" was rejected: ${dto.reason.trim()}. Please upload a valid replacement.`,
      severity: 'ACTION',
      actionUrl: '/dashboard/documents',
    });

    return {
      id: documentId,
      verificationStatus: 'REJECTED',
      rejectionReason: dto.reason.trim(),
    };
  }

  /** Request replacement for a document */
  async requestReplacement(
    user: AuthUser,
    documentId: number,
    dto: RequestReplacementDto,
    req?: Request,
  ) {
    const doc = await this.db.one<any>(
      'SELECT * FROM documents WHERE id = ? AND deleted_at IS NULL',
      [documentId],
    );
    if (!doc) throw new NotFoundException('Document not found.');
    if (!dto.reason || dto.reason.trim().length < 3) {
      throw new BadRequestException('A reason for replacement is required.');
    }

    await this.db.update('documents', documentId, {
      verification_status: 'REJECTED',
      verified_by: user.id,
      verified_at: new Date(),
      rejection_reason: dto.reason.trim(),
      internal_notes: dto.internalNotes ?? doc.internal_notes,
    });

    await this.audit.record({
      actor: user,
      action: 'document.replacement_requested',
      objectType: 'document',
      objectId: documentId,
      metadata: {
        title: doc.title,
        documentType: doc.document_type,
        reason: dto.reason.trim(),
      },
      req,
    });

    await this.notify.send(doc.owner_user_id, 'DOCUMENT_REPLACEMENT_REQUESTED', {
      title: 'Replacement document requested',
      body: `Management requested a replacement for "${doc.title}": ${dto.reason.trim()}`,
      severity: 'ACTION',
      actionUrl: '/dashboard/documents',
    });

    return {
      id: documentId,
      verificationStatus: 'REJECTED',
      rejectionReason: dto.reason.trim(),
    };
  }

  /** Archive document */
  async archiveDocument(user: AuthUser, documentId: number, req?: Request) {
    const doc = await this.assertWritable(user, documentId);

    await this.db.update('documents', documentId, {
      verification_status: 'ARCHIVED',
      is_active: 0,
    });

    await this.audit.record({
      actor: user,
      action: 'document.archived',
      objectType: 'document',
      objectId: documentId,
      metadata: { title: doc.title },
      req,
    });

    return { id: documentId, verificationStatus: 'ARCHIVED' };
  }

  /** Assign verifier to document */
  async assignVerifier(
    user: AuthUser,
    documentId: number,
    verifierId: number,
    req?: Request,
  ) {
    const doc = await this.db.one<any>(
      'SELECT * FROM documents WHERE id = ? AND deleted_at IS NULL',
      [documentId],
    );
    if (!doc) throw new NotFoundException('Document not found.');

    await this.db.update('documents', documentId, {
      assigned_verifier_id: verifierId,
    });

    await this.audit.record({
      actor: user,
      action: 'document.assigned',
      objectType: 'document',
      objectId: documentId,
      metadata: { assignedVerifierId: verifierId },
      req,
    });

    return { id: documentId, assignedVerifierId: verifierId };
  }

  /** Generate short-lived HMAC signed link for authorized document viewing */
  async signedLink(
    user: AuthUser,
    documentId: number,
  ): Promise<{ url: string; expiresIn: number }> {
    const doc = await this.assertReadable(user, documentId);
    const ttl = this.config.get<number>('storage.signedUrlTtl') || 3600;
    const expiresAt = Math.floor(Date.now() / 1000) + ttl;
    const signature = this.sign(`${doc.id}.${user.id}.${expiresAt}`);
    return {
      url: `/api/documents/${doc.id}/download?exp=${expiresAt}&sig=${signature}&u=${user.id}`,
      expiresIn: ttl,
    };
  }

  /** Read file securely via signed link HMAC validation */
  async readSigned(documentId: number, userId: number, exp: number, sig: string) {
    if (exp < Math.floor(Date.now() / 1000))
      throw new ForbiddenException('This link expired. Open the document again.');
    if (this.sign(`${documentId}.${userId}.${exp}`) !== sig)
      throw new ForbiddenException('This link is not valid.');

    const doc = await this.db.one<any>(
      'SELECT * FROM documents WHERE id = ? AND deleted_at IS NULL',
      [documentId],
    );
    if (!doc) throw new NotFoundException('Document not found.');
    const buffer = await this.driver.get(doc.storage_key);
    await this.db.insert('document_access_logs', {
      document_id: documentId,
      user_id: userId,
      action: 'DOWNLOAD',
    });
    return { buffer, mimeType: doc.mime_type, filename: doc.title };
  }

  /** Stream document directly for authenticated user */
  async streamAuthenticated(user: AuthUser, documentId: number) {
    const doc = await this.assertReadable(user, documentId);
    const buffer = await this.driver.get(doc.storage_key);
    await this.db.insert('document_access_logs', {
      document_id: documentId,
      user_id: user.id,
      action: 'DOWNLOAD',
    });
    return { buffer, mimeType: doc.mime_type, filename: doc.title };
  }

  /** Asserts that caller has read access to document */
  async assertReadable(user: AuthUser, documentId: number) {
    const doc = await this.db.one<any>(
      'SELECT * FROM documents WHERE id = ? AND deleted_at IS NULL',
      [documentId],
    );
    if (!doc) throw new NotFoundException('Document not found.');

    // 1. Owner or uploader
    if (doc.owner_user_id === user.id || doc.uploaded_by === user.id) return doc;

    // 2. Global management / staff permission
    if (
      user.permissions.includes('document.read.any') ||
      user.permissions.includes('document.manage') ||
      user.permissions.includes('document.verify') ||
      user.permissions.includes('compliance.read')
    ) {
      return doc;
    }

    // 3. Public visibility
    if (doc.visibility === 'PUBLIC') return doc;

    // 4. Tenancy party access
    if (
      (doc.context_type === 'TENANCY' || doc.entity_type === 'tenancy') &&
      doc.context_id
    ) {
      const party = await this.db.one<any>(
        'SELECT id FROM tenancies WHERE id = ? AND (owner_user_id = ? OR tenant_user_id = ?)',
        [doc.context_id, user.id, user.id],
      );
      if (party) return doc;
    }

    // 5. Property owner access
    if (
      (doc.context_type === 'PROPERTY' || doc.entity_type === 'property') &&
      doc.context_id
    ) {
      const prop = await this.db.one<any>(
        'SELECT id FROM properties WHERE id = ? AND owner_id = ?',
        [doc.context_id, user.id],
      );
      if (prop) return doc;
    }

    // 6. Application party access
    if (
      (doc.context_type === 'APPLICATION' || doc.entity_type === 'application') &&
      doc.context_id
    ) {
      const app = await this.db.one<any>(
        `SELECT a.id FROM applications a
           JOIN properties p ON p.id = a.property_id
          WHERE a.id = ? AND (a.applicant_user_id = ? OR p.owner_id = ?)`,
        [doc.context_id, user.id, user.id],
      );
      if (app) return doc;
    }

    // 7. Legal case party access
    if (
      (doc.context_type === 'LEGAL_CASE' || doc.entity_type === 'legal_case') &&
      doc.context_id
    ) {
      if (user.roles.includes('LEGAL_TEAM')) return doc;
      const legalCase = await this.db.one<any>(
        'SELECT id FROM legal_cases WHERE id = ? AND (user_id = ? OR lawyer_id = ?)',
        [doc.context_id, user.id, user.id],
      );
      if (legalCase) return doc;
    }

    await this.db.insert('document_access_logs', {
      document_id: documentId,
      user_id: user.id,
      action: 'VIEW',
    });

    throw new ForbiddenException('You do not have access to this document.');
  }

  /** Asserts that caller has write/modify access to document */
  async assertWritable(user: AuthUser, documentId: number) {
    const doc = await this.db.one<any>(
      'SELECT * FROM documents WHERE id = ? AND deleted_at IS NULL',
      [documentId],
    );
    if (!doc) throw new NotFoundException('Document not found.');

    if (
      doc.owner_user_id === user.id ||
      doc.uploaded_by === user.id ||
      user.permissions.includes('document.manage') ||
      user.permissions.includes('document.read.any')
    ) {
      return doc;
    }

    throw new ForbiddenException('You are not authorized to modify this document.');
  }

  async readRaw(key: string): Promise<Buffer> {
    return this.driver.get(key);
  }

  private sign(payload: string): string {
    return createHmac('sha256', this.config.get('auth.accessSecret')!)
      .update(payload)
      .digest('hex')
      .slice(0, 32);
  }

  private signatureMatches(buffer: Buffer, mime: string): boolean {
    const detected = detectFileSignature(buffer);
    if (!detected) return false;
    return detected.mime === mime;
  }
}

