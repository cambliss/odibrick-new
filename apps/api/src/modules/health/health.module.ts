import { Controller, Get, Module } from '@nestjs/common';
import { DatabaseService } from '../../common/database/database.service';
import { Public } from '../../common/auth/decorators';

@Controller('health')
class HealthController {
  constructor(private readonly db: DatabaseService) {}

  @Public()
  @Get()
  async check() {
    const started = Date.now();
    let database = 'down';
    try {
      await this.db.query('SELECT 1');
      database = 'up';
    } catch {
      database = 'down';
    }
    return {
      status: database === 'up' ? 'ok' : 'degraded',
      database,
      latencyMs: Date.now() - started,
      timestamp: new Date().toISOString(),
    };
  }
}

@Module({ controllers: [HealthController] })
export class HealthModule {}
