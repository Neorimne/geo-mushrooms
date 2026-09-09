import { Injectable, CanActivate, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Guards the developer tools (for example, wiping collected data).
 * Fail-closed: the route is reachable ONLY when ENABLE_DEV_TOOLS is exactly "true".
 * Anything else (missing, empty, "false", a typo) -> 403.
 */
@Injectable()
export class DevToolsGuard implements CanActivate {
  constructor(private configService: ConfigService) {}

  static isEnabled(configService: ConfigService): boolean {
    return configService.get<string>('ENABLE_DEV_TOOLS') === 'true';
  }

  canActivate(): boolean {
    if (!DevToolsGuard.isEnabled(this.configService)) {
      throw new ForbiddenException('Dev tools are disabled in this environment');
    }
    return true;
  }
}
