import {
  SyntheticArchiveProvider,
  PROVIDER_ID,
  elevationFor,
  localityIdFor,
  monthOfDays,
  newestPublishedDay,
} from './synthetic.provider';
import { ARCHIVE_VALIDATION_DAYS } from '../../ingestion.constants';
import { generateDay } from './weather-generator';

describe('SyntheticArchiveProvider', () => {
  let provider: SyntheticArchiveProvider;

  beforeEach(() => {
    provider = new SyntheticArchiveProvider();
  });

  describe('resolveLocality', () => {
    it('gives a slug the same id every time, so a database reset is survivable', async () => {
      const first = await provider.resolveLocality('pietralta');
      const second = await provider.resolveLocality('pietralta');

      expect(first).toBe(second);
      expect(first).toEqual(expect.any(Number));
    });

    it('gives different slugs different ids', async () => {
      const ids = await Promise.all(
        ['pietralta', 'verdolo', 'rocchetta', 'fontebella'].map((slug) =>
          provider.resolveLocality(slug),
        ),
      );

      expect(new Set(ids).size).toBe(ids.length);
    });

    it('returns null for a malformed slug — the validation path must stay live', async () => {
      for (const slug of ['Pietralta', 'has spaces', '', 'trailing-']) {
        await expect(provider.resolveLocality(slug)).resolves.toBeNull();
      }
    });
  });

  describe('openSession', () => {
    it('opens an empty session — there is nothing to hand shake', async () => {
      await expect(provider.openSession('pietralta')).resolves.toEqual({
        session: { providerId: PROVIDER_ID },
        localityId: localityIdFor('pietralta'),
      });
    });

    it('refuses a slug it cannot resolve', async () => {
      await expect(provider.openSession('not a slug')).rejects.toThrow(
        /not a slug/,
      );
    });
  });

  describe('fetchMonth', () => {
    const session = { providerId: PROVIDER_ID };
    const id = localityIdFor('pietralta');

    it('refuses a session opened by a different provider', async () => {
      await expect(
        provider.fetchMonth({ providerId: '3rd-party' }, id, '2026-05-01'),
      ).rejects.toThrow(/3rd-party/);
    });

    it('returns the same days for the same month, so re-collection converges', async () => {
      const first = await provider.fetchMonth(session, id, '2026-05-01');
      const second = await provider.fetchMonth(session, id, '2026-05-01');

      expect(first).toEqual(second);
      expect(first.length).toBe(31);
    });

    it('returns a whole past month, oldest first, with no gaps', async () => {
      const days = await provider.fetchMonth(session, id, '2026-04-01');

      expect(days).toHaveLength(30);
      expect(days[0].date).toBe('2026-04-01');
      expect(days[29].date).toBe('2026-04-30');
      expect(days.map((d) => d.date)).toEqual([...days.map((d) => d.date)].sort());
    });
  });
});

describe('the archive edge', () => {
  it('stops at D-3, so a freshly collected city reads as fresh rather than stale', () => {
    const edge = newestPublishedDay();
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    const daysBehind = Math.round(
      (today.getTime() - edge.getTime()) / 86_400_000,
    );

    // Yesterday is D-1; the validation lag pushes the edge two further back.
    expect(daysBehind).toBe(1 + ARCHIVE_VALIDATION_DAYS);
  });

  it('never generates a day the archive has not published', () => {
    const edge = newestPublishedDay();
    const month = `${edge.toISOString().slice(0, 7)}-01`;

    const days = monthOfDays(localityIdFor('verdolo'), month);

    expect(days.length).toBeGreaterThan(0);
    expect(days[days.length - 1].date).toBe(edge.toISOString().slice(0, 10));
  });
});

describe('generated weather', () => {
  const id = localityIdFor('pietralta');
  const elevation = elevationFor(id);

  it('is a pure function of locality and date', () => {
    expect(generateDay(id, elevation, '2026-07-04')).toEqual(
      generateDay(id, elevation, '2026-07-04'),
    );
  });

  it('keeps tMin below tMax on every day of a year', () => {
    for (const day of yearOfDays(id, elevation)) {
      expect(day.tMin).toBeLessThan(day.tMax as number);
    }
  });

  it('is warmer in July than in January', () => {
    const mean = (month: string) => {
      const days = monthOfDays(id, month);
      return days.reduce((sum, d) => sum + (d.tMax ?? 0), 0) / days.length;
    };

    expect(mean('2026-07-01')).toBeGreaterThan(mean('2026-01-01') + 10);
  });

  it('moves gradually — a day is never a different season from the one before', () => {
    const days = monthOfDays(id, '2026-06-01');

    for (let i = 1; i < days.length; i++) {
      const jump = Math.abs((days[i].tMax ?? 0) - (days[i - 1].tMax ?? 0));
      expect(jump).toBeLessThan(12);
    }
  });

  it('measures snow in centimetres and rain in millimetres, never the reverse', () => {
    for (const day of yearOfDays(id, elevation)) {
      if (day.precipType === 'n') {
        expect(day.precipUnit).toBe('cm');
        expect(day.tMax).toBeLessThan(2);
      }
      if (day.precipType === 'p') {
        expect(day.precipUnit).toBe('mm');
      }
      if (day.precipType === null) {
        expect(day.precipAmount).toBe(0);
      }
    }
  });

  it('produces both snow and rain across a year, so the demo shows both units', () => {
    const types = new Set(yearOfDays(id, elevation).map((d) => d.precipType));

    expect(types).toContain('n');
    expect(types).toContain('p');
    expect(types).toContain(null);
  });

  it('reports gusts as the usual multiple of the sustained wind', () => {
    for (const day of yearOfDays(id, elevation).slice(0, 30)) {
      // Rounded to the same one decimal the speed itself carries.
      const expected = Math.round((day.windSpeed as number) * 1.4 * 10) / 10;
      expect(day.windGust).toBe(expected);
    }
  });
});

/** Every day of 2026 for one locality — the sweep the invariants are checked over. */
function yearOfDays(locality: number, elevation: number) {
  const days = [];
  const cursor = new Date('2026-01-01T00:00:00.000Z');
  while (cursor.getUTCFullYear() === 2026) {
    days.push(generateDay(locality, elevation, cursor.toISOString().slice(0, 10)));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}
