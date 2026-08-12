import { describe, expect, it } from 'vitest';

import {
    getCalendarLanePresentation,
    getCalendarRowHeight,
    MIN_COMPACT_LANE_HEIGHT_PX,
} from '../../src/calendar-layout.js';

// These assertions are about *geometry*, not about class names: a band that is
// technically `compact` but 3px tall is the bug this module exists to prevent,
// and asserting `compact === true` alone would not have caught it. The visual
// counterpart is `pnpm ui:shoot --screen=week-crowded --measure`, which reports
// the same numbers as measured by a real browser against real CSS.

/** The px height a lane actually gets, given the row height the layout picks. */
function laneHeightPx(totalLanes, defaultRowHeightPx = 38) {
    const rowHeight = getCalendarRowHeight(totalLanes) ?? defaultRowHeightPx;
    const { height } = getCalendarLanePresentation(1, totalLanes);
    const [, percent, gap] = height.match(/calc\(([\d.]+)% - (\d+)px\)/).map(Number);
    return (rowHeight * percent) / 100 - gap;
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
        expect(getCalendarLanePresentation(1, 4).top).toBe('calc(0% + 0.5px)');
        expect(getCalendarLanePresentation(2, 4).top).toBe('calc(25% + 0.5px)');
        expect(getCalendarLanePresentation(4, 4).top).toBe('calc(75% + 0.5px)');
    });

    it('never renders a band below the readable minimum, however deep the stack', () => {
        for (let lanes = 3; lanes <= 12; lanes++) {
            expect(laneHeightPx(lanes)).toBeGreaterThanOrEqual(MIN_COMPACT_LANE_HEIGHT_PX);
        }
    });

    it('grows the row only when the default height cannot hold the stack', () => {
        // Shallow stacks keep the calendar's fixed vertical rhythm...
        expect(getCalendarRowHeight(1)).toBeNull();
        expect(getCalendarRowHeight(3)).toBeNull();
        // ...and a grown row is never shorter than an ungrown one, which an
        // unguarded `lanes * laneHeight` formula gets wrong for small counts.
        for (let lanes = 4; lanes <= 12; lanes++) {
            expect(getCalendarRowHeight(lanes)).toBeGreaterThan(38);
        }
    });

    it('clamps nonsense lane input instead of producing NaN geometry', () => {
        // totalLanes reaches this from a DOM measurement, so 0/NaN are reachable.
        expect(getCalendarLanePresentation(1, 0).height).not.toContain('NaN');
        expect(getCalendarLanePresentation(0, 0).top).not.toContain('NaN');
        expect(getCalendarLanePresentation(9, 3).top).toBe(getCalendarLanePresentation(3, 3).top);
        expect(getCalendarRowHeight(Number.NaN)).toBeNull();
    });
});
