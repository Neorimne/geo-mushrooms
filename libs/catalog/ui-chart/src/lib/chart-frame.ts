import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { AXIS_GUTTER_PX } from './chart-geometry';

/** One value on the vertical axis, and where it sits in the panel's height. */
export interface AxisTick {
  label: string;
  topPercent: number;
}

/** One date under the horizontal axis, and where it sits in the plot's width. */
export interface DateLabel {
  text: string;
  leftPercent: number;
}

/**
 * The axis furniture around a panel: y values in a gutter to the left of the
 * plot, dates in a row beneath it, and the projected `<svg>` in between.
 *
 * **Why the text is HTML and not `<text>` inside the SVG.** Every panel draws
 * with `preserveAspectRatio="none"` so the line geometry fills whatever box it
 * is given. That stretch is linear and applies to glyphs too: at 390px the x
 * scale is ~0.51 against a y scale of ~0.86, condensing letters to 59% of their
 * proportional width, and on a wide screen it inverts and stretches them by
 * about a third. A `font-size` in viewBox units therefore meant three different
 * numbers in three panels for one rendered size, all of them wrong at some
 * width. Out here `text-[11px]` is 11px everywhere.
 *
 * The gutter is `AXIS_GUTTER_PX` for the matching reason — see that constant.
 * Panels share it, so their plots start at the same x and the stack stays one
 * figure; `chart-frame.spec.ts` holds that alignment down.
 */
@Component({
  selector: 'lib-chart-frame',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <div class="relative" [style.padding-left.px]="gutter">
      <div
        class="absolute inset-y-0 left-0 pointer-events-none"
        [style.width.px]="gutter"
      >
        @for (tick of ticks(); track $index) {
          <span
            class="absolute right-1.5 -translate-y-1/2 text-[11px] sm:text-xs leading-none tabular-nums text-slate-600 dark:text-slate-400"
            [style.top.%]="tick.topPercent"
          >{{ tick.label }}</span>
        }
      </div>

      <ng-content />
    </div>

    @if (dateLabels().length) {
      <!-- The row is as wide as the plot, so a percentage here is the same
           percentage the line inside the SVG uses. -->
      <div class="relative mt-1.5 h-4" [style.padding-left.px]="gutter">
        <div class="relative h-full">
          @for (label of dateLabels(); track $index) {
            <!-- The end dates are pulled inside the plot rather than centred on
                 it: a centred first label hangs into the gutter and a centred
                 last one off the card. -->
            <span
              class="absolute top-0 text-[11px] sm:text-xs leading-none whitespace-nowrap text-slate-600 dark:text-slate-400"
              [style.left.%]="label.leftPercent"
              [style.transform]="
                $first
                  ? 'translateX(0)'
                  : $last
                    ? 'translateX(-100%)'
                    : 'translateX(-50%)'
              "
            >{{ label.text }}</span>
          }
        </div>
      </div>
    }
  `,
})
export class ChartFrameComponent {
  ticks = input<AxisTick[]>([]);
  dateLabels = input<DateLabel[]>([]);

  readonly gutter = AXIS_GUTTER_PX;
}
