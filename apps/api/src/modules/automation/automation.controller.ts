import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { Request } from 'express';
import { AutomationService } from './automation.service';
import {
  AcknowledgeFailureDto,
  EmitEventDto,
  ToggleRuleDto,
  UpdateNotificationPreferenceDto,
} from './automation.dto';
import { CurrentUser, RequirePermissions } from '../../common/auth/decorators';
import { AuthUser } from '../../common/auth/auth.types';

@Controller('admin/automation')
export class AdminAutomationController {
  constructor(private readonly automation: AutomationService) {}

  @Get('analytics')
  @RequirePermissions('automation.read')
  analytics() {
    return this.automation.getAnalytics();
  }

  @Get('overview')
  @RequirePermissions('automation.read')
  overview() {
    return this.automation.getAnalytics();
  }

  @Get('events')
  @RequirePermissions('automation.read')
  events(
    @Query('eventType') eventType?: string,
    @Query('entityType') entityType?: string,
    @Query('correlationId') correlationId?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('perPage') perPage?: string,
  ) {
    return this.automation.getEvents({
      eventType,
      entityType,
      correlationId,
      search,
      page: page ? Number(page) : undefined,
      perPage: perPage ? Number(perPage) : undefined,
    });
  }

  @Get('executions')
  @RequirePermissions('automation.read')
  executions(
    @Query('status') status?: string,
    @Query('actionType') actionType?: string,
    @Query('ruleCode') ruleCode?: string,
    @Query('page') page?: string,
    @Query('perPage') perPage?: string,
  ) {
    return this.automation.getExecutions({
      status,
      actionType,
      ruleCode,
      page: page ? Number(page) : undefined,
      perPage: perPage ? Number(perPage) : undefined,
    });
  }

  @Get('failures')
  @RequirePermissions('automation.read')
  failures(
    @Query('acknowledged') acknowledged?: string,
    @Query('page') page?: string,
    @Query('perPage') perPage?: string,
  ) {
    return this.automation.getFailures({
      acknowledged: acknowledged !== undefined ? acknowledged === 'true' || acknowledged === '1' : undefined,
      page: page ? Number(page) : undefined,
      perPage: perPage ? Number(perPage) : undefined,
    });
  }

  @Get('rules')
  @RequirePermissions('automation.read')
  rules() {
    return this.automation.getRules();
  }

  @Post('rules/:id/toggle')
  @RequirePermissions('automation.manage')
  toggleRule(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ToggleRuleDto,
    @Req() req: Request,
  ) {
    return this.automation.toggleRule(user, id, dto, req);
  }

  @Post('executions/:id/retry')
  @RequirePermissions('automation.manage')
  retryExecution(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Req() req: Request,
  ) {
    return this.automation.retryExecution(user, id, req);
  }

  @Post('executions/:id/acknowledge')
  @RequirePermissions('automation.manage')
  acknowledgeFailure(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AcknowledgeFailureDto,
    @Req() req: Request,
  ) {
    return this.automation.acknowledgeFailure(user, id, dto, req);
  }

  @Post('run-scheduler')
  @RequirePermissions('automation.trigger')
  runScheduler(@CurrentUser() user: AuthUser) {
    return this.automation.runScheduledAutomation(user);
  }
}

@Controller('internal/events')
export class InternalEventsController {
  constructor(private readonly automation: AutomationService) {}

  @Post()
  @RequirePermissions('automation.manage')
  emitEvent(
    @CurrentUser() user: AuthUser,
    @Body() dto: EmitEventDto,
    @Req() req: Request,
  ) {
    return this.automation.emit(dto, user, req);
  }
}

@Controller('notifications/preferences')
export class NotificationPreferencesController {
  constructor(private readonly automation: AutomationService) {}

  @Get()
  getPreferences(@CurrentUser() user: AuthUser) {
    return this.automation.getUserPreferences(user.id);
  }

  @Patch()
  updatePreference(
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateNotificationPreferenceDto,
  ) {
    return this.automation.updatePreference(user.id, dto);
  }
}
