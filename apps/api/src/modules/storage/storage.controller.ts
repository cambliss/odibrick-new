import {
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
import { StorageService, DocumentCategory } from './storage.service';
import { CurrentUser, Public, RequirePermissions } from '../../common/auth/decorators';
import { AuthUser } from '../../common/auth/auth.types';
import {
  AssignVerifierDto,
  CreateDocumentDto,
  RejectDocumentDto,
  RequestReplacementDto,
  VerifyDocumentDto,
} from './storage.dto';

@Controller()
export class StorageController {
  constructor(private readonly storage: StorageService) {}

  /** Raw file upload: stores file and returns storageKey & checksum */
  @Post('uploads')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 250_000_000 } }))
  async upload(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: Express.Multer.File,
    @Body('folder') folder = 'misc',
  ) {
    const stored = await this.storage.store(file, `${folder}/${user.publicId}`);
    return {
      storageKey: stored.storageKey,
      sizeBytes: stored.sizeBytes,
      checksum: stored.checksum,
    };
  }

  /** Create/register document in the governance vault */
  @Post('documents')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 25_000_000 } }))
  async createDocument(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: Express.Multer.File,
    @Body() body: CreateDocumentDto,
    @Req() req: Request,
  ) {
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
  async servePublicStorage(@Param('key') key: string, @Res() res: Response) {
    const decoded = decodeURIComponent(key);
    const normalizedKey = decoded.replace(/\\/g, '/').replace(/^\/+/, '');

    // Direct access to private vault, kyc or legal agreements is prohibited via public storage
    if (
      normalizedKey.startsWith('vault/') ||
      normalizedKey.startsWith('kyc/') ||
      normalizedKey.startsWith('agreements/')
    ) {
      res.status(403).json({ statusCode: 403, message: 'Direct access to protected vault files is prohibited.' });
      return;
    }

    try {
      const buffer = await this.storage.readRaw(normalizedKey);
      const ext = path.extname(normalizedKey).toLowerCase();
      let mimeType = 'application/octet-stream';

      if (buffer.length >= 4 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
        mimeType = 'image/jpeg';
      } else if (buffer.length >= 8 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
        mimeType = 'image/png';
      } else if (buffer.length >= 4 && buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46) {
        mimeType = 'image/webp';
      } else if (buffer.slice(0, 100).toString().includes('<svg')) {
        mimeType = 'image/svg+xml';
      } else if (['.jpg', '.jpeg'].includes(ext)) {
        mimeType = 'image/jpeg';
      } else if (ext === '.png') {
        mimeType = 'image/png';
      } else if (ext === '.webp') {
        mimeType = 'image/webp';
      } else if (ext === '.svg') {
        mimeType = 'image/svg+xml';
      } else if (ext === '.pdf') {
        mimeType = 'application/pdf';
      }

      res.setHeader('Content-Type', mimeType);
      res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.send(buffer);
    } catch {
      res.status(404).json({ statusCode: 404, message: 'File not found in storage.' });
    }
  }
}


