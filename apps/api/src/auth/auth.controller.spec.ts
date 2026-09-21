import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { LoginUserDto } from './dto/login-user.dto';

describe('AuthController', () => {
  let controller: AuthController;
  let authService: { validateUser: jest.Mock; login: jest.Mock };

  const credentials: LoginUserDto = {
    email: 'forager@example.com',
    password: 'a-real-password',
  };

  beforeEach(async () => {
    authService = {
      validateUser: jest.fn().mockResolvedValue({ id: 4, email: credentials.email }),
      login: jest.fn().mockResolvedValue({ access_token: 'a-signed-token' }),
    };

    // Nothing to stub: this route is @Public(), and the guard it is exempt
    // from is global rather than named on the controller.
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: authService }],
    }).compile();

    controller = module.get<AuthController>(AuthController);
  });

  it('returns a token for credentials that check out', async () => {
    await expect(controller.login(credentials)).resolves.toEqual({
      access_token: 'a-signed-token',
    });
    expect(authService.validateUser).toHaveBeenCalledWith(
      credentials.email,
      credentials.password,
    );
  });

  it('refuses credentials that do not, without issuing anything', async () => {
    authService.validateUser.mockResolvedValue(null);

    await expect(controller.login(credentials)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(authService.login).not.toHaveBeenCalled();
  });

  // The body is the only user input on the one route that takes no token, so
  // the DTO is the whole of what stands between a stranger and the handler.
  describe('the login body', () => {
    const errorsFor = (body: Record<string, unknown>) =>
      validate(plainToInstance(LoginUserDto, body), {
        whitelist: true,
        forbidNonWhitelisted: true,
      });

    it('accepts an email and a password of at least six characters', async () => {
      await expect(errorsFor({ ...credentials })).resolves.toHaveLength(0);
    });

    it.each([
      ['a malformed email', { email: 'not-an-email', password: 'a-real-password' }],
      ['a missing email', { password: 'a-real-password' }],
      ['a short password', { email: 'forager@example.com', password: 'short' }],
      ['a missing password', { email: 'forager@example.com' }],
      ['an unexpected property', { ...{ email: 'forager@example.com', password: 'a-real-password' }, role: 'admin' }],
    ])('rejects %s', async (_case, body) => {
      await expect(errorsFor(body)).resolves.not.toHaveLength(0);
    });
  });
});
