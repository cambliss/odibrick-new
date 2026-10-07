import { Global, Module } from '@nestjs/common';
import { AutomationService } from './automation.service';
import {
  AdminAutomationController,
  InternalEventsController,
  NotificationPreferencesController,
} from './automation.controller';
import { NotificationsModule } from '../notifications/notifications.module';
import { AuditModule } from '../../common/audit/audit.module';

@Global()
@Module({
  imports: [NotificationsModule, AuditModule],
  controllers: [
    AdminAutomationController,
    InternalEventsController,
    NotificationPreferencesController,
  ],
  providers: [AutomationService],
  exports: [AutomationService],
})
export class AutomationModule {}
