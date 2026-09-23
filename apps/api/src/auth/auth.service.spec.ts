import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { AuthService, AuthUser } from './auth.service';
import { UsersService } from '../users/users.service';

describe('AuthService', () => {
  const PASSWORD = 'a-real-password';
  let hashed: string;

  let service: AuthService;
  let usersService: { findOne: jest.Mock };
  let jwtService: { sign: jest.Mock };

  const user = () => ({
    id: 4,
    email: 'forager@example.com',
    password: hashed,
  });

  beforeAll(async () => {
    // Real bcrypt rather than a mock: the comparison is the thing under test.
    // Cost 4 keeps it to a few milliseconds.
    hashed = await bcrypt.hash(PASSWORD, 4);
  });

  beforeEach(async () => {
    usersService = { findOne: jest.fn().mockResolvedValue(user()) };
    jwtService = { sign: jest.fn().mockReturnValue('a-signed-token') };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: usersService },
        { provide: JwtService, useValue: jwtService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  describe('validateUser', () => {
    it('returns the user when the password matches', async () => {
      const result = await service.validateUser('forager@example.com', PASSWORD);

      expect(usersService.findOne).toHaveBeenCalledWith('forager@example.com');
      expect(result).toMatchObject({ id: 4, email: 'forager@example.com' });
    });

    it('does not carry the password hash out of the service', async () => {
      const result = await service.validateUser('forager@example.com', PASSWORD);

      // `in`, not `=== undefined`: a property explicitly set to undefined is
      // still a property, and would travel into a response as one.
      expect('password' in (result ?? {})).toBe(false);
    });

    it('refuses a wrong password', async () => {
      await expect(
        service.validateUser('forager@example.com', 'not-the-password'),
      ).resolves.toBeNull();
    });

    it('refuses an email nobody has', async () => {
      usersService.findOne.mockResolvedValue(null);

      await expect(
        service.validateUser('nobody@example.com', PASSWORD),
      ).resolves.toBeNull();
    });
  });

  describe('login', () => {
    it('signs the id as `sub`, which is where every handler reads the caller', async () => {
      const result = await service.login({
        id: 4,
        email: 'forager@example.com',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      } satisfies AuthUser);

      expect(jwtService.sign).toHaveBeenCalledWith({
        email: 'forager@example.com',
        sub: 4,
      });
      expect(result).toEqual({ access_token: 'a-signed-token' });
    });
  });
});
