import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

// Global so feature modules get the same pooled client without re-providing it
// (a second provider instance would open a second connection pool).
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
