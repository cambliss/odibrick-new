import {
  Body, Controller, Get, Param, ParseIntPipe, Post, Query, Res, UploadedFile, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { StorageService, DocumentCategory } from './storage.service';
import { CurrentUser, Public } from '../../common/auth/decorators';
import { AuthUser } from '../../common/auth/auth.types';

@Controller()
export class StorageController {
  constructor(private readonly storage: StorageService) {}

  /** Upload once, then reference the returned storageKey from the owning module. */
  @Post('uploads')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 250_000_000 } }))
  async upload(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: Express.Multer.File,
    @Body('folder') folder = 'misc',
  ) {
    const stored = await this.storage.store(file, `${folder}/${user.publicId}`);
    return { storageKey: stored.storageKey, sizeBytes: stored.sizeBytes, checksum: stored.checksum };
  }

  @Post('documents')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 25_000_000 } }))
  async createDocument(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { category: DocumentCategory; title: string; entityType?: string; entityId?: string; visibility?: any },
  ) {
    const stored = await this.storage.store(file, `vault/${user.publicId}/${body.category.toLowerCase()}`);
    return this.storage.registerDocument({
      user,
      file: stored,
      category: body.category,
      title: body.title ?? file.originalname,
      entityType: body.entityType,
      entityId: body.entityId ? Number(body.entityId) : undefined,
      visibility: body.visibility,
    });
  }

  @Get('documents')
  vault(
    @CurrentUser() user: AuthUser,
    @Query('category') category?: string,
    @Query('entityType') entityType?: string,
    @Query('entityId') entityId?: string,
  ) {
    return this.storage.listVault(user, {
      category,
      entityType,
      entityId: entityId ? Number(entityId) : undefined,
    });
  }

  @Get('documents/:id/link')
  link(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.storage.signedLink(user, id);
  }

  /** The signature carries the authorisation, so this route accepts the token alone. */
  @Public()
  @Get('documents/:id/download')
  async download(
    @Param('id', ParseIntPipe) id: number,
    @Query('u', ParseIntPipe) userId: number,
    @Query('exp', ParseIntPipe) exp: number,
    @Query('sig') sig: string,
    @Res() res: Response,
  ) {
    const file = await this.storage.readSigned(id, userId, exp, sig);
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(file.filename)}"`);
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.send(file.buffer);
  }
}
