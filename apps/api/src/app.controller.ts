import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DevToolsGuard } from './auth/dev-tools.guard';
import { Public } from './auth/public.decorator';

@Controller()
export class AppController {
  constructor(private readonly configService: ConfigService) {}

  // Public capability flag. Not a secret — it just tells the client whether to
  // show the developer tools (the data-wiping buttons). Marked on the method,
  // so a second route added to this controller is still closed by default.
  @Public()
  @Get('config')
  getConfig() {
    return { devToolsEnabled: DevToolsGuard.isEnabled(this.configService) };
  }
}
