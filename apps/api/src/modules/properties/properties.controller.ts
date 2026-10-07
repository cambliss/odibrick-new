import {
  Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query, Req,
} from '@nestjs/common';
import { Request } from 'express';
import { PropertiesService } from './properties.service';
import {
  ArchivePropertyDto,
  AttachImageDto, CreatePropertyDto, ModerateDto, PropertySearchDto, RemovePropertyDto, ReorderImagesDto, UpdatePropertyDto, VerificationCheckDto,
} from './properties.dto';
import { CurrentUser, Public, RequirePermissions, Roles } from '../../common/auth/decorators';
import { AuthUser } from '../../common/auth/auth.types';
import { sha256 } from '../../common/util/crypto';

@Controller('properties')
export class PropertiesController {
  constructor(private readonly properties: PropertiesService) {}

  @Public()
  @Get()
  search(@Query() query: PropertySearchDto) {
    return this.properties.search(query);
  }

  @Public()
  @Get('facets')
  facets(@Query('city') city?: string) {
    return this.properties.facets(city);
  }

  /** Slugs of live listings only, for the web app's sitemap.xml. */
  @Public()
  @Get('sitemap')
  sitemap() {
    return this.properties.sitemapEntries();
  }

  @Get('mine')
  @Roles('OWNER', 'AGENT', 'BUILDER', 'ADMIN', 'SUPER_ADMIN')
  listMine(
    @CurrentUser() user: AuthUser,
    @Query('status') status?: string,
    @Query('page') page?: number,
    @Query('perPage') perPage?: number,
  ) {
    return this.properties.listMine(user, status, page, perPage);
  }

  @Get('moderation-queue')
  @RequirePermissions('property.moderate')
  queue(@Query('page') page?: number, @Query('perPage') perPage?: number) {
    return this.properties.moderationQueue(page, perPage);
  }

  @Get('mine/:id')
  findOwned(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.properties.findOwned(user, id);
  }

  @Get(':id/deletion-eligibility')
  getDeletionEligibility(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.properties.getPropertyDeletionEligibility(user, id);
  }

  @Get(':id/removal-eligibility')
  getRemovalEligibility(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.properties.getPropertyDeletionEligibility(user, id);
  }

  @Public()
  @Get(':identifier(*)')
  async detail(
    @Param('identifier') identifier: string,
    @Req() req: Request,
    @CurrentUser() user?: AuthUser,
  ) {
    const decoded = decodeURIComponent(identifier);
    const property = await this.properties.findBySlugOrPublicId(decoded, user);
    const session = sha256(`${req.ip}:${req.headers['user-agent'] ?? ''}`);
    await this.properties.recordView(property.id, user?.id, session, (req.query.src as string) ?? undefined);
    return property;
  }

  @Post()
  @RequirePermissions('property.create')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreatePropertyDto, @Req() req: Request) {
    return this.properties.create(user, dto, req);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePropertyDto,
    @Req() req: Request,
  ) {
    return this.properties.update(user, id, dto, req);
  }

  @Post(':id/submit')
  submit(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number, @Req() req: Request) {
    return this.properties.submitForVerification(user, id, req);
  }

  @Post(':id/duplicate')
  duplicate(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.properties.duplicate(user, id);
  }

  @Post(':id/remove')
  remove(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RemovePropertyDto,
    @Req() req: Request,
  ) {
    return this.properties.removeProperty(user, id, dto?.reason, req);
  }

  @Delete(':id')
  delete(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number, @Req() req: Request) {
    return this.properties.deleteProperty(user, id, req);
  }

  @Post(':id/archive')
  archive(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ArchivePropertyDto,
    @Req() req: Request,
  ) {
    return this.properties.archiveProperty(user, id, dto.reason, req);
  }

  @Post(':id/moderate')
  @RequirePermissions('property.moderate')
  moderate(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ModerateDto,
    @Req() req: Request,
  ) {
    return this.properties.moderate(user, id, dto.decision, dto.reason, req);
  }

  @Post(':id/verifications')
  @RequirePermissions('property.moderate')
  setCheck(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: VerificationCheckDto,
  ) {
    return this.properties.setVerificationCheck(user, id, dto.checkType, dto.status, dto.notes);
  }

  @Get(':id/images')
  getImages(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.properties.getImages(user, id);
  }

  @Post(':id/images')
  attachImage(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: AttachImageDto,
    @Req() req: Request,
  ) {
    return this.properties.attachImage(user, id, body.storageKey, body.caption, body.roomTag, req);
  }

  @Post(':id/images/:imageId/cover')
  setCoverImage(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Param('imageId', ParseIntPipe) imageId: number,
    @Req() req: Request,
  ) {
    return this.properties.setCoverImage(user, id, imageId, req);
  }

  @Post(':id/images/reorder')
  reorderImages(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: ReorderImagesDto,
    @Req() req: Request,
  ) {
    return this.properties.reorderImages(user, id, body.imageIds, req);
  }

  @Delete(':id/images/:imageId')
  removeImage(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Param('imageId', ParseIntPipe) imageId: number,
    @Req() req: Request,
  ) {
    return this.properties.removeImage(user, id, imageId, req);
  }
}

