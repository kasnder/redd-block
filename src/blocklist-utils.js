// Blocklist domain helpers: protected apps/domains, iOS Screen Time
// selection normalization, blocklist normalization. Extracted verbatim
// from app.js. Leaf module: imports only shared state.
import { state } from './state.js';

// Far-future timestamp used for "always on" blocks (year 9999)
export const ALWAYS_ON_END_TIME = new Date(9999, 11, 31, 23, 59, 59, 999).getTime();

// Protected app names — ReDD Blocker must never block itself
export const PROTECTED_APP_NAMES = ['redd block', 'redd blocker', 'redd-block', 'redd-block-helper', 'fristed'];

// Protected domains — blocking these would break networking or the app itself
export const PROTECTED_DOMAINS = [
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
export function isProtectedApp(name) {
    if (!name) return false;
    const lower = name.trim().toLowerCase();
    return PROTECTED_APP_NAMES.some(p => lower === p);
}

/**
 * Check if a domain is protected (case-insensitive).
 * Returns true if the domain should NOT be added to a blocklist.
 */
export function isProtectedDomain(domain) {
    if (!domain) return false;
    const lower = domain.trim().toLowerCase();
    return PROTECTED_DOMAINS.some(p => lower === p);
}

// Helper: detect always-on blocks by flag OR far-future end time
export function isBlockAlwaysOn(block) {
    return block.isAlwaysOn === true || block.endTime >= ALWAYS_ON_END_TIME;
}

export function isScreenTimeSummaryEntry(appName) {
    return typeof appName === 'string' && appName.includes('selected (Screen Time)');
}

export function parseLegacyScreenTimeSummary(entries) {
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

export function normalizeIOSScreenTimeSelection(selection, legacySummaryEntries = []) {
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

export function cloneIOSScreenTimeSelection(selection) {
    const normalized = normalizeIOSScreenTimeSelection(selection);
    return normalized ? { ...normalized } : null;
}

export function hasUsableIOSScreenTimeSelection(selection) {
    const normalized = normalizeIOSScreenTimeSelection(selection);
    return !!normalized && (
        normalized.applicationTokens.length > 0 ||
        normalized.categoryTokens.length > 0
    );
}

export function formatIOSScreenTimeSelectionLabel(selection) {
    const normalized = normalizeIOSScreenTimeSelection(selection);
    if (!normalized) return '';
    if (normalized.summaryLabel) return normalized.summaryLabel;

    const parts = [];
    if (normalized.applicationCount > 0) parts.push(`${normalized.applicationCount} app${normalized.applicationCount > 1 ? 's' : ''}`);
    if (normalized.categoryCount > 0) parts.push(`${normalized.categoryCount} categor${normalized.categoryCount > 1 ? 'ies' : 'y'}`);
    return parts.length > 0 ? `${parts.join(', ')} selected (Screen Time)` : '';
}

export function getBlocklistRegularApps(blocklist) {
    if (!Array.isArray(blocklist?.apps)) return [];
    return blocklist.apps.filter(app => typeof app === 'string' && !isScreenTimeSummaryEntry(app));
}

export function getBlocklistIOSScreenTimeSelection(blocklist) {
    const legacySummaryEntries = Array.isArray(blocklist?.apps)
        ? blocklist.apps.filter(isScreenTimeSummaryEntry)
        : [];
    return normalizeIOSScreenTimeSelection(blocklist?.iosScreenTimeSelection, legacySummaryEntries);
}

export function getBlocklistModalLockedApps(blocklist) {
    const locked = [...getBlocklistRegularApps(blocklist)];
    const screenTimeLabel = formatIOSScreenTimeSelectionLabel(getBlocklistIOSScreenTimeSelection(blocklist));
    if (screenTimeLabel) locked.push(screenTimeLabel);
    return locked;
}

export function getBlocklistIOSPayload(blocklist) {
    const selection = getBlocklistIOSScreenTimeSelection(blocklist);
    return {
        appTokenData: selection?.applicationTokens || [],
        categoryTokenData: selection?.categoryTokens || []
    };
}

export function blocklistNeedsIOSSelectionRefresh(blocklist) {
    const selection = getBlocklistIOSScreenTimeSelection(blocklist);
    return !!selection && selection.requiresReselection === true && !hasUsableIOSScreenTimeSelection(selection);
}

export function ensureIOSBlocklistSelectionReady(blocklist, actionLabel) {
    if (!state.isIOS || !blocklistNeedsIOSSelectionRefresh(blocklist)) {
        return true;
    }

    const blocklistName = blocklist?.name || 'This blocklist';
    alert(`${blocklistName} has an old Screen Time app selection that iOS can no longer enforce reliably. Please edit the blocklist and re-select its apps before ${actionLabel}.`);
    return false;
}

export function normalizeBlocklist(blocklist) {
    const normalizedBlocklist = { ...blocklist };
    normalizedBlocklist.apps = getBlocklistRegularApps(blocklist);
    normalizedBlocklist.iosScreenTimeSelection = getBlocklistIOSScreenTimeSelection(blocklist);
    return normalizedBlocklist;
}

export function collectActiveIOSManualBlockPayload(now = Date.now()) {
    const allDomains = new Set();
    const appTokenData = new Set();
    const categoryTokenData = new Set();

    let displayWinner = null;

    for (const block of state.appData.activeBlocks || []) {
        if (block.startTime > now || block.endTime <= now || block.isPaused) continue;
        const blocklist = state.appData.blocklists.find(bl => bl.id === block.blocklistId);
        if (!blocklist) continue;

        const bid = String(block.blocklistId ?? '');
        if (
            displayWinner == null
            || block.startTime < displayWinner.block.startTime
            || (block.startTime === displayWinner.block.startTime
                && bid < String(displayWinner.block.blocklistId ?? ''))
        ) {
            displayWinner = { block, blocklist };
        }

        for (const domain of blocklist.websites || []) {
            if (!isProtectedDomain(domain)) allDomains.add(domain);
        }

        const iosPayload = getBlocklistIOSPayload(blocklist);
        for (const token of iosPayload.appTokenData) appTokenData.add(token);
        for (const token of iosPayload.categoryTokenData) categoryTokenData.add(token);
    }

    const out = {
        domains: Array.from(allDomains).sort(),
        appTokenData: Array.from(appTokenData),
        categoryTokenData: Array.from(categoryTokenData)
    };
    if (displayWinner) {
        const { block, blocklist } = displayWinner;
        out.blocklistEmoji = blocklist.emoji ?? null;
        out.blocklistName = blocklist.name ?? null;
        const c = blocklist.color;
        out.blocklistColorHex = typeof c === 'string' && c.length > 0 ? c : null;
        out.blockStartMs = block.startTime;
        out.blockEndMs = block.endTime;
    }
    return out;
}

