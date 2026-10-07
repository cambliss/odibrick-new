import { Module } from '@nestjs/common';
import { RiskController } from './risk.controller';
import { RiskService } from './risk.service';
import { AuditModule } from '../../common/audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { OperationsModule } from '../operations/operations.module';
import { AutomationModule } from '../automation/automation.module';

@Module({
  imports: [AuditModule, AuthModule, OperationsModule, AutomationModule],
  controllers: [RiskController],
  providers: [RiskService],
  exports: [RiskService],
})
export class RiskModule {}
