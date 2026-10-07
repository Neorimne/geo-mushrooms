import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';

/**
 * Everything the application needs beyond its module graph. Shared by
 * `bootstrap()` and the booted spec, so the spec tests the app that ships.
 */
export function configureApp(app: NestExpressApplication): void {
  const config = app.get(ConfigService);

  // The client's address, for the throttler, is read from X-Forwarded-For only
  // across the number of proxy hops named here. Off unless set: with no proxy
  // in front, the header is the client's own claim, and trusting it would let
  // any client choose its own rate-limit budget.
  const hops = Number(config.get<string>('TRUST_PROXY'));
  if (Number.isInteger(hops) && hops > 0) {
    app.set('trust proxy', hops);
  }

  app.enableCors({
    origin: config.get<string>('FRONTEND_URL') || 'http://localhost:4200',
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
  });

  app.use(helmet());

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );
}
