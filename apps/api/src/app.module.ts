import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller';
import { PrismaModule } from './prisma/prisma.module';
import { AreasModule } from './areas/areas.module';
import { CitiesModule } from './cities/cities.module';
import { ObservationsModule } from './observations/observations.module';
import { IngestionModule } from './ingestion/ingestion.module';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { UsersModule } from './users/users.module';
import { SeedModule } from './seed/seed.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([
      {
        ttl: 60000, // 1 minute
        limit: 100, // 100 requests per minute
      },
    ]),
    PrismaModule,
    AuthModule,
    UsersModule,
    AreasModule,
    CitiesModule,
    ObservationsModule,
    IngestionModule,
    SeedModule,
  ],
  controllers: [AppController],
  // Global guards run in the order they are listed here, and that order is
  // load-bearing rather than cosmetic.
  //
  // The throttler stays first because the traffic most worth rate-limiting is
  // unauthenticated: credential stuffing against /auth/login, and token-less
  // floods against everything else. Those should meet a counter in memory
  // before they cost an HMAC verification.
  //
  // JwtAuthGuard second is what makes auth default-deny. A new controller is
  // closed without doing anything; opening a route takes @Public(), and there
  // are exactly two.
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
  ],
})
export class AppModule {}
