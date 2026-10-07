import { Module } from '@nestjs/common';
import { OperationsController } from './operations.controller';
import { OperationsService } from './operations.service';
import { OperationalTasksController } from './operational-tasks.controller';
import { OperationalTasksService } from './operational-tasks.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { PaymentsModule } from '../payments/payments.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [NotificationsModule, PaymentsModule, AuthModule],
  controllers: [OperationsController, OperationalTasksController],
  providers: [OperationsService, OperationalTasksService],
  exports: [OperationsService, OperationalTasksService],
})
export class OperationsModule {}
