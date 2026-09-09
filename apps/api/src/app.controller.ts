import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DevToolsGuard } from './auth/dev-tools.guard';

@Controller()
export class AppController {
  constructor(private readonly configService: ConfigService) {}

  // Public capability flag. Not a secret — it just tells the client whether to
  // show the developer tools (the data-wiping buttons).
  @Get('config')
  getConfig() {
    return { devToolsEnabled: DevToolsGuard.isEnabled(this.configService) };
  }
}
