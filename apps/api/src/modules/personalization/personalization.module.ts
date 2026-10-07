import { Module } from '@nestjs/common';
import {
  CustomerPersonalizationController,
  ProviderExperienceController,
  PublicPropertyViewController,
} from './personalization.controller';
import { PersonalizationService } from './personalization.service';
import { AuditModule } from '../../common/audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AutomationModule } from '../automation/automation.module';
import { OperationsModule } from '../operations/operations.module';

@Module({
  imports: [
    AuditModule,
    AuthModule,
    NotificationsModule,
    AutomationModule,
    OperationsModule,
  ],
  controllers: [
    CustomerPersonalizationController,
    ProviderExperienceController,
    PublicPropertyViewController,
  ],
  providers: [PersonalizationService],
  exports: [PersonalizationService],
})
export class PersonalizationModule {}
