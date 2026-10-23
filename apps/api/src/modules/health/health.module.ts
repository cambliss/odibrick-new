import { Controller, Get, Module } from '@nestjs/common';
import { DatabaseService } from '../../common/database/database.service';
import { StorageService } from '../storage/storage.service';
import { Public } from '../../common/auth/decorators';

@Controller('health')
class HealthController {
  constructor(
    private readonly db: DatabaseService,
    private readonly storage: StorageService,
  ) {}

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

    const storageHealth = await this.storage.checkHealth();

    return {
      status: database === 'up' && storageHealth.status === 'up' ? 'ok' : 'degraded',
      database,
      storage: {
        driver: storageHealth.driver,
        status: storageHealth.status,
      },
      latencyMs: Date.now() - started,
      timestamp: new Date().toISOString(),
    };
  }
}

@Module({ controllers: [HealthController] })
export class HealthModule {}
