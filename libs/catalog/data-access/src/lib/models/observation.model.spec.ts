import {
  CitySummary,
  Observation,
  isFresh,
  precipInMm,
  precipUnitLabel,
  windArrowRotation,
  windDirectionLabel,
  windSpeedKmh,
  newestArchiveDayIso,
} from './observation.model';

function day(overrides: Partial<Observation> = {}): Observation {
  return {
    id: 1,
    cityId: 1,
    date: '2026-08-19',
    tMin: 9,
    tMax: 21,
    tPerceived: null,
    precipAmount: 2,
    precipUnit: 'mm',
    precipProb: 30,
    precipType: 'p',
    windDirection: 'SSW',
    windSpeed: 5,
    windGust: null,
    humidity: 70,
    pressure: 1015,
    uvIndex: 4,
    zeroThermalM: 3400,
    snowLineM: null,
    conditionText: 'sereno',
    symbolId: 1,
    fetchedAt: '2026-08-20T08:00:00.000Z',
    note: null,
    ...overrides,
  };
}

function summary(latest: Observation | null): CitySummary {
  return {
    city: { id: 1, name: 'Pietralta', slug: 'pietralta' },
    area: { id: 1, name: 'Verdolo' },
    latest,
    series: latest ? [latest] : [],
  };
}

describe('observation model', () => {
  describe('precipUnitLabel', () => {
    it('prints the source units', () => {
      expect(precipUnitLabel('mm')).toBe('mm');
      expect(precipUnitLabel('cm')).toBe('cm');
    });

    it('assumes millimetres when the source sent no unit', () => {
      expect(precipUnitLabel(null)).toBe('mm');
    });

    it('shows an unknown unit as it came rather than guessing', () => {
      expect(precipUnitLabel('in')).toBe('in');
    });
  });

  describe('precipInMm', () => {
    it('leaves millimetres alone', () => {
      expect(precipInMm(4.2, 'mm')).toBe(4.2);
      expect(precipInMm(4.2, null)).toBe(4.2);
    });

    it('converts a snow day from centimetres', () => {
      // 1.8 cm of snow outweighs 12 mm of rain; on one axis it has to say so.
      expect(precipInMm(1.8, 'cm')).toBeCloseTo(18);
    });

    it('keeps a gap a gap, and zero a real dry day', () => {
      expect(precipInMm(null, 'mm')).toBeNull();
      expect(precipInMm(0, 'cm')).toBe(0);
    });
  });

  describe('windSpeedKmh', () => {
    it('converts the stored knots to km/h', () => {
      // The factor is pinned to the source's own chart, which plots
      // `intensita × 1.852` under a "Vento (km/h)" label.
      expect(windSpeedKmh(9)).toBe(17);
      expect(windSpeedKmh(5)).toBe(9);
    });

    it('keeps a gap a gap, and zero a real calm day', () => {
      expect(windSpeedKmh(null)).toBeNull();
      expect(windSpeedKmh(0)).toBe(0);
    });
  });

  describe('windArrowRotation', () => {
    it('turns the arrow to where the wind is going, not where it is from', () => {
      // A northerly blows south: the arrow points down, half a turn from N.
      expect(windArrowRotation('N')).toBe(180);
      expect(windArrowRotation('S')).toBe(0);
      expect(windArrowRotation('SSW')).toBe(22.5);
    });

    it('draws nothing rather than something wrong', () => {
      expect(windArrowRotation(null)).toBeNull();
      expect(windArrowRotation('')).toBeNull();
      expect(windArrowRotation('XYZ')).toBeNull();
    });
  });

  describe('windDirectionLabel', () => {
    it('normalises the case rather than inventing a label', () => {
      // It returns the compass point itself, so a caller can never print a
      // direction the bearing table does not also recognise.
      expect(windDirectionLabel('ssw')).toBe('SSW');
      expect(windDirectionLabel('W')).toBe('W');
      expect(windDirectionLabel('N')).toBe('N');
    });

    it('has no label for what it does not recognise', () => {
      expect(windDirectionLabel(null)).toBeNull();
      expect(windDirectionLabel('XYZ')).toBeNull();
    });
  });

  describe('isFresh', () => {
    it('treats the archive edge as fresh — it can never do better', () => {
      expect(isFresh(summary(day({ date: newestArchiveDayIso() })))).toBe(true);
    });

    it('treats an older day, or no day at all, as stale', () => {
      expect(isFresh(summary(day({ date: '2026-01-01' })))).toBe(false);
      expect(isFresh(summary(null))).toBe(false);
    });
  });
});
