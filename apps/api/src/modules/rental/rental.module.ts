import { Module } from '@nestjs/common';
import { RentalController } from './rental.controller';
import { RentalService } from './rental.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { CommunicationsModule } from '../communications/communications.module';

@Module({
  imports: [NotificationsModule, CommunicationsModule],
  controllers: [RentalController],
  providers: [RentalService],
  exports: [RentalService],
})
export class RentalModule {}
