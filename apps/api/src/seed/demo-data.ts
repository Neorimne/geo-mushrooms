import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import {
  elevationFor,
  localityIdFor,
  newestPublishedDay,
} from '../ingestion/sources/synthetic/synthetic.provider';
import { generateDay } from '../ingestion/sources/synthetic/weather-generator';

/**
 * The demo dataset, and the whole reason a clean clone is usable.
 *
 * There is no registration route — the app has exactly one `POST /auth/login` —
 * so without the admin user an empty database is a locked door. And a chart with
 * no history behind it shows nothing worth looking at.
 *
 * Two callers share this: `prisma/seed.ts` for `prisma db seed` on a dev
 * machine, and `SeedService` on container start. It takes the Prisma client
 * rather than reaching for one, so each can pass the client it already has.
 */

/** Invented Alpine geography — no real town appears anywhere in this project. */
export const GEOGRAPHY: {
  area: string;
  cities: { name: string; slug: string }[];
}[] = [
  {
    area: 'Val Serena',
    cities: [
      { name: 'Fontebella', slug: 'fontebella' },
      { name: 'Pietralta', slug: 'pietralta' },
      { name: 'Verdolo', slug: 'verdolo' },
    ],
  },
  {
    area: 'Val Rovina',
    cities: [
      { name: 'Rocchetta', slug: 'rocchetta' },
      { name: 'Costalunga', slug: 'costalunga' },
      { name: 'Selvabruna', slug: 'selvabruna' },
    ],
  },
  {
    area: 'Alta Cordevole',
    cities: [
      { name: 'Malgapiana', slug: 'malgapiana' },
      { name: 'Sassofreddo', slug: 'sassofreddo' },
      { name: 'Vallenera', slug: 'vallenera' },
    ],
  },
];

/**
 * How much history to write.
 *
 * Every chart range the UI offers has to fill, which 60 days would already do.
 * It reaches back further on purpose: a window of only the last two months lands
 * entirely in one season, and a demo that never drops below freezing never shows
 * a snow day — so `precipUnit: 'cm'` beside `'mm'`, one of the more deliberate
 * decisions in the schema, would be invisible in the running app and provable
 * only by reading the code.
 */
export const DAYS_OF_HISTORY = 180;

/** A forager's notes, in the voice the note feature was built for. */
const NOTES = [
  'Wet enough all week. Worth a look on the north side.',
  'Ground still frozen at this height — too early.',
  'Three days of rain then warm. Going up on Saturday.',
  'Found nothing. Too dry since the last front.',
  'Good haul near the treeline after that warm spell.',
];

export interface SeedOptions {
  adminEmail?: string;
  adminPassword?: string;
  log?: (message: string) => void;
}

/**
 * Idempotent throughout: it runs on every container start and must converge
 * rather than duplicate. Everything is an upsert on a natural key, which is the
 * same property the ingestion run relies on.
 */
export async function seedDemoData(
  prisma: PrismaClient,
  { adminEmail, adminPassword, log = () => undefined }: SeedOptions = {},
): Promise<void> {
  await seedAdmin(prisma, adminEmail, adminPassword, log);
  const cities = await seedGeography(prisma, log);
  await seedObservations(prisma, cities, log);
  await seedNotes(prisma, log);
}

/**
 * Credentials come from the environment rather than being hardcoded, which
 * keeps the no-fallback-secrets rule intact even here. The README tells the
 * reader what to put in `.env`.
 */
async function seedAdmin(
  prisma: PrismaClient,
  email: string | undefined,
  password: string | undefined,
  log: (m: string) => void,
) {
  if (!email || !password) {
    log('no ADMIN_EMAIL / ADMIN_PASSWORD set — skipping the admin user');
    return;
  }

  if (await prisma.user.findUnique({ where: { email } })) {
    log(`admin ${email} already exists`);
    return;
  }

  await prisma.user.create({
    data: { email, password: await bcrypt.hash(password, 10) },
  });
  log(`created admin ${email}`);
}

async function seedGeography(prisma: PrismaClient, log: (m: string) => void) {
  const cities: { id: number; slug: string }[] = [];

  for (const { area, cities: towns } of GEOGRAPHY) {
    const areaRow = await prisma.area.upsert({
      where: { name: area },
      update: {},
      create: { name: area },
    });

    for (const town of towns) {
      const city = await prisma.city.upsert({
        where: { slug: town.slug },
        update: {},
        create: {
          name: town.name,
          slug: town.slug,
          areaId: areaRow.id,
          // Resolved the way a run would resolve it, so a later collection finds
          // the id already cached instead of looking it up again.
          sourceLocalityId: localityIdFor(town.slug),
        },
      });
      cities.push({ id: city.id, slug: town.slug });
    }
  }

  log(`${GEOGRAPHY.length} areas, ${cities.length} cities`);
  return cities;
}

/**
 * Writes history ending at the archive's edge, never at today.
 *
 * This is the detail that decides whether the demo looks working or broken. A
 * city is marked fresh when its newest day *is* the edge — D-3, because a daily
 * archive withholds days still being validated. Seed up to today and every city
 * renders stale on first load; stop at the edge and they all read current.
 */
async function seedObservations(
  prisma: PrismaClient,
  cities: { id: number; slug: string }[],
  log: (m: string) => void,
) {
  const edge = newestPublishedDay();
  let written = 0;

  for (const city of cities) {
    const locality = localityIdFor(city.slug);
    const elevation = elevationFor(locality);

    for (let back = DAYS_OF_HISTORY - 1; back >= 0; back--) {
      const day = new Date(edge);
      day.setUTCDate(day.getUTCDate() - back);

      // `date` arrives as 'YYYY-MM-DD' and the column is a calendar day, so it
      // is rebuilt at UTC midnight — the shape a collection run writes.
      const { date, ...metrics } = generateDay(
        locality,
        elevation,
        day.toISOString().slice(0, 10),
      );
      const calendarDay = new Date(`${date}T00:00:00.000Z`);

      await prisma.dailyObservation.upsert({
        where: { cityId_date: { cityId: city.id, date: calendarDay } },
        create: { cityId: city.id, date: calendarDay, ...metrics },
        update: metrics,
      });
      written++;
    }
  }

  log(
    `${written} observations, ending ${edge
      .toISOString()
      .slice(0, 10)} (the archive edge)`,
  );
}

/** A handful of notes on recent days, each on a different city. */
async function seedNotes(prisma: PrismaClient, log: (m: string) => void) {
  const recent = await prisma.dailyObservation.findMany({
    orderBy: { date: 'desc' },
    take: 40,
    include: { note: true },
  });

  const seen = new Set<number>();
  let attached = 0;

  for (const observation of recent) {
    if (attached >= NOTES.length) break;
    if (observation.note || seen.has(observation.cityId)) continue;
    seen.add(observation.cityId);

    await prisma.note.create({
      data: { observationId: observation.id, text: NOTES[attached] },
    });
    attached++;
  }

  log(`${attached} notes`);
}
