import { ConfigService } from '@nestjs/config';
import { ForbiddenException } from '@nestjs/common';
import { DevToolsGuard } from './dev-tools.guard';

describe('DevToolsGuard', () => {
  const makeGuard = (value: unknown) => {
    const configService = {
      get: jest.fn().mockReturnValue(value),
    } as unknown as ConfigService;
    return new DevToolsGuard(configService);
  };

  it('allows the request when ENABLE_DEV_TOOLS is exactly "true"', () => {
    const guard = makeGuard('true');
    expect(guard.canActivate()).toBe(true);
  });

  it.each([undefined, '', 'false', 'TRUE', '1', 'yes'])(
    'blocks the request (fail-closed) when value is %p',
    (value) => {
      const guard = makeGuard(value);
      expect(() => guard.canActivate()).toThrow(ForbiddenException);
    },
  );

  describe('isEnabled', () => {
    it('returns true only for "true"', () => {
      const cfg = { get: jest.fn().mockReturnValue('true') } as unknown as ConfigService;
      expect(DevToolsGuard.isEnabled(cfg)).toBe(true);
    });

    it('returns false for anything else', () => {
      const cfg = { get: jest.fn().mockReturnValue('false') } as unknown as ConfigService;
      expect(DevToolsGuard.isEnabled(cfg)).toBe(false);
    });
  });
});
