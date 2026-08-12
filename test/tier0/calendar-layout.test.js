import { describe, expect, it } from 'vitest';

import { getCalendarLanePresentation, MAX_VISIBLE_LANES } from '../../src/calendar-layout.js';

// These assertions are about *geometry*, not about class names: a band that is
// technically `compact` but 3px tall is the bug this module exists to prevent,
// and asserting `compact === true` alone would not have caught it. The visual
// counterpart is `pnpm ui:shoot --screen=week-crowded --measure`, which reports
// the same numbers as measured by a real browser against real CSS.

const DAY_ROW_HEIGHT_PX = 38; // must track `.day-row { height }` in styles.css

/** The px height a lane actually gets in a real row. */
function laneHeightPx(lane, totalLanes) {
    const { height } = getCalendarLanePresentation(lane, totalLanes);
    const [, percent, gap] = height.match(/calc\(([\d.]+)% - (\d+)px\)/).map(Number);
    return (DAY_ROW_HEIGHT_PX * percent) / 100 - gap;
}

describe('calendar overlap presentation', () => {
    it('keeps labels for one or two overlapping schedules', () => {
        expect(getCalendarLanePresentation(1, 1).compact).toBe(false);
        expect(getCalendarLanePresentation(2, 2).compact).toBe(false);
    });

    it('uses label-free colour bands once three schedules overlap', () => {
        expect(getCalendarLanePresentation(1, 3).compact).toBe(true);
        expect(getCalendarLanePresentation(1, 9).compact).toBe(true);
    });

    it('spends less of the row on gaps once bars become bands', () => {
        // A 4px gap is a rounding detail on a full-height bar and most of the box
        // on a band, which is what turned bands into hairlines.
        expect(getCalendarLanePresentation(1, 2).height).toContain('- 4px');
        expect(getCalendarLanePresentation(1, 3).height).toContain('- 1px');
    });

    it('positions lane N below lane N-1', () => {
        expect(getCalendarLanePresentation(1, 3).top).toBe('calc(0% + 0.5px)');
        expect(getCalendarLanePresentation(2, 3).top).toBe('calc(33.333333333333336% + 0.5px)');
        expect(getCalendarLanePresentation(3, 3).top).toBe('calc(66.66666666666667% + 0.5px)');
    });

    it('withholds lanes past the cap instead of drawing slivers', () => {
        expect(getCalendarLanePresentation(MAX_VISIBLE_LANES, 9).overflow).toBe(false);
        expect(getCalendarLanePresentation(MAX_VISIBLE_LANES + 1, 9).overflow).toBe(true);
        // An overflow result has no geometry — callers must not write it to style.
        expect(getCalendarLanePresentation(MAX_VISIBLE_LANES + 1, 9).height).toBeNull();
    });

    it('divides the row by the lanes it draws, not the lanes that exist', () => {
        // The bug this guards: dividing by totalLanes after capping leaves the
        // bottom of the row empty and the bands no taller than before the cap.
        const deep = getCalendarLanePresentation(1, 12);
        const atCap = getCalendarLanePresentation(1, MAX_VISIBLE_LANES);
        expect(deep.height).toBe(atCap.height);
        expect(deep.top).toBe(atCap.top);
    });

    it('never renders a band below the readable minimum, however deep the stack', () => {
        for (let totalLanes = 3; totalLanes <= 12; totalLanes++) {
            for (let lane = 1; lane <= MAX_VISIBLE_LANES; lane++) {
                expect(laneHeightPx(lane, totalLanes)).toBeGreaterThanOrEqual(10);
            }
        }
    });

    it('clamps nonsense lane input instead of producing NaN geometry', () => {
        // totalLanes reaches this from a DOM measurement, so 0/NaN are reachable.
        expect(getCalendarLanePresentation(1, 0).height).not.toContain('NaN');
        expect(getCalendarLanePresentation(0, 0).top).not.toContain('NaN');
        expect(getCalendarLanePresentation(Number.NaN, 3).top).toBe('calc(0% + 0.5px)');
    });
});
