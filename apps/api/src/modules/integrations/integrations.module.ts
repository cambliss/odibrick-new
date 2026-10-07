import { Module } from '@nestjs/common';
import {
  AdminIntegrationsController,
  PublicWebhooksController,
} from './integrations.controller';
import { IntegrationsService } from './integrations.service';
import { AuditModule } from '../../common/audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { OperationsModule } from '../operations/operations.module';
import { AutomationModule } from '../automation/automation.module';
import { RiskModule } from '../risk/risk.module';
import { ResendEmailAdapter } from './adapters/email.adapter';
import { TwilioSmsAdapter } from './adapters/sms.adapter';
import { MetaWhatsAppAdapter } from './adapters/whatsapp.adapter';
import { RazorpayGatewayAdapter } from './adapters/payment-gateway.adapter';
import { S3StorageAdapter } from './adapters/storage.adapter';
import { HyperVergeKycAdapter } from './adapters/kyc.adapter';
import { LeegalityESignAdapter } from './adapters/esign.adapter';
import { GoogleMapsAdapter } from './adapters/maps.adapter';
import { GoogleCalendarAdapter } from './adapters/calendar.adapter';

@Module({
  imports: [AuditModule, AuthModule, OperationsModule, AutomationModule, RiskModule],
  controllers: [AdminIntegrationsController, PublicWebhooksController],
  providers: [
    IntegrationsService,
    ResendEmailAdapter,
    TwilioSmsAdapter,
    MetaWhatsAppAdapter,
    RazorpayGatewayAdapter,
    S3StorageAdapter,
    HyperVergeKycAdapter,
    LeegalityESignAdapter,
    GoogleMapsAdapter,
    GoogleCalendarAdapter,
  ],
  exports: [
    IntegrationsService,
    ResendEmailAdapter,
    TwilioSmsAdapter,
    MetaWhatsAppAdapter,
    RazorpayGatewayAdapter,
    S3StorageAdapter,
    HyperVergeKycAdapter,
    LeegalityESignAdapter,
    GoogleMapsAdapter,
    GoogleCalendarAdapter,
  ],
})
export class IntegrationsModule {}
