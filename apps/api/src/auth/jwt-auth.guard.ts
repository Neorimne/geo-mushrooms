import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { IS_PUBLIC_KEY } from './public.decorator';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private jwtService: JwtService,
    private configService: ConfigService
  ) { }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Both targets, because they answer different questions: the handler is
    // where @Public() is written today, and the class is where someone will
    // eventually write it to open a whole controller. getAllAndOverride takes
    // the first defined value, so a method can still be marked on a class that
    // is not — reading only one target would silently ignore the other.
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // Before the header is even looked at, so that a public route behaves the
    // same way whether or not a token happens to be present — a user whose
    // session just expired is carrying a stale one — and so that it can never
    // populate request.user with an identity it did not verify.
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const token = this.extractTokenFromHeader(request);

    if (!token) {
      throw new UnauthorizedException('No token provided');
    }

    try {
      // Read the secret through ConfigService rather than process.env
      const secret = this.configService.get<string>('JWT_SECRET');

      const payload = await this.jwtService.verifyAsync(token, {
        secret: secret,
      });
      request['user'] = payload;
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }

    return true;
  }

  private extractTokenFromHeader(request: Request): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}
