import {
  ChartBox,
  DAILY_CHART_BOX,
  SECONDARY_CHART_BOX,
  extentOf,
  formatDayLabel,
  indexAtFraction,
  labelIndices,
  padExtent,
  ticksFor,
  toBandPath,
  toBars,
  toLinePath,
  xFor,
  xPercent,
  yFor,
  yPercent,
} from './chart-geometry';

/** A box with round numbers, so expected coordinates can be read off by hand. */
const BOX: ChartBox = {
  width: 100,
  height: 100,
  padding: { top: 0, right: 0, bottom: 0, left: 0 },
};

const PADDED: ChartBox = {
  width: 120,
  height: 120,
  padding: { top: 10, right: 10, bottom: 10, left: 10 },
};

describe('chart-geometry', () => {
  describe('xFor', () => {
    it('spreads points from the left edge to the right edge', () => {
      expect(xFor(0, 5, BOX)).toBe(0);
      expect(xFor(2, 5, BOX)).toBe(50);
      expect(xFor(4, 5, BOX)).toBe(100);
    });

    it('respects horizontal padding', () => {
      expect(xFor(0, 3, PADDED)).toBe(10);
      expect(xFor(2, 3, PADDED)).toBe(110);
    });

    it('centres a lone point instead of pinning it to the left edge', () => {
      expect(xFor(0, 1, BOX)).toBe(50);
    });

    it('puts a day at the same x in every stacked panel', () => {
      // The three panels on the detail page only read as one figure while
      // their boxes agree on width and horizontal padding. This is the
      // guarantee that keeps them aligned; changing a box must break it.
      for (const index of [0, 7, 13]) {
        expect(xFor(index, 14, SECONDARY_CHART_BOX)).toBe(
          xFor(index, 14, DAILY_CHART_BOX),
        );
      }
    });

    it('leaves the axis gutter out of the viewBox', () => {
      // The gutter is HTML in real pixels (AXIS_GUTTER_PX), so the horizontal
      // padding here is only enough to keep an edge day's stroke inside the
      // box. Putting the gutter back in units would stretch it with the chart:
      // 16px on a phone, too narrow for "-10.5", and a wasted stripe on a
      // desktop.
      for (const box of [DAILY_CHART_BOX, SECONDARY_CHART_BOX]) {
        expect(box.padding.left).toBeLessThan(box.width * 0.02);
      }
    });
  });

  describe('xPercent', () => {
    it('places a point where the stretched viewBox actually puts it', () => {
      // The panels stretch their viewBox across the container, so a fraction of
      // the viewBox width is the same fraction of the rendered width. This is
      // what lets the wind arrows sit in HTML and still line up with the line.
      expect(xPercent(0, 5, BOX)).toBe(0);
      expect(xPercent(2, 5, BOX)).toBe(50);
      expect(xPercent(4, 5, BOX)).toBe(100);
    });

    it('carries the box padding through', () => {
      expect(xPercent(0, 3, PADDED)).toBeCloseTo(
        (xFor(0, 3, PADDED) / PADDED.width) * 100,
      );
    });
  });

  describe('yPercent', () => {
    it('places a value where the stretched viewBox actually puts it', () => {
      // xPercent's twin, and used for the same reason: the axis values are
      // HTML beside the SVG, because text drawn inside it is stretched by
      // whatever ratio the container happens to have.
      const extent = { min: 0, max: 100 };

      expect(yPercent(100, extent, BOX)).toBe(0);
      expect(yPercent(50, extent, BOX)).toBe(50);
      expect(yPercent(0, extent, BOX)).toBe(100);
    });

    it('carries the box padding through', () => {
      const extent = { min: 0, max: 10 };

      expect(yPercent(10, extent, PADDED)).toBeCloseTo(
        (PADDED.padding.top / PADDED.height) * 100,
      );
    });
  });

  describe('indexAtFraction', () => {
    it('finds the day the pointer is over', () => {
      // The inverse of xFor: feeding a point's own position back must return it.
      for (const index of [0, 3, 7, 13]) {
        const fraction = xPercent(index, 14, PADDED) / 100;
        expect(indexAtFraction(fraction, 14, PADDED)).toBe(index);
      }
    });

    it('snaps to the nearest day between two points', () => {
      const first = xPercent(0, 5, BOX) / 100;
      const second = xPercent(1, 5, BOX) / 100;

      expect(indexAtFraction(first + (second - first) * 0.4, 5, BOX)).toBe(0);
      expect(indexAtFraction(first + (second - first) * 0.6, 5, BOX)).toBe(1);
    });

    it('holds the end days rather than blanking past the edge', () => {
      // Dragging a finger off the chart should keep the last reading, not
      // flicker it away.
      expect(indexAtFraction(-0.5, 10, BOX)).toBe(0);
      expect(indexAtFraction(1.5, 10, BOX)).toBe(9);
    });

    it('has no answer for an empty series, and one for a lone day', () => {
      expect(indexAtFraction(0.5, 0, BOX)).toBeNull();
      expect(indexAtFraction(0.5, 1, BOX)).toBe(0);
    });
  });

  describe('yFor', () => {
    it('puts the maximum at the top and the minimum at the bottom', () => {
      const extent = { min: 0, max: 20 };
      expect(yFor(20, extent, BOX)).toBe(0);
      expect(yFor(0, extent, BOX)).toBe(100);
      expect(yFor(10, extent, BOX)).toBe(50);
    });

    it('handles negative temperatures', () => {
      const extent = { min: -10, max: 10 };
      expect(yFor(-10, extent, BOX)).toBe(100);
      expect(yFor(0, extent, BOX)).toBe(50);
    });

    it('centres a flat series rather than dividing by zero', () => {
      expect(yFor(7, { min: 7, max: 7 }, BOX)).toBe(50);
      expect(Number.isNaN(yFor(7, { min: 7, max: 7 }, BOX))).toBe(false);
    });
  });

  describe('extentOf', () => {
    it('measures several series on one shared scale', () => {
      expect(extentOf([5, 9], [1, 12])).toEqual({ min: 1, max: 12 });
    });

    it('ignores gaps', () => {
      expect(extentOf([null, 4, null, 8])).toEqual({ min: 4, max: 8 });
    });

    it('returns null when there is nothing to plot', () => {
      expect(extentOf([])).toBeNull();
      expect(extentOf([null, null])).toBeNull();
    });
  });

  describe('padExtent', () => {
    it('leaves room above and below the data', () => {
      expect(padExtent({ min: 0, max: 10 }, 0.1)).toEqual({ min: -1, max: 11 });
    });

    it('gives a flat series a visible band anyway', () => {
      expect(padExtent({ min: 5, max: 5 })).toEqual({ min: 4, max: 6 });
    });
  });

  describe('toLinePath', () => {
    const extent = { min: 0, max: 10 };

    it('draws one continuous line through a complete series', () => {
      expect(toLinePath([0, 5, 10], extent, BOX)).toBe(
        'M 0 100 L 50 50 L 100 0',
      );
    });

    it('breaks the line at a gap instead of inventing a trend across it', () => {
      // Two subpaths, not one: the missing day must read as missing.
      expect(toLinePath([0, null, 10], extent, BOX)).toBe('M 0 100 M 100 0');
    });

    it('starts a fresh subpath after each gap', () => {
      const path = toLinePath([0, 5, null, 5, 10], extent, BOX);
      expect(path.match(/M/g)).toHaveLength(2);
      expect(path).toBe('M 0 100 L 25 50 M 75 50 L 100 0');
    });

    it('returns an empty path for an empty or all-null series', () => {
      expect(toLinePath([], extent, BOX)).toBe('');
      expect(toLinePath([null, null], extent, BOX)).toBe('');
    });
  });

  describe('toBandPath', () => {
    const extent = { min: 0, max: 10 };

    it('closes a shape between the two series', () => {
      const path = toBandPath([0, 0], [10, 10], extent, BOX);

      expect(path).toBe('M 0 0 L 100 0 L 100 100 L 0 100 Z');
      expect(path.endsWith('Z')).toBe(true);
    });

    it('splits into separate shapes around a gap', () => {
      const path = toBandPath([0, null, 0, 0], [10, null, 10, 10], extent, BOX);

      expect(path.match(/Z/g)).toHaveLength(1);
      expect(path.match(/M/g)).toHaveLength(1);
    });

    it('drops a day where only one end is known', () => {
      // Half a range is not a range; the lines still show what is there.
      const path = toBandPath([0, 2], [10, null], extent, BOX);
      expect(path).toBe('');
    });

    it('produces nothing for a single day, which has no width', () => {
      expect(toBandPath([0], [10], extent, BOX)).toBe('');
    });
  });

  describe('toBars', () => {
    it('scales bars to the wettest day and rises from the baseline', () => {
      const bars = toBars([10, 5, 0], BOX);

      expect(bars).toHaveLength(3);
      expect(bars[0]).toMatchObject({ y: 0, height: 100 });
      expect(bars[1]).toMatchObject({ y: 50, height: 50 });
      // A dry day is a real reading, so it still gets a (zero-height) bar.
      expect(bars[2]).toMatchObject({ y: 100, height: 0 });
    });

    it('draws flat bars when nothing fell all window, rather than full ones', () => {
      const bars = toBars([0, 0, 0], BOX);

      expect(bars.every((b) => b.height === 0)).toBe(true);
    });

    it('skips a day with no reading at all', () => {
      expect(toBars([4, null, 8], BOX)).toHaveLength(2);
    });

    it('centres each bar on its slot', () => {
      const [bar] = toBars([1], BOX);
      expect(bar.x + bar.width / 2).toBe(xFor(0, 1, BOX));
    });

    it('keeps bars visible even on a very dense series', () => {
      const dense = Array.from({ length: 200 }, () => 1);
      expect(toBars(dense, BOX).every((b) => b.width >= 0.5)).toBe(true);
    });
  });

  describe('labelIndices', () => {
    it('labels every point when there are few of them', () => {
      expect(labelIndices(4)).toEqual([0, 1, 2, 3]);
    });

    it('thins out a long range, always keeping both ends', () => {
      const indices = labelIndices(30, 6);

      expect(indices).toHaveLength(6);
      expect(indices[0]).toBe(0);
      expect(indices[indices.length - 1]).toBe(29);
    });

    it('handles an empty series', () => {
      expect(labelIndices(0)).toEqual([]);
    });
  });

  describe('ticksFor', () => {
    it('spans the extent, ends included', () => {
      const ticks = ticksFor({ min: 0, max: 20 }, 4);

      expect(ticks.map((t) => t.value)).toEqual([0, 5, 10, 15, 20]);
      expect(ticks.map((t) => t.label)).toEqual(['0', '5', '10', '15', '20']);
    });

    it('never prints the same label twice on a narrow range', () => {
      // 18–21 °C is an ordinary stable week; at whole degrees it used to read
      // 18, 19, 20, 20, 21 — one number at two different heights.
      const ticks = ticksFor(padExtent({ min: 18, max: 21 }, 0.12), 4);
      const labels = ticks.map((t) => t.label);

      expect(new Set(labels).size).toBe(labels.length);
    });

    it('keeps a flat series readable', () => {
      const labels = ticksFor(padExtent({ min: 14, max: 14 }, 0.12), 4).map(
        (t) => t.label,
      );

      expect(new Set(labels).size).toBe(labels.length);
      expect(labels).not.toContain('-0');
    });

    it('never labels zero as "-0"', () => {
      const labels = ticksFor({ min: -2, max: 2 }, 4).map((t) => t.label);

      expect(labels).toEqual(['-2', '-1', '0', '1', '2']);
    });
  });

  describe('formatDayLabel', () => {
    it('renders a short Russian date', () => {
      expect(formatDayLabel('2026-08-19')).toBe('19 Aug');
      expect(formatDayLabel('2026-04-01')).toBe('1 Apr');
    });

    it('leaves an unparsable value alone rather than printing NaN', () => {
      expect(formatDayLabel('nonsense')).toBe('nonsense');
    });
  });
});
