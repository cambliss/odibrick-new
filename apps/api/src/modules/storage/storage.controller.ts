import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Request, Response } from 'express';
import * as path from 'path';
import { StorageService, DocumentCategory, detectFileSignature } from './storage.service';
import { CurrentUser, Public, RequirePermissions } from '../../common/auth/decorators';
import { AuthUser } from '../../common/auth/auth.types';
import {
  AssignVerifierDto,
  CreateDocumentDto,
  RejectDocumentDto,
  RequestReplacementDto,
  VerifyDocumentDto,
} from './storage.dto';

const ALLOWED_UPLOAD_FOLDERS = new Set(['properties', 'documents', 'profiles', 'misc', 'inspections']);
const MAX_UPLOAD_SIZE_BYTES = 15_728_640; // 15 MB

const PRIVATE_STORAGE_SEGMENTS = new Set([
  'vault',
  'kyc',
  'agreements',
  'documents',
  'inspections',
  'misc',
  'legal',
  'contracts',
  'receipts',
  'disputes',
  'private',
]);

const LEGACY_PUBLIC_IMAGE_KEY = /^img_[a-zA-Z0-9_-]+$/;

/**
 * Validates and classifies a storage key requested via the public storage route.
 * Rejects traversal, double-encoding, null bytes, private namespaces, and any
 * key outside the conservative public allowlist.
 */
export function resolvePublicStorageKey(rawKey: string):
  | { ok: true; key: string }
  | { ok: false; status: 400 | 403; message: string } {
  if (!rawKey || typeof rawKey !== 'string' || rawKey.includes('\0')) {
    return { ok: false, status: 400, message: 'Invalid storage key path.' };
  }

  let decoded: string;
  try {
    decoded = decodeURIComponent(rawKey);
  } catch {
    return { ok: false, status: 400, message: 'Invalid storage key path.' };
  }

  // Reject double-encoded traversal or separator smuggling (e.g. %252e%252e or %252f)
  if (/%2e|%2f|%5c|%00/i.test(decoded) || decoded.includes('\0') || decoded.includes('\\')) {
    return { ok: false, status: 400, message: 'Invalid storage key path.' };
  }

  const trimmed = decoded.replace(/^\/+/, '');
  if (!trimmed) {
    return { ok: false, status: 400, message: 'Invalid storage key path.' };
  }

  const segments = trimmed.split('/');
  if (segments.some((seg) => seg === '' || seg === '.' || seg === '..')) {
    return { ok: false, status: 400, message: 'Invalid storage key path.' };
  }

  const lowerSegments = segments.map((s) => s.toLowerCase());
  if (lowerSegments.some((seg) => PRIVATE_STORAGE_SEGMENTS.has(seg))) {
    return { ok: false, status: 403, message: 'Direct access to protected storage files is prohibited.' };
  }

  const first = lowerSegments[0];
  const isAllowedPublic =
    first === 'properties' ||
    first === 'profiles' ||
    first === 'prop' ||
    (first === 'demo' && lowerSegments[1] === 'properties') ||
    (segments.length === 1 && LEGACY_PUBLIC_IMAGE_KEY.test(segments[0]));

  if (!isAllowedPublic) {
    return { ok: false, status: 403, message: 'Direct access to protected storage files is prohibited.' };
  }

  return { ok: true, key: trimmed };
}

@Controller()
export class StorageController {
  constructor(private readonly storage: StorageService) {}

  /** Raw file upload: stores file and returns storageKey & checksum */
  @Post('uploads')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_SIZE_BYTES } }))
  async upload(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: Express.Multer.File,
    @Body('folder') folder = 'misc',
  ) {
    if (!file || !file.buffer) {
      throw new BadRequestException('A file is required for upload.');
    }

    const cleanFolder = (folder || 'misc').trim();
    if (
      cleanFolder.includes('..') ||
      cleanFolder.includes('/') ||
      cleanFolder.includes('\\') ||
      !ALLOWED_UPLOAD_FOLDERS.has(cleanFolder)
    ) {
      throw new BadRequestException(
        `Invalid upload folder "${folder}". Permitted folders: ${Array.from(ALLOWED_UPLOAD_FOLDERS).join(', ')}`,
      );
    }

    const stored = await this.storage.store(file, `${cleanFolder}/${user.publicId}`);
    return {
      storageKey: stored.storageKey,
      sizeBytes: stored.sizeBytes,
      checksum: stored.checksum,
    };
  }

  /** Create/register document in the governance vault */
  @Post('documents')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_SIZE_BYTES } }))
  async createDocument(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: Express.Multer.File,
    @Body() body: CreateDocumentDto,
    @Req() req: Request,
  ) {
    if (!file || !file.buffer) {
      throw new BadRequestException('A file is required to create a document.');
    }

    const category = (body.category || 'OTHER') as DocumentCategory;
    const stored = await this.storage.store(
      file,
      `vault/${user.publicId}/${category.toLowerCase()}`,
    );
    return this.storage.registerDocument(
      {
        user,
        file: stored,
        category,
        documentType: body.documentType,
        title: body.title ?? file.originalname,
        contextType: body.contextType,
        contextId: body.contextId ? Number(body.contextId) : undefined,
        visibility: body.visibility,
        expiryDate: body.expiryDate,
      },
      req,
    );
  }

  /** List documents with full contextual filters and pagination */
  @Get('documents')
  vault(
    @CurrentUser() user: AuthUser,
    @Query('category') category?: string,
    @Query('documentType') documentType?: string,
    @Query('contextType') contextType?: string,
    @Query('contextId') contextId?: string,
    @Query('status') status?: string,
    @Query('verificationStatus') verificationStatus?: string,
    @Query('ownerUserId') ownerUserId?: string,
    @Query('search') search?: string,
    @Query('onlyActive') onlyActive?: string,
    @Query('page') page?: string,
    @Query('perPage') perPage?: string,
  ) {
    return this.storage.listVault(user, {
      category,
      documentType,
      contextType,
      contextId: contextId ? Number(contextId) : undefined,
      verificationStatus: verificationStatus || status,
      ownerUserId: ownerUserId ? Number(ownerUserId) : undefined,
      search,
      onlyActive: onlyActive !== undefined ? onlyActive === 'true' || onlyActive === '1' : true,
      page: page ? Number(page) : undefined,
      perPage: perPage ? Number(perPage) : undefined,
    });
  }

  /** Retrieve single document with RBAC sanitization */
  @Get('documents/:id')
  async getDocument(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.storage.getDocument(user, id);
  }

  /** Get short-lived HMAC signed link for secure viewing */
  @Get('documents/:id/link')
  link(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.storage.signedLink(user, id);
  }

  /** Replace document by uploading a new version */
  @Post('documents/:id/replace')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 25_000_000 } }))
  async replaceDocument(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() file: Express.Multer.File,
    @Body('title') title?: string,
    @Body('expiryDate') expiryDate?: string,
    @Req() req?: Request,
  ) {
    return this.storage.createVersion(user, id, file, { title, expiryDate }, req);
  }

  /** Submit document for verification review */
  @Post('documents/:id/submit-review')
  async submitReview(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Req() req: Request,
  ) {
    return this.storage.submitForReview(user, id, req);
  }

  /** Verify document (Staff / Verifier only) */
  @Post('documents/:id/verify')
  @RequirePermissions('document.verify')
  async verifyDocument(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: VerifyDocumentDto,
    @Req() req: Request,
  ) {
    return this.storage.verifyDocument(user, id, dto, req);
  }

  /** Reject document (Staff / Verifier only) */
  @Post('documents/:id/reject')
  @RequirePermissions('document.verify')
  async rejectDocument(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RejectDocumentDto,
    @Req() req: Request,
  ) {
    return this.storage.rejectDocument(user, id, dto, req);
  }

  /** Request replacement for document (Staff / Verifier only) */
  @Post('documents/:id/request-replacement')
  @RequirePermissions('document.verify')
  async requestReplacement(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RequestReplacementDto,
    @Req() req: Request,
  ) {
    return this.storage.requestReplacement(user, id, dto, req);
  }

  /** Archive document */
  @Post('documents/:id/archive')
  async archiveDocument(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Req() req: Request,
  ) {
    return this.storage.archiveDocument(user, id, req);
  }

  /** Assign verifier to document */
  @Post('documents/:id/assign')
  @RequirePermissions('document.assign')
  async assignVerifier(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AssignVerifierDto,
    @Req() req: Request,
  ) {
    return this.storage.assignVerifier(user, id, dto.verifierId, req);
  }

  /**
   * Secure document download / stream endpoint.
   * If query parameters u, exp, sig are present, validates signed token.
   * Otherwise checks caller's authenticated session.
   */
  @Public()
  @Get('documents/:id/download')
  async download(
    @Param('id', ParseIntPipe) id: number,
    @Query('u') u: string,
    @Query('exp') exp: string,
    @Query('sig') sig: string,
    @CurrentUser() user: AuthUser,
    @Res() res: Response,
  ) {
    let file: { buffer: Buffer; mimeType: string; filename: string };
    if (exp && sig && u) {
      file = await this.storage.readSigned(id, Number(u), Number(exp), sig);
    } else if (user) {
      file = await this.storage.streamAuthenticated(user, id);
    } else {
      res.status(401).json({ statusCode: 401, message: 'Unauthorized access to document.' });
      return;
    }

    res.setHeader('Content-Type', file.mimeType);
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${encodeURIComponent(file.filename)}"`,
    );
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.send(file.buffer);
  }

  /** Public media/storage file serving endpoint for public assets like property photos */
  @Public()
  @Get('storage/:key(*)')
  async servePublicStorage(@Param('key') key: string, @Res() res: Response, @Req() req?: Request) {
    const resolved = resolvePublicStorageKey(key);
    if (!resolved.ok) {
      res.status(resolved.status).json({ statusCode: resolved.status, message: resolved.message });
      return;
    }

    const normalizedKey = resolved.key;

    try {
      const result = this.storage.readPublicObject
        ? await this.storage.readPublicObject(normalizedKey)
        : await (async () => {
            const buffer = await this.storage.readRaw(normalizedKey);
            const ext = path.extname(normalizedKey).toLowerCase();
            const detected = detectFileSignature(buffer);
            let mimeType = 'application/octet-stream';
            if (detected) mimeType = detected.mime;
            else if (buffer.slice(0, 200).toString('utf8').includes('<svg')) mimeType = 'image/svg+xml';
            else if (['.jpg', '.jpeg', '.jfif', '.jfi'].includes(ext)) mimeType = 'image/jpeg';
            else if (ext === '.png') mimeType = 'image/png';
            else if (ext === '.webp') mimeType = 'image/webp';
            else if (ext === '.avif') mimeType = 'image/avif';
            else if (['.heic', '.heif'].includes(ext)) mimeType = 'image/heic';
            else if (ext === '.gif') mimeType = 'image/gif';
            else if (ext === '.svg') mimeType = 'image/svg+xml';
            else if (ext === '.pdf') mimeType = 'application/pdf';
            return {
              buffer,
              isFallback: false,
              isSvgPlaceholder: mimeType === 'image/svg+xml',
              etag: `"len-${buffer.length}"`,
              mimeType,
            };
          })();

      const mediaStatus = result.isFallback
        ? 'missing-fallback'
        : result.isSvgPlaceholder
          ? 'placeholder'
          : 'stored';
      const cacheControl = result.isFallback
        ? 'public, max-age=60, must-revalidate'
        : 'public, max-age=86400, stale-while-revalidate=604800';

      res.setHeader('ETag', result.etag);
      res.setHeader('Cache-Control', cacheControl);
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('X-Odibrick-Media-Status', mediaStatus);

      const ifNoneMatch = req?.headers?.['if-none-match'];
      if (ifNoneMatch && ifNoneMatch === result.etag) {
        res.status(304).end();
        return;
      }

      res.setHeader('Content-Type', result.mimeType);
      res.setHeader('Content-Length', result.buffer.length);
      res.send(result.buffer);
    } catch {
      res.status(404).json({ statusCode: 404, message: 'File not found in storage.' });
    }
  }
}


