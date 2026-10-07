import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { RolesGuard } from '../../common/auth/roles.guard';
import { CurrentUser, RequirePermissions } from '../../common/auth/decorators';
import { AuthUser } from '../../common/auth/auth.types';
import { IntegrationsService } from './integrations.service';
import {
  ExecuteTestActionDto,
  QueryIntegrationsDto,
  QueryWebhooksDto,
  ToggleIntegrationDto,
} from './integrations.dto';

@Controller('admin/integrations')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AdminIntegrationsController {
  constructor(private readonly integrationsService: IntegrationsService) {}

  @Get()
  @RequirePermissions('integration.read')
  async getIntegrations(@Query() query: QueryIntegrationsDto) {
    return this.integrationsService.getIntegrations(query);
  }

  @Get('health')
  @RequirePermissions('integration.read')
  async getHealthSummary() {
    return this.integrationsService.getHealthSummary();
  }

  @Get('webhooks')
  @RequirePermissions('webhook.read')
  async getWebhooks(@Query() query: QueryWebhooksDto) {
    return this.integrationsService.getWebhooks(query);
  }

  @Get('webhooks/:id')
  @RequirePermissions('webhook.read')
  async getWebhookById(@Param('id') id: string) {
    return this.integrationsService.getWebhookById(id);
  }

  @Post('webhooks/:id/retry')
  @RequirePermissions('webhook.manage')
  async retryWebhook(@Param('id') id: string, @CurrentUser() actor: AuthUser) {
    return this.integrationsService.retryWebhook(id, actor);
  }

  @Get(':id')
  @RequirePermissions('integration.read')
  async getIntegrationById(@Param('id') id: string) {
    return this.integrationsService.getIntegrationById(id);
  }

  @Post(':id/test')
  @RequirePermissions('integration.test')
  async testIntegration(@Param('id') id: string, @CurrentUser() actor: AuthUser) {
    return this.integrationsService.testIntegration(id, actor);
  }

  @Patch(':id/toggle')
  @RequirePermissions('integration.manage')
  async toggleIntegration(
    @Param('id') id: string,
    @Body() dto: ToggleIntegrationDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.integrationsService.toggleIntegration(id, dto.isEnabled, actor);
  }

  @Post(':id/action')
  @RequirePermissions('integration.test')
  async executeTestAction(
    @Param('id') id: string,
    @Body() dto: ExecuteTestActionDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.integrationsService.executeTestAction(id, dto, actor);
  }
}

@Controller('webhooks/callback')
export class PublicWebhooksController {
  constructor(private readonly integrationsService: IntegrationsService) {}

  @Post(':provider')
  async receiveWebhook(
    @Param('provider') provider: string,
    @Body() payload: any,
    @Headers() headers: Record<string, string>,
    @Req() req: any,
  ) {
    return this.integrationsService.handleWebhook(provider, payload, headers, req?.rawBody);
  }
}
