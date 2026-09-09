import { PrismaClient } from '@prisma/client';
import { seedDemoData } from '../src/seed/demo-data';

/**
 * `prisma db seed`, for a development machine.
 *
 * The container seeds itself through `SeedService` instead, because the
 * production image carries no TypeScript source for `ts-node` to run.
 */
const prisma = new PrismaClient();

seedDemoData(prisma, {
  adminEmail: process.env.ADMIN_EMAIL,
  adminPassword: process.env.ADMIN_PASSWORD,
  log: (message) => console.log(`- ${message}`),
})
  .then(() => console.log('Seed complete.'))
  .catch((error) => {
    console.error('Seed failed:', error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
