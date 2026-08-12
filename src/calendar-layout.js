// Lane geometry for overlapping calendar blocks.
//
// A day row is one fixed-height strip, and every schedule overlapping in time
// has to fit inside it. Two thresholds matter, and they are not the same one:
//
//   - Below COMPACT_CALENDAR_LANE_THRESHOLD lanes each bar still has room for
//     its emoji, name and time, so it keeps them.
//   - At or above it there is less than a line of text per lane, so the bar
//     drops its contents and becomes a colour band identified by the matching
//     header swatch (and, on pointer devices, its tooltip).
//
// The gap between lanes shrinks in the second case. At 4px it is a rounding
// detail on a full-height bar, but on a 7px band it is most of the band —
// spending it on whitespace leaves a hairline that reads as a dotted rule
// rather than as a colour.
//
// Past MAX_FIXED_HEIGHT_LANES even that is not enough, so the row grows instead
// of dividing further. Sub-pixel bands are not a denser view of the data, they
// are an unreadable one, and a taller row is the honest trade.

const COMPACT_CALENDAR_LANE_THRESHOLD = 3;
const MAX_FIXED_HEIGHT_LANES = 3;

const LANE_GAP_PX = 4;
const COMPACT_LANE_GAP_PX = 1;

// Enough vertical colour for a band to register as a band. Below roughly this,
// adjacent hues stop being separable at a glance.
export const MIN_COMPACT_LANE_HEIGHT_PX = 9;

// Must track `.day-row { height }` in styles.css. Growth is measured against it
// so that a crowded row never comes out *shorter* than an empty one.
const DEFAULT_ROW_HEIGHT_PX = 38;

/**
 * Rows deeper than MAX_FIXED_HEIGHT_LANES grow rather than subdividing further.
 * Returns the height in px the row needs, or null to keep the CSS default.
 */
export function getCalendarRowHeight(totalLanes) {
    const safeTotalLanes = Math.max(1, Math.trunc(totalLanes) || 1);
    if (safeTotalLanes <= MAX_FIXED_HEIGHT_LANES) return null;

    const needed = safeTotalLanes * (MIN_COMPACT_LANE_HEIGHT_PX + COMPACT_LANE_GAP_PX) + COMPACT_LANE_GAP_PX;
    return needed > DEFAULT_ROW_HEIGHT_PX ? needed : null;
}

export function getCalendarLanePresentation(lane, totalLanes) {
    const safeTotalLanes = Math.max(1, Math.trunc(totalLanes) || 1);
    const safeLane = Math.min(safeTotalLanes, Math.max(1, Math.trunc(lane) || 1));
    const lanePercent = 100 / safeTotalLanes;
    const compact = safeTotalLanes >= COMPACT_CALENDAR_LANE_THRESHOLD;
    const gap = compact ? COMPACT_LANE_GAP_PX : LANE_GAP_PX;

    return {
        top: `calc(${(safeLane - 1) * lanePercent}% + ${gap / 2}px)`,
        height: `calc(${lanePercent}% - ${gap}px)`,
        compact,
    };
}
