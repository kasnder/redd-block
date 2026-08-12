// Lane geometry for overlapping calendar blocks.
//
// A day row is one fixed-height strip, and every schedule overlapping in time
// has to fit inside it. Three thresholds shape what that looks like:
//
//   - Below COMPACT_CALENDAR_LANE_THRESHOLD lanes each bar still has room for
//     its emoji, name and time, so it keeps them.
//   - At or above it there is less than a line of text per lane, so the bar
//     drops its contents and becomes a colour band identified by the matching
//     header swatch.
//   - Past MAX_VISIBLE_LANES the row stops dividing altogether. Splitting 38px
//     five ways yields 3px bands, which are not a denser view of the data —
//     they are an unreadable one. The extra schedules are withheld from the
//     grid and counted in an overflow pill instead, so the row stays scannable
//     and the user can still see that something is there.
//
// The gap between lanes shrinks once bars become bands. At 4px it is a rounding
// detail on a full-height bar, but on a 10px band it is most of the band —
// spending it on whitespace leaves a hairline that reads as a dotted rule
// rather than as a colour.

const COMPACT_CALENDAR_LANE_THRESHOLD = 3;

// Three lanes in a 38px row leaves ~11px per band, which is the point where
// adjacent hues stop being separable at a glance. Raising this without raising
// the row height re-creates the hairlines.
export const MAX_VISIBLE_LANES = 3;

const LANE_GAP_PX = 4;
const COMPACT_LANE_GAP_PX = 1;

/**
 * Geometry for one lane, or `{ overflow: true }` when the lane is past the cap
 * and the block should not be drawn at all.
 */
export function getCalendarLanePresentation(lane, totalLanes) {
    const safeTotalLanes = Math.max(1, Math.trunc(totalLanes) || 1);
    const safeLane = Math.max(1, Math.trunc(lane) || 1);

    if (safeLane > MAX_VISIBLE_LANES) {
        return { overflow: true, compact: true, top: null, height: null };
    }

    // Divide by the number of lanes actually drawn, not the number that exist —
    // otherwise capping the lanes would leave the row's remaining space empty
    // and the bands no taller than before.
    const drawnLanes = Math.min(safeTotalLanes, MAX_VISIBLE_LANES);
    const lanePercent = 100 / drawnLanes;
    const compact = safeTotalLanes >= COMPACT_CALENDAR_LANE_THRESHOLD;
    const gap = compact ? COMPACT_LANE_GAP_PX : LANE_GAP_PX;

    return {
        overflow: false,
        top: `calc(${(safeLane - 1) * lanePercent}% + ${gap / 2}px)`,
        height: `calc(${lanePercent}% - ${gap}px)`,
        compact,
    };
}
