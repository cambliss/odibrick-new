import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { Request } from 'express';
import { ComplianceService } from './compliance.service';
import {
  AssignExceptionDto,
  CreateExceptionDto,
  OverrideComplianceDto,
  ResolveExceptionDto,
} from './compliance.dto';
import { CurrentUser, RequirePermissions } from '../../common/auth/decorators';
import { AuthUser } from '../../common/auth/auth.types';

@Controller('compliance')
export class ComplianceController {
  constructor(private readonly compliance: ComplianceService) {}

  @Get('requirements/:contextType/:contextId')
  resolveRequirements(
    @Param('contextType') contextType: string,
    @Param('contextId') contextId: string,
  ) {
    return this.compliance.resolveRequiredDocuments(contextType, contextId);
  }

  @Get('exceptions')
  @RequirePermissions('compliance.read')
  listExceptions(
    @Query('status') status?: string,
    @Query('category') category?: string,
    @Query('contextType') contextType?: string,
    @Query('severity') severity?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('perPage') perPage?: string,
  ) {
    return this.compliance.listExceptions({
      status,
      category,
      contextType,
      severity,
      search,
      page: page ? Number(page) : undefined,
      perPage: perPage ? Number(perPage) : undefined,
    });
  }

  @Post('exceptions')
  @RequirePermissions('compliance.manage')
  createException(@Body() dto: CreateExceptionDto, @Req() req: Request) {
    return this.compliance.createException(dto, req);
  }

  @Post('exceptions/:id/resolve')
  @RequirePermissions('compliance.manage')
  resolveException(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ResolveExceptionDto,
    @Req() req: Request,
  ) {
    return this.compliance.resolveException(user, id, dto, req);
  }

  @Post('exceptions/:id/override')
  @RequirePermissions('compliance.manage')
  overrideCompliance(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: OverrideComplianceDto,
    @Req() req: Request,
  ) {
    return this.compliance.overrideCompliance(user, id, dto, req);
  }

  @Post('exceptions/:id/assign')
  @RequirePermissions('compliance.manage')
  assignException(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AssignExceptionDto,
    @Req() req: Request,
  ) {
    return this.compliance.assignException(user, id, dto, req);
  }
}

@Controller('admin/compliance')
export class AdminComplianceController {
  constructor(private readonly compliance: ComplianceService) {}

  @Get('analytics')
  @RequirePermissions('compliance.read')
  analytics() {
    return this.compliance.getAdminComplianceAnalytics();
  }

  @Get()
  @RequirePermissions('compliance.read')
  overview() {
    return this.compliance.getAdminComplianceAnalytics();
  }

  @Post('process-expiry')
  @RequirePermissions('compliance.manage')
  processExpiry(@CurrentUser() user: AuthUser) {
    return this.compliance.processExpiry(user);
  }
}
