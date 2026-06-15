// Android bridge: maps between the shared AppData model and the legacy
// redd-block-android schedule format stored by tauri-plugin-androidblock.
import { invoke } from '@tauri-apps/api/core';

const ANDROID_DAYS = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];
const ANDROID_DAY_TO_INDEX = Object.fromEntries(ANDROID_DAYS.map((d, i) => [d, i]));
const INDEX_TO_ANDROID_DAY = ANDROID_DAYS;

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
    return !!(p.accessibility && p.notifications && p.batteryOptimization);
}

export async function refreshAndroidPluginState() {
    try {
        const response = await invoke('plugin:androidblock|get_state');
        androidPluginState = JSON.parse(response.stateJson);
    } catch (e) {
        console.warn('[android-bridge] get_state failed:', e);
    }
    return androidPluginState;
}

export async function androidSaveSchedule(scheduleJson) {
    const response = await invoke('plugin:androidblock|save_schedule', { scheduleJson });
    androidPluginState = JSON.parse(response.stateJson);
    return androidPluginState;
}

export async function androidDeleteSchedule(id) {
    const response = await invoke('plugin:androidblock|delete_schedule', { id });
    androidPluginState = JSON.parse(response.stateJson);
    return androidPluginState;
}

export async function androidToggleSchedule(id) {
    const response = await invoke('plugin:androidblock|toggle_schedule', { id });
    androidPluginState = JSON.parse(response.stateJson);
    return androidPluginState;
}

export async function androidGetInstalledApps() {
    const { appsJson } = await invoke('plugin:androidblock|get_installed_apps');
    return JSON.parse(appsJson);
}

export async function androidOpenAccessibilitySettings() {
    return invoke('plugin:androidblock|open_accessibility_settings');
}

export async function androidOpenNotificationSettings() {
    return invoke('plugin:androidblock|open_notification_settings');
}

export async function androidOpenBatterySettings() {
    return invoke('plugin:androidblock|open_battery_settings');
}

function androidScheduleToBlocklist(androidSchedule) {
    return {
        id: androidSchedule.id,
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
        id: androidSchedule.id,
        blocklistId: androidSchedule.id,
        segments: androidTimingToSegments(timing),
        repeatType: 'forever',
        createdAt: Date.now(),
        extra: {
            androidTimingType: timing.type || 'MANUAL',
            androidIsEnabled: androidSchedule.isEnabled !== false,
            frictionWordCount: androidSchedule.frictionWordCount ?? 15,
            autoReenableMinutes: androidSchedule.autoReenableMinutes ?? 1440,
            disabledUntil: androidSchedule.disabledUntil ?? null,
        },
    };
}

/** Overlay plugin schedules onto appData (one blocklist per Android schedule). */
export function hydrateAppDataFromAndroid(appData, pluginState = androidPluginState) {
    const schedules = pluginState.schedules || [];
    if (schedules.length === 0) {
        return false;
    }

    appData.blocklists = schedules.map(androidScheduleToBlocklist);
    appData.schedules = schedules.map(androidScheduleToSharedSchedule);
    appData.activeBlocks = [];
    return true;
}

function sharedScheduleToAndroid(blocklist, schedule) {
    const extra = schedule.extra || {};
    const timingType = extra.androidTimingType || 'WEEKLY';
    const seg = schedule.segments?.[0] || {
        startHour: 9,
        startMinute: 0,
        endHour: 17,
        endMinute: 0,
        days: [0, 1, 2, 3, 4, 5],
    };

    const timing = {
        type: timingType,
        isRecurring: true,
        daysOfWeek: [],
    };

    if (timingType !== 'MANUAL') {
        timing.timeHour = seg.startHour;
        timing.timeMinute = seg.startMinute;
        timing.endTimeHour = seg.endHour;
        timing.endTimeMinute = seg.endMinute;
    }

    if (timingType === 'DAILY') {
        timing.daysOfWeek = [...ANDROID_DAYS];
    } else if (timingType === 'WEEKLY') {
        timing.daysOfWeek = (seg.days || [])
            .map((i) => INDEX_TO_ANDROID_DAY[i])
            .filter(Boolean);
    }

    const androidSchedule = {
        id: schedule.id,
        name: blocklist?.name || schedule.id,
        isEnabled: extra.androidIsEnabled !== false,
        schedule: timing,
        blockedApps: [...(blocklist?.apps || [])],
        blockedWebsites: [...(blocklist?.websites || [])],
        frictionWordCount: extra.frictionWordCount ?? 15,
        autoReenableMinutes: extra.autoReenableMinutes ?? 1440,
    };

    if (extra.disabledUntil != null) {
        androidSchedule.disabledUntil = extra.disabledUntil;
    }

    return androidSchedule;
}

/** Push all shared schedules to the Android plugin (enforcement source of truth). */
export async function syncAppDataToAndroidPlugin(appData) {
    const androidSchedules = (appData.schedules || []).map((schedule) => {
        const blocklist = appData.blocklists.find((bl) => bl.id === schedule.blocklistId);
        return sharedScheduleToAndroid(blocklist, schedule);
    });

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
