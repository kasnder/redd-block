// Tauri API imports - proper ES modules from @tauri-apps/api
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { ask, message, open as openDialog } from '@tauri-apps/plugin-dialog';
import { readTextFile } from '@tauri-apps/plugin-fs';
import iconChromeUrl from './images/icon-chrome.svg';
import iconEdgeUrl from './images/icon-edge.svg';
import iconFirefoxUrl from './images/icon-firefox.svg';
import iconSafariUrl from './images/icon-safari.svg';
import screenshotChromeStep1 from './images/toggle-chrome-incognito-windows-1.png';
import screenshotChromeStep2 from './images/toggle-chrome-incognito-windows-2.png';
import screenshotEdgeStep1 from './images/toggle-edge-incognito-windows-1.png';
import screenshotEdgeStep2 from './images/toggle-edge-incognito-windows-2.png';
import screenshotFirefoxStep1 from './images/toggle-firefox-private-windows-1.png';
import screenshotFirefoxStep2 from './images/toggle-firefox-private-windows-2.png';
import screenshotSafariStep1 from './images/mac-extension-settings-1.png';
import screenshotSafariStep2 from './images/mac-extension-settings-2.png';

// Compatibility layer wrapping Tauri APIs
const tauriAPI = {
    // Core data operations
    loadData: () => invoke('load_data'),
    saveData: (data) => invoke('save_data', { data }),
    getAppVersion: () => invoke('get_app_version'),

    // Window operations
    setWindowSize: (width, height) => invoke('set_window_size', { width, height }),
    minimizeWindow: () => getCurrentWindow().minimize(),
    maximizeWindow: async () => {
        const win = getCurrentWindow();
        if (await win.isMaximized()) {
            return win.unmaximize();
        }
        return win.maximize();
    },
    // Routes through the Rust `hide_main_window` command so the macOS
    // activation policy can flip back to Accessory at the same time
    // (Dock icon + global menu bar disappear when the window closes).
    closeWindow: () => invoke('hide_main_window').catch(() => getCurrentWindow().hide()),

    // Helper daemon operations
    checkHelperStatus: () => invoke('check_helper_status').catch(() => ({ installed: false, running: false })),
    checkHelper: async () => {
        const status = await invoke('check_helper_status').catch(() => ({ installed: false, running: false }));
        return status.running === true;
    },
    installHelper: () => invoke('install_helper'),
    uninstallHelper: () => invoke('uninstall_helper'),
    startBlockViaHelper: (data) => invoke('start_block_via_helper', { ...data }),
    // Tauri maps Rust snake_case params to camelCase in JS; use blocklistId not blocklist_id
    clearBlockViaHelper: (blocklistId) => invoke('clear_block_via_helper', blocklistId != null ? { blocklistId } : {}),
    cleanHostsFile: () => invoke('clean_hosts_file'),
    getHelperDiagnostics: () => invoke('get_helper_diagnostics'),
    setBlocksViaHelper: (blocks) => invoke('set_blocks_via_helper', { blocks }),

    // App operations
    openAppPicker: () => invoke('open_app_picker'),
    blockWebsites: (domains) => invoke('block_websites', { domains }),

    // App blocking via helper daemon (persistent, survives app close)
    setBlockedAppsViaHelper: (apps) => invoke('set_blocked_apps_via_helper', { apps }),

    // Schedule management via helper daemon (persistent, handles transitions autonomously)
    setSchedulesViaHelper: (schedules) => invoke('set_schedules_via_helper', { schedules }),

    // Screen Time API (iOS only - provided by tauri-plugin-screentime)
    screentimeRequestAuth: () => invoke('plugin:screentime|request_authorization'),
    screentimeCheckAuth: () => invoke('plugin:screentime|check_authorization'),
    screentimeBlockWebsites: (domains) => invoke('plugin:screentime|block_websites', { domains }),
    screentimeUnblockWebsites: () => invoke('plugin:screentime|unblock_websites'),
    screentimeStartBlock: (payload) => invoke('plugin:screentime|screentime_start_block', payload),
    screentimeClearBlock: () => invoke('plugin:screentime|screentime_clear_block'),
    showActivityPicker: (payload = {}) => invoke('plugin:screentime|show_activity_picker', payload),
    setSchedulesPlugin: (schedules) => invoke('plugin:screentime|set_schedules', { schedules }),
    screentimeRegisterOneOffActivity: (activityName, startTimestampMs) =>
        invoke('plugin:screentime|register_one_off_activity', { activityName, startTimestampMs }),
    screentimeSetResumePayload: (payload) =>
        invoke('plugin:screentime|set_resume_payload', payload),
    screentimeSetBlockEndState: (payload) =>
        invoke('plugin:screentime|set_block_end_state', payload),

    // Event listening
    onBlocksUpdated: (callback) => listen('blocks-updated', callback),
    onMenuZoomIn: (callback) => listen('menu-zoom-in', callback),
    onMenuZoomOut: (callback) => listen('menu-zoom-out', callback),
    onMenuZoomReset: (callback) => listen('menu-zoom-reset', callback),
    onMenuHelpReportIssue: (callback) => listen('menu-help-report-issue', callback),
    onMenuHelpContactUs: (callback) => listen('menu-help-contact-us', callback),
    onMenuHelpWhoWeAre: (callback) => listen('menu-help-who-we-are', callback),

    // Enforcer events (desktop only)
    onEnforcerGraceUpdate: (callback) => listen('enforcer://grace-update', callback),
    onEnforcerGraceResolved: (callback) => listen('enforcer://grace-resolved', callback),
    onEnforcerBrowserClosed: (callback) => listen('enforcer://browser-closed', callback),

    // App blocking: force-quit warning overlay (desktop)
    onAppBlockingWarningShow: (callback) => listen('app-blocking://warning-show', callback),
    onAppBlockingWarningUpdate: (callback) => listen('app-blocking://warning-update', callback),
    onAppBlockingWarningHide: (callback) => listen('app-blocking://warning-hide', callback),
    appBlockingBringForwardThenQuitAgain: (pids) =>
        invoke('app_blocking_bring_forward_then_quit_again', { pids }),
    resizeBlockingWarningInner: (width, height) =>
        invoke('resize_blocking_warning_inner_size', { width, height }),
    // Toggles the always-on-top compact-window panel mode (the same
    // mechanism the native app-blocking watcher uses, refcounted in
    // Rust). Used by the scheduled-block heads-up countdown.
    enterBlockingWarningPanelMode: () => invoke('enter_blocking_warning_panel_mode'),
    leaveBlockingWarningPanelMode: () => invoke('leave_blocking_warning_panel_mode'),

    // macOS-only in-app uninstall. Disables launch-at-login, scrubs
    // browser native-messaging manifests, and schedules a delayed
    // self-delete of /Applications/ReDD Block.app. Caller is responsible
    // for confirming with the user and refusing to invoke while blocks
    // are running. See src-tauri/src/commands/uninstall.rs.
    uninstallSelfMacos: () => invoke('uninstall_self_macos'),
};

async function openUrl(url, openWith) {
    return invoke('plugin:opener|open_url', {
        url,
        with: openWith,
    });
}

// State
let appData = {
    blocklists: [],
    activeBlocks: [],
    schedules: [],
    settings: {}
};

// Expose for integration tests (dev mode only)
window.__REDDBLOCK_INTERNALS__ = {
    get appData() { return appData; },
    set appData(val) { appData = val; }
};

let selectedBlocklistId = null;
let editingBlocklistId = null;
let blocklistModalPreviewSnapshot = null;
/** Blocklist modal undo: session-scoped stack and "last" values for recording previous state. */
let blocklistModalUndoStack = [];
let blocklistModalApplyingUndo = false;

function pushModalUndo(type, undoFn) {
    if (blocklistModalApplyingUndo) return;
    blocklistModalUndoStack.push({ type, undo: undoFn });
}

let lastBlocklistNameValue = '';
let lastOverrideCountValue = '';
let lastCustomOverrideTextValue = '';
let lastOverrideTypeValue = '';
let lastOverrideCountValueBeforeMaxDifficulty = 50;
let lastOverrideTypeValueBeforeMaxDifficulty = 'random-words';
/** Reference to the removed Custom Text option so it can be re-added (getElementById returns null after remove()). */
let overrideBlockId = null;
/** Blocklist id to pass to helper when confirming single-block override (set when opening modal). */
let overrideBlocklistIdForHelper = null;
let challengeText = '';
let lastBlockedDomains = new Set(); // Track what's currently blocked to avoid re-prompting
let activatedBlockIds = new Set(); // Track blocks that have already triggered host updates
let helperAvailable = false; // Track if the privileged helper daemon is running
const HELPER_STATUS_CACHE_TTL_MS = 3000;
let lastDesktopHelperStatus = null;
let lastDesktopHelperStatusAt = 0;
let draggedBlocklistId = null; // Track which blocklist is being dragged
let isIOS = false; // Track if running on iOS
let screentimeAuthorized = false; // Track if Screen Time is authorized (iOS)
let startupInitializationPromise = null; // Prevent duplicate post-onboarding startup runs
let startupInitializationComplete = false; // Track whether post-onboarding startup already ran
let pauseBlockId = null; // Track which block is being paused
let pauseChallengeText = ''; // Challenge text for pause modal
let pauseMaxMinutes = null; // Maximum pause duration in minutes (null = unlimited)
let pauseScheduleData = null; // Track schedule-specific pause data { blocklistId, segmentEndTime }
const MIN_OVERRIDE_CHARS = 5;
const DEFAULT_OVERRIDE_COUNT = 10;
const TARGET_MAX_OVERRIDE_MINUTES = 30;
/** When character count >= this, preview text is frozen (no more regeneration) for random words and gibberish. */
const OVERRIDE_PREVIEW_TRUNCATE_AT = 37;
let overridePreviewFrozenByType = { 'random-words': null, 'gibberish': null };
let lastOverridePreviewType = null;
const UI_ZOOM_MIN = 0.8;
const UI_ZOOM_MAX = 1.8;
const UI_ZOOM_MAX_DESKTOP = 1.5;  // cap on macOS/Windows (native webview zoom)
const UI_ZOOM_STEP = 0.1;
const DEFAULT_UI_ZOOM = 1.1;
let zoomToastHideTimeout = null;
let nativeWebviewZoomSupported = null;

// Pre-made website lists offered by the Edit Blocklist "Import" menu. Each
// list is intentionally small/curated — a starting point users can prune or
// extend after import. Keys match the data-preset attributes in index.html.
const WEBSITES_PRESET_LISTS = {
    'email': [
        'gmail.com', 'mail.google.com', 'outlook.com', 'outlook.live.com',
        'mail.yahoo.com', 'icloud.com', 'mail.proton.me', 'proton.me',
        'fastmail.com', 'hey.com', 'mail.aol.com', 'mail.ru', 'gmx.com',
        'tutanota.com', 'zoho.com'
    ],
    'gambling': [
        'bet365.com', 'pokerstars.com', 'draftkings.com', 'fanduel.com',
        'betmgm.com', 'caesars.com', 'betfair.com', 'paddypower.com',
        'williamhill.com', 'ladbrokes.com', 'betway.com', 'unibet.com',
        '888.com', 'pinnacle.com', 'bovada.lv'
    ],
    'news': [
        'cnn.com', 'nytimes.com', 'bbc.com', 'bbc.co.uk', 'theguardian.com',
        'washingtonpost.com', 'reuters.com', 'apnews.com', 'foxnews.com',
        'bloomberg.com', 'wsj.com', 'ft.com', 'npr.org',
        'news.ycombinator.com', 'politico.com', 'vox.com', 'huffpost.com',
        'buzzfeed.com', 'techcrunch.com', 'theverge.com', 'wired.com',
        'arstechnica.com'
    ],
    'porn': [
        'pornhub.com', 'xvideos.com', 'xnxx.com', 'xhamster.com', 'redtube.com',
        'youporn.com', 'tube8.com', 'spankbang.com', 'eporner.com', 'beeg.com',
        'tnaflix.com', 'chaturbate.com', 'onlyfans.com', 'fansly.com',
        'camsoda.com'
    ],
    'search-engines': [
        'google.com', 'bing.com', 'duckduckgo.com', 'yahoo.com', 'baidu.com',
        'yandex.com', 'ecosia.org', 'kagi.com', 'brave.com', 'startpage.com',
        'swisscows.com', 'qwant.com'
    ],
    'shopping': [
        'amazon.com', 'ebay.com', 'etsy.com', 'walmart.com', 'target.com',
        'bestbuy.com', 'costco.com', 'aliexpress.com', 'alibaba.com',
        'shein.com', 'temu.com', 'wish.com', 'newegg.com', 'ikea.com',
        'macys.com', 'nike.com', 'adidas.com', 'zara.com', 'hm.com'
    ],
    'social-media': [
        'facebook.com', 'instagram.com', 'twitter.com', 'x.com', 'tiktok.com',
        'snapchat.com', 'linkedin.com', 'pinterest.com', 'reddit.com',
        'tumblr.com', 'threads.net', 'mastodon.social', 'bsky.app',
        'discord.com', 'whatsapp.com', 'web.whatsapp.com', 't.me',
        'telegram.org'
    ]
};

// Schedule mode state
let isScheduleMode = false; // false = instant mode, true = schedule mode
let isAlwaysOnMode = true; // false = timed block, true = always-on (permanent) block
let scheduleSegments = getDefaultScheduleSegments(); // Array of time segments with per-segment days

// Far-future timestamp used for "always on" blocks (year 9999)
const ALWAYS_ON_END_TIME = new Date(9999, 11, 31, 23, 59, 59, 999).getTime();

// Protected app names — ReDD Block must never block itself
const PROTECTED_APP_NAMES = ['redd block', 'redd-block', 'redd-block-helper'];

// Protected domains — blocking these would break networking or the app itself
const PROTECTED_DOMAINS = [
    'localhost', 'localhost.localdomain',
    '127.0.0.1', '0.0.0.0', '::1',
    'broadcasthost', 'local',
    'reddfocus.org', 'www.reddfocus.org',
    'ulyngs.github.io'
];

/**
 * Check if an app name matches a protected app (case-insensitive).
 * Returns true if the app should NOT be added to a blocklist.
 */
function isProtectedApp(name) {
    if (!name) return false;
    const lower = name.trim().toLowerCase();
    return PROTECTED_APP_NAMES.some(p => lower === p);
}

/**
 * Check if a domain is protected (case-insensitive).
 * Returns true if the domain should NOT be added to a blocklist.
 */
function isProtectedDomain(domain) {
    if (!domain) return false;
    const lower = domain.trim().toLowerCase();
    return PROTECTED_DOMAINS.some(p => lower === p);
}

// Helper: detect always-on blocks by flag OR far-future end time
function isBlockAlwaysOn(block) {
    return block.isAlwaysOn === true || block.endTime >= ALWAYS_ON_END_TIME;
}

function isScreenTimeSummaryEntry(appName) {
    return typeof appName === 'string' && appName.includes('selected (Screen Time)');
}

function parseLegacyScreenTimeSummary(entries) {
    if (!Array.isArray(entries) || entries.length === 0) return null;
    const summaryLabel = entries.join(', ');
    let applicationCount = 0;
    let categoryCount = 0;
    for (const entry of entries) {
        const appMatch = entry.match(/(\d+)\s+app/);
        const categoryMatch = entry.match(/(\d+)\s+categor(?:y|ies)/);
        if (appMatch) applicationCount += Number.parseInt(appMatch[1], 10);
        if (categoryMatch) categoryCount += Number.parseInt(categoryMatch[1], 10);
    }
    return {
        applicationTokens: [],
        categoryTokens: [],
        applicationCount,
        categoryCount,
        summaryLabel,
        requiresReselection: true
    };
}

function normalizeIOSScreenTimeSelection(selection, legacySummaryEntries = []) {
    if (!selection && legacySummaryEntries.length === 0) return null;

    const normalized = {
        applicationTokens: Array.isArray(selection?.applicationTokens) ? [...selection.applicationTokens] : [],
        categoryTokens: Array.isArray(selection?.categoryTokens) ? [...selection.categoryTokens] : [],
        applicationCount: Number.isFinite(selection?.applicationCount) ? selection.applicationCount : null,
        categoryCount: Number.isFinite(selection?.categoryCount) ? selection.categoryCount : null,
        summaryLabel: typeof selection?.summaryLabel === 'string' ? selection.summaryLabel : '',
        requiresReselection: selection?.requiresReselection === true
    };

    if (normalized.applicationCount == null) {
        normalized.applicationCount = normalized.applicationTokens.length;
    }
    if (normalized.categoryCount == null) {
        normalized.categoryCount = normalized.categoryTokens.length;
    }

    if (!selection && legacySummaryEntries.length > 0) {
        return parseLegacyScreenTimeSummary(legacySummaryEntries);
    }

    if (
        !normalized.summaryLabel &&
        (normalized.applicationCount > 0 || normalized.categoryCount > 0) &&
        normalized.applicationTokens.length === 0 &&
        normalized.categoryTokens.length === 0
    ) {
        const legacySelection = parseLegacyScreenTimeSummary(legacySummaryEntries);
        if (legacySelection?.summaryLabel) {
            normalized.summaryLabel = legacySelection.summaryLabel;
        }
        normalized.requiresReselection = true;
    }

    const hasAnySelection =
        normalized.applicationTokens.length > 0 ||
        normalized.categoryTokens.length > 0 ||
        normalized.applicationCount > 0 ||
        normalized.categoryCount > 0 ||
        !!normalized.summaryLabel;

    return hasAnySelection ? normalized : null;
}

function cloneIOSScreenTimeSelection(selection) {
    const normalized = normalizeIOSScreenTimeSelection(selection);
    return normalized ? { ...normalized } : null;
}

function hasUsableIOSScreenTimeSelection(selection) {
    const normalized = normalizeIOSScreenTimeSelection(selection);
    return !!normalized && (
        normalized.applicationTokens.length > 0 ||
        normalized.categoryTokens.length > 0
    );
}

function formatIOSScreenTimeSelectionLabel(selection) {
    const normalized = normalizeIOSScreenTimeSelection(selection);
    if (!normalized) return '';
    if (normalized.summaryLabel) return normalized.summaryLabel;

    const parts = [];
    if (normalized.applicationCount > 0) parts.push(`${normalized.applicationCount} app${normalized.applicationCount > 1 ? 's' : ''}`);
    if (normalized.categoryCount > 0) parts.push(`${normalized.categoryCount} categor${normalized.categoryCount > 1 ? 'ies' : 'y'}`);
    return parts.length > 0 ? `${parts.join(', ')} selected (Screen Time)` : '';
}

function getBlocklistRegularApps(blocklist) {
    if (!Array.isArray(blocklist?.apps)) return [];
    return blocklist.apps.filter(app => typeof app === 'string' && !isScreenTimeSummaryEntry(app));
}

function getBlocklistIOSScreenTimeSelection(blocklist) {
    const legacySummaryEntries = Array.isArray(blocklist?.apps)
        ? blocklist.apps.filter(isScreenTimeSummaryEntry)
        : [];
    return normalizeIOSScreenTimeSelection(blocklist?.iosScreenTimeSelection, legacySummaryEntries);
}

function getBlocklistDisplayApps(blocklist) {
    const apps = [...getBlocklistRegularApps(blocklist)];
    const screenTimeLabel = formatIOSScreenTimeSelectionLabel(getBlocklistIOSScreenTimeSelection(blocklist));
    if (screenTimeLabel) {
        apps.push(screenTimeLabel);
    }
    return apps;
}

function getBlocklistIOSPayload(blocklist) {
    const selection = getBlocklistIOSScreenTimeSelection(blocklist);
    return {
        appTokenData: selection?.applicationTokens || [],
        categoryTokenData: selection?.categoryTokens || []
    };
}

function blocklistNeedsIOSSelectionRefresh(blocklist) {
    const selection = getBlocklistIOSScreenTimeSelection(blocklist);
    return !!selection && selection.requiresReselection === true && !hasUsableIOSScreenTimeSelection(selection);
}

function ensureIOSBlocklistSelectionReady(blocklist, actionLabel) {
    if (!isIOS || !blocklistNeedsIOSSelectionRefresh(blocklist)) {
        return true;
    }

    const blocklistName = blocklist?.name || 'This blocklist';
    alert(`${blocklistName} has an old Screen Time app selection that iOS can no longer enforce reliably. Please edit the blocklist and re-select its apps before ${actionLabel}.`);
    return false;
}

function normalizeBlocklist(blocklist) {
    const normalizedBlocklist = { ...blocklist };
    normalizedBlocklist.apps = getBlocklistRegularApps(blocklist);
    normalizedBlocklist.iosScreenTimeSelection = getBlocklistIOSScreenTimeSelection(blocklist);
    return normalizedBlocklist;
}

function collectActiveIOSManualBlockPayload(now = Date.now()) {
    const allDomains = new Set();
    const appTokenData = new Set();
    const categoryTokenData = new Set();

    for (const block of appData.activeBlocks || []) {
        if (block.startTime > now || block.endTime <= now || block.isPaused) continue;
        const blocklist = appData.blocklists.find(bl => bl.id === block.blocklistId);
        if (!blocklist) continue;

        for (const domain of blocklist.websites || []) {
            if (!isProtectedDomain(domain)) allDomains.add(domain);
        }

        const iosPayload = getBlocklistIOSPayload(blocklist);
        for (const token of iosPayload.appTokenData) appTokenData.add(token);
        for (const token of iosPayload.categoryTokenData) categoryTokenData.add(token);
    }

    return {
        domains: Array.from(allDomains).sort(),
        appTokenData: Array.from(appTokenData),
        categoryTokenData: Array.from(categoryTokenData)
    };
}

function isNonRepeatingSchedule(schedule) {
    return !!schedule && schedule.repeatType !== 'forever' && !(schedule.repeatType === 'date' && schedule.repeatDate);
}

// Resolve concrete one-shot occurrences for non-repeating schedules.
function resolveOneShotSegmentOccurrences(schedule, segment, segmentIndex = 0) {
    if (!isNonRepeatingSchedule(schedule) || !segment) return [];

    const createdAt = new Date(schedule.createdAt || Date.now());
    if (Number.isNaN(createdAt.getTime())) return [];

    const createdDay = createdAt.getDay() === 0 ? 6 : createdAt.getDay() - 1; // Mon=0
    const segmentDays = Array.isArray(segment.days)
        ? segment.days.filter(day => Number.isInteger(day) && day >= 0 && day <= 6)
        : [];

    if (segmentDays.length === 0) return [];

    const occurrences = segmentDays.map(dayIndex => {
        let daysUntil = dayIndex - createdDay;
        if (daysUntil < 0) daysUntil += 7;

        const start = new Date(createdAt);
        start.setDate(start.getDate() + daysUntil);
        start.setHours(segment.startHour, segment.startMinute, 0, 0);

        const end = new Date(start);
        end.setHours(segment.endHour, segment.endMinute, 0, 0);
        if (end <= start) {
            end.setDate(end.getDate() + 1);
        }

        return {
            segmentIndex,
            dayIndex,
            start,
            end
        };
    });

    occurrences.sort((a, b) => {
        const startDiff = a.start.getTime() - b.start.getTime();
        if (startDiff !== 0) return startDiff;
        const endDiff = a.end.getTime() - b.end.getTime();
        if (endDiff !== 0) return endDiff;
        return a.dayIndex - b.dayIndex;
    });

    return occurrences;
}

function resolveOneShotOccurrences(schedule) {
    if (!isNonRepeatingSchedule(schedule) || !Array.isArray(schedule.segments)) return [];

    const occurrences = [];
    schedule.segments.forEach((segment, segmentIndex) => {
        occurrences.push(...resolveOneShotSegmentOccurrences(schedule, segment, segmentIndex));
    });

    occurrences.sort((a, b) => {
        const startDiff = a.start.getTime() - b.start.getTime();
        if (startDiff !== 0) return startDiff;
        const segmentDiff = a.segmentIndex - b.segmentIndex;
        if (segmentDiff !== 0) return segmentDiff;
        return a.dayIndex - b.dayIndex;
    });

    return occurrences;
}

function getIOSScheduleEntryWindow(schedule, seg) {
    const createdAt = new Date(schedule.createdAt || Date.now());

    if (schedule.repeatType === 'forever') {
        return {
            repeats: true,
            activeFromTimestampMs: null,
            activeUntilTimestampMs: null
        };
    }

    if (schedule.repeatType === 'date' && schedule.repeatDate) {
        const endDate = new Date(schedule.repeatDate);
        endDate.setHours(23, 59, 59, 999);
        return {
            repeats: true,
            activeFromTimestampMs: createdAt.getTime(),
            activeUntilTimestampMs: endDate.getTime()
        };
    }

    const occurrences = resolveOneShotSegmentOccurrences(schedule, seg);
    const firstOccurrence = occurrences[0];

    return {
        repeats: false,
        activeFromTimestampMs: firstOccurrence ? firstOccurrence.start.getTime() : null,
        activeUntilTimestampMs: firstOccurrence ? firstOccurrence.end.getTime() : null
    };
}

function getSingleOccurrenceSegmentDates(schedule, segment) {
    const [firstOccurrence] = resolveOneShotSegmentOccurrences(schedule, segment);
    if (!firstOccurrence) return null;

    return {
        start: new Date(firstOccurrence.start),
        end: new Date(firstOccurrence.end)
    };
}

async function syncSchedulesToHelper() {
    if (isIOS) {
        try {
            const flatEntries = [];
            for (const schedule of appData.schedules || []) {
                if (!schedule.segments || schedule.segments.length === 0) continue;
                const blocklist = appData.blocklists.find(bl => bl.id === schedule.blocklistId);
                const domains = blocklist?.websites || [];
                const iosPayload = getBlocklistIOSPayload(blocklist);
                if (isNonRepeatingSchedule(schedule)) {
                    const occurrences = resolveOneShotOccurrences(schedule);
                    occurrences.forEach((occurrence, occurrenceIdx) => {
                        flatEntries.push({
                            id: `${schedule.id}-${occurrence.segmentIndex}-${occurrenceIdx}`,
                            startHour: occurrence.start.getHours(),
                            startMinute: occurrence.start.getMinutes(),
                            endHour: occurrence.end.getHours(),
                            endMinute: occurrence.end.getMinutes(),
                            days: [],
                            domains,
                            appTokenData: iosPayload.appTokenData,
                            categoryTokenData: iosPayload.categoryTokenData,
                            repeats: false,
                            activeFromTimestampMs: occurrence.start.getTime(),
                            activeUntilTimestampMs: occurrence.end.getTime(),
                            isPaused: !!schedule.isPaused,
                            pauseEndTimestampMs: schedule.pauseEndTime || null
                        });
                    });
                    continue;
                }
                for (let segIdx = 0; segIdx < schedule.segments.length; segIdx++) {
                    const seg = schedule.segments[segIdx];
                    const window = getIOSScheduleEntryWindow(schedule, seg);
                    flatEntries.push({
                        id: `${schedule.id}-${segIdx}`,
                        startHour: seg.startHour,
                        startMinute: seg.startMinute,
                        endHour: seg.endHour,
                        endMinute: seg.endMinute,
                        days: seg.days ? [...seg.days] : [],
                        domains,
                        appTokenData: iosPayload.appTokenData,
                        categoryTokenData: iosPayload.categoryTokenData,
                        repeats: window.repeats,
                        activeFromTimestampMs: window.activeFromTimestampMs,
                        activeUntilTimestampMs: window.activeUntilTimestampMs,
                        isPaused: !!schedule.isPaused,
                        pauseEndTimestampMs: schedule.pauseEndTime || null
                    });
                }
            }
            console.log('[syncSchedulesToHelper] iOS: Sending', flatEntries.length, 'segment entries to plugin');
            const result = await tauriAPI.setSchedulesPlugin(flatEntries);
            if (!result.success) {
                console.warn('[syncSchedulesToHelper] iOS plugin failed:', result.error);
                if (!hasShownIOSScheduleSyncError) {
                    hasShownIOSScheduleSyncError = true;
                    await message(`iOS schedule sync failed: ${result.error || 'unknown plugin error'}`, {
                        title: 'Schedule Sync Failed',
                        kind: 'error'
                    });
                }
            }
        } catch (e) {
            console.warn('[syncSchedulesToHelper] iOS error:', e);
            if (!hasShownIOSScheduleSyncError) {
                hasShownIOSScheduleSyncError = true;
                const errorText = e?.message || String(e);
                await message(`iOS schedule sync threw an error: ${errorText}`, {
                    title: 'Schedule Sync Error',
                    kind: 'error'
                });
            }
        }
        return;
    }
    try {
        const status = await tauriAPI.checkHelperStatus();
        if (!status.running || !status.version_ok) {
            console.log('[syncSchedulesToHelper] Helper not available, skipping');
            return;
        }

        // Build schedule payloads with pre-resolved domains and apps
        const helperSchedules = (appData.schedules || []).map(schedule => {
            const blocklist = appData.blocklists.find(bl => bl.id === schedule.blocklistId);
            const helperSegments = isNonRepeatingSchedule(schedule)
                ? resolveOneShotOccurrences(schedule).map(occurrence => ({
                    startHour: occurrence.start.getHours(),
                    startMinute: occurrence.start.getMinutes(),
                    endHour: occurrence.end.getHours(),
                    endMinute: occurrence.end.getMinutes(),
                    days: [],
                    activeFromTimestampMs: occurrence.start.getTime(),
                    activeUntilTimestampMs: occurrence.end.getTime()
                }))
                : (schedule.segments || []).map(seg => ({
                    startHour: seg.startHour,
                    startMinute: seg.startMinute,
                    endHour: seg.endHour,
                    endMinute: seg.endMinute,
                    days: [...seg.days]
                }));
            return {
                id: schedule.id,
                domains: blocklist?.websites || [],
                apps: blocklist?.apps || [],
                isPaused: !!schedule.isPaused,
                pauseEndTime: schedule.pauseEndTime || null,
                segments: helperSegments
            };
        });

        console.log('[syncSchedulesToHelper] Sending', helperSchedules.length, 'schedules to helper');
        const result = await tauriAPI.setSchedulesViaHelper(helperSchedules);
        if (!result.success) {
            console.warn('[syncSchedulesToHelper] Failed:', result.error);
        }
    } catch (e) {
        console.warn('[syncSchedulesToHelper] Error:', e);
    }
}

async function syncActiveBlocksToHelper() {
    if (isIOS) return;
    try {
        const status = await tauriAPI.checkHelperStatus();
        if (!status.running || !status.version_ok) return;
        const now = Date.now();
        console.log('[syncActiveBlocksToHelper] Total activeBlocks:', appData.activeBlocks.length,
            'blocks:', appData.activeBlocks.map(b => ({
                id: b.id, blocklistId: b.blocklistId, startTime: b.startTime, endTime: b.endTime,
                isPaused: b.isPaused, isAlwaysOn: b.isAlwaysOn,
                startOk: b.startTime <= now, endOk: b.endTime > now, pauseOk: !b.isPaused
            })));
        const activeBlocks = appData.activeBlocks.filter(block => block.startTime <= now && block.endTime > now);
        console.log('[syncActiveBlocksToHelper] Filtered activeBlocks:', activeBlocks.length);

        // Build the blocks array for the atomic set-blocks command.
        // Paused blocks are included so the helper can auto-resume them when the pause expires,
        // even if the frontend isn't running.
        const helperBlocks = activeBlocks.map(block => {
            const blocklist = appData.blocklists.find(bl => bl.id === block.blocklistId);
            return {
                domains: blocklist?.websites || [],
                endTime: block.endTime,
                blocklistId: block.blocklistId,
                isPaused: !!block.isPaused,
                pauseEndTime: block.pauseEndTime || null
            };
        });
        
        console.log('[syncActiveBlocksToHelper] Sending', helperBlocks.length, 'blocks to helper');
        // Atomically replace all blocks in the helper daemon (no clear→re-add race)
        await tauriAPI.setBlocksViaHelper(helperBlocks);
    } catch (e) {
        console.warn('[syncActiveBlocksToHelper] Error:', e);
    }
}

function isOneOffBlockEnforced(block, now = Date.now()) {
    return !!(block && block.startTime <= now && block.endTime > now && !block.isPaused);
}

function isOneOffBlockStillActive(block, now = Date.now()) {
    return !!(block && block.endTime > now);
}

function isSchedulePausedNow(schedule, now = Date.now()) {
    return !!(schedule && schedule.isPaused && schedule.pauseEndTime > now);
}

function hasAnyEnforcedBlocks(now = Date.now(), nowDate = new Date(now)) {
    const hasActiveOneOff = appData.activeBlocks.some(block => isOneOffBlockEnforced(block, now));
    if (hasActiveOneOff) return true;
    return !!appData.schedules?.some(schedule => isScheduleSegmentActiveNow(schedule, nowDate));
}

function scheduleHasFutureRecurringOccurrence(schedule, nowDate = new Date()) {
    if (!schedule || !Array.isArray(schedule.segments) || schedule.segments.length === 0) return false;

    const currentDay = nowDate.getDay() === 0 ? 6 : nowDate.getDay() - 1;

    return schedule.segments.some(seg => {
        const segmentDays = (Array.isArray(seg.days) && seg.days.length > 0) ? seg.days : [currentDay];
        return segmentDays.some(segmentDay => {
            let daysUntil = segmentDay - currentDay;
            if (daysUntil < 0) daysUntil += 7;

            const candidateStart = new Date(nowDate);
            candidateStart.setDate(candidateStart.getDate() + daysUntil);
            candidateStart.setHours(seg.startHour, seg.startMinute, 0, 0);

            const candidateEnd = new Date(candidateStart);
            candidateEnd.setHours(seg.endHour, seg.endMinute, 0, 0);
            if (candidateEnd <= candidateStart) {
                candidateEnd.setDate(candidateEnd.getDate() + 1);
            }

            if (candidateEnd <= nowDate) {
                candidateStart.setDate(candidateStart.getDate() + 7);
                candidateEnd.setDate(candidateEnd.getDate() + 7);
            }

            if (schedule.repeatType === 'date' && schedule.repeatDate) {
                const repeatEnd = new Date(schedule.repeatDate);
                repeatEnd.setHours(23, 59, 59, 999);
                return candidateStart <= repeatEnd && candidateEnd > nowDate;
            }

            return candidateEnd > nowDate;
        });
    });
}

function scheduleHasFutureSingleOccurrence(schedule, nowDate = new Date()) {
    if (!schedule || !Array.isArray(schedule.segments) || schedule.segments.length === 0) return false;
    return resolveOneShotOccurrences(schedule).some(occurrence => occurrence.end > nowDate);
}

function scheduleCanStillBecomeActive(schedule, nowDate = new Date()) {
    if (!schedule || !Array.isArray(schedule.segments) || schedule.segments.length === 0) return false;
    if (schedule.repeatType === 'forever' || (schedule.repeatType === 'date' && schedule.repeatDate)) {
        return scheduleHasFutureRecurringOccurrence(schedule, nowDate);
    }
    return scheduleHasFutureSingleOccurrence(schedule, nowDate);
}

function hasAnyBlockingStateToClear(now = Date.now(), nowDate = new Date(now)) {
    const hasOneOffState = appData.activeBlocks.some(block => isOneOffBlockStillActive(block, now));
    if (hasOneOffState) return true;
    return !!appData.schedules?.some(schedule => scheduleCanStillBecomeActive(schedule, nowDate));
}

async function refreshDesktopHelperStatus() {
    if (isIOS) {
        return { installed: false, running: false, version: null, version_ok: false, helperReady: false };
    }
    try {
        const status = await tauriAPI.checkHelperStatus();
        const helperReady = !!(status.running && status.version_ok);
        const nextStatus = { ...status, helperReady };
        helperAvailable = helperReady;
        lastDesktopHelperStatus = nextStatus;
        lastDesktopHelperStatusAt = Date.now();
        return nextStatus;
    } catch (err) {
        console.error('Error checking helper status:', err);
        helperAvailable = false;
        lastDesktopHelperStatus = {
            installed: false,
            running: false,
            version: null,
            version_ok: false,
            helperReady: false,
            error: err
        };
        lastDesktopHelperStatusAt = Date.now();
        return lastDesktopHelperStatus;
    }
}

function getCachedDesktopHelperStatus(maxAgeMs = HELPER_STATUS_CACHE_TTL_MS) {
    if (!lastDesktopHelperStatus) return null;
    if ((Date.now() - lastDesktopHelperStatusAt) > maxAgeMs) return null;
    return lastDesktopHelperStatus;
}

const HELPER_UI_REFRESH_MS = 3000;
let helperUiRefreshTimer = null;
let helperUiRefreshInFlight = false;

function isModalVisible(id) {
    const modal = document.getElementById(id);
    return !!(modal && !modal.classList.contains('hidden'));
}

function stopHelperUiRefreshLoop() {
    if (helperUiRefreshTimer != null) {
        clearInterval(helperUiRefreshTimer);
        helperUiRefreshTimer = null;
    }
}

async function refreshOpenHelperUi() {
    if (helperUiRefreshInFlight || isIOS) return;

    const settingsVisible = isModalVisible('settings-modal');
    const diagnosticsVisible = isModalVisible('diagnostics-modal');
    if (!settingsVisible && !diagnosticsVisible) {
        stopHelperUiRefreshLoop();
        return;
    }

    helperUiRefreshInFlight = true;
    try {
        if (settingsVisible) {
            await updateHelperStatusIndicator();
            updateCleanHostsBtnState();
        }
        if (diagnosticsVisible) {
            await refreshDiagnosticsModalContent();
        }
    } finally {
        helperUiRefreshInFlight = false;
    }
}

function startHelperUiRefreshLoop() {
    if (isIOS || helperUiRefreshTimer != null) return;
    helperUiRefreshTimer = setInterval(() => {
        void refreshOpenHelperUi();
    }, HELPER_UI_REFRESH_MS);
}

let scheduleRepeatType = 'forever'; // 'forever', 'date', or 'no'
let scheduleRepeatDate = null; // Date object when repeatType is 'date'
let activeScheduleSegmentCount = 0; // Number of segments locked in the active schedule (new segments can be added)
let hasShownIOSScheduleSyncError = false;
const CURRENT_EULA_REVISION = 1;
let forceShowEulaThisSession = false;

// Word list for random word challenges
const wordList = [
    // 1-2 chars
    'a', 'ad', 'am', 'an', 'as', 'at', 'be', 'by', 'do', 'go', 'he', 'hi', 'if', 'in', 'is', 'it', 'me', 'my', 'no', 'of', 'on', 'or', 'so', 'to', 'up', 'us', 'we',
    // 3 chars
    'act', 'add', 'age', 'aim', 'air', 'all', 'and', 'any', 'art', 'ask', 'bad', 'bag', 'bar', 'bat', 'bed', 'bee', 'big', 'bit', 'box', 'boy', 'bus', 'but', 'buy', 'can', 'car', 'cat', 'day', 'die', 'dog', 'dry', 'due', 'eat', 'egg', 'end', 'eye', 'far', 'few', 'fit', 'fly', 'for', 'fun', 'get', 'god', 'got', 'guy', 'hot', 'how', 'ice', 'ill', 'ink', 'job', 'joy', 'key', 'kid', 'law', 'lay', 'leg', 'let', 'lie', 'log', 'lot', 'low', 'man', 'map', 'may', 'men', 'mix', 'net', 'new', 'nod', 'nor', 'not', 'now', 'num', 'off', 'oil', 'old', 'one', 'out', 'own', 'pay', 'pen', 'per', 'pet', 'pie', 'pig', 'pin', 'pot', 'put', 'ran', 'raw', 'red', 'row', 'run', 'sad', 'say', 'sea', 'see', 'set', 'she', 'sin', 'sit', 'six', 'sky', 'son', 'sun', 'tap', 'tax', 'tea', 'ten', 'the', 'tie', 'tip', 'toe', 'too', 'top', 'toy', 'try', 'two', 'use', 'van', 'war', 'way', 'who', 'why', 'win', 'yes', 'yet', 'you',
    // 4 chars
    'also', 'able', 'acid', 'aged', 'away', 'baby', 'back', 'ball', 'bank', 'base', 'bath', 'bear', 'beat', 'beer', 'bell', 'belt', 'best', 'bill', 'bird', 'blow', 'blue', 'boat', 'body', 'bomb', 'bond', 'bone', 'book', 'boom', 'born', 'boss', 'both', 'bowl', 'burn', 'busy', 'call', 'calm', 'came', 'camp', 'card', 'care', 'case', 'cash', 'cast', 'cell', 'chat', 'chip', 'city', 'club', 'coal', 'coat', 'code', 'cold', 'come', 'cook', 'cool', 'cope', 'core', 'cost', 'crew', 'crop', 'dark', 'date', 'dead', 'deal', 'dean', 'dear', 'debt', 'deep', 'deny', 'desk', 'dial', 'diet', 'disc', 'disk', 'does', 'done', 'door', 'dose', 'down', 'draw', 'drew', 'drop', 'drug', 'dual', 'duke', 'dust', 'duty', 'each', 'earn', 'ease', 'east', 'easy', 'edge', 'edit', 'else', 'even', 'ever', 'evil', 'exit', 'face', 'fact', 'fail', 'fair', 'fall', 'farm', 'fast', 'fate', 'fear', 'feed', 'feel', 'feet', 'fell', 'felt', 'file', 'fill', 'film', 'find', 'fine', 'fire', 'firm', 'fish', 'five', 'flat', 'fled', 'flew', 'flow', 'food', 'foot', 'ford', 'form', 'fort', 'four', 'free', 'from', 'fuel', 'full', 'fund', 'gain', 'game', 'gate', 'gave', 'gear', 'gene', 'gift', 'girl', 'give', 'glad', 'goal', 'goes', 'gold', 'golf', 'gone', 'good', 'gray', 'grew', 'grey', 'grow', 'hair', 'half', 'hall', 'hand', 'hang', 'hard', 'harm', 'hate', 'have', 'head', 'hear', 'heat', 'held', 'hell', 'help', 'here', 'hero', 'high', 'hill', 'hire', 'hold', 'hole', 'holy', 'home', 'hope', 'host', 'hour', 'huge', 'hung', 'hunt', 'hurt', 'idea', 'inch', 'into', 'iron', 'item', 'join', 'joke', 'jump', 'jury', 'just', 'keep', 'kept', 'kick', 'kill', 'kind', 'king', 'knee', 'knew', 'know', 'lack', 'lady', 'laid', 'lake', 'land', 'lane', 'last', 'late', 'lead', 'left', 'less', 'life', 'lift', 'like', 'line', 'link', 'list', 'live', 'load', 'loan', 'lock', 'logo', 'long', 'look', 'lord', 'lose', 'loss', 'lost', 'love', 'luck', 'made', 'mail', 'main', 'make', 'male', 'many', 'mark', 'mass', 'mate', 'math', 'meal', 'mean', 'meat', 'meet', 'menu', 'mere', 'mile', 'milk', 'mill', 'mind', 'mine', 'miss', 'mode', 'mood', 'moon', 'more', 'most', 'move', 'much', 'must', 'name', 'navy', 'near', 'neck', 'need', 'news', 'next', 'nice', 'nick', 'nine', 'none', 'nose', 'note', 'okay', 'once', 'only', 'onto', 'open', 'oral', 'over', 'pace', 'pack', 'page', 'paid', 'pain', 'pair', 'palm', 'park', 'part', 'pass', 'past', 'path', 'peak', 'pick', 'pile', 'pink', 'pipe', 'plan', 'play', 'plot', 'plug', 'plus', 'poll', 'pool', 'poor', 'port', 'post', 'pull', 'pure', 'push', 'race', 'rail', 'rain', 'rank', 'rare', 'rate', 'read', 'real', 'rear', 'rely', 'rent', 'rest', 'rice', 'rich', 'ride', 'ring', 'rise', 'risk', 'road', 'rock', 'role', 'roll', 'roof', 'room', 'root', 'rose', 'rule', 'rush', 'safe', 'said', 'sake', 'sale', 'salt', 'same', 'sand', 'save', 'seat', 'seed', 'seek', 'seem', 'seen', 'self', 'sell', 'send', 'sent', 'ship', 'shop', 'shot', 'show', 'shut', 'sick', 'side', 'sign', 'silk', 'site', 'size', 'skin', 'slip', 'slow', 'snow', 'soft', 'soil', 'sold', 'sole', 'some', 'song', 'soon', 'sort', 'soul', 'spot', 'star', 'stay', 'step', 'stop', 'such', 'suit', 'sure', 'take', 'tale', 'talk', 'tall', 'tank', 'tape', 'task', 'team', 'tech', 'tell', 'tend', 'term', 'test', 'text', 'than', 'that', 'them', 'then', 'they', 'thin', 'this', 'thus', 'till', 'time', 'tiny', 'told', 'toll', 'tone', 'took', 'tool', 'tour', 'town', 'tree', 'trip', 'true', 'tune', 'turn', 'twin', 'type', 'unit', 'upon', 'used', 'user', 'vary', 'vast', 'very', 'vice', 'view', 'vote', 'wage', 'wait', 'wake', 'walk', 'wall', 'want', 'ward', 'warm', 'wash', 'wave', 'ways', 'weak', 'wear', 'week', 'well', 'went', 'were', 'west', 'what', 'when', 'whom', 'wide', 'wife', 'wild', 'will', 'wind', 'wine', 'wing', 'wire', 'wise', 'wish', 'with', 'wood', 'word', 'work', 'yard', 'yeah', 'year', 'your', 'zero', 'zone',
    // 5+ chars (selection)
    'about', 'above', 'abuse', 'actor', 'acute', 'admit', 'adopt', 'adult', 'after', 'again', 'agent', 'agree', 'ahead', 'alarm', 'album', 'alert', 'alike', 'alive', 'allow', 'alone', 'along', 'alter', 'among', 'anger', 'angle', 'angry', 'apart', 'apple', 'apply', 'arena', 'argue', 'arise', 'array', 'aside', 'asset', 'audio', 'audit', 'avoid', 'award', 'aware', 'badly', 'baker', 'bases', 'basic', 'basis', 'beach', 'began', 'begin', 'begun', 'being', 'below', 'bench', 'birth', 'black', 'blame', 'blind', 'block', 'blood', 'board', 'boost', 'booth', 'bound', 'brain', 'brand', 'bread', 'break', 'breed', 'brief', 'bring', 'broad', 'brown', 'brush', 'build', 'built', 'buyer', 'cable', 'carry', 'catch', 'cause', 'chain', 'chair', 'chart', 'chase', 'cheap', 'check', 'chest', 'chief', 'child', 'china', 'chose', 'civil', 'claim', 'class', 'clean', 'clear', 'click', 'clock', 'close', 'coach', 'coast', 'could', 'count', 'court', 'cover', 'craft', 'crash', 'cream', 'crime', 'cross', 'crowd', 'crown', 'curve', 'cycle', 'daily', 'dance', 'dated', 'dealt', 'death', 'debut', 'delay', 'depth', 'doing', 'doubt', 'dozen', 'draft', 'drama', 'drawn', 'dream', 'dress', 'drill', 'drink', 'drive', 'drove', 'dying', 'eager', 'early', 'earth', 'eight', 'elite', 'empty', 'enemy', 'enjoy', 'enter', 'entry', 'equal', 'error', 'event', 'every', 'exact', 'exist', 'extra', 'faith', 'false', 'fault', 'fiber', 'field', 'fifth', 'fifty', 'fight', 'final', 'first', 'fixed', 'flash', 'fleet', 'floor', 'fluid', 'focus', 'force', 'forth', 'forty', 'forum', 'found', 'frame', 'frank', 'fraud', 'fresh', 'front', 'fruit', 'fully', 'funny', 'giant', 'given', 'glass', 'globe', 'going', 'grace', 'grade', 'grand', 'grant', 'grass', 'great', 'green', 'gross', 'group', 'grown', 'guard', 'guess', 'guest', 'guide', 'happy', 'heart', 'heavy', 'hence', 'horse', 'hotel', 'house', 'human', 'ideal', 'image', 'index', 'inner', 'input', 'issue', 'japan', 'joint', 'judge', 'known', 'label', 'large', 'laser', 'later', 'laugh', 'layer', 'learn', 'lease', 'least', 'leave', 'legal', 'level', 'light', 'limit', 'links', 'lives', 'local', 'logic', 'loose', 'lower', 'lucky', 'lunch', 'lying', 'magic', 'major', 'maker', 'march', 'match', 'maybe', 'mayor', 'limit', 'admit', 'adult', 'advice', 'affect', 'afford', 'afraid', 'agency', 'agenda', 'almost', 'always', 'amount', 'animal', 'annual', 'answer', 'anyway', 'appeal', 'appear', 'aspect', 'assist', 'assume', 'attack', 'attend', 'august', 'author', 'avenue', 'backed', 'barely', 'battle', 'beauty', 'became', 'become', 'before', 'behalf', 'behind', 'belief', 'belong', 'berlin', 'better', 'beyond', 'bishop', 'border', 'bottle', 'bottom', 'bought', 'branch', 'breath', 'bridge', 'bright', 'broken', 'budget', 'burden', 'bureau', 'button', 'camera', 'cancer', 'cannot', 'carbon', 'career', 'castle', 'casual', 'caught', 'center', 'centre', 'chance', 'change', 'charge', 'choice', 'choose', 'chosen', 'church', 'circle', 'client', 'closed', 'closer', 'coffee', 'column', 'combat', 'coming', 'common', 'comply', 'copper', 'corner', 'costly', 'county', 'couple', 'course', 'covers', 'create', 'credit'
];

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    await loadData();
    await resetDevOnlyEulaAcceptance();
    detectPlatform(); // Must run early so isIOS is set before other setup
    setupEventListeners();
    setupTheme();
    setupUiZoomShortcuts();
    setupHelpMenuLinks();
    setupHelperSettings();
    setupDiagnosticsButton();
    setupOverrideAll();
    setupInAppUninstall();
    setupGraceSetting();
    if (isIOS && hasAcceptedEula()) {
        await checkScreentimeAuth();
    } else {
        updateOnboardingVisibility();
    }

    if (hasAcceptedEula()) {
        await runPostAcceptanceStartup();
    }

});

function isLocalDevRun() {
    return ['http:', 'https:'].includes(window.location.protocol)
        && ['localhost', '127.0.0.1'].includes(window.location.hostname);
}

async function resetDevOnlyEulaAcceptance() {
    forceShowEulaThisSession = isLocalDevRun();
}

function getAcceptedEulaRevision() {
    const rawRevision = appData?.settings?.eulaAcceptedRevision;
    if (Number.isInteger(rawRevision) && rawRevision > 0) {
        return rawRevision;
    }
    if (typeof rawRevision === 'string') {
        const parsedRevision = Number.parseInt(rawRevision, 10);
        if (Number.isInteger(parsedRevision) && parsedRevision > 0) {
            return parsedRevision;
        }
    }
    if (appData?.settings?.eulaAccepted === true) {
        return CURRENT_EULA_REVISION;
    }
    return null;
}

function normalizeLoadedEulaState() {
    if (!appData.settings) {
        appData.settings = {};
    }

    let changed = false;
    const acceptedRevision = getAcceptedEulaRevision();

    if (acceptedRevision == null) {
        if (appData.settings.eulaAcceptedRevision != null) {
            delete appData.settings.eulaAcceptedRevision;
            changed = true;
        }
    } else if (appData.settings.eulaAcceptedRevision !== acceptedRevision) {
        appData.settings.eulaAcceptedRevision = acceptedRevision;
        changed = true;
    }

    const rawAcceptedAt = appData.settings.eulaAcceptedAt;
    if (rawAcceptedAt != null) {
        const parsedAcceptedAt = Number(rawAcceptedAt);
        if (Number.isFinite(parsedAcceptedAt) && parsedAcceptedAt > 0) {
            if (appData.settings.eulaAcceptedAt !== parsedAcceptedAt) {
                appData.settings.eulaAcceptedAt = parsedAcceptedAt;
                changed = true;
            }
        } else {
            delete appData.settings.eulaAcceptedAt;
            changed = true;
        }
    }

    if ('eulaAccepted' in appData.settings) {
        delete appData.settings.eulaAccepted;
        changed = true;
    }

    return changed;
}

function hasAcceptedEula() {
    return !forceShowEulaThisSession && getAcceptedEulaRevision() === CURRENT_EULA_REVISION;
}

async function runPostAcceptanceStartup() {
    if (startupInitializationComplete) return;
    if (startupInitializationPromise) {
        await startupInitializationPromise;
        return;
    }

    startupInitializationPromise = (async () => {
        await runExpiryOnce(); // Align in-memory state with Screen Time / helper (e.g. after app was closed)
        if (isIOS) {
            await checkScreentimeAuth();
            if (screentimeAuthorized) {
                await initializeIOSBlockingState();
            }
        } else {
            // Run first-launch migration off the legacy helper + check
            // Automation TCC (macOS) + extension compliance. Idempotent;
            // a no-op on subsequent launches past the current version.
            setupEnforcerUiAlerts();
            setupAppBlockingWarningOverlay();
            setupScheduledBlockWarningCard();
            await runDesktopOnboarding();
            await checkHelperStatus();
            console.log('[startup-sync] Desktop startup helperAvailable:', helperAvailable);
            // Reconcile manual blocks first so paused one-offs are removed from helper state after reinstall.
            await syncActiveBlocksToHelper();
            // Then sync schedules to helper so both enforcement sources are aligned.
            await syncSchedulesToHelper();
            console.log('[startup-sync] Startup helper reconciliation complete');
        }
        render();
        startTickInterval();

        // Check for app updates (non-blocking, desktop only)
        if (!isIOS) {
            checkForAppUpdate();
        }
        startupInitializationComplete = true;
    })();

    try {
        await startupInitializationPromise;
    } finally {
        if (!startupInitializationComplete) {
            startupInitializationPromise = null;
        }
    }
}

// Check if a newer app version is available and show update banner
async function checkForAppUpdate() {
    try {
        const currentVersion = await tauriAPI.getAppVersion();
        if (!currentVersion) return;

        const response = await fetch(`https://ulyngs.github.io/redd-block/latest-versions.json?t=${Date.now()}`);
        const versions = await response.json();

        const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
        const platform = isMac ? 'macos' : 'windows';
        const latestVersion = versions[platform];

        if (latestVersion && isVersionHigher(latestVersion, currentVersion)) {
            const banner = document.getElementById('update-banner');
            const versionEl = document.getElementById('update-banner-version');
            const dismissBtn = document.getElementById('update-banner-dismiss');

            if (banner && versionEl) {
                versionEl.textContent = latestVersion;
                banner.classList.remove('hidden');

                if (dismissBtn) {
                    dismissBtn.addEventListener('click', () => {
                        banner.classList.add('hidden');
                    });
                }
            }
        }
    } catch (e) {
        // Silently fail if offline
        console.log('[Update] Could not check for updates:', e.message);
    }
}

// ---- Desktop onboarding (v1.1+) --------------------------------------------
//
// - Runs the idempotent first-launch migration (strip hosts markers,
//   uninstall legacy privileged helper, register native-messaging
//   manifests).
// - Queries onboarding_state to decide whether to surface the
//   Automation permission banner (macOS TCC) and/or the extension
//   compliance banner.
// - No-ops on iOS.

// Migration / extension-install onboarding state machine.
//
// Drives a single full-screen overlay used in three trigger contexts:
//   1. v1.x residue on disk → "pre" phase (explanation + admin prompt
//      → cleanup → swap to "post" phase).
//   2. v1.x residue cleaned this launch → "post" phase, framed as
//      "Cleanup complete" + browser install checklist.
//   3. Fresh user (never had v1.x; just accepted EULA) with the
//      ReDD Focus extension not yet compliant in any detected
//      browser → same screen as #2 but framed as "Welcome" (no
//      cleanup language). Dismissal persisted in localStorage so we
//      don't nag every launch — the slim extension-compliance
//      banner takes over after that.
//
// While the screen is open, the enforcer is paused (set in
// commands::enforcement::auto_start when migration was pending at
// launch). We resume it explicitly when the user dismisses post.
let migrationOnboardingActive = false;
let migrationOnboardingDismissed = false;
const EXT_ONBOARDING_DISMISSED_KEY = 'reddBlockExtOnboardingDismissed';

async function runDesktopOnboarding() {
    if (isIOS) return;
    try {
        const pendingAtLaunch = await invoke('migration_pending');
        const wasUpgrade = await invoke('migration_was_pending_at_launch');

        if (pendingAtLaunch) {
            // Residue still present → show pre-prompt screen.
            await showMigrationOnboarding('pre');
            return;
        }
        if (wasUpgrade && !migrationOnboardingDismissed) {
            // Residue cleaned this launch (or by an earlier launch
            // before the user dismissed). Show the post-cleanup
            // screen so they know what changed and install the
            // extension. Cleanup-mode framing.
            const state = await invoke('onboarding_state');
            await showMigrationOnboarding('post', state, { mode: 'after-cleanup' });
            return;
        }

        // Fresh-user case: not an upgrade, but at least one INSTALLED
        // browser is missing the extension AND the user hasn't seen+
        // dismissed this screen before.
        //
        // Note: state.extension_compliant from the backend is keyed
        // off RUNNING browsers (so the in-session enforcer doesn't
        // nag about closed ones). Here we want a broader check: any
        // browser the user has installed but that doesn't have ReDD
        // Focus set up. That's the migration UI's
        // browserComplianceStatus logic.
        const state = await invoke('onboarding_state');
        console.log('[onboarding] state:', state);
        const dismissed = localStorage.getItem(EXT_ONBOARDING_DISMISSED_KEY);
        const browsers = state.browsers || {};
        const anyDetected = Object.keys(BROWSER_STORE_LINKS).some(k => browsers[k] && browsers[k].installed);
        const anyMissing = Object.keys(BROWSER_STORE_LINKS).some(k => {
            const b = browsers[k];
            return b && b.installed && browserComplianceStatus(k, b) !== 'compliant';
        });
        if (!dismissed && anyDetected && anyMissing && !migrationOnboardingDismissed) {
            await showMigrationOnboarding('post', state, { mode: 'fresh' });
            return;
        }

        // Returning user with extension already set up, OR user has
        // dismissed the welcome — fall back to the slim banner for
        // ongoing nagging.
        await updateBehaviourChangeBanner(state);
    } catch (e) {
        console.warn('[onboarding] state check failed:', e);
    }
}

async function showMigrationOnboarding(phase, state, opts = {}) {
    const screen = document.getElementById('migration-onboarding');
    const pre = document.getElementById('migration-phase-pre');
    const post = document.getElementById('migration-phase-post');
    const main = document.getElementById('main-content');
    if (!screen || !pre || !post) return;

    migrationOnboardingActive = true;
    if (main) main.classList.add('hidden');
    screen.classList.remove('hidden');
    pre.classList.toggle('hidden', phase !== 'pre');
    post.classList.toggle('hidden', phase !== 'post');

    // For the post phase, swap headline + subtitle + checklist depending
    // on whether we got here from a v1.x cleanup (mode=after-cleanup)
    // or it's a fresh user (mode=fresh, default).
    if (phase === 'post') {
        const mode = opts.mode || 'fresh';
        const title = document.getElementById('migration-post-title');
        const subtitle = document.getElementById('migration-post-subtitle');
        const cleanupItems = post.querySelectorAll('.migration-cleanup-only');
        if (mode === 'after-cleanup') {
            if (title) title.textContent = 'Cleanup complete';
            if (subtitle) subtitle.textContent = 'One step left: install ReDD Focus in each browser you use.';
            cleanupItems.forEach(el => el.classList.remove('hidden'));
        } else {
            if (title) title.classList.add('hidden');
            if (subtitle) subtitle.classList.add('hidden');
            const icon = post.closest('.onboarding-content')?.querySelector('.onboarding-icon');
            if (icon) icon.classList.add('hidden');
            cleanupItems.forEach(el => el.classList.add('hidden'));
        }
    }

    // Bring our window back to the front. The osascript admin
    // prompt steals focus, and on macOS we run as a menu-bar
    // accessory (no dock icon), so `window.setFocus` alone isn't
    // enough — we need NSApp.activate(ignoringOtherApps:). The
    // backend `activate_app` command does that. We retry twice with
    // a small delay because macOS doesn't always restore focus
    // immediately after osascript exits.
    const focusBack = async () => {
        try { await invoke('activate_app'); } catch (e) {
            console.warn('[migration] activate_app failed:', e);
        }
    };
    await focusBack();
    setTimeout(focusBack, 250);

    if (phase === 'pre') {
        wireMigrationPrePhase();
    } else if (phase === 'post') {
        wireMigrationPostPhase(state);
    }
}

function hideMigrationOnboarding() {
    const screen = document.getElementById('migration-onboarding');
    const main = document.getElementById('main-content');
    if (screen) screen.classList.add('hidden');
    if (main) main.classList.remove('hidden');
    migrationOnboardingActive = false;
    migrationOnboardingDismissed = true;
}

function wireMigrationPrePhase() {
    const btn = document.getElementById('migration-continue-btn');
    const status = document.getElementById('migration-pre-status');
    if (!btn) return;

    // Always reset button + status to a clean pre-cleanup state.
    // This function is also called when the overlay is re-shown
    // (e.g. residue reappears after a successful migration); without
    // this, btn.disabled / btn.textContent / status would carry over
    // from the previous click and the user would be locked out.
    btn.disabled = false;
    btn.textContent = 'Continue';
    if (status) {
        status.textContent = '';
        status.classList.add('hidden');
        status.classList.remove('error');
    }

    if (btn._listenerAdded) return;
    btn._listenerAdded = true;

    btn.addEventListener('click', async () => {
        if (btn.disabled) return;
        btn.disabled = true;
        if (status) {
            status.textContent = 'Approve the admin prompt to continue…';
            status.classList.remove('hidden', 'error');
        }

        const failTryAgain = (msg) => {
            btn.disabled = false;
            btn.textContent = 'Try again';
            if (status) {
                status.textContent = msg;
                status.classList.add('error');
            }
        };

        // Race the IPC Promise against a periodic disk-state poll.
        // The Promise is the fast signal (resolves on UAC decline in
        // <1s; on cleanup completion within a few seconds); the poll
        // is the safety net for cases where the Promise never settles
        // (we've seen this happen with the blocking elevated
        // PowerShell on the executor thread). Whichever signals
        // first wins. The poll alone would be correct but too slow on
        // the cancel path (user would wait for the timeout).
        const POLL_MS = 1500;
        const TIMEOUT_MS = 120000;
        const start = Date.now();
        let invokeSettled = false;
        const invokePromise = invoke('run_upgrade_migration')
            .catch((e) => {
                console.warn('[migration] run_upgrade_migration rejected:', e);
            })
            .finally(() => { invokeSettled = true; });

        try {
            while (true) {
                // Sleep, but wake early if the IPC Promise settles.
                await Promise.race([
                    new Promise((r) => setTimeout(r, POLL_MS)),
                    invokePromise,
                ]);
                const stillPending = await invoke('migration_pending');
                if (!stillPending) break;
                // Fast path: IPC said it's done AND residue is still
                // there → user cancelled / cleanup failed. Don't make
                // them wait for the polling timeout.
                if (invokeSettled) {
                    failTryAgain("We need that admin permission to finish — your blocklists are safe.");
                    return;
                }
                if (Date.now() - start > TIMEOUT_MS) {
                    failTryAgain("Something went wrong. Click to retry.");
                    return;
                }
            }
            const fresh = await invoke('onboarding_state');
            await showMigrationOnboarding('post', fresh);
        } catch (e) {
            console.warn('[migration] poll failed:', e);
            failTryAgain("Something went wrong. Click to retry.");
        }
    });
}

function wireMigrationPostPhase(state) {
    renderBrowserInstallButtons(state);
    const doneBtn = document.getElementById('migration-done-btn');
    const skipBtn = document.getElementById('migration-skip-btn');

    const finish = async () => {
        try {
            await invoke('enforcer_start');
        } catch (e) {
            console.warn('[migration] enforcer_start failed:', e);
        }
        // Persist dismissal so we don't surface this full-screen
        // again on every launch — the slim extension-compliance
        // banner takes over for ongoing nagging. Stored locally
        // (per-install) which is fine for a UX hint.
        try { localStorage.setItem(EXT_ONBOARDING_DISMISSED_KEY, String(Date.now())); }
        catch (_) { /* localStorage may be disabled; harmless */ }
        hideMigrationOnboarding();
        try {
            const fresh = await invoke('onboarding_state');
            await updateBehaviourChangeBanner(fresh);
        } catch (e) { /* no-op */ }
    };

    if (doneBtn && !doneBtn._listenerAdded) {
        doneBtn._listenerAdded = true;
        doneBtn.addEventListener('click', finish);
    }
    if (skipBtn && !skipBtn._listenerAdded) {
        skipBtn._listenerAdded = true;
        skipBtn.addEventListener('click', finish);
    }
}

// Per-browser metadata: label + extension store URL (Chromium-family
// browsers all use the Chrome Web Store listing).
const BROWSER_STORE_LINKS = {
    chrome: { label: 'Chrome', url: 'https://chromewebstore.google.com/detail/redd-focus-hide-distracti/hhblkhfdjijdinijakbmcpkmdfhoadcd' },
    brave: { label: 'Brave', url: 'https://chromewebstore.google.com/detail/redd-focus-hide-distracti/hhblkhfdjijdinijakbmcpkmdfhoadcd' },
    edge: { label: 'Edge', url: 'https://chromewebstore.google.com/detail/redd-focus-hide-distracti/hhblkhfdjijdinijakbmcpkmdfhoadcd' },
    firefox: { label: 'Firefox', url: 'https://addons.mozilla.org/en-US/firefox/addon/reddfocus/' },
    safari: { label: 'Safari', url: 'https://apps.apple.com/us/app/redd-focus-hide-distractions/id1660218371' },
};

// Names users typically end up with in the app blocklist when they pick
// a browser via "Browse Applications" or type one in by hand. Values are
// normalized — lowercased, with `.app` / `.exe` stripped — so the
// comparison in `isBrowserAppName` is a flat Set lookup.
//
// Used by the blocklist editor to surface a tab-restore hint when the
// user's apps list contains a browser, since the force-close path can
// drop unsaved form data + open tabs.
const BROWSER_APP_NORMALIZED_NAMES = new Set([
    'safari',
    'google chrome',
    'chrome',
    'chromium',
    'firefox',
    'firefox developer edition',
    'firefox nightly',
    'microsoft edge',
    'edge',
    'msedge',
    'brave browser',
    'brave',
    'arc',
    'opera',
    'opera gx',
    'vivaldi',
    'tor browser',
    'duckduckgo',
    'duckduckgo browser',
    'librewolf',
    'waterfox',
    'zen',
    'zen browser',
]);

function isBrowserAppName(name) {
    if (!name) return false;
    const normalized = String(name)
        .trim()
        .toLowerCase()
        .replace(/\.(app|exe)$/, '');
    return BROWSER_APP_NORMALIZED_NAMES.has(normalized);
}

// Compute per-step status for the migration UI:
//   - 'compliant': extension installed, enabled, allowed in private, allowed on all websites
//   - 'needs-website-access': Safari installed + enabled + private, but not allowed on all websites
//   - 'needs-private': installed + enabled but not allowed in private
//   - 'needs-enable': installed but disabled
//   - 'needs-install': extension not installed
// Returns null if the browser itself isn't installed on the machine.
function browserComplianceStatus(key, b) {
    if (!b || !b.installed) return null;
    const profiles = b.profiles || [];
    const def = profiles.find(p => p.isDefault) || profiles[0];
    if (key === 'safari') {
        if (profiles.some(p => /Full Disk Access|extension settings plist|Safari extension settings/i.test(p.note || ''))) {
            return 'needs-fda';
        }
        if (!profiles.length || profiles.some(p => !p.installed)) return 'needs-install';
        if (profiles.some(p => p.enabled === false)) return 'needs-enable';
        if (profiles.some(p => p.privateBrowsing !== true)) return 'needs-private';
        if (profiles.some(p => p.websiteAccessAll !== true)) return 'needs-website-access';
        return 'compliant';
    }
    if (!def || !def.installed) return 'needs-install';
    const enabled = def.enabled;
    if (enabled === false) return 'needs-enable';
    const priv = def.privateBrowsing;
    if (priv !== true) return 'needs-private';
    return 'compliant';
}

function statusLabel(key, status) {
    switch (status) {
        case 'compliant': return '✓ Installed & allowed in private tabs';
        case 'needs-fda': return 'Grant Full Disk Access';
        case 'needs-website-access': return 'Allow on all websites';
        case 'needs-private': return 'Allow in private browsing';
        case 'needs-enable': return 'Enable extension';
        case 'needs-install': return 'Install';
        default: return 'Install';
    }
}

function safariProfileLabel(profile) {
    const name = String(profile && profile.name ? profile.name : '').trim();
    if (!name || name === '(Default Safari profile)') return 'Default Safari profile';
    return name;
}

function safariProfileStatusHint(b, status) {
    const profiles = b && Array.isArray(b.profiles) ? b.profiles : [];
    if (profiles.length <= 1) return null;

    const failing = profiles.filter(profile => {
        switch (status) {
            case 'needs-install': return !profile.installed;
            case 'needs-enable': return !profile.installed || profile.enabled === false;
            case 'needs-private': return !profile.installed || profile.enabled !== true || profile.privateBrowsing !== true;
            case 'needs-website-access': return !profile.installed || profile.enabled !== true || profile.privateBrowsing !== true || profile.websiteAccessAll !== true;
            case 'needs-fda': return /Full Disk Access|extension settings plist|Safari extension settings/i.test(profile.note || '');
            default: return false;
        }
    });
    if (!failing.length) return null;

    const labels = failing.slice(0, 3).map(safariProfileLabel);
    const suffix = failing.length > labels.length ? `, +${failing.length - labels.length} more` : '';
    return `Affected Safari profiles: ${labels.join(', ')}${suffix}.`;
}

function extensionsUrl(key) {
    switch (key) {
        case 'chrome': return 'chrome://extensions';
        case 'edge': return 'edge://extensions';
        case 'brave': return 'brave://extensions';
        case 'firefox': return 'about:addons';
        case 'safari': return 'Safari → Settings → Extensions';
        default: return 'extensions';
    }
}

function privateModeNoun(key) {
    switch (key) {
        case 'chrome': return 'Incognito';
        case 'edge': return 'InPrivate';
        case 'brave': return 'Incognito';
        case 'firefox': return 'Private Windows';
        case 'safari': return 'Private Browsing';
        default: return 'private/incognito';
    }
}

function browserStatusHint(key, entry, b, status) {
    const hasMultipleSafariProfiles = key === 'safari' && Array.isArray(b && b.profiles) && b.profiles.length > 1;
    const safariSuffix = key === 'safari'
        ? ` ${safariProfileStatusHint(b, status) || 'Check every Safari profile.'}`
        : '';
    switch (status) {
        case 'needs-enable':
            return key === 'safari'
                ? hasMultipleSafariProfiles
                    ? `Enable ReDD Focus in Safari's extension settings for every Safari profile.${safariSuffix}`
                    : `Enable ReDD Focus in Safari's extension settings.`
                : `Enable ReDD Focus in ${entry.label}'s extensions settings.`;
        case 'needs-private':
            return key === 'safari'
                ? hasMultipleSafariProfiles
                    ? `Allow ReDD Focus in Private Browsing for every Safari profile.${safariSuffix}`
                    : `Allow ReDD Focus in Private Browsing in Safari's extension settings.`
                : `Allow ReDD Focus in private/incognito browsing in ${entry.label}'s extensions settings.`;
        case 'needs-website-access':
            return hasMultipleSafariProfiles
                ? `Allow ReDD Focus on all websites for every Safari profile.${safariSuffix}`
                : `Allow ReDD Focus on all websites in Safari's extension settings.`;
        default:
            return '';
    }
}

function renderBrowserInstallButtons(state) {
    const container = document.getElementById('migration-browser-buttons');
    const checklistItem = document.getElementById('migration-checklist-ext');
    if (!container) return;
    container.innerHTML = '';

    const browsers = state && state.browsers ? state.browsers : {};

    // Show every browser we detect on disk (regardless of running
    // state). During migration the user may need to install the
    // extension in browsers they haven't opened yet — only filtering
    // to running browsers (as the in-session compliance banner does)
    // would hide those.
    const detectedKeys = Object.keys(BROWSER_STORE_LINKS).filter(k => {
        const b = browsers[k];
        return b && b.installed;
    });

    // Fallback: if the scan didn't identify any installed browser
    // (unusual), surface a single Chrome row so the user has
    // somewhere to go.
    const keys = detectedKeys.length > 0 ? detectedKeys : ['chrome'];

    for (const key of keys) {
        const entry = BROWSER_STORE_LINKS[key];
        if (!entry) continue;
        const status = browserComplianceStatus(key, browsers[key]) || 'needs-install';

        const row = document.createElement('div');
        row.className = `migration-browser-row ${status}`;

        // Two-line row layout: header (browser name + status badge)
        // on top, action (URL + Copy, or hint text) below. Keeps each
        // row readable at typical window widths and avoids the prior
        // cramped single-line stacking.
        const header = document.createElement('div');
        header.className = 'migration-browser-header';

        const name = document.createElement('span');
        name.className = 'migration-browser-name';

        const icon = document.createElement('img');
        icon.className = 'migration-browser-icon';
        icon.src = browserIconUrl(key);
        icon.alt = '';
        icon.setAttribute('aria-hidden', 'true');
        name.appendChild(icon);

        name.appendChild(document.createTextNode(entry.label));
        header.appendChild(name);

        const badge = document.createElement('span');
        badge.className = `migration-browser-badge ${status}`;
        switch (status) {
            case 'compliant': badge.textContent = statusLabel(key, status); break;
            case 'needs-install': badge.textContent = 'Not installed'; break;
            case 'needs-enable': badge.textContent = 'Disabled'; break;
            case 'needs-private': badge.textContent = 'Not allowed in private tabs'; break;
            case 'needs-website-access': badge.textContent = 'No website access'; break;
            case 'needs-fda': badge.textContent = 'Needs access'; break;
            default: badge.textContent = 'Not installed';
        }
        header.appendChild(badge);

        row.appendChild(header);

        if (status === 'needs-fda') {
            const hint = document.createElement('div');
            hint.className = 'migration-browser-hint';
            hint.textContent = 'Grant ReDD Block Full Disk Access so it can verify Safari extension settings. Safari will be closed during active enforcement until this is fixed.';
            row.appendChild(hint);

            const action = document.createElement('div');
            action.className = 'migration-browser-action';

            const settingsBtn = document.createElement('button');
            settingsBtn.type = 'button';
            settingsBtn.className = 'migration-browser-copy';
            settingsBtn.textContent = 'Open Settings';
            settingsBtn.title = 'Open Full Disk Access settings';
            settingsBtn.addEventListener('click', async () => {
                try {
                    await invoke('open_safari_fda_settings');
                    settingsBtn.textContent = 'Opened';
                    setTimeout(() => { settingsBtn.textContent = 'Open Settings'; }, 1500);
                } catch (e) {
                    console.warn('[migration] open Full Disk Access settings failed:', e);
                    settingsBtn.textContent = 'Failed';
                    setTimeout(() => { settingsBtn.textContent = 'Open Settings'; }, 1500);
                }
            });
            action.appendChild(settingsBtn);

            const refreshBtn = document.createElement('button');
            refreshBtn.type = 'button';
            refreshBtn.className = 'migration-browser-copy secondary';
            refreshBtn.textContent = 'Check again';
            refreshBtn.title = 'Refresh Safari access status';
            refreshBtn.addEventListener('click', pollMigrationCompliance);
            action.appendChild(refreshBtn);

            row.appendChild(action);
        } else if (status === 'needs-install') {
            const action = document.createElement('div');
            action.className = 'migration-browser-action';

            const urlText = document.createElement('code');
            urlText.className = 'migration-browser-url';
            urlText.textContent = entry.url;
            urlText.title = entry.url;
            action.appendChild(urlText);

            const copyBtn = document.createElement('button');
            copyBtn.type = 'button';
            copyBtn.className = 'migration-browser-copy';
            copyBtn.textContent = 'Copy URL';
            copyBtn.title = `Copy URL — paste into ${entry.label} to install`;
            copyBtn.addEventListener('click', async () => {
                try {
                    await navigator.clipboard.writeText(entry.url);
                    copyBtn.textContent = 'Copied';
                    setTimeout(() => { copyBtn.textContent = 'Copy'; }, 1500);
                } catch (e) {
                    console.warn('[migration] clipboard write failed:', e);
                    copyBtn.textContent = 'Failed';
                    setTimeout(() => { copyBtn.textContent = 'Copy'; }, 1500);
                }
            });
            action.appendChild(copyBtn);

            row.appendChild(action);

            // After-install hint: tell users about private tabs
            const afterHint = document.createElement('div');
            afterHint.className = 'migration-browser-hint migration-browser-after-hint';
            const extUrl = extensionsUrl(key);
            const privNoun = privateModeNoun(key);
            afterHint.innerHTML = `After installing, open <button type="button" class="migration-inline-url-btn">${extUrl}</button> → click <strong>Details</strong> on ReDD Focus → turn on <strong>Allow in ${privNoun}</strong>.`;
            afterHint.querySelector('.migration-inline-url-btn').addEventListener('click', () => {
                invoke('open_browser_extension_settings', { browser: key }).catch(e => console.warn('[migration] open ext settings:', e));
            });
            row.appendChild(afterHint);
        } else if (status === 'needs-enable' || status === 'needs-private' || status === 'needs-website-access') {
            // Mirror the notification-banner layout for clarity:
            // [optional ✓ Extension installed]
            // instruction text with inline url chip
            // [Open <url>] [Show me how ▶]
            // delay note
            // [screenshots wrap, full-row when expanded]
            if (status !== 'needs-enable') {
                const extInstalledLine = document.createElement('div');
                extInstalledLine.className = 'migration-checklist-line migration-checklist-done';
                extInstalledLine.innerHTML = `<span class="migration-check-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#047857" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg></span> Extension installed`;
                row.appendChild(extInstalledLine);
            }

            const extUrl = extensionsUrl(key);
            const privNoun = privateModeNoun(key);
            const steps = enforcerScreenshotSteps(key);
            const hasSteps = steps && steps.length;

            const instructionLine = document.createElement('div');
            instructionLine.className = 'migration-instruction';
            let actionText;
            if (status === 'needs-enable') {
                actionText = `Open <button type="button" class="migration-inline-url-btn">${extUrl}</button> → find <strong>ReDD Focus</strong> → enable the extension.`;
            } else if (status === 'needs-website-access') {
                actionText = `Open <button type="button" class="migration-inline-url-btn">${extUrl}</button> → click <strong>Details</strong> on ReDD Focus → allow on <strong>all websites</strong>.`;
            } else {
                actionText = `Open <button type="button" class="migration-inline-url-btn">${extUrl}</button> → click <strong>Details</strong> on ReDD Focus → turn on <strong>Allow in ${privNoun}</strong>.`;
            }
            instructionLine.innerHTML = actionText;
            instructionLine.querySelector('.migration-inline-url-btn').addEventListener('click', () => {
                invoke('open_browser_extension_settings', { browser: key }).catch(e => console.warn('[migration] open ext settings:', e));
            });
            row.appendChild(instructionLine);

            const actionsRow = document.createElement('div');
            actionsRow.className = 'migration-actions-row';

            const primaryBtn = document.createElement('button');
            primaryBtn.type = 'button';
            primaryBtn.className = 'migration-primary-btn';
            primaryBtn.innerHTML = `Open <code class="migration-primary-btn-url">${extUrl}</code>`;
            primaryBtn.addEventListener('click', () => {
                invoke('open_browser_extension_settings', { browser: key }).catch(e => console.warn('[migration] open ext settings:', e));
            });
            actionsRow.appendChild(primaryBtn);

            let showMeBtn = null;
            if (hasSteps) {
                showMeBtn = document.createElement('button');
                showMeBtn.type = 'button';
                showMeBtn.className = 'migration-show-me-btn';
                showMeBtn.setAttribute('aria-expanded', 'false');
                showMeBtn.innerHTML = `<span>Show me how</span><svg class="migration-show-me-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="9 6 15 12 9 18"></polyline></svg>`;
                actionsRow.appendChild(showMeBtn);
            }

            row.appendChild(actionsRow);

            const delayNote = document.createElement('div');
            delayNote.className = 'migration-browser-hint migration-delay-note';
            delayNote.textContent = 'It may take up to 10 seconds for changes to be detected.';
            row.appendChild(delayNote);

            if (hasSteps) {
                const screenshotsWrap = document.createElement('div');
                screenshotsWrap.className = 'migration-screenshots-wrap hidden';

                const screenshotsContainer = document.createElement('div');
                screenshotsContainer.className = `extension-enforcer-screenshots ${steps.length >= 3 ? 'screenshots-grid' : 'screenshots-row'}`;

                steps.forEach((step, i) => {
                    if (i > 0 && steps.length < 3) {
                        const arrow = document.createElement('span');
                        arrow.className = 'extension-enforcer-screenshot-arrow';
                        arrow.textContent = '→';
                        screenshotsContainer.appendChild(arrow);
                    }
                    const figure = document.createElement('figure');
                    figure.className = 'extension-enforcer-step';
                    if (step.label) {
                        const caption = document.createElement('figcaption');
                        caption.className = 'extension-enforcer-step-label';
                        caption.textContent = `Step ${i + 1}: ${step.label}`;
                        figure.appendChild(caption);
                    }
                    const img = document.createElement('img');
                    img.className = 'extension-enforcer-screenshot';
                    img.src = step.src;
                    img.alt = step.label || `Step ${i + 1}`;
                    figure.appendChild(img);
                    screenshotsContainer.appendChild(figure);
                });

                screenshotsWrap.appendChild(screenshotsContainer);
                row.appendChild(screenshotsWrap);

                showMeBtn.addEventListener('click', () => {
                    const isOpen = showMeBtn.classList.toggle('open');
                    screenshotsWrap.classList.toggle('hidden', !isOpen);
                    showMeBtn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
                });
            }
        }

        container.appendChild(row);
    }

    // Show the "How to install" instructions only when at least one
    // browser still needs the extension. Hidden when everything's
    // compliant — the user is done, no need to nag.
    const howto = document.getElementById('migration-howto');
    const anyMissing = keys.some(k => browserComplianceStatus(k, browsers[k]) !== 'compliant');
    if (howto) howto.classList.toggle('hidden', !anyMissing);

    // Tick the checklist as "done" only once every detected browser
    // is compliant. "any" was misleading — if Firefox was set up but
    // Brave still needed installing, the checklist would mark itself
    // green even though there's still work to do.
    if (checklistItem) {
        const allCompliant = keys.length > 0
            && keys.every(k => browserComplianceStatus(k, browsers[k]) === 'compliant');
        if (allCompliant) {
            checklistItem.classList.remove('checklist-todo');
            checklistItem.classList.add('checklist-done');
            const mark = checklistItem.querySelector('.checklist-mark');
            if (mark) mark.textContent = '✓';
        } else {
            checklistItem.classList.remove('checklist-done');
            checklistItem.classList.add('checklist-todo');
            const mark = checklistItem.querySelector('.checklist-mark');
            if (mark) mark.textContent = '○';
        }
    }
}

// While the post-cleanup screen is open, periodically re-check
// extension compliance so the checklist ticks itself off when the
// user comes back from the store.
async function pollMigrationCompliance() {
    if (!migrationOnboardingActive) return;
    try {
        const fresh = await invoke('onboarding_state');
        renderBrowserInstallButtons(fresh);
    } catch (e) { /* no-op */ }
}
window.addEventListener('focus', () => {
    if (migrationOnboardingActive) {
        pollMigrationCompliance();
    } else {
        // When the migration overlay isn't open, refresh the slim
        // banner instead — the user may have just finished allowing
        // the extension in another browser and tabbed back here, so
        // the banner needs to either disappear (now compliant) or
        // re-show (regression detected). Throttled inside.
        refreshBehaviourBannerIfStale();
    }
});

// Treat "window was hidden, then shown again" as a fresh session
// for the slim setup banner. ReDD Block's red-X / Cmd-W handler
// hides the window to the tray rather than quitting (see the
// applicationShouldTerminate guard in lib.rs), so a normal user's
// "close and reopen the app" doesn't kill the JS context — without
// this hook, a × dismissal would persist across hide/show cycles
// and effectively become "dismiss forever" until tray-Quit or
// reboot. Resetting on the hidden→visible transition mirrors the
// user's mental model: closing the window ends the session.
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    const wasDismissed = behaviourBannerDismissedThisSession;
    behaviourBannerDismissedThisSession = false;
    if (!wasDismissed) return;
    // Force a refresh that bypasses the 30 s throttle: the user
    // just deliberately re-opened the window, so the focus-based
    // throttle (which exists to absorb rapid app-switching) is
    // exactly wrong here — they expect the banner state they see
    // now to reflect right now, not 30 s ago.
    refreshBehaviourBannerIfStale({ force: true });
});

// Session-only flag for the slim setup banner. We deliberately do
// NOT persist this in localStorage anymore: the banner is a status
// indicator ("you have a browser without ReDD Focus set up"), not
// a one-time notice. Persisting dismissal silently hid the reminder
// forever, so fresh users who clicked × on it after the welcome
// screen never saw it again — even though the underlying problem
// (extension not allowed in incognito on Chrome, etc.) was still
// there. Now × hides for the session and the banner re-evaluates
// on every launch / focus refresh.
let behaviourBannerDismissedThisSession = false;

// Persistent low-key reminder banner. Surfaces on every launch
// whenever any browser the user has installed is missing the
// ReDD Focus extension (or has it disabled, or not allowed in
// private browsing). Auto-hides when every installed browser is
// fully compliant — i.e. the banner is purely a "you still have
// setup to do" indicator. Independent of the v1.x migration story:
// fresh installs see it too, because a fresh user with the
// extension not yet installed in their daily-driver browser is in
// exactly the same shape as a v1.x upgrader who hasn't installed
// the extension yet — both need the reminder.
//
// Body copy is built per-state: instead of generic "install ReDD
// Focus" text, we surface the actual outstanding actions so the
// user knows at a glance what's still missing without having to
// open the setup dialog (e.g. "Install in Chrome and Edge · Allow
// in private browsing in Brave").
async function updateBehaviourChangeBanner(state) {
    const banner = document.getElementById('behaviour-change-banner');
    if (!banner) return;

    // Compute "are they done with extension setup yet?". `installed`
    // means the browser app exists on disk (regardless of running
    // state) — same scope the welcome screen uses, so the user
    // doesn't get nagged about Brave if they don't have Brave.
    const browsers = (state && state.browsers) || {};
    const detectedKeys = Object.keys(BROWSER_STORE_LINKS).filter(k => browsers[k] && browsers[k].installed);
    const allCompliant = detectedKeys.length > 0
        && detectedKeys.every(k => browserComplianceStatus(k, browsers[k]) === 'compliant');

    const shouldShow = !behaviourBannerDismissedThisSession
        && detectedKeys.length > 0
        && !allCompliant;
    if (!shouldShow) {
        banner.classList.add('hidden');
        return;
    }
    banner.classList.remove('hidden');

    const summary = buildBannerActionSummary(browsers, detectedKeys);
    const bodyEl = document.getElementById('behaviour-change-text');
    if (bodyEl) {
        // `summary` is built from a fixed vocabulary of phrases plus
        // BROWSER_STORE_LINKS labels — both are app-controlled
        // constants, no user input — so plain textContent is safe
        // and avoids any XSS surface even if a future label gains
        // unusual characters.
        bodyEl.textContent = summary;
    }

    const helpBtn = document.getElementById('behaviour-change-help');
    const dismissBtn = document.getElementById('behaviour-change-dismiss');
    if (helpBtn && !helpBtn._listenerAdded) {
        helpBtn._listenerAdded = true;
        helpBtn.addEventListener('click', openExtensionSetupOverlay);
    }
    if (dismissBtn && !dismissBtn._listenerAdded) {
        dismissBtn._listenerAdded = true;
        dismissBtn.addEventListener('click', () => {
            behaviourBannerDismissedThisSession = true;
            banner.classList.add('hidden');
        });
    }
}

// Build a compact, action-grouped summary of what's still missing
// across the user's installed browsers. Browsers with the same
// outstanding action are grouped into a single phrase so the
// banner doesn't repeat verbs:
//
//   "Install in Chrome and Edge · Allow in private browsing in Brave"
//   "Allow on all websites in Safari · Grant Full Disk Access for Safari"
//
// Order is foundational-first (install → enable → private → website
// access → FDA) so the user sees the prerequisite step before any
// follow-up step. Returns "" when nothing is non-compliant — the
// caller is expected to have already gated on that, but defending
// against an empty result keeps callers safe.
function buildBannerActionSummary(browsers, detectedKeys) {
    const groups = new Map();
    for (const key of detectedKeys) {
        const status = browserComplianceStatus(key, browsers[key]);
        if (!status || status === 'compliant') continue;
        const label = BROWSER_STORE_LINKS[key]?.label || key;
        if (!groups.has(status)) groups.set(status, []);
        groups.get(status).push(label);
    }

    const order = ['needs-install', 'needs-enable', 'needs-private', 'needs-website-access', 'needs-fda'];
    const phrases = [];
    for (const status of order) {
        const list = groups.get(status);
        if (!list || list.length === 0) continue;
        phrases.push(`${bannerActionPhrase(status)} ${joinBrowserNames(list)}`);
    }
    return phrases.join(' · ');
}

function bannerActionPhrase(status) {
    switch (status) {
        case 'needs-install': return 'Install in';
        case 'needs-enable': return 'Enable in';
        case 'needs-private': return 'Allow in private browsing in';
        case 'needs-website-access': return 'Allow on all websites in';
        case 'needs-fda': return 'Grant Full Disk Access for';
        default: return 'Set up in';
    }
}

// Natural-language join: "Chrome", "Chrome and Edge",
// "Chrome, Edge, and Brave" (Oxford comma).
function joinBrowserNames(list) {
    if (list.length === 0) return '';
    if (list.length === 1) return list[0];
    if (list.length === 2) return `${list[0]} and ${list[1]}`;
    return `${list.slice(0, -1).join(', ')}, and ${list[list.length - 1]}`;
}

// Re-opens the post-cleanup migration overlay (the per-browser
// install checklist) — the canonical "set up ReDD Focus" surface.
// Used by both the slim banner's "Set up extension" button and the
// new Settings → Advanced Options entry. Centralised so both call
// sites stay in sync if the overlay's API changes.
async function openExtensionSetupOverlay() {
    try {
        const fresh = await invoke('onboarding_state');
        migrationOnboardingDismissed = false;
        // Hide settings if it was the launch point — the migration
        // overlay needs the full window.
        document.getElementById('settings-modal')?.classList.add('hidden');
        await showMigrationOnboarding('post', fresh, { mode: 'fresh' });
    } catch (e) {
        console.warn('[setup-overlay] reopen failed:', e);
    }
}

// Re-poll extension compliance so the slim banner reflects reality
// if the user just finished setting up an extension in another
// browser and tabbed back. Throttled by default to avoid hammering
// `onboarding_state` (which does a full profile scan that touches
// each browser's data folder — expensive and, on macOS Sequoia,
// the source of the "ReDD Block would like to access data from
// other apps" prompts) on rapid focus toggling. Pass `force: true`
// to bypass the throttle when the trigger is a deliberate user
// action (e.g. window hide → show transition).
let lastBannerRefreshAt = 0;
const BANNER_REFRESH_THROTTLE_MS = 30_000;
async function refreshBehaviourBannerIfStale({ force = false } = {}) {
    if (isIOS) return;
    if (migrationOnboardingActive) return; // overlay is the source of truth
    const now = Date.now();
    if (!force && now - lastBannerRefreshAt < BANNER_REFRESH_THROTTLE_MS) return;
    lastBannerRefreshAt = now;
    try {
        const fresh = await invoke('onboarding_state');
        await updateBehaviourChangeBanner(fresh);
    } catch (_) { /* no-op */ }
}

// ---- Enforcer UI: dynamic per-browser action banners ---------------------
// Subscribes to Rust enforcer events and shows attention-grabbing dark-orange
// banners with a live countdown when a browser is about to be closed.

let enforcerUiAlertsAttached = false;
const enforcerActionBannerStates = new Map();
let enforcerActionBannerInterval = null;

function setupEnforcerUiAlerts() {
    if (isIOS || enforcerUiAlertsAttached) return;
    enforcerUiAlertsAttached = true;
    tauriAPI.onEnforcerGraceUpdate((event) => {
        const payload = event?.payload || {};
        renderEnforcerActionBanner(payload);
    }).catch((e) => {
        console.warn('[enforcer-ui] failed to attach grace-update listener:', e);
        enforcerUiAlertsAttached = false;
    });
    tauriAPI.onEnforcerGraceResolved((event) => {
        const payload = event?.payload || {};
        hideEnforcerActionBanner(payload.browser || payload.label);
    }).catch((e) => {
        console.warn('[enforcer-ui] failed to attach grace-resolved listener:', e);
    });
    tauriAPI.onEnforcerBrowserClosed((event) => {
        const payload = event?.payload || {};
        renderEnforcerClosedBanner(payload);
    }).catch((e) => {
        console.warn('[enforcer-ui] failed to attach browser-closed listener:', e);
    });
}

function browserKeyFromLabel(label) {
    if (!label) return null;
    const normalized = String(label).toLowerCase();
    if (normalized.includes('firefox')) return 'firefox';
    if (normalized.includes('brave')) return 'brave';
    if (normalized.includes('edge')) return 'edge';
    if (normalized.includes('safari')) return 'safari';
    return 'chrome';
}

function browserIconUrl(key) {
    switch (key) {
        case 'firefox': return iconFirefoxUrl;
        case 'edge': return iconEdgeUrl;
        case 'safari': return iconSafariUrl;
        case 'brave':
        case 'chrome':
        default: return iconChromeUrl;
    }
}

function enforcerScreenshotSteps(key) {
    if (key === 'chrome') return [
        { src: screenshotChromeStep1, label: 'Open Chrome extension settings' },
        { src: screenshotChromeStep2, label: 'Open Details for ReDD Focus and allow it in Incognito windows' },
    ];
    if (key === 'edge') return [
        { src: screenshotEdgeStep1, label: 'Open Edge extension settings' },
        { src: screenshotEdgeStep2, label: 'Open Details for ReDD Focus and allow it in InPrivate windows' },
    ];
    if (key === 'firefox') return [
        { src: screenshotFirefoxStep1, label: 'Find ReDD Focus' },
        { src: screenshotFirefoxStep2, label: 'Allow in Private Windows' },
    ];
    if (key === 'safari') return [
        { src: screenshotSafariStep1, label: 'Find ReDD Focus' },
        { src: screenshotSafariStep2, label: 'Enable in Private Browsing' },
    ];
    return null;
}

function enforcerCopy(payload) {
    const browser = payload.label || payload.browser || 'your browser';
    const seconds = Math.max(0, Number(payload.remaining_secs ?? payload.remainingSecs ?? 0));
    const issue = payload.issue || 'unknown';

    if (issue === 'missing') {
        return {
            headline: `ReDD Focus isn't installed in ${browser}.`,
            countdown: `Auto-closing ${browser} in ${seconds}s if not fixed`,
            instruction: `Install ReDD Focus for ${browser}.`,
            action: 'Install ReDD Focus',
        };
    }
    if (issue === 'disabled') {
        const key = browserKeyFromLabel(browser);
        const extUrl = extensionsUrl(key);
        const screenshotSteps = enforcerScreenshotSteps(key);
        return {
            headline: `ReDD Focus is turned off in ${browser}`,
            countdown: `Auto-closing ${browser} in ${seconds}s if not fixed`,
            instructionHtml: `Open <button type="button" class="migration-inline-url-btn enforcer-inline-url-btn">${extUrl}</button> → find <strong>ReDD Focus</strong> → enable the extension.`,
            note: 'It may take up to 10 seconds for changes to be detected.',
            action: `Open ${browser} Extensions`,
            actionHtml: `Open <code class="extension-enforcer-action-btn-url">${extUrl}</code>`,
            screenshotSteps,
        };
    }
    if (issue === 'private') {
        const key = browserKeyFromLabel(browser);
        const extUrl = extensionsUrl(key);
        const privNoun = privateModeNoun(key);
        const screenshotSteps = enforcerScreenshotSteps(key);
        return {
            headline: `ReDD Focus isn't allowed in private tabs`,
            countdown: `Auto-closing ${browser} in ${seconds}s if not fixed`,
            instructionHtml: `Open <button type="button" class="migration-inline-url-btn enforcer-inline-url-btn">${extUrl}</button> → click <strong>Details</strong> on ReDD Focus → turn on <strong>Allow in ${privNoun}</strong>.`,
            note: 'It may take up to 10 seconds for changes to be detected.',
            action: `Open ${browser} Extensions`,
            actionHtml: `Open <code class="extension-enforcer-action-btn-url">${extUrl}</code>`,
            screenshotSteps,
        };
    }
    if (issue === 'websiteaccess') {
        return {
            headline: `ReDD Focus isn't allowed on all websites in ${browser}.`,
            countdown: `Auto-closing ${browser} in ${seconds}s if not fixed`,
            instruction: `In ${browser} extension settings, allow ReDD Focus on all websites.`,
            action: `Open ${browser} Extensions`,
        };
    }
    if (issue === 'access') {
        return {
            headline: `ReDD Block can't verify ReDD Focus in ${browser}.`,
            countdown: `Auto-closing ${browser} in ${seconds}s if not fixed`,
            instruction: browser === 'Safari'
                ? 'Grant ReDD Block Full Disk Access.'
                : `Grant access so ReDD Block can verify ${browser}.`,
            action: browser === 'Safari' ? 'Open Full Disk Access' : `Open ${browser} Settings`,
        };
    }
    return {
        headline: `ReDD Focus isn't ready in ${browser}.`,
        countdown: `Auto-closing ${browser} in ${seconds}s if not fixed`,
        instruction: `Fix ReDD Focus in ${browser} extensions.`,
        action: `Open ${browser} Extensions`,
    };
}

function renderEnforcerActionCopy(banner, payload, copy) {
    const key = enforcerBannerKey(payload);
    const icon = banner.querySelector('.extension-enforcer-browser-icon');
    const headlineText = banner.querySelector('.extension-enforcer-action-headline-text');
    const countdown = banner.querySelector('.extension-enforcer-action-countdown');
    const countdownRow = banner.querySelector('.extension-enforcer-action-countdown-row');
    const instruction = banner.querySelector('.extension-enforcer-action-instruction');

    if (icon) {
        icon.src = browserIconUrl(key);
        icon.alt = '';
        icon.title = payload.label || payload.browser || key;
    }
    if (headlineText) headlineText.textContent = copy.headline || '';
    if (countdown) countdown.textContent = copy.countdown || '';
    if (countdownRow) countdownRow.classList.toggle('hidden', !copy.countdown);
    if (instruction) {
        if (copy.instructionHtml) {
            instruction.innerHTML = copy.instructionHtml;
            const urlBtn = instruction.querySelector('.enforcer-inline-url-btn');
            if (urlBtn) {
                urlBtn.addEventListener('click', () => {
                    invoke('open_browser_extension_settings', { browser: key }).catch(e => console.warn('[enforcer] open ext settings:', e));
                });
            }
        } else {
            instruction.textContent = copy.instruction || '';
        }
    }

    const note = banner.querySelector('.extension-enforcer-action-note');
    if (note) {
        note.textContent = copy.note || '';
        note.classList.toggle('hidden', !copy.note);
    }

    const showMeBtn = banner.querySelector('.extension-enforcer-show-me-btn');
    const screenshotsWrap = banner.querySelector('.extension-enforcer-screenshots-wrap');
    const container = banner.querySelector('.extension-enforcer-screenshots');
    if (showMeBtn && screenshotsWrap && container) {
        const steps = copy.screenshotSteps;
        if (steps && steps.length) {
            const stepsKey = steps.map(s => s.src).join(',');
            if (container.dataset.stepsKey !== stepsKey) {
                container.dataset.stepsKey = stepsKey;
                container.innerHTML = '';
                container.classList.toggle('screenshots-grid', steps.length >= 3);
                container.classList.toggle('screenshots-row', steps.length < 3);
                steps.forEach((step, i) => {
                    if (i > 0 && steps.length < 3) {
                        const arrow = document.createElement('span');
                        arrow.className = 'extension-enforcer-screenshot-arrow';
                        arrow.textContent = '→';
                        container.appendChild(arrow);
                    }
                    const figure = document.createElement('figure');
                    figure.className = 'extension-enforcer-step';
                    if (step.label) {
                        const caption = document.createElement('figcaption');
                        caption.className = 'extension-enforcer-step-label';
                        caption.textContent = `Step ${i + 1}: ${step.label}`;
                        figure.appendChild(caption);
                    }
                    const img = document.createElement('img');
                    img.className = 'extension-enforcer-screenshot';
                    img.src = step.src;
                    img.alt = step.label || `Step ${i + 1}`;
                    figure.appendChild(img);
                    container.appendChild(figure);
                });
            }
            showMeBtn.classList.remove('hidden');
        } else {
            showMeBtn.classList.add('hidden');
            showMeBtn.classList.remove('open');
            showMeBtn.setAttribute('aria-expanded', 'false');
            screenshotsWrap.classList.add('hidden');
        }
    }
}

function enforcerBannerKey(payload) {
    return browserKeyFromLabel(payload?.label || payload?.browser || 'chrome');
}

function enforcerBannerId(key) {
    return `extension-enforcer-action-banner-${key}`;
}

function ensureEnforcerActionBanner(payload) {
    const key = enforcerBannerKey(payload);
    let banner = document.getElementById(enforcerBannerId(key));
    if (banner) return { banner, key };

    banner = document.createElement('div');
    banner.id = enforcerBannerId(key);
    banner.className = 'update-banner extension-enforcer-action-banner';
    banner.dataset.browser = key;
    banner.innerHTML = `
        <div class="extension-enforcer-banner-top">
            <div class="update-banner-content">
                <svg class="extension-enforcer-alert-icon" width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
                    <circle cx="12" cy="12" r="11" fill="currentColor"></circle>
                    <rect x="11" y="6" width="2" height="8" rx="1" fill="white"></rect>
                    <circle cx="12" cy="17" r="1.3" fill="white"></circle>
                </svg>
                <div class="extension-enforcer-message">
                    <strong class="extension-enforcer-action-headline">
                        <img class="extension-enforcer-browser-icon" aria-hidden="true">
                        <span class="extension-enforcer-action-headline-text"></span>
                    </strong>
                    <em class="extension-enforcer-action-instruction"></em>
                    <div class="extension-enforcer-actions-row">
                        <button class="update-banner-btn extension-enforcer-action-btn" type="button"></button>
                        <button class="extension-enforcer-show-me-btn hidden" type="button" aria-expanded="false">
                            <span>Show me how</span>
                            <svg class="extension-enforcer-show-me-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                                <polyline points="9 6 15 12 9 18"></polyline>
                            </svg>
                        </button>
                    </div>
                </div>
                <div class="extension-enforcer-action-right">
                    <div class="extension-enforcer-action-countdown-row">
                        <svg class="extension-enforcer-clock-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                            <circle cx="12" cy="12" r="10"></circle>
                            <polyline points="12 6 12 12 16 14"></polyline>
                        </svg>
                        <span class="extension-enforcer-action-countdown"></span>
                    </div>
                    <small class="extension-enforcer-action-note hidden"></small>
                </div>
            </div>
            <button class="update-banner-dismiss extension-enforcer-action-dismiss" title="Dismiss" type="button"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>
        </div>
        <div class="extension-enforcer-screenshots-wrap hidden">
            <div class="extension-enforcer-screenshots"></div>
        </div>
    `;

    const showMeBtn = banner.querySelector('.extension-enforcer-show-me-btn');
    const screenshotsWrap = banner.querySelector('.extension-enforcer-screenshots-wrap');
    if (showMeBtn && screenshotsWrap) {
        showMeBtn.addEventListener('click', () => {
            const isOpen = showMeBtn.classList.toggle('open');
            screenshotsWrap.classList.toggle('hidden', !isOpen);
            showMeBtn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
        });
    }

    const setupBanner = document.getElementById('behaviour-change-banner');
    const existingBanners = document.querySelectorAll('.extension-enforcer-action-banner');
    const lastExistingBanner = existingBanners[existingBanners.length - 1];
    if (lastExistingBanner) {
        lastExistingBanner.insertAdjacentElement('afterend', banner);
    } else if (setupBanner) {
        setupBanner.insertAdjacentElement('afterend', banner);
    } else {
        document.querySelector('.app-container')?.prepend(banner);
    }

    banner.querySelector('.extension-enforcer-action-dismiss')?.addEventListener('click', () => {
        banner.classList.add('hidden');
    });
    return { banner, key };
}

function enforcerClosedCopy(payload) {
    const browser = payload.label || payload.browser || 'your browser';
    const issue = payload.issue || 'unknown';
    if (issue === 'private') {
        const key = browserKeyFromLabel(browser);
        const extUrl = extensionsUrl(key);
        const instruction = key === 'chrome'
            ? 'In Chrome, find ReDD Focus \u003e Details \u003e Allow in Incognito.'
            : key === 'firefox'
            ? 'In Firefox extension settings, click ReDD Focus \u003e Run in Private Windows \u003e Allow.'
            : '';
        const screenshotSteps = enforcerScreenshotSteps(key);
        return {
            headline: `${browser} was closed because ReDD Focus can't block in private/incognito windows.`,
            instruction: instruction.trim(),
            action: `Open ${browser} Extensions`,
            actionHtml: `Open <code class="extension-enforcer-action-btn-url">${extUrl}</code>`,
            screenshotSteps,
        };
    }
    if (issue === 'disabled') {
        const key = browserKeyFromLabel(browser);
        const extUrl = extensionsUrl(key);
        const screenshotSteps = enforcerScreenshotSteps(key);
        return {
            headline: `${browser} was closed because ReDD Focus is turned off.`,
            instruction: `In ${browser} extensions, turn ReDD Focus back on.`,
            action: `Open ${browser} Extensions`,
            actionHtml: `Open <code class="extension-enforcer-action-btn-url">${extUrl}</code>`,
            screenshotSteps,
        };
    }
    if (issue === 'missing') {
        return {
            headline: `${browser} was closed because ReDD Focus isn't installed.`,
            instruction: `Install ReDD Focus for ${browser}.`,
            action: 'Install ReDD Focus',
        };
    }
    if (issue === 'websiteaccess') {
        return {
            headline: `${browser} was closed because ReDD Focus isn't allowed on all websites.`,
            instruction: `In ${browser} extension settings, allow ReDD Focus on all websites.`,
            action: `Open ${browser} Extensions`,
        };
    }
    if (issue === 'access') {
        return {
            headline: `${browser} was closed because ReDD Block can't verify ReDD Focus.`,
            instruction: browser === 'Safari' ? 'Grant ReDD Block Full Disk Access.' : '',
            action: browser === 'Safari' ? 'Open Full Disk Access' : `Open ${browser} Settings`,
        };
    }
    return {
        headline: `${browser} was closed because ReDD Focus isn't ready.`,
        instruction: `Fix ReDD Focus in ${browser} extensions.`,
        action: `Open ${browser} Extensions`,
    };
}

async function openEnforcerFix(payload) {
    const browser = payload.label || payload.browser || 'Chrome';
    const key = browserKeyFromLabel(browser);
    try {
        if (payload.issue === 'missing' && key && BROWSER_STORE_LINKS[key]?.url) {
            // Open the store page in the correct browser so Windows
            // doesn't show a "choose an app" dialog.
            try {
                await invoke('open_url_in_browser', { browser: key, url: BROWSER_STORE_LINKS[key].url });
            } catch (_) {
                await openUrl(BROWSER_STORE_LINKS[key].url);
            }
            return;
        }
        if (payload.issue === 'access' && key === 'safari') {
            await invoke('open_safari_fda_settings');
            return;
        }
        // For disabled/private/websiteaccess issues, open the extension
        // settings page inside the correct browser.
        await invoke('open_browser_extension_settings', { browser: key || browser });
    } catch (e) {
        console.warn('[enforcer-ui] fix action failed:', e);
    }
}

function updateEnforcerActionBannerCountdown() {
    if (enforcerActionBannerStates.size === 0) return;
    for (const [key, state] of enforcerActionBannerStates) {
        const remainingSecs = Math.max(0, Math.ceil((state.deadline - Date.now()) / 1000));
        const payload = {
            ...state.payload,
            remaining_secs: remainingSecs,
            remainingSecs,
        };
        state.payload = payload;

        const banner = document.getElementById(enforcerBannerId(key));
        const copy = enforcerCopy(payload);
        if (banner) renderEnforcerActionCopy(banner, payload, copy);

        if (remainingSecs <= 0) {
            enforcerActionBannerStates.delete(key);
        }
    }
    if (enforcerActionBannerStates.size === 0 && enforcerActionBannerInterval) {
        clearInterval(enforcerActionBannerInterval);
        enforcerActionBannerInterval = null;
    }
}

function renderEnforcerActionBanner(payload) {
    if (!payload || !payload.browser) return;
    const { banner, key } = ensureEnforcerActionBanner(payload);

    const remainingSecs = Math.max(0, Number(payload.remaining_secs ?? payload.remainingSecs ?? 0));
    enforcerActionBannerStates.set(key, {
        payload: { ...payload, remaining_secs: remainingSecs, remainingSecs },
        deadline: Date.now() + remainingSecs * 1000,
    });

    const copy = enforcerCopy(payload);
    const action = banner.querySelector('.extension-enforcer-action-btn');
    renderEnforcerActionCopy(banner, payload, copy);
    if (action) {
        if (copy.actionHtml) {
            action.innerHTML = copy.actionHtml;
        } else {
            action.textContent = copy.action;
        }
        action.onclick = () => openEnforcerFix(payload);
    }
    if (!enforcerActionBannerInterval) {
        enforcerActionBannerInterval = setInterval(updateEnforcerActionBannerCountdown, 1000);
    }
    banner.classList.remove('hidden');
}

function renderEnforcerClosedBanner(payload) {
    if (!payload || !payload.browser) return;
    const { banner, key } = ensureEnforcerActionBanner(payload);
    enforcerActionBannerStates.delete(key);
    if (enforcerActionBannerStates.size === 0 && enforcerActionBannerInterval) {
        clearInterval(enforcerActionBannerInterval);
        enforcerActionBannerInterval = null;
    }

    const copy = enforcerClosedCopy(payload);
    const action = banner.querySelector('.extension-enforcer-action-btn');
    renderEnforcerActionCopy(banner, payload, {
        ...copy,
        countdown: '',
    });
    if (action) {
        if (copy.actionHtml) {
            action.innerHTML = copy.actionHtml;
        } else {
            action.textContent = copy.action;
        }
        action.onclick = () => openEnforcerFix(payload);
    }
    banner.classList.remove('hidden');
}

function hideEnforcerActionBanner(browser) {
    const key = browserKeyFromLabel(browser);
    const banner = document.getElementById(enforcerBannerId(key));
    if (banner) banner.classList.add('hidden');
    enforcerActionBannerStates.delete(key);
    if (enforcerActionBannerStates.size === 0 && enforcerActionBannerInterval) {
        clearInterval(enforcerActionBannerInterval);
        enforcerActionBannerInterval = null;
    }
}

// ---- App-blocking: force-quit warning (multi-app, native watcher) ---------

/** @type {Map<number, { name: string, totalSecs: number, remainingSecs: number, paused: boolean }>} */
const appBlockingWarningRows = new Map();
let appBlockingWarningUiAttached = false;
/** @type {ResizeObserver|null} */
let appBlockingWarningResizeObserver = null;

function teardownAppBlockingWarningResizeObserver() {
    appBlockingWarningResizeObserver?.disconnect();
    appBlockingWarningResizeObserver = null;
}

/** Keep the compact native window height in sync with the warning panel DOM. */
function ensureAppBlockingWarningResizeObserver() {
    if (isIOS || typeof ResizeObserver === 'undefined') return;
    const root = document.getElementById('app-blocking-warning-overlay');
    if (!root) return;
    appBlockingWarningResizeObserver?.disconnect();
    appBlockingWarningResizeObserver = new ResizeObserver(() => {
        scheduleBlockingWarningWindowFit();
    });
    appBlockingWarningResizeObserver.observe(root);
}

function scheduleBlockingWarningWindowFit() {
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            requestAnimationFrame(syncBlockingWarningWindowToContent);
        });
    });
}

/** Extra logical px so title bar / font metrics / borders do not clip the last buttons. */
const BLOCKING_WARNING_WINDOW_SIZE_BUFFER = 40;

async function syncBlockingWarningWindowToContent() {
    if (!document.documentElement.classList.contains('app-blocking-warning-window-mode')) return;
    if (isIOS) return;
    const overlay = document.getElementById('app-blocking-warning-overlay');
    if (!overlay || overlay.classList.contains('hidden')) return;
    // Pick whichever card is currently visible inside the overlay so the
    // measurement reflects the live content rather than a stale or
    // hidden panel. (We used to query a single hard-coded selector,
    // which broke after the force-quit panel got restructured.)
    const visibleCard = overlay.querySelector(
        '#app-blocking-warning-panel:not(.hidden), #scheduled-block-warning-card:not(.hidden)',
    );
    const ro = overlay.getBoundingClientRect();
    const rp = visibleCard?.getBoundingClientRect();
    const width = Math.ceil(
        Math.max(
            overlay.scrollWidth,
            visibleCard?.scrollWidth ?? 0,
            ro.width,
            rp?.width ?? 0,
        ) + 4,
    );
    const height = Math.ceil(
        Math.max(
            overlay.scrollHeight,
            visibleCard?.scrollHeight ?? 0,
            ro.height,
            rp?.height ?? 0,
        ) + BLOCKING_WARNING_WINDOW_SIZE_BUFFER,
    );
    try {
        await tauriAPI.resizeBlockingWarningInner(width, height);
    } catch {
        /* dev in browser — no IPC */
    }
}

function setupAppBlockingWarningOverlay() {
    if (isIOS || appBlockingWarningUiAttached) return;
    appBlockingWarningUiAttached = true;

    const onFail = (label) => (e) => {
        console.warn(`[app-blocking-ui] failed to attach ${label}:`, e);
        appBlockingWarningUiAttached = false;
    };

    tauriAPI.onAppBlockingWarningShow((event) => {
        const p = event?.payload || {};
        const pid = Number(p.pid);
        if (!Number.isFinite(pid)) return;
        const totalSecs = Math.max(1, Number(p.total_secs ?? p.totalSecs ?? 60));
        appBlockingWarningRows.set(pid, {
            name: p.name || 'App',
            totalSecs,
            remainingSecs: totalSecs,
            paused: false,
        });
        renderAppBlockingWarningOverlay();
    }).catch(onFail('warning-show'));

    tauriAPI.onAppBlockingWarningUpdate((event) => {
        const p = event?.payload || {};
        const pid = Number(p.pid);
        if (!Number.isFinite(pid)) return;
        const row = appBlockingWarningRows.get(pid);
        if (!row) return;
        row.remainingSecs = Math.max(0, Number(p.remaining_secs ?? p.remainingSecs ?? 0));
        row.totalSecs = Math.max(1, Number(p.total_secs ?? p.totalSecs ?? row.totalSecs));
        row.paused = Boolean(p.paused);
        renderAppBlockingWarningOverlay();
    }).catch(onFail('warning-update'));

    tauriAPI.onAppBlockingWarningHide((event) => {
        const p = event?.payload || {};
        const pid = Number(p.pid);
        if (!Number.isFinite(pid)) return;
        appBlockingWarningRows.delete(pid);
        renderAppBlockingWarningOverlay();
    }).catch(onFail('warning-hide'));
}

/** Find the user's blocklist that contains a given app name (case-insensitive).
 *  Used to surface the matching blocklist's name + emoji in the
 *  force-quit warning so the user knows which block is responsible. */
function findBlocklistForBlockedAppName(appName) {
    if (!appName) return null;
    const target = String(appName).trim().toLowerCase();
    if (!target) return null;
    const blocklists = appData?.blocklists || [];
    for (const bl of blocklists) {
        const apps = bl.apps || [];
        if (apps.some((a) => String(a).trim().toLowerCase() === target)) {
            return bl;
        }
    }
    return null;
}

function renderAppBlockingWarningOverlay() {
    const overlay = document.getElementById('app-blocking-warning-overlay');
    if (!overlay) return;

    const footerEl = document.getElementById('app-blocking-warning-footer');
    if (footerEl) {
        footerEl.classList.add('hidden');
        footerEl.innerHTML = '';
    }

    if (appBlockingWarningRows.size === 0) {
        applyWarningOverlayPresence();
        return;
    }

    // Multi-app warnings collapse to ONE shared ring (smallest remaining
    // across all rows). All rows are caught around the same time so the
    // spread is small in practice; honest urgency over per-app fidelity.
    let smallestRemaining = Infinity;
    let largestTotal = 0;
    let anyPaused = false;
    /** @type {string[]} */
    const names = [];
    for (const [, row] of appBlockingWarningRows) {
        if (row.remainingSecs < smallestRemaining) smallestRemaining = row.remainingSecs;
        if (row.totalSecs > largestTotal) largestTotal = row.totalSecs;
        if (row.paused) anyPaused = true;
        const n = (row.name || 'Unknown app').trim() || 'Unknown app';
        names.push(n);
    }
    if (!Number.isFinite(smallestRemaining)) smallestRemaining = 0;
    if (largestTotal <= 0) largestTotal = 60;

    // Pick the blocklist responsible for these warnings — for the common
    // single-app case this is unambiguous; for multi-app we fall back to
    // the first matching blocklist (multiple-blocklist conflicts are
    // rare and not worth the UI complexity).
    const responsibleBlocklist = names
        .map(findBlocklistForBlockedAppName)
        .find((bl) => bl) || null;
    const blocklistName = responsibleBlocklist?.name || 'this block';
    const blocklistEmoji = responsibleBlocklist?.emoji || '🎯';

    const countdownEl = document.getElementById('force-quit-warning-countdown');
    const ringEl = document.getElementById('force-quit-warning-ring-progress');
    const summaryEl = document.getElementById('force-quit-warning-summary');
    const blocklistNameEl = document.getElementById('force-quit-warning-blocklist-name');
    const emojiEl = document.getElementById('force-quit-warning-emoji');

    if (countdownEl) countdownEl.textContent = formatScheduledBlockCountdown(smallestRemaining);

    if (ringEl) {
        const elapsedFraction = Math.min(
            1,
            Math.max(0, 1 - smallestRemaining / largestTotal),
        );
        const elapsedPct = (elapsedFraction * 100).toFixed(2);
        ringEl.setAttribute('stroke-dasharray', `${elapsedPct} 100`);
    }

    if (blocklistNameEl) blocklistNameEl.textContent = blocklistName;
    if (emojiEl) emojiEl.textContent = blocklistEmoji;

    if (summaryEl) {
        const apps = joinAppListWithLimit(names, 3);
        const them = names.length === 1 ? 'it' : 'them';
        const seconds = Math.max(0, Math.ceil(smallestRemaining));
        const secondsPhrase = `<strong>${seconds}s</strong>`;
        const pausedNote = anyPaused
            ? ' Countdown paused while you\'re away — it resumes the moment you come back.'
            : '';
        summaryEl.innerHTML =
            `We're closing ${apps} for you in ${secondsPhrase}, because you have decided to block ${them}.${pausedNote}`;
    }

    applyWarningOverlayPresence();
}

// ---- Warning-overlay shared coordinator -----------------------------------
//
// The same `#app-blocking-warning-overlay` + `app-blocking-warning-window-mode`
// compact-window panel mode hosts both the native force-quit countdown
// (driven by `appBlockingWarningRows`) and the heads-up scheduled-block
// card (driven by `scheduledBlockWarningCurrent`). One coordinator
// reconciles their state into the DOM + native panel mode so we never
// end up with the overlay shown while every inner panel is hidden, or
// vice versa.
//
// The native app-blocking watcher already manages its own panel-mode
// layer in Rust (`blocking_warning_begin/end`). Here we maintain ONE
// extra refcount layer for the schedule warning, so panel mode stays on
// when only the schedule card is visible and turns off cleanly when
// both warning sources go quiet.
let scheduledBlockWarningPanelLayered = false;

function applyWarningOverlayPresence() {
    if (isIOS) return;
    const overlay = document.getElementById('app-blocking-warning-overlay');
    if (!overlay) return;
    const appPanel = document.getElementById('app-blocking-warning-panel');
    const schedCard = document.getElementById('scheduled-block-warning-card');

    const hasAppBlocking = appBlockingWarningRows.size > 0;
    const hasScheduled = scheduledBlockWarningCurrent !== null;
    const anyVisible = hasAppBlocking || hasScheduled;

    overlay.classList.toggle('hidden', !anyVisible);
    appPanel?.classList.toggle('hidden', !hasAppBlocking);
    schedCard?.classList.toggle('hidden', !hasScheduled);

    document.documentElement.classList.toggle('app-blocking-warning-window-mode', anyVisible);
    document.body.classList.toggle('app-blocking-warning-window-mode', anyVisible);

    if (hasScheduled && !scheduledBlockWarningPanelLayered) {
        scheduledBlockWarningPanelLayered = true;
        tauriAPI.enterBlockingWarningPanelMode().catch((e) => {
            // Don't leave a phantom layer if the IPC failed.
            scheduledBlockWarningPanelLayered = false;
            console.warn('[scheduled-warning] enter panel mode:', e);
        });
    } else if (!hasScheduled && scheduledBlockWarningPanelLayered) {
        scheduledBlockWarningPanelLayered = false;
        tauriAPI.leaveBlockingWarningPanelMode().catch((e) => {
            console.warn('[scheduled-warning] leave panel mode:', e);
        });
    }

    if (anyVisible) {
        ensureAppBlockingWarningResizeObserver();
        scheduleBlockingWarningWindowFit();
    } else {
        teardownAppBlockingWarningResizeObserver();
    }
}

// ---- Scheduled-block heads-up warning -------------------------------------
//
// Two minutes before a scheduled block starts, surface the same compact
// always-on-top panel the force-quit watcher uses, with a friendly
// "starts in 1:23" countdown and a "Got it!" dismiss. Lets the user wrap
// up what they're doing — e.g. close form-data-heavy browser tabs — and
// guarantees they see the heads-up even from a fullscreen Space.

const SCHEDULED_BLOCK_WARNING_LEAD_MS = 2 * 60 * 1000;
// Below this remaining-time threshold the card switches to the
// "ALMOST TIME / Save anything you need" amber state with a single
// full-width CTA. Above it the card stays in the calmer "HEADS UP"
// initial state.
const SCHEDULED_BLOCK_WARNING_FINAL_MS = 15 * 1000;

/** @type {{ occurrenceKey: string, startMs: number, schedule: any, blocklist: any } | null} */
let scheduledBlockWarningCurrent = null;
/** Occurrence keys the user has dismissed via "Got it!". Pruned as starts pass. */
const scheduledBlockWarningDismissed = new Set();

/** Earliest upcoming start time (ms) for this schedule, or null. */
function computeNextScheduledBlockStartMs(schedule, nowMs) {
    if (!schedule || !schedule.segments || schedule.segments.length === 0) return null;
    if (isSchedulePausedNow(schedule, nowMs)) return null;

    if (isNonRepeatingSchedule(schedule)) {
        let best = null;
        for (const occ of resolveOneShotOccurrences(schedule)) {
            const startMs = occ.start.getTime();
            if (startMs <= nowMs) continue;
            if (best === null || startMs < best) best = startMs;
        }
        return best;
    }

    // Repeating schedules: scan the next 8 days for the earliest segment
    // start that hasn't already passed.
    const now = new Date(nowMs);
    const currentDow = now.getDay() === 0 ? 6 : now.getDay() - 1; // Mon=0
    let best = null;
    for (let dayOffset = 0; dayOffset < 8; dayOffset++) {
        const dow = (currentDow + dayOffset) % 7;
        for (const seg of schedule.segments) {
            if (!seg.days || !seg.days.includes(dow)) continue;
            const segStart = new Date(now);
            segStart.setDate(now.getDate() + dayOffset);
            segStart.setHours(seg.startHour, seg.startMinute, 0, 0);
            const startMs = segStart.getTime();
            if (startMs <= nowMs) continue;
            if (best === null || startMs < best) best = startMs;
        }
    }
    return best;
}

/** Format remaining seconds as "M:SS" (or "0:SS" when under 60s). */
function formatScheduledBlockCountdown(secondsRemaining) {
    const s = Math.max(0, Math.ceil(secondsRemaining));
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${m}:${String(r).padStart(2, '0')}`;
}

/** Pretty list join: "A", "A and B", "A, B and C", "A, B and 4 more". */
function joinAppListWithLimit(names, max = 3, { bold = true } = {}) {
    const arr = names.filter(Boolean);
    const wrap = bold
        ? (n) => `<strong>${escapeHtml(n)}</strong>`
        : (n) => escapeHtml(n);
    if (arr.length === 0) return '';
    if (arr.length === 1) return wrap(arr[0]);
    if (arr.length <= max) {
        const head = arr.slice(0, -1).map(wrap).join(', ');
        const tail = wrap(arr[arr.length - 1]);
        return `${head} and ${tail}`;
    }
    const shown = arr.slice(0, max - 1).map(wrap).join(', ');
    const remaining = arr.length - (max - 1);
    return `${shown} and ${wrap(`${remaining} more`)}`;
}

/** Initial-state body text. Apps are listed, website count summarised,
 *  and the closing-handoff sentence ("we'll close them for you") only
 *  appears when there's at least one app to close. */
function formatScheduledBlockSummaryInitial(blocklist) {
    if (!blocklist) return '';
    const apps = blocklist.apps || [];
    const websiteCount = (blocklist.websites || []).length;
    const websitePhrase = websiteCount === 1 ? '1 website' : `${websiteCount} websites`;

    const sentences = [];
    if (apps.length > 0 && websiteCount > 0) {
        sentences.push(
            `${joinAppListWithLimit(apps)} will be closed and `
            + `<strong>${websitePhrase}</strong> will be blocked.`,
        );
    } else if (apps.length > 0) {
        sentences.push(`${joinAppListWithLimit(apps)} will be closed.`);
    } else if (websiteCount > 0) {
        sentences.push(`<strong>${websitePhrase}</strong> will be blocked.`);
    } else {
        return '';
    }

    sentences.push('If you are using any of these now, save anything you need.');
    if (apps.length > 0) {
        sentences.push("We'll close the apps down for you when the countdown ends.");
    }
    return sentences.join(' ');
}

/** Final-state body text: "Closing <apps> in N seconds. Save anything you want to keep right now." */
function formatScheduledBlockSummaryFinal(blocklist, secondsLeft) {
    if (!blocklist) return '';
    const apps = blocklist.apps || [];
    const websiteCount = (blocklist.websites || []).length;
    const seconds = Math.max(0, Math.ceil(secondsLeft));
    const secondsPhrase = `in <strong>${seconds} ${seconds === 1 ? 'second' : 'seconds'}</strong>`;

    if (apps.length > 0 && websiteCount > 0) {
        return `Closing ${joinAppListWithLimit(apps)} ${secondsPhrase}, plus `
            + `<strong>${websiteCount} ${websiteCount === 1 ? 'website' : 'websites'}</strong>. `
            + 'Save anything you want to keep right now.';
    }
    if (apps.length > 0) {
        return `Closing ${joinAppListWithLimit(apps)} ${secondsPhrase}. `
            + 'Save anything you want to keep right now.';
    }
    if (websiteCount > 0) {
        return `Blocking <strong>${websiteCount} ${websiteCount === 1 ? 'website' : 'websites'}</strong> ${secondsPhrase}.`;
    }
    return '';
}

/** Populate the static (non-countdown) parts of the schedule card for a
 *  freshly-shown occurrence. Resets any leftover `.final` class from a
 *  previous occurrence and re-applies the initial-state copy/emoji/CTA.
 *  Final-state copy is then applied live in
 *  `updateScheduledBlockWarningCountdown` once the 15s threshold is crossed. */
function populateScheduledBlockWarningCard(state) {
    const cardEl = document.getElementById('scheduled-block-warning-card');
    cardEl?.classList.remove('final');
    restoreScheduledBlockInitialState(state);
}

/** Render the eyebrow / top line.
 *  Initial: "HEADS UP · <Blocklist> starts soon"
 *  Final:   "ALMOST TIME · <Blocklist> starts now" */
function renderScheduledBlockEyebrow(state, isFinal) {
    const labelEl = document.querySelector('.scheduled-block-warning-eyebrow-label');
    const detailEl = document.querySelector('.scheduled-block-warning-eyebrow-detail');
    const nameEl = document.getElementById('scheduled-block-warning-blocklist-name');
    const blocklistName = state.blocklist?.name || 'Block';
    if (labelEl) labelEl.textContent = isFinal ? 'ALMOST TIME' : 'HEADS UP';
    if (nameEl) nameEl.textContent = blocklistName;
    if (detailEl) {
        // Re-render so the trailing word matches the urgency level. Keep
        // the <strong> wrap on the name so its weight is consistent.
        detailEl.innerHTML = `<strong id="scheduled-block-warning-blocklist-name">${escapeHtml(blocklistName)}</strong> ${
            isFinal ? 'starts now' : 'starts soon'
        }`;
    }
}

/** Push the live final-state copy + button label. Cheap; called every
 *  tick once the 15s threshold is crossed so the seconds count in the
 *  body text stays accurate. */
function applyScheduledBlockFinalState(state, secondsLeft) {
    const emojiEl = document.getElementById('scheduled-block-warning-emoji');
    const summaryEl = document.getElementById('scheduled-block-warning-summary');

    renderScheduledBlockEyebrow(state, /* isFinal */ true);
    // Swap blocklist emoji for a warning glyph so the iconography
    // reinforces the urgency shift.
    if (emojiEl) emojiEl.textContent = '⚠️';
    if (summaryEl) {
        summaryEl.innerHTML = formatScheduledBlockSummaryFinal(state.blocklist, secondsLeft);
    }
}

/** Restore initial-state copy/emoji. Idempotent. */
function restoreScheduledBlockInitialState(state) {
    const emojiEl = document.getElementById('scheduled-block-warning-emoji');
    const summaryEl = document.getElementById('scheduled-block-warning-summary');

    renderScheduledBlockEyebrow(state, /* isFinal */ false);
    if (emojiEl) emojiEl.textContent = state.blocklist.emoji || '🎯';
    if (summaryEl) summaryEl.innerHTML = formatScheduledBlockSummaryInitial(state.blocklist);
}

/**
 * Update the countdown text + the SVG progress ring + final-state class.
 *
 * The ring uses `stroke-dasharray="<elapsed%> 100"` on a circle whose
 * circumference is exactly 100 (r ≈ 15.91549431) — so the dash length
 * maps directly to the percentage of the 2-minute window that has
 * elapsed. The arc grows clockwise as the deadline approaches.
 *
 * Below the 15s threshold we toggle `.final` on the card root, which
 * swaps the entire colour palette to amber (CSS variables), and we
 * push live copy/emoji/button updates so the body text reflects the
 * current seconds count.
 */
function updateScheduledBlockWarningCountdown(nowMs) {
    if (!scheduledBlockWarningCurrent) return;
    const countdownEl = document.getElementById('scheduled-block-warning-countdown');
    const ringEl = document.getElementById('scheduled-block-warning-ring-progress');
    const cardEl = document.getElementById('scheduled-block-warning-card');
    if (!countdownEl) return;

    const remainingMs = Math.max(0, scheduledBlockWarningCurrent.startMs - nowMs);
    countdownEl.textContent = formatScheduledBlockCountdown(remainingMs / 1000);

    const elapsedFraction = Math.min(
        1,
        Math.max(0, 1 - remainingMs / SCHEDULED_BLOCK_WARNING_LEAD_MS),
    );
    if (ringEl) {
        const elapsedPct = (elapsedFraction * 100).toFixed(2);
        ringEl.setAttribute('stroke-dasharray', `${elapsedPct} 100`);
    }

    const isFinal = remainingMs > 0 && remainingMs <= SCHEDULED_BLOCK_WARNING_FINAL_MS;
    const wasFinal = cardEl?.classList.contains('final');
    if (isFinal) {
        cardEl?.classList.add('final');
        applyScheduledBlockFinalState(scheduledBlockWarningCurrent, remainingMs / 1000);
    } else if (wasFinal) {
        // Should not normally happen (countdown is monotonic), but
        // restore cleanly if state is forced backwards (e.g. clock change).
        cardEl?.classList.remove('final');
        restoreScheduledBlockInitialState(scheduledBlockWarningCurrent);
    }
}

/** Called from the 1-second app-wide tick. Idempotent and cheap. */
function tickScheduledBlockWarning(nowMs) {
    if (isIOS) return;

    // Forget dismissals whose occurrence has already passed.
    if (scheduledBlockWarningDismissed.size > 0) {
        for (const key of [...scheduledBlockWarningDismissed]) {
            const startStr = key.split('@')[1];
            const startMs = Number(startStr);
            if (Number.isFinite(startMs) && startMs <= nowMs) {
                scheduledBlockWarningDismissed.delete(key);
            }
        }
    }

    // App-blocking force-quit warnings outrank schedule heads-ups —
    // a force-close happening NOW is more urgent than a block starting
    // soon, so we suppress the schedule card while any are active.
    if (appBlockingWarningRows.size > 0) {
        if (scheduledBlockWarningCurrent) {
            scheduledBlockWarningCurrent = null;
            applyWarningOverlayPresence();
        }
        return;
    }

    // Find the soonest upcoming scheduled block (across all schedules).
    let next = null;
    const nowDate = new Date(nowMs);
    for (const schedule of (appData.schedules || [])) {
        if (!scheduleCanStillBecomeActive(schedule, nowDate)) continue;
        if (isScheduleSegmentActiveNow(schedule, nowDate)) continue;
        const startMs = computeNextScheduledBlockStartMs(schedule, nowMs);
        if (startMs === null) continue;
        if (next === null || startMs < next.startMs) {
            const blocklist = appData.blocklists.find((bl) => bl.id === schedule.blocklistId);
            if (!blocklist) continue;
            next = { startMs, schedule, blocklist };
        }
    }

    const occurrenceKey = next ? `${next.schedule.id}@${next.startMs}` : null;
    const withinLead = next && next.startMs - nowMs <= SCHEDULED_BLOCK_WARNING_LEAD_MS;
    const dismissed = occurrenceKey && scheduledBlockWarningDismissed.has(occurrenceKey);
    const shouldShow = withinLead && !dismissed;

    if (shouldShow) {
        const isNewOccurrence =
            !scheduledBlockWarningCurrent
            || scheduledBlockWarningCurrent.occurrenceKey !== occurrenceKey;
        scheduledBlockWarningCurrent = { occurrenceKey, ...next };
        if (isNewOccurrence) {
            populateScheduledBlockWarningCard(scheduledBlockWarningCurrent);
            applyWarningOverlayPresence();
        }
        updateScheduledBlockWarningCountdown(nowMs);
    } else if (scheduledBlockWarningCurrent) {
        scheduledBlockWarningCurrent = null;
        applyWarningOverlayPresence();
    }
}

/** Wire up the dismiss button. Idempotent. */
let scheduledBlockWarningWired = false;
function setupScheduledBlockWarningCard() {
    if (scheduledBlockWarningWired) return;
    const dismissBtn = document.getElementById('scheduled-block-warning-dismiss-btn');
    if (!dismissBtn) return;
    scheduledBlockWarningWired = true;

    dismissBtn.addEventListener('click', () => {
        if (scheduledBlockWarningCurrent) {
            scheduledBlockWarningDismissed.add(scheduledBlockWarningCurrent.occurrenceKey);
            scheduledBlockWarningCurrent = null;
            applyWarningOverlayPresence();
        }
    });
}

// Check if the helper daemon is available (desktop only)
async function checkHelperStatus() {
    if (isIOS) return; // iOS uses Screen Time, not helper daemon
    const status = await refreshDesktopHelperStatus();
    console.log('Helper status:', status);

    if (status.running && !status.version_ok) {
        console.log('Helper is outdated (version:', status.version, ') - will prompt to update on first block');
    } else if (!status.installed) {
        console.log('Helper not installed - will prompt on first block');
    }

}


/// True if a failed install-helper result looks like the user cancelled the UAC / admin prompt
/// rather than an actual failure. Backend returns messages prefixed with "cancelled:" for this.
function isHelperInstallCancelled(errorMsg) {
    if (!errorMsg || typeof errorMsg !== 'string') return false;
    return errorMsg.startsWith('cancelled:') || errorMsg.toLowerCase().includes('cancelled');
}

/** True if the error indicates the helper daemon is not reachable (e.g. connection refused on Windows). */
function isHelperConnectionError(errorMsg) {
    if (!errorMsg || typeof errorMsg !== 'string') return false;
    return errorMsg.includes('Failed to connect to helper') || errorMsg.includes('refused') || errorMsg.includes('10061');
}

// Check Screen Time authorization (iOS only)
async function checkScreentimeAuth() {
    try {
        const result = await tauriAPI.screentimeCheckAuth();
        screentimeAuthorized = result.granted;
        console.log('Screen Time auth status:', result.status);
        if (!screentimeAuthorized) {
            console.log('Screen Time not authorized - will prompt on first block');
        }
    } catch (err) {
        console.error('Error checking Screen Time auth:', err);
        screentimeAuthorized = false;
    }
    updateOnboardingVisibility();
}

// Request Screen Time authorization (iOS only)
async function requestScreentimeAuth() {
    try {
        const result = await tauriAPI.screentimeRequestAuth();
        screentimeAuthorized = result.granted;
        console.log('Screen Time auth result:', result);
        return result;
    } catch (err) {
        console.error('Error requesting Screen Time auth:', err);
        screentimeAuthorized = false;
        return { granted: false, status: 'error', error: err.toString() };
    }
}

async function initializeIOSBlockingState() {
    // Sync lastBlockedDomains from active (non-paused) blocks so pause/resume works after restart
    const now = Date.now();
    const activeDomains = new Set();
    appData.activeBlocks
        .filter(b => b.startTime <= now && b.endTime > now && !b.isPaused)
        .forEach(b => {
            const bl = appData.blocklists.find(bl => bl.id === b.blocklistId);
            if (bl && bl.websites) bl.websites.forEach(d => activeDomains.add(d));
        });
    lastBlockedDomains = activeDomains;
    // Re-register DeviceActivity schedules so background activation survives app restarts.
    await syncSchedulesToHelper();
}

function updateOnboardingVisibility() {
    const eulaOverlay = document.getElementById('eula-onboarding');
    const screentimeOverlay = document.getElementById('ios-screentime-onboarding');
    const main = document.getElementById('main-content');
    const showEula = !hasAcceptedEula();
    const showScreentime = isIOS && !showEula && !screentimeAuthorized;

    eulaOverlay?.classList.toggle('hidden', !showEula);
    screentimeOverlay?.classList.toggle('hidden', !showScreentime);
    main?.classList.toggle('hidden', showEula || showScreentime);
}

async function acceptEula() {
    if (!appData.settings) {
        appData.settings = {};
    }
    const alreadyAccepted = getAcceptedEulaRevision() === CURRENT_EULA_REVISION;
    forceShowEulaThisSession = false;
    if (!alreadyAccepted) {
        appData.settings.eulaAcceptedRevision = CURRENT_EULA_REVISION;
        appData.settings.eulaAcceptedAt = Date.now();
        await saveData();
    }
    if (isIOS) {
        await checkScreentimeAuth();
    } else {
        updateOnboardingVisibility();
    }
    await runPostAcceptanceStartup();
}

async function openExternal(target) {
    try {
        await openUrl(target);
    } catch {
        window.open(target, '_blank', 'noopener,noreferrer');
    }
}

// Load data from main process
async function loadData() {
    appData = await tauriAPI.loadData();
    let shouldSave = false;
    if (!appData || !appData.blocklists) {
        appData = {
            blocklists: [],
            activeBlocks: [],
            schedules: [],
            settings: {}
        };
    }
    // Ensure schedules array exists for older data
    if (!appData.schedules) {
        appData.schedules = [];
    }
    // Ensure settings exists
    if (!appData.settings) {
        appData.settings = {};
    }
    if (normalizeLoadedEulaState()) {
        shouldSave = true;
    }
    appData.blocklists = (appData.blocklists || []).map(normalizeBlocklist);
    // Create default blocklist on first launch (no blocklists yet)
    if (appData.blocklists.length === 0) {
        appData.blocklists.push({
            id: generateId(),
            name: 'Distractions',
            mode: 'blocklist',
            // First colour in the palette (matches the openBlocklistModal default).
            color: '#B8D1DE',
            emoji: '🚫',
            websites: ['instagram.com', 'youtube.com', 'reddit.com'],
            apps: [],
            iosScreenTimeSelection: null,
            overrideDifficulty: {
                type: 'random-words',
                count: 50
            }
        });
        // Mark onboarding as complete for backwards compat
        appData.settings.onboardingComplete = true;
        shouldSave = true;
    }

    if (shouldSave) {
        await saveData();
    }
}

// Save data to main process
async function saveData() {
    await tauriAPI.saveData(appData);
}

/// Run expiry once (e.g. on app load) so in-memory state matches Screen Time / helper.
/// Clears expired blocks and pause state, then syncs to plugin/helper.
async function runExpiryOnce() {
    const now = Date.now();
    let changed = false;

    // Clear expired pause on blocks
    for (const block of appData.activeBlocks) {
        if (block.isPaused && block.pauseEndTime && block.pauseEndTime <= now) {
            delete block.isPaused;
            delete block.pauseEndTime;
            changed = true;
        }
    }
    // Clear expired pause on schedules
    if (appData.schedules) {
        for (const schedule of appData.schedules) {
            if (schedule.isPaused && schedule.pauseEndTime && schedule.pauseEndTime <= now) {
                delete schedule.isPaused;
                delete schedule.pauseEndTime;
                changed = true;
            }
        }
    }
    // Remove expired blocks
    const prevCount = appData.activeBlocks.length;
    appData.activeBlocks = appData.activeBlocks.filter(b => b.endTime > now);
    if (appData.activeBlocks.length !== prevCount) changed = true;

    // Remove expired schedules (date-limited or non-repeating past end)
    if (appData.schedules && appData.schedules.length > 0) {
        const nowDate = new Date(now);
        const expiredIds = [];
        for (const schedule of appData.schedules) {
            if (schedule.repeatType === 'forever') continue;
            if (schedule.repeatType === 'date' && schedule.repeatDate) {
                const endDate = new Date(schedule.repeatDate);
                endDate.setHours(23, 59, 59, 999);
                if (nowDate > endDate) expiredIds.push(schedule.id);
                continue;
            }
            if (!scheduleHasFutureSingleOccurrence(schedule, nowDate)) {
                expiredIds.push(schedule.id);
            }
        }
        if (expiredIds.length > 0) {
            appData.schedules = appData.schedules.filter(s => !expiredIds.includes(s.id));
            changed = true;
        }
    }

    if (!changed) return;
    await saveData();
    await updateHostsFile();
    await syncSchedulesToHelper();
    await updateBlockedApps();
}

// Compare semver versions - returns true if versionA > versionB
function isVersionHigher(versionA, versionB) {
    const partsA = versionA.split('.').map(Number);
    const partsB = versionB.split('.').map(Number);

    for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
        const a = partsA[i] || 0;
        const b = partsB[i] || 0;
        if (a > b) return true;
        if (a < b) return false;
    }
    return false; // Equal versions
}

// Detect platform for window controls and iOS
function detectPlatform() {
    // Check for iOS (Tauri iOS uses a WKWebView with standard iOS user agent)
    const isIOSDevice = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
        (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

    if (isIOSDevice) {
        isIOS = true;
        document.body.classList.add('ios');
        // iPhone / iPod (anything not iPad): used for layout (e.g. hide week calendar)
        const isIPad = /iPad/.test(navigator.userAgent) ||
            (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
        if (!isIPad) {
            document.body.classList.add('ios-phone');
        }
        // Hide desktop-only UI on iOS
        document.getElementById('window-controls')?.classList.add('hidden');
        document.querySelector('.title-bar')?.classList.add('hidden');
        // Hide helper-related settings section on iOS
        document.getElementById('helper-settings-section')?.classList.add('hidden');

        // On iOS, app blocking uses Screen Time tokens (not app names).
        // Hide the text input for apps and show only the picker button.
        const appInput = document.getElementById('app-input');
        if (appInput) appInput.style.display = 'none';
        const modalAppInput = document.getElementById('modal-app-input');
        if (modalAppInput) modalAppInput.style.display = 'none';



        // Update hint/tooltip for modal — find via modal-app-input's parent
        const modalAppGroup = document.querySelector('#modal-app-input')?.closest('.form-group');
        if (modalAppGroup) {
            const modalTooltip = modalAppGroup.querySelector('.info-tooltip');
            if (modalTooltip) modalTooltip.textContent = 'On iOS, apps are selected using Apple\'s Screen Time picker. Tap the button to choose which apps to block.';
        }

        // Make the browse buttons more prominent (full-width) since they're the only option
        document.querySelectorAll('.browse-btn').forEach(btn => {
            btn.style.width = '100%';
            btn.style.justifyContent = 'center';
            btn.style.padding = '10px';
            btn.title = 'Select Apps (Screen Time)';
            // Add text label next to the icon
            if (!btn.querySelector('.browse-label')) {
                const label = document.createElement('span');
                label.className = 'browse-label';
                label.textContent = ' Select Apps';
                label.style.marginLeft = '6px';
                label.style.fontSize = '13px';
                btn.appendChild(label);
            }
        });
    } else {
        const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
        if (isMac) {
            document.body.classList.add('mac');
            // Hide controls on macOS - native traffic lights are used
            document.getElementById('window-controls')?.classList.add('hidden');
        } else {
            document.body.classList.add('windows');
            // Show controls on Windows
            document.getElementById('window-controls')?.classList.remove('hidden');
        }
    }
}

// Update window height to fit content
function updateWindowHeight() {
    // Use requestAnimationFrame to ensure layout is complete
    requestAnimationFrame(() => {
        const appContainer = document.querySelector('.app-container');
        if (appContainer) {
            // Get the actual height needed for the content
            const contentHeight = appContainer.scrollHeight;
            // Add a small buffer for window chrome/borders
            const targetHeight = Math.max(contentHeight + 20, 500);
            // Window height adjustment handled by Tauri
            // tauriAPI.setWindowHeight(targetHeight);
        }
    });
}

// Update maximize button icon based on window state
async function updateMaximizeButton() {
    const maximizeBtn = document.getElementById('titlebar-maximize');
    const maximizeIcon = document.getElementById('maximize-icon');
    const restoreIcon = document.getElementById('restore-icon');

    if (!maximizeBtn || !maximizeIcon || !restoreIcon) return;

    const win = getCurrentWindow();
    const isMaximized = await win.isMaximized();

    if (isMaximized) {
        maximizeIcon.style.display = 'none';
        restoreIcon.style.display = 'block';
        maximizeBtn.title = 'Restore';
    } else {
        maximizeIcon.style.display = 'block';
        restoreIcon.style.display = 'none';
        maximizeBtn.title = 'Maximize';
    }
}

// Setup event listeners
function setupEventListeners() {
    // When the user comes back to ReDD Block after visiting System
    // Settings or the browser extension store, re-run the onboarding
    // state check so the compliance banner clears once the user has
    // installed the extension.
    window.addEventListener('focus', () => {
        if (!isIOS && startupInitializationComplete) {
            runDesktopOnboarding().catch(() => {});
        }
    });

    // Window controls (using Tauri docs naming)
    document.getElementById('titlebar-minimize')?.addEventListener('click', () => {
        tauriAPI.minimizeWindow();
    });

    document.getElementById('titlebar-maximize')?.addEventListener('click', async () => {
        await tauriAPI.maximizeWindow();
        // Update icon after state changes
        setTimeout(updateMaximizeButton, 100);
    });

    document.getElementById('titlebar-close')?.addEventListener('click', () => {
        tauriAPI.closeWindow();
    });

    const eulaCheckbox = document.getElementById('eula-agree-checkbox');
    const eulaContinueBtn = document.getElementById('eula-continue-btn');
    if (eulaCheckbox && eulaContinueBtn) {
        eulaContinueBtn.disabled = !eulaCheckbox.checked;
    }
    eulaCheckbox?.addEventListener('change', () => {
        if (eulaContinueBtn) {
            eulaContinueBtn.disabled = !eulaCheckbox.checked;
        }
    });
    eulaContinueBtn?.addEventListener('click', async () => {
        if (!eulaCheckbox?.checked || !eulaContinueBtn) return;
        const originalText = eulaContinueBtn.textContent;
        eulaContinueBtn.disabled = true;
        eulaContinueBtn.textContent = 'Continuing...';
        try {
            await acceptEula();
        } catch (err) {
            console.error('Failed to accept EULA:', err);
            alert('Could not save your agreement. Please try again.');
            eulaContinueBtn.disabled = !eulaCheckbox.checked;
            eulaContinueBtn.textContent = originalText;
            return;
        }
        eulaContinueBtn.textContent = originalText;
    });

    document.querySelectorAll('#eula-onboarding a[data-external-url]').forEach((link) => {
        link.addEventListener(
            'click',
            (event) => {
                const url = link.dataset.externalUrl;
                if (!url) return;
                event.preventDefault();
                event.stopImmediatePropagation();
                openUrl(url).catch((err) => {
                    console.warn('[eula] open in browser failed:', err);
                    window.open(url, '_blank', 'noopener,noreferrer');
                });
            },
            true
        );
    });

    document.querySelectorAll('#eula-onboarding [data-toggle-target]').forEach((el) => {
        el.addEventListener('click', (event) => {
            if (event.target.closest('a')) return;
            const target = document.getElementById(el.dataset.toggleTarget);
            if (!target) return;
            target.checked = !target.checked;
            target.dispatchEvent(new Event('change', { bubbles: true }));
        });
    });

    document.getElementById('ios-screentime-grant-btn')?.addEventListener('click', async () => {
        const btn = document.getElementById('ios-screentime-grant-btn');
        const note = document.getElementById('ios-screentime-onboarding-note');
        if (!btn) return;

        const originalText = btn.textContent;
        btn.disabled = true;
        btn.textContent = 'Requesting access...';

        const result = await requestScreentimeAuth();

        if (result.granted) {
            updateOnboardingVisibility();
            try {
                await initializeIOSBlockingState();
                render();
            } catch (err) {
                console.error('Error initializing iOS blocking state after auth:', err);
            }
        } else if (note) {
            if (result.status === 'denied') {
                note.textContent = 'Screen Time access was denied. Please tap the button again, or enable ReDD Block in Settings > Screen Time > Apps With Screen Time Access.';
            } else if (result.error) {
                note.textContent = `Screen Time access failed: ${result.error}`;
            }
        }
        updateOnboardingVisibility();

        btn.disabled = false;
        btn.textContent = originalText;
    });

    // Initial check for maximize state
    updateMaximizeButton();

    // Check periodically to catch state changes (double-click title bar, etc.)
    // This ensures the icon updates even if window is maximized/restored via other means
    setInterval(updateMaximizeButton, 300);

    // Time pickers - custom popover handlers
    document.querySelectorAll('.time-part').forEach(btn => {
        btn.addEventListener('click', handleTimePartClick);
    });

    // Close popovers on outside click
    document.addEventListener('click', handlePopoverOutsideClick);

    // Click on background to deselect blocklists
    document.addEventListener('click', (e) => {
        // Don't deselect if clicking on interactive elements
        if (e.target.closest('.blocklist-card') ||
            e.target.closest('.scheduler-section') ||
            e.target.closest('.modal-overlay') ||
            e.target.closest('.section-header') ||
            e.target.closest('.footer') ||
            e.target.closest('.title-bar') ||
            e.target.closest('.week-calendar-section') ||
            e.target.closest('.time-popover') ||
            e.target.closest('.time-part')) {
            return;
        }

        // Deselect blocklist if one is selected
        if (selectedBlocklistId) {
            deselectBlocklist();
        }
    });

    // Close blocklist card menus when clicking outside
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.blocklist-menu-wrapper')) {
            closeAllBlocklistMenus();
        }
    });

    // ESC: close blocklist add/edit modal if open, otherwise deselect blocklist
    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        const blocklistModal = document.getElementById('blocklist-modal');
        if (blocklistModal && !blocklistModal.classList.contains('hidden')) {
            closeBlocklistModal();
            e.preventDefault();
            return;
        }
        if (selectedBlocklistId) {
            deselectBlocklist();
            e.preventDefault();
        }
    });

    // Ctrl+Z / Cmd+Z: undo in blocklist add/edit modal (session-scoped).
    // Use capture phase so we run before the input's native undo (which would undo character-by-character).
    // Rule: clear pending (unsaved) text in website/app fields before undoing stack actions. Prefer clearing
    // the focused field first, then clear any other field that still has pending text, then pop stack.
    document.addEventListener('keydown', (e) => {
        const blocklistModal = document.getElementById('blocklist-modal');
        if (!blocklistModal || blocklistModal.classList.contains('hidden')) return;
        const isUndo = (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey;
        if (!isUndo) return;

        const websiteInput = document.getElementById('modal-website-input');
        const appInput = document.getElementById('modal-app-input');
        const target = e.target;
        const websiteHasPending = websiteInput && websiteInput.value.trim().length > 0;
        const appHasPending = appInput && appInput.value.trim().length > 0;

        // 1) Clear the focused field if it has pending text (so one Ctrl+Z clears where you're typing)
        if ((target === websiteInput || document.activeElement === websiteInput) && websiteHasPending) {
            websiteInput.value = '';
            e.preventDefault();
            e.stopPropagation();
            return;
        }
        if ((target === appInput || document.activeElement === appInput) && appHasPending) {
            appInput.value = '';
            e.preventDefault();
            e.stopPropagation();
            return;
        }

        // 2) If any field still has pending text, clear it before we touch the stack (so we don't undo
        //    a tag add/remove while leaving unsaved text in the other field)
        if (websiteHasPending) {
            websiteInput.value = '';
            e.preventDefault();
            e.stopPropagation();
            return;
        }
        if (appHasPending) {
            appInput.value = '';
            e.preventDefault();
            e.stopPropagation();
            return;
        }

        // 3) Both fields empty of pending text — pop stack
        if (blocklistModalUndoStack.length > 0) {
            blocklistModalApplyingUndo = true;
            const entry = blocklistModalUndoStack.pop();
            try {
                entry.undo();
            } finally {
                blocklistModalApplyingUndo = false;
            }
            e.preventDefault();
        }
    }, true);

    // Duration picker - input change
    const durationInput = document.getElementById('duration-minutes-input');
    if (durationInput) {
        durationInput.addEventListener('input', (e) => {
            // Enforce max 5 digits visually
            if (durationInput.value.length > 5) {
                durationInput.value = durationInput.value.slice(0, 5);
            }
            handleDurationInputChange();
        });
        durationInput.addEventListener('blur', () => {
            let mins = parseInt(durationInput.value);
            if (isNaN(mins) || mins < 1) mins = 60;
            if (mins > 99999) mins = 99999;
            durationInput.value = mins;
            handleDurationInputChange();
        });
    }

    // Quick-select buttons: timed durations (15/30/45/60) + "Always" option
    document.querySelectorAll('.duration-quick-btn').forEach(btn => {
        btn.addEventListener('click', handleDurationQuickBtn);
    });

    // Initialize time picker with defaults
    initializeTimeInputs();

    // Blocklist selector
    document.getElementById('blocklist-select').addEventListener('change', handleBlocklistSelect);

    // Start block button
    document.getElementById('start-block-btn').addEventListener('click', startBlock);

    // Add blocklist button
    document.getElementById('add-blocklist-btn').addEventListener('click', () => openBlocklistModal());

    // Onboarding
    // Onboarding removed — default blocklist created in loadData()

    // Modal listeners
    setupModalListeners();

    // Override modal
    setupOverrideModalListeners();

    // Undo toast button
    document.getElementById('undo-toast-btn')?.addEventListener('click', undoDelete);

    // Start block confirmation modal buttons
    document.getElementById('cancel-start-confirm-btn')?.addEventListener('click', closeStartBlockConfirmModal);
    document.getElementById('proceed-start-confirm-btn')?.addEventListener('click', proceedWithBlock);

    // Schedule confirmation modal buttons
    document.getElementById('cancel-schedule-confirm-btn')?.addEventListener('click', closeScheduleConfirmModal);
    document.getElementById('proceed-schedule-confirm-btn')?.addEventListener('click', proceedWithSchedule);

    // Schedule mode tabs
    document.getElementById('instant-mode-tab')?.addEventListener('click', () => setScheduleMode(false));
    document.getElementById('schedule-mode-tab')?.addEventListener('click', () => setScheduleMode(true));

    // Add segment button
    document.getElementById('add-segment-btn')?.addEventListener('click', addScheduleSegment);

    // Start schedule button
    document.getElementById('start-schedule-btn')?.addEventListener('click', startSchedule);

    // Repeat dropdown (renamed from Until)
    document.getElementById('repeat-dropdown-btn')?.addEventListener('click', toggleRepeatDropdown);
    document.querySelectorAll('.repeat-option').forEach(opt => {
        opt.addEventListener('click', handleRepeatOptionClick);
    });
    document.getElementById('repeat-date-input')?.addEventListener('change', handleRepeatDateChange);

    // Initialize first segment day toggles
    document.querySelectorAll('.segment-day-toggle').forEach(btn => {
        btn.addEventListener('click', () => {
            const segmentIndex = parseInt(btn.closest('.segment-days').dataset.segmentIndex);
            const dayIndex = parseInt(btn.dataset.day);
            handleSegmentDayToggle(segmentIndex, dayIndex, btn);
        });
    });

    // Listen for blocks updated from main process
    tauriAPI.onBlocksUpdated(async () => {
        await loadData();
        render();
    });
}



// Validate that a string looks like a valid domain (e.g. reddit.com, example.co.uk)
function isValidDomain(str) {
    // Strip protocol and path if user pasted a URL
    let domain = str.replace(/^https?:\/\//i, '').split('/')[0].split('?')[0].split('#')[0];
    // Must have at least one dot, only valid domain chars, and a TLD of 2+ chars
    return /^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i.test(domain);
}

// Clean a user input string into a domain
function cleanDomainInput(str) {
    return str.replace(/^https?:\/\//i, '').split('/')[0].split('?')[0].split('#')[0].toLowerCase().trim();
}

// Parse input that may contain multiple domains (space, newline, or comma separated)
function parseDomainList(raw) {
    if (!raw || !raw.trim()) return [];
    return raw.split(/\s+|,/).map(s => cleanDomainInput(s)).filter(Boolean);
}

/** Process raw website input: parse, validate, classify. Returns result for keydown/save handlers. */
function processWebsiteInput(raw) {
    const domains = parseDomainList(raw);
    const invalid = domains.filter(d => !isValidDomain(d));
    const valid = domains.filter(d => isValidDomain(d));
    const protectedList = valid.filter(d => isProtectedDomain(d));
    const toAdd = valid.filter(d => !isProtectedDomain(d));
    return {
        invalid,
        toAdd,
        websiteInvalid: invalid.length > 0,
        inputValueToSet: invalid.length === 0 ? '' : invalid.join(' '),
        hadProtected: protectedList.length > 0
    };
}

// Parse a text-file's contents into a flat list of candidate domains. Each
// non-comment line may contain one or more space/comma-separated domains.
// '#' starts a line/inline comment (hosts-file style). Returns raw strings,
// not yet validated.
function parseTextFileDomains(content) {
    if (!content) return [];
    const out = [];
    for (const rawLine of content.split(/\r?\n/)) {
        const beforeComment = rawLine.split('#')[0];
        if (!beforeComment.trim()) continue;
        for (const token of parseDomainList(beforeComment)) {
            if (token) out.push(token);
        }
    }
    return out;
}

// Wire up the Edit Blocklist "Import" popover for the websites field. The
// caller supplies a callback that receives an array of cleaned domain
// strings; it's responsible for de-duplicating against current modal state
// and pushing an undo entry.
function setupWebsitesImportMenu({ addDomainsToModal }) {
    const importBtn = document.getElementById('modal-import-websites-btn');
    const menu = document.getElementById('websites-import-menu');
    if (!importBtn || !menu) return;

    const closeMenu = () => {
        menu.classList.add('hidden');
        importBtn.setAttribute('aria-expanded', 'false');
    };
    const openMenu = () => {
        menu.classList.remove('hidden');
        importBtn.setAttribute('aria-expanded', 'true');
    };

    importBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (menu.classList.contains('hidden')) {
            openMenu();
        } else {
            closeMenu();
        }
    });

    // Close on outside click / Escape.
    document.addEventListener('click', (e) => {
        if (menu.classList.contains('hidden')) return;
        if (!menu.contains(e.target) && !importBtn.contains(e.target)) {
            closeMenu();
        }
    });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !menu.classList.contains('hidden')) {
            closeMenu();
        }
    });

    const textFileBtn = document.getElementById('websites-import-menu-text-file');
    if (textFileBtn) {
        textFileBtn.addEventListener('click', async () => {
            closeMenu();
            try {
                const selected = await openDialog({
                    multiple: false,
                    title: tSettings('importWebsitesPickFileTitle'),
                    filters: [
                        { name: 'Text', extensions: ['txt', 'list', 'csv'] },
                        { name: 'All files', extensions: ['*'] }
                    ]
                });
                if (!selected || typeof selected !== 'string') return;
                const contents = await readTextFile(selected);
                addDomainsToModal(parseTextFileDomains(contents));
            } catch (err) {
                console.warn('[import] text file:', err);
            }
        });
    }

    menu.querySelectorAll('[data-preset]').forEach(btn => {
        btn.addEventListener('click', () => {
            closeMenu();
            const preset = btn.dataset.preset;
            const list = WEBSITES_PRESET_LISTS[preset];
            if (!list) return;
            addDomainsToModal(list);
        });
    });
}

// Modal listeners
function setupModalListeners() {
    let modalWebsites = [];
    let modalApps = [];
    let modalIOSScreenTimeSelection = null;

    const getModalDisplayApps = () => {
        const displayApps = [...modalApps];
        const screenTimeLabel = formatIOSScreenTimeSelectionLabel(modalIOSScreenTimeSelection);
        if (screenTimeLabel) {
            displayApps.push(screenTimeLabel);
        }
        return displayApps;
    };

    const modalWebsiteInput = document.getElementById('modal-website-input');
    const modalAppInput = document.getElementById('modal-app-input');
    const modalWebsitesTags = document.getElementById('modal-websites-tags');
    const modalAppsTags = document.getElementById('modal-apps-tags');

    // Email-to-field-style multi-selection. Track selection by VALUE so the
    // sets stay valid across re-renders and modifications.
    const selectedWebsites = new Set();
    const selectedApps = new Set();

    const isWebsiteLocked = (w) => Array.isArray(window.lockedWebsites) && window.lockedWebsites.includes(w);
    const isAppLocked = (a) => Array.isArray(window.lockedApps) && window.lockedApps.includes(a);

    const clearWebsiteSelection = () => {
        if (selectedWebsites.size === 0) return false;
        selectedWebsites.clear();
        window.renderModalTags();
        return true;
    };
    const clearAppSelection = () => {
        if (selectedApps.size === 0) return false;
        selectedApps.clear();
        window.renderModalTags();
        return true;
    };

    const selectAllUnlockedWebsites = () => {
        selectedWebsites.clear();
        modalWebsites.forEach(w => {
            if (!isWebsiteLocked(w)) selectedWebsites.add(w);
        });
        window.renderModalTags();
    };
    const selectAllUnlockedApps = () => {
        selectedApps.clear();
        modalApps.forEach(a => {
            if (!isAppLocked(a)) selectedApps.add(a);
        });
        // Also include the iOS Screen Time aggregate label if present.
        const iosLabel = formatIOSScreenTimeSelectionLabel(modalIOSScreenTimeSelection);
        if (iosLabel && !isAppLocked(iosLabel)) selectedApps.add(iosLabel);
        window.renderModalTags();
    };

    // Bulk-delete every selected website. Pushes a single undo entry that
    // restores all of them at once, matching the user's "select-all then
    // backspace" mental model in a text editor.
    const deleteSelectedWebsites = () => {
        if (selectedWebsites.size === 0) return false;
        const toDelete = modalWebsites.filter(w => selectedWebsites.has(w) && !isWebsiteLocked(w));
        if (toDelete.length === 0) {
            selectedWebsites.clear();
            window.renderModalTags();
            return false;
        }
        const restoreCopy = [...toDelete];
        pushModalUndo('website-bulk', () => {
            restoreCopy.forEach(w => {
                if (!modalWebsites.includes(w)) modalWebsites.push(w);
            });
            window.renderModalTags();
        });
        toDelete.forEach(w => {
            const i = modalWebsites.indexOf(w);
            if (i !== -1) modalWebsites.splice(i, 1);
        });
        selectedWebsites.clear();
        window.renderModalTags();
        return true;
    };

    // Arrow-key navigation through chips, like an email-to field.
    //   direction === -1  → ArrowLeft  (move selection left, or pull last chip
    //                       into selection when selection is empty)
    //   direction === +1  → ArrowRight (move selection right, deselect & return
    //                       focus to the input if past the last chip)
    // Returns:
    //   'moved'      — selection changed
    //   'deselected' — past the last chip; selection was cleared
    //   false        — nothing happened
    const moveSelectionInList = (list, lockedFn, selection, direction) => {
        if (selection.size === 0) {
            if (direction === -1) {
                for (let i = list.length - 1; i >= 0; i--) {
                    if (!lockedFn(list[i])) {
                        selection.add(list[i]);
                        return 'moved';
                    }
                }
            }
            return false;
        }

        const selectedIdx = [];
        list.forEach((item, idx) => {
            if (selection.has(item)) selectedIdx.push(idx);
        });
        if (selectedIdx.length === 0) return false;

        if (direction === -1) {
            let next = selectedIdx[0] - 1;
            while (next >= 0 && lockedFn(list[next])) next--;
            if (next < 0) {
                // At the start: collapse a multi-selection onto the leftmost
                // chip; otherwise nothing to do.
                if (selectedIdx.length > 1) {
                    selection.clear();
                    selection.add(list[selectedIdx[0]]);
                    return 'moved';
                }
                return false;
            }
            selection.clear();
            selection.add(list[next]);
            return 'moved';
        }

        // direction === +1 (ArrowRight)
        let next = selectedIdx[selectedIdx.length - 1] + 1;
        while (next < list.length && lockedFn(list[next])) next++;
        if (next >= list.length) {
            selection.clear();
            return 'deselected';
        }
        selection.clear();
        selection.add(list[next]);
        return 'moved';
    };

    const moveWebsiteSelection = (direction) => {
        const result = moveSelectionInList(modalWebsites, isWebsiteLocked, selectedWebsites, direction);
        if (result) {
            window.renderModalTags();
            if (result === 'deselected') modalWebsiteInput.focus();
        }
        return result;
    };
    const moveAppSelection = (direction) => {
        const result = moveSelectionInList(getModalDisplayApps(), isAppLocked, selectedApps, direction);
        if (result) {
            window.renderModalTags();
            if (result === 'deselected') modalAppInput.focus();
        }
        return result;
    };

    const deleteSelectedApps = () => {
        if (selectedApps.size === 0) return false;
        const iosLabel = formatIOSScreenTimeSelectionLabel(modalIOSScreenTimeSelection);
        const toDeleteApps = modalApps.filter(a => selectedApps.has(a) && !isAppLocked(a));
        const shouldDeleteIos = iosLabel && selectedApps.has(iosLabel) && !isAppLocked(iosLabel);
        if (toDeleteApps.length === 0 && !shouldDeleteIos) {
            selectedApps.clear();
            window.renderModalTags();
            return false;
        }
        const previousIosSelection = shouldDeleteIos ? cloneIOSScreenTimeSelection(modalIOSScreenTimeSelection) : null;
        const restoredApps = [...toDeleteApps];
        pushModalUndo('app-bulk', () => {
            restoredApps.forEach(a => {
                if (!modalApps.includes(a)) modalApps.push(a);
            });
            if (previousIosSelection) {
                modalIOSScreenTimeSelection = cloneIOSScreenTimeSelection(previousIosSelection);
            }
            window.renderModalTags();
        });
        toDeleteApps.forEach(a => {
            const i = modalApps.indexOf(a);
            if (i !== -1) modalApps.splice(i, 1);
        });
        if (shouldDeleteIos) modalIOSScreenTimeSelection = null;
        selectedApps.clear();
        window.renderModalTags();
        return true;
    };

    // Close modal when clicking outside content
    document.getElementById('blocklist-modal').addEventListener('click', (e) => {
        if (e.target.classList.contains('modal-overlay')) {
            closeBlocklistModal();
        }
    });

    // Make the tags+input area feel like a single email-to-field: clicking
    // anywhere in the tags container (between chips, after the last chip,
    // empty space) focuses the matching input so the user can immediately
    // press Backspace to delete the last tag.
    const focusInputOnTagAreaClick = (tagsContainer, input) => {
        if (!tagsContainer || !input) return;
        const wrapper = tagsContainer.closest('.tags-input-container');
        if (!wrapper) return;
        wrapper.addEventListener('click', (e) => {
            if (e.target === input) return;
            // Don't hijack clicks on chips, the X buttons, or the trailing
            // browse/import button — they all have their own click semantics.
            if (e.target.closest('.tag')) return;
            if (e.target.closest('button')) return;
            input.focus();
        });
    };
    focusInputOnTagAreaClick(modalWebsitesTags, modalWebsiteInput);
    focusInputOnTagAreaClick(modalAppsTags, modalAppInput);

    document.getElementById('blocklist-name').addEventListener('input', () => {
        const nameInput = document.getElementById('blocklist-name');
        nameInput.classList.remove('input-error');
        const previous = lastBlocklistNameValue;
        pushModalUndo('name', () => {
            nameInput.value = previous;
            lastBlocklistNameValue = previous;
            nameInput.classList.remove('input-error');
        });
        lastBlocklistNameValue = nameInput.value;
    });

    modalWebsiteInput.addEventListener('keydown', (e) => {
        const accel = e.metaKey || e.ctrlKey;

        // Cmd/Ctrl-A in an empty input → select all unlocked website tags.
        // Caret in input + text present keeps the native "select text" behaviour.
        if (accel && (e.key === 'a' || e.key === 'A') && !modalWebsiteInput.value.length) {
            e.preventDefault();
            selectAllUnlockedWebsites();
            return;
        }

        // Arrow navigation. ArrowLeft from an empty input pulls the last chip
        // into selection; ArrowLeft/Right with an active selection walks the
        // chip list. With caret-in-text, fall through to the default behaviour.
        if (e.key === 'ArrowLeft' && !accel && !modalWebsiteInput.value.length && selectedWebsites.size === 0) {
            if (moveWebsiteSelection(-1)) e.preventDefault();
            return;
        }
        if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && !accel && selectedWebsites.size > 0) {
            if (moveWebsiteSelection(e.key === 'ArrowLeft' ? -1 : 1)) e.preventDefault();
            return;
        }

        // Backspace/Delete with active selection → bulk delete.
        if ((e.key === 'Backspace' || e.key === 'Delete') && selectedWebsites.size > 0) {
            e.preventDefault();
            deleteSelectedWebsites();
            return;
        }

        // Backspace on empty input removes the last website tag (if not locked)
        if (e.key === 'Backspace' && !modalWebsiteInput.value.length && modalWebsites.length > 0) {
            const lastIdx = modalWebsites.length - 1;
            const last = modalWebsites[lastIdx];
            if (!window.lockedWebsites || !window.lockedWebsites.includes(last)) {
                pushModalUndo('website', () => {
                    modalWebsites.splice(lastIdx, 0, last);
                    window.renderModalTags();
                });
                modalWebsites.splice(lastIdx, 1);
                window.renderModalTags();
                e.preventDefault();
            }
        }

        // Any printable key with an active selection clears it so the user can
        // keep typing without nuking their tags.
        if (selectedWebsites.size > 0 && !accel && e.key.length === 1) {
            clearWebsiteSelection();
        }
        // Enter or Space confirms the website(s) — supports multiple domains separated by space, newline, or comma
        if ((e.key === 'Enter' || e.key === ' ') && modalWebsiteInput.value.trim()) {
            e.preventDefault();
            const result = processWebsiteInput(modalWebsiteInput.value.trim());
            const errorMsg = document.getElementById('website-input-error');

            if (result.websiteInvalid) {
                if (errorMsg) {
                    errorMsg.classList.remove('hidden');
                    setTimeout(() => errorMsg.classList.add('hidden'), 3000);
                }
            } else {
                if (errorMsg) errorMsg.classList.add('hidden');
            }

            if (result.hadProtected) {
                modalWebsiteInput.placeholder = tSettings('cannotBlockDomainPlaceholder');
                modalWebsiteInput.classList.add('input-error');
                setTimeout(() => {
                    modalWebsiteInput.placeholder = tSettings('placeholderWebsiteExample');
                    modalWebsiteInput.classList.remove('input-error');
                }, 2000);
            }

            if (result.toAdd.length > 0) {
                const toAddCopy = [...result.toAdd];
                pushModalUndo('website', () => {
                    toAddCopy.forEach(w => {
                        const i = modalWebsites.indexOf(w);
                        if (i !== -1) modalWebsites.splice(i, 1);
                    });
                    window.renderModalTags();
                });
                result.toAdd.forEach(website => {
                    if (!modalWebsites.includes(website)) modalWebsites.push(website);
                });
                window.renderModalTags();
            }
            modalWebsiteInput.value = result.inputValueToSet;
        }
    });

    setupWebsitesImportMenu({
        addDomainsToModal: (rawDomains) => {
            // Validate, drop protected, drop dupes — same filtering rules as
            // the manual input keydown path.
            const cleaned = (rawDomains || [])
                .map(d => cleanDomainInput(d))
                .filter(d => isValidDomain(d) && !isProtectedDomain(d));
            const newDomains = cleaned.filter(d => !modalWebsites.includes(d));
            if (newDomains.length === 0) return;

            const addedCopy = [...newDomains];
            pushModalUndo('website', () => {
                addedCopy.forEach(w => {
                    const i = modalWebsites.indexOf(w);
                    if (i !== -1) modalWebsites.splice(i, 1);
                });
                window.renderModalTags();
            });
            newDomains.forEach(w => modalWebsites.push(w));
            window.renderModalTags();
        }
    });

    modalAppInput.addEventListener('keydown', (e) => {
        const accel = e.metaKey || e.ctrlKey;

        if (accel && (e.key === 'a' || e.key === 'A') && !modalAppInput.value.length) {
            e.preventDefault();
            selectAllUnlockedApps();
            return;
        }

        if (e.key === 'ArrowLeft' && !accel && !modalAppInput.value.length && selectedApps.size === 0) {
            if (moveAppSelection(-1)) e.preventDefault();
            return;
        }
        if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && !accel && selectedApps.size > 0) {
            if (moveAppSelection(e.key === 'ArrowLeft' ? -1 : 1)) e.preventDefault();
            return;
        }

        if ((e.key === 'Backspace' || e.key === 'Delete') && selectedApps.size > 0) {
            e.preventDefault();
            deleteSelectedApps();
            return;
        }

        // Backspace on empty input removes the last app tag (if not locked)
        if (e.key === 'Backspace' && !modalAppInput.value.length && modalApps.length > 0) {
            const lastIdx = modalApps.length - 1;
            const last = modalApps[lastIdx];
            if (!window.lockedApps || !window.lockedApps.includes(last)) {
                pushModalUndo('app', () => {
                    modalApps.splice(lastIdx, 0, last);
                    window.renderModalTags();
                });
                modalApps.splice(lastIdx, 1);
                window.renderModalTags();
                e.preventDefault();
            }
        }

        if (selectedApps.size > 0 && !accel && e.key.length === 1) {
            clearAppSelection();
        }
        if (e.key === 'Enter' && modalAppInput.value.trim()) {
            e.preventDefault();
            const app = modalAppInput.value.trim();
            if (isProtectedApp(app)) {
                // Show brief warning — ReDD Block cannot block itself
                modalAppInput.value = '';
                modalAppInput.placeholder = tSettings('cannotBlockSelfAppPlaceholder');
                modalAppInput.classList.add('input-error');
                setTimeout(() => {
                    modalAppInput.placeholder = tSettings('placeholderAppExample');
                    modalAppInput.classList.remove('input-error');
                }, 2000);
                return;
            }
            if (!modalApps.includes(app)) {
                pushModalUndo('app', () => {
                    const i = modalApps.indexOf(app);
                    if (i !== -1) modalApps.splice(i, 1);
                    window.renderModalTags();
                });
                modalApps.push(app);
                window.renderModalTags();
            }
            modalAppInput.value = '';
        }
    });

    // Browse button for modal
    const modalBrowseBtn = document.getElementById('modal-browse-apps-btn');
    if (isIOS && modalBrowseBtn) {
        modalBrowseBtn.addEventListener('click', async () => {
            try {
                const result = await tauriAPI.showActivityPicker({
                    initialApplicationTokenData: modalIOSScreenTimeSelection?.applicationTokens || [],
                    initialCategoryTokenData: modalIOSScreenTimeSelection?.categoryTokens || []
                });
                if (!result.cancelled && (result.applicationCount > 0 || result.categoryCount > 0)) {
                    const previousSelection = cloneIOSScreenTimeSelection(modalIOSScreenTimeSelection);
                    pushModalUndo('ios-screentime-selection', () => {
                        modalIOSScreenTimeSelection = cloneIOSScreenTimeSelection(previousSelection);
                        window.renderModalTags();
                    });
                    modalIOSScreenTimeSelection = normalizeIOSScreenTimeSelection({
                        applicationTokens: result.applicationTokens || [],
                        categoryTokens: result.categoryTokens || [],
                        applicationCount: result.applicationCount || 0,
                        categoryCount: result.categoryCount || 0,
                        requiresReselection: false
                    });
                    window.renderModalTags();
                } else if (!result.cancelled && modalIOSScreenTimeSelection) {
                    const previousSelection = cloneIOSScreenTimeSelection(modalIOSScreenTimeSelection);
                    pushModalUndo('ios-screentime-selection-clear', () => {
                        modalIOSScreenTimeSelection = cloneIOSScreenTimeSelection(previousSelection);
                        window.renderModalTags();
                    });
                    modalIOSScreenTimeSelection = null;
                    window.renderModalTags();
                }
            } catch (err) {
                console.error('Activity picker error:', err);
                alert('Failed to open app picker: ' + err);
            }
        });
    } else if (modalBrowseBtn) {
        modalBrowseBtn.addEventListener('click', async () => {
            const appNames = await tauriAPI.openAppPicker();
            if (appNames && appNames.length > 0) {
                const toAdd = appNames.filter(n => !modalApps.includes(n));
                if (toAdd.length > 0) {
                    const toAddCopy = [...toAdd];
                    pushModalUndo('app', () => {
                        toAddCopy.forEach(a => {
                            const i = modalApps.indexOf(a);
                            if (i !== -1) modalApps.splice(i, 1);
                        });
                        window.renderModalTags();
                    });
                }
                let added = false;
                for (const appName of appNames) {
                    if (!modalApps.includes(appName)) {
                        modalApps.push(appName);
                        added = true;
                    }
                }
                if (added) {
                    window.renderModalTags();
                }
            }
        });
    }
    // Override type
    document.getElementById('override-type').addEventListener('change', (e) => {
        const overrideTypeSelect = e.target;
        const previousType = lastOverrideTypeValue;
        pushModalUndo('override-type', () => {
            overrideTypeSelect.value = previousType;
            lastOverrideTypeValue = previousType;
            overrideTypeSelect.dispatchEvent(new Event('change'));
        });

        const type = e.target.value;
        const overrideCountInput = document.getElementById('override-count');
        applyOverrideTypeUi(type);

        // Clamp to the new type-specific max when switching types.
        overrideCountInput.value = normalizeOverrideCount(overrideCountInput.value, type);
        lastOverrideTypeValue = overrideTypeSelect.value;

        const maxDifficultyCb = document.getElementById('override-max-difficulty-checkbox');
        if (maxDifficultyCb && maxDifficultyCb.checked && type !== 'custom') {
            const maxCount = getMaxOverrideCharsForType(type);
            overrideCountInput.value = String(maxCount);
            overrideCountInput.max = String(maxCount);
            lastOverrideCountValue = overrideCountInput.value;
            setOverrideCountMaxMode(true);
        }
    });
    document.getElementById('override-max-difficulty-checkbox').addEventListener('change', (e) => {
        const checked = e.target.checked;
        const overrideTypeSelect = document.getElementById('override-type');
        const overrideCountInput = document.getElementById('override-count');
        if (checked) {
            lastOverrideTypeValueBeforeMaxDifficulty = overrideTypeSelect.value;
            lastOverrideCountValueBeforeMaxDifficulty = overrideCountInput.value.trim() || lastOverrideCountValueBeforeMaxDifficulty;
            const type = overrideTypeSelect.value;
            applyOverrideTypeUi(type);
            const maxCount = getMaxOverrideCharsForType(type);
            overrideCountInput.value = String(maxCount);
            overrideCountInput.max = String(maxCount);
            lastOverrideCountValue = overrideCountInput.value;
            setOverrideCountMaxMode(true);
            updateOverridePreview(); // preview must reflect max count (set just above)
        } else {
            const typeToRestore = lastOverrideTypeValueBeforeMaxDifficulty;
            overrideTypeSelect.value = typeToRestore;
            applyOverrideTypeUi(typeToRestore);
            const maxChars = getMaxOverrideCharsForType(typeToRestore);
            overrideCountInput.max = String(maxChars);
            overrideCountInput.value = normalizeOverrideCount(String(lastOverrideCountValueBeforeMaxDifficulty), typeToRestore);
            lastOverrideCountValue = overrideCountInput.value;
            lastOverrideCountValueBeforeMaxDifficulty = overrideCountInput.value;
            setOverrideCountMaxMode(false);
            updateOverridePreview(); // preview must reflect restored count (set just above)
        }
    });
    document.getElementById('custom-override-text').addEventListener('input', (e) => {
        const customTextArea = e.target;
        const previous = lastCustomOverrideTextValue;
        pushModalUndo('custom-override-text', () => {
            customTextArea.value = previous;
            lastCustomOverrideTextValue = previous;
            const warningEl = document.getElementById('override-count-warning');
            const maxChars = getMaxOverrideCharsForType('custom');
            if (previous.length >= maxChars) {
                const charsPerMinute = getTypingCharsPerMinuteForType('custom');
                const estimatedMinutes = Math.ceil(maxChars / charsPerMinute);
                warningEl.textContent = `Max is ${maxChars} characters so it's still possible to override in case of emergency (takes you ~${estimatedMinutes} minutes to type).`;
                warningEl.classList.remove('hidden');
            } else {
                warningEl.classList.add('hidden');
                warningEl.textContent = '';
            }
        });

        const warningEl = document.getElementById('override-count-warning');
        const maxChars = getMaxOverrideCharsForType('custom');
        const charsPerMinute = getTypingCharsPerMinuteForType('custom');
        const estimatedMinutes = Math.ceil(maxChars / charsPerMinute);
        e.target.maxLength = maxChars;

        if (e.target.value.length > maxChars) {
            e.target.value = e.target.value.slice(0, maxChars);
        }

        if (e.target.value.length >= maxChars) {
            warningEl.textContent = `Max is ${maxChars} characters so it's still possible to override in case of emergency (takes you ~${estimatedMinutes} minutes to type).`;
            warningEl.classList.remove('hidden');
        } else {
            warningEl.classList.add('hidden');
            warningEl.textContent = '';
        }
        lastCustomOverrideTextValue = e.target.value;
        updateOverridePreview();
    });

    // Override count blur on enter
    document.getElementById('override-count').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.target.blur();
        }
    });
    document.getElementById('override-count').addEventListener('input', (e) => {
        const overrideCountInput = e.target;
        const previous = lastOverrideCountValue;
        const current = overrideCountInput.value;
        if (previous !== current) {
            pushModalUndo('override-count', () => {
                overrideCountInput.value = previous;
                lastOverrideCountValue = previous;
            });
        }

        const warningEl = document.getElementById('override-count-warning');
        const overrideType = document.getElementById('override-type')?.value || 'random-words';
        const maxChars = getMaxOverrideCharsForType(overrideType);
        e.target.max = String(maxChars);
        const rawValue = e.target.value.trim();
        if (rawValue === '') {
            warningEl.classList.add('hidden');
            warningEl.textContent = '';
            lastOverrideCountValue = e.target.value;
            updateOverridePreview();
            return;
        }

        const parsed = parseInt(rawValue, 10);
        if (Number.isFinite(parsed) && parsed > maxChars) {
            const charsPerMinute = getTypingCharsPerMinuteForType(overrideType);
            const estimatedMinutes = Math.ceil(maxChars / charsPerMinute);
            e.target.value = maxChars;
            warningEl.textContent = `Max is ${maxChars} characters so it's still possible to override in case of emergency (takes you ~${estimatedMinutes} minutes to type).`;
            warningEl.classList.remove('hidden');
        } else {
            warningEl.classList.add('hidden');
            warningEl.textContent = '';
        }
        lastOverrideCountValue = e.target.value;
        updateOverridePreview();
    });
    document.getElementById('override-count').addEventListener('blur', (e) => {
        const overrideType = document.getElementById('override-type')?.value || 'random-words';
        e.target.value = normalizeOverrideCount(e.target.value, overrideType);
        updateOverridePreview();
    });

    // Color swatches
    document.querySelectorAll('.color-swatch').forEach(swatch => {
        swatch.addEventListener('click', () => {
            document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('selected'));
            swatch.classList.add('selected');
            applyModalBlocklistTint(swatch.dataset.color);
        });
    });

    // Custom color picker
    const customColorInput = document.getElementById('custom-color-input');
    const customSwatch = document.getElementById('custom-color-swatch');
    if (customColorInput && customSwatch) {
        // Trigger input when swatch is clicked
        customSwatch.addEventListener('click', () => {
            customColorInput.click();
        });

        customColorInput.addEventListener('input', (e) => {
            const color = e.target.value;
            customSwatch.style.background = color;
            customSwatch.dataset.color = color;
            document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('selected'));
            customSwatch.classList.add('selected');
            applyModalBlocklistTint(color);
        });
    }

    // Emoji swatches
    document.querySelectorAll('.emoji-swatch').forEach(swatch => {
        swatch.addEventListener('click', () => {
            // Only handle non-custom swatches here, or custom swatches if they already have an emoji
            if (!swatch.classList.contains('custom-emoji-swatch') || swatch.dataset.emoji) {
                document.querySelectorAll('.emoji-swatch').forEach(s => s.classList.remove('selected'));
                swatch.classList.add('selected');
            }
        });
    });

    // Custom emoji picker with emoji-picker-element popover
    const customEmojiSwatch = document.getElementById('custom-emoji-swatch');
    const emojiPickerPopover = document.getElementById('emoji-picker-popover');
    const emojiPicker = emojiPickerPopover?.querySelector('emoji-picker');

    if (customEmojiSwatch && emojiPickerPopover && emojiPicker) {
        // Toggle popover on swatch click
        customEmojiSwatch.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();

            if (emojiPickerPopover.classList.contains('hidden')) {
                // Position the popover above the button using fixed positioning
                const rect = customEmojiSwatch.getBoundingClientRect();
                emojiPickerPopover.style.bottom = (window.innerHeight - rect.top + 8) + 'px';
                emojiPickerPopover.style.right = (window.innerWidth - rect.right) + 'px';
                emojiPickerPopover.classList.remove('hidden');
            } else {
                emojiPickerPopover.classList.add('hidden');
            }
        });

        // Handle emoji selection
        emojiPicker.addEventListener('emoji-click', (e) => {
            const emoji = e.detail.unicode;
            customEmojiSwatch.innerHTML = emoji;
            customEmojiSwatch.dataset.emoji = emoji;

            // Select the custom swatch
            document.querySelectorAll('.emoji-swatch').forEach(s => s.classList.remove('selected'));
            customEmojiSwatch.classList.add('selected');

            // Hide popover
            emojiPickerPopover.classList.add('hidden');
        });

        // Close popover when clicking outside
        document.addEventListener('click', (e) => {
            if (!emojiPickerPopover.classList.contains('hidden') &&
                !emojiPickerPopover.contains(e.target) &&
                !customEmojiSwatch.contains(e.target)) {
                emojiPickerPopover.classList.add('hidden');
            }
        });
    }

    // Blocklist modal advanced options toggle
    const blocklistAdvancedToggle = document.getElementById('blocklist-advanced-toggle');
    const blocklistAdvancedContent = document.getElementById('blocklist-advanced-content');
    if (blocklistAdvancedToggle && blocklistAdvancedContent) {
        blocklistAdvancedToggle.addEventListener('click', () => {
            blocklistAdvancedToggle.classList.toggle('expanded');
            blocklistAdvancedContent.classList.toggle('hidden');
        });
    }

    // Cancel button
    document.getElementById('cancel-blocklist-btn').addEventListener('click', () => {
        closeBlocklistModal();
    });

    // Save button
    document.getElementById('save-blocklist-btn').addEventListener('click', () => {
        const nameInput = document.getElementById('blocklist-name');
        const name = nameInput.value.trim();
        const nameEmpty = !name;
        if (nameEmpty) {
            nameInput.classList.add('input-error');
        } else {
            nameInput.classList.remove('input-error');
        }

        // Auto-confirm any pending website input using the same validation flow as Enter/Space.
        let websiteInvalid = false;
        const pendingWebsiteRaw = modalWebsiteInput.value.trim();
        if (pendingWebsiteRaw) {
            const result = processWebsiteInput(pendingWebsiteRaw);
            const errorMsg = document.getElementById('website-input-error');

            if (result.websiteInvalid) {
                if (errorMsg) {
                    errorMsg.classList.remove('hidden');
                    setTimeout(() => errorMsg.classList.add('hidden'), 3000);
                }
                websiteInvalid = true;
            } else {
                if (errorMsg) errorMsg.classList.add('hidden');
            }

            if (result.hadProtected) {
                modalWebsiteInput.value = '';
                modalWebsiteInput.placeholder = tSettings('cannotBlockDomainPlaceholder');
                modalWebsiteInput.classList.add('input-error');
                setTimeout(() => {
                    modalWebsiteInput.placeholder = tSettings('placeholderWebsiteExample');
                    modalWebsiteInput.classList.remove('input-error');
                }, 2000);
                return; // Block save so behavior matches explicit add interactions.
            }

            if (result.toAdd.length > 0) {
                const toAddCopy = [...result.toAdd];
                pushModalUndo('website', () => {
                    toAddCopy.forEach(w => {
                        const i = modalWebsites.indexOf(w);
                        if (i !== -1) modalWebsites.splice(i, 1);
                    });
                    window.renderModalTags();
                });
            }
            result.toAdd.forEach(pendingWebsite => {
                if (!modalWebsites.includes(pendingWebsite)) modalWebsites.push(pendingWebsite);
            });
            if (result.toAdd.length > 0) window.renderModalTags();
            modalWebsiteInput.value = result.inputValueToSet;
        }

        if (nameEmpty || websiteInvalid) return;

        const pendingApp = modalAppInput.value.trim();
        if (pendingApp && !isProtectedApp(pendingApp) && !modalApps.includes(pendingApp)) {
            pushModalUndo('app', () => {
                const i = modalApps.indexOf(pendingApp);
                if (i !== -1) modalApps.splice(i, 1);
                window.renderModalTags();
            });
            modalApps.push(pendingApp);
            modalAppInput.value = '';
            window.renderModalTags();
        } else {
            modalAppInput.value = '';
        }

        const mode = 'blocklist'; // Allowlist mode not yet implemented
        const overrideType = document.getElementById('override-type').value;
        const overrideCountInput = document.getElementById('override-count');
        const maxDifficultyChecked = document.getElementById('override-max-difficulty-checkbox').checked;
        const overrideCount = maxDifficultyChecked
            ? getMaxOverrideCharsForType(overrideType)
            : normalizeOverrideCount(overrideCountInput.value, overrideType);
        overrideCountInput.value = overrideCount;
        const customTextArea = document.getElementById('custom-override-text');
        const customText = normalizeCustomOverrideText(customTextArea.value);
        customTextArea.value = customText;
        const selectedSwatch = document.querySelector('.color-swatch.selected');
        const color = selectedSwatch ? selectedSwatch.dataset.color : null;
        const selectedEmoji = document.querySelector('.emoji-swatch.selected');
        const emoji = selectedEmoji ? selectedEmoji.dataset.emoji : '🚫';

        const showItemDetails = document.getElementById('show-item-details-checkbox').checked;
        // Preserve the blocklist's existing schedule visibility (toggled via the chips above the
        // schedule); default to true for new blocklists.
        const existingBlocklistForSave = editingBlocklistId
            ? appData.blocklists.find(bl => bl.id === editingBlocklistId)
            : null;
        const alwaysShowInSchedule = existingBlocklistForSave?.alwaysShowInSchedule !== false;

        const overrideDifficultyPayload = {
            type: overrideType,
            count: overrideCount,
            maxDifficulty: maxDifficultyChecked,
            customText: customText
        };
        if (maxDifficultyChecked) {
            overrideDifficultyPayload.countBeforeMax = normalizeOverrideCount(
                String(lastOverrideCountValueBeforeMaxDifficulty),
                lastOverrideTypeValueBeforeMaxDifficulty
            );
            overrideDifficultyPayload.typeBeforeMax = lastOverrideTypeValueBeforeMaxDifficulty;
        }

        // IMPORTANT: Create copies of the arrays, not references!
        const blocklist = {
            id: editingBlocklistId || generateId(),
            name,
            mode,
            color,
            emoji,
            websites: [...modalWebsites],  // Copy the array
            apps: [...modalApps],          // Copy the array
            iosScreenTimeSelection: cloneIOSScreenTimeSelection(modalIOSScreenTimeSelection),
            showItemDetails,
            alwaysShowInSchedule,
            overrideDifficulty: overrideDifficultyPayload
        };

        if (editingBlocklistId) {
            const idx = appData.blocklists.findIndex(bl => bl.id === editingBlocklistId);
            if (idx !== -1) {
                appData.blocklists[idx] = blocklist;
            }
        } else {
            appData.blocklists.push(blocklist);
        }

        saveData();

        // If this blocklist is active (block or schedule), update blocking rules immediately
        const now = Date.now();
        const hasActiveBlock = appData.activeBlocks.some(
            b => b.blocklistId === blocklist.id && b.startTime <= now && b.endTime > now
        );
        const hasActiveSchedule = appData.schedules?.some(
            s => s.blocklistId === blocklist.id && s.segments && s.segments.length > 0
        );

        if (hasActiveBlock || hasActiveSchedule) {
            // Update website blocking
            updateHostsFile();

            // Sync schedules to helper (blocklist domains/apps may have changed)
            syncSchedulesToHelper();

            // Update app blocking - this handles both active blocks and schedules
            updateBlockedApps();
        }

        // Keep live preview while editing, but don't revert after a confirmed save.
        blocklistModalPreviewSnapshot = null;
        closeBlocklistModal();

        // Only update blocklist display without resetting schedule segments
        renderBlocklists();
        renderBlocklistSelector();
        renderWeekBlocks(); // Refresh calendar so colour / emoji / name changes propagate

        // Re-trigger blocklist selection to update button text (name may have changed)
        if (selectedBlocklistId) {
            const dropdown = document.getElementById('blocklist-select');
            if (dropdown) {
                dropdown.value = selectedBlocklistId;
                handleBlocklistSelect({ target: dropdown });
            }
        }
    });

    // Store references for modal functions
    window.modalWebsites = modalWebsites;
    window.modalApps = modalApps;
    window.lockedWebsites = [];
    window.lockedApps = [];

    window.renderModalTags = () => {
        renderTags(modalWebsitesTags, modalWebsites, (idx) => {
            const value = modalWebsites[idx];
            if (window.lockedWebsites && window.lockedWebsites.includes(value)) {
                return; // Do not remove locked items; do not push undo.
            }
            pushModalUndo('website', () => {
                modalWebsites.splice(idx, 0, value);
                window.renderModalTags();
            });
            modalWebsites.splice(idx, 1);
            window.renderModalTags();
        }, window.lockedWebsites, {
            selectedItems: selectedWebsites,
            onTagClick: (idx) => {
                const value = modalWebsites[idx];
                if (!value || isWebsiteLocked(value)) return;
                if (selectedWebsites.has(value)) {
                    selectedWebsites.delete(value);
                } else {
                    selectedWebsites.add(value);
                }
                window.renderModalTags();
                // Keep keyboard focus on the input so Backspace works immediately.
                modalWebsiteInput.focus();
            }
        });

        const displayApps = getModalDisplayApps();
        renderTags(modalAppsTags, displayApps, (idx) => {
            const value = displayApps[idx];
            if (window.lockedApps && window.lockedApps.includes(value)) {
                return; // Do not remove locked items; do not push undo.
            }
            if (value === formatIOSScreenTimeSelectionLabel(modalIOSScreenTimeSelection)) {
                const previousSelection = cloneIOSScreenTimeSelection(modalIOSScreenTimeSelection);
                pushModalUndo('ios-screentime-selection-remove', () => {
                    modalIOSScreenTimeSelection = cloneIOSScreenTimeSelection(previousSelection);
                    window.renderModalTags();
                });
                modalIOSScreenTimeSelection = null;
            } else {
                const appIdx = modalApps.indexOf(value);
                if (appIdx === -1) return;
                pushModalUndo('app', () => {
                    modalApps.splice(appIdx, 0, value);
                    window.renderModalTags();
                });
                modalApps.splice(appIdx, 1);
            }
            window.renderModalTags();
        }, window.lockedApps, {
            selectedItems: selectedApps,
            onTagClick: (idx) => {
                const value = displayApps[idx];
                if (!value || isAppLocked(value)) return;
                if (selectedApps.has(value)) {
                    selectedApps.delete(value);
                } else {
                    selectedApps.add(value);
                }
                window.renderModalTags();
                modalAppInput.focus();
            }
        });

        // Show a tab-restore hint when the user has any browser in the apps
        // list. The force-close path can drop unsaved form data + open tabs,
        // so it's worth flagging up-front rather than only mentioning it in
        // the countdown — by the time that fires it's usually too late.
        const browserHint = document.getElementById('blocklist-apps-browser-hint');
        if (browserHint) {
            const hasBrowser = modalApps.some(isBrowserAppName);
            browserHint.classList.toggle('hidden', !hasBrowser);
        }
    };

    // Esc inside the modal clears any active tag selection (it does NOT close
    // the modal in that case — only when no selection is active).
    document.getElementById('blocklist-modal').addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        const clearedWebsites = clearWebsiteSelection();
        const clearedApps = clearAppSelection();
        if (clearedWebsites || clearedApps) e.stopPropagation();
    });

    window.setModalData = (websites, apps, iosScreenTimeSelection = null, lockedWebsitesList = [], lockedAppsList = []) => {
        modalWebsites.length = 0;
        modalApps.length = 0;
        selectedWebsites.clear();
        selectedApps.clear();
        modalIOSScreenTimeSelection = cloneIOSScreenTimeSelection(iosScreenTimeSelection);
        window.lockedWebsites = lockedWebsitesList;
        window.lockedApps = lockedAppsList;

        websites.forEach(w => modalWebsites.push(w));
        apps.forEach(a => modalApps.push(a));
        window.renderModalTags();
    };
}

// Override modal listeners
function setupOverrideModalListeners() {
    const challengeInput = document.getElementById('challenge-input');
    const progressBar = document.getElementById('challenge-progress-bar');
    const challengeTextEl = document.getElementById('challenge-text');

    // Helper to render challenge text with optional error highlight
    function renderChallengeText(errorIndex = -1) {
        if (errorIndex < 0 || errorIndex >= challengeText.length) {
            challengeTextEl.textContent = challengeText;
        } else {
            // Highlight the error character
            const before = escapeHtml(challengeText.slice(0, errorIndex));
            const errorChar = escapeHtml(challengeText[errorIndex]);
            const after = escapeHtml(challengeText.slice(errorIndex + 1));
            challengeTextEl.innerHTML = `${before}<span class="error-char">${errorChar}</span>${after}`;
        }
    }

    // Prevent paste - users must type manually
    challengeInput.addEventListener('paste', (e) => {
        e.preventDefault();
    });

    challengeInput.addEventListener('input', () => {
        const typed = challengeInput.value;
        const target = challengeText;

        // Calculate progress and find first error
        let correctChars = 0;
        let firstErrorIndex = -1;
        for (let i = 0; i < typed.length && i < target.length; i++) {
            if (typed[i] === target[i]) {
                correctChars++;
            } else {
                firstErrorIndex = i;
                break; // Stop at first mismatch
            }
        }

        const progress = (correctChars / target.length) * 100;
        progressBar.style.width = `${progress}%`;

        // Clear error highlighting while typing
        renderChallengeText(-1);
    });

    // Enter key submits the override
    challengeInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault(); // Prevent newline in textarea
            document.getElementById('confirm-override-btn').click();
        }
    });

    document.getElementById('cancel-override-btn').addEventListener('click', () => {
        // Check for helper removal special case
        if (overrideBlockId === 'helper-removal' && window.helperRemovalCancelCallback) {
            window.helperRemovalCancelCallback();
            return;
        }
        closeOverrideModal();
    });

    // Pause block button
    document.getElementById('pause-block-btn').addEventListener('click', () => {
        if (!selectedBlocklistId) return;
        const now = Date.now();

        // Try one-off block first
        const activeBlock = appData.activeBlocks.find(b =>
            b.blocklistId === selectedBlocklistId && b.startTime <= now && b.endTime > now
        );
        if (activeBlock) {
            if (activeBlock.isPaused) {
                // Resume — show confirmation dialog
                openResumeConfirmation(selectedBlocklistId, 'block', activeBlock.id);
            } else {
                // Pause
                pauseScheduleData = null;
                openPauseModal(activeBlock.id);
            }
            return;
        }

        // Try schedule — find the currently active segment
        const schedule = appData.schedules?.find(s => s.blocklistId === selectedBlocklistId);
        if (schedule) {
            if (schedule.isPaused && schedule.pauseEndTime > now) {
                // Resume — show confirmation dialog
                openResumeConfirmation(selectedBlocklistId, 'schedule', null);
                return;
            }
            pauseScheduleData = {
                blocklistId: selectedBlocklistId,
                isActiveNow: isScheduleSegmentActiveNow(schedule)
            };
            openPauseModal(null); // null blockId signals schedule pause
        }
    });

    // Pause modal event listeners
    document.getElementById('cancel-pause-btn').addEventListener('click', closePauseModal);
    document.getElementById('pause-modal').addEventListener('click', (e) => {
        if (e.target === e.currentTarget) closePauseModal();
    });

    document.getElementById('confirm-pause-btn').addEventListener('click', async () => {
        await proceedWithPause();
    });

    // Pause duration inputs — update restart time display
    document.getElementById('pause-days').addEventListener('input', updatePauseRestartTime);
    document.getElementById('pause-hours').addEventListener('input', function () {
        let val = parseInt(this.value);
        if (val > 23) { this.value = 23; }
        if (val < 0) { this.value = 0; }
        updatePauseRestartTime();
    });
    document.getElementById('pause-minutes').addEventListener('input', function () {
        let val = parseInt(this.value);
        if (val > 59) { this.value = 59; }
        if (val < 0) { this.value = 0; }
        updatePauseRestartTime();
    });

    // Pause challenge input — track progress
    const pauseChallengeInput = document.getElementById('pause-challenge-input');
    pauseChallengeInput.addEventListener('input', () => {
        const typed = pauseChallengeInput.value;
        const target = pauseChallengeText;
        const progress = target.length > 0 ? Math.min(100, (typed.length / target.length) * 100) : 0;
        document.getElementById('pause-challenge-progress-bar').style.width = `${progress}%`;

        // Enable/disable confirm button
        document.getElementById('confirm-pause-btn').disabled = (typed !== target);
    });

    pauseChallengeInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            document.getElementById('confirm-pause-btn').click();
        }
    });

    const pauseDurationSection = document.querySelector('#pause-modal .pause-duration-section');
    if (pauseDurationSection && typeof ResizeObserver !== 'undefined') {
        const pauseDurationRo = new ResizeObserver(() => syncPauseDurationRowLayout());
        pauseDurationRo.observe(pauseDurationSection);
    }
    window.addEventListener('resize', () => syncPauseDurationRowLayout());

    document.getElementById('confirm-override-btn').addEventListener('click', async () => {
        const typed = challengeInput.value;
        const target = challengeText;

        // Find first mismatch
        let firstErrorIndex = -1;
        if (typed !== target) {
            for (let i = 0; i < Math.max(typed.length, target.length); i++) {
                if (typed[i] !== target[i]) {
                    firstErrorIndex = i;
                    break;
                }
            }
            // If typed is shorter than target, first missing char is the error
            if (firstErrorIndex === -1 && typed.length < target.length) {
                firstErrorIndex = typed.length;
            }
        }

        if (typed === target && (overrideBlockId || window.overrideScheduleId)) {
            // Check for helper removal special case
            if (overrideBlockId === 'helper-removal' && window.helperRemovalConfirmCallback) {
                window.helperRemovalConfirmCallback();
                return;
            }

            if (overrideBlockId && overrideBlockId !== 'helper-removal') {
                const overriddenBlock = appData.activeBlocks.find(b => b.id === overrideBlockId);
                const blocklistIdToClear = overrideBlocklistIdForHelper ?? (overriddenBlock ? overriddenBlock.blocklistId : null);
                appData.activeBlocks = appData.activeBlocks.filter(b => b.id !== overrideBlockId);
                await saveData();

                if (isIOS) {
                    await tauriAPI.screentimeClearBlock();
                    lastBlockedDomains = new Set();
                    await updateHostsFile();
                    await syncSchedulesToHelper();
                } else {
                    const status = await refreshDesktopHelperStatus();
                    if (status.helperReady) {
                        if (blocklistIdToClear != null) {
                            await tauriAPI.clearBlockViaHelper(blocklistIdToClear);
                        } else {
                            console.error('[override] No blocklist id for single-block override; not touching helper state');
                        }
                    } else {
                        await updateHostsFile();
                    }
                }

                overrideBlocklistIdForHelper = null;
                // Update blocked apps (will stop watcher if no apps to block, including schedules)
                await updateBlockedApps();
            } else if (window.overrideScheduleId) {
                // Schedules behave like one-off blocks now: stopping always tears down the
                // entire schedule (no per-instance skip). Segments are re-loaded into the
                // editor so the user can re-start them later without re-typing them.
                const scheduleId = window.overrideScheduleId;
                const scheduleToStop = appData.schedules.find(s =>
                    s.id === scheduleId || s.blocklistId === scheduleId
                );

                if (scheduleToStop) {
                    scheduleSegments = scheduleToStop.segments.map(seg => ({ ...seg }));
                    activeScheduleSegmentCount = 0; // No segments are locked anymore

                    // Save these segments as pending so they persist when clicking off/on
                    if (!appData.settings) appData.settings = {};
                    if (!appData.settings.pendingScheduleSegments) appData.settings.pendingScheduleSegments = {};
                    appData.settings.pendingScheduleSegments[scheduleToStop.blocklistId] = scheduleSegments.map(seg => ({ ...seg }));

                    appData.schedules = appData.schedules.filter(s =>
                        s.id !== scheduleId && s.blocklistId !== scheduleId
                    );

                    // Rebuild UI to show all segments as editable if we're viewing this blocklist
                    if (selectedBlocklistId === scheduleToStop.blocklistId && isScheduleMode) {
                        rebuildScheduleSegments();
                        disableScheduleControls(false);
                    }
                } else {
                    activeScheduleSegmentCount = 0;
                }

                // On iOS, clear both Screen Time stores so the overridden schedule's blocks are removed
                // immediately; updateHostsFile and syncSchedulesToHelper will then re-apply correct state.
                if (isIOS) {
                    await tauriAPI.screentimeClearBlock();
                    lastBlockedDomains = new Set();
                }

                await saveData();
                await updateHostsFile();
                await syncSchedulesToHelper();
                await updateBlockedApps();

                // Reset modal title
                const titleEl = document.getElementById('override-modal-title');
                if (titleEl) {
                    titleEl.textContent = 'Override Block?';
                }

                delete window.overrideScheduleId;
            }

            render();

            // Refresh the blocklist selection UI to update button and controls
            const blocklistSelect = document.getElementById('blocklist-select');
            handleBlocklistSelect({ target: blocklistSelect });
            await refreshOpenHelperUi();

            closeOverrideModal();
        } else {
            // Wrong! Wiggle and highlight error
            const modalContent = document.querySelector('#override-modal .modal-content');
            modalContent.classList.remove('wiggle');
            void modalContent.offsetWidth; // Trigger reflow
            modalContent.classList.add('wiggle');

            // Highlight first wrong character
            renderChallengeText(firstErrorIndex);
        }
    });

    // Click outside to close
    const overrideModal = document.getElementById('override-modal');
    overrideModal.addEventListener('click', (e) => {
        if (e.target === overrideModal) {
            closeOverrideModal();
        }
    });
}

// Render tags
function renderTags(container, items, onRemove, lockedItems = [], options = {}) {
    const selectedItems = options.selectedItems instanceof Set ? options.selectedItems : null;
    const onTagClick = typeof options.onTagClick === 'function' ? options.onTagClick : null;

    container.innerHTML = items.map((item, idx) => {
        const isLocked = lockedItems.includes(item);
        const isSelected = !isLocked && selectedItems?.has(item);
        const classes = ['tag'];
        if (isLocked) classes.push('locked');
        if (isSelected) classes.push('selected');
        const removeBtn = !isLocked ? `<button class="tag-remove" data-idx="${idx}">×</button>` : '';

        return `
    <span class="${classes.join(' ')}" data-idx="${idx}">
      ${escapeHtml(item)}
      ${removeBtn}
    </span>
  `;
    }).join('');

    container.querySelectorAll('.tag-remove').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const idx = parseInt(btn.dataset.idx);
            if (onRemove) onRemove(idx);
        });
    });

    if (onTagClick) {
        container.querySelectorAll('.tag').forEach(tagEl => {
            tagEl.addEventListener('click', (e) => {
                // Don't toggle when the user clicks the inline ✕ — that path
                // is handled by .tag-remove above and removes the chip outright.
                if (e.target.closest('.tag-remove')) return;
                const idx = parseInt(tagEl.dataset.idx);
                if (Number.isFinite(idx)) onTagClick(idx);
            });
        });
    }
}
// Track current selected end time only (start is always 'now')
let selectedEndHour = 20;
let selectedEndMinute = 30;
let targetDurationMinutes = 60; // Default 60-minute block
let userEditedEndTime = false; // Track if user manually changed end time

// Pad number with leading zero
function pad(num) {
    return num.toString().padStart(2, '0');
}

// Disable or enable time controls (when a block is active, controls should be disabled)
function disableTimeControls(disabled) {
    const durationInput = document.getElementById('duration-minutes-input');
    const endHourBtn = document.getElementById('end-hour-btn');
    const endMinuteBtn = document.getElementById('end-minute-btn');
    const endTimeDisplay = document.getElementById('end-time-display');
    const quickSelectBtns = document.querySelectorAll('.duration-quick-btn');
    const timePickerContainer = document.getElementById('time-picker-container');

    if (durationInput) {
        durationInput.disabled = disabled;
        durationInput.style.opacity = disabled ? '0.5' : '1';
        durationInput.style.pointerEvents = disabled ? 'none' : 'auto';
    }

    if (endHourBtn) {
        endHourBtn.disabled = disabled;
        endHourBtn.style.opacity = disabled ? '0.5' : '1';
        endHourBtn.style.pointerEvents = disabled ? 'none' : 'auto';
    }

    if (endMinuteBtn) {
        endMinuteBtn.disabled = disabled;
        endMinuteBtn.style.opacity = disabled ? '0.5' : '1';
        endMinuteBtn.style.pointerEvents = disabled ? 'none' : 'auto';
    }

    if (endTimeDisplay) {
        endTimeDisplay.style.pointerEvents = disabled ? 'none' : 'auto';
    }

    quickSelectBtns.forEach(function (btn) {
        btn.disabled = disabled;
        btn.style.opacity = disabled ? '0.5' : '1';
        btn.style.pointerEvents = disabled ? 'none' : 'auto';
    });

    // Add a visual indicator to the whole container
    if (timePickerContainer) {
        timePickerContainer.classList.toggle('controls-disabled', disabled);
    }
}

// Disable or enable schedule controls (when a schedule is active)
function disableScheduleControls(disabled) {
    const repeatDropdown = document.getElementById('schedule-repeat-select');
    const addSegmentBtn = document.getElementById('add-segment-btn');
    const repeatDropdownBtn = document.getElementById('repeat-dropdown-btn');
    const repeatLabel = document.querySelector('.repeat-label');
    const repeatSection = document.getElementById('schedule-repeat-section');

    // Disable repeat dropdown button and label
    if (repeatDropdownBtn) {
        repeatDropdownBtn.disabled = disabled;
        repeatDropdownBtn.style.pointerEvents = disabled ? 'none' : 'auto';
        repeatDropdownBtn.style.cursor = disabled ? 'default' : 'pointer';
        if (disabled) {
            repeatDropdownBtn.classList.add('repeat-dropdown-disabled');
        } else {
            repeatDropdownBtn.classList.remove('repeat-dropdown-disabled');
        }
    }

    // Style repeat label
    if (repeatLabel) {
        if (disabled) {
            repeatLabel.classList.add('repeat-label-disabled');
        } else {
            repeatLabel.classList.remove('repeat-label-disabled');
        }
    }

    // When schedule is active and repeat is "until date", grey out the date selector.
    // Use the persisted active schedule first so this updates immediately after starting.
    const dateWrapper = document.getElementById('repeat-date-wrapper');
    const dateInput = document.getElementById('repeat-date-input');
    if (dateWrapper && dateInput) {
        const activeSchedule = selectedBlocklistId && appData.schedules
            ? appData.schedules.find(s => s.blocklistId === selectedBlocklistId)
            : null;
        const isDateRepeatActive = !!(activeSchedule && activeSchedule.repeatType === 'date');
        const shouldDisableDateSelector = disabled && (isDateRepeatActive || scheduleRepeatType === 'date');

        if (shouldDisableDateSelector) {
            dateWrapper.classList.add('repeat-date-disabled');
            dateInput.disabled = true;
            dateInput.style.pointerEvents = 'none';
        } else {
            dateWrapper.classList.remove('repeat-date-disabled');
            dateInput.disabled = false;
            dateInput.style.pointerEvents = 'auto';
        }
    }

    // Disable Add button when schedule is active (activeScheduleSegmentCount > 0)
    if (addSegmentBtn) {
        const isScheduleActive = activeScheduleSegmentCount > 0;
        addSegmentBtn.disabled = isScheduleActive;
        addSegmentBtn.style.opacity = isScheduleActive ? '0.5' : '1';
        addSegmentBtn.style.pointerEvents = isScheduleActive ? 'none' : 'auto';
        addSegmentBtn.style.cursor = isScheduleActive ? 'not-allowed' : 'pointer';
    }

    // Disable controls on EXISTING segments (those within activeScheduleSegmentCount)
    document.querySelectorAll('.schedule-segment').forEach((segment, index) => {
        const isExistingSegment = index < activeScheduleSegmentCount;

        if (disabled && isExistingSegment) {
            // Disable this segment's controls
            segment.querySelectorAll('.time-part, .segment-day-toggle, .remove-segment-btn').forEach(el => {
                el.disabled = true;
                el.style.opacity = '0.5';
                el.style.pointerEvents = 'none';
            });
            segment.classList.add('segment-locked');
        } else {
            // Enable this segment's controls
            segment.querySelectorAll('.time-part, .segment-day-toggle, .remove-segment-btn').forEach(el => {
                el.disabled = false;
                el.style.opacity = '1';
                el.style.pointerEvents = 'auto';
            });
            segment.classList.remove('segment-locked');
        }
    });
}

// Initialize time picker with popover options (end time only)
function initializeTimeInputs() {
    const now = new Date();

    // Reset editing flag and load saved duration for this blocklist (or default to 60)
    userEditedEndTime = false;

    // Restore always-on mode preference for this blocklist
    const savedAlwaysOn = selectedBlocklistId && appData.settings?.alwaysOnMode?.[selectedBlocklistId];
    setAlwaysOnMode(savedAlwaysOn !== undefined ? !!savedAlwaysOn : true);

    if (selectedBlocklistId && appData.settings?.instantBlockDuration?.[selectedBlocklistId] !== undefined) {
        targetDurationMinutes = appData.settings.instantBlockDuration[selectedBlocklistId];
    } else {
        targetDurationMinutes = 60;
    }

    // End time = now + target duration
    const endTime = new Date(now.getTime() + targetDurationMinutes * 60 * 1000);
    selectedEndHour = endTime.getHours();
    selectedEndMinute = endTime.getMinutes();

    // Populate hour options (0-23) for end time only
    const hourContainer = document.getElementById('end-hour-options');
    if (hourContainer) {
        hourContainer.innerHTML = '';
        for (let h = 0; h < 24; h++) {
            const btn = document.createElement('button');
            btn.className = 'popover-option';
            btn.textContent = pad(h);
            btn.dataset.value = h;
            btn.dataset.type = 'hour';
            btn.dataset.target = 'end';
            btn.addEventListener('click', selectTimeOption);
            hourContainer.appendChild(btn);
        }
    }

    // Populate minute options (0-59) for end time only
    const minuteContainer = document.getElementById('end-minute-options');
    if (minuteContainer) {
        minuteContainer.innerHTML = '';
        for (let m = 0; m < 60; m++) {
            const btn = document.createElement('button');
            btn.className = 'popover-option';
            btn.textContent = pad(m);
            btn.dataset.value = m;
            btn.dataset.type = 'minute';
            btn.dataset.target = 'end';
            btn.addEventListener('click', selectTimeOption);
            minuteContainer.appendChild(btn);
        }
    }

    // Update displays
    updateTimeDisplay();
    handleTimeChange();

    // Initialize click handlers for schedule segment time buttons
    document.querySelectorAll('.schedule-block-panel .time-part').forEach(btn => {
        btn.addEventListener('click', handleScheduleTimeClick);
    });
}

// Update the time display buttons (end time only)
function updateTimeDisplay() {
    const endHourBtn = document.getElementById('end-hour-btn');
    const endMinuteBtn = document.getElementById('end-minute-btn');
    if (endHourBtn) endHourBtn.textContent = pad(selectedEndHour);
    if (endMinuteBtn) endMinuteBtn.textContent = pad(selectedEndMinute);

    // Update selected state in popovers
    updatePopoverSelection();
}

// Update selected state in popover options (end time only)
function updatePopoverSelection() {
    // Clear all selections
    document.querySelectorAll('.popover-option').forEach(btn => btn.classList.remove('selected'));

    // Mark current end time selections
    document.querySelectorAll('#end-hour-options .popover-option').forEach(btn => {
        if (parseInt(btn.dataset.value) === selectedEndHour) btn.classList.add('selected');
    });
    document.querySelectorAll('#end-minute-options .popover-option').forEach(btn => {
        if (parseInt(btn.dataset.value) === selectedEndMinute) btn.classList.add('selected');
    });
}

// Handle click on time part button
function handleTimePartClick(e) {
    e.stopPropagation();
    const btn = e.currentTarget;
    const type = btn.dataset.type;
    const target = btn.dataset.target;

    // Close all popovers first
    closeAllPopovers();

    // Open the relevant popover
    const popover = document.getElementById(`${target}-${type}-popover`);
    popover.classList.remove('hidden');
    btn.classList.add('active');

    // Scroll to selected option
    const selectedOption = popover.querySelector('.popover-option.selected');
    if (selectedOption) {
        selectedOption.scrollIntoView({ block: 'center', behavior: 'instant' });
    }
}



// Select a time option from popover (end time only)
function selectTimeOption(e) {
    e.stopPropagation();
    const btn = e.currentTarget;
    const value = parseInt(btn.dataset.value);
    const type = btn.dataset.type;

    // User manually edited end time
    userEditedEndTime = true;

    // Update end time values
    if (type === 'hour') selectedEndHour = value;
    else selectedEndMinute = value;

    // Update display and close popover
    updateTimeDisplay();
    closeAllPopovers();
    handleTimeChange();
}


// Close all popovers
function closeAllPopovers() {
    document.querySelectorAll('.time-popover').forEach(p => p.classList.add('hidden'));
    document.querySelectorAll('.time-part').forEach(btn => btn.classList.remove('active'));
}

// Handle clicks outside popovers
function handlePopoverOutsideClick(e) {
    if (!e.target.closest('.time-popover') && !e.target.closest('.time-part')) {
        closeAllPopovers();
    }
}

// Get start time as Date (always now, with seconds zeroed for consistent duration calculation)
function getStartTimeAsDate() {
    const now = new Date();
    now.setSeconds(0, 0); // Zero out seconds and milliseconds to match end time format
    return now;
}

// Get end time as Date
function getEndTimeAsDate() {
    const date = new Date();
    date.setHours(selectedEndHour, selectedEndMinute, 0, 0);
    return date;
}

// Get smart label for start time relative to now
function getStartTimeLabel(startTime) {
    const now = new Date();
    const diffMs = startTime.getTime() - now.getTime();
    const diffMins = Math.round(diffMs / 60000);

    if (diffMins <= 1) {
        return tSettings('modeNow');
    } else if (diffMins < 60) {
        return `in ${diffMins} min`;
    } else {
        const hours = Math.floor(diffMins / 60);
        const mins = diffMins % 60;
        if (mins === 0) {
            return `in ${hours}h`;
        } else {
            return `in ${hours}h ${mins}m`;
        }
    }
}

// Handle duration input change - update end time accordingly
function handleDurationInputChange() {
    const input = document.getElementById('duration-minutes-input');
    const val = input.value;

    // Don't clamp while typing - allow it to be empty
    if (val === '') return;

    let mins = parseInt(val);
    if (isNaN(mins) || mins <= 0) return;

    // Track the target duration and reset end time editing flag
    targetDurationMinutes = Math.min(mins, 99999);
    userEditedEndTime = false;

    // Only update end time if it's a valid positive number
    const startTime = getStartTimeAsDate();
    const newEndTime = new Date(startTime.getTime() + targetDurationMinutes * 60 * 1000);

    selectedEndHour = newEndTime.getHours();
    selectedEndMinute = newEndTime.getMinutes();

    updateTimeDisplay();
    updateDurationQuickBtns(targetDurationMinutes);
    handleTimeChange();
}

// Handle duration quick toggle button click
// Handle a click on any of the quick-select buttons. The "Always" button switches into
// always-on mode; the numeric duration buttons switch into timed mode and apply the new
// duration.
function handleDurationQuickBtn(e) {
    const btn = e.currentTarget || e.target.closest('.duration-quick-btn');
    if (!btn) return;

    if (btn.dataset.mode === 'always') {
        if (!isAlwaysOnMode) setAlwaysOnMode(true);
        // setAlwaysOnMode already refreshes the active button state via updateDurationQuickBtns.
        return;
    }

    // Timed selection: leave always-on mode if needed, then apply the new duration.
    if (isAlwaysOnMode) setAlwaysOnMode(false);

    const mins = parseInt(btn.dataset.mins);
    const input = document.getElementById('duration-minutes-input');
    if (input) input.value = mins;

    // Track the target duration and reset end time editing flag
    targetDurationMinutes = mins;
    userEditedEndTime = false;

    // Calculate new end time based on start + duration
    const startTime = getStartTimeAsDate();
    const newEndTime = new Date(startTime.getTime() + mins * 60 * 1000);

    selectedEndHour = newEndTime.getHours();
    selectedEndMinute = newEndTime.getMinutes();

    updateTimeDisplay();
    updateDurationQuickBtns(mins);
    handleTimeChange();
}

// Update quick-select button active states. In always-on mode the "Always" button is the
// only active one; in timed mode the button matching durationMinutes (if any) is active.
function updateDurationQuickBtns(durationMinutes) {
    document.querySelectorAll('.duration-quick-btn').forEach(btn => {
        if (btn.dataset.mode === 'always') {
            btn.classList.toggle('active', isAlwaysOnMode);
        } else {
            const btnMins = parseInt(btn.dataset.mins);
            btn.classList.toggle('active', !isAlwaysOnMode && btnMins === durationMinutes);
        }
    });
}

// ========================================
// SCHEDULE MODE FUNCTIONS
// ========================================

// Get default schedule segments based on current time
// Start at the current hour (floor), end 2 hours later, selected on every day of the week.
function getDefaultScheduleSegments() {
    const now = new Date();
    const startHour = now.getHours();
    const endHour = (startHour + 2) % 24;
    return [
        { startHour, startMinute: 0, endHour, endMinute: 0, days: [0, 1, 2, 3, 4, 5, 6] }
    ];
}

// Switch between timed and always-on modes for instant blocks
function setAlwaysOnMode(alwaysOn) {
    isAlwaysOnMode = alwaysOn;

    // Show/hide timed controls vs always-on message
    const timedControls = document.getElementById('timed-controls');
    const alwaysOnMessage = document.getElementById('always-on-message');
    if (timedControls) timedControls.classList.toggle('hidden', alwaysOn);
    if (alwaysOnMessage) alwaysOnMessage.classList.toggle('hidden', !alwaysOn);

    // Reflect the mode change in the quick-select row (highlight "Always" or the matching duration).
    updateDurationQuickBtns(targetDurationMinutes);

    // Save preference per blocklist
    if (selectedBlocklistId) {
        if (!appData.settings) appData.settings = {};
        if (!appData.settings.alwaysOnMode) appData.settings.alwaysOnMode = {};
        if (appData.settings.alwaysOnMode[selectedBlocklistId] !== alwaysOn) {
            appData.settings.alwaysOnMode[selectedBlocklistId] = alwaysOn;
            saveData();
        }
    }

    // Update calendar preview and button state
    handleTimeChange();

    // Update window height after layout change
    setTimeout(() => updateWindowHeight(), 50);
}

// Switch between instant and schedule modes
function setScheduleMode(isSchedule) {
    isScheduleMode = isSchedule;

    // Persist this tab choice per blocklist so it restores when switching back
    if (selectedBlocklistId && appData.settings) {
        if (!appData.settings.preferredStartMode) appData.settings.preferredStartMode = {};
        if (appData.settings.preferredStartMode[selectedBlocklistId] !== isSchedule) {
            appData.settings.preferredStartMode[selectedBlocklistId] = isSchedule;
            saveData();
        }
    }

    // Update tab active states
    document.getElementById('instant-mode-tab').classList.toggle('active', !isSchedule);
    document.getElementById('schedule-mode-tab').classList.toggle('active', isSchedule);

    // Update section heading
    const heading = document.querySelector('#scheduler-section .section-header h2');
    if (heading) {
        heading.textContent = tSettings('mainStartBlockTitle');
    }

    // Toggle panels
    const instantPanel = document.getElementById('instant-block-panel');
    const schedulePanel = document.getElementById('schedule-block-panel');
    const startBlockBtn = document.getElementById('start-block-btn');
    const startScheduleBtn = document.getElementById('start-schedule-btn');

    if (isSchedule) {
        // Check if selected blocklist has an existing schedule
        const existingSchedule = selectedBlocklistId && appData.schedules
            ? appData.schedules.find(s => s.blocklistId === selectedBlocklistId)
            : null;

        if (existingSchedule && existingSchedule.segments) {
            // Load existing schedule segments (locked)
            scheduleSegments = existingSchedule.segments.map(seg => ({ ...seg }));
            activeScheduleSegmentCount = getCommittedScheduleSegmentCount(existingSchedule);
            scheduleRepeatType = existingSchedule.repeatType || 'no';
            scheduleRepeatDate = existingSchedule.repeatDate;

            // Also load any pending (new) segments that were added but not yet committed
            const pendingSegments = appData.settings?.pendingScheduleSegments?.[selectedBlocklistId];
            if (pendingSegments && pendingSegments.length > 0) {
                const cleanedPendingSegments = pendingSegments.filter(seg =>
                    !existingSchedule.segments.some(existingSeg => areSegmentsEqual(existingSeg, seg))
                );
                if (cleanedPendingSegments.length > 0) {
                    // Append pending segments to the existing locked segments
                    scheduleSegments.push(...cleanedPendingSegments.map(seg => ({ ...seg })));
                    const currentPending = JSON.stringify(appData.settings.pendingScheduleSegments[selectedBlocklistId] || []);
                    const nextPending = JSON.stringify(cleanedPendingSegments);
                    if (currentPending !== nextPending) {
                        appData.settings.pendingScheduleSegments[selectedBlocklistId] = cleanedPendingSegments.map(seg => ({ ...seg }));
                        saveData();
                    }
                } else {
                    if (appData.settings.pendingScheduleSegments[selectedBlocklistId]) {
                        delete appData.settings.pendingScheduleSegments[selectedBlocklistId];
                        saveData();
                    }
                }
            }
        } else {
            // Check for pending (unsaved) segments for this blocklist
            const pendingSegments = appData.settings?.pendingScheduleSegments?.[selectedBlocklistId];
            if (pendingSegments && pendingSegments.length > 0) {
                scheduleSegments = pendingSegments.map(seg => ({ ...seg }));
            } else {
                // Reset schedule segments to fresh default times
                scheduleSegments = getDefaultScheduleSegments();
            }
            activeScheduleSegmentCount = 0;
        }
        rebuildScheduleSegments();

        instantPanel.classList.add('hidden');
        schedulePanel.classList.remove('hidden');
        startBlockBtn.classList.add('hidden');
        if (selectedBlocklistId) {
            startScheduleBtn.classList.remove('hidden');
            updateScheduleButtonState();
        }
    } else {
        instantPanel.classList.remove('hidden');
        schedulePanel.classList.add('hidden');
        startScheduleBtn.classList.add('hidden');
        if (selectedBlocklistId) {
            startBlockBtn.classList.remove('hidden');
            const blocklist = appData.blocklists.find(bl => bl.id === selectedBlocklistId);

            // Re-evaluate pause button visibility for Now mode
            const pauseBtn = document.getElementById('pause-block-btn');
            const now = Date.now();
            const activeBlock = appData.activeBlocks.find(b =>
                b.blocklistId === selectedBlocklistId &&
                b.startTime <= now &&
                b.endTime > now
            );
            if (activeBlock) {
                if (pauseBtn) {
                    pauseBtn.classList.remove('hidden');
                    updatePauseButtonAppearance(!!activeBlock.isPaused);
                }

                // Also update button to show Stop state
                const btnLabel = startBlockBtn.querySelector('.btn-label');
                const btnIcon = startBlockBtn.querySelector('svg');
                setBtnActionLabel(btnLabel, 'Stop Block:');
                setStartBtnBlocklistInfo(startBlockBtn, blocklist);
                startBlockBtn.classList.add('stop-block');
                startBlockBtn.disabled = false;
                startBlockBtn.dataset.activeBlockId = activeBlock.id;
                if (btnIcon) {
                    btnIcon.innerHTML = `
                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                        <path d="M7 11V7a5 5 0 0 1 9.9-1"></path>
                    `;
                }
                disableTimeControls(true);

                // Keep the info message visible for active always-on blocks.
                const alwaysOnMsg = document.getElementById('always-on-message');
                if (alwaysOnMsg) alwaysOnMsg.classList.toggle('hidden', !isBlockAlwaysOn(activeBlock));
            } else {
                if (pauseBtn) pauseBtn.classList.add('hidden');
                startBlockBtn.classList.remove('stop-block');
                delete startBlockBtn.dataset.activeBlockId;
                setStartBtnBlocklistInfo(startBlockBtn, blocklist);
            }
        }
    }

    // Toggle schedule-mode class on day-tracks for click-to-create
    document.querySelectorAll('.day-track').forEach(track => {
        track.classList.toggle('schedule-mode', isSchedule);
    });

    // Update calendar preview
    handleTimeChange();
}

// Toggle Repeat dropdown visibility
function toggleRepeatDropdown(e) {
    e.stopPropagation();

    // Don't allow opening dropdown when schedule is active
    if (activeScheduleSegmentCount > 0) return;

    // Also check if button is disabled
    const repeatDropdownBtn = document.getElementById('repeat-dropdown-btn');
    if (repeatDropdownBtn && repeatDropdownBtn.disabled) {
        return;
    }

    const menu = document.getElementById('repeat-dropdown-menu');
    if (!menu) return;

    const isHidden = menu.classList.contains('hidden');
    menu.classList.toggle('hidden');

    if (isHidden) {
        // Close on outside click
        setTimeout(() => {
            document.addEventListener('click', function closeMenu(evt) {
                if (!menu.contains(evt.target)) {
                    menu.classList.add('hidden');
                    document.removeEventListener('click', closeMenu);
                }
            });
        }, 10);
    }
}

// Handle Repeat option selection
function handleRepeatOptionClick(e) {
    // Don't allow changing repeat options when schedule is active
    if (activeScheduleSegmentCount > 0) {
        // Close dropdown silently
        const menu = document.getElementById('repeat-dropdown-menu');
        if (menu) menu.classList.add('hidden');
        return;
    }

    const value = e.target.dataset.value;
    const menu = document.getElementById('repeat-dropdown-menu');
    const btnText = document.getElementById('repeat-dropdown-text');
    const dateInput = document.getElementById('repeat-date-input');

    scheduleRepeatType = value;

    // Update dropdown text
    if (btnText) {
        if (value === 'no') {
            btnText.textContent = tSettings('repeatNo');
        } else if (value === 'forever') {
            btnText.textContent = tSettings('repeatForever');
        } else {
            btnText.textContent = tSettings('repeatUntilDate');
        }
    }

    // Update active state
    document.querySelectorAll('.repeat-option').forEach(opt => {
        opt.classList.toggle('active', opt.dataset.value === value);
    });

    // Show/hide date input wrapper
    const dateWrapper = document.getElementById('repeat-date-wrapper');
    const dateOverlay = document.getElementById('repeat-date-overlay');
    if (dateInput && dateWrapper) {
        if (value === 'date') {
            dateWrapper.classList.remove('hidden');
            // Set default date to 6 days from now (completing a full week including today)
            if (!scheduleRepeatDate) {
                const defaultDate = new Date();
                defaultDate.setDate(defaultDate.getDate() + 6);
                scheduleRepeatDate = defaultDate;
                dateInput.value = formatDateForInput(defaultDate);
            }
            // Update overlay with formatted date
            if (dateOverlay) {
                dateOverlay.textContent = formatDateForDisplay(scheduleRepeatDate);
            }
        } else {
            dateWrapper.classList.add('hidden');
            scheduleRepeatDate = null;
        }
    }

    // Close menu
    if (menu) menu.classList.add('hidden');

    // Update preview
    handleTimeChange();
}

// Handle Repeat date change
function handleRepeatDateChange(e) {
    const dateStr = e.target.value;
    if (dateStr) {
        scheduleRepeatDate = new Date(dateStr + 'T23:59:59');
        // Update the overlay with formatted date
        const dateOverlay = document.getElementById('repeat-date-overlay');
        if (dateOverlay) {
            dateOverlay.textContent = formatDateForDisplay(scheduleRepeatDate);
        }
        // Update preview
        handleTimeChange();
    }
}

// Format date for input element (YYYY-MM-DD)
function formatDateForInput(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function localDateKey(date) {
    return formatDateForInput(date);
}

function parseLocalDateKey(dateKey) {
    if (!dateKey) return null;
    const [year, month, day] = dateKey.split('-').map(Number);
    if (![year, month, day].every(Number.isFinite)) return null;
    return new Date(year, month - 1, day);
}

// Format date for display (e.g., "3 Feb 2026")
function formatDateForDisplay(date) {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const day = date.getDate();
    const month = months[date.getMonth()];
    const year = date.getFullYear();
    return `${day} ${month} ${year}`;
}

function isScheduleSegmentActiveNow(schedule, nowDate = new Date()) {
    if (!schedule || !schedule.segments || schedule.segments.length === 0) return false;
    const nowMs = nowDate.getTime();
    if (isSchedulePausedNow(schedule, nowMs)) return false;
    if (isNonRepeatingSchedule(schedule)) {
        return resolveOneShotOccurrences(schedule).some(occurrence => {
            const startMs = occurrence.start.getTime();
            const endMs = occurrence.end.getTime();
            return nowMs >= startMs && nowMs < endMs;
        });
    }
    const currentDay = nowDate.getDay() === 0 ? 6 : nowDate.getDay() - 1;
    const currentMins = nowDate.getHours() * 60 + nowDate.getMinutes();
    return schedule.segments.some(seg => {
        const startMins = seg.startHour * 60 + seg.startMinute;
        const endMins = seg.endHour * 60 + seg.endMinute;
        if (startMins === endMins) return seg.days.includes(currentDay);
        if (endMins > startMins) return seg.days.includes(currentDay) && currentMins >= startMins && currentMins < endMins;
        const yesterdayDay = currentDay === 0 ? 6 : currentDay - 1;
        return (seg.days.includes(currentDay) && currentMins >= startMins) || (seg.days.includes(yesterdayDay) && currentMins < endMins);
    });
}

function getCommittedScheduleSegmentCount(schedule) {
    return schedule && schedule.segments ? schedule.segments.length : 0;
}

function areSegmentsEqual(a, b) {
    if (!a || !b) return false;
    const aDays = Array.isArray(a.days) ? [...a.days].sort((x, y) => x - y) : [];
    const bDays = Array.isArray(b.days) ? [...b.days].sort((x, y) => x - y) : [];
    return a.startHour === b.startHour &&
        a.startMinute === b.startMinute &&
        a.endHour === b.endHour &&
        a.endMinute === b.endMinute &&
        JSON.stringify(aDays) === JSON.stringify(bDays);
}

// Update schedule button enabled state
function updateScheduleButtonState() {
    const startScheduleBtn = document.getElementById('start-schedule-btn');
    if (!startScheduleBtn) return;

    // Check if selected blocklist has an active schedule
    const activeSchedule = selectedBlocklistId && appData.schedules
        ? appData.schedules.find(s => s.blocklistId === selectedBlocklistId)
        : null;
    const now = Date.now();
    const scheduleIsPaused = isSchedulePausedNow(activeSchedule, now);
    const scheduleIsActiveNow = !!(activeSchedule && isScheduleSegmentActiveNow(activeSchedule));
    const scheduleIsFunctionallyActive = scheduleIsPaused || scheduleIsActiveNow;

    const blocklist = selectedBlocklistId
        ? appData.blocklists.find(bl => bl.id === selectedBlocklistId)
        : null;

    const btnLabel = startScheduleBtn.querySelector('.btn-label');
    const btnIcon = startScheduleBtn.querySelector('svg');

    // Check if there are new segments (beyond the locked count)
    const committedSegmentCount = getCommittedScheduleSegmentCount(activeSchedule);
    const hasNewSegments = activeSchedule && scheduleSegments.length > committedSegmentCount;

    // Show/hide pause button for started schedules (pause is allowed even when no segment is active)
    const pauseBtn = document.getElementById('pause-block-btn');
    if (pauseBtn) {
        if (activeSchedule && activeSchedule.segments) {
            const isPaused = activeSchedule.isPaused && activeSchedule.pauseEndTime > now;

            if (isPaused) {
                // Schedule is paused — show Resume button
                pauseBtn.classList.remove('hidden');
                updatePauseButtonAppearance(true);
            } else {
                pauseBtn.classList.remove('hidden');
                updatePauseButtonAppearance(false);
            }
        } else {
            pauseBtn.classList.add('hidden');
        }
    }

    if (activeSchedule && !hasNewSegments) {
        // Active schedule with no pending changes - show Stop button (grey/secondary style)
        setBtnActionLabel(btnLabel, tSettings('stopScheduleButton'));
        setStartBtnBlocklistInfo(startScheduleBtn, blocklist);
        startScheduleBtn.classList.add('stop-schedule');
        startScheduleBtn.classList.remove('edit-schedule');
        startScheduleBtn.disabled = false;
        startScheduleBtn.dataset.activeScheduleId = activeSchedule.id || activeSchedule.blocklistId;



        // Change to unlock icon
        if (btnIcon) {
            btnIcon.innerHTML = `
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                <path d="M7 11V7a5 5 0 0 1 9.9-1"></path>
            `;
        }

        // Disable controls for existing segments
        disableScheduleControls(true);
    } else if (activeSchedule && hasNewSegments) {
        // Existing schedule not currently active (or has pending changes) - show Edit button
        setBtnActionLabel(btnLabel, tSettings('editScheduleButton'));
        setStartBtnBlocklistInfo(startScheduleBtn, blocklist);
        startScheduleBtn.classList.remove('stop-schedule');
        startScheduleBtn.classList.add('edit-schedule');
        startScheduleBtn.disabled = false;
        startScheduleBtn.dataset.activeScheduleId = activeSchedule.id || activeSchedule.blocklistId;

        // Calendar icon for edit mode
        if (btnIcon) {
            btnIcon.innerHTML = `
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                <line x1="16" y1="2" x2="16" y2="6"></line>
                <line x1="8" y1="2" x2="8" y2="6"></line>
                <line x1="3" y1="10" x2="21" y2="10"></line>
            `;
        }

        // Controls are mixed - existing segments disabled, new segments enabled
        disableScheduleControls(true);
    } else {
        // No active schedule - show Start button (normal)
        setBtnActionLabel(btnLabel, tSettings('startScheduleButton'));
        setStartBtnBlocklistInfo(startScheduleBtn, blocklist);
        startScheduleBtn.classList.remove('stop-schedule');
        startScheduleBtn.classList.remove('edit-schedule');
        delete startScheduleBtn.dataset.activeScheduleId;



        // Lock icon
        if (btnIcon) {
            btnIcon.innerHTML = `
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
            `;
        }

        // Enable all controls
        disableScheduleControls(false);
    }

    // Enable button if blocklist is selected
    const isValid = selectedBlocklistId;
    startScheduleBtn.disabled = !isValid;
}

// Add a new time segment
function addScheduleSegment() {
    // Don't allow adding segments when schedule is active
    if (activeScheduleSegmentCount > 0) {
        return;
    }

    // Get the previous segment's end time, round up to next full hour for new start
    const prevSegment = scheduleSegments[scheduleSegments.length - 1];
    let newStartHour;
    if (prevSegment) {
        // Start 1 hour after previous end, round up if minutes present
        newStartHour = prevSegment.endMinute > 0
            ? (prevSegment.endHour + 2) % 24
            : (prevSegment.endHour + 1) % 24;
    } else {
        newStartHour = 14;
    }
    const newStartMinute = 0; // Always start on the hour
    // Default to 2 hours after start
    const newEndHour = (newStartHour + 2) % 24;
    const newEndMinute = 0;

    // New segments default to every day of the week, matching the initial schedule default.
    scheduleSegments.push({
        startHour: newStartHour,
        startMinute: newStartMinute,
        endHour: newEndHour,
        endMinute: newEndMinute,
        days: [0, 1, 2, 3, 4, 5, 6]
    });

    // Rebuild all segments to ensure consistent rendering
    rebuildScheduleSegments();

    // Re-apply disabled state to locked segments (if schedule is active)
    if (activeScheduleSegmentCount > 0) {
        disableScheduleControls(true);
    }

    // Update calendar preview and button state
    handleTimeChange();
    updateScheduleButtonState();
}

// Handle clicking a day toggle within a segment
function handleSegmentDayToggle(segmentIndex, dayIndex, btn) {
    // Don't allow toggling days on locked segments (part of active schedule)
    if (segmentIndex < activeScheduleSegmentCount) return;

    const segment = scheduleSegments[segmentIndex];
    if (!segment) return;

    // Toggle the day in the segment's days array
    const dayIdx = segment.days.indexOf(dayIndex);
    if (dayIdx === -1) {
        segment.days.push(dayIndex);
        segment.days.sort((a, b) => a - b);
        btn.classList.add('active');
    } else {
        // Allow removing the day (segment with no days just won't apply)
        segment.days.splice(dayIdx, 1);
        btn.classList.remove('active');
    }

    // Update preview and button state
    handleTimeChange();
    updateScheduleButtonState();
}

// Remove a time segment
function removeScheduleSegment(index) {
    // Don't allow removing locked segments (part of active schedule)
    if (index < activeScheduleSegmentCount) return;

    if (scheduleSegments.length <= 1) return; // Always keep at least one

    // Remove from state
    scheduleSegments.splice(index, 1);

    // Rebuild DOM (simpler than updating indices)
    rebuildScheduleSegments();

    // Update calendar preview
    handleTimeChange();
}

// Sort schedule segments chronologically by start time
function sortScheduleSegments() {
    scheduleSegments.sort((a, b) => {
        // Compare by start hour first, then by start minute
        const aMinutes = a.startHour * 60 + a.startMinute;
        const bMinutes = b.startHour * 60 + b.startMinute;
        return aMinutes - bMinutes;
    });
}

// Rebuild schedule segments DOM from state
function rebuildScheduleSegments() {
    // Sort chronologically before rebuilding
    sortScheduleSegments();

    const container = document.getElementById('schedule-segments');
    container.innerHTML = '';

    const dayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

    scheduleSegments.forEach((seg, index) => {
        const segment = document.createElement('div');
        segment.className = 'schedule-segment';
        segment.dataset.segmentIndex = index;

        const showRemove = scheduleSegments.length > 1;
        const segmentDays = seg.days || [];

        // Generate day toggles HTML
        const dayTogglesHtml = dayLabels.map((label, i) =>
            `<button type="button" class="segment-day-toggle${segmentDays.includes(i) ? ' active' : ''}" data-day="${i}">${label}</button>`
        ).join('');

        // Only show labels on the first segment
        const showLabels = index === 0;

        segment.innerHTML = `
            <div class="segment-row">
                <div class="time-pickers-row">
                    <div class="time-picker-group">
                        ${showLabels ? '<label class="time-label">Start</label>' : ''}
                        <div class="time-picker-row">
                            <div class="time-display schedule-start-display">
                                <div class="time-part-wrapper">
                                    <button class="time-part schedule-hour-btn" data-type="hour" data-target="schedule-start-${index}">${String(seg.startHour).padStart(2, '0')}</button>
                                </div>
                                <span class="time-colon">:</span>
                                <div class="time-part-wrapper">
                                    <button class="time-part schedule-minute-btn" data-type="minute" data-target="schedule-start-${index}">${String(seg.startMinute).padStart(2, '0')}</button>
                                </div>
                            </div>
                        </div>
                    </div>
                    <span class="time-separator">→</span>
                    <div class="time-picker-group">
                        ${showLabels ? '<label class="time-label">End</label>' : ''}
                        <div class="time-picker-row">
                            <div class="time-display schedule-end-display">
                                <div class="time-part-wrapper">
                                    <button class="time-part schedule-hour-btn" data-type="hour" data-target="schedule-end-${index}">${String(seg.endHour).padStart(2, '0')}</button>
                                </div>
                                <span class="time-colon">:</span>
                                <div class="time-part-wrapper">
                                    <button class="time-part schedule-minute-btn" data-type="minute" data-target="schedule-end-${index}">${String(seg.endMinute).padStart(2, '0')}</button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="segment-days-group">
                    ${showLabels ? '<label class="time-label">Days</label>' : ''}
                    <div class="segment-days" data-segment-index="${index}">
                        ${dayTogglesHtml}
                    </div>
                </div>
                ${showRemove ? `
                    <button type="button" class="remove-segment-btn" data-segment-index="${index}">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                            stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                    </button>
                ` : ''}
            </div>
        `;

        container.appendChild(segment);

        // Add click handlers for time parts
        segment.querySelectorAll('.time-part').forEach(btn => {
            btn.addEventListener('click', handleScheduleTimeClick);
        });

        // Add click handlers for day toggles
        segment.querySelectorAll('.segment-day-toggle').forEach(btn => {
            btn.addEventListener('click', () => {
                const dayIndex = parseInt(btn.dataset.day);
                handleSegmentDayToggle(index, dayIndex, btn);
            });
        });

        // Add click handler for remove button
        const removeBtn = segment.querySelector('.remove-segment-btn');
        if (removeBtn) {
            removeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const idx = parseInt(removeBtn.dataset.segmentIndex);
                removeScheduleSegment(idx);
            });
        }
    });
}

// Handle schedule time button click (show popover)
function handleScheduleTimeClick(e) {
    e.stopPropagation();
    const btn = e.target;
    const type = btn.dataset.type; // 'hour' or 'minute'
    const target = btn.dataset.target; // e.g., 'schedule-start-0' or 'schedule-end-1'

    // Parse target
    const parts = target.split('-');
    const isStart = parts[1] === 'start';
    const segmentIndex = parseInt(parts[2]);

    // Create and show popover for time selection
    showScheduleTimePopover(btn, type, isStart, segmentIndex);
}

// Show time popover for schedule time selection
function showScheduleTimePopover(btn, type, isStart, segmentIndex) {
    // Remove any existing schedule popovers
    document.querySelectorAll('.schedule-time-popover').forEach(p => p.remove());

    const popover = document.createElement('div');
    popover.className = 'time-popover schedule-time-popover';

    const scroll = document.createElement('div');
    scroll.className = 'popover-scroll';

    const segment = scheduleSegments[segmentIndex];
    const currentValue = type === 'hour'
        ? (isStart ? segment.startHour : segment.endHour)
        : (isStart ? segment.startMinute : segment.endMinute);

    const max = type === 'hour' ? 24 : 60;
    const step = type === 'hour' ? 1 : 5;
    let suppressOptionClickUntil = 0;
    let touchStartY = null;
    let touchStartScrollTop = 0;
    let isTouchDragging = false;
    let lastTouchY = null;
    let lastTouchTime = 0;
    let touchVelocity = 0;
    let momentumFrame = null;

    function stopMomentum() {
        if (momentumFrame != null) {
            cancelAnimationFrame(momentumFrame);
            momentumFrame = null;
        }
    }

    function startMomentum(initialVelocity) {
        stopMomentum();
        let velocity = initialVelocity;
        let lastFrameTime = performance.now();

        const tick = (now) => {
            const dt = Math.min(32, now - lastFrameTime);
            lastFrameTime = now;

            scroll.scrollTop -= velocity * dt;
            velocity *= 0.95;

            if (Math.abs(velocity) < 0.02) {
                momentumFrame = null;
                return;
            }

            const atTop = scroll.scrollTop <= 0;
            const atBottom = scroll.scrollTop >= scroll.scrollHeight - scroll.clientHeight;
            if ((atTop && velocity > 0) || (atBottom && velocity < 0)) {
                momentumFrame = null;
                return;
            }

            momentumFrame = requestAnimationFrame(tick);
        };

        momentumFrame = requestAnimationFrame(tick);
    }

    // On iPad/iPhone, dragging inside a scrollable list of buttons can be
    // interpreted as taps unless we explicitly suppress selection right after
    // a scroll gesture.
    scroll.addEventListener('touchstart', (e) => {
        stopMomentum();
        touchStartY = e.touches[0]?.clientY ?? null;
        touchStartScrollTop = scroll.scrollTop;
        isTouchDragging = false;
        lastTouchY = touchStartY;
        lastTouchTime = performance.now();
        touchVelocity = 0;
    }, { passive: true });

    scroll.addEventListener('touchmove', (e) => {
        const currentY = e.touches[0]?.clientY;
        if (touchStartY != null && currentY != null) {
            const deltaY = currentY - touchStartY;
            const now = performance.now();
            const elapsed = Math.max(1, now - lastTouchTime);
            if (lastTouchY != null) {
                touchVelocity = (currentY - lastTouchY) / elapsed;
            }
            lastTouchY = currentY;
            lastTouchTime = now;
            if (Math.abs(deltaY) > 6) {
                isTouchDragging = true;
                suppressOptionClickUntil = Date.now() + 250;
                // Drive the scrolling ourselves so slow finger drags work
                // reliably in iPad WKWebView even though the children are buttons.
                scroll.scrollTop = touchStartScrollTop - deltaY;
                e.preventDefault();
            }
        }
    }, { passive: false });

    scroll.addEventListener('touchend', () => {
        if (isTouchDragging) {
            suppressOptionClickUntil = Date.now() + 250;
            if (Math.abs(touchVelocity) > 0.08) {
                startMomentum(touchVelocity);
            }
        }
        touchStartY = null;
        isTouchDragging = false;
        lastTouchY = null;
    }, { passive: true });

    scroll.addEventListener('touchcancel', () => {
        touchStartY = null;
        isTouchDragging = false;
        lastTouchY = null;
    }, { passive: true });

    for (let i = 0; i < max; i += step) {
        const option = document.createElement('button');
        option.className = 'popover-option' + (i === currentValue ? ' selected' : '');
        option.textContent = String(i).padStart(2, '0');
        option.addEventListener('click', (e) => {
            e.stopPropagation(); // Prevent blocklist deselection
            if (Date.now() < suppressOptionClickUntil) {
                return;
            }

            // Update state
            if (type === 'hour') {
                if (isStart) segment.startHour = i;
                else segment.endHour = i;
            } else {
                if (isStart) segment.startMinute = i;
                else segment.endMinute = i;
            }

            // Update button text
            btn.textContent = String(i).padStart(2, '0');

            // Close popover
            popover.remove();

            // Update calendar preview
            handleTimeChange();
        });
        scroll.appendChild(option);
    }

    popover.appendChild(scroll);
    btn.parentElement.appendChild(popover);

    // Scroll to current value
    const activeOption = scroll.querySelector('.selected');
    if (activeOption) {
        activeOption.scrollIntoView({ block: 'center' });
    }

    // Close on outside click
    setTimeout(() => {
        document.addEventListener('click', function closePopover(e) {
            if (!popover.contains(e.target) && e.target !== btn) {
                popover.remove();
                document.removeEventListener('click', closePopover);
            }
        });
    }, 10);
}

// Start a schedule - show confirmation modal first
async function startSchedule() {
    if (!selectedBlocklistId) return;

    const blocklist = appData.blocklists.find(bl => bl.id === selectedBlocklistId);
    if (!blocklist) return;

    // Check if this blocklist already has an active schedule
    const activeSchedule = appData.schedules
        ? appData.schedules.find(s => s.blocklistId === selectedBlocklistId)
        : null;

    // Check if there are new segments beyond the locked count
    const committedSegmentCount = getCommittedScheduleSegmentCount(activeSchedule);
    const hasNewSegments = activeSchedule && scheduleSegments.length > committedSegmentCount;
    if (activeSchedule && !hasNewSegments) {
        // Stop mode - open override dialog for the schedule
        openScheduleOverrideModal(activeSchedule);
        return;
    }

    if (!ensureIOSBlocklistSelectionReady(blocklist, 'starting this schedule')) return;

    if (activeSchedule && hasNewSegments) {
        // Edit mode - show confirmation for adding new segments only
        const newSegments = scheduleSegments.slice(committedSegmentCount);
        showScheduleEditConfirmModal(blocklist, activeSchedule, newSegments);
        return;
    }

    // Normal start mode - check that at least one segment has days
    const hasAnyDays = scheduleSegments.some(seg => seg.days && seg.days.length > 0);
    if (!hasAnyDays) return;

    // Show confirmation modal for new schedule
    showScheduleConfirmModal(blocklist);
}

// Show schedule confirmation modal
function showScheduleConfirmModal(blocklist) {
    const dayNames = tSettings('dayAbbrevMon0');

    // Blocklist name
    document.getElementById('schedule-confirm-name').textContent = blocklist.name;

    // Websites
    const websites = blocklist.websites || [];
    const websitesRow = document.getElementById('schedule-websites-row');
    const websitesEl = document.getElementById('schedule-confirm-websites');
    const showAllWebsitesBtn = document.getElementById('show-all-schedule-websites');

    if (websites.length === 0) {
        websitesRow.classList.add('hidden');
    } else {
        websitesRow.classList.remove('hidden');
        const maxShow = 3;
        if (websites.length <= maxShow) {
            websitesEl.textContent = websites.join(', ');
            showAllWebsitesBtn.classList.add('hidden');
        } else {
            websitesEl.textContent = websites.slice(0, maxShow).join(', ') + '...';
            websitesEl.dataset.fullList = websites.join(', ');
            showAllWebsitesBtn.classList.remove('hidden');
            showAllWebsitesBtn.onclick = () => {
                websitesEl.textContent = websites.join(', ');
                showAllWebsitesBtn.classList.add('hidden');
            };
        }
    }

    // Apps
    const apps = getBlocklistDisplayApps(blocklist);
    const appsRow = document.getElementById('schedule-apps-row');
    const appsEl = document.getElementById('schedule-confirm-apps');
    const showAllAppsBtn = document.getElementById('show-all-schedule-apps');

    if (apps.length === 0) {
        appsRow.classList.add('hidden');
    } else {
        appsRow.classList.remove('hidden');
        const maxShow = 3;
        if (apps.length <= maxShow) {
            appsEl.textContent = apps.join(', ');
            showAllAppsBtn.classList.add('hidden');
        } else {
            appsEl.textContent = apps.slice(0, maxShow).join(', ') + '...';
            showAllAppsBtn.classList.remove('hidden');
            showAllAppsBtn.onclick = () => {
                appsEl.textContent = apps.join(', ');
                showAllAppsBtn.classList.add('hidden');
            };
        }
    }

    // Schedule segments
    const segmentsEl = document.getElementById('schedule-confirm-segments');
    segmentsEl.innerHTML = '';

    scheduleSegments.forEach((seg, index) => {
        const segDays = (seg.days || []).map(d => dayNames[d]).join(', ');
        const startTime = `${String(seg.startHour).padStart(2, '0')}:${String(seg.startMinute).padStart(2, '0')}`;
        const endTime = `${String(seg.endHour).padStart(2, '0')}:${String(seg.endMinute).padStart(2, '0')}`;

        const row = document.createElement('div');
        row.className = 'schedule-segment-row';
        row.innerHTML = `
            <span class="segment-time">${startTime} → ${endTime}</span>
            <span class="segment-days">${segDays || tSettings('noDaysSelected')}</span>
        `;
        segmentsEl.appendChild(row);
    });

    // Repeat info
    const repeatEl = document.getElementById('schedule-confirm-repeat');
    if (scheduleRepeatType === 'forever') {
        repeatEl.textContent = tSettings('repeatForever');
    } else if (scheduleRepeatType === 'date' && scheduleRepeatDate) {
        repeatEl.textContent = `${tSettings('repeatUntilDate')} ${scheduleRepeatDate.toLocaleDateString(tSettings('locale'))}`;
    } else {
        repeatEl.textContent = tSettings('repeatNo');
    }

    // Override info
    const difficulty = blocklist.overrideDifficulty || { type: 'random-words', count: 50 };
    const charCount = difficulty.count || 50;
    const charsPerMinute = 100;
    const estimatedMinutes = Math.ceil(charCount / charsPerMinute);
    const charWord = charCount === 1 ? 'character' : 'characters';

    let overrideText;
    if (difficulty.type === 'random') {
        overrideText = `Type ${charCount} random ${charWord} (letters and numbers) exactly as shown (~${estimatedMinutes} min).`;
    } else {
        overrideText = `Type ${charCount} ${charWord} (displayed as random words) exactly as shown (~${estimatedMinutes} min).`;
    }

    document.getElementById('schedule-confirm-override-text').textContent = overrideText;

    // Show modal
    document.getElementById('start-schedule-confirm-modal').classList.remove('hidden');
}

// Close schedule confirmation modal
function closeScheduleConfirmModal() {
    document.getElementById('start-schedule-confirm-modal').classList.add('hidden');
}

// Open override modal for stopping a schedule. Schedules now stop wholesale, identically
// to one-off blocks (no per-instance skip).
function openScheduleOverrideModal(schedule) {
    window.overrideScheduleId = schedule.id || schedule.blocklistId;

    const blocklist = appData.blocklists.find(bl => bl.id === schedule.blocklistId);
    const blocklistName = blocklist ? blocklist.name : 'Schedule';

    const difficulty = blocklist?.overrideDifficulty || { type: 'random-words', count: 50 };
    const charCount = difficulty.count || 50;
    const isRandom = difficulty.type === 'gibberish';

    challengeText = isRandom ? generateGibberish(charCount) : generateRandomWords(charCount);
    overrideBlockId = null;
    overrideBlocklistIdForHelper = null;

    const titleEl = document.getElementById('override-modal-title');
    if (titleEl) {
        titleEl.textContent = `Stop Schedule: ${blocklistName}`;
    }

    const challengeTextEl = document.getElementById('challenge-text');
    if (challengeTextEl) {
        challengeTextEl.textContent = challengeText;
    }

    const challengeInput = document.getElementById('challenge-input');
    if (challengeInput) challengeInput.value = '';
    const progressBar = document.getElementById('challenge-progress-bar');
    if (progressBar) progressBar.style.width = '0%';

    document.getElementById('override-modal').classList.remove('hidden');
}

// Click handler for a scheduled block in the timeline: select the corresponding blocklist
// (so the schedule editor on the left switches to it) and open the blocklist edit dialog.
// The override flow is still reachable from the running-block actions; clicking a calendar
// block now goes straight to editing.
function openScheduledBlockEdit(schedule) {
    const blocklist = appData.blocklists.find(bl => bl.id === schedule.blocklistId);
    if (!blocklist) return;

    const dropdown = document.getElementById('blocklist-select');
    if (dropdown) {
        dropdown.value = blocklist.id;
        handleBlocklistSelect({ target: dropdown });
    } else {
        selectedBlocklistId = blocklist.id;
    }

    openBlocklistModal(blocklist);
}


// Show confirmation modal for editing (adding segments to) an existing schedule
function showScheduleEditConfirmModal(blocklist, existingSchedule, newSegments) {
    const dayNames = tSettings('dayAbbrevMon0');

    // Store references for the proceed function
    window.editScheduleData = {
        scheduleId: existingSchedule.id || existingSchedule.blocklistId,
        newSegments: newSegments
    };

    // Blocklist name
    document.getElementById('schedule-confirm-name').textContent = `Add to: ${blocklist.name}`;

    // Hide websites and apps rows (not changing those)
    document.getElementById('schedule-websites-row').classList.add('hidden');
    document.getElementById('schedule-apps-row').classList.add('hidden');

    // Show NEW segments only
    const segmentsEl = document.getElementById('schedule-confirm-segments');
    segmentsEl.innerHTML = `<div class="edit-schedule-notice">${getSettingsLanguage() === 'da' ? 'Tilføjer disse tidssegmenter:' : 'Adding these time segments:'}</div>`;

    newSegments.forEach((seg, index) => {
        const segDays = (seg.days || []).map(d => dayNames[d]).join(', ');
        const startTime = `${String(seg.startHour).padStart(2, '0')}:${String(seg.startMinute).padStart(2, '0')}`;
        const endTime = `${String(seg.endHour).padStart(2, '0')}:${String(seg.endMinute).padStart(2, '0')}`;

        const row = document.createElement('div');
        row.className = 'schedule-segment-row new-segment';
        row.innerHTML = `
            <span class="segment-time">${startTime} → ${endTime}</span>
            <span class="segment-days">${segDays || tSettings('noDaysSelected')}</span>
        `;
        segmentsEl.appendChild(row);
    });

    // Hide repeat info (not changing)
    document.getElementById('schedule-confirm-repeat').parentElement.classList.add('hidden');

    // Update modal button to say "Add Segments"
    const confirmBtn = document.querySelector('#start-schedule-confirm-modal .confirm-btn');
    if (confirmBtn) {
        confirmBtn.textContent = 'Add Segments';
        confirmBtn.onclick = proceedWithScheduleEdit;
    }

    // Show modal
    document.getElementById('start-schedule-confirm-modal').classList.remove('hidden');
}

// Add new segments to existing schedule
async function proceedWithScheduleEdit() {
    closeScheduleConfirmModal();

    const editData = window.editScheduleData;
    if (!editData) return;

    // Find the existing schedule
    const schedule = appData.schedules.find(s =>
        s.id === editData.scheduleId || s.blocklistId === editData.scheduleId
    );
    if (!schedule) return;

    // Add the new segments
    editData.newSegments.forEach(seg => {
        schedule.segments.push({
            startHour: seg.startHour,
            startMinute: seg.startMinute,
            endHour: seg.endHour,
            endMinute: seg.endMinute,
            days: [...seg.days]
        });
    });

    // Update activeScheduleSegmentCount to include the new segments
    activeScheduleSegmentCount = schedule.segments.length;
    scheduleSegments = schedule.segments.map(seg => ({ ...seg }));

    // Clear pending segments for this blocklist (they're now committed)
    if (appData.settings?.pendingScheduleSegments?.[selectedBlocklistId]) {
        delete appData.settings.pendingScheduleSegments[selectedBlocklistId];
    }

    // Save
    await saveData();

    console.log('Schedule updated with new segments:', schedule);

    // Restore the confirm button to normal
    const confirmBtn = document.querySelector('#start-schedule-confirm-modal .confirm-btn');
    if (confirmBtn) {
        confirmBtn.textContent = tSettings('startSchedule');
        confirmBtn.onclick = proceedWithSchedule;
    }

    // Restore hidden rows
    document.getElementById('schedule-confirm-repeat').parentElement.classList.remove('hidden');

    // Update UI
    updateScheduleButtonState();
    renderBlocklists();
    updateWeekCalendar();
    // Sync updated schedule to helper daemon
    syncSchedulesToHelper();

    // Clean up
    delete window.editScheduleData;
}

// Actually create the schedule (called after confirmation)
async function proceedWithSchedule() {
    closeScheduleConfirmModal();

    const blocklist = appData.blocklists.find(bl => bl.id === selectedBlocklistId);
    if (!blocklist) return;
    if (!ensureIOSBlocklistSelectionReady(blocklist, 'starting this schedule')) return;

    // v2: no helper to install. The app itself is the engine; if it
    // launched, blocking works. The legacy helper-install-modal
    // branch was here.

    // Create schedule object
    const schedule = {
        id: crypto.randomUUID(),
        blocklistId: selectedBlocklistId,
        segments: scheduleSegments.map(seg => ({
            startHour: seg.startHour,
            startMinute: seg.startMinute,
            endHour: seg.endHour,
            endMinute: seg.endMinute,
            days: [...seg.days]
        })),
        repeatType: scheduleRepeatType,
        repeatDate: scheduleRepeatType === 'date' ? scheduleRepeatDate : null,
        createdAt: Date.now()
    };

    // Save to appData
    appData.schedules.push(schedule);

    // Clear pending segments for this blocklist (they're now committed)
    if (appData.settings?.pendingScheduleSegments?.[selectedBlocklistId]) {
        delete appData.settings.pendingScheduleSegments[selectedBlocklistId];
    }

    await saveData();

    console.log('Schedule created:', schedule);

    // Update blocked apps if schedule is currently active
    await updateBlockedApps();
    // Update the active segment count to lock the created segments
    activeScheduleSegmentCount = scheduleSegments.length;

    // Reset schedule repeat options for next use
    scheduleRepeatType = 'forever';
    scheduleRepeatDate = null;

    // Rebuild segments UI to show them as locked
    rebuildScheduleSegments();
    disableScheduleControls(true);
    updateScheduleButtonState();

    // Re-render blocklists to show schedule badge
    renderBlocklists();

    // Update calendar to show scheduled blocks
    updateWeekCalendar();

    // Clear preview blocks
    document.querySelectorAll('.calendar-block.preview').forEach(el => el.remove());

    // Trigger hosts file update to start blocking if schedule is currently active
    await updateHostsFile();

    // Sync all schedules to helper daemon for autonomous transitions
    await syncSchedulesToHelper();
}
// Handle time picker change
function handleTimeChange() {
    const noBlocksMsg = document.getElementById('no-blocks-message');
    const startBtn = document.getElementById('start-block-btn');
    const nextDayIndicator = document.getElementById('next-day-indicator');

    // Remove any existing preview blocks and active-schedule blocks (for schedule mode)
    document.querySelectorAll('.calendar-block.preview, .calendar-block.active-schedule').forEach(el => el.remove());

    // Refresh the "Always on" row so any preview chip stays in sync with the current mode
    // (it shows up only when isAlwaysOnMode is on and a blocklist is selected).
    renderScheduleAlwaysOnRow();

    // Handle schedule mode separately
    if (isScheduleMode) {
        renderSchedulePreview();

        // Save pending schedule segments for this blocklist
        if (selectedBlocklistId) {
            if (!appData.settings) appData.settings = {};
            if (!appData.settings.pendingScheduleSegments) appData.settings.pendingScheduleSegments = {};

            const existingSchedule = appData.schedules?.find(s => s.blocklistId === selectedBlocklistId);

            if (!existingSchedule) {
                // No active schedule - save all pending segments
                const currentPending = JSON.stringify(appData.settings.pendingScheduleSegments[selectedBlocklistId] || []);
                const newPending = JSON.stringify(scheduleSegments);
                if (currentPending !== newPending) {
                    appData.settings.pendingScheduleSegments[selectedBlocklistId] = scheduleSegments.map(seg => ({ ...seg }));
                    saveData();
                }
            } else {
                // Active schedule exists - save only NEW segments (those beyond activeScheduleSegmentCount)
                const committedSegmentCount = getCommittedScheduleSegmentCount(existingSchedule);
                if (scheduleSegments.length > committedSegmentCount) {
                    const newSegments = scheduleSegments.slice(committedSegmentCount);
                    const currentPending = JSON.stringify(appData.settings.pendingScheduleSegments[selectedBlocklistId] || []);
                    const newPending = JSON.stringify(newSegments);
                    if (currentPending !== newPending) {
                        appData.settings.pendingScheduleSegments[selectedBlocklistId] = newSegments.map(seg => ({ ...seg }));
                        saveData();
                    }
                } else {
                    // No new segments - clear any pending segments
                    if (appData.settings.pendingScheduleSegments[selectedBlocklistId]) {
                        delete appData.settings.pendingScheduleSegments[selectedBlocklistId];
                        saveData();
                    }
                }
            }
        }
        return;
    }

    // --- Always-on mode: preview shows up only as a chip in the "Always on" row above the
    // calendar, not as a bar inside the timeline. The chip is added by the call to
    // renderScheduleAlwaysOnRow() at the top of this function.
    if (isAlwaysOnMode) {
        startBtn.disabled = !selectedBlocklistId;

        if (nextDayIndicator) nextDayIndicator.classList.add('hidden');

        if (noBlocksMsg) noBlocksMsg.classList.add('hidden');

        updateWindowHeight();
        return;
    }

    // --- Instant mode logic ---
    // Get times (start is always now)
    let blockStart = getStartTimeAsDate();
    let blockEnd = getEndTimeAsDate();

    // Determine block end time
    if (!userEditedEndTime && targetDurationMinutes > 0) {
        // If driving by duration, exact calculation
        blockEnd = new Date(blockStart.getTime() + targetDurationMinutes * 60 * 1000);
    } else {
        // If driving by end time picker, assume nearest future time (handle overnight)
        if (blockEnd <= blockStart) {
            blockEnd.setDate(blockEnd.getDate() + 1);
        }
    }

    // Calculate how many days in the future the end time is
    const startDay = new Date(blockStart);
    startDay.setHours(0, 0, 0, 0);
    const endDay = new Date(blockEnd);
    endDay.setHours(0, 0, 0, 0);
    const daysDiff = Math.round((endDay - startDay) / (24 * 60 * 60 * 1000));

    // Show/hide day indicator with correct count
    if (nextDayIndicator) {
        if (daysDiff > 0) {
            if (daysDiff === 1) {
                nextDayIndicator.textContent = 'tomorrow';
            } else {
                // For >1 days, show date like "8 Jan"
                const dateStr = blockEnd.getDate() + ' ' + blockEnd.toLocaleString('default', { month: 'short' });
                nextDayIndicator.textContent = dateStr;
            }
            nextDayIndicator.classList.remove('hidden');
        } else {
            nextDayIndicator.classList.add('hidden');
        }
    }

    // Calculate duration
    const durationMs = blockEnd.getTime() - blockStart.getTime();
    const durationMinutes = Math.round(durationMs / 60000);

    if (durationMinutes <= 0) {
        startBtn.disabled = true;
        return;
    }

    // Sync duration input and quick buttons with calculated duration
    const durationInput = document.getElementById('duration-minutes-input');
    if (durationInput && document.activeElement !== durationInput) {
        durationInput.value = durationMinutes;
    }
    updateDurationQuickBtns(durationMinutes);

    // Save duration to settings per-blocklist so it persists across blocklist selections
    if (selectedBlocklistId) {
        if (!appData.settings) appData.settings = {};
        if (!appData.settings.instantBlockDuration) appData.settings.instantBlockDuration = {};
        if (appData.settings.instantBlockDuration[selectedBlocklistId] !== durationMinutes) {
            appData.settings.instantBlockDuration[selectedBlocklistId] = durationMinutes;
            saveData();
        }
    }

    startBtn.disabled = !selectedBlocklistId;
    if (noBlocksMsg) {
        noBlocksMsg.classList.add('hidden');
    }

    // Create preview block in week calendar (only if no active block for this blocklist)
    const blocklist = appData.blocklists.find(bl => bl.id === selectedBlocklistId);
    const now = Date.now();
    const hasActiveBlock = blocklist && appData.activeBlocks.some(b => b.blocklistId === selectedBlocklistId && b.startTime <= now && b.endTime > now);

    if (blocklist && !hasActiveBlock) {
        renderInstantPreviewBlock(blockStart, blockEnd, blocklist);
    }

    updateWindowHeight();
}

// Render an instant-mode preview block onto the weekly calendar by projecting from
// now → blockEnd onto today's row (and onto tomorrow's row if the duration crosses
// midnight). The "head" slice on today's row gets a right-edge resize handle so the
// user can drag to adjust the block's duration. Continuation tails on later days stay
// non-interactive and are redrawn when the head is released.
function renderInstantPreviewBlock(blockStart, blockEnd, blocklist) {
    document.querySelectorAll('.calendar-block.preview').forEach(el => el.remove());

    const startMs = blockStart.getTime();
    const endMs = blockEnd.getTime();

    let cursor = new Date(startMs);
    cursor.setHours(0, 0, 0, 0);

    let isFirstSlice = true;
    let headEl = null;
    let headTrack = null;

    while (cursor.getTime() <= endMs) {
        const dayStartMs = cursor.getTime();
        const dayEndMs = dayStartMs + 24 * 60 * 60 * 1000 - 1;
        const sliceStartMs = Math.max(startMs, dayStartMs);
        const sliceEndMs = Math.min(endMs, dayEndMs);

        if (sliceEndMs > sliceStartMs) {
            const sliceDate = new Date(sliceStartMs);
            const jsDay = sliceDate.getDay();
            const dayIndex = jsDay === 0 ? 6 : jsDay - 1;
            const track = document.querySelector(`.day-track[data-day-index="${dayIndex}"]`);
            if (track) {
                const layout = getCalendarSegmentLayout(sliceStartMs, sliceEndMs, dayStartMs, dayEndMs);
                const previewEl = document.createElement('div');
                const isHead = isFirstSlice;
                previewEl.className = 'calendar-block preview' + (isHead ? ' interactive' : ' overnight-continuation');
                previewEl.style.left = `${layout.leftPercent}%`;
                previewEl.style.width = `${layout.widthPercent}%`;
                previewEl.dataset.previewGroupId = 'preview-instant';
                if (!isHead) previewEl.dataset.continuation = '1';

                if (blocklist.color) {
                    previewEl.style.background = blocklist.color;
                    previewEl.style.color = getContrastTextColor(blocklist.color);
                }

                // Only the head slice gets a right-edge handle. The start is "now" so
                // there's no left-edge handle (you can't reschedule the start of an
                // instant block).
                const resizeHandle = isHead
                    ? '<div class="resize-handle resize-handle-end" data-handle="end" title="Drag to change end time"></div>'
                    : '';

                previewEl.innerHTML = `
                    ${resizeHandle}
                    <span class="block-emoji">${blocklist.emoji || '🚫'}</span>
                    <span class="block-label">${escapeHtml(blocklist.name)}</span>
                    <span class="block-time">${formatTime(layout.segmentStartDate)} - ${formatTime(layout.segmentEndDate)}</span>
                `;

                track.appendChild(previewEl);

                if (isHead) {
                    headEl = previewEl;
                    headTrack = track;
                }
            }
        }

        cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000);
        isFirstSlice = false;
    }

    if (headEl && headTrack) {
        attachInstantPreviewResizeHandler(headEl, headTrack);
    }

    layoutOverlappingBlocks();
}

// Attach a right-edge resize handler to the instant-mode preview's head element. Dragging
// the handle live-updates the head's width and on release commits the new total duration:
// duration = head's new width (in minutes). Tails on later days are not adjusted in
// real time; they're killed/redrawn cleanly on release via handleTimeChange().
function attachInstantPreviewResizeHandler(headEl, headTrack) {
    const handle = headEl.querySelector('.resize-handle-end');
    if (!handle) return;

    const snapMinutes = 15;
    const minDurationMinutes = 5;
    let isResizing = false;
    let startX = 0;
    let startWidthPct = 0;

    handle.addEventListener('mouseenter', () => headEl.classList.add('resize-hover'));
    handle.addEventListener('mouseleave', () => headEl.classList.remove('resize-hover'));

    headEl.addEventListener('mousedown', (e) => {
        if (!e.target.closest('.resize-handle-end')) return;
        isResizing = true;
        startX = e.clientX;
        startWidthPct = parseFloat(headEl.style.width) || 0;
        headEl.classList.add('resizing');
        document.body.style.cursor = 'ew-resize';
        e.preventDefault();
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    });

    function onMouseMove(e) {
        if (!isResizing) return;
        const trackRect = headTrack.getBoundingClientRect();
        if (trackRect.width <= 0) return;

        const deltaX = e.clientX - startX;
        const deltaPct = (deltaX / trackRect.width) * 100;
        const headLeftPct = parseFloat(headEl.style.left) || 0;
        // Clamp the head so it can't shrink to nothing or extend past end-of-day.
        // Extending past midnight would require drawing/moving tail elements, which we
        // intentionally skip to keep the live preview simple — the user can still type
        // a longer duration into the Duration input for multi-day blocks.
        const minWidthPct = (minDurationMinutes / 1440) * 100;
        const maxWidthPct = 100 - headLeftPct;
        const newWidthPct = Math.max(minWidthPct, Math.min(maxWidthPct, startWidthPct + deltaPct));
        headEl.style.width = `${newWidthPct}%`;

        // Live-update the "HH:MM - HH:MM" label so it tracks the cursor instead of
        // staying frozen at the pre-drag value until release.
        const startMins = (headLeftPct / 100) * 1440;
        const endMins = ((headLeftPct + newWidthPct) / 100) * 1440;
        const timeEl = headEl.querySelector('.block-time');
        if (timeEl) {
            timeEl.textContent = `${formatMinutesAsHHMM(startMins)} - ${formatMinutesAsHHMM(endMins)}`;
        }
    }

    function onMouseUp() {
        if (!isResizing) return;
        isResizing = false;
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        headEl.classList.remove('resizing');
        headEl.classList.remove('resize-hover');
        document.body.style.cursor = '';

        const headWidthPct = parseFloat(headEl.style.width) || 0;
        // The head starts at "now" within today's row, so its width in minutes = its
        // width-as-percent-of-day × 1440. That's also the new total duration for the
        // block (any continuation tails are dropped — drag-to-resize sets the end here).
        let newDurationMinutes = Math.round((headWidthPct / 100) * 1440);
        newDurationMinutes = Math.max(minDurationMinutes, Math.round(newDurationMinutes / snapMinutes) * snapMinutes);

        const startTime = getStartTimeAsDate();
        const newEndTime = new Date(startTime.getTime() + newDurationMinutes * 60 * 1000);

        targetDurationMinutes = newDurationMinutes;
        userEditedEndTime = false;
        selectedEndHour = newEndTime.getHours();
        selectedEndMinute = newEndTime.getMinutes();

        const durationInput = document.getElementById('duration-minutes-input');
        if (durationInput) durationInput.value = newDurationMinutes;

        // If the user was on always-on mode, dragging the preview's right edge implicitly
        // switches them into timed mode (now there's a concrete end time again).
        if (isAlwaysOnMode) setAlwaysOnMode(false);

        updateTimeDisplay();
        handleTimeChange();
    }
}

// Render schedule preview blocks on the calendar
// Render preview blocks for the schedule the user is currently building. Previews are drawn
// for every weekday selected in the segment's `days`. For non-repeating drafts, only days
// that have a one-shot occurrence still ahead of "now" are rendered.
function renderSchedulePreview() {
    if (!selectedBlocklistId) return;

    const blocklist = appData.blocklists.find(bl => bl.id === selectedBlocklistId);
    if (!blocklist) return;

    const draftCreatedAt = Date.now();
    const shouldRepeat = scheduleRepeatType === 'forever' || scheduleRepeatType === 'date';

    if (!shouldRepeat) {
        const draftOccurrences = resolveOneShotOccurrences({
            repeatType: 'no',
            createdAt: draftCreatedAt,
            segments: scheduleSegments
        }).filter(occurrence => occurrence.segmentIndex >= activeScheduleSegmentCount);

        draftOccurrences.forEach(occurrence => {
            renderPreviewSegmentOnWeekday(blocklist, scheduleSegments[occurrence.segmentIndex], occurrence.segmentIndex, occurrence.dayIndex);
        });

        layoutOverlappingBlocks();
        return;
    }

    scheduleSegments.forEach((segment, segmentIndex) => {
        const isLockedSegment = segmentIndex < activeScheduleSegmentCount;
        if (isLockedSegment) return;

        const segmentDays = segment.days || [];
        segmentDays.forEach(dayIndex => {
            renderPreviewSegmentOnWeekday(blocklist, segment, segmentIndex, dayIndex);
        });
    });

    layoutOverlappingBlocks();
}

// Build a preview block element for a schedule segment on a specific weekday.
// Overnight segments split: head from start..24:00 on this weekday, tail from 00:00..end
// on the next weekday (wrapping Sun → Mon).
function renderPreviewSegmentOnWeekday(blocklist, segment, segmentIndex, dayIndex) {
    const track = document.querySelector(`.day-track[data-day-index="${dayIndex}"]`);
    if (!track) return;

    const startMinutes = segment.startHour * 60 + segment.startMinute;
    const endMinutes = segment.endHour * 60 + segment.endMinute;
    const isOvernight = endMinutes <= startMinutes;

    const startTimeStr = `${String(segment.startHour).padStart(2, '0')}:${String(segment.startMinute).padStart(2, '0')}`;
    const endTimeStr = `${String(segment.endHour).padStart(2, '0')}:${String(segment.endMinute).padStart(2, '0')}`;

    if (isOvernight) {
        const left1 = (startMinutes / 1440) * 100;
        const width1 = Math.max(0.5, ((1440 - startMinutes) / 1440) * 100);
        track.appendChild(buildPreviewBlockElement({
            blocklist, segmentIndex, dayIndex,
            leftPct: left1, widthPct: width1,
            startTimeStr, endTimeStr,
            isContinuation: false
        }));

        const nextDayIndex = (dayIndex + 1) % 7;
        const nextTrack = document.querySelector(`.day-track[data-day-index="${nextDayIndex}"]`);
        if (nextTrack) {
            const width2 = Math.max(0.5, (endMinutes / 1440) * 100);
            nextTrack.appendChild(buildPreviewBlockElement({
                blocklist, segmentIndex, dayIndex: nextDayIndex,
                leftPct: 0, widthPct: width2,
                startTimeStr, endTimeStr,
                isContinuation: true
            }));
        }
    } else {
        const left = (startMinutes / 1440) * 100;
        const width = Math.max(0.5, ((endMinutes - startMinutes) / 1440) * 100);
        track.appendChild(buildPreviewBlockElement({
            blocklist, segmentIndex, dayIndex,
            leftPct: left, widthPct: width,
            startTimeStr, endTimeStr,
            isContinuation: false
        }));
    }
}

// Construct a single preview block element for one weekday slot. Drag/resize handlers are
// only attached to the head element (not the overnight tail) so that a drag operates on
// the original anchor weekday.
function buildPreviewBlockElement({ blocklist, segmentIndex, dayIndex, leftPct, widthPct, startTimeStr, endTimeStr, isContinuation }) {
    const previewEl = document.createElement('div');
    previewEl.className = `calendar-block preview interactive${isContinuation ? ' overnight-continuation' : ''}`;
    previewEl.style.left = `${leftPct}%`;
    previewEl.style.width = `${widthPct}%`;
    previewEl.dataset.previewGroupId = `preview-segment-${segmentIndex}`;
    previewEl.dataset.segmentIndex = segmentIndex;
    previewEl.dataset.dayIndex = dayIndex;
    if (isContinuation) previewEl.dataset.continuation = '1';

    if (blocklist.color) {
        previewEl.style.background = blocklist.color;
        previewEl.style.color = getContrastTextColor(blocklist.color);
    }

    // Resize handles run vertically along the start/end edges. Continuation (tail) blocks
    // don't get handles — the user adjusts the segment by dragging the head block.
    const resizeHandles = !isContinuation ? `
        <div class="resize-handle resize-handle-start" data-handle="start" title="Drag to change start time"></div>
        <div class="resize-handle resize-handle-end" data-handle="end" title="Drag to change end time"></div>
    ` : '';

    previewEl.innerHTML = `
        ${resizeHandles}
        <span class="block-emoji">${blocklist.emoji || '🚫'}</span>
        <span class="block-label">${escapeHtml(blocklist.name)}</span>
        <span class="block-time">${startTimeStr} - ${endTimeStr}</span>
    `;

    if (!isContinuation && isScheduleMode) {
        const track = document.querySelector(`.day-track[data-day-index="${dayIndex}"]`);
        if (track) attachPreviewBlockDragHandlers(previewEl, segmentIndex, track);
    }

    return previewEl;
}

// Attach drag and resize handlers to a preview block.
//
// In the row-based layout time flows horizontally and days stack vertically:
//   - dragging the body of the block: horizontal motion changes start/end time, vertical
//     motion (cursor over a different row) changes the day(s) of the segment.
//   - dragging the .resize-handle-start: adjusts start time (left edge).
//   - dragging the .resize-handle-end: adjusts end time (right edge).
function attachPreviewBlockDragHandlers(previewEl, segmentIndex, track) {
    let isDragging = false;
    let isResizing = false;
    let resizeHandle = null;
    let startX = 0;
    let startY = 0;
    let startLeftPct = 0;
    let startWidthPct = 0;
    let startDayIndex = null;
    let currentHoverTrack = track;
    let clickOffsetY = 0; // Offset from row center where user clicked (helps day-boundary detection)
    const snapMinutes = 15;
    const minDurationMinutes = 15;

    function getDayIndexFromTrack(trackEl) {
        if (!trackEl) return null;
        const raw = trackEl.dataset.dayIndex;
        if (raw === undefined || raw === null || raw === '') return null;
        const idx = parseInt(raw, 10);
        return Number.isInteger(idx) && idx >= 0 && idx <= 6 ? idx : null;
    }

    startDayIndex = getDayIndexFromTrack(track);

    function snapToInterval(minutes) {
        return Math.round(minutes / snapMinutes) * snapMinutes;
    }

    function minutesToTime(totalMinutes) {
        totalMinutes = Math.max(0, Math.min(1440, totalMinutes));
        const hours = Math.floor(totalMinutes / 60);
        const minutes = totalMinutes % 60;
        return { hours: Math.min(23, hours), minutes };
    }

    function updateSegmentTimesAndDays(newStartMinutes, newEndMinutes, dayShift = 0) {
        if (newEndMinutes - newStartMinutes < minDurationMinutes) return;

        const startTime = minutesToTime(newStartMinutes);
        const endTime = minutesToTime(newEndMinutes);

        scheduleSegments[segmentIndex].startHour = startTime.hours;
        scheduleSegments[segmentIndex].startMinute = startTime.minutes;
        scheduleSegments[segmentIndex].endHour = endTime.hours;
        scheduleSegments[segmentIndex].endMinute = endTime.minutes;

        if (dayShift !== 0) {
            const segment = scheduleSegments[segmentIndex];
            const oldDays = segment.days || [];
            const newDays = oldDays.map(d => {
                let newDay = d + dayShift;
                if (newDay < 0) newDay += 7;
                if (newDay > 6) newDay -= 7;
                return newDay;
            });
            segment.days = newDays;
            updateDayToggleUI(segmentIndex);
        }

        updateTimePickerUI(segmentIndex);

        document.querySelectorAll('.calendar-block.preview').forEach(el => el.remove());
        renderSchedulePreview();
    }

    function updateTimePickerUI(index) {
        const segment = scheduleSegments[index];
        const startHourBtn = document.querySelector(`[data-target="schedule-start-${index}"][data-type="hour"]`);
        const startMinBtn = document.querySelector(`[data-target="schedule-start-${index}"][data-type="minute"]`);
        const endHourBtn = document.querySelector(`[data-target="schedule-end-${index}"][data-type="hour"]`);
        const endMinBtn = document.querySelector(`[data-target="schedule-end-${index}"][data-type="minute"]`);

        if (startHourBtn) startHourBtn.textContent = String(segment.startHour).padStart(2, '0');
        if (startMinBtn) startMinBtn.textContent = String(segment.startMinute).padStart(2, '0');
        if (endHourBtn) endHourBtn.textContent = String(segment.endHour).padStart(2, '0');
        if (endMinBtn) endMinBtn.textContent = String(segment.endMinute).padStart(2, '0');
    }

    function updateDayToggleUI(index) {
        const segment = scheduleSegments[index];
        const days = segment.days || [];
        const segmentContainer = document.querySelector(`.schedule-segment[data-segment-index="${index}"]`);
        if (!segmentContainer) return;

        const dayButtons = segmentContainer.querySelectorAll('.segment-day-toggle');
        dayButtons.forEach(btn => {
            const dayIndex = parseInt(btn.dataset.day);
            btn.classList.toggle('active', days.includes(dayIndex));
        });
    }

    // Cursor hover hint on resize handles
    previewEl.querySelectorAll('.resize-handle').forEach(handle => {
        handle.addEventListener('mouseenter', () => previewEl.classList.add('resize-hover'));
        handle.addEventListener('mouseleave', () => previewEl.classList.remove('resize-hover'));
    });

    // Recompute "HH:MM - HH:MM" from the head's current left%/width% and write it onto
    // every preview block belonging to this segment (head + overnight tails). Matches the
    // formula used on mouseup so what the user sees mid-drag is what gets committed.
    function updateLiveTimeText() {
        const headBlocks = getHeadPreviewBlocks();
        if (headBlocks.length === 0) return;
        const head = headBlocks[0];
        const leftPct = parseFloat(head.style.left) || 0;
        const widthPct = parseFloat(head.style.width) || 0;
        const startMins = (leftPct / 100) * 1440;
        const endMins = ((leftPct + widthPct) / 100) * 1440;
        const text = `${formatMinutesAsHHMM(startMins)} - ${formatMinutesAsHHMM(endMins)}`;
        document.querySelectorAll(
            `.calendar-block.preview[data-segment-index="${segmentIndex}"] .block-time`
        ).forEach(el => { el.textContent = text; });
    }

    previewEl.addEventListener('mousedown', (e) => {
        const handle = e.target.closest('.resize-handle');
        if (handle) {
            isResizing = true;
            resizeHandle = handle.dataset.handle;
            previewEl.classList.add('resizing');
            document.body.style.cursor = 'ew-resize';
        } else {
            isDragging = true;
            previewEl.classList.add('dragging');
            document.body.style.cursor = 'grabbing';
        }

        startX = e.clientX;
        startY = e.clientY;
        startLeftPct = parseFloat(previewEl.style.left) || 0;
        startWidthPct = parseFloat(previewEl.style.width) || 0;
        currentHoverTrack = track;

        const trackRect = track.getBoundingClientRect();
        const trackCenterY = trackRect.top + trackRect.height / 2;
        clickOffsetY = e.clientY - trackCenterY;

        e.preventDefault();

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
    });

    // Only "head" preview blocks (not overnight tails) are manipulated during a drag —
    // tails are redrawn from the segment's new times on mouseup via renderSchedulePreview.
    function getHeadPreviewBlocks() {
        return document.querySelectorAll(
            `.calendar-block.preview[data-segment-index="${segmentIndex}"]:not([data-continuation])`
        );
    }

    function handleMouseMove(e) {
        const trackRect = track.getBoundingClientRect();
        if (trackRect.width <= 0) return;

        const deltaX = e.clientX - startX;
        const deltaPct = (deltaX / trackRect.width) * 100;
        const headBlocks = getHeadPreviewBlocks();

        if (isDragging) {
            // Move horizontally — clamp so the block stays within [0, 100]%
            const maxLeftPct = 100 - startWidthPct;
            const newLeftPct = Math.max(0, Math.min(maxLeftPct, startLeftPct + deltaPct));

            headBlocks.forEach(block => {
                block.style.left = `${newLeftPct}%`;
                block.classList.add('dragging');
            });

            // Move vertically (across day rows)
            const allTracks = Array.from(document.querySelectorAll('.day-track'));
            const effectiveY = e.clientY - clickOffsetY;
            let targetTrackIndex = -1;
            for (let i = 0; i < allTracks.length; i++) {
                const rect = allTracks[i].getBoundingClientRect();
                if (effectiveY >= rect.top && effectiveY <= rect.bottom) {
                    targetTrackIndex = i;
                    currentHoverTrack = allTracks[i];
                    break;
                }
            }

            if (targetTrackIndex >= 0) {
                const originalTrackIndex = allTracks.indexOf(track);
                const dayShiftDuringDrag = targetTrackIndex - originalTrackIndex;

                headBlocks.forEach(block => {
                    if (!block.dataset.originalTrackIndex) {
                        block.dataset.originalTrackIndex = allTracks.indexOf(block.parentElement);
                    }
                    const blockOriginalIndex = parseInt(block.dataset.originalTrackIndex);
                    const newTrackIndex = blockOriginalIndex + dayShiftDuringDrag;
                    if (newTrackIndex >= 0 && newTrackIndex < allTracks.length) {
                        if (allTracks[newTrackIndex] !== block.parentElement) {
                            allTracks[newTrackIndex].appendChild(block);
                        }
                    }
                });
            }
        } else if (isResizing) {
            if (resizeHandle === 'start') {
                const newLeftPct = Math.max(0, startLeftPct + deltaPct);
                const newWidthPct = startWidthPct - (newLeftPct - startLeftPct);
                if (newWidthPct >= 0.5) {
                    headBlocks.forEach(block => {
                        block.style.left = `${newLeftPct}%`;
                        block.style.width = `${newWidthPct}%`;
                    });
                }
            } else if (resizeHandle === 'end') {
                const maxWidthPct = 100 - startLeftPct;
                const newWidthPct = Math.max(0.5, Math.min(maxWidthPct, startWidthPct + deltaPct));
                headBlocks.forEach(block => {
                    block.style.width = `${newWidthPct}%`;
                });
            }
        }

        updateLiveTimeText();
    }

    function handleMouseUp() {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);

        getHeadPreviewBlocks().forEach(block => {
            block.classList.remove('dragging');
            block.classList.remove('resizing');
            delete block.dataset.originalTrackIndex;
        });
        document.body.style.cursor = '';

        if (isDragging || isResizing) {
            const finalLeftPct = parseFloat(previewEl.style.left) || 0;
            const finalWidthPct = parseFloat(previewEl.style.width) || 0;

            const newStartMinutes = snapToInterval((finalLeftPct / 100) * 1440);
            const newEndMinutes = snapToInterval(((finalLeftPct + finalWidthPct) / 100) * 1440);

            let dayShift = 0;
            if (isDragging && currentHoverTrack !== track) {
                const newDayIndex = getDayIndexFromTrack(currentHoverTrack);
                if (newDayIndex !== null && startDayIndex !== null) {
                    dayShift = newDayIndex - startDayIndex;
                }
            }

            updateSegmentTimesAndDays(newStartMinutes, newEndMinutes, dayShift);
        }

        isDragging = false;
        isResizing = false;
        resizeHandle = null;
    }
}

// Handle blocklist selection
function handleBlocklistSelect(e) {
    const newBlocklistId = e.target.value || null;

    // Before switching, save pending changes for the current blocklist
    if (selectedBlocklistId) {
        // Save pending schedule segments if in schedule mode
        if (isScheduleMode) {
            const existingSchedule = appData.schedules?.find(s => s.blocklistId === selectedBlocklistId);
            if (!appData.settings) appData.settings = {};
            if (!appData.settings.pendingScheduleSegments) appData.settings.pendingScheduleSegments = {};

            if (!existingSchedule) {
                // No active schedule - save all segments
                if (scheduleSegments.length > 0) {
                    appData.settings.pendingScheduleSegments[selectedBlocklistId] = scheduleSegments.map(seg => ({ ...seg }));
                    saveData();
                }
            } else {
                // Active schedule exists - save only NEW segments (those beyond activeScheduleSegmentCount)
                const committedSegmentCount = getCommittedScheduleSegmentCount(existingSchedule);
                if (scheduleSegments.length > committedSegmentCount) {
                    const newSegments = scheduleSegments.slice(committedSegmentCount);
                    appData.settings.pendingScheduleSegments[selectedBlocklistId] = newSegments.map(seg => ({ ...seg }));
                    saveData();
                } else {
                    // No new segments - clear any pending segments
                    if (appData.settings.pendingScheduleSegments[selectedBlocklistId]) {
                        delete appData.settings.pendingScheduleSegments[selectedBlocklistId];
                        saveData();
                    }
                }
            }
        } else {
            // Save pending instant block duration if in instant mode
            if (!appData.settings) appData.settings = {};
            if (!appData.settings.instantBlockDuration) appData.settings.instantBlockDuration = {};
            if (targetDurationMinutes !== 60) { // Only save if different from default
                appData.settings.instantBlockDuration[selectedBlocklistId] = targetDurationMinutes;
                saveData();
            }
        }
    }

    selectedBlocklistId = newBlocklistId;

    const timePicker = document.getElementById('time-picker-container');
    const passwordHint = document.getElementById('password-hint');
    const selectionPrompt = document.getElementById('selection-prompt');
    const startBlockBtn = document.getElementById('start-block-btn');
    const startScheduleBtn = document.getElementById('start-schedule-btn');
    const modeTabs = document.querySelector('.scheduler-mode-tabs');

    if (selectedBlocklistId) {
        // Determine which mode to show based on active blocks/schedules
        const blocklist = appData.blocklists.find(bl => bl.id === selectedBlocklistId);
        const now = Date.now();

        // Check if there's an active block (one-off)
        const hasActiveBlock = blocklist && appData.activeBlocks.some(b =>
            b.blocklistId === selectedBlocklistId && b.startTime <= now && b.endTime > now
        );

        // Check if there's an active schedule
        const existingSchedule = appData.schedules
            ? appData.schedules.find(s => s.blocklistId === selectedBlocklistId)
            : null;
        const hasActiveSchedule = existingSchedule && existingSchedule.segments && existingSchedule.segments.length > 0;

        // Determine default mode:
        if (hasActiveBlock && !hasActiveSchedule) {
            setScheduleMode(false);
        } else if (hasActiveSchedule && !hasActiveBlock) {
            setScheduleMode(true);
        } else if (hasActiveBlock && hasActiveSchedule) {
            setScheduleMode(false);
        } else {
            // No active block or schedule: restore this blocklist's last-viewed tab (instant vs schedule)
            const preferredSchedule = appData.settings?.preferredStartMode?.[selectedBlocklistId];
            setScheduleMode(preferredSchedule === true);
        }

        // Hide selection prompt, show time picker, hint, tabs, and appropriate button
        if (selectionPrompt) selectionPrompt.classList.add('hidden');
        timePicker.classList.remove('hidden');
        if (passwordHint) passwordHint.classList.remove('hidden');
        if (modeTabs) modeTabs.classList.remove('hidden');

        // Show the appropriate button based on mode
        if (isScheduleMode) {
            if (startBlockBtn) startBlockBtn.classList.add('hidden');
            if (startScheduleBtn) {
                startScheduleBtn.classList.remove('hidden');
                updateScheduleButtonState();
            }
        } else {
            if (startScheduleBtn) startScheduleBtn.classList.add('hidden');
            if (startBlockBtn) {
                startBlockBtn.classList.remove('hidden');

                const blocklist = appData.blocklists.find(bl => bl.id === selectedBlocklistId);
                const now = Date.now();
                // IMPORTANT: Only find active block for THIS specific blocklist
                const activeBlock = appData.activeBlocks.find(b =>
                    b.blocklistId === selectedBlocklistId &&
                    b.startTime <= now &&
                    b.endTime > now
                );

                if (blocklist) {
                    const btnLabel = startBlockBtn.querySelector('.btn-label');
                    const btnIcon = startBlockBtn.querySelector('svg');

                    // Always clear the activeBlockId first to prevent cross-blocklist issues
                    delete startBlockBtn.dataset.activeBlockId;
                    startBlockBtn.classList.remove('stop-block');

                    const pauseBtn = document.getElementById('pause-block-btn');

                    if (activeBlock) {
                        // Active block - show Stop Block button (grey) with unlock icon
                        setBtnActionLabel(btnLabel, 'Stop Block:');
                        setStartBtnBlocklistInfo(startBlockBtn, blocklist);
                        startBlockBtn.classList.add('stop-block');
                        startBlockBtn.disabled = false;
                        startBlockBtn.dataset.activeBlockId = activeBlock.id;

                        // Show pause button with correct appearance
                        if (pauseBtn) {
                            pauseBtn.classList.remove('hidden');
                            updatePauseButtonAppearance(!!activeBlock.isPaused);
                        }

                        // Change to unlock icon
                        if (btnIcon) {
                            btnIcon.innerHTML = `
                                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                                <path d="M7 11V7a5 5 0 0 1 9.9-1"></path>
                            `;
                        }

                        // Disable time controls
                        disableTimeControls(true);

                        // Keep the info message visible for active always-on blocks.
                        const alwaysOnMsg = document.getElementById('always-on-message');
                        if (alwaysOnMsg) alwaysOnMsg.classList.toggle('hidden', !isBlockAlwaysOn(activeBlock));
                    } else {
                        // No active block - show Start Block button (normal) with lock icon
                        // Ensure we've already cleared the activeBlockId above
                        setBtnActionLabel(btnLabel, tSettings('startBlockButton'));
                        setStartBtnBlocklistInfo(startBlockBtn, blocklist);

                        // Change to lock icon
                        if (btnIcon) {
                            btnIcon.innerHTML = `
                                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                                <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                            `;
                        }

                        // Enable time controls
                        disableTimeControls(false);

                        // Re-show always-on message based on current mode
                        const alwaysOnMsg = document.getElementById('always-on-message');
                        if (alwaysOnMsg) alwaysOnMsg.classList.toggle('hidden', !isAlwaysOnMode);

                        // Hide pause button
                        if (pauseBtn) pauseBtn.classList.add('hidden');
                    }
                }
            }
        }
        initializeTimeInputs();
    } else {
        // Show selection prompt, hide time picker, hint, tabs, and both buttons
        if (selectionPrompt) selectionPrompt.classList.remove('hidden');
        timePicker.classList.add('hidden');
        if (passwordHint) passwordHint.classList.add('hidden');
        if (modeTabs) modeTabs.classList.add('hidden');
        if (startBlockBtn) startBlockBtn.classList.add('hidden');
        if (startScheduleBtn) startScheduleBtn.classList.add('hidden');
        const pauseBtn = document.getElementById('pause-block-btn');
        if (pauseBtn) pauseBtn.classList.add('hidden');
    }

    // Update visual selection state on blocklist cards
    renderBlocklists();

    handleTimeChange(); // Update button state and preview

    // Wait for DOM reflow to capture the correct height after showing/hiding elements
    setTimeout(() => {
        updateWindowHeight();
    }, 50);
}

// Deselect current blocklist (same behavior as clicking on background).
// Used by click-outside handler and ESC key.
function deselectBlocklist() {
    if (!selectedBlocklistId) return;
    const currentBlocklistId = selectedBlocklistId;
    if (isScheduleMode) {
        const existingSchedule = appData.schedules?.find(s => s.blocklistId === currentBlocklistId);
        if (!appData.settings) appData.settings = {};
        if (!appData.settings.pendingScheduleSegments) appData.settings.pendingScheduleSegments = {};

        if (!existingSchedule) {
            if (scheduleSegments.length > 0) {
                appData.settings.pendingScheduleSegments[currentBlocklistId] = scheduleSegments.map(seg => ({ ...seg }));
                saveData();
            }
        } else {
            const committedSegmentCount = getCommittedScheduleSegmentCount(existingSchedule);
            if (scheduleSegments.length > committedSegmentCount) {
                const newSegments = scheduleSegments.slice(committedSegmentCount);
                appData.settings.pendingScheduleSegments[currentBlocklistId] = newSegments.map(seg => ({ ...seg }));
                saveData();
            } else {
                if (appData.settings.pendingScheduleSegments[currentBlocklistId]) {
                    delete appData.settings.pendingScheduleSegments[currentBlocklistId];
                    saveData();
                }
            }
        }
    } else {
        if (!appData.settings) appData.settings = {};
        if (!appData.settings.instantBlockDuration) appData.settings.instantBlockDuration = {};
        if (targetDurationMinutes !== 60) {
            appData.settings.instantBlockDuration[currentBlocklistId] = targetDurationMinutes;
            saveData();
        }
    }
    selectedBlocklistId = null;
    const blocklistSelect = document.getElementById('blocklist-select');
    blocklistSelect.value = '';
    handleBlocklistSelect({ target: blocklistSelect });
}

// Show start block confirmation modal
function startBlock() {
    if (!selectedBlocklistId) return;

    const blocklist = appData.blocklists.find(bl => bl.id === selectedBlocklistId);
    if (!blocklist) return;

    // Check if this is a "Stop Block" action (button is in stop mode)
    const startBlockBtn = document.getElementById('start-block-btn');
    if (startBlockBtn && startBlockBtn.dataset.activeBlockId) {
        // Verify the activeBlockId belongs to the currently selected blocklist
        const activeBlock = appData.activeBlocks.find(b =>
            b.id === startBlockBtn.dataset.activeBlockId &&
            b.blocklistId === selectedBlocklistId
        );

        if (activeBlock) {
            // Open override dialog instead of starting a new block
            openOverrideModal(startBlockBtn.dataset.activeBlockId);
            return;
        } else {
            // ActiveBlockId doesn't match selected blocklist - clear it and continue
            delete startBlockBtn.dataset.activeBlockId;
            startBlockBtn.classList.remove('stop-block');
        }
    }

    // Calculate duration for display
    let durationText = '';
    if (isAlwaysOnMode) {
        durationText = tSettings('alwaysUntilOff');
    } else {
        // Get times for display
        let blockStart = getStartTimeAsDate();
        let blockEnd = getEndTimeAsDate();
        if (blockEnd <= blockStart) {
            blockEnd.setDate(blockEnd.getDate() + 1);
        }

        const durationMs = blockEnd.getTime() - blockStart.getTime();
        const durationMinutes = Math.round(durationMs / 60000);
        const hours = Math.floor(durationMinutes / 60);
        const mins = durationMinutes % 60;
        if (hours > 0 && mins > 0) {
            durationText = `${hours}h ${mins}m`;
        } else if (hours > 0) {
            durationText = `${hours} hour${hours > 1 ? 's' : ''}`;
        } else {
            durationText = `${mins} minute${mins > 1 ? 's' : ''}`;
        }
    }

    // Populate blocklist name
    document.getElementById('start-confirm-name').textContent = blocklist.name;

    // Populate duration
    document.getElementById('start-confirm-duration').textContent = durationText;

    // Helper to format list with show all
    const formatListWithShowAll = (items, elementId, showAllBtnId, rowId) => {
        const valueEl = document.getElementById(elementId);
        const showAllBtn = document.getElementById(showAllBtnId);
        const rowEl = document.getElementById(rowId);

        if (!items || items.length === 0) {
            rowEl.classList.add('hidden');
            return;
        }

        rowEl.classList.remove('hidden');

        if (items.length <= 3) {
            valueEl.textContent = items.map(cleanUrlForDisplay).join(', ');
            showAllBtn.classList.add('hidden');
        } else {
            const displayItems = items.slice(0, 3).map(cleanUrlForDisplay);
            valueEl.textContent = displayItems.join(', ') + ', ...';
            showAllBtn.classList.remove('hidden');
            showAllBtn.onclick = () => {
                valueEl.textContent = items.map(cleanUrlForDisplay).join(', ');
                showAllBtn.classList.add('hidden');
            };
        }
    };

    // Populate websites
    formatListWithShowAll(blocklist.websites, 'start-confirm-websites', 'show-all-websites', 'websites-row');

    // Populate apps (apps don't need URL cleaning)
    const appsValueEl = document.getElementById('start-confirm-apps');
    const showAllAppsBtn = document.getElementById('show-all-apps');
    const appsRowEl = document.getElementById('apps-row');

    const displayApps = getBlocklistDisplayApps(blocklist);
    if (displayApps.length === 0) {
        appsRowEl.classList.add('hidden');
    } else {
        appsRowEl.classList.remove('hidden');
        if (displayApps.length <= 3) {
            appsValueEl.textContent = displayApps.join(', ');
            showAllAppsBtn.classList.add('hidden');
        } else {
            appsValueEl.textContent = displayApps.slice(0, 3).join(', ') + ', ...';
            showAllAppsBtn.classList.remove('hidden');
            showAllAppsBtn.onclick = () => {
                appsValueEl.textContent = displayApps.join(', ');
                showAllAppsBtn.classList.add('hidden');
            };
        }
    }

    // Build override difficulty text with time estimate
    const difficulty = blocklist.overrideDifficulty || { type: 'random-words', count: 50 };
    let overrideText = '';

    // Estimate typing time: ~20 chars/min for random/gibberish (it's slow!), ~30 for custom text
    let charCount = difficulty.count;
    let charsPerMinute = 150; // Conservative for random words (average typing is ~200 chars/min)

    if (difficulty.type === 'custom' && difficulty.customText) {
        charCount = difficulty.customText.length;
        charsPerMinute = 200; // Custom text is slightly easier (you can see the pattern)
        const estimatedMinutes = Math.ceil(charCount / charsPerMinute);
        overrideText = `Type a specific ${charCount}-character phrase exactly as shown (~${estimatedMinutes} min).`;
    } else if (difficulty.type === 'gibberish') {
        charsPerMinute = 100; // Gibberish is the hardest
        const estimatedMinutes = Math.ceil(charCount / charsPerMinute);
        const charWord = charCount === 1 ? 'character' : 'characters';
        overrideText = `Type ${charCount} random ${charWord} (letters and numbers) exactly as shown (~${estimatedMinutes} min).`;
    } else {
        const estimatedMinutes = Math.ceil(charCount / charsPerMinute);
        const charWord = charCount === 1 ? 'character' : 'characters';
        overrideText = `Type ${charCount} ${charWord} (displayed as random words) exactly as shown (~${estimatedMinutes} min).`;
    }

    document.getElementById('start-confirm-override-text').textContent = overrideText;

    // Show modal
    document.getElementById('start-block-confirm-modal').classList.remove('hidden');
}

// Close start block confirmation modal
function closeStartBlockConfirmModal() {
    document.getElementById('start-block-confirm-modal').classList.add('hidden');
    // Reset resume state and restore default text
    if (resumeData) {
        resumeData = null;
        document.querySelector('#start-block-confirm-modal .modal-content h3').textContent = 'Start this block?';
        document.getElementById('proceed-start-confirm-btn').textContent = tSettings('startBlock');
    }
}

// Actually start a block (called after confirmation)
async function proceedWithBlock() {
    // If this is a resume action, delegate to proceedWithResume
    if (resumeData) {
        await proceedWithResume();
        return;
    }

    // Close confirmation modal
    closeStartBlockConfirmModal();

    const startBtn = document.getElementById('start-block-btn');

    if (!selectedBlocklistId) return;

    // Get times from the custom time picker
    let blockStart = getStartTimeAsDate();
    let blockEnd;

    if (isAlwaysOnMode) {
        // Always-on: use far-future end time
        blockEnd = new Date(ALWAYS_ON_END_TIME);
    } else {
        blockEnd = getEndTimeAsDate();
        // If end is before or equal to start, assume end is next day
        if (blockEnd <= blockStart) {
            blockEnd.setDate(blockEnd.getDate() + 1);
        }
    }

    // Disable button while processing
    startBtn.disabled = true;
    startBtn.textContent = 'Starting...';

    const blocklist = appData.blocklists.find(bl => bl.id === selectedBlocklistId);
    if (!blocklist) {
        startBtn.disabled = false;
        startBtn.innerHTML = getStartBlockButtonHTML();
        return;
    }
    if (!ensureIOSBlocklistSelectionReady(blocklist, 'starting this block')) {
        startBtn.disabled = false;
        startBtn.innerHTML = getStartBlockButtonHTML();
        return;
    }

    const block = {
        id: generateId(),
        blocklistId: selectedBlocklistId,
        startTime: blockStart.getTime(),
        endTime: blockEnd.getTime()
    };

    // Mark always-on blocks with a flag for display purposes
    if (isAlwaysOnMode) {
        block.isAlwaysOn = true;
    }

    let result;

    if (isIOS) {
        // iOS: Use Screen Time API via plugin
        if (!screentimeAuthorized) {
            const authResult = await requestScreentimeAuth();
            if (!authResult.granted) {
                startBtn.disabled = false;
                startBtn.innerHTML = getStartBlockButtonHTML();
                if (authResult.status === 'denied') {
                    alert('Screen Time authorization was denied. Please go to Settings > Screen Time > ReDD Block and enable access.');
                } else if (authResult.error) {
                    alert('Screen Time authorization failed: ' + authResult.error);
                } else {
                    alert('Screen Time authorization is required to block websites. Please try again.');
                }
                updateOnboardingVisibility();
                return;
            }
            updateOnboardingVisibility();
        }

        try {
            // Apply union of all active blocks + active schedule segments (not just this blocklist).
            appData.activeBlocks.push(block);
            activatedBlockIds.add(block.id);
            const updateResult = await updateHostsFile();
            if (!updateResult.success) {
                appData.activeBlocks = appData.activeBlocks.filter(b => b.id !== block.id);
                activatedBlockIds.delete(block.id);
                result = { success: false, error: updateResult.error || 'Failed to update blocking' };
            } else {
                result = { success: true };
                // Register one-off DeviceActivity so block ends at endTime when app is closed
                // Register one-off DeviceActivity so block ends at endTime when app is closed (Option B: store this block's payload to remove)
                if (!block.isAlwaysOn && block.endTime < ALWAYS_ON_END_TIME) {
                    try {
                        const iosPayload = getBlocklistIOSPayload(blocklist);
                        await tauriAPI.screentimeSetBlockEndState({
                            blockId: block.id,
                            domains: Array.from(blocklist?.websites || []),
                            appTokenData: iosPayload.appTokenData,
                            categoryTokenData: iosPayload.categoryTokenData
                        });
                        const res = await tauriAPI.screentimeRegisterOneOffActivity('redd-block-end-' + block.id, block.endTime);
                        if (res && res.success === false) {
                            console.error('[iOS] One-off DeviceActivity registration failed:', res.error || 'Unknown error');
                        }
                    } catch (e) {
                        console.warn('[iOS] One-off block-end registration failed:', e);
                    }
                }
            }
        } catch (err) {
            appData.activeBlocks = appData.activeBlocks.filter(b => b.id !== block.id);
            activatedBlockIds.delete(block.id);
            result = { success: false, error: err.toString() };
        }
    } else {
        // Desktop: Try to use the helper daemon (no password required!)
        if (helperAvailable) {
            // Re-verify helper is still reachable before starting block (avoids stale "available" state on Windows)
            const status = await tauriAPI.checkHelperStatus();
            if (!status.running || !status.version_ok) {
                helperAvailable = false;
            }
        }
        // v2: the app process IS the helper. startBlockViaHelper is a
        // no-op shim that just acknowledges the save_data the
        // frontend already did. The legacy "is the helper installed?"
        // / install-modal branch was here.
        result = await tauriAPI.startBlockViaHelper({
            domains: blocklist.websites || [],
            endTime: blockEnd.getTime(),
            blocklistId: selectedBlocklistId
        });
    }

    if (!result.success) {
        // Re-enable button
        startBtn.disabled = false;
        startBtn.innerHTML = getStartBlockButtonHTML();

        // Only show error if user didn't cancel
        if (!result.cancelled) {
            if (isHelperConnectionError(result.error)) {
                helperAvailable = false;
                alert('The block service isn\'t running. Please open Settings, remove the helper, then try starting a block again to reinstall it.');
            } else {
                alert('Could not start block: ' + (result.error || 'Unknown error'));
            }
        }
        return;
    }

    // Add block to local data (desktop: push here; iOS already pushed in branch above)
    if (!isIOS && helperAvailable) {
        appData.activeBlocks.push(block);
        activatedBlockIds.add(block.id);
    }

    // Clear pending duration for this blocklist (it's now committed)
    if (appData.settings?.instantBlockDuration?.[selectedBlocklistId]) {
        delete appData.settings.instantBlockDuration[selectedBlocklistId];
    }

    // Save data and reset UI
    await saveData();

    // Update blocked apps (handles both active blocks and schedules)
    await updateBlockedApps();

    // Render UI to update blocklist cards (show ACTIVE badge)
    render();

    // Restore button HTML structure first (textContent = 'Starting...' wiped it)
    const startBtn2 = document.getElementById('start-block-btn');
    startBtn2.innerHTML = getStartBlockButtonHTML();
    startBtn2.disabled = false;

    // Ensure the blocklist stays selected in dropdown and update UI to show Stop Block button
    const blocklistSelect = document.getElementById('blocklist-select');
    blocklistSelect.value = selectedBlocklistId; // Make sure it's still set
    handleBlocklistSelect({ target: blocklistSelect });
}

// Helper function for start block button HTML (includes .btn-label, .btn-emoji and .btn-name for updateability)
function getStartBlockButtonHTML() {
    return `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
        </svg>
        <span class="btn-label">${getActionLabelHTML(tSettings('startBlockButton'))}</span>
        <span class="btn-emoji" aria-hidden="true"></span>
        <span class="btn-name"></span>
    `;
}

// Render an action label like "Stop Schedule:" / "Start blokering:" as two
// inner spans so narrow viewports can hide the trailing context (and the
// .btn-emoji + .btn-name beside it) and just show "Stop" / "Start". Splits
// at the first space so it works for any locale that follows verb-then-noun.
function getActionLabelHTML(fullText) {
    const safe = (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const text = String(fullText ?? '');
    const spaceIdx = text.indexOf(' ');
    if (spaceIdx <= 0) return safe(text);
    const action = text.slice(0, spaceIdx);
    const context = text.slice(spaceIdx);
    return `<span class="btn-label-action">${safe(action)}</span><span class="btn-label-context">${safe(context)}</span>`;
}

function setBtnActionLabel(el, fullText) {
    if (!el) return;
    el.innerHTML = getActionLabelHTML(fullText);
}

// Update both the emoji and name on a start/stop button so they stay in sync.
function setStartBtnBlocklistInfo(btn, blocklist) {
    if (!btn) return;
    const btnEmoji = btn.querySelector('.btn-emoji');
    const btnName = btn.querySelector('.btn-name');
    if (btnEmoji) btnEmoji.textContent = blocklist ? (blocklist.emoji || '🚫') : '';
    if (btnName) btnName.textContent = blocklist ? blocklist.name : '';
}


// Update hosts file based on active blocks
// silent = true means don't prompt for password (used for cleanup)
async function updateHostsFile(silent = false) {
    const allDomains = new Set();
    const now = Date.now();

    // Only block domains for blocks that are currently active and not paused
    appData.activeBlocks
        .filter(block => block.startTime <= now && block.endTime > now && !block.isPaused)
        .forEach(block => {
            const blocklist = appData.blocklists.find(bl => bl.id === block.blocklistId);
            if (blocklist && blocklist.websites) {
                blocklist.websites.forEach(domain => allDomains.add(domain));
            }
        });

    // Also check scheduled blocks - add domains if a schedule segment is currently active
    const nowDate = new Date();

    if (appData.schedules) {
        appData.schedules.forEach(schedule => {
            if (!schedule.segments) return;

            // Skip paused schedules
            if (schedule.isPaused && schedule.pauseEndTime > Date.now()) return;

            if (isScheduleSegmentActiveNow(schedule, nowDate)) {
                const blocklist = appData.blocklists.find(bl => bl.id === schedule.blocklistId);
                if (blocklist && blocklist.websites) {
                    blocklist.websites.forEach(domain => allDomains.add(domain));
                }
            }
        });
    }

    // Filter out protected domains (localhost etc. must never be blocked)
    const domainsArray = Array.from(allDomains)
        .filter(d => !isProtectedDomain(d))
        .sort();
    const lastDomainsArray = Array.from(lastBlockedDomains).sort();
    const domainsChanged = JSON.stringify(domainsArray) !== JSON.stringify(lastDomainsArray);

    // iOS: Use Screen Time API instead of helper daemon / hosts file
    // Only clear when there are no active blocks; when there are active blocks, always apply
    // (even when domainsArray is empty — app-only blocklists must still shield apps).
    if (isIOS) {
        try {
            const manualPayload = collectActiveIOSManualBlockPayload(now);
            const hasActiveBlocks = appData.activeBlocks.some(
                block => block.startTime <= now && block.endTime > now && !block.isPaused
            );
            const hasActiveScheduleSegments = (appData.schedules || []).some(schedule => {
                if (!schedule || !schedule.segments || schedule.segments.length === 0) return false;
                if (schedule.isPaused && schedule.pauseEndTime > now) return false;
                if (schedule.repeatType === 'date' && schedule.repeatDate) {
                    const endDate = new Date(schedule.repeatDate);
                    endDate.setHours(23, 59, 59, 999);
                    if (nowDate > endDate) return false;
                }
                return isScheduleSegmentActiveNow(schedule, nowDate);
            });
            if (!hasActiveBlocks) {
                if (hasActiveScheduleSegments) {
                    // Schedule enforcement on iOS is owned by the DeviceActivityMonitor extension.
                    // Avoid clearing stores here or we can wipe an active scheduled block.
                    console.log('[updateHostsFile] iOS: no manual blocks but schedule segment is active; keeping schedule enforcement');
                    lastBlockedDomains = new Set();
                    return { success: true };
                }
                console.log('[updateHostsFile] iOS: no active blocks, clearing Screen Time');
                await tauriAPI.screentimeClearBlock();
                lastBlockedDomains = new Set();
                return { success: true };
            }
            if (manualPayload.domains.length === 0) {
                console.log('[updateHostsFile] iOS: active blocks with no domains (app-only), applying app shield');
            } else {
                console.log('[updateHostsFile] iOS: starting Screen Time block for', manualPayload.domains);
            }
            await tauriAPI.screentimeStartBlock(manualPayload);
            lastBlockedDomains = new Set(manualPayload.domains);
            return { success: true };
        } catch (err) {
            console.error('[updateHostsFile] iOS Screen Time error:', err);
            return { success: false, error: err.toString() };
        }
    }

    if (!domainsChanged) {
        return { success: true, unchanged: true };
    }

    // Try to use helper daemon first (works on all platforms)
    try {
        console.log('[updateHostsFile] Checking helper status...');
        const status = await tauriAPI.checkHelperStatus();
        console.log('[updateHostsFile] Helper status:', status);

        if (status.running && status.version_ok) {
            console.log('[updateHostsFile] Helper running with correct version, using helper to update blocks');
            helperAvailable = true;
            await syncActiveBlocksToHelper();
            await syncSchedulesToHelper();
            lastBlockedDomains = allDomains;
            await updateBlockedApps();
            return { success: true };
        } else {
            console.log('[updateHostsFile] Helper NOT running, falling back');
        }
    } catch (e) {
        console.warn('Helper not available, falling back to direct method:', e);
    }

    // For silent cleanup without the helper, defer instead of triggering an elevation prompt.
    if (silent && allDomains.size < lastBlockedDomains.size) {
        return { success: true, deferred: true };
    }

    // Fallback to direct hosts file modification (macOS)
    console.log('[updateHostsFile] Calling fallback block-websites');
    const result = await tauriAPI.blockWebsites(domainsArray);

    if (result && result.success) {
        lastBlockedDomains = allDomains;
        // Update blocked apps based on active blocks and schedules
        await updateBlockedApps();
    }

    return result || { success: true };
}

// Update blocked apps sent to the in-process app watcher (desktop only).
// Computes the effective union of apps from active one-off blocks AND active schedule
// segments. Both sources are evaluated on the frontend now that the legacy helper
// daemon (which previously merged schedule + manual apps internally) is gone.
async function updateBlockedApps() {
    // iOS uses Screen Time API for app blocking - skip desktop process watcher
    if (isIOS) return;

    const allBlockedApps = new Set();
    const now = Date.now();
    const nowDate = new Date(now);

    // Collect apps from active one-off blocks (skip paused / out-of-window).
    appData.activeBlocks
        .filter(block => block.startTime <= now && block.endTime > now && !block.isPaused)
        .forEach(block => {
            const blocklist = appData.blocklists.find(bl => bl.id === block.blocklistId);
            if (blocklist && blocklist.apps) {
                blocklist.apps.forEach(app => allBlockedApps.add(app));
            }
        });

    // Collect apps from schedules whose segment is currently active (skip paused).
    // Mirrors the schedule-domain logic in updateHostsFile().
    if (appData.schedules) {
        appData.schedules.forEach(schedule => {
            if (!schedule.segments) return;
            if (isSchedulePausedNow(schedule, now)) return;
            if (!isScheduleSegmentActiveNow(schedule, nowDate)) return;
            const blocklist = appData.blocklists.find(bl => bl.id === schedule.blocklistId);
            if (blocklist && blocklist.apps) {
                blocklist.apps.forEach(app => allBlockedApps.add(app));
            }
        });
    }

    // Filter out protected apps (ReDD Block must never block itself)
    const appsArray = Array.from(allBlockedApps)
        .filter(app => !isProtectedApp(app))
        .sort();

    // Send blocked apps to helper daemon
    let helperReady = helperAvailable;
    if (!helperReady && appsArray.length > 0) {
        try {
            const status = await tauriAPI.checkHelperStatus();
            helperReady = !!(status.running && status.version_ok);
            helperAvailable = helperReady;
        } catch (e) {
            console.warn('[updateBlockedApps] Helper status re-check failed:', e);
        }
    }

    if (helperReady) {
        try {
            const result = await tauriAPI.setBlockedAppsViaHelper(appsArray);
            if (result && result.success) {
                console.log('[updateBlockedApps] Apps set via helper daemon:', appsArray.length, 'apps');
            } else {
                console.warn('[updateBlockedApps] Helper failed to set blocked apps:', result?.error);
            }
        } catch (e) {
            console.warn('[updateBlockedApps] Failed to set blocked apps via helper:', e);
        }
    } else if (appsArray.length > 0) {
        console.warn('[updateBlockedApps] Helper not available - app blocking requires the helper daemon');
    }
}

// Tint the websites and apps inputs in the Edit Blocklist modal with
// the blocklist's currently-selected colour. The CSS rule reads
// --blocklist-tint via color-mix() and softens the pastel down so it
// reads as a wash in light mode and as a subtle hint of colour in
// dark mode. Called when the modal opens, when the user picks a
// preset colour swatch, and when the user picks a custom colour.
// Pass null on close to drop the inline style cleanly.
function applyModalBlocklistTint(hexColor) {
    const modal = document.getElementById('blocklist-modal');
    if (!modal) return;
    if (typeof hexColor === 'string' && hexColor.startsWith('#')) {
        modal.style.setProperty('--blocklist-tint', hexColor);
    } else {
        modal.style.removeProperty('--blocklist-tint');
    }
}

// Open blocklist modal
function openBlocklistModal(blocklist = null) {
    editingBlocklistId = blocklist?.id || null;
    blocklistModalPreviewSnapshot = null;

    if (editingBlocklistId) {
        const original = appData.blocklists.find(b => b.id === editingBlocklistId);
        if (original) {
            blocklistModalPreviewSnapshot = {
                showItemDetails: original.showItemDetails
            };
        }
    }

    document.getElementById('modal-title').textContent = blocklist ? tSettings('editBlocklist') : tSettings('createBlocklist');

    document.getElementById('blocklist-name').value = blocklist?.name || '';
    document.getElementById('blocklist-name').classList.remove('input-error');
    lastBlocklistNameValue = blocklist?.name || '';

    const normalizedDifficulty = cloneOverrideDifficulty(blocklist?.overrideDifficulty, 10);
    document.getElementById('override-type').value = normalizedDifficulty.type;
    document.getElementById('override-count').value = normalizedDifficulty.count;
    document.getElementById('custom-override-text').value = normalizedDifficulty.customText || '';
    const maxDifficultyCb = document.getElementById('override-max-difficulty-checkbox');
    const maxDifficulty = normalizedDifficulty.maxDifficulty === true;
    if (maxDifficultyCb) maxDifficultyCb.checked = maxDifficulty;

    const type = normalizedDifficulty.type;
    const overrideCountField = document.getElementById('override-count');
    const customTextArea = document.getElementById('custom-override-text');
    applyOverrideTypeUi(type);
    overrideCountField.value = normalizeOverrideCount(overrideCountField.value, type);
    customTextArea.maxLength = getMaxOverrideCharsForType('custom');
    customTextArea.value = normalizeCustomOverrideText(customTextArea.value);
    lastOverrideCountValue = String(overrideCountField.value);
    lastCustomOverrideTextValue = customTextArea.value;
    lastOverrideTypeValue = document.getElementById('override-type').value;

    if (maxDifficulty) {
        lastOverrideCountValueBeforeMaxDifficulty = normalizedDifficulty.countBeforeMax ?? 50;
        lastOverrideTypeValueBeforeMaxDifficulty = normalizedDifficulty.typeBeforeMax ?? 'random-words';
        const maxCount = getMaxOverrideCharsForType(type);
        overrideCountField.value = String(maxCount);
        overrideCountField.max = String(maxCount);
        setOverrideCountMaxMode(true);
    } else {
        setOverrideCountMaxMode(false);
    }
    lastOverrideCountValue = String(overrideCountField.value);

    // Restore color swatch selection
    document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('selected'));

    let colorToSelect = blocklist?.color;

    // If creating a new blocklist (or no color set), find the first unused color
    if (!colorToSelect) {
        const usedColors = new Set(appData.blocklists.map(bl => bl.color));
        const swatches = Array.from(document.querySelectorAll('.color-swatch:not(.custom-swatch)'));

        // Find first color from the palette that isn't used
        const firstUnused = swatches.find(s => !usedColors.has(s.dataset.color));

        if (firstUnused) {
            colorToSelect = firstUnused.dataset.color;
        } else if (swatches.length > 0) {
            // If all are used, wrap around to the first one
            colorToSelect = swatches[0].dataset.color;
        } else {
            // Fallback default — first colour in the palette.
            colorToSelect = '#B8D1DE';
        }
    }

    const matchingSwatch = document.querySelector(`.color-swatch[data-color="${colorToSelect}"]:not(.custom-swatch)`);
    if (matchingSwatch) {
        matchingSwatch.classList.add('selected');
    } else {
        // Must be a custom color
        const customSwatch = document.getElementById('custom-color-swatch');
        if (customSwatch) {
            customSwatch.style.background = colorToSelect;
            customSwatch.dataset.color = colorToSelect;
            customSwatch.classList.add('selected');
        }
    }

    applyModalBlocklistTint(colorToSelect);

    // Restore emoji swatch selection
    document.querySelectorAll('.emoji-swatch').forEach(s => s.classList.remove('selected'));

    let emojiToSelect = blocklist?.emoji;

    // If creating a new blocklist (or no emoji set), find the first unused emoji
    if (!emojiToSelect) {
        const usedEmojis = new Set(appData.blocklists.map(bl => bl.emoji));
        const emojiSwatches = Array.from(document.querySelectorAll('.emoji-swatch:not(.custom-emoji-swatch)'));

        // Find first emoji from the palette that isn't used
        const firstUnused = emojiSwatches.find(s => !usedEmojis.has(s.dataset.emoji));

        if (firstUnused) {
            emojiToSelect = firstUnused.dataset.emoji;
        } else if (emojiSwatches.length > 0) {
            // If all are used, wrap around to the first one
            emojiToSelect = emojiSwatches[0].dataset.emoji;
        } else {
            // Fallback default
            emojiToSelect = '🚫';
        }
    }

    const matchingEmoji = document.querySelector(`.emoji-swatch[data-emoji="${emojiToSelect}"]:not(.custom-emoji-swatch)`);
    if (matchingEmoji) {
        matchingEmoji.classList.add('selected');
    } else {
        // Must be a custom emoji
        const customEmojiSwatch = document.getElementById('custom-emoji-swatch');
        if (customEmojiSwatch) {
            customEmojiSwatch.innerHTML = emojiToSelect;
            customEmojiSwatch.dataset.emoji = emojiToSelect;
            customEmojiSwatch.classList.add('selected');
        }
    }

    // Check if active (block or schedule)
    const now = Date.now();
    const hasActiveBlock = blocklist?.id && appData.activeBlocks.some(
        b => b.blocklistId === blocklist.id && b.startTime <= now && b.endTime > now
    );
    const hasActiveSchedule = blocklist?.id && appData.schedules?.some(
        s => s.blocklistId === blocklist.id && s.segments && s.segments.length > 0
    );
    const isActive = hasActiveBlock || hasActiveSchedule;

    const warningEl = document.getElementById('active-blocklist-warning');
    const modeInputs = document.getElementById('blocklist-modal').querySelectorAll('.radio-option');
    const overrideInputs = [
        document.getElementById('override-type'),
        document.getElementById('override-count'),
        document.getElementById('custom-override-text'),
        document.getElementById('override-max-difficulty-checkbox')
    ];
    const maxDifficultyWrap = document.getElementById('override-max-difficulty-wrap');

    // Get override elements for styling
    const overrideTypeSelect = document.getElementById('override-type');
    const overrideCountInput = document.getElementById('override-count');
    const overrideCountWrapperEl = document.getElementById('override-count-wrapper');
    const inputSuffix = overrideCountWrapperEl?.querySelector('.input-suffix');

    if (isActive) {
        warningEl.classList.remove('hidden');
        modeInputs.forEach(el => el.classList.add('disabled'));
        overrideInputs.forEach(el => el.disabled = true);

        // Style override type dropdown (like repeat dropdown)
        if (overrideTypeSelect) {
            overrideTypeSelect.classList.add('form-select-disabled');
        }

        // Style override count input (like repeat dropdown)
        if (overrideCountInput) {
            overrideCountInput.classList.add('form-input-disabled');
        }

        // Style the "total characters" text (same color as Start/End labels)
        if (inputSuffix) {
            inputSuffix.classList.add('input-suffix-disabled');
        }
        if (maxDifficultyWrap) maxDifficultyWrap.classList.add('max-difficulty-disabled');

        // Pass existing items as locked
        window.setModalData(
            blocklist.websites || [],
            getBlocklistRegularApps(blocklist),
            getBlocklistIOSScreenTimeSelection(blocklist),
            blocklist.websites || [],
            getBlocklistDisplayApps(blocklist)
        );
    } else {
        warningEl.classList.add('hidden');
        modeInputs.forEach(el => el.classList.remove('disabled'));
        overrideInputs.forEach(el => el.disabled = false);

        // Remove disabled styling
        if (overrideTypeSelect) {
            overrideTypeSelect.classList.remove('form-select-disabled');
        }
        if (overrideCountInput) {
            overrideCountInput.classList.remove('form-input-disabled');
        }
        if (inputSuffix) {
            inputSuffix.classList.remove('input-suffix-disabled');
        }
        if (maxDifficultyWrap) maxDifficultyWrap.classList.remove('max-difficulty-disabled');

        window.setModalData(
            blocklist?.websites || [],
            getBlocklistRegularApps(blocklist),
            getBlocklistIOSScreenTimeSelection(blocklist),
            [],
            []
        );
    }

    // Re-apply max-difficulty grey-out for count when blocklist is not active (above else branch removes it)
    if (!isActive && document.getElementById('override-max-difficulty-checkbox')?.checked) {
        setOverrideCountMaxMode(true);
    }

    // Set advanced options - default to checked (true) if not set
    const showItemDetailsCheckbox = document.getElementById('show-item-details-checkbox');
    if (showItemDetailsCheckbox) {
        showItemDetailsCheckbox.checked = blocklist?.showItemDetails !== false;
        showItemDetailsCheckbox.onchange = () => {
            if (!editingBlocklistId) return;
            const bl = appData.blocklists.find(b => b.id === editingBlocklistId);
            if (!bl) return;
            bl.showItemDetails = showItemDetailsCheckbox.checked;
            renderBlocklists();
        };
    }

    // Reset advanced options to collapsed state
    const blocklistAdvancedToggle = document.getElementById('blocklist-advanced-toggle');
    const blocklistAdvancedContent = document.getElementById('blocklist-advanced-content');
    if (blocklistAdvancedToggle && blocklistAdvancedContent) {
        blocklistAdvancedToggle.classList.remove('expanded');
        blocklistAdvancedContent.classList.add('hidden');
    }

    document.getElementById('blocklist-modal').classList.remove('hidden');

    // Reset scroll position after modal is shown
    const modalContent = document.querySelector('#blocklist-modal .modal-content');
    if (modalContent) modalContent.scrollTop = 0;
}

// Close blocklist modal
function closeBlocklistModal() {
    blocklistModalUndoStack.length = 0;
    blocklistModalApplyingUndo = false;
    lastBlocklistNameValue = '';
    lastOverrideCountValue = '';
    lastCustomOverrideTextValue = '';
    lastOverrideTypeValue = '';
    lastOverrideCountValueBeforeMaxDifficulty = 50;
    lastOverrideTypeValueBeforeMaxDifficulty = 'random-words';
    overridePreviewFrozenByType = { 'random-words': null, 'gibberish': null };
    lastOverridePreviewType = null;
    setOverrideCountMaxMode(false);

    // Revert temporary live-preview edits if dialog closes without save.
    if (editingBlocklistId && blocklistModalPreviewSnapshot) {
        const bl = appData.blocklists.find(b => b.id === editingBlocklistId);
        if (bl) {
            bl.showItemDetails = blocklistModalPreviewSnapshot.showItemDetails;
            renderWeekBlocks();
            renderBlocklists();
        }
    }

    const showItemDetailsCheckbox = document.getElementById('show-item-details-checkbox');
    if (showItemDetailsCheckbox) showItemDetailsCheckbox.onchange = null;

    // Reset the websites Import popover so it starts closed next open.
    const importMenu = document.getElementById('websites-import-menu');
    const importBtn = document.getElementById('modal-import-websites-btn');
    if (importMenu) importMenu.classList.add('hidden');
    if (importBtn) importBtn.setAttribute('aria-expanded', 'false');

    blocklistModalPreviewSnapshot = null;
    document.getElementById('blocklist-modal').classList.add('hidden');
    applyModalBlocklistTint(null);
    editingBlocklistId = null;
    document.getElementById('blocklist-name').value = '';
    window.setModalData([], [], null);
}

// Open override modal
function openOverrideModal(blockId) {
    overrideBlockId = blockId;
    const block = appData.activeBlocks.find(b => b.id === blockId);
    overrideBlocklistIdForHelper = block ? block.blocklistId : null;

    const blocklist = appData.blocklists.find(bl => bl.id === block?.blocklistId);

    if (!blocklist) return;

    // Set modal title with blocklist name
    document.getElementById('override-modal-title').textContent = `Override ${blocklist.name}?`;

    // Set summary text
    const websiteCount = blocklist.websites?.length || 0;
    const displayApps = getBlocklistDisplayApps(blocklist);
    const appCount = displayApps.length;
    const mode = blocklist.mode === 'allowlist' ? 'Allows' : 'Blocks';

    let metaParts = [];

    if (websiteCount > 0) {
        const displaySites = blocklist.websites.map(cleanUrlForDisplay);
        if (websiteCount <= 3) {
            metaParts.push(`${websiteCount} ${websiteWord(websiteCount)} (${displaySites.join(', ')})`);
        } else {
            metaParts.push(`${websiteCount} ${websiteWord(websiteCount)} (${displaySites.slice(0, 3).join(', ')}, ...)`);
        }
    }

    if (appCount > 0) {
        if (appCount <= 3) {
            metaParts.push(`${appCount} ${appCount === 1 ? 'app' : 'apps'} (${displayApps.join(', ')})`);
        } else {
            metaParts.push(`${appCount} apps (${displayApps.slice(0, 3).join(', ')}, ...)`);
        }
    }

    const itemsText = metaParts.length > 0 ? metaParts.join(` ${tSettings('andWord')} `) : tSettings('nothingWord');
    document.getElementById('override-summary').textContent = `${mode} ${itemsText}`;

    const difficulty = blocklist.overrideDifficulty || { type: 'random-words', count: 50 };

    // Generate challenge text
    if (difficulty.type === 'custom' && difficulty.customText) {
        challengeText = difficulty.customText;
    } else if (difficulty.type === 'gibberish') {
        challengeText = generateGibberish(difficulty.count);
    } else {
        challengeText = generateRandomWords(difficulty.count);
    }

    // Sanitize: remove linebreaks and collapse multiple spaces
    challengeText = challengeText.replace(/[\r\n]+/g, ' ').replace(/\s{2,}/g, ' ').trim();

    document.getElementById('challenge-text').textContent = challengeText;
    document.getElementById('challenge-input').value = '';

    const progressBar = document.getElementById('challenge-progress-bar');
    progressBar.style.width = '0%';
    // Use the blocklist's color for the progress bar
    if (blocklist.color) {
        progressBar.style.background = blocklist.color;
    } else {
        progressBar.style.background = 'linear-gradient(90deg, #667eea 0%, #764ba2 100%)';
    }

    // Reset wiggle state
    document.querySelector('#override-modal .modal-content').classList.remove('wiggle');

    document.getElementById('override-modal').classList.remove('hidden');
}

// Close override modal
function closeOverrideModal() {
    document.getElementById('override-modal').classList.add('hidden');
    overrideBlockId = null;
    overrideBlocklistIdForHelper = null;
    challengeText = '';
}

// ── Pause/Resume Block ──

// Update the pause button's icon and text based on whether the block/schedule is paused
function updatePauseButtonAppearance(isPaused) {
    const pauseBtn = document.getElementById('pause-block-btn');
    if (!pauseBtn) return;

    const svg = pauseBtn.querySelector('svg');
    const span = pauseBtn.querySelector('span');

    if (isPaused) {
        // Show play icon and "Resume" text
        if (svg) {
            svg.innerHTML = '<polygon points="5 3 19 12 5 21 5 3"></polygon>';
        }
        if (span) span.textContent = 'Resume';
        pauseBtn.classList.add('resume-mode');
    } else {
        // Show pause icon and "Pause" text
        if (svg) {
            svg.innerHTML = '<rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect>';
        }
        if (span) span.textContent = 'Pause';
        pauseBtn.classList.remove('resume-mode');
    }
}

// Open the resume confirmation dialog (reuses start-block-confirm modal)
let resumeData = null; // { blocklistId, type: 'block'|'schedule', blockId }

function openResumeConfirmation(blocklistId, type, blockId) {
    const blocklist = appData.blocklists.find(bl => bl.id === blocklistId);
    if (!blocklist) return;

    resumeData = { blocklistId, type, blockId };

    // Set heading
    document.querySelector('#start-block-confirm-modal .modal-content h3').textContent = 'Resume this block?';

    // Set blocklist name
    document.getElementById('start-confirm-name').textContent = blocklist.name;

    // Set duration text
    if (type === 'block') {
        const block = appData.activeBlocks.find(b => b.id === blockId);
        if (block) {
            const remainingMs = block.endTime - Date.now();
            if (isBlockAlwaysOn(block)) {
                document.getElementById('start-confirm-duration').textContent = tSettings('alwaysUntilOff');
            } else {
                const remainingMins = Math.max(1, Math.floor(remainingMs / 60000));
                const hours = Math.floor(remainingMins / 60);
                const mins = remainingMins % 60;
                let dText = '';
                if (hours > 0 && mins > 0) dText = `${hours}h ${mins}m remaining`;
                else if (hours > 0) dText = `${hours} hour${hours > 1 ? 's' : ''} remaining`;
                else dText = `${mins} minute${mins > 1 ? 's' : ''} remaining`;
                document.getElementById('start-confirm-duration').textContent = dText;
            }
        }
    } else {
        document.getElementById('start-confirm-duration').textContent = tSettings('scheduleResumingSegment');
    }

    // Populate websites
    const websitesRow = document.getElementById('websites-row');
    const websitesEl = document.getElementById('start-confirm-websites');
    const showAllWebsites = document.getElementById('show-all-websites');
    if (blocklist.websites && blocklist.websites.length > 0) {
        websitesRow.classList.remove('hidden');
        if (blocklist.websites.length <= 3) {
            websitesEl.textContent = blocklist.websites.map(cleanUrlForDisplay).join(', ');
            showAllWebsites.classList.add('hidden');
        } else {
            websitesEl.textContent = blocklist.websites.slice(0, 3).map(cleanUrlForDisplay).join(', ') + ', ...';
            showAllWebsites.classList.remove('hidden');
            showAllWebsites.onclick = () => {
                websitesEl.textContent = blocklist.websites.map(cleanUrlForDisplay).join(', ');
                showAllWebsites.classList.add('hidden');
            };
        }
    } else {
        websitesRow.classList.add('hidden');
    }

    // Populate apps
    const appsRow = document.getElementById('apps-row');
    const appsEl = document.getElementById('start-confirm-apps');
    const showAllApps = document.getElementById('show-all-apps');
    const displayApps = getBlocklistDisplayApps(blocklist);
    if (displayApps.length > 0) {
        appsRow.classList.remove('hidden');
        if (displayApps.length <= 3) {
            appsEl.textContent = displayApps.join(', ');
            showAllApps.classList.add('hidden');
        } else {
            appsEl.textContent = displayApps.slice(0, 3).join(', ') + ', ...';
            showAllApps.classList.remove('hidden');
            showAllApps.onclick = () => {
                appsEl.textContent = displayApps.join(', ');
                showAllApps.classList.add('hidden');
            };
        }
    } else {
        appsRow.classList.add('hidden');
    }

    // Override info
    const difficulty = blocklist.overrideDifficulty || { type: 'random-words', count: 50 };
    let overrideText = '';
    let charCount = difficulty.count;

    if (difficulty.type === 'custom' && difficulty.customText) {
        charCount = difficulty.customText.length;
        const estimatedMinutes = Math.ceil(charCount / 200);
        overrideText = `Type a specific ${charCount}-character phrase exactly as shown (~${estimatedMinutes} min).`;
    } else if (difficulty.type === 'gibberish') {
        const estimatedMinutes = Math.ceil(charCount / 100);
        overrideText = `Type ${charCount} random characters exactly as shown (~${estimatedMinutes} min).`;
    } else {
        const estimatedMinutes = Math.ceil(charCount / 150);
        overrideText = `Type ${charCount} characters (displayed as random words) exactly as shown (~${estimatedMinutes} min).`;
    }
    document.getElementById('start-confirm-override-text').textContent = overrideText;

    // Change confirm button text
    document.getElementById('proceed-start-confirm-btn').textContent = tSettings('resumeBlock');

    // Show modal
    document.getElementById('start-block-confirm-modal').classList.remove('hidden');
}

// Actually resume a paused block/schedule
async function proceedWithResume() {
    if (!resumeData) return;

    // Save locally before closeStartBlockConfirmModal clears resumeData
    const { type, blockId, blocklistId } = resumeData;

    closeStartBlockConfirmModal();

    if (type === 'block') {
        const block = appData.activeBlocks.find(b => b.id === blockId);
        if (block) {
            delete block.isPaused;
            delete block.pauseEndTime;
        }
    } else if (type === 'schedule') {
        const schedule = appData.schedules?.find(s => s.blocklistId === blocklistId);
        if (schedule) {
            delete schedule.isPaused;
            delete schedule.pauseEndTime;
        }
    }

    resumeData = null;

    await saveData();
    console.log('[pause-resume] Proceeding with resume sync', { type, blockId, blocklistId });
    await syncActiveBlocksToHelper();
    await syncSchedulesToHelper();
    await updateHostsFile();
    await updateBlockedApps();
    render();

    // Update pause button back to Pause appearance
    updatePauseButtonAppearance(false);
}

// ── Pause Block Modal ──

function openPauseModal(blockId) {
    pauseBlockId = blockId;

    let block, blocklist;

    if (blockId) {
        // One-off block pause
        block = appData.activeBlocks.find(b => b.id === blockId);
        blocklist = appData.blocklists.find(bl => bl.id === block?.blocklistId);
    } else if (pauseScheduleData) {
        // Schedule pause — create a synthetic block object
        blocklist = appData.blocklists.find(bl => bl.id === pauseScheduleData.blocklistId);
        block = {
            id: null,
            blocklistId: pauseScheduleData.blocklistId,
            startTime: Date.now(),
            endTime: ALWAYS_ON_END_TIME,
            isScheduleBlock: true
        };
    }

    if (!blocklist) return;

    // Set modal title
    document.getElementById('pause-modal-title').textContent = `Pause ${blocklist.name}`;

    // Set summary (same format as override modal)
    const websiteCount = blocklist.websites?.length || 0;
    const displayApps = getBlocklistDisplayApps(blocklist);
    const appCount = displayApps.length;
    const mode = blocklist.mode === 'allowlist' ? 'Allows' : 'Blocks';

    let metaParts = [];
    if (websiteCount > 0) {
        const displaySites = blocklist.websites.map(cleanUrlForDisplay);
        if (websiteCount <= 2) {
            metaParts.push(`${websiteCount} ${websiteWord(websiteCount)} (${displaySites.join(', ')})`);
        } else {
            metaParts.push(`${websiteCount} ${websiteWord(websiteCount)} (${displaySites.slice(0, 2).join(', ')}, ...)`);
        }
    }
    if (appCount > 0) {
        if (appCount <= 2) {
            metaParts.push(`${appCount} ${appCount === 1 ? 'app' : 'apps'} (${displayApps.join(', ')})`);
        } else {
            metaParts.push(`${appCount} apps (${displayApps.slice(0, 2).join(', ')}, ...)`);
        }
    }

    const itemsText = metaParts.length > 0 ? metaParts.join(` ${tSettings('andWord')} `) : tSettings('nothingWord');
    document.getElementById('pause-summary').textContent = `${mode} ${itemsText}`;

    // Calculate remaining time and max pause duration
    const remainingInfo = document.getElementById('pause-remaining-info');
    const daysGroup = document.getElementById('pause-days').closest('.pause-time-input-group');
    const hoursGroup = document.getElementById('pause-hours').closest('.pause-time-input-group');

    if (!isBlockAlwaysOn(block)) {
        const remainingMs = block.endTime - Date.now();
        const remainingMins = Math.floor(remainingMs / 60000);
        pauseMaxMinutes = Math.max(1, remainingMins - 2); // 2 min buffer

        // Format remaining time and max pause for display
        const remDays = Math.floor(remainingMins / (24 * 60));
        const remHours = Math.floor((remainingMins % (24 * 60)) / 60);
        const remMins = remainingMins % 60;
        let remParts = [];
        if (remDays > 0) remParts.push(`${remDays}d`);
        if (remHours > 0) remParts.push(`${remHours}h`);
        if (remMins > 0 || remParts.length === 0) remParts.push(`${remMins}m`);

        remainingInfo.textContent = `Block ends in ${remParts.join(' ')}`;
        remainingInfo.classList.remove('hidden');

        // Show/hide fields based on max pause
        if (pauseMaxMinutes < 60) {
            // Less than 1 hour max: hide days and hours
            daysGroup.style.display = 'none';
            hoursGroup.style.display = 'none';
        } else if (pauseMaxMinutes < 24 * 60) {
            // Less than 1 day max: hide days
            daysGroup.style.display = 'none';
            hoursGroup.style.display = '';
        } else {
            daysGroup.style.display = '';
            hoursGroup.style.display = '';
        }
    } else {
        pauseMaxMinutes = null; // No cap for always-on blocks
        if (pauseScheduleData) {
            if (pauseScheduleData.isActiveNow) {
                remainingInfo.classList.add('hidden');
            } else {
                remainingInfo.textContent = 'No scheduled block is active now. Upcoming scheduled blocks will be paused until pause ends.';
                remainingInfo.classList.remove('hidden');
            }
        } else {
            remainingInfo.classList.add('hidden');
        }
        daysGroup.style.display = '';
        hoursGroup.style.display = '';
    }

    // Reset duration inputs
    const defaultMins = pauseMaxMinutes !== null ? Math.min(15, pauseMaxMinutes) : 15;
    document.getElementById('pause-days').value = 0;
    document.getElementById('pause-hours').value = 0;
    document.getElementById('pause-minutes').value = defaultMins;
    initPauseRestartPopovers();
    updatePauseRestartTime();

    // Generate challenge text
    const difficulty = blocklist.overrideDifficulty || { type: 'random-words', count: 50 };
    if (difficulty.type === 'custom' && difficulty.customText) {
        pauseChallengeText = difficulty.customText;
    } else if (difficulty.type === 'gibberish') {
        pauseChallengeText = generateGibberish(difficulty.count);
    } else {
        pauseChallengeText = generateRandomWords(difficulty.count);
    }

    pauseChallengeText = pauseChallengeText.replace(/[\r\n]+/g, ' ').replace(/\s{2,}/g, ' ').trim();

    document.getElementById('pause-challenge-text').textContent = pauseChallengeText;
    document.getElementById('pause-challenge-input').value = '';
    document.getElementById('confirm-pause-btn').disabled = true;

    const progressBar = document.getElementById('pause-challenge-progress-bar');
    progressBar.style.width = '0%';
    if (blocklist.color) {
        progressBar.style.background = blocklist.color;
    } else {
        progressBar.style.background = 'linear-gradient(90deg, #667eea 0%, #764ba2 100%)';
    }

    // Reset wiggle
    document.querySelector('#pause-modal .modal-content').classList.remove('wiggle');

    document.getElementById('pause-modal').classList.remove('hidden');
    requestAnimationFrame(() => {
        syncPauseDurationRowLayout();
    });
}

/** Pause modal: use horizontal row only if it fits; otherwise stack (hide arrow). */
function syncPauseDurationRowLayout() {
    const modal = document.getElementById('pause-modal');
    if (!modal || modal.classList.contains('hidden')) return;
    const row = modal.querySelector('.pause-duration-row');
    if (!row) return;
    row.classList.remove('pause-duration-row--stacked');
    void row.offsetWidth;
    if (row.scrollWidth > row.clientWidth + 1) {
        row.classList.add('pause-duration-row--stacked');
    }
}

function closePauseModal() {
    document.getElementById('pause-modal').classList.add('hidden');
    pauseBlockId = null;
    pauseScheduleData = null;
    pauseChallengeText = '';
}

function updatePauseRestartTime() {
    let days = parseInt(document.getElementById('pause-days').value) || 0;
    let hours = parseInt(document.getElementById('pause-hours').value) || 0;
    let minutes = parseInt(document.getElementById('pause-minutes').value) || 0;

    let totalMinutes = days * 24 * 60 + hours * 60 + minutes;

    // Clamp to max if set
    if (pauseMaxMinutes !== null && totalMinutes > pauseMaxMinutes) {
        totalMinutes = pauseMaxMinutes;
        days = Math.floor(totalMinutes / (24 * 60));
        const rem = totalMinutes % (24 * 60);
        hours = Math.floor(rem / 60);
        minutes = rem % 60;
        document.getElementById('pause-days').value = days;
        document.getElementById('pause-hours').value = hours;
        document.getElementById('pause-minutes').value = minutes;
    }

    const restartTime = new Date(Date.now() + totalMinutes * 60 * 1000);

    // Update time-part buttons
    const hourBtn = document.getElementById('pause-restart-hour-btn');
    const minuteBtn = document.getElementById('pause-restart-minute-btn');
    if (hourBtn) hourBtn.textContent = pad(restartTime.getHours());
    if (minuteBtn) minuteBtn.textContent = pad(restartTime.getMinutes());

    // Show +N days badge if restart is not today
    const today = new Date();
    const nextDayBadge = document.getElementById('pause-next-day-indicator');
    if (nextDayBadge) {
        // Calculate day difference
        const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        const restartStart = new Date(restartTime.getFullYear(), restartTime.getMonth(), restartTime.getDate());
        const dayDiff = Math.round((restartStart - todayStart) / (24 * 60 * 60 * 1000));
        if (dayDiff > 0) {
            nextDayBadge.textContent = `+${dayDiff} ${dayDiff === 1 ? 'day' : 'days'}`;
            nextDayBadge.classList.remove('hidden');
        } else {
            nextDayBadge.classList.add('hidden');
        }
    }

    // Update selected state in popovers
    updatePauseRestartPopoverSelection(restartTime.getHours(), restartTime.getMinutes());
    syncPauseDurationRowLayout();
}

function updatePauseRestartPopoverSelection(hour, minute) {
    document.querySelectorAll('#pause-restart-hour-options .popover-option').forEach(btn => {
        btn.classList.toggle('selected', parseInt(btn.dataset.value) === hour);
    });
    document.querySelectorAll('#pause-restart-minute-options .popover-option').forEach(btn => {
        btn.classList.toggle('selected', parseInt(btn.dataset.value) === minute);
    });
}

// Initialize pause restart time popovers with hour/minute options
function initPauseRestartPopovers() {
    const hourContainer = document.getElementById('pause-restart-hour-options');
    if (hourContainer) {
        hourContainer.innerHTML = '';
        for (let h = 0; h < 24; h++) {
            const btn = document.createElement('button');
            btn.className = 'popover-option';
            btn.textContent = pad(h);
            btn.dataset.value = h;
            btn.dataset.type = 'hour';
            btn.dataset.target = 'pause-restart';
            btn.addEventListener('click', selectPauseRestartTimeOption);
            hourContainer.appendChild(btn);
        }
    }

    const minuteContainer = document.getElementById('pause-restart-minute-options');
    if (minuteContainer) {
        minuteContainer.innerHTML = '';
        for (let m = 0; m < 60; m++) {
            const btn = document.createElement('button');
            btn.className = 'popover-option';
            btn.textContent = pad(m);
            btn.dataset.value = m;
            btn.dataset.type = 'minute';
            btn.dataset.target = 'pause-restart';
            btn.addEventListener('click', selectPauseRestartTimeOption);
            minuteContainer.appendChild(btn);
        }
    }

    // Attach click handlers to the time-part buttons
    const hourBtn = document.getElementById('pause-restart-hour-btn');
    const minuteBtn = document.getElementById('pause-restart-minute-btn');
    if (hourBtn) hourBtn.addEventListener('click', handleTimePartClick);
    if (minuteBtn) minuteBtn.addEventListener('click', handleTimePartClick);
}

// When user selects a restart time, reverse-calculate the duration
function selectPauseRestartTimeOption(e) {
    e.stopPropagation();
    const btn = e.currentTarget;
    const value = parseInt(btn.dataset.value);
    const type = btn.dataset.type;

    // Get current restart time from the buttons
    const hourBtn = document.getElementById('pause-restart-hour-btn');
    const minuteBtn = document.getElementById('pause-restart-minute-btn');
    let restartHour = parseInt(hourBtn.textContent);
    let restartMinute = parseInt(minuteBtn.textContent);

    if (type === 'hour') restartHour = value;
    else restartMinute = value;

    // Update button display
    hourBtn.textContent = pad(restartHour);
    minuteBtn.textContent = pad(restartMinute);

    closeAllPopovers();

    // Calculate duration from now to selected restart time
    const now = new Date();
    const restartTime = new Date(now);
    restartTime.setHours(restartHour, restartMinute, 0, 0);

    // If restart time is in the past or within 1 minute, assume next day
    if (restartTime.getTime() <= now.getTime() + 60000) {
        restartTime.setDate(restartTime.getDate() + 1);
    }

    const diffMs = restartTime.getTime() - now.getTime();
    let diffMins = Math.round(diffMs / 60000);

    // Clamp to max if set
    if (pauseMaxMinutes !== null && diffMins > pauseMaxMinutes) {
        diffMins = pauseMaxMinutes;
        // Recalculate restart time from clamped duration
        const clampedRestart = new Date(now.getTime() + diffMins * 60000);
        restartHour = clampedRestart.getHours();
        restartMinute = clampedRestart.getMinutes();
        hourBtn.textContent = pad(restartHour);
        minuteBtn.textContent = pad(restartMinute);
    }

    const durationDays = Math.floor(diffMins / (24 * 60));
    const remainingMins = diffMins % (24 * 60);
    const durationHours = Math.floor(remainingMins / 60);
    const durationMins = remainingMins % 60;

    // Update PAUSE FOR inputs
    document.getElementById('pause-days').value = durationDays;
    document.getElementById('pause-hours').value = durationHours;
    document.getElementById('pause-minutes').value = durationMins;

    // Update +N days badge
    const nextDayBadge = document.getElementById('pause-next-day-indicator');
    if (nextDayBadge) {
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const restartStart = new Date(restartTime.getFullYear(), restartTime.getMonth(), restartTime.getDate());
        const dayDiff = Math.round((restartStart - todayStart) / (24 * 60 * 60 * 1000));
        if (dayDiff > 0) {
            nextDayBadge.textContent = `+${dayDiff} ${dayDiff === 1 ? 'day' : 'days'}`;
            nextDayBadge.classList.remove('hidden');
        } else {
            nextDayBadge.classList.add('hidden');
        }
    }

    updatePauseRestartPopoverSelection(restartHour, restartMinute);
    syncPauseDurationRowLayout();
}

async function proceedWithPause() {
    if (!pauseBlockId && !pauseScheduleData) return;

    const typed = document.getElementById('pause-challenge-input').value;
    if (typed !== pauseChallengeText) {
        // Wiggle on mismatch
        const modal = document.querySelector('#pause-modal .modal-content');
        modal.classList.add('wiggle');
        setTimeout(() => modal.classList.remove('wiggle'), 400);
        return;
    }

    const days = parseInt(document.getElementById('pause-days').value) || 0;
    const hours = parseInt(document.getElementById('pause-hours').value) || 0;
    const minutes = parseInt(document.getElementById('pause-minutes').value) || 0;
    const pauseDurationMs = (days * 24 * 60 + hours * 60 + minutes) * 60 * 1000;

    if (pauseDurationMs <= 0) {
        closePauseModal();
        return;
    }

    if (pauseScheduleData) {
        // Schedule pause — set pause state on the schedule itself
        const schedule = appData.schedules?.find(s => s.blocklistId === pauseScheduleData.blocklistId);
        if (schedule) {
            schedule.isPaused = true;
            schedule.pauseEndTime = Date.now() + pauseDurationMs;
        }
    } else {
        // One-off block pause
        const block = appData.activeBlocks.find(b => b.id === pauseBlockId);
        if (!block) {
            closePauseModal();
            return;
        }
        block.isPaused = true;
        block.pauseEndTime = Date.now() + pauseDurationMs;
    }

    await saveData();
    console.log('[pause-resume] Proceeding with pause sync', {
        pauseBlockId,
        scheduleBlocklistId: pauseScheduleData?.blocklistId || null
    });
    await syncActiveBlocksToHelper();
    await syncSchedulesToHelper();

    // Update blocking rules — updateHostsFile skips paused blocks' domains
    await updateHostsFile();
    await updateBlockedApps();

    // iOS: register one-off DeviceActivity so pause expiry re-evaluates background enforcement.
    if (isIOS) {
        if (pauseScheduleData) {
            const schedule = appData.schedules?.find(s => s.blocklistId === pauseScheduleData.blocklistId);
            if (schedule?.pauseEndTime) {
                try {
                    const res = await tauriAPI.screentimeRegisterOneOffActivity(
                        'redd-schedule-resume-' + schedule.id,
                        schedule.pauseEndTime
                    );
                    if (res && res.success === false) {
                        console.error('[iOS] Schedule pause-resume registration failed:', res.error || 'Unknown error');
                    }
                } catch (e) {
                    console.warn('[iOS] Schedule pause-resume registration threw:', e);
                }
            }
        } else if (pauseBlockId) {
            const block = appData.activeBlocks.find(b => b.id === pauseBlockId);
            if (block && block.pauseEndTime) {
                try {
                    const blocklist = appData.blocklists.find(bl => bl.id === block.blocklistId);
                    const iosPayload = getBlocklistIOSPayload(blocklist);
                    await tauriAPI.screentimeSetResumePayload({
                        blockId: pauseBlockId,
                        domains: blocklist?.websites || [],
                        appTokenData: iosPayload.appTokenData,
                        categoryTokenData: iosPayload.categoryTokenData
                    });
                    const res = await tauriAPI.screentimeRegisterOneOffActivity('redd-block-resume-' + pauseBlockId, block.pauseEndTime);
                    if (res && res.success === false) {
                        console.error('[iOS] One-off DeviceActivity registration failed:', res.error || 'Unknown error');
                    }
                } catch (e) {
                    console.warn('[iOS] One-off pause-resume registration failed:', e);
                }
            }
        }
    }

    // Re-render UI
    render();

    // Update pause button to show Resume
    updatePauseButtonAppearance(true);

    closePauseModal();
}

// Generate random words to reach target character count
// Generate random words to reach target character count exactly
function generateRandomWords(targetChars) {
    const words = [];
    let currentLength = 0;

    // Safety break to prevent infinite loops
    let attempts = 0;
    const maxAttempts = 1000;

    while (currentLength < targetChars && attempts < maxAttempts) {
        attempts++;

        const isFirstWord = words.length === 0;
        const spaceNeeded = isFirstWord ? 0 : 1;
        const remaining = targetChars - currentLength;
        const maxWordLen = remaining - spaceNeeded;

        if (maxWordLen <= 0) break;

        // Try to find exact fit first
        const exactMatches = wordList.filter(w => w.length === maxWordLen);

        if (exactMatches.length > 0) {
            // Found exact match! Finish here.
            const word = exactMatches[Math.floor(Math.random() * exactMatches.length)];
            words.push(word);
            currentLength += spaceNeeded + word.length;
            break;
        } else {
            // No exact match, pick a random word that fits and leaves room for at least 1 more char 
            // (technically min word size is 1, so space+1=2 chars required for next step)

            const validWords = wordList.filter(w => {
                const newRemaining = remaining - (spaceNeeded + w.length);
                return newRemaining >= 2;
            });

            if (validWords.length > 0) {
                const word = validWords[Math.floor(Math.random() * validWords.length)];
                words.push(word);
                currentLength += spaceNeeded + word.length;
            } else {
                // If we're stuck (cannot find a word that fits exactly AND cannot find one leaving >=2 chars),
                // it means we have e.g. 1 char left (after space) but no 1-char words? 
                // With our list containing 'a', this shouldn't happen unless we need a 0-length word.
                break;
            }
        }
    }

    return words.join(' ');
}

// Generate gibberish
function generateGibberish(count) {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < count; i++) {
        result += chars[Math.floor(Math.random() * chars.length)];
    }
    return result;
}

function normalizeOverrideCount(value, type = 'random-words') {
    const parsed = parseInt(value, 10);
    if (!Number.isFinite(parsed)) return DEFAULT_OVERRIDE_COUNT;
    const maxChars = getMaxOverrideCharsForType(type);
    return Math.min(maxChars, Math.max(MIN_OVERRIDE_CHARS, parsed));
}

function normalizeCustomOverrideText(value) {
    const text = typeof value === 'string' ? value : '';
    const maxChars = getMaxOverrideCharsForType('custom');
    return text.slice(0, maxChars);
}

function getTypingCharsPerMinuteForType(type) {
    if (type === 'gibberish') return 150;
    if (type === 'custom') return 250; // Same assumption as random-words
    return 200; // random-words: used only for estimated time
}

function getMaxOverrideCharsForType(type) {
    if (type === 'gibberish') return 5000;
    return 7500; // random-words and custom: fixed max; estimated time uses CPM
}

/** Preview text for override difficulty (random words, gibberish, or custom). Used in blocklist modal. */
function getOverridePreviewText(type, count, customText) {
    if (type === 'custom') {
        const t = typeof customText === 'string' ? customText : '';
        const normalized = t.replace(/[\r\n]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
        return normalized || 'Your custom text will appear here';
    }
    const num = parseInt(count, 10);
    const countNum = Number.isFinite(num) && num >= 0 ? num : 10;

    if (type !== lastOverridePreviewType) {
        lastOverridePreviewType = type;
        overridePreviewFrozenByType[type] = null;
    }

    if (type === 'random-words' || type === 'gibberish') {
        if (countNum >= OVERRIDE_PREVIEW_TRUNCATE_AT) {
            let frozen = overridePreviewFrozenByType[type];
            if (frozen != null) return frozen;
            const generated = type === 'gibberish'
                ? generateGibberish(OVERRIDE_PREVIEW_TRUNCATE_AT)
                : generateRandomWords(OVERRIDE_PREVIEW_TRUNCATE_AT);
            frozen = generated.slice(0, OVERRIDE_PREVIEW_TRUNCATE_AT);
            overridePreviewFrozenByType[type] = frozen;
            return frozen;
        }
    }

    if (type === 'gibberish') return generateGibberish(countNum);
    return generateRandomWords(countNum);
}

/** Estimated minutes to type the override challenge (based on character count and type). */
function getOverrideEstimatedMinutes(type, count, customText) {
    const charCount = type === 'custom'
        ? (typeof customText === 'string' ? customText : '').length
        : (Number.isFinite(parseInt(count, 10)) ? parseInt(count, 10) : 0);
    if (charCount <= 0) return 0;
    const cpm = getTypingCharsPerMinuteForType(type);
    return Math.ceil(charCount / cpm);
}

function updateOverridePreview() {
    const typeSelect = document.getElementById('override-type');
    const countInput = document.getElementById('override-count');
    const customTextArea = document.getElementById('custom-override-text');
    const timeLineEl = document.getElementById('override-preview-time-line');
    const previewEl = document.getElementById('override-preview-text');
    const blockEl = document.getElementById('override-preview-block');
    if (!timeLineEl || !previewEl || !blockEl) return;

    const type = typeSelect?.value || 'random-words';
    const count = countInput?.value ?? '50';
    const customText = customTextArea?.value ?? '';

    const estimatedMins = getOverrideEstimatedMinutes(type, count, customText);
    const previewText = getOverridePreviewText(type, count, customText);

    timeLineEl.textContent = `Takes ~${estimatedMins} min${estimatedMins !== 1 ? 's' : ''} to type and will look something like:`;
    previewEl.textContent = previewText;
    previewEl.title = previewText;
}

function applyOverrideTypeUi(type) {
    const customTextArea = document.getElementById('custom-override-text');
    const overrideCountInput = document.getElementById('override-count');
    const overrideCountWrapper = document.getElementById('override-count-wrapper');
    const warningEl = document.getElementById('override-count-warning');
    const previewBlockEl = document.getElementById('override-preview-block');
    const maxDifficultyWrapEl = document.getElementById('override-max-difficulty-wrap');
    const maxChars = getMaxOverrideCharsForType(type);
    overrideCountInput.max = String(maxChars);

    if (type === 'custom') {
        customTextArea.maxLength = getMaxOverrideCharsForType('custom');
        customTextArea.classList.remove('hidden');
        overrideCountWrapper.classList.add('hidden');
        warningEl.classList.add('hidden');
        warningEl.textContent = '';
        if (previewBlockEl) previewBlockEl.classList.add('hidden');
        if (maxDifficultyWrapEl) maxDifficultyWrapEl.classList.add('hidden');
        return;
    }

    customTextArea.classList.add('hidden');
    overrideCountWrapper.classList.remove('hidden');
    warningEl.classList.add('hidden');
    warningEl.textContent = '';
    if (previewBlockEl) previewBlockEl.classList.remove('hidden');
    if (maxDifficultyWrapEl) maxDifficultyWrapEl.classList.remove('hidden');
    updateOverridePreview();
}

function setOverrideCountMaxMode(enabled) {
    const overrideCountWrapper = document.getElementById('override-count-wrapper');
    const overrideCountInput = document.getElementById('override-count');
    overrideCountWrapper.classList.toggle('override-count-max-mode', enabled);
    overrideCountInput.classList.toggle('form-input-disabled', enabled);
    overrideCountWrapper.querySelector('.input-suffix')?.classList.toggle('input-suffix-disabled', enabled);
    if (enabled) overrideCountInput.setAttribute('tabindex', '-1');
    else overrideCountInput.removeAttribute('tabindex');
}

function cloneOverrideDifficulty(raw, fallbackCount = 50) {
    if (!raw) return { type: 'random-words', count: fallbackCount, maxDifficulty: false };
    const type = raw.type || 'random-words';
    const maxDifficulty = raw.maxDifficulty === true;
    const safeType = maxDifficulty && type === 'custom' ? 'random-words' : type;
    const cloned = {
        type: safeType,
        count: maxDifficulty ? getMaxOverrideCharsForType(safeType) : normalizeOverrideCount(raw.count ?? fallbackCount, safeType),
        maxDifficulty,
        customText: normalizeCustomOverrideText(raw.customText)
    };
    if (maxDifficulty) {
        const typeBeforeMax = raw.typeBeforeMax || type;
        cloned.typeBeforeMax = typeBeforeMax;
        cloned.countBeforeMax = normalizeOverrideCount(raw.countBeforeMax ?? 50, typeBeforeMax);
    }
    return cloned;
}

// macOS-style duplicate naming: "test" -> "test copy", "test copy 2", ... gap-fill; content-based chain.

/** Returns chain root if name is "X copy" or "X copy N", else null. */
function parseCopyRoot(name) {
    const m = /^(.+?) copy(?: (\d+))?$/.exec(name);
    return m ? m[1] : null;
}

/** Comparable string for content (websites, apps only). Only these + name affect duplicate copy-number chain. */
function contentKey(blocklistId) {
    const bl = appData.blocklists.find(b => b.id === blocklistId);
    if (!bl) return '';
    const w = [...(bl.websites || [])].sort();
    const a = [...getBlocklistRegularApps(bl)].sort();
    const iosSelection = getBlocklistIOSScreenTimeSelection(bl);
    return JSON.stringify({
        w,
        a,
        iosAppTokens: [...(iosSelection?.applicationTokens || [])].sort(),
        iosCategoryTokens: [...(iosSelection?.categoryTokens || [])].sort(),
        iosSummary: iosSelection?.summaryLabel || ''
    });
}

function sameBlocklistContent(idA, idB) { return contentKey(idA) === contentKey(idB); }

/** True if name is root, "root copy", or "root copy N". */
function nameInChain(name, root) {
    if (name === root || name === root + ' copy') return true;
    const p = root + ' copy ';
    return name.startsWith(p) && /^\d+$/.test(name.slice(p.length));
}

/** Next copy name: "X copy" or "X copy N" with gap-fill; same chain if unedited, else new chain from current name. */
function getNextCopyName(blocklist) {
    const name = blocklist.name;
    const root = parseCopyRoot(name);
    let base = name;
    if (root !== null) {
        const otherInChainSameContent = appData.blocklists.some(bl =>
            bl.id !== blocklist.id && nameInChain(bl.name, root) && sameBlocklistContent(bl.id, blocklist.id)
        );
        if (otherInChainSameContent) base = root;
    }
    const used = new Set();
    const p1 = base + ' copy';
    const p2 = base + ' copy ';
    for (const bl of appData.blocklists) {
        if (bl.name === p1) used.add(1);
        else if (bl.name.startsWith(p2) && /^\d+$/.test(bl.name.slice(p2.length))) used.add(parseInt(bl.name.slice(p2.length), 10));
    }
    let n = 1;
    while (used.has(n)) n++;
    return n === 1 ? p1 : p2 + n;
}

/** True if the blocklist has an active one-off block or a schedule currently in an active segment (and not paused). */
function isBlocklistCurrentlyActive(blocklistId) {
    const now = Date.now();
    const hasActiveBlock = appData.activeBlocks.some(
        b => b.blocklistId === blocklistId && isOneOffBlockEnforced(b, now)
    );
    if (hasActiveBlock) return true;
    const schedule = appData.schedules?.find(s => s.blocklistId === blocklistId);
    if (!schedule?.segments?.length) return false;
    return isScheduleSegmentActiveNow(schedule, new Date(now));
}

function duplicateBlocklist(id) {
    const blocklist = appData.blocklists.find(bl => bl.id === id);
    if (!blocklist) return;

    const newId = generateId();
    const newName = getNextCopyName(blocklist);

    const duplicate = {
        id: newId,
        name: newName,
        mode: blocklist.mode || 'blocklist',
        color: blocklist.color ?? null,
        emoji: blocklist.emoji ?? '🚫',
        websites: [...(blocklist.websites || [])],
        apps: [...getBlocklistRegularApps(blocklist)],
        iosScreenTimeSelection: cloneIOSScreenTimeSelection(getBlocklistIOSScreenTimeSelection(blocklist)),
        showItemDetails: blocklist.showItemDetails !== false,
        alwaysShowInSchedule: blocklist.alwaysShowInSchedule !== false,
        overrideDifficulty: cloneOverrideDifficulty(blocklist.overrideDifficulty)
    };

    appData.blocklists.push(duplicate);

    // Copy schedule only when the original is not currently active, so the duplicate starts inactive.
    const originalIsActive = isBlocklistCurrentlyActive(id);
    const existingSchedule = appData.schedules?.find(s => s.blocklistId === id);
    if (!originalIsActive && existingSchedule && existingSchedule.segments && existingSchedule.segments.length > 0) {
        const newSchedule = {
            id: crypto.randomUUID(),
            blocklistId: newId,
            segments: existingSchedule.segments.map(seg => ({
                startHour: seg.startHour,
                startMinute: seg.startMinute,
                endHour: seg.endHour,
                endMinute: seg.endMinute,
                days: [...(seg.days || [])]
            })),
            repeatType: existingSchedule.repeatType || 'no',
            repeatDate: existingSchedule.repeatType === 'date' && existingSchedule.repeatDate
                ? new Date(existingSchedule.repeatDate.getTime ? existingSchedule.repeatDate.getTime() : existingSchedule.repeatDate)
                : null,
            createdAt: Date.now()
        };
        if (!appData.schedules) appData.schedules = [];
        appData.schedules.push(newSchedule);
        syncSchedulesToHelper();
    }

    saveData();
    render();

    // Only keep selection on the original blocklist if it was already selected (user had focused it).
    // If they duplicated from the card menu without having clicked the card first, don't switch focus to it.
    if (selectedBlocklistId === id) {
        const dropdown = document.getElementById('blocklist-select');
        if (dropdown) {
            dropdown.value = id;
            handleBlocklistSelect({ target: dropdown });
        }
    }
}

// Delete blocklist with undo support
let pendingDelete = null; // { blocklist, activeBlocks, timeoutId }

async function deleteBlocklist(id) {
    const blocklist = appData.blocklists.find(bl => bl.id === id);
    if (!blocklist) return;

    // Check if this blocklist has an active block or schedule running
    const now = Date.now();
    const hasActiveBlock = appData.activeBlocks.some(
        block => block.blocklistId === id && block.startTime <= now && block.endTime > now
    );
    const hasActiveSchedule = appData.schedules?.some(
        s => s.blocklistId === id && s.segments && s.segments.length > 0
    );

    if (hasActiveBlock) {
        alert(`Cannot delete "${blocklist.name}" while a block is running. Override the block first.`);
        return;
    }

    if (hasActiveSchedule) {
        alert(`Cannot delete "${blocklist.name}" while a schedule is active. Stop the schedule first.`);
        return;
    }

    // If there's already a pending delete, commit it first
    if (pendingDelete) {
        commitDelete();
    }

    // Store the blocklist and any active blocks for potential undo
    const activeBlocksToRemove = appData.activeBlocks.filter(b => b.blocklistId === id);

    // Remove from data (soft delete)
    appData.blocklists = appData.blocklists.filter(bl => bl.id !== id);
    appData.activeBlocks = appData.activeBlocks.filter(b => b.blocklistId !== id);

    // If the deleted blocklist was the selected one, reset the scheduler UI
    if (selectedBlocklistId === id) {
        selectedBlocklistId = null;
        const blocklistSelect = document.getElementById('blocklist-select');
        blocklistSelect.value = '';
        handleBlocklistSelect({ target: blocklistSelect });
    }

    // Re-render immediately
    render();

    // Show undo toast
    const toast = document.getElementById('undo-toast');
    const message = document.getElementById('undo-toast-message');
    message.textContent = `Deleted "${blocklist.name}"`;
    toast.classList.remove('hidden');

    // Set up auto-commit after 5 seconds
    const timeoutId = setTimeout(() => {
        commitDelete();
    }, 5000);

    pendingDelete = {
        blocklist,
        activeBlocks: activeBlocksToRemove,
        timeoutId
    };
}

function commitDelete() {
    if (!pendingDelete) return;

    clearTimeout(pendingDelete.timeoutId);

    // Save data permanently
    saveData();

    // Update hosts if needed
    if (pendingDelete.activeBlocks.length > 0) {
        updateHostsFile();
    }

    // Hide toast
    document.getElementById('undo-toast').classList.add('hidden');
    pendingDelete = null;
}

function undoDelete() {
    if (!pendingDelete) return;

    clearTimeout(pendingDelete.timeoutId);

    // Restore the blocklist and active blocks
    appData.blocklists.push(pendingDelete.blocklist);
    pendingDelete.activeBlocks.forEach(block => {
        appData.activeBlocks.push(block);
    });

    // Hide toast
    document.getElementById('undo-toast').classList.add('hidden');
    pendingDelete = null;

    // Re-render
    render();
}

// Main render function
function render() {
    updateOnboardingVisibility();

    renderNowBlockingRow();
    updateWeekCalendar();
    renderBlocklistSelector();

    // Auto-select a blocklist when the choice is unambiguous:
    //   - Exactly one blocklist exists → always select it (even if it
    //     is currently active or paused; the right pane gracefully
    //     shows Stop / pause controls in those states).
    //   - Otherwise, fall back to the prior behaviour of selecting
    //     when exactly one blocklist is *not* currently active.
    if (!selectedBlocklistId) {
        let blocklistToSelect = null;
        if (appData.blocklists.length === 1) {
            blocklistToSelect = appData.blocklists[0];
        } else {
            const activeIds = appData.activeBlocks.map(b => b.blocklistId);
            const availableBlocklists = appData.blocklists.filter(bl => !activeIds.includes(bl.id));
            if (availableBlocklists.length === 1) {
                blocklistToSelect = availableBlocklists[0];
            }
        }
        if (blocklistToSelect) {
            const dropdown = document.getElementById('blocklist-select');
            dropdown.value = blocklistToSelect.id;
            handleBlocklistSelect({ target: dropdown });
        }
    }

    renderBlocklists();
    syncSelectedControlState();

    // Hide "Select a blocklist" prompt if there are no blocklists
    const selectionPrompt = document.getElementById('selection-prompt');
    if (selectionPrompt) {
        if (appData.blocklists.length === 0) {
            selectionPrompt.classList.add('hidden');
        } else if (!selectedBlocklistId) {
            // Only show prompt if there are blocklists but none selected
            selectionPrompt.classList.remove('hidden');
        }
    }

    // Adjust window height to fit content
    updateWindowHeight();
}

function syncSelectedControlState() {
    if (!selectedBlocklistId) {
        updateOverrideAllButtonVisibility();
        updateCleanHostsBtnState();
        return;
    }
    if (isScheduleMode) {
        updateScheduleButtonState();
        updateOverrideAllButtonVisibility();
        updateCleanHostsBtnState();
        return;
    }
    const startBlockBtn = document.getElementById('start-block-btn');
    if (!startBlockBtn) {
        updateOverrideAllButtonVisibility();
        updateCleanHostsBtnState();
        return;
    }
    const blocklist = appData.blocklists.find(bl => bl.id === selectedBlocklistId);
    const now = Date.now();
    const activeBlock = appData.activeBlocks.find(b => b.blocklistId === selectedBlocklistId && b.startTime <= now && b.endTime > now);
    const btnLabel = startBlockBtn.querySelector('.btn-label');
    const btnIcon = startBlockBtn.querySelector('svg');
    const pauseBtn = document.getElementById('pause-block-btn');
    const alwaysOnMsg = document.getElementById('always-on-message');
    delete startBlockBtn.dataset.activeBlockId;
    startBlockBtn.classList.remove('stop-block');
    setStartBtnBlocklistInfo(startBlockBtn, blocklist);
    if (activeBlock) {
        setBtnActionLabel(btnLabel, 'Stop Block:');
        startBlockBtn.classList.add('stop-block');
        startBlockBtn.dataset.activeBlockId = activeBlock.id;
        if (btnIcon) btnIcon.innerHTML = `<rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 9.9-1"></path>`;
        if (pauseBtn) {
            pauseBtn.classList.remove('hidden');
            updatePauseButtonAppearance(!!activeBlock.isPaused);
        }
        disableTimeControls(true);
        if (alwaysOnMsg) alwaysOnMsg.classList.toggle('hidden', !isBlockAlwaysOn(activeBlock));
    } else {
        setBtnActionLabel(btnLabel, tSettings('startBlockButton'));
        if (btnIcon) btnIcon.innerHTML = `<rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path>`;
        if (pauseBtn) pauseBtn.classList.add('hidden');
        disableTimeControls(false);
        if (alwaysOnMsg) alwaysOnMsg.classList.toggle('hidden', !isAlwaysOnMode);
    }
    startBlockBtn.disabled = !selectedBlocklistId;
    updateOverrideAllButtonVisibility();
    updateCleanHostsBtnState();
}

// Render the generic weekly schedule: fixed Mon..Sun rows with a horizontal time axis.
// The view is dateless — every row represents a weekday, and today's row is highlighted.
function updateWeekCalendar() {
    const dayRows = document.getElementById('day-rows');
    const hourMarkers = document.getElementById('hour-markers');

    if (!dayRows || !hourMarkers) return;

    // Hour markers across the timeline (every 3 hours: 00, 03, 06, 09, 12, 15, 18, 21).
    hourMarkers.innerHTML = '';
    for (let h = 0; h <= 21; h += 3) {
        const marker = document.createElement('div');
        marker.className = 'hour-marker';
        marker.style.left = `${(h / 24) * 100}%`;
        marker.textContent = String(h).padStart(2, '0');
        hourMarkers.appendChild(marker);
    }

    dayRows.innerHTML = '';
    // Day names in our internal order: 0=Mon, 1=Tue, ... 6=Sun.
    const dayNamesMon0 = tSettings('dayAbbrevMon0');
    const todayJsDay = new Date().getDay(); // 0=Sun..6=Sat
    const todayDayIndex = todayJsDay === 0 ? 6 : todayJsDay - 1;

    for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
        const isToday = dayIndex === todayDayIndex;
        const isWeekend = dayIndex === 5 || dayIndex === 6; // Sat, Sun

        const row = document.createElement('div');
        row.className = 'day-row';
        if (isToday) row.classList.add('today');
        if (isWeekend) row.classList.add('weekend');
        row.dataset.dayIndex = dayIndex;

        const label = document.createElement('div');
        label.className = 'day-label';

        const nameSpan = document.createElement('span');
        nameSpan.className = 'day-name';
        nameSpan.textContent = dayNamesMon0[dayIndex];
        label.appendChild(nameSpan);

        if (isToday) {
            const todaySpan = document.createElement('span');
            todaySpan.className = 'day-date';
            todaySpan.textContent = tSettings('today');
            label.appendChild(todaySpan);
        }

        const track = document.createElement('div');
        track.className = 'day-track';
        if (isScheduleMode) track.classList.add('schedule-mode');
        track.dataset.dayIndex = dayIndex;

        if (isToday) {
            const now = new Date();
            const nowMinutes = now.getHours() * 60 + now.getMinutes();
            const nowIndicator = document.createElement('div');
            nowIndicator.className = 'now-indicator';
            nowIndicator.id = 'now-indicator';
            nowIndicator.style.left = `${(nowMinutes / 1440) * 100}%`;
            track.appendChild(nowIndicator);
        }

        row.append(label, track);
        dayRows.appendChild(row);
    }

    renderWeekBlocks();
}

// Convert a time interval (clamped to a single day) into horizontal positioning for the
// row-based timeline (left%/width% of the day track) and also keep top/height as legacy
// values for any callers still using them.
function getCalendarSegmentLayout(segmentStartMs, segmentEndMs, dayStartMs, dayEndMs) {
    const clampedStartMs = Math.max(segmentStartMs, dayStartMs);
    const clampedEndMs = Math.min(segmentEndMs, dayEndMs);
    const segmentStartDate = new Date(clampedStartMs);
    const segmentEndDate = new Date(clampedEndMs);
    const startMinutes = segmentStartDate.getHours() * 60 + segmentStartDate.getMinutes();
    const reachesDayEnd = segmentEndMs >= dayEndMs;
    const endMinutes = reachesDayEnd
        ? 24 * 60
        : segmentEndDate.getHours() * 60 + segmentEndDate.getMinutes();

    return {
        leftPercent: (startMinutes / 1440) * 100,
        widthPercent: Math.max(0.5, ((endMinutes - startMinutes) / 1440) * 100),
        topPosition: (startMinutes / 60) * 40,
        height: Math.max(20, ((endMinutes - startMinutes) / 60) * 40),
        startMinutes,
        endMinutes,
        segmentStartDate,
        segmentEndDate
    };
}

// Render active manual blocks on the weekly calendar by projecting their concrete
// timestamps onto the matching weekday(s). Overnight blocks render two halves on
// consecutive weekdays. Fully-past blocks are not drawn.
function renderWeekBlocks() {
    const noBlocksMsg = document.getElementById('no-blocks-message');
    const now = Date.now();

    // Clear existing blocks from all day tracks (preserve the now-indicator on today).
    document.querySelectorAll('.day-track').forEach(track => {
        const nowIndicator = track.querySelector('#now-indicator');
        track.innerHTML = '';
        if (nowIndicator) track.appendChild(nowIndicator);
    });

    // Always-on active blocks are represented in the "Always on" pill row instead of
    // being drawn as bars across the timeline.
    const visibleBlocks = appData.activeBlocks.filter(block =>
        !isBlockAlwaysOn(block) && block.endTime > now
    );

    const hasSchedules = appData.schedules && appData.schedules.length > 0;
    const hasAlwaysOnBlocks = appData.activeBlocks.some(b => isBlockAlwaysOn(b));

    if (visibleBlocks.length === 0 && !hasSchedules && !hasAlwaysOnBlocks) {
        noBlocksMsg?.classList.remove('hidden');
    } else {
        noBlocksMsg?.classList.add('hidden');
    }

    visibleBlocks.forEach(block => {
        const blocklist = appData.blocklists.find(bl => bl.id === block.blocklistId);
        if (!blocklist) return;

        // The eye chip above the schedule is authoritative — hidden means hidden,
        // even if the blocklist is currently selected.
        if (blocklist.alwaysShowInSchedule === false) {
            return;
        }

        const isRunning = block.startTime <= now;
        renderManualBlockOnWeekdays(block, blocklist, isRunning);
    });

    renderScheduledCalendarBlocks();
    layoutOverlappingBlocks();
    renderScheduleAlwaysOnRow();
    renderScheduleVisibilityChips();
}

// Build a calendar block element for a manual one-off block on a specific weekday slice.
function buildManualBlockElement(block, blocklist, leftPct, widthPct, segmentStartDate, segmentEndDate, isRunning) {
    const blockEl = document.createElement('div');
    blockEl.className = 'calendar-block';
    if (isRunning) blockEl.classList.add('running');
    blockEl.dataset.blockId = block.id;
    blockEl.style.left = `${leftPct}%`;
    blockEl.style.width = `${widthPct}%`;

    if (blocklist.color) {
        blockEl.style.background = blocklist.color;
        blockEl.style.color = getContrastTextColor(blocklist.color);
    }

    // Show "until HH:MM" for currently-running blocks; otherwise show the block's range.
    const timeLabel = isRunning
        ? `until ${formatTime(segmentEndDate)}`
        : `${formatTime(segmentStartDate)} - ${formatTime(segmentEndDate)}`;

    blockEl.innerHTML = `
        <span class="block-emoji">${blocklist.emoji || '🚫'}</span>
        <span class="block-label">${escapeHtml(blocklist.name)}</span>
        <span class="block-time">${timeLabel}</span>
    `;

    blockEl.addEventListener('click', (e) => {
        e.stopPropagation();
        openOverrideModal(block.id);
    });

    return blockEl;
}

// Render a manual block onto the weekly grid by computing the weekday(s) it spans.
// Multi-day blocks are split per weekday; today's slice is clamped to start at "now" so
// running blocks visually begin at the now-indicator.
function renderManualBlockOnWeekdays(block, blocklist, isRunning) {
    const startDate = new Date(block.startTime);
    const endDate = new Date(block.endTime);
    const now = Date.now();

    const startDay = new Date(startDate);
    startDay.setHours(0, 0, 0, 0);
    const endDay = new Date(endDate);
    endDay.setHours(0, 0, 0, 0);

    let cursor = new Date(startDay);
    while (cursor.getTime() <= endDay.getTime()) {
        const sliceDayStartMs = cursor.getTime();
        const sliceDayEndMs = sliceDayStartMs + 24 * 60 * 60 * 1000 - 1;

        let sliceStartMs = Math.max(block.startTime, sliceDayStartMs);
        const sliceEndMs = Math.min(block.endTime, sliceDayEndMs);

        // For the currently-running slice, clamp the visible start to "now" so the bar
        // doesn't draw over time that has already elapsed.
        if (isRunning && now > sliceStartMs && now < sliceEndMs) {
            sliceStartMs = now;
        }

        // Skip past slices entirely.
        if (sliceEndMs <= now) {
            cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000);
            continue;
        }

        const sliceDate = new Date(sliceStartMs);
        const jsDay = sliceDate.getDay();
        const dayIndex = jsDay === 0 ? 6 : jsDay - 1;
        const track = document.querySelector(`.day-track[data-day-index="${dayIndex}"]`);
        if (track) {
            const layout = getCalendarSegmentLayout(sliceStartMs, sliceEndMs, sliceDayStartMs, sliceDayEndMs);
            const blockEl = buildManualBlockElement(
                block, blocklist,
                layout.leftPercent, layout.widthPercent,
                layout.segmentStartDate, layout.segmentEndDate,
                isRunning && sliceStartMs <= now && now < sliceEndMs
            );
            track.appendChild(blockEl);
        }

        cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000);
    }
}


// Compute when the schedule's currently-active segment ends, returning a Date.
// Returns null if no segment is active right now. Handles repeating, overnight, and
// non-repeating schedules. Used by the "BLOCKING NOW" row to show "until HH:MM".
function getScheduleCurrentSegmentEnd(schedule, nowDate = new Date()) {
    if (!isScheduleSegmentActiveNow(schedule, nowDate)) return null;

    if (isNonRepeatingSchedule(schedule)) {
        const nowMs = nowDate.getTime();
        const occurrence = resolveOneShotOccurrences(schedule).find(occ =>
            nowMs >= occ.start.getTime() && nowMs < occ.end.getTime()
        );
        return occurrence ? new Date(occurrence.end) : null;
    }

    const currentDay = nowDate.getDay() === 0 ? 6 : nowDate.getDay() - 1; // Mon=0
    const currentMins = nowDate.getHours() * 60 + nowDate.getMinutes();
    const yesterdayDay = currentDay === 0 ? 6 : currentDay - 1;

    for (const seg of schedule.segments) {
        const startMins = seg.startHour * 60 + seg.startMinute;
        const endMins = seg.endHour * 60 + seg.endMinute;
        const days = Array.isArray(seg.days) ? seg.days : [];

        // 24/7 segment: use end-of-day for the "until" label so we have something concrete.
        if (startMins === endMins && days.includes(currentDay)) {
            const end = new Date(nowDate);
            end.setHours(23, 59, 0, 0);
            return end;
        }
        // Same-day window matching now.
        if (endMins > startMins && days.includes(currentDay) && currentMins >= startMins && currentMins < endMins) {
            const end = new Date(nowDate);
            end.setHours(seg.endHour, seg.endMinute, 0, 0);
            return end;
        }
        // Overnight head: started yesterday-evening side, but it's stored on `currentDay`.
        if (endMins < startMins && days.includes(currentDay) && currentMins >= startMins) {
            const end = new Date(nowDate);
            end.setDate(end.getDate() + 1);
            end.setHours(seg.endHour, seg.endMinute, 0, 0);
            return end;
        }
        // Overnight tail: today is the morning side of yesterday's segment.
        if (endMins < startMins && days.includes(yesterdayDay) && currentMins < endMins) {
            const end = new Date(nowDate);
            end.setHours(seg.endHour, seg.endMinute, 0, 0);
            return end;
        }
    }
    return null;
}

// Build the list of items to show in the "BLOCKING NOW" row: every one-off block that's
// currently running (and not paused) plus every schedule whose segment is active now.
function collectNowBlockingEntries(now = Date.now()) {
    const nowDate = new Date(now);
    const entries = [];

    for (const block of appData.activeBlocks || []) {
        if (block.startTime > now || block.endTime <= now || block.isPaused) continue;
        const blocklist = appData.blocklists.find(bl => bl.id === block.blocklistId);
        if (!blocklist) continue;
        entries.push({
            kind: 'block',
            id: block.id,
            blocklistId: block.blocklistId,
            blocklist,
            until: isBlockAlwaysOn(block) ? null : new Date(block.endTime),
            isAlwaysOn: isBlockAlwaysOn(block)
        });
    }

    for (const schedule of appData.schedules || []) {
        if (!isScheduleSegmentActiveNow(schedule, nowDate)) continue;
        const blocklist = appData.blocklists.find(bl => bl.id === schedule.blocklistId);
        if (!blocklist) continue;
        // A schedule and a one-off for the same blocklist could both be active; keep both
        // (they're independent rules) so the user can act on whichever they intend.
        entries.push({
            kind: 'schedule',
            id: schedule.id || schedule.blocklistId,
            blocklistId: schedule.blocklistId,
            blocklist,
            schedule,
            until: getScheduleCurrentSegmentEnd(schedule, nowDate),
            isAlwaysOn: false
        });
    }

    // Sort to match the visual order of the "My Blocklists" section, which iterates
    // `appData.blocklists` in array order. Entries whose blocklist isn't found in that
    // array (shouldn't happen, but be safe) sort to the end. Within a single blocklist,
    // one-off blocks come before schedules so explicit user-started actions read first.
    const order = new Map(appData.blocklists.map((bl, i) => [bl.id, i]));
    const kindRank = { block: 0, schedule: 1 };
    entries.sort((a, b) => {
        const ai = order.has(a.blocklistId) ? order.get(a.blocklistId) : Number.MAX_SAFE_INTEGER;
        const bi = order.has(b.blocklistId) ? order.get(b.blocklistId) : Number.MAX_SAFE_INTEGER;
        if (ai !== bi) return ai - bi;
        return (kindRank[a.kind] ?? 9) - (kindRank[b.kind] ?? 9);
    });

    return entries;
}

// Close any currently-open chip menu popover. Called from outside-click handlers and
// before opening a new menu (so only one is ever visible).
function closeNowBlockingChipMenus() {
    document.querySelectorAll('.now-blocking-chip-menu').forEach(el => el.remove());
    document.querySelectorAll('.now-blocking-chip-menu-btn[aria-expanded="true"]').forEach(btn => {
        btn.setAttribute('aria-expanded', 'false');
    });
}

// Open a small Edit / Pause / Stop popover anchored to `triggerBtn` for the given entry.
function openNowBlockingChipMenu(triggerBtn, entry) {
    closeNowBlockingChipMenus();

    const menu = document.createElement('div');
    menu.className = 'now-blocking-chip-menu';
    menu.setAttribute('role', 'menu');

    // Match the icons used elsewhere in the app: pencil = blocklist-card edit button,
    // open-padlock = "Stop Block" button (the bottom shackle ends "open" so it reads as
    // unlocking/stopping the block).
    const editIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/></svg>';
    const pauseIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>';
    const stopIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 9.9-1"></path></svg>';

    const items = [
        { label: tSettings('nowBlockingMenuEdit'), icon: editIcon, action: () => handleNowBlockingEdit(entry) },
        { label: tSettings('nowBlockingMenuPause'), icon: pauseIcon, action: () => handleNowBlockingPause(entry) },
        { label: tSettings('nowBlockingMenuStop'), icon: stopIcon, action: () => handleNowBlockingStop(entry), danger: true }
    ];

    items.forEach(item => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'now-blocking-chip-menu-item' + (item.danger ? ' danger' : '');
        btn.setAttribute('role', 'menuitem');
        btn.innerHTML = `${item.icon}<span>${escapeHtml(item.label)}</span>`;
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            closeNowBlockingChipMenus();
            item.action();
        });
        menu.appendChild(btn);
    });

    document.body.appendChild(menu);

    // Position the menu just below the trigger, keeping it on-screen horizontally.
    const rect = triggerBtn.getBoundingClientRect();
    const menuRect = menu.getBoundingClientRect();
    let left = rect.right - menuRect.width;
    if (left < 8) left = 8;
    const maxLeft = window.innerWidth - menuRect.width - 8;
    if (left > maxLeft) left = maxLeft;
    menu.style.left = `${left + window.scrollX}px`;
    menu.style.top = `${rect.bottom + window.scrollY + 4}px`;

    triggerBtn.setAttribute('aria-expanded', 'true');

    // Outside-click and Escape close the menu. Use a microtask delay so the click that
    // opened the menu doesn't immediately close it again.
    setTimeout(() => {
        const onDocClick = (e) => {
            if (!menu.contains(e.target) && e.target !== triggerBtn) {
                closeNowBlockingChipMenus();
                document.removeEventListener('click', onDocClick, true);
                document.removeEventListener('keydown', onKey, true);
            }
        };
        const onKey = (e) => {
            if (e.key === 'Escape') {
                closeNowBlockingChipMenus();
                document.removeEventListener('click', onDocClick, true);
                document.removeEventListener('keydown', onKey, true);
            }
        };
        document.addEventListener('click', onDocClick, true);
        document.addEventListener('keydown', onKey, true);
    }, 0);
}

// Edit action: select the chip's blocklist and open the blocklist edit dialog.
function handleNowBlockingEdit(entry) {
    const blocklist = entry.blocklist;
    if (!blocklist) return;
    const dropdown = document.getElementById('blocklist-select');
    if (dropdown) {
        dropdown.value = blocklist.id;
        handleBlocklistSelect({ target: dropdown });
    } else {
        selectedBlocklistId = blocklist.id;
    }
    openBlocklistModal(blocklist);
}

// Pause action: open the pause modal for the corresponding block or schedule.
function handleNowBlockingPause(entry) {
    if (entry.kind === 'block') {
        pauseScheduleData = null;
        openPauseModal(entry.id);
        return;
    }
    if (entry.kind === 'schedule') {
        pauseScheduleData = {
            blocklistId: entry.blocklistId,
            isActiveNow: true
        };
        openPauseModal(null);
    }
}

// Stop action: open the override modal so the user has to type the challenge to stop.
function handleNowBlockingStop(entry) {
    if (entry.kind === 'block') {
        openOverrideModal(entry.id);
        return;
    }
    if (entry.kind === 'schedule' && entry.schedule) {
        openScheduleOverrideModal(entry.schedule);
    }
}

// Render the BLOCKING NOW row at the top of the app. Hidden when nothing is blocking.
function renderNowBlockingRow() {
    const row = document.getElementById('now-blocking-row');
    const chipsEl = document.getElementById('now-blocking-chips');
    if (!row || !chipsEl) return;

    const entries = collectNowBlockingEntries();

    if (entries.length === 0) {
        row.classList.add('hidden');
        chipsEl.innerHTML = '';
        closeNowBlockingChipMenus();
        return;
    }

    chipsEl.innerHTML = '';
    const dotsIcon = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg>';

    entries.forEach(entry => {
        const chip = document.createElement('div');
        chip.className = 'now-blocking-chip';
        chip.dataset.kind = entry.kind;
        chip.dataset.id = entry.id;

        const emoji = entry.blocklist.emoji || '🚫';
        const name = entry.blocklist.name || '';
        let untilText;
        if (entry.isAlwaysOn) {
            untilText = tSettings('nowBlockingAlways');
        } else if (entry.until) {
            untilText = `${tSettings('nowBlockingUntil')} ${formatTime(entry.until)}`;
        } else {
            untilText = '';
        }

        chip.innerHTML = `
            <span class="now-blocking-chip-emoji">${escapeHtml(emoji)}</span>
            <span class="now-blocking-chip-name">${escapeHtml(name)}</span>
            ${untilText ? `<span class="now-blocking-chip-until">${escapeHtml(untilText)}</span>` : ''}
        `;

        const menuBtn = document.createElement('button');
        menuBtn.type = 'button';
        menuBtn.className = 'now-blocking-chip-menu-btn';
        menuBtn.setAttribute('aria-haspopup', 'menu');
        menuBtn.setAttribute('aria-expanded', 'false');
        menuBtn.setAttribute('aria-label', tSettings('nowBlockingMenuAria'));
        menuBtn.title = tSettings('nowBlockingMenuAria');
        menuBtn.innerHTML = dotsIcon;
        menuBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const isOpen = menuBtn.getAttribute('aria-expanded') === 'true';
            if (isOpen) {
                closeNowBlockingChipMenus();
            } else {
                openNowBlockingChipMenu(menuBtn, entry);
            }
        });
        chip.appendChild(menuBtn);

        chipsEl.appendChild(chip);
    });

    row.classList.remove('hidden');
}


/// Render the "Always on: <chip> <chip> · not shown in timeline" row above the calendar.
/// Always-on active blocks aren't drawn as bars in the timeline because they would cover
/// every day in full; this row makes their existence clear instead.
function renderScheduleAlwaysOnRow() {
    const row = document.getElementById('schedule-always-on-row');
    const chips = document.getElementById('schedule-always-on-chips');
    if (!row || !chips) return;

    const alwaysOnBlocks = (appData.activeBlocks || []).filter(b => isBlockAlwaysOn(b));

    // When the user has the "always" tab selected and picked a blocklist that isn't already
    // running, show a faded preview chip alongside the real ones. This replaces the timeline
    // preview bar that always-on mode used to draw across every day.
    let previewBlocklist = null;
    if (isAlwaysOnMode && !isScheduleMode && selectedBlocklistId) {
        const candidate = appData.blocklists.find(bl => bl.id === selectedBlocklistId);
        const now = Date.now();
        const alreadyActive = (appData.activeBlocks || []).some(b =>
            b.blocklistId === selectedBlocklistId && b.startTime <= now && b.endTime > now
        );
        if (candidate && !alreadyActive) {
            previewBlocklist = candidate;
        }
    }

    if (alwaysOnBlocks.length === 0 && !previewBlocklist) {
        row.classList.add('hidden');
        chips.innerHTML = '';
        return;
    }

    chips.innerHTML = '';

    alwaysOnBlocks.forEach(block => {
        const blocklist = appData.blocklists.find(bl => bl.id === block.blocklistId);
        if (!blocklist) return;

        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'always-on-chip';
        chip.dataset.blockId = block.id;
        chip.title = blocklist.name;

        const emoji = blocklist.emoji
            ? `<span class="always-on-chip-emoji">${escapeHtml(blocklist.emoji)}</span>`
            : '';

        chip.innerHTML = `${emoji}<span class="always-on-chip-name">${escapeHtml(blocklist.name)}</span>`;

        // Clicking the chip opens the override modal so the user can stop the always-on block.
        chip.addEventListener('click', (e) => {
            e.stopPropagation();
            openOverrideModal(block.id);
        });

        chips.appendChild(chip);
    });

    if (previewBlocklist) {
        const chip = document.createElement('div');
        chip.className = 'always-on-chip preview';
        chip.title = previewBlocklist.name;

        const emoji = previewBlocklist.emoji
            ? `<span class="always-on-chip-emoji">${escapeHtml(previewBlocklist.emoji)}</span>`
            : '';

        chip.innerHTML = `${emoji}<span class="always-on-chip-name">${escapeHtml(previewBlocklist.name)}</span>`;
        chips.appendChild(chip);
    }

    row.classList.remove('hidden');
}

/// Render a row of eye/eye-slash chips under the Schedule header — one per blocklist that
/// currently contributes anything to the calendar (has an active/future manual block or a
/// defined schedule). Clicking a chip toggles blocklist.alwaysShowInSchedule.
function renderScheduleVisibilityChips() {
    const container = document.getElementById('schedule-visibility-chips');
    if (!container) return;

    const now = Date.now();
    const scheduledIds = new Set((appData.schedules || []).map(s => s.blocklistId));
    // Always-on blocks aren't drawn in the timeline (they're surfaced by the "Always on"
    // row above instead), so don't add a visibility chip for them either.
    const manualIds = new Set(
        (appData.activeBlocks || [])
            .filter(b => b.endTime > now && !isBlockAlwaysOn(b))
            .map(b => b.blocklistId)
    );
    const relevantIds = new Set([...scheduledIds, ...manualIds]);

    const blocklists = (appData.blocklists || []).filter(bl => relevantIds.has(bl.id));

    if (blocklists.length === 0) {
        container.classList.add('hidden');
        container.innerHTML = '';
        return;
    }

    container.classList.remove('hidden');
    container.innerHTML = '';

    const eyeOpenSvg = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
    const eyeClosedSvg = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';

    for (const bl of blocklists) {
        const visible = bl.alwaysShowInSchedule !== false;
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'schedule-visibility-chip';
        chip.setAttribute('aria-pressed', visible ? 'true' : 'false');
        chip.dataset.blocklistId = bl.id;
        chip.title = visible ? 'Hide from schedule' : 'Show in schedule';
        chip.innerHTML = `
            ${visible ? eyeOpenSvg : eyeClosedSvg}
            <span class="schedule-visibility-chip-name">${bl.emoji ? escapeHtml(bl.emoji) + ' ' : ''}${escapeHtml(bl.name || '')}</span>
        `;
        chip.addEventListener('click', async () => {
            const blocklist = appData.blocklists.find(b => b.id === bl.id);
            if (!blocklist) return;
            blocklist.alwaysShowInSchedule = !(blocklist.alwaysShowInSchedule !== false);
            await saveData();
            renderWeekBlocks();
            // renderWeekBlocks wipes all day tracks; re-add any in-flight preview block(s).
            handleTimeChange();
        });
        container.appendChild(chip);
    }
}

// Layout overlapping blocks within a day row.
//
// In the row-based layout, blocks already use left%/width% to position by time, so blocks
// that overlap in time would visually overlap horizontally. We resolve this by stacking
// overlapping blocks vertically *within* the row: the row is divided into N horizontal
// lanes (where N is the maximum overlap depth), each block sits in one lane.
function layoutOverlappingBlocks() {
    document.querySelectorAll('.day-track').forEach(track => {
        const blocks = Array.from(track.querySelectorAll('.calendar-block'));
        // Reset any previous lane styling so single-block rows render at full height.
        blocks.forEach(b => {
            b.style.top = '';
            b.style.bottom = '';
            b.style.height = '';
        });
        if (blocks.length <= 1) return;

        // Compute time-extents (in % of day width) from current left/width styles.
        const blockData = blocks.map(block => {
            const left = parseFloat(block.style.left) || 0;
            const width = parseFloat(block.style.width) || 0;
            const groupId = block.dataset.scheduleId || block.dataset.blockId || block.dataset.previewGroupId || null;
            return {
                element: block,
                left,
                right: left + width,
                groupId,
                lane: 0,
                totalLanes: 1
            };
        });

        // Sort by left edge so we assign lanes greedily from earliest start.
        blockData.sort((a, b) => a.left - b.left || a.right - b.right);

        const groupLanes = new Map();

        for (let i = 0; i < blockData.length; i++) {
            const current = blockData[i];

            if (current.groupId && groupLanes.has(current.groupId)) {
                current.lane = groupLanes.get(current.groupId);
                continue;
            }

            const overlappingGroups = new Set();
            for (let j = 0; j < blockData.length; j++) {
                if (i === j) continue;
                const other = blockData[j];
                if (!(current.right <= other.left || current.left >= other.right)) {
                    if (other.groupId !== current.groupId) {
                        overlappingGroups.add(other.groupId);
                    }
                }
            }

            const usedLanes = new Set();
            overlappingGroups.forEach(gid => {
                if (groupLanes.has(gid)) usedLanes.add(groupLanes.get(gid));
            });

            let lane = 1;
            while (usedLanes.has(lane)) lane++;
            current.lane = lane;
            if (current.groupId) groupLanes.set(current.groupId, lane);
        }

        for (let i = 0; i < blockData.length; i++) {
            const current = blockData[i];
            let maxLane = current.lane;
            for (let j = 0; j < blockData.length; j++) {
                if (i === j) continue;
                const other = blockData[j];
                if (!(current.right <= other.left || current.left >= other.right)) {
                    maxLane = Math.max(maxLane, other.lane);
                }
            }
            current.totalLanes = maxLane;
        }

        blockData.forEach(data => {
            if (data.totalLanes > 1) {
                const lanePercent = 100 / data.totalLanes;
                const topPercent = (data.lane - 1) * lanePercent;
                data.element.style.top = `calc(${topPercent}% + 2px)`;
                data.element.style.height = `calc(${lanePercent}% - 4px)`;
                data.element.style.bottom = 'auto';
            }
        });
    });
}

// Render saved schedules onto the weekly calendar by weekday. Each segment lays out on
// every weekday listed in its `days` array; overnight segments split into a tail on the
// next weekday (wrapping Sun → Mon). One-shot non-repeating schedules render onto the
// weekday of each resolved occurrence.
function renderScheduledCalendarBlocks() {
    if (!appData.schedules || appData.schedules.length === 0) return;

    const now = new Date();

    appData.schedules.forEach(schedule => {
        const blocklist = appData.blocklists.find(bl => bl.id === schedule.blocklistId);
        if (!blocklist) return;

        // The eye chip above the schedule is authoritative — hidden means hidden,
        // even if the blocklist is currently selected.
        if (blocklist.alwaysShowInSchedule === false) {
            return;
        }

        // Date-limited schedules drop off the calendar once their end date has passed.
        if (schedule.repeatType === 'date' && schedule.repeatDate) {
            const endDate = new Date(schedule.repeatDate);
            if (now > endDate) return;
        }

        if (isNonRepeatingSchedule(schedule)) {
            // One-shot occurrences carry an explicit dayIndex (Mon=0..Sun=6). Render on
            // that weekday using the segment's clock-times.
            const occurrences = resolveOneShotOccurrences(schedule);
            occurrences.forEach(occurrence => {
                if (occurrence.end.getTime() <= now.getTime()) return; // already finished
                const segment = schedule.segments[occurrence.segmentIndex];
                if (!segment) return;
                renderScheduleSegmentOnWeekday(schedule, segment, occurrence.segmentIndex, occurrence.dayIndex, blocklist);
            });
            return;
        }

        schedule.segments.forEach((segment, segmentIdx) => {
            const segmentDays = segment.days || [];
            segmentDays.forEach(dayIndex => {
                renderScheduleSegmentOnWeekday(schedule, segment, segmentIdx, dayIndex, blocklist);
            });
        });
    });
}

// Render a single schedule segment onto the day-track for a specific weekday.
// Overnight segments split: head from start..24:00 on this weekday, tail from 00:00..end
// on the next weekday (wrapping Sun → Mon).
function renderScheduleSegmentOnWeekday(schedule, segment, segmentIdx, dayIndex, blocklist) {
    const track = document.querySelector(`.day-track[data-day-index="${dayIndex}"]`);
    if (!track) return;

    const startMinutes = segment.startHour * 60 + segment.startMinute;
    const endMinutes = segment.endHour * 60 + segment.endMinute;
    const isOvernight = endMinutes <= startMinutes;

    const startTimeStr = `${String(segment.startHour).padStart(2, '0')}:${String(segment.startMinute).padStart(2, '0')}`;
    const endTimeStr = `${String(segment.endHour).padStart(2, '0')}:${String(segment.endMinute).padStart(2, '0')}`;

    const buildBlock = (leftPct, widthPct, hostDayIndex, isContinuation) => {
        const el = document.createElement('div');
        el.className = `calendar-block scheduled${isContinuation ? ' overnight-continuation' : ''}`;
        el.dataset.scheduleId = schedule.id;
        el.dataset.segmentIndex = segmentIdx;
        el.dataset.day = hostDayIndex;
        el.style.left = `${leftPct}%`;
        el.style.width = `${widthPct}%`;

        if (blocklist.color) {
            el.style.background = blocklist.color;
            el.style.opacity = '0.7';
            el.style.color = getContrastTextColor(blocklist.color);
        }

        el.innerHTML = `
            <span class="block-emoji">${blocklist.emoji || '🚫'}</span>
            <span class="block-label">${escapeHtml(blocklist.name)}</span>
            <span class="block-time">${startTimeStr} - ${endTimeStr}</span>
        `;

        el.addEventListener('click', (e) => {
            e.stopPropagation();
            openScheduledBlockEdit(schedule);
        });

        return el;
    };

    if (isOvernight) {
        const left1 = (startMinutes / 1440) * 100;
        const width1 = Math.max(0.5, ((1440 - startMinutes) / 1440) * 100);
        track.appendChild(buildBlock(left1, width1, dayIndex, false));

        const nextDayIndex = (dayIndex + 1) % 7;
        const nextTrack = document.querySelector(`.day-track[data-day-index="${nextDayIndex}"]`);
        if (nextTrack) {
            const width2 = Math.max(0.5, (endMinutes / 1440) * 100);
            nextTrack.appendChild(buildBlock(0, width2, nextDayIndex, true));
        }
    } else {
        const left = (startMinutes / 1440) * 100;
        const width = Math.max(0.5, ((endMinutes - startMinutes) / 1440) * 100);
        track.appendChild(buildBlock(left, width, dayIndex, false));
    }
}

// Render blocklist selector dropdown
function renderBlocklistSelector() {
    const select = document.getElementById('blocklist-select');
    const currentValue = select.value;
    const activeIds = appData.activeBlocks.map(b => b.blocklistId);

    const newHTML = `
    <option value="">${tSettings('selectionPromptOption')}</option>
    ${appData.blocklists.map(bl => {
        const isActive = activeIds.includes(bl.id);
        const activeLabel = isActive ? tSettings('runningSuffix') : '';
        return `<option value="${bl.id}">${escapeHtml(bl.name)}${activeLabel}</option>`;
    }).join('')}
  `;

    // Only update if changed to prevent closing dropdown
    // Normalize logic to ignore potential minor diffs if logic is sound, but direct string compare is fine
    if (select.innerHTML !== newHTML) {
        select.innerHTML = newHTML;
        select.value = currentValue;
    }
}

// Render blocklists
function renderBlocklists() {
    const container = document.getElementById('blocklists-container');

    if (appData.blocklists.length === 0) {
        container.innerHTML = `
      <div class="no-active-blocks clickable" id="empty-blocklists-cta" style="cursor: pointer;">
        <p>${tSettings('noBlocklistsYet')}</p>
        <p class="subtle">${tSettings('clickHereCreateBlocklist')}</p>
      </div>
    `;
        document.getElementById('empty-blocklists-cta').addEventListener('click', () => {
            openBlocklistModal();
        });
        return;
    }

    container.innerHTML = appData.blocklists.map(bl => {
        // Build detailed meta text
        const websiteCount = bl.websites?.length || 0;
        const regularApps = getBlocklistRegularApps(bl);
        const screenTimeSelection = getBlocklistIOSScreenTimeSelection(bl);
        const screenTimeLabel = formatIOSScreenTimeSelectionLabel(screenTimeSelection);
        const appCount = regularApps.length + (screenTimeLabel ? 1 : 0);
        const showDetails = bl.showItemDetails !== false; // Default to true
        let metaParts = [];

        if (websiteCount > 0) {
            if (showDetails) {
                const displaySites = bl.websites.map(cleanUrlForDisplay);
                const maxDisplay = appCount === 0 ? 3 : 2;
                if (websiteCount <= maxDisplay) {
                    metaParts.push(`${websiteCount} ${websiteWord(websiteCount)} (${displaySites.join(', ')})`);
                } else {
                    metaParts.push(`${websiteCount} ${websiteWord(websiteCount)} (${displaySites.slice(0, maxDisplay).join(', ')}, ...)`);
                }
            } else {
                metaParts.push(`${websiteCount} ${websiteWord(websiteCount)}`);
            }
        }

        if (appCount > 0) {
            if (screenTimeLabel) {
                const stText = `${screenTimeLabel.replace(' selected (Screen Time)', '')} via Screen Time`;
                if (regularApps.length > 0) {
                    metaParts.push(`${regularApps.length} ${regularApps.length === 1 ? 'app' : 'apps'} + ${stText}`);
                } else {
                    metaParts.push(stText);
                }
            } else if (showDetails) {
                if (appCount <= 2) {
                    metaParts.push(`${appCount} ${appCount === 1 ? 'app' : 'apps'} (${regularApps.join(', ')})`);
                } else {
                    metaParts.push(`${appCount} apps (${regularApps.slice(0, 2).join(', ')}, ...)`);
                }
            } else {
                metaParts.push(`${appCount} ${appCount === 1 ? 'app' : 'apps'}`);
            }
        }

        const metaText = metaParts.length > 0 ? metaParts.join(` ${tSettings('andWord')} `) : tSettings('noItems');

        // Get color for left border
        // Get color for left border
        const borderColor = bl.color || 'linear-gradient(135deg, #4a00e0 0%, #8e2de2 100%)';

        // Check if this blocklist has an active block
        const now = Date.now();
        const activeBlock = appData.activeBlocks.find(b => b.blocklistId === bl.id && b.startTime <= now && b.endTime > now);
        const isActive = !!activeBlock;

        // Check if this blocklist has a schedule
        const hasSchedule = appData.schedules && appData.schedules.some(s => s.blocklistId === bl.id);

        const activeClass = isActive ? ' blocklist-card-active' : (hasSchedule ? ' blocklist-card-scheduled' : '');

        // Calculate badges - show BOTH if applicable
        let oneOffBadge = '';
        let scheduleBadge = '';

        // Green "live" dot prefixed onto badges for blocks that are
        // currently running (one-off active or active schedule segment).
        // Same colour treatment as the BLOCKING NOW row dot.
        const runningDot = '<span class="badge-running-dot" aria-hidden="true"></span>';

        // One-off block badge (green with hourglass, or power icon for always-on)
        if (isActive && activeBlock) {
            if (activeBlock.isPaused) {
                // Paused badge — show pause icon and resume countdown
                const pauseRemaining = activeBlock.pauseEndTime - now;
                const pauseMins = Math.max(1, Math.ceil(pauseRemaining / 60000));
                const pauseTimeText = pauseMins >= 60 ? `${Math.floor(pauseMins / 60)}h ${pauseMins % 60}m` : `${pauseMins}m`;
                oneOffBadge = `<span class="active-badge paused-badge"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg> Paused ${pauseTimeText}</span>`;
            } else if (isBlockAlwaysOn(activeBlock)) {
                // Power icon for always-on blocks
                oneOffBadge = `<span class="active-badge">${runningDot}<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18.36 6.64a9 9 0 1 1-12.73 0"></path><line x1="12" y1="2" x2="12" y2="12"></line></svg> Always</span>`;
            } else {
                const remaining = activeBlock.endTime - now;
                const mins = Math.ceil(remaining / 60000);
                const timeText = mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins}m`;
                // Hourglass icon
                oneOffBadge = `<span class="active-badge">${runningDot}<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 22h14"/><path d="M5 2h14"/><path d="M17 22v-4.172a2 2 0 0 0-.586-1.414L12 12l-4.414 4.414A2 2 0 0 0 7 17.828V22"/><path d="M7 2v4.172a2 2 0 0 0 .586 1.414L12 12l4.414-4.414A2 2 0 0 0 17 6.172V2"/></svg> ${timeText} left</span>`;
            }
        }

        // Schedule badge (blue with calendar-sync)
        let scheduleSegmentRunning = false;
        if (hasSchedule) {
            const schedule = appData.schedules.find(s => s.blocklistId === bl.id);
            let scheduleTimeText = '';
            if (schedule && schedule.segments) {
                if (schedule.isPaused && schedule.pauseEndTime > now) {
                    const pauseMins = Math.max(1, Math.ceil((schedule.pauseEndTime - now) / 60000));
                    scheduleTimeText = pauseMins >= 60 ? `Paused ${Math.floor(pauseMins / 60)}h ${pauseMins % 60}m` : `Paused ${pauseMins}m`;
                } else {
                    // Check if any segment is currently active
                    const nowDate = new Date();
                    const currentDay = nowDate.getDay() === 0 ? 6 : nowDate.getDay() - 1; // Mon=0
                    const currentMins = nowDate.getHours() * 60 + nowDate.getMinutes();

                    // Find active segment (handling cross-midnight segments)
                    const activeSegment = schedule.segments.find(seg => {
                        const startMins = seg.startHour * 60 + seg.startMinute;
                        const endMins = seg.endHour * 60 + seg.endMinute;

                        if (endMins > startMins) {
                            // Same-day segment (e.g., 09:00 - 17:00)
                            return seg.days.includes(currentDay) &&
                                currentMins >= startMins &&
                                currentMins < endMins;
                        } else {
                            // Cross-midnight segment (e.g., 22:00 - 04:00)
                            const yesterdayDay = currentDay === 0 ? 6 : currentDay - 1;
                            const inEveningPortion = seg.days.includes(currentDay) && currentMins >= startMins;
                            const inMorningPortion = seg.days.includes(yesterdayDay) && currentMins < endMins;
                            return inEveningPortion || inMorningPortion;
                        }
                    });

                    if (activeSegment) {
                        // Currently blocking - show time left
                        scheduleSegmentRunning = true;
                        const startMins = activeSegment.startHour * 60 + activeSegment.startMinute;
                        const endMins = activeSegment.endHour * 60 + activeSegment.endMinute;
                        let minsLeft;

                        if (endMins > startMins) {
                            // Same-day segment
                            minsLeft = endMins - currentMins;
                        } else {
                            // Cross-midnight segment
                            if (currentMins >= startMins) {
                                // In evening portion: time until midnight + morning end
                                minsLeft = (24 * 60 - currentMins) + endMins;
                            } else {
                                // In morning portion: time until end
                                minsLeft = endMins - currentMins;
                            }
                        }
                        scheduleTimeText = minsLeft >= 60 ? `${Math.floor(minsLeft / 60)}h ${minsLeft % 60}m left` : `${minsLeft}m left`;
                    } else {
                        // Find next upcoming segment
                        let nextStart = null;
                        for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
                            const checkDay = (currentDay + dayOffset) % 7;
                            const segsForDay = schedule.segments.filter(seg => seg.days.includes(checkDay))
                                .sort((a, b) => (a.startHour * 60 + a.startMinute) - (b.startHour * 60 + b.startMinute));

                            for (const seg of segsForDay) {
                                const segStartMins = seg.startHour * 60 + seg.startMinute;
                                if (dayOffset === 0 && segStartMins <= currentMins) continue; // Already passed today

                                // Found next segment. minsUntil = (full days) + (start-of-segment minutes) - (current minutes).
                                // Same formula works whether dayOffset is 0 (today) or further out.
                                const minsUntil = (dayOffset * 24 * 60) + segStartMins - currentMins;

                                if (minsUntil < 60) {
                                    scheduleTimeText = `starts in ${minsUntil}m`;
                                } else if (minsUntil < 24 * 60) {
                                    scheduleTimeText = `starts in ${Math.floor(minsUntil / 60)}h`;
                                } else {
                                    const days = Math.floor(minsUntil / (24 * 60));
                                    scheduleTimeText = `starts in ${days}d`;
                                }
                                nextStart = true;
                                break;
                            }
                            if (nextStart) break;
                        }
                        if (!scheduleTimeText) scheduleTimeText = 'scheduled';
                    }
                }
            }
            // Calendar icon for scheduled blocklists
            const scheduleDot = scheduleSegmentRunning ? runningDot : '';
            scheduleBadge = `<span class="schedule-badge">${scheduleDot}<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><path d="M16 2v4"/><path d="M8 2v4"/><path d="M3 10h18"/></svg> ${scheduleTimeText}</span>`;
        }

        const activeBadge = oneOffBadge + scheduleBadge;

        // Check if this blocklist is selected
        const isSelected = bl.id === selectedBlocklistId;
        const selectedClass = isSelected ? ' selected' : '';
        const selectedStyle = isSelected ? `style="box-shadow: 0 0 0 3px ${bl.color || '#667eea'}, 0 4px 8px rgba(0, 0, 0, 0.1);"` : '';

        // Dim if something is selected but this one isn't
        const isDimmed = selectedBlocklistId && !isSelected;
        const dimmedClass = isDimmed ? ' dimmed' : '';

        return `
      <div class="blocklist-card${activeClass}${selectedClass}${dimmedClass}" data-id="${bl.id}" data-active="${isActive}" ${selectedStyle}>
        <div class="blocklist-stripe" style="background: ${borderColor}"></div>
        <div class="blocklist-info">
          <div class="blocklist-name"><span class="blocklist-emoji">${bl.emoji || '🚫'}</span>${escapeHtml(bl.name)}${activeBadge}</div>
          <div class="blocklist-meta">${escapeHtml(metaText)}</div>
        </div>
        <div class="blocklist-actions">
          <div class="blocklist-menu-wrapper">
            <button class="blocklist-action-btn blocklist-menu-btn" title="Blocklist options">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="1"></circle>
                <circle cx="5" cy="12" r="1"></circle>
                <circle cx="19" cy="12" r="1"></circle>
              </svg>
            </button>
            <div class="blocklist-menu hidden">
              <button class="blocklist-menu-item duplicate-blocklist-item" title="Duplicate">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <line x1="15" x2="15" y1="12" y2="18"/>
                  <line x1="12" x2="18" y1="15" y2="15"/>
                  <rect width="14" height="14" x="8" y="8" rx="2" ry="2"/>
                  <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>
                </svg>
                Duplicate
              </button>
              <button class="blocklist-menu-item delete-blocklist-item" title="Delete">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M3 6h18"></path>
                  <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path>
                  <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path>
                </svg>
                Delete
              </button>
            </div>
          </div>
          <button class="blocklist-action-btn edit-btn" title="Edit">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/>
              <path d="m15 5 4 4"/>
            </svg>
          </button>
        </div>
      </div>
    `;
    }).join('');

    // Add event listeners
    container.querySelectorAll('.blocklist-card').forEach(card => {
        const id = card.dataset.id;
        const isActive = card.dataset.active === 'true';

        // Click card to select it in the dropdown
        card.addEventListener('click', () => {
            const dropdown = document.getElementById('blocklist-select');
            dropdown.value = id;
            handleBlocklistSelect({ target: dropdown });
        });

        card.querySelector('.edit-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            closeAllBlocklistMenus();
            const blocklist = appData.blocklists.find(bl => bl.id === id);
            openBlocklistModal(blocklist);
        });

        card.querySelector('.blocklist-menu-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            const menu = card.querySelector('.blocklist-menu');
            if (!menu) return;
            const wasHidden = menu.classList.contains('hidden');
            closeAllBlocklistMenus();
            if (wasHidden) menu.classList.remove('hidden');
        });

        card.querySelector('.duplicate-blocklist-item').addEventListener('click', (e) => {
            e.stopPropagation();
            closeAllBlocklistMenus();
            duplicateBlocklist(id);
        });

        card.querySelector('.delete-blocklist-item').addEventListener('click', (e) => {
            e.stopPropagation();
            closeAllBlocklistMenus();
            deleteBlocklist(id);
        });

        // Drag and drop using mouse events on document
        card.addEventListener('mousedown', (e) => {
            // Don't start drag if clicking on buttons
            if (e.target.closest('.edit-btn') || e.target.closest('.blocklist-menu-btn') || e.target.closest('.blocklist-menu')) return;
            if (e.target.closest('.blocklist-actions')) return;
            if (e.button !== 0) return; // Only left click

            e.preventDefault(); // Prevent text selection

            const startY = e.clientY;
            let isDragging = false;
            const container = document.getElementById('blocklists-container');


            const onMouseMove = (moveEvent) => {
                // Only start dragging after moving 5px
                if (!isDragging && Math.abs(moveEvent.clientY - startY) > 5) {
                    isDragging = true;
                    card.classList.add('dragging');
                }

                if (!isDragging) return;

                const siblings = [...container.querySelectorAll('.blocklist-card:not(.dragging)')];
                const nextSibling = siblings.find(sibling => {
                    const rect = sibling.getBoundingClientRect();
                    return moveEvent.clientY < rect.top + rect.height / 2;
                });


                if (nextSibling) {
                    container.insertBefore(card, nextSibling);
                } else {
                    container.appendChild(card);
                }
            };

            const onMouseUp = () => {
                document.removeEventListener('mousemove', onMouseMove);
                document.removeEventListener('mouseup', onMouseUp);
                card.classList.remove('dragging');

                if (isDragging) {
                    saveBlocklistOrderFromDOM();
                }
            };

            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
        });
    });
}

function closeAllBlocklistMenus() {
    document.querySelectorAll('.blocklist-menu:not(.hidden)').forEach(menu => {
        menu.classList.add('hidden');
    });
}

// Save blocklist order based on DOM position
function saveBlocklistOrderFromDOM() {
    const container = document.getElementById('blocklists-container');
    if (!container) return;

    const cardElements = Array.from(container.querySelectorAll('.blocklist-card'));
    const newOrder = cardElements.map(card => card.dataset.id);

    // Reorder appData.blocklists to match
    const reorderedBlocklists = [];
    newOrder.forEach(id => {
        const blocklist = appData.blocklists.find(bl => bl.id === id);
        if (blocklist) {
            reorderedBlocklists.push(blocklist);
        }
    });

    // Add any blocklists that weren't in the DOM
    appData.blocklists.forEach(bl => {
        if (!reorderedBlocklists.find(r => r.id === bl.id)) {
            reorderedBlocklists.push(bl);
        }
    });

    appData.blocklists = reorderedBlocklists;
    saveData();

    // Re-render the bits of UI that mirror blocklist order. Don't call full render() —
    // the cards are already in the right order in the DOM (the user just dropped them
    // there), and a full re-render would briefly flicker.
    renderNowBlockingRow();
    renderScheduleVisibilityChips();
}

// Start interval to update remaining time
function startTickInterval() {
    // Track which blocks have been activated (to avoid repeated password prompts)
    // Initialize activatedBlockIds with already-active blocks at startup
    activatedBlockIds = new Set(
        appData.activeBlocks
            .filter(b => b.startTime <= Date.now())
            .map(b => b.id)
    );

    // Initialize app blocking immediately at startup
    // This ensures any active blocks or schedules are enforced right away
    updateBlockedApps();
    startTickInterval._lastScheduleStateSignature = getScheduleStateSignature();

    setInterval(async () => {
        const now = Date.now();
        let shouldSyncControls = false;

        // Drive the scheduled-block heads-up countdown. Cheap (no IPC unless
        // the warning state actually transitions); safe to run unconditionally.
        try {
            tickScheduledBlockWarning(now);
        } catch (e) {
            console.warn('[scheduled-warning] tick:', e);
        }

        // Check for future blocks that have now become active
        const newlyActiveBlocks = appData.activeBlocks.filter(
            block => block.startTime <= now && !activatedBlockIds.has(block.id)
        );

        if (newlyActiveBlocks.length > 0) {
            // Mark as activated
            newlyActiveBlocks.forEach(b => activatedBlockIds.add(b.id));
            // Update hosts to apply the blocking rules
            await updateHostsFile();
            render();
            shouldSyncControls = true;
        }

        // Check for paused blocks that should resume
        const resumedBlocks = appData.activeBlocks.filter(
            block => block.isPaused && block.pauseEndTime && block.pauseEndTime <= now
        );

        if (resumedBlocks.length > 0) {
            // Clear pause state
            resumedBlocks.forEach(block => {
                delete block.isPaused;
                delete block.pauseEndTime;
            });

            await saveData();
            await syncActiveBlocksToHelper();
            await updateHostsFile();
            await updateBlockedApps();
            render();
            shouldSyncControls = true;
        }

        // Check for paused schedules that should resume
        if (appData.schedules) {
            const resumedSchedules = appData.schedules.filter(
                s => s.isPaused && s.pauseEndTime && s.pauseEndTime <= now
            );

            if (resumedSchedules.length > 0) {
                resumedSchedules.forEach(schedule => {
                    delete schedule.isPaused;
                    delete schedule.pauseEndTime;
                });

                await saveData();
                await syncSchedulesToHelper();
                await updateHostsFile();
                await updateBlockedApps();
                render();
                shouldSyncControls = true;
            }
        }

        // Check for schedule segment transitions every 30s (schedules are minute-granular
        // and the helper daemon handles transitions autonomously)
        if (appData.schedules && appData.schedules.length > 0) {
            if (!startTickInterval._scheduleTickCount) startTickInterval._scheduleTickCount = 0;
            startTickInterval._scheduleTickCount++;

            if (startTickInterval._scheduleTickCount >= 30) {
                startTickInterval._scheduleTickCount = 0;
                await updateHostsFile();
                await updateBlockedApps();
                shouldSyncControls = true;
            }

            // Check for expired non-repeating schedules and auto-stop them
            const expiredScheduleIds = [];
            const nowDate = new Date(now);

            for (const schedule of appData.schedules) {
                // Only check non-repeating schedules (repeatType === 'no' or undefined)
                if (schedule.repeatType === 'forever') continue;

                // For date-limited schedules, check if past the repeat date
                if (schedule.repeatType === 'date' && schedule.repeatDate) {
                    const endDate = new Date(schedule.repeatDate);
                    endDate.setHours(23, 59, 59, 999); // End of day
                    if (nowDate > endDate) {
                        expiredScheduleIds.push(schedule.id);
                        console.log('Schedule expired (past repeat date):', schedule.id);
                    }
                    continue;
                }

                // For non-repeating schedules (repeatType === 'no' or undefined)
                // Calculate when each segment was supposed to occur based on createdAt
                const createdAt = new Date(schedule.createdAt);
                const createdDayOfWeek = createdAt.getDay() === 0 ? 6 : createdAt.getDay() - 1; // Convert to Mon=0 format

                let allSegmentsExpired = true;

                for (const segment of schedule.segments) {
                    for (const segmentDay of segment.days) {
                        // Calculate the actual date this segment occurs on
                        // It should be the first occurrence of this day on or after createdAt
                        let daysUntilSegment = segmentDay - createdDayOfWeek;
                        if (daysUntilSegment < 0) daysUntilSegment += 7;

                        const segmentDate = new Date(createdAt);
                        segmentDate.setDate(segmentDate.getDate() + daysUntilSegment);
                        segmentDate.setHours(segment.endHour, segment.endMinute, 0, 0);

                        // If this segment's end time is still in the future, the schedule is not expired
                        if (segmentDate > nowDate) {
                            allSegmentsExpired = false;
                            break;
                        }
                    }
                    if (!allSegmentsExpired) break;
                }

                if (allSegmentsExpired) {
                    expiredScheduleIds.push(schedule.id);
                    console.log('Non-repeating schedule expired (all segments passed):', schedule.id);
                }
            }

            // Remove expired schedules
            if (expiredScheduleIds.length > 0) {
                const previousScheduleCount = appData.schedules.length;
                appData.schedules = appData.schedules.filter(s => !expiredScheduleIds.includes(s.id));

                if (appData.schedules.length < previousScheduleCount) {
                    console.log('Auto-stopped expired schedule(s):', expiredScheduleIds);
                    activeScheduleSegmentCount = 0;
                    await saveData();
                    // Sync updated schedules to helper daemon
                    await syncSchedulesToHelper();
                    // Update blocked apps after schedule expiration
                    await updateBlockedApps();
                    render();
                    shouldSyncControls = true;
                }
            }
        }

        // Check for expired blocks
        const previousCount = appData.activeBlocks.length;
        appData.activeBlocks = appData.activeBlocks.filter(block => block.endTime > now);

        // Clean up activated set
        activatedBlockIds = new Set(
            [...activatedBlockIds].filter(id =>
                appData.activeBlocks.some(b => b.id === id)
            )
        );

        // Only re-render if blocks actually expired
        if (appData.activeBlocks.length < previousCount) {
            saveData();
            render();

            // Sync blocking rules now that blocks have been removed.
            // On iOS this clears Screen Time settings; on desktop the helper
            // daemon handles expiry autonomously, but the call is harmless.
            await updateHostsFile();
            await updateBlockedApps();
            shouldSyncControls = true;
        }

        const scheduleStateSignature = getScheduleStateSignature(now);
        if (startTickInterval._lastScheduleStateSignature !== scheduleStateSignature) {
            startTickInterval._lastScheduleStateSignature = scheduleStateSignature;
            // Schedule segment transitioned (active↔inactive) — update blocking
            // rules immediately so iOS Screen Time enforcement fires within ~1s
            // instead of waiting up to 30s for the schedule tick counter.
            if (isIOS) {
                await syncSchedulesToHelper();
            }
            await updateHostsFile();
            await updateBlockedApps();
            render();
            shouldSyncControls = true;
        }
        if (shouldSyncControls) {
            syncSelectedControlState();
        }

        // Update remaining times in UI
        document.querySelectorAll('.entry-remaining').forEach((el, idx) => {
            const block = appData.activeBlocks[idx];
            if (block) {
                if (block.isPaused) {
                    const pauseRemaining = Math.max(0, Math.ceil((block.pauseEndTime - now) / 60000));
                    el.textContent = `Paused — resumes in ${formatDuration(pauseRemaining)}`;
                } else if (isBlockAlwaysOn(block)) {
                    el.textContent = 'Always';
                } else {
                    const remaining = Math.max(0, Math.ceil((block.endTime - now) / 60000));
                    el.textContent = `${formatDuration(remaining)} remaining`;
                }
            }
        });

        // Auto-update end time if user hasn't manually edited it (skip in always-on mode)
        if (selectedBlocklistId && !userEditedEndTime && !isAlwaysOnMode) {
            const newEndTime = new Date(now + targetDurationMinutes * 60 * 1000);
            selectedEndHour = newEndTime.getHours();
            selectedEndMinute = newEndTime.getMinutes();
            updateTimeDisplay();
            // Don't call handleTimeChange here to avoid circular updates
        }
    }, 1000);
}

function getScheduleStateSignature(now = Date.now()) {
    const nowDate = new Date(now);
    if (!appData.schedules || appData.schedules.length === 0) return '';
    return appData.schedules.map(s => `${s.id || s.blocklistId}:${s.isPaused && s.pauseEndTime > now ? 1 : 0}:${isScheduleSegmentActiveNow(s, nowDate) ? 1 : 0}`).sort().join('|');
}

// Utility functions
function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

function formatTime(date) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// Format a minutes-since-midnight value as zero-padded "HH:MM". Used by drag-resize
// handlers to live-update the time label inside a preview block. Mirrors the clamping
// done by `minutesToTime` (max 23:00) so what's shown mid-drag matches what'll be
// committed on mouseup. Handles fractional minute rollover from rounding (e.g. 7:60).
function formatMinutesAsHHMM(totalMinutes) {
    const clamped = Math.max(0, Math.min(1440, totalMinutes));
    let h = Math.floor(clamped / 60);
    let m = Math.round(clamped - h * 60);
    if (m >= 60) { h += 1; m -= 60; }
    h = Math.min(23, h);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function formatDuration(minutes) {
    if (minutes < 60) {
        return `${minutes} min${minutes !== 1 ? 's' : ''}`;
    }
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (mins === 0) {
        return `${hours} hour${hours !== 1 ? 's' : ''}`;
    }
    return `${hours}h ${mins}m`;
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// Clean up URL for display (remove protocol, www, trailing slash)
function cleanUrlForDisplay(url) {
    return url
        .replace(/^https?:\/\//, '')  // Remove http:// or https://
        .replace(/^www\./, '')         // Remove www.
        .replace(/\/$/, '');           // Remove trailing slash
}

// Get contrasting text color (black or white) based on background color
function getContrastTextColor(backgroundColor) {
    if (!backgroundColor) return '#ffffff';

    // Parse color - handle hex, rgb, rgba, and named colors
    let r, g, b;

    if (backgroundColor.startsWith('#')) {
        // Hex color
        const hex = backgroundColor.slice(1);
        if (hex.length === 3) {
            r = parseInt(hex[0] + hex[0], 16);
            g = parseInt(hex[1] + hex[1], 16);
            b = parseInt(hex[2] + hex[2], 16);
        } else if (hex.length >= 6) {
            r = parseInt(hex.slice(0, 2), 16);
            g = parseInt(hex.slice(2, 4), 16);
            b = parseInt(hex.slice(4, 6), 16);
        }
    } else if (backgroundColor.startsWith('rgb')) {
        // RGB or RGBA
        const match = backgroundColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
        if (match) {
            r = parseInt(match[1]);
            g = parseInt(match[2]);
            b = parseInt(match[3]);
        }
    }

    // If we couldn't parse, default to white text
    if (r === undefined || g === undefined || b === undefined) {
        return '#ffffff';
    }

    // Calculate relative luminance using WCAG formula
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

    // Return black for light backgrounds, white for dark backgrounds
    return luminance > 0.5 ? '#000000' : '#ffffff';
}

const SETTINGS_TRANSLATIONS = {
    en: {
        // Main shell
        updateBannerPrefix: 'Version',
        updateBannerSuffix: 'is available',
        updateBannerCta: 'Reinstall from reddfocus.org',
        mainStartBlockTitle: 'Start a Block',
        modeNow: 'Now',
        modeSchedule: 'Schedule',
        selectionPrompt: 'Select a blocklist',
        selectionPromptOption: 'Select a blocklist...',
        yourBlocklists: 'My Blocklists',
        scheduleTitle: 'Weekly Schedule',
        today: 'Today',
        noActiveBlocks: 'No active blocks',
        alwaysOnRowLabel: 'Always on:',
        alwaysOnRowNote: '· not shown in timeline',
        nowBlockingLabel: 'BLOCKING NOW',
        nowBlockingUntil: 'until',
        nowBlockingAlways: 'always on',
        nowBlockingMenuAria: 'Block actions',
        nowBlockingMenuEdit: 'Edit',
        nowBlockingMenuPause: 'Pause',
        nowBlockingMenuStop: 'Stop',
        scheduleFooterHint: 'Click any block to edit',
        madeWith: 'Made with',
        by: 'by',
        andWord: 'and',
        nothingWord: 'nothing',
        noItems: 'No items',
        noBlocklistsYet: 'No blocklists yet',
        clickHereCreateBlocklist: 'Click here to create one',
        typeHere: 'Type here...',
        placeholderNameExample: 'e.g., Social Media',
        placeholderWebsiteExample: 'e.g., facebook.com',
        placeholderAppExample: 'e.g., Safari',
        invalidDomainMsg: 'Please enter a valid domain (e.g. reddit.com)',
        cannotBlockDomainPlaceholder: '⚠️ Can\'t block this domain!',
        cannotBlockSelfAppPlaceholder: '⚠️ Can\'t block ReDD Block itself!',
        // Start/schedule controls
        durationQuickAlways: 'Always',
        alwaysOnMessage: 'This block will stay on until you pause it or turn it off',
        duration: 'Duration',
        durationUnitMin: 'min',
        end: 'End',
        nextDay: 'day',
        quickSelect: 'Quick Select',
        start: 'Start',
        days: 'Days',
        add: 'Add',
        repeat: 'Repeat:',
        repeatNo: 'No',
        repeatForever: 'Forever',
        repeatUntilDate: 'Until date',
        pause: 'Pause',
        startBlockButton: 'Start Block:',
        startScheduleButton: 'Start Schedule:',
        stopScheduleButton: 'Stop Schedule:',
        editScheduleButton: 'Edit Schedule:',
        // Blocklist modal
        createBlocklist: 'Create Blocklist',
        editBlocklist: 'Edit Blocklist',
        activeBlocklistWarning: 'This blocklist is active. Some settings are locked.',
        name: 'Name',
        websites: 'Websites',
        websitesTooltip: 'Blocking applies to entire domains. For example, typing "facebook.com" blocks all of Facebook, not just specific pages.',
        apps: 'Apps',
        appsTooltip: 'Enter the exact name of the application (e.g. \'Safari\'). You can also use the folder button to find the app.',
        overrideDifficulty: 'Override Difficulty',
        overrideRandomWords: 'Random Words',
        overrideGibberish: 'Random Gibberish',
        overrideCustomText: 'Custom Text',
        overrideMaxDifficulty: 'Max difficulty',
        totalCharacters: 'total characters',
        color: 'Color',
        emoji: 'Emoji',
        advancedOptions: 'Advanced options',
        listBlockedOnCard: 'List blocked websites & apps on card',
        importWebsitesTitle: 'Import websites',
        importWebsitesPickFileTitle: 'Select a file with one domain per line',
        importWebsitesFromFile: 'From text file…',
        importWebsitesPreMadeList: 'Pre-made list',
        importPresetEmail: 'Email',
        importPresetGambling: 'Gambling',
        importPresetNews: 'News',
        importPresetPorn: 'Porn',
        importPresetSearchEngines: 'Search engines',
        importPresetShopping: 'Shopping',
        importPresetSocialMedia: 'Social media',
        cancel: 'Cancel',
        save: 'Save',
        // Override / pause / confirmation modals
        overrideBlockTitle: 'Override Block?',
        overrideInstruction: 'To cancel this block early, type the following:',
        override: 'Override',
        pauseBlockTitle: 'Pause Block',
        pauseFor: 'PAUSE FOR',
        restartsAt: 'RESTARTS AT',
        pauseInstruction: 'To pause this block, type the following:',
        helperSetupTitle: 'Setup Required',
        helperSetupText: 'To block websites when the app is closed, ReDD Block needs to install a small background service. Your computer will prompt you for your password once — after that, blocks will start instantly without asking again.',
        helperRepairTitle: 'Helper Repair Required',
        helperRepairText: 'A helper service is already installed, but it is not running right now. ReDD Block needs to reinstall or repair it before this block can start. Your computer may prompt you for your password to complete the repair.',
        helperUpdateTitle: 'Helper Update Required',
        helperUpdateText: 'A helper service is already installed, but it needs an update before this block can start. Your computer will prompt you for your password to apply the update.',
        helperOpenSourceLink: 'open source code for ReDD Block here',
        proceed: 'Proceed',
        reinstallHelper: 'Reinstall Helper',
        helperInstalling: 'Installing...',
        helperUpdating: 'Updating...',
        helperReinstalling: 'Reinstalling...',
        startThisBlock: 'Start this block?',
        blockedWebsites: 'Blocked websites:',
        blockedApps: 'Blocked apps:',
        showAll: 'show all',
        confirmDuration: 'Duration:',
        confirmOverrideNeed: 'To cancel this block early, you\'ll need to:',
        startBlock: 'Start Block',
        resumeBlock: 'Resume Block',
        alwaysUntilOff: 'Always (until turned off)',
        scheduleResumingSegment: 'Schedule (resuming current segment)',
        startThisSchedule: 'Start this schedule?',
        repeatLabel: 'Repeat:',
        confirmScheduleOverrideNeed: 'To cancel blocks in this schedule, you\'ll need to:',
        startSchedule: 'Start Schedule',
        noDaysSelected: 'No days selected',
        runningSuffix: ' (Running)',
        // Override all
        overrideAllTitle: 'Override All Blocks?',
        overrideAllWarningStrong: 'Are you sure you want to stop all running blocks?',
        overrideAllWarningBody: 'This will stop ANY currently running blocks for any website and app. It will also stop any future scheduled blocking.',
        overrideAllInstruction: 'To do this, type the following:',
        overrideAll: 'Override All',
        undo: 'Undo',
        // Settings
        settingsTitle: 'Settings',
        yourVersionPrefix: 'Your version:',
        latestVersionPrefix: 'Latest version:',
        lightDarkMode: 'Light/dark mode',
        language: 'Language',
        themeAuto: 'Auto',
        themeLight: 'Light',
        themeDark: 'Dark',
        languageEnglish: 'English',
        languageDanish: 'Dansk',
        advancedOptions: 'Advanced options',
        overrideAllBlocks: 'Stop all blocks (with challenge)',
        // In-app uninstall (macOS only)
        uninstallApp: 'Uninstall ReDD Block',
        uninstallDisabledHint: 'Stop running blocks first before you can uninstall.',
        uninstallConfirmTitle: 'Uninstall ReDD Block?',
        uninstallConfirmBody: 'ReDD Block will be moved to the Trash, and its launch-at-login entry will be removed. The ReDD Focus browser extensions will stay installed — they work independently and are unaffected. Your blocklists and schedules are kept on disk so they can be restored if you reinstall later.\n\nIf macOS asks you to allow ReDD Block to control Finder, please click Allow — that\u2019s how the app moves itself to the Trash on systems where it can\u2019t do it directly.',
        uninstallConfirmOk: 'Uninstall',
        uninstallFailedTitle: 'Uninstall failed',
        uninstallFailed: 'Could not complete uninstall.',
        helperService: 'Helper service',
        helperStatusChecking: 'Checking...',
        helperStatusActive: 'Active',
        helperStatusIdle: 'Idle',
        helperStatusInstalledNotReachable: 'Installed, not reachable',
        helperStatusUpdateAvailable: 'Update available',
        helperStatusNotInstalled: 'Not installed',
        helperStatusUnknown: 'Unknown',
        updateHelper: 'Update Helper',
        uninstallHelper: 'Uninstall Helper',
        helperRemoving: 'Removing...',
        helperRemoved: 'Helper removed',
        helperRemovedSuccess: 'Helper service removed successfully.',
        helperRemovedFallback: 'Helper service removed using fallback cleanup because the installed helper was not responding normally.',
        helperRemoveStaleHint: 'Installed, but not currently running. You can remove the stale helper before reinstalling it.',
        cleanHostsFile: 'Clean hosts file',
        helperHint: 'Remove all ReDD Block entries from your system\'s hosts file. Use this if websites remain blocked after all blocks have been stopped.',
        close: 'Close',
        // Time/date words
        dayAbbrev: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
        dayAbbrevMon0: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
        locale: 'en-US',
    },
    da: {
        // Main shell
        updateBannerPrefix: 'Version',
        updateBannerSuffix: 'er tilgængelig',
        updateBannerCta: 'Geninstaller fra reddfocus.org',
        mainStartBlockTitle: 'Start en blokering',
        modeNow: 'Nu',
        modeSchedule: 'Skema',
        selectionPrompt: 'Vælg en blokliste',
        selectionPromptOption: 'Vælg en blokliste...',
        yourBlocklists: 'Mine bloklister',
        scheduleTitle: 'Ugentligt skema',
        today: 'I dag',
        noActiveBlocks: 'Ingen aktive blokeringer',
        alwaysOnRowLabel: 'Altid tændt:',
        alwaysOnRowNote: '· vises ikke i tidslinjen',
        nowBlockingLabel: 'BLOKERER NU',
        nowBlockingUntil: 'indtil',
        nowBlockingAlways: 'altid tændt',
        nowBlockingMenuAria: 'Handlinger for blok',
        nowBlockingMenuEdit: 'Rediger',
        nowBlockingMenuPause: 'Pause',
        nowBlockingMenuStop: 'Stop',
        scheduleFooterHint: 'Klik på en blok for at redigere',
        madeWith: 'Lavet med',
        by: 'af',
        andWord: 'og',
        nothingWord: 'intet',
        noItems: 'Ingen elementer',
        noBlocklistsYet: 'Ingen bloklister endnu',
        clickHereCreateBlocklist: 'Klik her for at oprette en',
        typeHere: 'Skriv her...',
        placeholderNameExample: 'f.eks. Sociale medier',
        placeholderWebsiteExample: 'f.eks. facebook.com',
        placeholderAppExample: 'f.eks. Safari',
        invalidDomainMsg: 'Indtast et gyldigt domæne (f.eks. reddit.com)',
        cannotBlockDomainPlaceholder: '⚠️ Dette domæne kan ikke blokeres!',
        cannotBlockSelfAppPlaceholder: '⚠️ ReDD Block kan ikke blokere sig selv!',
        // Start/schedule controls
        durationQuickAlways: 'Altid',
        alwaysOnMessage: 'Denne blokering forbliver aktiv, indtil du pauser den eller slår den fra',
        duration: 'Varighed',
        durationUnitMin: 'min',
        end: 'Slut',
        nextDay: 'dag',
        quickSelect: 'Hurtigvalg',
        start: 'Start',
        days: 'Dage',
        add: 'Tilføj',
        repeat: 'Gentag:',
        repeatNo: 'Nej',
        repeatForever: 'For evigt',
        repeatUntilDate: 'Indtil dato',
        pause: 'Pause',
        startBlockButton: 'Start blokering:',
        startScheduleButton: 'Start skema:',
        stopScheduleButton: 'Stop skema:',
        editScheduleButton: 'Rediger skema:',
        // Blocklist modal
        createBlocklist: 'Opret blokliste',
        editBlocklist: 'Rediger blokliste',
        activeBlocklistWarning: 'Denne blokliste er aktiv. Nogle indstillinger er låst.',
        name: 'Navn',
        websites: 'hjemmesider',
        websitesTooltip: 'Blokering gælder hele domæner. Hvis du fx skriver "facebook.com", blokeres hele Facebook, ikke kun specifikke sider.',
        apps: 'Apps',
        appsTooltip: 'Indtast det præcise navn på appen (fx "Safari"). Du kan også bruge mappeknappen til at finde appen.',
        overrideDifficulty: 'Sværhedsgrad',
        overrideRandomWords: 'Tilfældige ord',
        overrideGibberish: 'Tilfældig gibberish',
        overrideCustomText: 'Egen tekst',
        overrideMaxDifficulty: 'Maksimal sværhedsgrad',
        totalCharacters: 'tegn i alt',
        color: 'Farve',
        emoji: 'Emoji',
        advancedOptions: 'Avancerede indstillinger',
        listBlockedOnCard: 'Vis blokerede websites og apps på kortet',
        importWebsitesTitle: 'Importér websites',
        importWebsitesPickFileTitle: 'Vælg en fil med ét domæne pr. linje',
        importWebsitesFromFile: 'Fra tekstfil…',
        importWebsitesPreMadeList: 'Færdiglavet liste',
        importPresetEmail: 'E-mail',
        importPresetGambling: 'Spil',
        importPresetNews: 'Nyheder',
        importPresetPorn: 'Porno',
        importPresetSearchEngines: 'Søgemaskiner',
        importPresetShopping: 'Shopping',
        importPresetSocialMedia: 'Sociale medier',
        cancel: 'Annuller',
        save: 'Gem',
        // Override / pause / confirmation modals
        overrideBlockTitle: 'Overstyr blokering?',
        overrideInstruction: 'For at annullere denne blokering tidligt, skriv følgende:',
        override: 'Overstyr',
        pauseBlockTitle: 'Sæt blokering på pause',
        pauseFor: 'PAUSE I',
        restartsAt: 'STARTER IGEN KL.',
        pauseInstruction: 'For at pause denne blokering, skriv følgende:',
        helperSetupTitle: 'Opsætning påkrævet',
        helperSetupText: 'For at blokere websites, når appen er lukket, skal ReDD Block installere en lille baggrundstjeneste. Din computer beder om adgangskode én gang — derefter starter blokeringer med det samme uden ny prompt.',
        helperRepairTitle: 'Reparation af helper påkrævet',
        helperRepairText: 'Der er allerede installeret en helper-tjeneste, men den kører ikke lige nu. ReDD Block skal geninstallere eller reparere den, før denne blokering kan starte. Din computer kan bede om adgangskode for at fuldføre reparationen.',
        helperUpdateTitle: 'Helper-opdatering påkrævet',
        helperUpdateText: 'Der er allerede installeret en helper-tjeneste, men den skal opdateres, før denne blokering kan starte. Din computer beder om adgangskode for at gennemføre opdateringen.',
        helperOpenSourceLink: 'open source-koden til ReDD Block her',
        proceed: 'Fortsæt',
        reinstallHelper: 'Geninstaller helper',
        helperInstalling: 'Installerer...',
        helperUpdating: 'Opdaterer...',
        helperReinstalling: 'Geninstallerer...',
        startThisBlock: 'Start denne blokering?',
        blockedWebsites: 'Blokerede hjemmesider:',
        blockedApps: 'Blokerede apps:',
        showAll: 'vis alle',
        confirmDuration: 'Varighed:',
        confirmOverrideNeed: 'For at annullere denne blokering tidligt skal du:',
        startBlock: 'Start blokering',
        resumeBlock: 'Genoptag blokering',
        alwaysUntilOff: 'Altid (indtil den slås fra)',
        scheduleResumingSegment: 'Skema (genoptager nuværende segment)',
        startThisSchedule: 'Start dette skema?',
        repeatLabel: 'Gentag:',
        confirmScheduleOverrideNeed: 'For at annullere blokeringer i dette skema skal du:',
        startSchedule: 'Start skema',
        noDaysSelected: 'Ingen dage valgt',
        runningSuffix: ' (Kører)',
        // Override all
        overrideAllTitle: 'Overstyr alle blokeringer?',
        overrideAllWarningStrong: 'Er du sikker på, at du vil stoppe alle aktive blokeringer?',
        overrideAllWarningBody: 'Dette stopper ALLE nuværende blokeringer af websites og apps. Det stopper også alle fremtidige planlagte blokeringer.',
        overrideAllInstruction: 'For at gøre dette, skriv følgende:',
        overrideAll: 'Overstyr alle',
        undo: 'Fortryd',
        // Settings
        settingsTitle: 'Indstillinger',
        yourVersionPrefix: 'Din version:',
        latestVersionPrefix: 'Nyeste version:',
        lightDarkMode: 'Lys/mørk tilstand',
        language: 'Sprog',
        themeAuto: 'Auto',
        themeLight: 'Lys',
        themeDark: 'Mørk',
        languageEnglish: 'Engelsk',
        languageDanish: 'Dansk',
        overrideAllBlocks: 'Stop alle blokeringer (med udfordring)',
        // In-app uninstall (macOS only)
        uninstallApp: 'Afinstaller ReDD Block',
        uninstallDisabledHint: 'Stop kørende blokeringer først, før du kan afinstallere.',
        uninstallConfirmTitle: 'Afinstaller ReDD Block?',
        uninstallConfirmBody: 'ReDD Block flyttes til papirkurven, og login-ved-opstart fjernes. ReDD Focus-browserudvidelserne forbliver installeret — de fungerer uafhængigt og påvirkes ikke. Dine blokeringslister og tidsplaner bevares på disken, så de kan gendannes, hvis du geninstallerer senere.\n\nHvis macOS spørger, om ReDD Block må styre Finder, skal du klikke Tillad — det er sådan, appen flytter sig selv til papirkurven på systemer, hvor den ikke kan gøre det direkte.',
        uninstallConfirmOk: 'Afinstaller',
        uninstallFailedTitle: 'Afinstallation mislykkedes',
        uninstallFailed: 'Kunne ikke gennemføre afinstallation.',
        helperService: 'Hjælper',
        helperStatusChecking: 'Tjekker...',
        helperStatusActive: 'Aktiv',
        helperStatusIdle: 'Inaktiv',
        helperStatusInstalledNotReachable: 'Installeret, men ikke tilgængelig',
        helperStatusUpdateAvailable: 'Opdatering tilgængelig',
        helperStatusNotInstalled: 'Ikke installeret',
        helperStatusUnknown: 'Ukendt',
        updateHelper: 'Opdater hjælper',
        uninstallHelper: 'Afinstaller hjælper',
        helperRemoving: 'Fjerner...',
        helperRemoved: 'Helper fjernet',
        helperRemovedSuccess: 'Hjælperen blev fjernet.',
        helperRemovedFallback: 'Hjælperen blev fjernet via reserveoprydning, fordi den installerede hjælper ikke svarede normalt.',
        helperRemoveStaleHint: 'Installeret, men kører ikke lige nu. Du kan fjerne den gamle hjælper her, før du geninstallerer den.',
        cleanHostsFile: 'Ryd hosts-fil',
        helperHint: 'Fjern alle ReDD Block-indsætninger fra systemets hosts-fil. Brug kun dette, hvis websites stadig er utilgængelige efter du har stoppet alle blokeringer.',
        close: 'Luk',
        // Time/date words
        dayAbbrev: ['Søn', 'Man', 'Tir', 'Ons', 'Tor', 'Fre', 'Lør'],
        dayAbbrevMon0: ['Man', 'Tir', 'Ons', 'Tor', 'Fre', 'Lør', 'Søn'],
        locale: 'da-DK',
    },
};

function getSettingsLanguage() {
    return appData.settings?.language === 'da' ? 'da' : 'en';
}

function tSettings(key) {
    const lang = getSettingsLanguage();
    return SETTINGS_TRANSLATIONS[lang][key] || SETTINGS_TRANSLATIONS.en[key] || key;
}

function websiteWord(count) {
    if (getSettingsLanguage() === 'da') {
        return count === 1 ? 'hjemmeside' : 'hjemmesider';
    }
    return count === 1 ? 'website' : 'websites';
}

function formatCurrentVersionText(version) {
    return `${tSettings('yourVersionPrefix')} ${version || 'Unknown'}`;
}

function formatLatestVersionText(version) {
    return `${tSettings('latestVersionPrefix')} ${version || 'Unknown'}`;
}

function applySettingsLanguage() {
    const setText = (id, text) => {
        const el = document.getElementById(id);
        if (el) el.textContent = text;
    };

    // Main shell / scheduler
    setText('update-banner-prefix', tSettings('updateBannerPrefix'));
    setText('update-banner-suffix', tSettings('updateBannerSuffix'));
    setText('update-banner-link', tSettings('updateBannerCta'));
    setText('main-start-block-title', tSettings('mainStartBlockTitle'));
    setText('instant-mode-tab-label', tSettings('modeNow'));
    setText('schedule-mode-tab-label', tSettings('modeSchedule'));
    setText('selection-prompt-label', tSettings('selectionPrompt'));
    const blocklistSelect = document.getElementById('blocklist-select');
    if (blocklistSelect && blocklistSelect.options.length > 0) {
        blocklistSelect.options[0].textContent = tSettings('selectionPromptOption');
    }
    setText('main-blocklists-title', tSettings('yourBlocklists'));
    setText('main-schedule-title', tSettings('scheduleTitle'));
    setText('no-active-blocks-label', tSettings('noActiveBlocks'));
    setText('always-on-row-label', tSettings('alwaysOnRowLabel'));
    setText('always-on-row-note', tSettings('alwaysOnRowNote'));
    setText('now-blocking-label-text', tSettings('nowBlockingLabel'));
    setText('schedule-footer-hint', tSettings('scheduleFooterHint'));
    setText('duration-quick-btn-always-label', tSettings('durationQuickAlways'));
    setText('always-on-message-text', tSettings('alwaysOnMessage'));
    setText('duration-label', tSettings('duration'));
    setText('duration-unit-label', tSettings('durationUnitMin'));
    setText('end-label', tSettings('end'));
    setText('quick-select-label', tSettings('quickSelect'));
    setText('schedule-start-label', tSettings('start'));
    setText('schedule-end-label', tSettings('end'));
    setText('schedule-days-label', tSettings('days'));
    setText('add-segment-label', tSettings('add'));
    setText('repeat-label', tSettings('repeat'));
    const repeatNo = document.querySelector('.repeat-option[data-value="no"]');
    const repeatForever = document.querySelector('.repeat-option[data-value="forever"]');
    const repeatDate = document.querySelector('.repeat-option[data-value="date"]');
    if (repeatNo) repeatNo.textContent = tSettings('repeatNo');
    if (repeatForever) repeatForever.textContent = tSettings('repeatForever');
    if (repeatDate) repeatDate.textContent = tSettings('repeatUntilDate');
    const repeatDropdownText = document.getElementById('repeat-dropdown-text');
    if (repeatDropdownText) {
        if (scheduleRepeatType === 'forever') repeatDropdownText.textContent = tSettings('repeatForever');
        else if (scheduleRepeatType === 'date') repeatDropdownText.textContent = tSettings('repeatUntilDate');
        else repeatDropdownText.textContent = tSettings('repeatNo');
    }
    setText('pause-btn-label', tSettings('pause'));
    setBtnActionLabel(document.getElementById('start-block-btn-label'), tSettings('startBlockButton'));
    setBtnActionLabel(document.getElementById('start-schedule-btn-label'), tSettings('startScheduleButton'));
    setText('footer-made-with', tSettings('madeWith'));
    setText('footer-by', tSettings('by'));
    const setPlaceholder = (id, text) => {
        const el = document.getElementById(id);
        if (el) el.placeholder = text;
    };
    setPlaceholder('blocklist-name', tSettings('placeholderNameExample'));
    setPlaceholder('modal-website-input', tSettings('placeholderWebsiteExample'));
    setPlaceholder('modal-app-input', tSettings('placeholderAppExample'));
    setPlaceholder('challenge-input', tSettings('typeHere'));
    setPlaceholder('pause-challenge-input', tSettings('typeHere'));
    setPlaceholder('override-all-challenge-input', tSettings('typeHere'));
    setText('website-input-error', tSettings('invalidDomainMsg'));

    // Blocklist modal
    const modalTitle = document.getElementById('modal-title');
    if (modalTitle) {
        modalTitle.textContent = editingBlocklistId ? tSettings('editBlocklist') : tSettings('createBlocklist');
    }
    setText('active-blocklist-warning-text', tSettings('activeBlocklistWarning'));
    setText('blocklist-name-label', tSettings('name'));
    setText('blocklist-websites-label', tSettings('websites'));
    setText('blocklist-websites-tooltip', tSettings('websitesTooltip'));
    setText('blocklist-apps-label', tSettings('apps'));
    setText('blocklist-apps-tooltip', tSettings('appsTooltip'));
    setText('override-difficulty-label', tSettings('overrideDifficulty'));
    setText('override-option-random-words', tSettings('overrideRandomWords'));
    setText('override-option-gibberish', tSettings('overrideGibberish'));
    setText('override-option-custom', tSettings('overrideCustomText'));
    setText('override-max-difficulty-label', tSettings('overrideMaxDifficulty'));
    setText('override-total-characters-label', tSettings('totalCharacters'));
    setText('blocklist-color-label', tSettings('color'));
    setText('blocklist-emoji-label', tSettings('emoji'));
    setText('blocklist-advanced-options-label', tSettings('advancedOptions'));
    setText('show-item-details-label', tSettings('listBlockedOnCard'));
    setText('websites-import-menu-text-file-label', tSettings('importWebsitesFromFile'));
    setText('websites-import-menu-section-label', tSettings('importWebsitesPreMadeList'));
    setText('websites-import-menu-email', tSettings('importPresetEmail'));
    setText('websites-import-menu-gambling', tSettings('importPresetGambling'));
    setText('websites-import-menu-news', tSettings('importPresetNews'));
    setText('websites-import-menu-porn', tSettings('importPresetPorn'));
    setText('websites-import-menu-search-engines', tSettings('importPresetSearchEngines'));
    setText('websites-import-menu-shopping', tSettings('importPresetShopping'));
    setText('websites-import-menu-social-media', tSettings('importPresetSocialMedia'));
    const importWebsitesBtn = document.getElementById('modal-import-websites-btn');
    if (importWebsitesBtn) {
        importWebsitesBtn.title = tSettings('importWebsitesTitle');
        importWebsitesBtn.setAttribute('aria-label', tSettings('importWebsitesTitle'));
    }
    setText('cancel-blocklist-btn', tSettings('cancel'));
    setText('save-blocklist-btn', tSettings('save'));

    // Modal copy
    setText('override-modal-title', tSettings('overrideBlockTitle'));
    setText('override-modal-instruction', tSettings('overrideInstruction'));
    setText('cancel-override-btn', tSettings('cancel'));
    setText('confirm-override-btn', tSettings('override'));
    setText('pause-modal-title', tSettings('pauseBlockTitle'));
    setText('pause-for-label', tSettings('pauseFor'));
    setText('pause-restarts-at-label', tSettings('restartsAt'));
    setText('pause-modal-instruction', tSettings('pauseInstruction'));
    setText('cancel-pause-btn', tSettings('cancel'));
    setText('confirm-pause-btn', tSettings('pause'));
    setText('start-block-confirm-title', tSettings('startThisBlock'));
    setText('confirm-blocked-websites-label', tSettings('blockedWebsites'));
    setText('confirm-blocked-apps-label', tSettings('blockedApps'));
    setText('show-all-websites', tSettings('showAll'));
    setText('show-all-apps', tSettings('showAll'));
    setText('confirm-duration-label', tSettings('confirmDuration'));
    setText('confirm-override-header', tSettings('confirmOverrideNeed'));
    setText('cancel-start-confirm-btn', tSettings('cancel'));
    setText('proceed-start-confirm-btn', tSettings('startBlock'));
    setText('start-schedule-confirm-title', tSettings('startThisSchedule'));
    setText('schedule-confirm-blocked-websites-label', tSettings('blockedWebsites'));
    setText('schedule-confirm-blocked-apps-label', tSettings('blockedApps'));
    setText('show-all-schedule-websites', tSettings('showAll'));
    setText('show-all-schedule-apps', tSettings('showAll'));
    setText('schedule-summary-header', tSettings('scheduleTitle'));
    setText('schedule-confirm-repeat-label', tSettings('repeatLabel'));
    setText('schedule-confirm-override-header', tSettings('confirmScheduleOverrideNeed'));
    setText('cancel-schedule-confirm-btn', tSettings('cancel'));
    setText('proceed-schedule-confirm-btn', tSettings('startSchedule'));
    setText('undo-toast-btn', tSettings('undo'));
    setText('override-all-title', tSettings('overrideAllTitle'));
    setText('override-all-warning-strong', tSettings('overrideAllWarningStrong'));
    setText('override-all-warning-body', tSettings('overrideAllWarningBody'));
    setText('override-all-instruction', tSettings('overrideAllInstruction'));
    setText('cancel-override-all-btn', tSettings('cancel'));
    setText('confirm-override-all-btn', tSettings('overrideAll'));
    setText('next-day-indicator', `+1 ${tSettings('nextDay')}`);
    setText('pause-next-day-indicator', `+1 ${tSettings('nextDay')}`);

    setText('settings-modal-title', tSettings('settingsTitle'));
    setText('settings-theme-label', tSettings('lightDarkMode'));
    setText('settings-language-label', tSettings('language'));
    setText('theme-option-system', tSettings('themeAuto'));
    setText('theme-option-light', tSettings('themeLight'));
    setText('theme-option-dark', tSettings('themeDark'));
    setText('language-option-en', tSettings('languageEnglish'));
    setText('language-option-da', tSettings('languageDanish'));
    setText('settings-advanced-options-label', tSettings('advancedOptions'));
    setText('settings-override-all-label', tSettings('overrideAllBlocks'));
    setText('settings-uninstall-label', tSettings('uninstallApp'));
    // The hint paragraph and button tooltip need re-translation too —
    // refreshUninstallButtonState reads from tSettings() and rewrites
    // both. Cheap to call unconditionally.
    refreshUninstallButtonState();
    setText('settings-helper-service-label', tSettings('helperService'));
    setText('settings-update-helper-label', tSettings('updateHelper'));
    setText('settings-clean-hosts-label', tSettings('cleanHostsFile'));
    setText('settings-helper-hint', tSettings('helperHint'));
    setText('close-settings-btn', tSettings('close'));

    const currentVersionEl = document.getElementById('current-app-version');
    if (currentVersionEl) {
        const raw = currentVersionEl.textContent || '';
        const version = raw.split(':').slice(1).join(':').trim() || '...';
        currentVersionEl.textContent = formatCurrentVersionText(version);
    }

    const latestVersionEl = document.getElementById('latest-app-version');
    if (latestVersionEl) {
        const raw = latestVersionEl.textContent || '';
        const version = raw.split(':').slice(1).join(':').trim() || '...';
        latestVersionEl.textContent = formatLatestVersionText(version);
    }

    const helperStatusText = document.getElementById('settings-helper-status-text');
    if (helperStatusText) {
        const raw = (helperStatusText.textContent || '').trim();
        const statusMap = {
            'Checking...': tSettings('helperStatusChecking'),
            'Active': tSettings('helperStatusActive'),
            'Idle': tSettings('helperStatusIdle'),
            'Installed, not reachable': tSettings('helperStatusInstalledNotReachable'),
            'Update available': tSettings('helperStatusUpdateAvailable'),
            'Not installed': tSettings('helperStatusNotInstalled'),
            'Unknown': tSettings('helperStatusUnknown'),
            'Tjekker...': tSettings('helperStatusChecking'),
            'Aktiv': tSettings('helperStatusActive'),
            'Inaktiv': tSettings('helperStatusIdle'),
            'Installeret, men ikke tilgaengelig': tSettings('helperStatusInstalledNotReachable'),
            'Installeret, men ikke tilgængelig': tSettings('helperStatusInstalledNotReachable'),
            'Opdatering tilgaengelig': tSettings('helperStatusUpdateAvailable'),
            'Opdatering tilgængelig': tSettings('helperStatusUpdateAvailable'),
            'Ikke installeret': tSettings('helperStatusNotInstalled'),
            'Ukendt': tSettings('helperStatusUnknown'),
        };
        if (statusMap[raw]) helperStatusText.textContent = statusMap[raw];
    }

    // Re-render pieces with dynamic language-dependent text.
    renderBlocklists();
    if (document.getElementById('blocklist-select')) renderBlocklistSelector();
    if (typeof updateScheduleButtonState === 'function') updateScheduleButtonState();
    if (typeof updateWeekCalendar === 'function') updateWeekCalendar();
}

// Theme Handling
function setupTheme() {
    // Apply initial theme from saved settings
    applyTheme();

    // Setup settings modal
    const settingsBtn = document.getElementById('settings-btn');
    const settingsModal = document.getElementById('settings-modal');
    const closeSettingsBtn = document.getElementById('close-settings-btn');
    const themeSelect = document.getElementById('theme-select');
    const languageSelect = document.getElementById('language-select');

    // Apply language immediately on startup.
    applySettingsLanguage();

    if (settingsBtn && settingsModal) {
        settingsBtn.addEventListener('click', () => {
            settingsModal.classList.remove('hidden');
            // Re-evaluate the in-app Uninstall button (Mac only): a
            // schedule could have fired since the modal was last open,
            // flipping the disabled state. Cheap; idempotent.
            refreshUninstallButtonState();
            // Set current theme selection
            if (themeSelect) {
                const currentTheme = appData.settings?.themeMode || 'system';
                themeSelect.value = currentTheme;
            }
            if (languageSelect) {
                languageSelect.value = getSettingsLanguage();
            }

            void (async () => {
                applySettingsLanguage();

                // Fetch and display version info
                const currentVersionEl = document.getElementById('current-app-version');
                const latestVersionEl = document.getElementById('latest-app-version');
                const latestVersionWrap = document.getElementById('settings-latest-version-wrap');

                let currentVersion = null;

                if (currentVersionEl) {
                    try {
                        currentVersion = await tauriAPI.getAppVersion();
                        currentVersionEl.textContent = formatCurrentVersionText(currentVersion || 'Unknown');
                    } catch (e) {
                        console.error('[Version] Error fetching current version:', e);
                        currentVersionEl.textContent = formatCurrentVersionText('Unknown');
                    }
                }

                if (latestVersionEl) {
                    // Hide by default - only show if there's an update available
                    latestVersionEl.style.display = 'none';
                    if (latestVersionWrap) latestVersionWrap.style.display = 'none';

                    try {
                        const response = await fetch(`https://ulyngs.github.io/redd-block/latest-versions.json?t=${Date.now()}`);
                        const versions = await response.json();
                        // Detect platform
                        const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
                        const platform = isMac ? 'macos' : 'windows';
                        const latestVersion = versions[platform];

                        // Only show if latest version is higher than current version
                        if (latestVersion && currentVersion && isVersionHigher(latestVersion, currentVersion)) {
                            latestVersionEl.textContent = formatLatestVersionText(latestVersion);
                            latestVersionEl.style.display = 'block';
                            if (latestVersionWrap) latestVersionWrap.style.display = 'block';
                        }
                    } catch (e) {
                        // Silently fail if offline - don't show anything
                        console.log('[Version] Could not check for updates (offline or error):', e.message);
                    }
                }
            })();
        });
    }

    if (closeSettingsBtn && settingsModal) {
        closeSettingsBtn.addEventListener('click', () => {
            settingsModal.classList.add('hidden');
            if (!isModalVisible('diagnostics-modal')) stopHelperUiRefreshLoop();
        });
    }

    // Close modal when clicking outside
    if (settingsModal) {
        settingsModal.addEventListener('click', (e) => {
            if (e.target === settingsModal) {
                settingsModal.classList.add('hidden');
                if (!isModalVisible('diagnostics-modal')) stopHelperUiRefreshLoop();
            }
        });
    }

    // Theme selection change
    if (themeSelect) {
        themeSelect.addEventListener('change', (e) => {
            if (!appData.settings) appData.settings = {};
            appData.settings.themeMode = e.target.value;

            // Update legacy darkMode for backwards compatibility
            if (e.target.value === 'dark') {
                appData.settings.darkMode = true;
            } else if (e.target.value === 'light') {
                appData.settings.darkMode = false;
            } else {
                // Auto/system mode - use system preference
                delete appData.settings.darkMode;
            }

            applyTheme();
            saveData();
        });
    }

    if (languageSelect) {
        languageSelect.addEventListener('change', (e) => {
            if (!appData.settings) appData.settings = {};
            appData.settings.language = e.target.value === 'da' ? 'da' : 'en';
            applySettingsLanguage();
            saveData();
        });
    }

    // Listen for system theme changes when in auto mode
    if (window.matchMedia) {
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
            if (appData.settings?.themeMode === 'system' || !appData.settings?.themeMode) {
                applyTheme();
            }
        });
    }
}

function applyTheme() {
    const body = document.body;
    const themeMode = appData.settings?.themeMode || 'system';

    let isDark;
    if (themeMode === 'dark') {
        isDark = true;
    } else if (themeMode === 'light') {
        isDark = false;
    } else {
        // Auto/system mode - detect system preference
        isDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    }

    if (isDark) {
        body.classList.add('dark-mode');
    } else {
        body.classList.remove('dark-mode');
    }
}

function getUiZoomMax() {
    const isDesktop = document.body.classList.contains('windows') || document.body.classList.contains('mac');
    return isDesktop ? UI_ZOOM_MAX_DESKTOP : UI_ZOOM_MAX;
}

function clampUiZoom(scale) {
    return Math.min(getUiZoomMax(), Math.max(UI_ZOOM_MIN, scale));
}

function getSavedUiZoom() {
    const parsed = Number(appData.settings?.uiZoom);
    if (!Number.isFinite(parsed)) return DEFAULT_UI_ZOOM;
    return clampUiZoom(parsed);
}

function applyUiZoom(scale) {
    const clamped = clampUiZoom(scale);
    syncFooterZoomControl(clamped);

    // On desktop (Windows and macOS), use native webview zoom so content scales correctly
    // and behavior matches across platforms. Fall back to CSS zoom if unavailable (e.g. permission).
    if (!isIOS && (document.body.classList.contains('windows') || document.body.classList.contains('mac'))) {
        if (nativeWebviewZoomSupported !== false) {
            getCurrentWebview().setZoom(clamped).then(() => {
                nativeWebviewZoomSupported = true;
                document.documentElement.style.zoom = '';
            }).catch(() => {
                nativeWebviewZoomSupported = false;
                document.documentElement.style.zoom = String(clamped);
            });
            return;
        }
    }

    // Fallback path (iOS or if native zoom isn't available).
    document.documentElement.style.zoom = String(clamped);
}

// Mirror the current zoom level into the footer percentage label and
// +/- button enabled state. Called from applyUiZoom so every entry
// point (footer buttons, cmd-+/-/0 shortcuts, native menu items) keeps
// the UI in sync.
function syncFooterZoomControl(scale) {
    const valueDisplay = document.getElementById('footer-zoom-value');
    const zoomOutBtn = document.getElementById('footer-zoom-out');
    const zoomInBtn = document.getElementById('footer-zoom-in');
    if (valueDisplay) valueDisplay.textContent = `${Math.round(scale * 100)}%`;
    const max = getUiZoomMax();
    if (zoomOutBtn) zoomOutBtn.disabled = scale <= UI_ZOOM_MIN + 1e-6;
    if (zoomInBtn) zoomInBtn.disabled = scale >= max - 1e-6;
}

function setupFooterZoomControl() {
    const zoomOutBtn = document.getElementById('footer-zoom-out');
    const zoomInBtn = document.getElementById('footer-zoom-in');
    if (zoomOutBtn) zoomOutBtn.addEventListener('click', () => zoomUiOut());
    if (zoomInBtn) zoomInBtn.addEventListener('click', () => zoomUiIn());
}

function showUiZoomToast(scale) {
    const toast = document.getElementById('zoom-toast');
    const message = document.getElementById('zoom-toast-message');
    if (!toast || !message) return;

    message.textContent = `Zoom ${Math.round(scale * 100)}%`;
    toast.classList.remove('hidden');

    if (zoomToastHideTimeout) {
        clearTimeout(zoomToastHideTimeout);
    }
    zoomToastHideTimeout = setTimeout(() => {
        toast.classList.add('hidden');
        zoomToastHideTimeout = null;
    }, 1400);
}

function setUiZoom(scale, options = {}) {
    const clamped = clampUiZoom(scale);
    applyUiZoom(clamped);
    if (options.showToast) {
        showUiZoomToast(clamped);
    }

    if (!appData.settings) appData.settings = {};
    if (appData.settings.uiZoom === clamped) return;

    appData.settings.uiZoom = clamped;
    saveData();
}

function zoomUiIn(options = {}) {
    const current = getSavedUiZoom();
    setUiZoom(Math.round((current + UI_ZOOM_STEP) * 100) / 100, options);
}

function zoomUiOut(options = {}) {
    const current = getSavedUiZoom();
    setUiZoom(Math.round((current - UI_ZOOM_STEP) * 100) / 100, options);
}

function resetUiZoom(options = {}) {
    setUiZoom(DEFAULT_UI_ZOOM, options);
}

function setupUiZoomShortcuts() {
    setupFooterZoomControl();
    applyUiZoom(getSavedUiZoom());

    tauriAPI.onMenuZoomIn(() => zoomUiIn({ showToast: true })).catch(() => { });
    tauriAPI.onMenuZoomOut(() => zoomUiOut({ showToast: true })).catch(() => { });
    tauriAPI.onMenuZoomReset(() => resetUiZoom({ showToast: true })).catch(() => { });

    document.addEventListener('keydown', (e) => {
        const hasAccel = e.metaKey || e.ctrlKey;
        if (!hasAccel || e.altKey) return;

        const key = e.key;
        const isZoomIn = key === '+' || key === '=' || key === 'Add';
        const isZoomOut = key === '-' || key === '_' || key === 'Subtract';
        const isZoomReset = key === '0' || key === ')';
        if (!isZoomIn && !isZoomOut && !isZoomReset) return;

        e.preventDefault();

        if (isZoomIn) {
            zoomUiIn({ showToast: true });
            return;
        }
        if (isZoomOut) {
            zoomUiOut({ showToast: true });
            return;
        }
        resetUiZoom({ showToast: true });
    });
}

function setupHelpMenuLinks() {
    tauriAPI.onMenuHelpReportIssue(() => {
        openExternal('https://github.com/ulyngs/redd-block/issues');
    }).catch(() => { });

    tauriAPI.onMenuHelpContactUs(() => {
        openExternal('mailto:team@reddfocus.org');
    }).catch(() => { });

    tauriAPI.onMenuHelpWhoWeAre(() => {
        openExternal('https://www.reddfocus.org/#team-anchor');
    }).catch(() => { });
}

// Setup Helper Settings in the settings modal
function setupHelperSettings() {
    const statusIndicator = document.getElementById('helper-status-indicator');
    const cleanHostsBtn = document.getElementById('clean-hosts-btn');

    // Update helper status when settings modal opens
    const settingsBtn = document.getElementById('settings-btn');
    if (settingsBtn) {
        settingsBtn.addEventListener('click', () => {
            updateHelperStatusIndicator();
            updateCleanHostsBtnState();
            startHelperUiRefreshLoop();
        });
    }

    // Clean hosts file button
    if (cleanHostsBtn && !cleanHostsBtn._listenerAdded) {
        cleanHostsBtn._listenerAdded = true;
        cleanHostsBtn.addEventListener('click', async () => {
            if (cleanHostsBtn.disabled) return;

            const confirmed = await ask(
                'This will remove all ReDD Block entries from your system\'s hosts file. ' +
                'Only use this if websites remain blocked after all blocks have been stopped.\n\n' +
                'Your computer may ask for your password or show a security prompt.',
                { title: 'Clean hosts file?', kind: 'warning' }
            );
            if (!confirmed) return;

            cleanHostsBtn.disabled = true;
            const originalHTML = cleanHostsBtn.innerHTML;
            cleanHostsBtn.innerHTML = '<span class="btn-spinner"></span>Cleaning...';

            try {
                const result = await tauriAPI.cleanHostsFile();
                if (result.success) {
                    await message('Hosts file cleaned successfully. If websites were still blocked, they should now be accessible.', { title: 'Done', kind: 'info' });
                } else {
                    await message('Failed to clean hosts file: ' + (result.error || 'Unknown error'), { title: 'Error', kind: 'error' });
                }
            } catch (e) {
                console.error('Error cleaning hosts file:', e);
                await message('Error cleaning hosts file: ' + e.message, { title: 'Error', kind: 'error' });
            } finally {
                cleanHostsBtn.disabled = false;
                cleanHostsBtn.innerHTML = originalHTML;
                updateCleanHostsBtnState();
            }
        });
    }

}

function getHelperStatusDisplay(status) {
    const isRunning = !!status.running;
    const needsUpdate = isRunning && !status.version_ok;
    const installedButStopped = !!(status.installed && !isRunning);
    const enforcingNow = isRunning && status.version_ok && isDesktopBlockingEnforcedNow();

    if (isRunning && status.version_ok) {
        return {
            helperReady: true,
            indicatorClass: 'running',
            statusKey: enforcingNow ? 'helperStatusActive' : 'helperStatusIdle',
            showUpdate: false,
            showRemove: true,
            removeTitle: '',
            reachable: true,
        };
    }

    if (needsUpdate) {
        return {
            helperReady: false,
            indicatorClass: 'running',
            statusKey: 'helperStatusUpdateAvailable',
            showUpdate: true,
            showRemove: true,
            removeTitle: '',
            reachable: true,
        };
    }

    if (installedButStopped) {
        return {
            helperReady: false,
            indicatorClass: 'stopped',
            statusKey: 'helperStatusInstalledNotReachable',
            showUpdate: false,
            showRemove: true,
            removeTitle: tSettings('helperRemoveStaleHint'),
            reachable: false,
        };
    }

    return {
        helperReady: false,
        indicatorClass: 'stopped',
        statusKey: 'helperStatusNotInstalled',
        showUpdate: false,
        showRemove: false,
        removeTitle: '',
        reachable: false,
    };
}

function logHelperRemovalFallback(result) {
    if (result?.error) {
        console.warn('[helper-uninstall] Fallback cleanup used:', result.error);
    }
}


async function confirmHelperRemoved() {
    const status = await refreshDesktopHelperStatus();
    const removed = !(status?.installed || status?.running);

    await updateHelperStatusIndicator().catch(() => { });
    await checkHelperStatus().catch(() => { });

    if (!removed) {
        return {
            removed: false,
            status,
            error: 'ReDD Block could not confirm that the helper was fully removed. It still appears to be installed.'
        };
    }

    helperAvailable = false;
    return { removed: true, status };
}

async function uninstallHelperAndConfirmRemoved() {
    const result = await tauriAPI.uninstallHelper();
    if (!result.success) {
        return {
            success: false,
            error: result.error || 'Unknown error'
        };
    }

    logHelperRemovalFallback(result);

    const confirmation = await confirmHelperRemoved();
    if (!confirmation.removed) {
        return {
            success: false,
            error: confirmation.error
        };
    }

    return {
        success: true,
        usedFallback: !!result.error
    };
}

function isDesktopBlockingEnforcedNow() {
    if (isIOS) return false;
    return hasAnyEnforcedBlocks();
}

// Update helper status indicator in settings modal
async function updateHelperStatusIndicator() {
    const statusIndicator = document.getElementById('helper-status-indicator');
    if (!statusIndicator) return;

    const statusText = statusIndicator.querySelector('.status-text');
    const updateBtn = document.getElementById('update-helper-btn');

    try {
        const status = await refreshDesktopHelperStatus();
        const helperDisplay = getHelperStatusDisplay(status);
        helperAvailable = helperDisplay.helperReady;

        statusIndicator.classList.remove('running', 'stopped');
        statusIndicator.classList.add(helperDisplay.indicatorClass);
        statusText.textContent = tSettings(helperDisplay.statusKey);

        // Show/hide Update Helper button
        if (updateBtn) {
            updateBtn.style.display = helperDisplay.showUpdate ? 'flex' : 'none';

            // Wire up click handler (only once)
            if (!updateBtn._listenerAdded) {
                updateBtn._listenerAdded = true;
                updateBtn.addEventListener('click', async () => {
                    updateBtn.disabled = true;
                    const originalHTML = updateBtn.innerHTML;
                    updateBtn.innerHTML = '<span class="btn-spinner"></span>Updating...';
                    try {
                        const result = await tauriAPI.installHelper();
                        if (result.success) {
                            // Wait for helper to start up
                            await new Promise(resolve => setTimeout(resolve, 2000));
                            await updateHelperStatusIndicator();
                            await checkHelperStatus();
                        } else if (isHelperInstallCancelled(result?.error)) {
                            console.log('Helper update cancelled by user');
                        } else {
                            await message('Failed to update helper: ' + (result.error || 'Unknown error'), { title: 'Error', kind: 'error' });
                        }
                    } catch (e) {
                        console.error('Error updating helper:', e);
                        await message('Error updating helper: ' + e.message, { title: 'Error', kind: 'error' });
                    } finally {
                        updateBtn.disabled = false;
                        updateBtn.innerHTML = originalHTML;
                    }
                });
            }
        }

    } catch (e) {
        statusIndicator.classList.remove('running', 'stopped');
        statusIndicator.classList.add('stopped');
        statusText.textContent = tSettings('helperStatusUnknown');

        if (updateBtn) updateBtn.style.display = 'none';
    }

    // Also update Override All button visibility
    updateOverrideAllButtonVisibility();
}

// Update clean hosts button state (disabled when blocks are running)
function updateCleanHostsBtnState() {
    const btn = document.getElementById('clean-hosts-btn');
    if (!btn) return;
    const active = hasAnyActiveBlocks();
    btn.disabled = active;
    btn.title = active ? 'Stop all running blocks first' : '';
}

function getDiagValue(diag, ...keys) {
    for (const key of keys) {
        if (diag && diag[key] !== undefined && diag[key] !== null) {
            return diag[key];
        }
    }
    return undefined;
}

function getPrettyPrintedDiagnosticsJson(rawText) {
    if (!rawText) return '(unavailable)';
    try {
        return JSON.stringify(JSON.parse(rawText), null, 2);
    } catch (e) {
        return rawText;
    }
}

function buildDiagnosticsReport(diag) {
    const osName = getDiagValue(diag, 'os_name', 'osName')
        || (navigator.platform?.startsWith('Mac') ? 'macOS' : navigator.platform?.startsWith('Win') ? 'Windows' : 'unknown');
    const arch = getDiagValue(diag, 'arch') || 'unknown';
    const appVersion = document.getElementById('settings-version')?.textContent || '';
    const installed = !!getDiagValue(diag, 'helper_installed', 'helperInstalled');
    const running = !!getDiagValue(diag, 'helper_running', 'helperRunning');
    const version = getDiagValue(diag, 'helper_version', 'helperVersion') || 'Unknown';
    const versionOk = !!getDiagValue(diag, 'helper_version_ok', 'helperVersionOk');
    const expectedVersion = getDiagValue(diag, 'expected_helper_version', 'expectedHelperVersion') || 'unknown';
    const hostsFile = getDiagValue(diag, 'hosts_file', 'hostsFile') || '(unavailable)';
    const hostsPath = getDiagValue(diag, 'hosts_path', 'hostsPath') || '(unknown)';
    const stateFile = getDiagValue(diag, 'helper_state_file', 'helperStateFile') || '(unavailable)';
    const statePath = getDiagValue(diag, 'helper_state_path', 'helperStatePath') || '(unknown)';
    const helperLogTail = getDiagValue(diag, 'helper_log_tail', 'helperLogTail');
    const helperLogPath = getDiagValue(diag, 'helper_log_path', 'helperLogPath');
    const installLogTail = getDiagValue(diag, 'install_log_tail', 'installLogTail');
    const installLogPath = getDiagValue(diag, 'install_log_path', 'installLogPath');
    const helperDisplay = getHelperStatusDisplay({ installed, running, version_ok: versionOk });
    const helperStatusLabel = tSettings(helperDisplay.statusKey);
    const reachable = !!running;

    return {
        osName,
        arch,
        appVersion,
        installed,
        running,
        reachable,
        version,
        versionOk,
        expectedVersion,
        helperStatusLabel,
        helperDisplay,
        hostsFile,
        hostsPath,
        hasReddBlock: hostsFile.includes('BEGIN REDD BLOCK'),
        statePretty: getPrettyPrintedDiagnosticsJson(stateFile),
        statePath,
        helperLogTail,
        helperLogPath,
        installLogTail,
        installLogPath,
    };
}

function formatDiagnosticsText(diag) {
    const report = buildDiagnosticsReport(diag);
    return [
        '=== System ===',
        `OS: ${report.osName}`,
        `Architecture: ${report.arch}`,
        report.appVersion ? `App version: ${report.appVersion}` : '',
        '',
        '=== Helper Daemon ===',
        `Status: ${report.helperStatusLabel}`,
        `Installed: ${report.installed ? 'Yes' : 'No'}`,
        `Reachable: ${report.reachable ? 'Yes' : 'No'}`,
        `Running: ${report.running ? 'Yes' : 'No'}`,
        `Version OK: ${report.versionOk ? 'Yes' : 'No'}`,
        `Version: ${report.version}`,
        `Expected version: ${report.expectedVersion}`,
        '',
        '=== Paths ===',
        `Hosts file: ${report.hostsPath}`,
        `Helper state file: ${report.statePath}`,
        report.helperLogPath ? `Helper log: ${report.helperLogPath}` : '',
        report.installLogPath ? `Install log: ${report.installLogPath}` : '',
        '',
        '=== Hosts File ===',
        report.hostsFile.trim(),
        '',
        '=== Helper State File ===',
        report.statePretty.trim(),
        report.helperLogTail ? '' : undefined,
        report.helperLogTail ? '=== Helper Log Tail ===' : undefined,
        report.helperLogTail ? report.helperLogTail.trim() : undefined,
        report.installLogTail ? '' : undefined,
        report.installLogTail ? '=== Install Log Tail ===' : undefined,
        report.installLogTail ? report.installLogTail.trim() : undefined,
    ].filter(line => line !== undefined).join('\n');
}

function captureDiagnosticsScrollState(content) {
    if (!content) return null;
    return {
        contentScrollTop: content.scrollTop,
        preScrollTops: Array.from(content.querySelectorAll('.diagnostics-pre')).map(el => el.scrollTop),
    };
}

function restoreDiagnosticsScrollState(content, scrollState) {
    if (!content || !scrollState) return;
    content.scrollTop = scrollState.contentScrollTop || 0;
    const preEls = Array.from(content.querySelectorAll('.diagnostics-pre'));
    preEls.forEach((el, idx) => {
        el.scrollTop = scrollState.preScrollTops?.[idx] || 0;
    });
}

async function refreshDiagnosticsModalContent({ showLoading = false } = {}) {
    const modal = document.getElementById('diagnostics-modal');
    const content = document.getElementById('diagnostics-content');
    if (!modal || !content) return;

    const scrollState = showLoading ? null : captureDiagnosticsScrollState(content);
    if (showLoading) {
        content.innerHTML = '<div class="diagnostics-loading">Loading diagnostics...</div>';
    }

    let diag = null;
    try {
        diag = await invoke('get_system_diagnostics');
        content.innerHTML = renderSystemDiagnostics(diag);
        restoreDiagnosticsScrollState(content, scrollState);
    } catch (e) {
        content.innerHTML = `<div class="diagnostics-error">Failed to load diagnostics: ${e.message || e}</div>`;
    }

    const copyBtn = document.getElementById('diagnostics-copy-btn');
    if (copyBtn) {
        copyBtn.onclick = () => {
            if (!diag) { copyBtn.textContent = 'No data'; return; }
            const text = JSON.stringify(diag, null, 2);
            navigator.clipboard.writeText(text).then(() => {
                copyBtn.textContent = 'Copied!';
                setTimeout(() => { copyBtn.textContent = 'Copy to Clipboard'; }, 2000);
            }).catch(() => {
                copyBtn.textContent = 'Copy failed';
                setTimeout(() => { copyBtn.textContent = 'Copy to Clipboard'; }, 2000);
            });
        };
    }
}

// Render the structured SystemDiagnostics struct as collapsible
// HTML sections. Designed for both user-readable scan AND copy-as-JSON
// for filing support tickets.
function renderSystemDiagnostics(d) {
    const ok = (b) => `<span class="diagnostics-value ${b ? 'diag-ok' : 'diag-error'}">${b ? 'Yes' : 'No'}</span>`;
    const yesno = (b) => b ? '✓' : '✗';
    const fmtTs = (ms) => ms ? new Date(ms).toLocaleString() : '—';
    const e = (s) => escapeHtml(String(s));
    let html = '';

    // App
    html += '<div class="diagnostics-section">';
    html += '<div class="diagnostics-section-title">App</div>';
    html += `<div class="diagnostics-field"><span class="diagnostics-label">Version:</span> <span class="diagnostics-value">${e(d.app.version)}</span> <span class="diagnostics-badge">${e(d.app.build_mode)}</span></div>`;
    html += `<div class="diagnostics-field"><span class="diagnostics-label">OS / arch:</span> <span class="diagnostics-value">${e(d.app.os)} / ${e(d.app.arch)}</span></div>`;
    html += '</div>';

    // Migration
    const m = d.migration;
    html += '<div class="diagnostics-section">';
    html += '<div class="diagnostics-section-title">Migration from v1.x</div>';
    html += `<div class="diagnostics-field"><span class="diagnostics-label">Was a v1.x install:</span> <span class="diagnostics-value">${m.came_from_v1x ? 'Yes' : 'No'}</span></div>`;
    if (m.residue_items && m.residue_items.length > 0) {
        html += `<div class="diagnostics-field"><span class="diagnostics-label">Old version leftover files:</span></div>`;
        html += '<ul class="diagnostics-list">';
        for (const item of m.residue_items) {
            html += `<li class="diag-error">${e(item)}</li>`;
        }
        html += '</ul>';
    } else {
        html += `<div class="diagnostics-field"><span class="diagnostics-label">Old version leftover files:</span> <span class="diagnostics-value diag-ok">None — fully migrated</span></div>`;
    }
    html += `<div class="diagnostics-field"><span class="diagnostics-label">Stamped version:</span> <span class="diagnostics-value">${e(m.ran_at_version || '—')}</span></div>`;
    html += `<div class="diagnostics-field"><span class="diagnostics-label">Stamped at:</span> <span class="diagnostics-value">${e(fmtTs(m.ran_at_ms))}</span></div>`;
    html += '</div>';

    // Browsers
    html += '<div class="diagnostics-section">';
    html += '<div class="diagnostics-section-title">Browsers (extension)</div>';
    html += '<table class="diagnostics-table"><thead><tr><th>Browser</th><th>Installed</th><th>Running</th><th>Ext set up</th></tr></thead><tbody>';
    for (const key of ['chrome', 'brave', 'edge', 'firefox', 'safari']) {
        const b = d.browsers[key];
        if (!b) continue;
        const compliant = browserComplianceStatus(key, b) === 'compliant';
        html += `<tr><td>${e(key)}</td><td>${yesno(b.installed)}</td><td>${yesno(b.present)}</td><td>${b.installed ? yesno(compliant) : '—'}</td></tr>`;
    }
    html += '</tbody></table>';
    html += '</div>';

    // Enforcer + autostart
    html += '<div class="diagnostics-section">';
    html += '<div class="diagnostics-section-title">Enforcement</div>';
    html += `<div class="diagnostics-field"><span class="diagnostics-label">Grace period:</span> <span class="diagnostics-value">${e(d.enforcer.grace_seconds)} s</span></div>`;
    html += `<div class="diagnostics-field"><span class="diagnostics-label">Autostart at login:</span> ${ok(d.autostart.enabled)}</div>`;
    if (d.watchdog) {
        html += `<div class="diagnostics-field"><span class="diagnostics-label">Watchdog Scheduled Task:</span> ${ok(d.watchdog.task_present)}</div>`;
    }
    html += '</div>';

    // Recent log
    if (d.recent_log && d.recent_log.length > 0) {
        html += '<div class="diagnostics-section">';
        html += `<div class="diagnostics-section-title">Recent log (last ${d.recent_log.length} lines)</div>`;
        html += `<pre class="diagnostics-pre">${e(d.recent_log.join('\n'))}</pre>`;
        html += '</div>';
    }

    // Currently being blocked — derived data, NOT recomputed here.
    // The Rust side reuses native_host::derive_payload (same code that
    // pushes to the browser extension on every frame) for domains and
    // reads the in-process app watcher's effective set for apps. So
    // this section reflects exactly what's being enforced right now.
    if (d.current_blocking) {
        const cb = d.current_blocking;
        html += '<div class="diagnostics-section">';
        html += '<div class="diagnostics-section-title">Currently being blocked</div>';

        if (cb.blocks && cb.blocks.length > 0) {
            html += '<div class="diagnostics-field"><span class="diagnostics-label">Active sources:</span></div>';
            html += '<ul class="diagnostics-list">';
            for (const b of cb.blocks) {
                const label = `${b.emoji ? b.emoji + ' ' : ''}${b.name || b.blocklistId}`;
                const srcLabel = b.source === 'schedule' ? 'schedule' : 'one-off';
                const endsTxt = b.endsAt ? ` until ${new Date(b.endsAt).toLocaleString()}` : '';
                const domainsCount = (b.domains || []).length;
                html += `<li>${e(label)} <span class="diagnostics-badge">${e(srcLabel)}</span>${e(endsTxt)} — ${domainsCount} domain${domainsCount === 1 ? '' : 's'}</li>`;
            }
            html += '</ul>';
        } else {
            html += `<div class="diagnostics-field"><span class="diagnostics-label">Active sources:</span> <span class="diagnostics-value">None</span></div>`;
        }

        html += `<div class="diagnostics-field"><span class="diagnostics-label">Domains (${cb.domains?.length ?? 0}):</span></div>`;
        if (cb.domains && cb.domains.length > 0) {
            html += `<pre class="diagnostics-pre">${e(cb.domains.join('\n'))}</pre>`;
        }

        html += `<div class="diagnostics-field"><span class="diagnostics-label">Apps (${cb.apps?.length ?? 0}):</span></div>`;
        if (cb.apps && cb.apps.length > 0) {
            html += `<pre class="diagnostics-pre">${e(cb.apps.join('\n'))}</pre>`;
        }

        html += '</div>';
    }

    // App data (redd-block-data.json) — sanity-check readout of the
    // persisted blocklists / activeBlocks / schedules / settings.
    if (d.app_data) {
        html += '<div class="diagnostics-section">';
        html += '<div class="diagnostics-section-title">App data (redd-block-data.json)</div>';
        if (d.app_data.path) {
            html += `<div class="diagnostics-field"><span class="diagnostics-label">Path:</span> <span class="diagnostics-value">${e(d.app_data.path)}</span></div>`;
        }
        if (d.app_data.error) {
            html += `<div class="diagnostics-field diag-error">${e(d.app_data.error)}</div>`;
        }
        if (d.app_data.pretty_json) {
            html += `<pre class="diagnostics-pre">${e(d.app_data.pretty_json)}</pre>`;
        }
        html += '</div>';
    }

    return html;
}

// Diagnostics modal
async function openDiagnosticsModal() {
    const modal = document.getElementById('diagnostics-modal');
    const content = document.getElementById('diagnostics-content');
    if (!modal || !content) return;

    modal.classList.remove('hidden');
    await refreshDiagnosticsModalContent({ showLoading: true });
    startHelperUiRefreshLoop();

    // Close button
    const closeBtn = document.getElementById('close-diagnostics-btn');
    if (closeBtn) {
        closeBtn.onclick = () => {
            modal.classList.add('hidden');
            if (!isModalVisible('settings-modal')) stopHelperUiRefreshLoop();
        };
    }

    // Close on backdrop click (outside the modal content)
    modal.onclick = (e) => {
        if (e.target === modal) {
            modal.classList.add('hidden');
            if (!isModalVisible('settings-modal')) stopHelperUiRefreshLoop();
        }
    };
}

// Setup diagnostics button
function setupDiagnosticsButton() {
    const btn = document.getElementById('diagnostics-btn');
    if (btn) {
        btn.addEventListener('click', openDiagnosticsModal);
    }
}

// Check if there are any active blocks or schedules
function hasAnyActiveBlocks() {
    return hasAnyEnforcedBlocks();
}

// No-op kept for any legacy callers — the "still not working" button
// it used to control was removed in 2.0 along with the helper-uninstall
// + manual-hosts-reset escape hatches. Override All visibility is now
// purely CSS / always-on.
function updateOverrideAllButtonVisibility() {}

// Show challenge for removing helper when blocks are active


// Variable to track override-all challenge text
let overrideAllChallengeText = '';

// Setup the configurable browser-extension grace period.
// Backend reads `settings.extensionGraceSeconds` from the data file
// on every grace-start (no app restart needed). Backend rejects
// increases when at least one block is currently active.
function setupGraceSetting() {
    const input = document.getElementById('grace-seconds-input');
    const errorEl = document.getElementById('grace-error');
    const lockedHint = document.getElementById('grace-locked-hint');
    if (!input) return;

    const showError = (msg) => {
        if (!errorEl) return;
        errorEl.textContent = msg;
        errorEl.classList.toggle('hidden', !msg);
    };

    // Load current value and reflect locked state.
    const refresh = async () => {
        try {
            const secs = await invoke('get_extension_grace_seconds');
            input.value = secs;
            // Locked-hint UX: probe by attempting to set to current+1
            // and checking the error. Cheaper alternative would be a
            // dedicated `is_locked` command, but this avoids a new
            // command for an edge-case UI nicety.
            // Skip the probe — just reset on a real failure.
            if (lockedHint) lockedHint.classList.add('hidden');
        } catch (e) {
            console.warn('[grace] read failed:', e);
        }
    };
    refresh();

    let lastGood = parseInt(input.value, 10) || 60;
    input.addEventListener('change', async () => {
        const raw = parseInt(input.value, 10);
        if (!Number.isFinite(raw)) {
            input.value = lastGood;
            return;
        }
        const clamped = Math.max(5, Math.min(300, raw));
        input.value = clamped;
        try {
            const applied = await invoke('set_extension_grace_seconds', { seconds: clamped });
            input.value = applied;
            lastGood = applied;
            showError('');
            if (lockedHint) lockedHint.classList.add('hidden');
        } catch (e) {
            // Backend rejects increases during active blocks. Revert
            // to the prior good value and surface the message.
            const msg = typeof e === 'string' ? e : (e && e.message) || 'Could not update grace period.';
            showError(msg);
            input.value = lastGood;
            if (lockedHint && /active|focus session/i.test(msg)) {
                lockedHint.classList.remove('hidden');
            }
        }
    });
}

// Setup Override All functionality in settings
function setupOverrideAll() {
    const advancedToggle = document.getElementById('advanced-options-toggle');
    const advancedContent = document.getElementById('advanced-options-content');
    const overrideAllBtn = document.getElementById('override-all-btn');
    const overrideAllModal = document.getElementById('override-all-modal');
    const cancelOverrideAllBtn = document.getElementById('cancel-override-all-btn');
    const confirmOverrideAllBtn = document.getElementById('confirm-override-all-btn');
    const overrideAllChallengeInput = document.getElementById('override-all-challenge-input');
    const overrideAllProgressBar = document.getElementById('override-all-progress-bar');

    // Toggle advanced options
    if (advancedToggle && advancedContent) {
        advancedToggle.addEventListener('click', () => {
            advancedToggle.classList.toggle('expanded');
            advancedContent.classList.toggle('hidden');
        });
    }

    // Open override all modal
    if (overrideAllBtn && overrideAllModal) {
        overrideAllBtn.addEventListener('click', () => {
            // Close settings modal first
            document.getElementById('settings-modal').classList.add('hidden');

            const challengeTextEl = document.getElementById('override-all-challenge-text');
            const instructionEl = document.getElementById('override-all-instruction');

            if (!hasAnyBlockingStateToClear()) {
                // No blocks active — show dialog but skip the typing challenge
                overrideAllChallengeText = '';
                if (challengeTextEl) challengeTextEl.style.display = 'none';
                if (overrideAllChallengeInput) overrideAllChallengeInput.style.display = 'none';
                if (instructionEl) instructionEl.style.display = 'none';
                const progressEl = overrideAllModal.querySelector('.challenge-progress');
                if (progressEl) progressEl.style.display = 'none';
                overrideAllModal.classList.remove('hidden');
                return;
            }

            // Restore challenge elements visibility
            if (challengeTextEl) challengeTextEl.style.display = '';
            if (overrideAllChallengeInput) overrideAllChallengeInput.style.display = '';
            if (instructionEl) instructionEl.style.display = '';
            const progressEl = overrideAllModal.querySelector('.challenge-progress');
            if (progressEl) progressEl.style.display = '';

            // Find the hardest challenge among active blocks and schedules
            const hardestDifficulty = findHardestChallenge();

            // Generate challenge text based on hardest difficulty
            if (hardestDifficulty.type === 'custom' && hardestDifficulty.customText) {
                overrideAllChallengeText = hardestDifficulty.customText;
            } else if (hardestDifficulty.type === 'gibberish') {
                overrideAllChallengeText = generateGibberish(hardestDifficulty.count);
            } else {
                overrideAllChallengeText = generateRandomWords(hardestDifficulty.count);
            }

            // Sanitize: remove linebreaks and collapse multiple spaces
            overrideAllChallengeText = overrideAllChallengeText.replace(/[\r\n]+/g, ' ').replace(/\s{2,}/g, ' ').trim();

            // Display challenge
            document.getElementById('override-all-challenge-text').textContent = overrideAllChallengeText;
            overrideAllChallengeInput.value = '';
            overrideAllProgressBar.style.width = '0%';

            overrideAllModal.classList.remove('hidden');
        });
    }

    // Cancel override all
    if (cancelOverrideAllBtn && overrideAllModal) {
        cancelOverrideAllBtn.addEventListener('click', () => {
            overrideAllModal.classList.add('hidden');
            overrideAllChallengeText = '';
            // Re-open settings modal so user goes back to settings, not main screen
            document.getElementById('settings-modal').classList.remove('hidden');
        });
    }

    // Click outside to close
    if (overrideAllModal) {
        overrideAllModal.addEventListener('click', (e) => {
            if (e.target === overrideAllModal) {
                overrideAllModal.classList.add('hidden');
                overrideAllChallengeText = '';
                // Re-open settings modal so user goes back to settings, not main screen
                document.getElementById('settings-modal').classList.remove('hidden');
            }
        });
    }

    // Prevent paste
    if (overrideAllChallengeInput) {
        overrideAllChallengeInput.addEventListener('paste', (e) => {
            e.preventDefault();
        });

        // Update progress as user types
        overrideAllChallengeInput.addEventListener('input', () => {
            const typed = overrideAllChallengeInput.value;
            const target = overrideAllChallengeText;

            let correctChars = 0;
            for (let i = 0; i < typed.length && i < target.length; i++) {
                if (typed[i] === target[i]) {
                    correctChars++;
                } else {
                    break;
                }
            }

            const progress = (correctChars / target.length) * 100;
            overrideAllProgressBar.style.width = `${progress}%`;
        });

        // Enter key submits
        overrideAllChallengeInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                confirmOverrideAllBtn.click();
            }
        });
    }

    // Confirm override all
    if (confirmOverrideAllBtn) {
        confirmOverrideAllBtn.addEventListener('click', async () => {
            const typed = overrideAllChallengeInput.value;
            const target = overrideAllChallengeText;

            if (typed === target) {
                // Success! Clear everything
                await performOverrideAll();
                overrideAllModal.classList.add('hidden');
                overrideAllChallengeText = '';
            } else {
                // Wrong - wiggle modal
                const modalContent = overrideAllModal.querySelector('.modal-content');
                modalContent.classList.remove('wiggle');
                void modalContent.offsetWidth; // Trigger reflow
                modalContent.classList.add('wiggle');
            }
        });
    }

}

// macOS in-app uninstall. The Uninstall button lives in the advanced
// options section (just below Override All) and is hidden on Windows
// (`.macos-only` + `body.mac` gate) because Windows uses
// Settings → Apps → Uninstall, fully wired up by NSIS_HOOK_PREUNINSTALL.
//
// The button is *disabled* (not hidden) when any block / schedule is
// currently active, with a hint paragraph below nudging the user
// toward the Override-All challenge above. Rationale: uninstalling
// mid-block would leave the user with an unenforceable promise
// (no app = no enforcer), so we want the user to deliberately stop
// blocking first via the existing override path.
function setupInAppUninstall() {
    const btn = document.getElementById('uninstall-app-btn');
    if (!btn) return;

    refreshUninstallButtonState();

    btn.addEventListener('click', async () => {
        // Re-check at click time so a schedule that fired between
        // settings-open and click can still gate us out cleanly.
        if (hasAnyBlockingStateToClear()) {
            refreshUninstallButtonState();
            return;
        }

        // Native confirmation dialog (Tauri plugin-dialog `ask`).
        let proceed = false;
        try {
            proceed = await ask(tSettings('uninstallConfirmBody'), {
                title: tSettings('uninstallConfirmTitle'),
                kind: 'warning',
                okLabel: tSettings('uninstallConfirmOk'),
                cancelLabel: tSettings('cancel'),
            });
        } catch (e) {
            console.error('uninstall: confirm dialog failed', e);
            return;
        }
        if (!proceed) return;

        // Close settings so the user sees a clean window before the
        // process exits and the bundle disappears.
        document.getElementById('settings-modal')?.classList.add('hidden');

        try {
            await tauriAPI.uninstallSelfMacos();
            // Backend exits ~200ms later. The window typically
            // disappears before this promise resolves; nothing else
            // to do on success.
        } catch (e) {
            console.error('uninstall: backend command failed', e);
            try {
                await message(`${tSettings('uninstallFailed')}\n\n${e}`, {
                    title: tSettings('uninstallFailedTitle'),
                    kind: 'error',
                });
            } catch (_) { /* swallow — best-effort error surface */ }
        }
    });
}

// Refresh the Uninstall button's enabled/disabled state and the hint
// paragraph below it. Cheap; safe to call on settings-open and on any
// activeBlocks/schedules state change. Idempotent — reads DOM only.
function refreshUninstallButtonState() {
    const btn = document.getElementById('uninstall-app-btn');
    const hint = document.getElementById('uninstall-app-hint');
    if (!btn) return;

    const blocking = hasAnyBlockingStateToClear();
    if (blocking) {
        btn.disabled = true;
        btn.setAttribute('aria-disabled', 'true');
        if (hint) {
            hint.textContent = tSettings('uninstallDisabledHint');
            hint.hidden = false;
        }
    } else {
        btn.disabled = false;
        btn.removeAttribute('aria-disabled');
        if (hint) {
            hint.textContent = '';
            hint.hidden = true;
        }
    }
}


// Find the hardest challenge among all block/schedule state that could still resume later.
function findHardestChallenge() {
    const now = Date.now();
    const nowDate = new Date(now);
    let hardestDifficulty = null;

    // Check one-off blocks that still have remaining time.
    for (const block of appData.activeBlocks) {
        if (isOneOffBlockStillActive(block, now)) {
            const blocklist = appData.blocklists.find(bl => bl.id === block.blocklistId);
            if (blocklist?.overrideDifficulty) {
                hardestDifficulty = hardestDifficulty
                    ? compareDifficulties(hardestDifficulty, blocklist.overrideDifficulty)
                    : blocklist.overrideDifficulty;
            }
        }
    }

    // Check schedules that can still become active later.
    for (const schedule of appData.schedules || []) {
        if (!schedule.segments) continue;
        if (!scheduleCanStillBecomeActive(schedule, nowDate)) continue;

        const blocklist = appData.blocklists.find(bl => bl.id === schedule.blocklistId);
        if (blocklist?.overrideDifficulty) {
            hardestDifficulty = hardestDifficulty
                ? compareDifficulties(hardestDifficulty, blocklist.overrideDifficulty)
                : blocklist.overrideDifficulty;
        }
    }

    if (!hardestDifficulty) return { type: 'random-words', count: 50 };

    // Resolve effective count for maxDifficulty (handles single-block case
    // where compareDifficulties was never called)
    if (hardestDifficulty.maxDifficulty === true && hardestDifficulty.count === undefined) {
        const MAX_CHARS_RANDOM_WORDS = 7500;
        const MAX_CHARS_GIBBERISH = 5000;
        const effectiveCount = hardestDifficulty.type === 'gibberish' ? MAX_CHARS_GIBBERISH : MAX_CHARS_RANDOM_WORDS;
        return { ...hardestDifficulty, count: effectiveCount };
    }
    return hardestDifficulty;
}

// Compare two difficulties and return the harder one
function compareDifficulties(a, b) {
    if (!a) return b;
    if (!b) return a;

    const MAX_CHARS_RANDOM_WORDS = 7500;  // 250 * 30, match getMaxOverrideCharsForType
    const MAX_CHARS_GIBBERISH = 5000;     // match getMaxOverrideCharsForType

    const getEffectiveCount = (difficulty) => {
        if (difficulty.type === 'custom' && typeof difficulty.customText === 'string') {
            return difficulty.customText.length;
        }
        if (difficulty.maxDifficulty === true) {
            if (difficulty.type === 'gibberish') return MAX_CHARS_GIBBERISH;
            if (difficulty.type === 'random-words') return MAX_CHARS_RANDOM_WORDS;
        }
        const parsed = Number(difficulty.count);
        return Number.isFinite(parsed) && parsed > 0 ? parsed : 50;
    };

    const getTypeRank = (difficulty) => {
        if (difficulty.type === 'custom') return 3;
        if (difficulty.type === 'gibberish') return 2;
        if (difficulty.type === 'random-words') return 1;
        return 0;
    };

    const aCount = getEffectiveCount(a);
    const bCount = getEffectiveCount(b);

    let winner;
    if (bCount > aCount) winner = b;
    else if (aCount > bCount) winner = a;
    else {
        // Same character count: custom > gibberish > random-words
        const aRank = getTypeRank(a);
        const bRank = getTypeRank(b);
        if (bRank > aRank) winner = b;
        else if (aRank > bRank) winner = a;
        else winner = a; // Equal, return a
    }

    // Return with effective count resolved (so maxDifficulty is reflected in .count)
    const winnerCount = getEffectiveCount(winner);
    if (winner.count !== winnerCount) {
        return { ...winner, count: winnerCount };
    }
    return winner;
}

// Perform the actual override-all operation
async function performOverrideAll() {
    try {
        // Clear all active blocks
        appData.activeBlocks = [];

        // Clear all schedules
        appData.schedules = [];

        // Save the data
        await saveData();

        // Full cleanup on the helper side
        if (isIOS) {
            await tauriAPI.screentimeClearBlock();
        } else {
            const status = await refreshDesktopHelperStatus();
            if (status.helperReady) {
                // Atomically set everything to empty — helper will know nothing should be blocked
                try { await tauriAPI.setBlocksViaHelper([]); } catch (e) { console.warn('Failed to clear blocks:', e); }
                try { await tauriAPI.setSchedulesViaHelper([]); } catch (e) { console.warn('Failed to clear schedules:', e); }
                try { await tauriAPI.setBlockedAppsViaHelper([]); } catch (e) { console.warn('Failed to clear apps:', e); }
            }
            // Always clean the hosts file as a safety net, even if the helper is stopped or stale.
            try { await tauriAPI.cleanHostsFile(); } catch (e) { console.warn('Failed to clean hosts file:', e); }
        }

        // Update blocked apps (will stop watcher if no apps to block)
        await updateBlockedApps();

        // Re-render the UI
        render();

        // Reset the blocklist selection UI
        const blocklistSelect = document.getElementById('blocklist-select');
        if (blocklistSelect) {
            handleBlocklistSelect({ target: blocklistSelect });
        }

        console.log('Override-all completed — all blocks, schedules, apps, and hosts entries cleared');
    } catch (err) {
        console.error('Error during override all:', err);
    }
}

// ========================================
// DEV MODE: Test Runner Keyboard Shortcut
// ========================================
// Press Cmd+Shift+T (Mac) or Ctrl+Shift+T (Windows) to run tests
document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 't') {
        e.preventDefault();
        console.log('🧪 Test shortcut detected!');
        if (window.ReddBlockTests && typeof window.ReddBlockTests.runAllTests === 'function') {
            window.ReddBlockTests.runAllTests();
        } else {
            console.log('⚠️ Tests not loaded. Make sure test-utils.js and blocking-tests.js are included.');
        }
    }
});

// Also expose a global function for running tests directly from console
window.runBlockingTests = function () {
    if (window.ReddBlockTests && typeof window.ReddBlockTests.runAllTests === 'function') {
        window.ReddBlockTests.runAllTests();
    } else {
        console.log('⚠️ Tests not loaded. Try: window.ReddBlockTestUtils and window.ReddBlockTests');
    }
};

// Expose additional internals for integration tests
Object.assign(window.__REDDBLOCK_INTERNALS__, {
    saveData,
    updateHostsFile,
    tauriAPI,
    render,
    isProtectedApp,
    PROTECTED_APP_NAMES,
    isProtectedDomain,
    PROTECTED_DOMAINS,
    duplicateBlocklist,
    getNextCopyName,
    getMaxOverrideCharsForType
});

console.log('💡 To run blocking tests, type: runBlockingTests() in the console');
