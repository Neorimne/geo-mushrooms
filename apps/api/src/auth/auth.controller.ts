import { Controller, Post, Body, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginUserDto } from './dto/login-user.dto';
import { Public } from './public.decorator';

@Controller('auth')
export class AuthController {
  constructor(
    private authService: AuthService
  ) {}

  // This route cannot be guarded — it is where tokens come from. Closing it
  // does not make the application stricter, it makes it unreachable: the
  // client turns any 401 into a logout, so the only route back in would be the
  // one that just refused. Marked on the method so a future /auth/refresh or
  // /auth/register has to open itself deliberately.
  @Public()
  @Post('login')
  async login(@Body() loginUserDto: LoginUserDto) {
    const user = await this.authService.validateUser(loginUserDto.email, loginUserDto.password);
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }
    return this.authService.login(user);
  }
}
