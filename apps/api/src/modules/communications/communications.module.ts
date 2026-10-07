import { Module } from '@nestjs/common';
import { CommunicationsController } from './communications.controller';
import { CommunicationsService } from './communications.service';
import { DatabaseModule } from '../../common/database/database.module';
import { AuditModule } from '../../common/audit/audit.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [DatabaseModule, AuditModule, NotificationsModule],
  controllers: [CommunicationsController],
  providers: [CommunicationsService],
  exports: [CommunicationsService],
})
export class CommunicationsModule {}
