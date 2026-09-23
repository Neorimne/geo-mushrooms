import { Test, TestingModule } from '@nestjs/testing';
import { UsersService } from './users.service';
import { PrismaService } from '../prisma/prisma.service';

describe('UsersService', () => {
  let service: UsersService;
  let prismaService: { user: { findUnique: jest.Mock; create: jest.Mock } };

  beforeEach(async () => {
    prismaService = {
      user: { findUnique: jest.fn(), create: jest.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: prismaService },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  it('looks a user up by the unique email, not by a filtered search', async () => {
    // The lookup behind every login. `findFirst` with the same filter would
    // read the same today and quietly stop being the identity of a user.
    const row = { id: 1, email: 'forager@example.com', password: 'hash' };
    prismaService.user.findUnique.mockResolvedValue(row);

    await expect(service.findOne('forager@example.com')).resolves.toBe(row);
    expect(prismaService.user.findUnique).toHaveBeenCalledWith({
      where: { email: 'forager@example.com' },
    });
  });

  it('returns null when the email is not registered', async () => {
    prismaService.user.findUnique.mockResolvedValue(null);

    await expect(service.findOne('nobody@example.com')).resolves.toBeNull();
  });

  it('creates a user from the data it is given', async () => {
    const data = { email: 'new@example.com', password: 'hash' };
    prismaService.user.create.mockResolvedValue({ id: 2, ...data });

    await expect(service.create(data)).resolves.toMatchObject({ id: 2 });
    expect(prismaService.user.create).toHaveBeenCalledWith({ data });
  });
});
