import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  // Connect to the database when the application starts.
  async onModuleInit() {
    await this.$connect();
  }

  // Disconnect on shutdown so no connections are left dangling.
  async onModuleDestroy() {
    await this.$disconnect();
  }
}
