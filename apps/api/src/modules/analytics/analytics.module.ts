import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../common/database/database.module';
import { AuditModule } from '../../common/audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { AnalyticsService } from './analytics.service';
import { AnalyticsController, ReportsController } from './analytics.controller';

@Module({
  imports: [DatabaseModule, AuditModule, AuthModule],
  controllers: [AnalyticsController, ReportsController],
  providers: [AnalyticsService],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}
