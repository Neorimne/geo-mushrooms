import { Injectable, OnModuleInit, OnApplicationShutdown } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnApplicationShutdown
{
  // Connect to the database when the application starts.
  async onModuleInit() {
    await this.$connect();
  }

  // The last shutdown hook rather than onModuleDestroy, which runs first:
  // requests still being served and the ingestion run's release need the
  // connection until the HTTP server has closed.
  async onApplicationShutdown() {
    await this.$disconnect();
  }
}
