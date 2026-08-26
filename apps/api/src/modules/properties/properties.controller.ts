import {
  Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query, Req,
} from '@nestjs/common';
import { Request } from 'express';
import { PropertiesService } from './properties.service';
import {
  CreatePropertyDto, ModerateDto, PropertySearchDto, UpdatePropertyDto, VerificationCheckDto,
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
  @Roles('OWNER', 'AGENT', 'BUILDER')
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

  @Public()
  @Get(':identifier')
  async detail(
    @Param('identifier') identifier: string,
    @Req() req: Request,
    @CurrentUser() user?: AuthUser,
  ) {
    const property = await this.properties.findBySlugOrPublicId(identifier, user);
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

  @Delete(':id')
  archive(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number, @Req() req: Request) {
    return this.properties.archive(user, id, req);
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

  @Post(':id/images')
  attachImage(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { storageKey: string; caption?: string; roomTag?: string },
  ) {
    return this.properties.attachImage(user, id, body.storageKey, body.caption, body.roomTag);
  }

  @Delete(':id/images/:imageId')
  removeImage(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Param('imageId', ParseIntPipe) imageId: number,
  ) {
    return this.properties.removeImage(user, id, imageId);
  }
}
