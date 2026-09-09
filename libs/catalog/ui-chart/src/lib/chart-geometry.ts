/**
 * Pure coordinate maths for the hand-rolled SVG charts.
 *
 * No Angular, no DOM: the components turn `Observation[]` into these shapes
 * inside computed signals and bind them declaratively, so change detection and
 * dark mode are handled by the template rather than by imperative redraws.
 * Keeping the maths here is also the only reason it can be unit-tested.
 */

/** The drawing area, in viewBox units. */
export interface ChartBox {
  width: number;
  height: number;
  padding: { top: number; right: number; bottom: number; left: number };
}

export interface Point {
  x: number;
  y: number;
}

export interface Bar {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The value range a vertical axis covers. */
export interface Extent {
  min: number;
  max: number;
}

export const SPARKLINE_BOX: ChartBox = {
  width: 56,
  height: 24,
  padding: { top: 2, right: 1, bottom: 2, left: 1 },
};

/**
 * The main chart's drawing area.
 *
 * The horizontal padding is deliberately tiny: the axis values and the date row
 * are HTML laid out *around* the SVG (see `AXIS_GUTTER_PX`), so the viewBox no
 * longer has to reserve room for text it does not draw. What is left is only
 * enough to keep an edge day's stroke and bar inside the box.
 */
export const DAILY_CHART_BOX: ChartBox = {
  width: 640,
  height: 260,
  padding: { top: 12, right: 8, bottom: 8, left: 8 },
};

/**
 * The shorter panels stacked under the main chart.
 *
 * `width` and the horizontal padding must stay identical to `DAILY_CHART_BOX`:
 * that is the whole reason `xFor` puts day *n* at the same pixel in every
 * panel, so the stack reads as one figure with a shared x axis. Only the
 * vertical figures differ, and they do not enter `xFor` at all.
 */
export const SECONDARY_CHART_BOX: ChartBox = {
  width: 640,
  height: 140,
  padding: { top: 12, right: 8, bottom: 12, left: 8 },
};

/**
 * Width of the gutter the y-axis values are printed in, in **real pixels**.
 *
 * It is a pixel measurement rather than viewBox units for the same reason the
 * labels are HTML: `preserveAspectRatio="none"` stretches the viewBox onto the
 * container, so a gutter declared in units is 16px on a phone and 115px on a
 * desktop — one too narrow to hold "-10.5", the other a stripe of waste. In
 * pixels it holds the same text at every width.
 *
 * Every panel and the crosshair overlay read this one number: that is what
 * keeps the stack's left edges flush and the crosshair over the day it names.
 */
export const AXIS_GUTTER_PX = 40;

/**
 * Where a plotted point sits as a percentage of the container's width.
 *
 * The panels are drawn with `preserveAspectRatio="none"`, so the viewBox is
 * stretched linearly onto the element's real width — which makes this the exact
 * position of the same day for anything laid out in HTML *beside* the SVG
 * rather than inside it. Glyphs go there: that same stretch would squash a
 * shape drawn in viewBox units into a dart.
 */
export function xPercent(index: number, count: number, box: ChartBox): number {
  return round((xFor(index, count, box) / box.width) * 100);
}

/**
 * Where a value sits as a percentage of the container's height — `xPercent`'s
 * vertical twin, and used for the same reason: the y-axis values are HTML
 * positioned beside the SVG, because text drawn inside it is stretched by
 * whatever ratio the container happens to have.
 */
export function yPercent(value: number, extent: Extent, box: ChartBox): number {
  return round((yFor(value, extent, box) / box.height) * 100);
}

/**
 * Which day the pointer is over — the inverse of `xFor`.
 *
 * Takes a 0–1 fraction of the container's width rather than an event, so the
 * hit testing is as pure and testable as the rest of this file; the component
 * does the one `getBoundingClientRect()` and hands the ratio over.
 *
 * Past either edge the answer sticks to the first or last day instead of going
 * blank: dragging a finger off the end of the chart should hold the reading,
 * not flicker it away.
 */
export function indexAtFraction(
  fraction: number,
  count: number,
  box: ChartBox,
): number | null {
  if (count <= 0) return null;
  if (count === 1) return 0;

  const x = fraction * box.width - box.padding.left;
  const slot = innerWidth(box) / (count - 1);
  const index = Math.round(x / slot);

  return Math.min(count - 1, Math.max(0, index));
}

const innerWidth = (box: ChartBox) =>
  box.width - box.padding.left - box.padding.right;

const innerHeight = (box: ChartBox) =>
  box.height - box.padding.top - box.padding.bottom;

/** Two decimals is plenty at these sizes and keeps path strings readable. */
const round = (n: number) => Math.round(n * 100) / 100;

/** Evenly spaces `count` slots across the box; a single slot sits in the middle. */
export function xFor(index: number, count: number, box: ChartBox): number {
  if (count <= 1) return round(box.padding.left + innerWidth(box) / 2);
  return round(
    box.padding.left + (index / (count - 1)) * innerWidth(box),
  );
}

/**
 * Maps a value onto the vertical axis, inverted because SVG's y grows downward.
 * A flat series (max === min) is centred rather than divided by zero.
 */
export function yFor(value: number, extent: Extent, box: ChartBox): number {
  const span = extent.max - extent.min;
  if (span === 0) return round(box.padding.top + innerHeight(box) / 2);
  return round(
    box.padding.top +
      (1 - (value - extent.min) / span) * innerHeight(box),
  );
}

/**
 * The range a set of series spans, or null when there is nothing to plot.
 * Several series share one axis by being passed together — temperature min and
 * max have to be measured on the same scale or the band between them lies.
 */
export function extentOf(...series: (number | null)[][]): Extent | null {
  const values = series.flat().filter((v): v is number => v !== null);
  if (values.length === 0) return null;
  return { min: Math.min(...values), max: Math.max(...values) };
}

/** Widens an extent by a margin on both ends so lines do not touch the edges. */
export function padExtent(extent: Extent, fraction = 0.1): Extent {
  const span = extent.max - extent.min;
  // A flat series still needs a visible band, so fall back to a fixed margin.
  const margin = span === 0 ? 1 : span * fraction;
  return { min: extent.min - margin, max: extent.max + margin };
}

/**
 * An SVG path through the values.
 *
 * Gaps matter: a missing day starts a new subpath (`M`) instead of being
 * bridged with a straight line, so the chart shows that the data is absent
 * rather than inventing a trend across it.
 */
export function toLinePath(
  values: (number | null)[],
  extent: Extent,
  box: ChartBox,
): string {
  const segments: string[] = [];
  let penDown = false;

  values.forEach((value, index) => {
    if (value === null) {
      penDown = false;
      return;
    }
    const x = xFor(index, values.length, box);
    const y = yFor(value, extent, box);
    segments.push(`${penDown ? 'L' : 'M'} ${x} ${y}`);
    penDown = true;
  });

  return segments.join(' ');
}

/**
 * A closed band between a lower and an upper series — the daily temperature
 * range. Days where either end is missing break the band into separate shapes,
 * for the same reason lines break.
 */
export function toBandPath(
  lower: (number | null)[],
  upper: (number | null)[],
  extent: Extent,
  box: ChartBox,
): string {
  const count = Math.max(lower.length, upper.length);
  const shapes: string[] = [];
  let run: { index: number; low: number; high: number }[] = [];

  const flush = () => {
    if (run.length === 0) return;
    // A one-day run has no width to fill, so it is left to the lines to show.
    if (run.length > 1) {
      const top = run.map(
        (p, i) =>
          `${i === 0 ? 'M' : 'L'} ${xFor(p.index, count, box)} ${yFor(p.high, extent, box)}`,
      );
      const bottom = [...run]
        .reverse()
        .map(
          (p) => `L ${xFor(p.index, count, box)} ${yFor(p.low, extent, box)}`,
        );
      shapes.push([...top, ...bottom, 'Z'].join(' '));
    }
    run = [];
  };

  for (let index = 0; index < count; index++) {
    const low = lower[index];
    const high = upper[index];
    if (low === null || low === undefined || high === null || high === undefined) {
      flush();
      continue;
    }
    run.push({ index, low, high });
  }
  flush();

  return shapes.join(' ');
}

/**
 * Bars rising from the baseline, on their own scale — precipitation shares the
 * x axis with temperature but never its y axis.
 *
 * Zero is a real reading (a dry day), so it yields a zero-height bar rather
 * than no bar at all; a missing reading yields nothing.
 */
export function toBars(
  values: (number | null)[],
  box: ChartBox,
  widthFactor = 0.6,
): Bar[] {
  const peak = Math.max(0, ...values.filter((v): v is number => v !== null));
  const baseline = box.padding.top + innerHeight(box);
  const slot = values.length > 1 ? innerWidth(box) / (values.length - 1) : innerWidth(box);
  const width = round(Math.max(0.5, slot * widthFactor));

  const bars: Bar[] = [];

  values.forEach((value, index) => {
    if (value === null) return;
    // Nothing was measured above zero anywhere — every bar would be full height.
    const height = peak === 0 ? 0 : round((value / peak) * innerHeight(box));
    bars.push({
      x: round(xFor(index, values.length, box) - width / 2),
      y: round(baseline - height),
      width,
      height,
    });
  });

  return bars;
}

/** One horizontal gridline: where it sits on the scale, and what it reads. */
export interface Tick {
  value: number;
  label: string;
}

/** Whether every value still reads differently at `decimals` decimal places. */
function labelsStayDistinct(values: number[], decimals: number): boolean {
  return new Set(values.map((v) => v.toFixed(decimals))).size === values.length;
}

/**
 * Evenly spaced tick values across an extent, labelled precisely enough that no
 * two of them read the same.
 *
 * The precision has to follow the step rather than be fixed: whole degrees are
 * right across a summer's range and wrong across a stable week, where 18–21 °C
 * rounds to 18, 19, 20, 20, 21 — the same number printed at two different
 * heights. Roughly a fifth of realistic ranges do this.
 */
export function ticksFor(extent: Extent, intervals: number): Tick[] {
  const step = (extent.max - extent.min) / intervals;
  const values = Array.from(
    { length: intervals + 1 },
    (_, i) => extent.min + i * step,
  );

  const decimals = [0, 1, 2].find((d) => labelsStayDistinct(values, d)) ?? 2;

  return values.map((value) => {
    // `(-0.04).toFixed(1)` is "-0.0"; a temperature axis should read "0.0".
    const rounded = Number(value.toFixed(decimals)) || 0;
    return { value, label: rounded.toFixed(decimals) };
  });
}

/**
 * One horizontal rule and the value printed beside it.
 *
 * `y` is where the rule is drawn, in viewBox units. `topPercent` is where the
 * *text* goes, because the text is HTML outside the stretched SVG — the two
 * numbers describe the same height in the two coordinate systems this design
 * deliberately keeps apart.
 */
export interface GridLine extends Tick {
  y: number;
  topPercent: number;
}

/** Every panel's y axis, in both coordinate systems at once. */
export function gridLinesFor(
  extent: Extent,
  intervals: number,
  box: ChartBox,
): GridLine[] {
  return ticksFor(extent, intervals).map((tick) => ({
    ...tick,
    y: yFor(tick.value, extent, box),
    topPercent: yPercent(tick.value, extent, box),
  }));
}

/**
 * Indices worth labelling on the x axis. Long ranges would otherwise print a
 * date per day and turn the axis into a smear.
 */
export function labelIndices(count: number, maxLabels = 6): number[] {
  if (count === 0) return [];
  if (count <= maxLabels) return Array.from({ length: count }, (_, i) => i);

  const step = (count - 1) / (maxLabels - 1);
  const indices = Array.from({ length: maxLabels }, (_, i) =>
    Math.round(i * step),
  );
  return [...new Set(indices)];
}

const MONTHS_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/**
 * '2026-08-19' -> '19 Aug'.
 *
 * Hand-built rather than reached for through `Intl`: the labels are three
 * letters in a fixed set, and formatting them properly would pull locale data
 * into the bundle to produce the same twelve strings.
 */
export function formatDayLabel(isoDate: string): string {
  const [, month, day] = isoDate.split('-');
  const monthIndex = Number(month) - 1;
  const name = MONTHS_SHORT[monthIndex];
  if (!name || !day) return isoDate;
  return `${Number(day)} ${name}`;
}
