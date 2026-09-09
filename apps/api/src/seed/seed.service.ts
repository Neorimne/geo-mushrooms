import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { seedDemoData } from './demo-data';

/**
 * Fills an empty database on start, so `docker compose up` reaches a working,
 * logged-in-able app with charts on it — the five-minute promise in the README.
 *
 * The container cannot use `prisma db seed`: that runs `ts-node` over
 * `prisma/seed.ts`, and the production image carries only compiled output. This
 * is the same seeding code reached the other way.
 *
 * Two guards, both deliberate. It is off unless `SEED_DEMO_DATA` is exactly
 * `'true'`, fail-closed like `DevToolsGuard`, because inventing weather in
 * someone's real database would be worse than an empty one. And it does nothing
 * when cities already exist, so a restart never disturbs live data.
 */
@Injectable()
export class SeedService implements OnModuleInit {
  private readonly logger = new Logger(SeedService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    if (this.config.get<string>('SEED_DEMO_DATA') !== 'true') {
      return;
    }

    const existing = await this.prisma.city.count();
    if (existing > 0) {
      this.logger.log(`Demo seed skipped — ${existing} cities already present`);
      return;
    }

    this.logger.log('Empty database — writing the demo dataset');

    try {
      await seedDemoData(this.prisma, {
        adminEmail: this.config.get<string>('ADMIN_EMAIL'),
        adminPassword: this.config.get<string>('ADMIN_PASSWORD'),
        log: (message) => this.logger.log(`  ${message}`),
      });
      this.logger.log('Demo seed complete');
    } catch (error) {
      // A failed seed must not stop the API from booting: the app is still
      // usable against whatever did land, and a crash loop here would hide the
      // reason behind a restart.
      this.logger.error(
        `Demo seed failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
