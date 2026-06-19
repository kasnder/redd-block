// Android bridge: maps between the shared AppData model and the legacy
// redd-block-android schedule format stored by tauri-plugin-androidblock.
import { invoke } from '@tauri-apps/api/core';

const ANDROID_DAYS = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];
const ANDROID_DAY_TO_INDEX = Object.fromEntries(ANDROID_DAYS.map((d, i) => [d, i]));
const ANDROID_UI_KIND_SCHEDULE_SEGMENT = 'schedule-segment';
const ANDROID_UI_KIND_ONE_OFF_BLOCK = 'one-off-block';

/** Latest plugin state: schedules, activeScheduleIds, permissions. */
export let androidPluginState = {
    schedules: [],
    activeScheduleIds: [],
    permissions: {},
};

export function androidAccessibilityGranted() {
    return !!androidPluginState.permissions?.accessibility;
}

export function androidPermissionsReady() {
    const p = androidPluginState.permissions || {};
    return !!(p.accessibility && p.batteryOptimization);
}

async function invokeStateCommand(command, payload = {}) {
    const response = await invoke(`plugin:androidblock|${command}`, payload);
    androidPluginState = JSON.parse(response.stateJson);
    return androidPluginState;
}

export async function refreshAndroidPluginState() {
    try {
        return await invokeStateCommand('get_state');
    } catch (e) {
        console.warn('[android-bridge] get_state failed:', e);
    }
    return androidPluginState;
}

async function androidSaveSchedule(scheduleJson) {
    return invokeStateCommand('save_schedule', { scheduleJson });
}

async function androidDeleteSchedule(id) {
    return invokeStateCommand('delete_schedule', { id });
}

export async function androidGetInstalledApps() {
    const { appsJson } = await invoke('plugin:androidblock|get_installed_apps');
    return JSON.parse(appsJson);
}

export async function androidOpenAccessibilitySettings() {
    return invoke('plugin:androidblock|open_accessibility_settings');
}

export async function androidOpenBatterySettings() {
    return invoke('plugin:androidblock|open_battery_settings');
}

function androidScheduleToBlocklist(androidSchedule) {
    return {
        id: androidSchedule.uiBlocklistId || androidSchedule.id,
        name: androidSchedule.name,
        mode: 'blocklist',
        websites: [...(androidSchedule.blockedWebsites || [])],
        apps: [...(androidSchedule.blockedApps || [])],
        color: '#B8D1DE',
        emoji: '🚫',
        showItemDetails: true,
        androidManaged: true,
    };
}

function androidTimingToSegments(timing) {
    if (timing?.activeFromTimestampMs != null && timing?.activeUntilTimestampMs != null) {
        const start = new Date(timing.activeFromTimestampMs);
        const end = new Date(timing.activeUntilTimestampMs);
        const dayIndex = (start.getDay() + 6) % 7;
        return [{
            startHour: start.getHours(),
            startMinute: start.getMinutes(),
            endHour: end.getHours(),
            endMinute: end.getMinutes(),
            days: [dayIndex],
        }];
    }

    if (!timing || timing.type === 'MANUAL') {
        return [{
            startHour: 0,
            startMinute: 0,
            endHour: 23,
            endMinute: 59,
            days: [0, 1, 2, 3, 4, 5, 6],
        }];
    }

    const days = timing.type === 'DAILY'
        ? [0, 1, 2, 3, 4, 5, 6]
        : (timing.daysOfWeek || [])
            .map((d) => ANDROID_DAY_TO_INDEX[d])
            .filter((n) => n !== undefined);

    return [{
        startHour: timing.timeHour ?? 9,
        startMinute: timing.timeMinute ?? 0,
        endHour: timing.endTimeHour ?? 17,
        endMinute: timing.endTimeMinute ?? 0,
        days,
    }];
}

function androidScheduleToSharedSchedule(androidSchedule) {
    const timing = androidSchedule.schedule || { type: 'MANUAL' };
    return {
        id: androidSchedule.uiScheduleId || androidSchedule.id,
        blocklistId: androidSchedule.uiBlocklistId || androidSchedule.id,
        segments: androidTimingToSegments(timing),
        repeatType: timing.isRecurring ? 'forever' : 'once',
        createdAt: timing.activeFromTimestampMs ?? Date.now(),
        extra: {
            androidTimingType: timing.type || 'MANUAL',
            androidIsEnabled: androidSchedule.isEnabled !== false,
            frictionWordCount: androidSchedule.frictionWordCount ?? 15,
            autoReenableMinutes: androidSchedule.autoReenableMinutes ?? 1440,
            disabledUntil: androidSchedule.disabledUntil ?? null,
        },
    };
}

function androidScheduleToSharedBlock(androidSchedule) {
    const timing = androidSchedule.schedule || {};
    const startTime = timing.activeFromTimestampMs ?? Date.now();
    const endTime = timing.activeUntilTimestampMs ?? startTime;
    const block = {
        id: androidSchedule.uiScheduleId || androidSchedule.id,
        blocklistId: androidSchedule.uiBlocklistId || androidSchedule.id,
        startTime,
        endTime,
    };
    if (androidSchedule.disabledUntil && androidSchedule.disabledUntil > Date.now()) {
        block.isPaused = true;
        block.pauseEndTime = androidSchedule.disabledUntil;
    }
    return block;
}

function isAndroidPluginScheduleExpired(androidSchedule, pluginState = androidPluginState) {
    const activeIds = new Set(pluginState.activeScheduleIds || []);
    const activeUntil = androidSchedule?.schedule?.activeUntilTimestampMs;
    return activeUntil != null && activeUntil <= Date.now() && !activeIds.has(androidSchedule.id);
}

function ensureAndroidBlocklist(appData, androidSchedule) {
    const blocklistId = androidSchedule.uiBlocklistId || androidSchedule.id;
    let blocklist = (appData.blocklists || []).find((bl) => bl.id === blocklistId);
    if (!blocklist) {
        blocklist = androidScheduleToBlocklist(androidSchedule);
        if (!appData.blocklists) appData.blocklists = [];
        appData.blocklists.push(blocklist);
        return blocklist;
    }
    blocklist.name = androidSchedule.name || blocklist.name;
    blocklist.apps = [...(androidSchedule.blockedApps || [])];
    blocklist.websites = [...(androidSchedule.blockedWebsites || [])];
    blocklist.androidManaged = true;
    return blocklist;
}

/** Merge plugin schedules into appData without destroying shared-shell metadata. */
export function hydrateAppDataFromAndroid(appData, pluginState = androidPluginState) {
    const schedules = pluginState.schedules || [];
    if (schedules.length === 0) {
        return false;
    }

    const scheduleGroups = new Map();
    const nextActiveBlocks = [];

    for (const androidSchedule of schedules) {
        if (isAndroidPluginScheduleExpired(androidSchedule, pluginState)) continue;
        ensureAndroidBlocklist(appData, androidSchedule);

        if (androidSchedule.uiKind === ANDROID_UI_KIND_ONE_OFF_BLOCK) {
            nextActiveBlocks.push(androidScheduleToSharedBlock(androidSchedule));
            continue;
        }

        const groupId = androidSchedule.uiScheduleId || androidSchedule.id;
        if (!scheduleGroups.has(groupId)) scheduleGroups.set(groupId, []);
        scheduleGroups.get(groupId).push(androidSchedule);
    }

    const existingSchedulesById = new Map((appData.schedules || []).map((schedule) => [schedule.id, schedule]));
    const nextSchedules = [];

    for (const [groupId, groupSchedules] of scheduleGroups.entries()) {
        const existing = existingSchedulesById.get(groupId);
        const seed = existing ? { ...existing } : androidScheduleToSharedSchedule(groupSchedules[0]);
        seed.id = groupId;
        seed.blocklistId = groupSchedules[0].uiBlocklistId || seed.blocklistId;

        if (!existing || !Array.isArray(existing.segments) || existing.segments.length === 0) {
            const ordered = [...groupSchedules].sort((a, b) => {
                const segA = a.uiSegmentIndex ?? 0;
                const segB = b.uiSegmentIndex ?? 0;
                return segA - segB || a.id.localeCompare(b.id);
            });
            seed.segments = ordered.flatMap((schedule) => androidTimingToSegments(schedule.schedule || {}));
        }

        const pausedUntil = groupSchedules
            .map((schedule) => schedule.disabledUntil ?? null)
            .find((value) => value != null && value > Date.now());

        if (pausedUntil != null) {
            seed.isPaused = true;
            seed.pauseEndTime = pausedUntil;
        } else {
            delete seed.isPaused;
            delete seed.pauseEndTime;
        }

        if (!seed.extra) seed.extra = {};
        seed.extra.androidIsEnabled = groupSchedules.some((schedule) => schedule.isEnabled !== false);
        seed.extra.disabledUntil = pausedUntil ?? null;
        nextSchedules.push(seed);
    }

    appData.schedules = nextSchedules;
    appData.activeBlocks = nextActiveBlocks;
    return true;
}

function isSharedOneShotSchedule(schedule) {
    return !!schedule && schedule.repeatType !== 'forever' && !(schedule.repeatType === 'date' && schedule.repeatDate);
}

function resolveSharedOneShotOccurrences(schedule) {
    if (!isSharedOneShotSchedule(schedule) || !Array.isArray(schedule.segments)) return [];
    const createdAt = new Date(schedule.createdAt || Date.now());
    if (Number.isNaN(createdAt.getTime())) return [];

    const createdDay = (createdAt.getDay() + 6) % 7;
    const occurrences = [];

    schedule.segments.forEach((segment, segmentIndex) => {
        const segmentDays = Array.isArray(segment.days)
            ? segment.days.filter((day) => Number.isInteger(day) && day >= 0 && day <= 6)
            : [];

        segmentDays.forEach((dayIndex, occurrenceIndex) => {
            let daysUntil = dayIndex - createdDay;
            if (daysUntil < 0) daysUntil += 7;

            const start = new Date(createdAt);
            start.setDate(start.getDate() + daysUntil);
            start.setHours(segment.startHour, segment.startMinute, 0, 0);

            const end = new Date(start);
            end.setHours(segment.endHour, segment.endMinute, 0, 0);
            if (end <= start) end.setDate(end.getDate() + 1);

            occurrences.push({ segment, segmentIndex, occurrenceIndex, dayIndex, start, end });
        });
    });

    occurrences.sort((a, b) => a.start.getTime() - b.start.getTime() || a.segmentIndex - b.segmentIndex);
    return occurrences;
}

function sharedSegmentToAndroidSchedules(blocklist, schedule) {
    const extra = schedule.extra || {};
    const frictionWordCount = extra.frictionWordCount ?? 15;
    const autoReenableMinutes = extra.autoReenableMinutes ?? 1440;
    const pausedUntil = schedule.isPaused ? (schedule.pauseEndTime || extra.disabledUntil || null) : null;
    const boundedRepeatUntil = schedule.repeatType === 'date' && schedule.repeatDate
        ? new Date(new Date(schedule.repeatDate).setHours(23, 59, 59, 999)).getTime()
        : null;

    if (isSharedOneShotSchedule(schedule)) {
        return resolveSharedOneShotOccurrences(schedule).map((occurrence) => ({
            id: `${schedule.id}::seg:${occurrence.segmentIndex}::occ:${occurrence.occurrenceIndex}`,
            name: blocklist?.name || schedule.id,
            isEnabled: !(pausedUntil && pausedUntil > Date.now()),
            schedule: {
                type: 'DAILY',
                timeHour: occurrence.start.getHours(),
                timeMinute: occurrence.start.getMinutes(),
                endTimeHour: occurrence.end.getHours(),
                endTimeMinute: occurrence.end.getMinutes(),
                daysOfWeek: [ANDROID_DAYS[occurrence.dayIndex]].filter(Boolean),
                isRecurring: false,
                activeFromTimestampMs: occurrence.start.getTime(),
                activeUntilTimestampMs: occurrence.end.getTime(),
            },
            blockedApps: [...(blocklist?.apps || [])],
            blockedWebsites: [...(blocklist?.websites || [])],
            frictionWordCount,
            autoReenableMinutes,
            ...(pausedUntil != null ? { disabledUntil: pausedUntil } : {}),
            uiKind: ANDROID_UI_KIND_SCHEDULE_SEGMENT,
            uiScheduleId: schedule.id,
            uiBlocklistId: schedule.blocklistId,
            uiSegmentIndex: occurrence.segmentIndex,
            uiBlocklistColor: blocklist?.color ?? null,
            uiBlocklistEmoji: blocklist?.emoji ?? null,
        }));
    }

    return (schedule.segments || []).map((segment, segmentIndex) => {
        const days = Array.isArray(segment.days) ? segment.days : [];
        const timingType = days.length >= 7 ? 'DAILY' : 'WEEKLY';
        return {
            id: `${schedule.id}::seg:${segmentIndex}`,
            name: blocklist?.name || schedule.id,
            isEnabled: !(pausedUntil && pausedUntil > Date.now()),
            schedule: {
                type: timingType,
                timeHour: segment.startHour,
                timeMinute: segment.startMinute,
                endTimeHour: segment.endHour,
                endTimeMinute: segment.endMinute,
                daysOfWeek: timingType === 'DAILY'
                    ? [...ANDROID_DAYS]
                    : days.map((index) => ANDROID_DAYS[index]).filter(Boolean),
                isRecurring: true,
                ...(boundedRepeatUntil != null ? { activeUntilTimestampMs: boundedRepeatUntil } : {}),
            },
            blockedApps: [...(blocklist?.apps || [])],
            blockedWebsites: [...(blocklist?.websites || [])],
            frictionWordCount,
            autoReenableMinutes,
            ...(pausedUntil != null ? { disabledUntil: pausedUntil } : {}),
            uiKind: ANDROID_UI_KIND_SCHEDULE_SEGMENT,
            uiScheduleId: schedule.id,
            uiBlocklistId: schedule.blocklistId,
            uiSegmentIndex: segmentIndex,
            uiBlocklistColor: blocklist?.color ?? null,
            uiBlocklistEmoji: blocklist?.emoji ?? null,
        };
    });
}

function sharedBlockToAndroid(blocklist, block) {
    return {
        id: `block:${block.id}`,
        name: blocklist?.name || block.blocklistId || block.id,
        isEnabled: !(block.isPaused && block.pauseEndTime > Date.now()),
        schedule: {
            type: 'DAILY',
            timeHour: new Date(block.startTime).getHours(),
            timeMinute: new Date(block.startTime).getMinutes(),
            endTimeHour: new Date(block.endTime).getHours(),
            endTimeMinute: new Date(block.endTime).getMinutes(),
            daysOfWeek: [ANDROID_DAYS[(new Date(block.startTime).getDay() + 6) % 7]].filter(Boolean),
            isRecurring: false,
            activeFromTimestampMs: block.startTime,
            activeUntilTimestampMs: block.endTime,
        },
        blockedApps: [...(blocklist?.apps || [])],
        blockedWebsites: [...(blocklist?.websites || [])],
        frictionWordCount: blocklist?.overrideDifficulty?.count ?? 25,
        autoReenableMinutes: 0,
        ...(block.isPaused && block.pauseEndTime ? { disabledUntil: block.pauseEndTime } : {}),
        uiKind: ANDROID_UI_KIND_ONE_OFF_BLOCK,
        uiScheduleId: block.id,
        uiBlocklistId: block.blocklistId,
        uiBlocklistColor: blocklist?.color ?? null,
        uiBlocklistEmoji: blocklist?.emoji ?? null,
    };
}

/** Push all shared schedules + one-off blocks to the Android plugin (enforcement source of truth). */
export async function syncAppDataToAndroidPlugin(appData) {
    const androidSchedules = [];

    for (const schedule of appData.schedules || []) {
        const blocklist = appData.blocklists.find((bl) => bl.id === schedule.blocklistId);
        androidSchedules.push(...sharedSegmentToAndroidSchedules(blocklist, schedule));
    }

    for (const block of appData.activeBlocks || []) {
        const blocklist = appData.blocklists.find((bl) => bl.id === block.blocklistId);
        androidSchedules.push(sharedBlockToAndroid(blocklist, block));
    }

    const existingIds = new Set((androidPluginState.schedules || []).map((s) => s.id));
    const nextIds = new Set(androidSchedules.map((s) => s.id));

    for (const id of existingIds) {
        if (!nextIds.has(id)) {
            await androidDeleteSchedule(id);
        }
    }

    for (const schedule of androidSchedules) {
        await androidSaveSchedule(JSON.stringify(schedule));
    }

    await refreshAndroidPluginState();
    return androidPluginState;
}
