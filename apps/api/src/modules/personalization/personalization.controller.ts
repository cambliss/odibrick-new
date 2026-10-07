import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { RolesGuard } from '../../common/auth/roles.guard';
import { CurrentUser, Public, RequirePermissions, Roles } from '../../common/auth/decorators';
import { AuthUser } from '../../common/auth/auth.types';
import { PersonalizationService } from './personalization.service';
import {
  CreateSavedSearchDto,
  RecommendationQueryDto,
  TrackInteractionDto,
  UpdateSavedSearchDto,
  UpsertPreferencesDto,
} from './personalization.dto';

// =========================================================================
// CUSTOMER PERSONALIZATION & DISCOVERY CONTROLLER
// =========================================================================

@Controller('customer')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CustomerPersonalizationController {
  constructor(private readonly personalizationService: PersonalizationService) {}

  @Get('overview')
  async getOverview(@CurrentUser() user: AuthUser) {
    return this.personalizationService.getCustomerOverview(user.id);
  }

  @Get('preferences')
  async getPreferences(@CurrentUser() user: AuthUser) {
    return this.personalizationService.getPreferences(user.id);
  }

  @Put('preferences')
  async upsertPreferences(
    @CurrentUser() user: AuthUser,
    @Body() dto: UpsertPreferencesDto,
  ) {
    return this.personalizationService.upsertPreferences(user.id, dto, user);
  }

  @Get('saved-properties')
  async getSavedProperties(
    @CurrentUser() user: AuthUser,
    @Query('page') page?: string,
    @Query('perPage') perPage?: string,
  ) {
    const p = page ? parseInt(page, 10) : 1;
    const pp = perPage ? parseInt(perPage, 10) : 20;
    return this.personalizationService.getSavedProperties(user.id, p, pp);
  }

  @Post('saved-properties/:propertyId')
  async saveProperty(
    @CurrentUser() user: AuthUser,
    @Param('propertyId', ParseIntPipe) propertyId: number,
    @Body('note') note?: string,
  ) {
    return this.personalizationService.saveProperty(user.id, propertyId, note, user);
  }

  @Delete('saved-properties/:propertyId')
  async unsaveProperty(
    @CurrentUser() user: AuthUser,
    @Param('propertyId', ParseIntPipe) propertyId: number,
  ) {
    return this.personalizationService.unsaveProperty(user.id, propertyId, user);
  }

  @Get('saved-searches')
  async getSavedSearches(@CurrentUser() user: AuthUser) {
    return this.personalizationService.getSavedSearches(user.id);
  }

  @Post('saved-searches')
  async createSavedSearch(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateSavedSearchDto,
  ) {
    return this.personalizationService.createSavedSearch(user.id, dto, user);
  }

  @Patch('saved-searches/:id')
  async updateSavedSearch(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateSavedSearchDto,
  ) {
    return this.personalizationService.updateSavedSearch(user.id, id, dto, user);
  }

  @Delete('saved-searches/:id')
  async deleteSavedSearch(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.personalizationService.deleteSavedSearch(user.id, id, user);
  }

  @Get('recently-viewed')
  async getRecentlyViewed(
    @CurrentUser() user: AuthUser,
    @Query('limit') limit?: string,
  ) {
    const l = limit ? parseInt(limit, 10) : 10;
    return this.personalizationService.getRecentlyViewed(user.id, l);
  }

  @Get('recommendations')
  async getRecommendations(
    @CurrentUser() user: AuthUser,
    @Query() query: RecommendationQueryDto,
  ) {
    return this.personalizationService.getRecommendations(
      user.id,
      query.category,
      query.limit || 12,
    );
  }

  @Post('interactions')
  async trackInteraction(
    @CurrentUser() user: AuthUser,
    @Body() dto: TrackInteractionDto,
  ) {
    return this.personalizationService.trackInteraction(
      user.id,
      dto.sessionId || null,
      dto.propertyId,
      dto.interactionType,
      dto.source || 'APP',
      dto.metadata,
    );
  }
}

// =========================================================================
// PROVIDER EXPERIENCE & WORKSPACE CONTROLLER
// =========================================================================

@Controller('provider')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ProviderExperienceController {
  constructor(private readonly personalizationService: PersonalizationService) {}

  @Get('action-centre')
  @Roles('OWNER', 'AGENT', 'BUILDER', 'PROPERTY_MANAGER', 'ADMIN', 'SUPER_ADMIN')
  async getActionCentre(@CurrentUser() user: AuthUser) {
    return this.personalizationService.getProviderActionCentre(user.id);
  }

  @Get('listing-performance')
  @Roles('OWNER', 'AGENT', 'BUILDER', 'PROPERTY_MANAGER', 'ADMIN', 'SUPER_ADMIN')
  async getListingPerformance(
    @CurrentUser() user: AuthUser,
    @Query('propertyId') propertyId?: string,
  ) {
    const pid = propertyId ? parseInt(propertyId, 10) : undefined;
    return this.personalizationService.getListingPerformance(user.id, pid);
  }

  @Get('demand-insights')
  @Roles('OWNER', 'AGENT', 'BUILDER', 'PROPERTY_MANAGER', 'ADMIN', 'SUPER_ADMIN')
  async getDemandInsights(@CurrentUser() user: AuthUser) {
    return this.personalizationService.getAggregateDemandInsights(user.id);
  }
}

// =========================================================================
// PUBLIC PROPERTY VIEW TRACKER CONTROLLER
// =========================================================================

@Controller('properties')
export class PublicPropertyViewController {
  constructor(private readonly personalizationService: PersonalizationService) {}

  @Public()
  @Post(':id/view')
  async trackView(
    @Param('id', ParseIntPipe) id: number,
    @Body('sessionId') sessionId?: string,
    @Body('source') source?: string,
    @Req() req?: Request,
  ) {
    const authHeader = req?.headers?.authorization;
    let userId: number | null = null;
    // Basic optional user extraction if present
    return this.personalizationService.trackInteraction(
      userId,
      sessionId || (req?.ip ?? 'anon'),
      id,
      'VIEW',
      source || 'ORGANIC',
    );
  }
}
