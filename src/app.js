// Tauri API imports - proper ES modules from @tauri-apps/api
import { invoke, convertFileSrc, Channel } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { ask, message, open as openDialog, save as saveDialog } from '@tauri-apps/plugin-dialog';
import { readTextFile, writeTextFile } from '@tauri-apps/plugin-fs';
import logoReddFocusUrl from './images/logo-reddfocus.svg';
import logoReddShieldUrl from './images/logo-redd-shield.svg';
import appleLogoUrl from './images/apple-logo.svg';
import iconChromeUrl from './images/icon-chrome.svg';
import iconBraveUrl from './images/icon-brave.svg';
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
import screenshotAutomationSettings from './images/automation-settings.png';
import screenshotEnableFda from './images/enable-fda.png';
import snoozeIconUrl from './images/snooze.png';
import welcomeDemoVideoUrl from './reddblock-video.mp4';
import {
    initScheduleOverlayMessageEditor,
    getScheduleOverlayMessageEditorHtml,
    setScheduleOverlayMessageEditorHtml,
    setScheduleOverlayMessageEditorPlaceholder,
    setScheduleOverlayMessageEditorEnabled,
    sanitizeOverlayMessageHtml,
    escapeHtmlForOverlay,
    normalizeStoredOverlayMessage,
    isOverlayMessageEmpty,
} from './schedule-overlay-message-editor.js';
import {
    resolveReleaseNotesForVersion,
    renderReleaseNotesHtml,
    releaseNotesHasContent,
    filterReleaseNotesForPlatform,
} from './changelog.js';
// Compatibility layer wrapping Tauri APIs — extracted to tauri-api.js
import { tauriAPI, openUrl } from './tauri-api.js';
import { state, appState } from './state.js';
import {
    ALWAYS_ON_END_TIME,
    PROTECTED_APP_NAMES,
    PROTECTED_DOMAINS,
    isProtectedApp,
    isProtectedDomain,
    isBlockAlwaysOn,
    isScreenTimeSummaryEntry,
    parseLegacyScreenTimeSummary,
    normalizeIOSScreenTimeSelection,
    cloneIOSScreenTimeSelection,
    hasUsableIOSScreenTimeSelection,
    formatIOSScreenTimeSelectionLabel,
    getBlocklistRegularApps,
    getBlocklistIOSScreenTimeSelection,
    getBlocklistModalLockedApps,
    getBlocklistIOSPayload,
    blocklistNeedsIOSSelectionRefresh,
    ensureIOSBlocklistSelectionReady,
    normalizeBlocklist,
    collectActiveIOSManualBlockPayload,
} from './blocklist-utils.js';
import { openInstalledAppsPicker } from './apps-picker.js';
import { closeAllPopovers, disableScheduleControls, disableTimeControls, getEndTimeAsDate, getStartTimeAsDate, handleDurationInputChange, handleDurationQuickBtn, handlePopoverOutsideClick, handleTimePartClick, initializeTimeInputs, pad, parseEndTimeBoundedInt, scrollElementWithinContainer, scrollPopoverOptionIntoView, setupEndTimeDirectInputs, updateDurationQuickBtns, updateTimeDisplay } from './time-inputs.js';
import { loadData, saveData, updateHostsFile } from './persistence.js';
import {
    addScheduleSegment, discardSchedulePendingChanges, getCommittedScheduleSegmentCount,
    getDefaultScheduleSegments, getInitialExpandedScheduleSegmentIndex, handleRepeatDateChange,
    handleRepeatOptionClick, handleSegmentDayToggle, rebuildScheduleSegments,
    saveSchedulePendingChanges, setAlwaysOnMode, setScheduleMode, startSchedule,
    toggleRepeatDropdown, updateScheduleButtonState, isScheduleSegmentActiveNow,
    formatDateForDisplay,
} from './schedule-editor.js';
import {
    SCHEDULE_OVERLAY_DEFAULT_PRESET_VALUE, applyScheduleStartOverlayPresentation,
    getEffectiveScheduleStartOverlayId, getScheduleStartOverlayForWarningApps,
    handleSchedulePanelOverlayOptionClick, isScheduleOverlayCustomiseModalOpen,
    playAppBlockingLetsGoVoice, populateScheduleOverlayCustomiseSelector,
    rememberLastScheduleStartOverlayId, setupScheduleOverlayCustomiseModal,
    syncScheduleConfirmOverlaySummary, syncScheduleOverlayCustomiseDirtyState,
    syncScheduleOverlayCustomiseEditorState, syncScheduleOverlayCustomiseTitle,
    toggleSchedulePanelOverlayDropdown,
} from './schedule-overlay.js';
import { applyModalBlocklistTint, applyOverrideTypeUi, closeBlocklistModal, closeOverrideModal, closePauseModal, closeScheduleConfirmModal, closeStartBlockConfirmModal, deselectBlocklist, handleBlocklistSelect, openBlocklistModal, openPauseModal, openResumeConfirmation, proceedWithBlock, proceedWithPause, proceedWithSchedule, proceedWithScheduleEdit, renderScheduleConfirmSegments, setBtnActionLabel, setOverrideCountMaxMode, setStartBlockBtnLeadingIcon, setStartConfirmPrimaryLabel, startBlock, syncAllStopBtnLabelFits, syncOverrideCountUi, syncPauseDurationRowLayout, updateOverridePreview, updatePauseRestartTime, openOverrideModal, updatePauseButtonAppearance, openScheduleOverrideModal, showScheduleConfirmModal, showScheduleEditConfirmModal, syncStopBtnLabelFit, setStartBtnBlocklistInfo } from './confirm-modals.js';
import { renderBlocklists, autoSelectSoleBlocklist, closeAllBlocklistMenus, truncateBlocklistName, setupBlocklistsImportExportButtons, duplicateBlocklist, getNextCopyName, undoDelete, deleteBlocklist, clearPendingScheduleDraft, pendingDelete, saveBlocklistOrderFromDOM, getBlocklistScheduleDraft, saveBlocklistScheduleDraft, isBlocklistCurrentlyActive } from './blocklists.js';
import { render, kickClockNow, startTickInterval, updateWeekCalendar, syncSelectedControlState, renderNowBlockingRow, renderScheduleAlwaysOnRow, renderScheduleVisibilityChips, renderWeekBlocks, renderBlocklistSelector, getCalendarSegmentLayout, layoutOverlappingBlocks } from './render.js';
import { formatTitleBarScheduleStartWhen, hasAnyEnforcedBlocks, isNonRepeatingSchedule, isOneOffBlockEnforced, isSchedulePausedNow, pickEarliestUpcomingScheduledBlock, refreshDesktopHelperStatus, resolveOneShotOccurrences, scheduleHasFutureSingleOccurrence, syncActiveBlocksToHelper, syncSchedulesToHelper } from './schedule-engine.js';
import { dismissTopmostEscapeLayer, isModalVisible, refreshOpenHelperUi, startHelperUiRefreshLoop, stopHelperUiRefreshLoop } from './modal-manager.js';
import {
    overrideAllChallengeText, overrideAllWordChallengeState, refreshUninstallButtonState,
    setupGraceSetting, setupHelpMenuLinks, setupHelperSettings, setupInAppUninstall,
    setupOverrideAll, setupSettingsHelpButtons, setupWindowsUninstallGuidance,
    syncUninstallConfirmModal, updateCleanHostsBtnState, updateHelperStatusIndicator,
    updateManageSectionVisibility, updateOverrideAllButtonVisibility,
} from './settings.js';
import { setupTheme, setupUiZoomShortcuts, scheduleUiZoomResponsiveLayout, scheduleSelectionPromptLayout, getEffectiveViewportWidth, bindUiZoomLayoutObserver } from './theme.js';
import { checkForAppUpdate, getLatestVersionPlatformKey, isVersionHigher, resolveMicrosoftStorePackage, updateBannerWhatsNewButtonHtml } from './update-banner.js';
import { updateDownloadInProgress } from './update-banner.js';
import { getWordList5, getIOSRandomWordsCharCount, generateRandomWordsByCount, generateRandomWords, generateOverrideChallengeText, generateGibberish, normalizeOverrideCount, normalizeCustomOverrideText, getTypingCharsPerMinuteForType, getMaxOverrideCharsForType, getOverrideGeneratedCharCount, getDifficultyTypingCharCount, getOverridePreviewText, getOverrideEstimatedMinutes, formatOverrideMaxDifficultyHint, usesMobileWordCountForOverrideType, isMobileOverrideChallengePlatform, formatIOSGibberishChallenge, MIN_OVERRIDE_CHARS, DEFAULT_OVERRIDE_COUNT, TARGET_MAX_OVERRIDE_MINUTES, MAX_IOS_OVERRIDE_WORD_COUNT, IOS_OVERRIDE_WORDS_PER_MINUTE, OVERRIDE_PREVIEW_TRUNCATE_AT } from './override-challenge.js';
import { escapeHtml, cleanUrlForDisplay, parseRgbFromColorString, rgbToHex, rgbToHsl, hslToRgb, getRelativeLuminance, getEnteringChipColor, getContrastTextColor } from './utils.js';
import { SETTINGS_TRANSLATIONS, getSettingsLanguage, weekdayAbbrevMon0List, weekdayLetterMon0List, tSettings, tSettingsFmt, LANGUAGE_FLAG_SVG, LANGUAGE_NATIVE_LABELS, languageNativeLabel } from './i18n.js';
/** Windows Settings → Apps → Installed apps (Apps & features). */
export const WINDOWS_APPS_SETTINGS_URI = 'ms-settings:appsfeatures';


// Expose for integration tests (dev mode only)
window.__REDDBLOCK_INTERNALS__ = {
    get appData() { return state.appData; },
    set appData(val) { state.appData = val; }
};

/** Blocklist modal undo: session-scoped stack and "last" values for recording previous state. */

export function pushModalUndo(type, undoFn) {
    if (state.blocklistModalApplyingUndo) return;
    state.blocklistModalUndoStack.push({ type, undo: undoFn });
}

/** Reference to the removed Custom Text option so it can be re-added (getElementById returns null after remove()). */
/** Blocklist id to pass to helper when confirming single-block override (set when opening modal). */
let draggedBlocklistId = null; // Track which blocklist is being dragged
let startupInitializationPromise = null; // Prevent duplicate post-onboarding startup runs
let startupInitializationComplete = false; // Track whether post-onboarding startup already ran
/** Max length for blocklist display name (add/edit modal + persisted saves). */
export const BLOCKLIST_NAME_MAX_LENGTH = 60;
/** Past this length the card title row usually ellipsizes; use "in 11h" instead of "starts in 11h". */
export const BLOCKLIST_CARD_COMPACT_SCHEDULE_UPCOMING_CHARS = 26;
/** Collapse stop-button emoji+name this many px before measured overflow (iOS flex overlap). */
export const IOS_STOP_BTN_META_COLLAPSE_SLACK_PX = 24;

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
state.scheduleSegments = getDefaultScheduleSegments(); // Array of time segments with per-segment days

export function getBlocklistDisplayApps(blocklist) {
    const apps = getBlocklistRegularApps(blocklist).map(displayNameForBlockedApp);
    const screenTimeLabel = formatIOSScreenTimeSelectionLabel(getBlocklistIOSScreenTimeSelection(blocklist));
    if (screenTimeLabel) {
        apps.push(screenTimeLabel);
    }
    return apps;
}


const CURRENT_EULA_REVISION = 1;
let forceShowEulaThisSession = false;

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    detectPlatform(); // Before loadData so first-launch defaults can differ on iOS
    setupHandsetModalScreens();
    await loadData();
    await resetDevOnlyEulaAcceptance();
    setupMobileExternalLinkOpens();
    if (state.isAndroid) {
        listenForAndroidFrictionGate();
        setupAndroidBackButtonHandling();
    }
    setupNowBlockingChipScroll();
    setupEventListeners();
    setupAppBlockingWarningOverlay();
    initWelcomeDemoControls();
    setupTheme();
    setupUiZoomShortcuts();
    setupHelpMenuLinks();
    setupHelperSettings();
    setupSettingsHelpButtons();
    setupBlocklistsImportExportButtons();
    setupAppForegroundRefresh();
    setupOverrideAll();
    setupInAppUninstall();
    setupWindowsUninstallGuidance();
    setupMacAutomationIntroModal();
    setupGraceSetting();
    setupSettingsEnforcementSection();
    if (!state.isIOS && !state.isAndroid) {
        void wireEnforcementToggle();
    }
    await runInitialOnboardingSequence();
    if (state.isIOS && hasAcceptedEula()) {
        await checkScreentimeAuth();
    } else if (state.isAndroid && hasAcceptedEula()) {
        await checkAndroidPermissions();
    }

    if (hasAcceptedEula()) {
        await runPostAcceptanceStartup();
    }

});

function setupNowBlockingChipScroll() {
    const chipsEl = document.getElementById('now-blocking-chips');
    if (!chipsEl) return;

    let isPointerDown = false;
    let isDragging = false;
    let suppressClick = false;
    let startX = 0;
    let startScrollLeft = 0;

    window.addEventListener('resize', () => syncNowBlockingChipsScrollability(), { passive: true });

    chipsEl.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        if (e.target.closest('.now-blocking-chip-menu-btn')) return;
        if (!chipsEl.classList.contains('can-horizontal-scroll')) return;

        isPointerDown = true;
        isDragging = false;
        suppressClick = false;
        startX = e.clientX;
        startScrollLeft = chipsEl.scrollLeft;
        chipsEl.classList.add('is-dragging');
        e.preventDefault();
    });

    const stopDragging = () => {
        suppressClick = isDragging;
        isPointerDown = false;
        isDragging = false;
        chipsEl.classList.remove('is-dragging');
    };

    document.addEventListener('mousemove', (e) => {
        if (!isPointerDown) return;
        const deltaX = e.clientX - startX;
        if (Math.abs(deltaX) > 3) {
            isDragging = true;
        }
        chipsEl.scrollLeft = startScrollLeft - deltaX;
        e.preventDefault();
    });

    document.addEventListener('mouseup', stopDragging);
    chipsEl.addEventListener('mouseleave', () => {
        if (!isPointerDown) return;
        stopDragging();
    });

    chipsEl.addEventListener('click', (e) => {
        if (!suppressClick) return;
        if (e.target.closest('.now-blocking-chip-menu-btn')) {
            suppressClick = false;
            return;
        }
        suppressClick = false;
        e.preventDefault();
        e.stopPropagation();
    }, true);
}

export function syncNowBlockingChipsScrollability() {
    const chipsEl = document.getElementById('now-blocking-chips');
    const row = document.getElementById('now-blocking-row');
    if (!chipsEl || !row || row.classList.contains('hidden')) return;
    if (row.classList.contains('idle')) {
        chipsEl.classList.remove('can-horizontal-scroll');
        return;
    }
    chipsEl.classList.toggle('can-horizontal-scroll', chipsEl.scrollWidth > chipsEl.clientWidth + 1);
}

function isLocalDevRun() {
    if (import.meta?.env?.DEV) {
        return true;
    }
    return ['http:', 'https:'].includes(window.location.protocol)
        && ['localhost', '127.0.0.1'].includes(window.location.hostname);
}

async function resetDevOnlyEulaAcceptance() {
    // Mobile debug builds run through Vite too, but they should behave like
    // installed apps here: once the EULA is accepted, keep respecting it.
    forceShowEulaThisSession = !state.isIOS && !state.isAndroid && isLocalDevRun();
}



function getAcceptedEulaRevision() {
    const rawRevision = state.appData?.settings?.eulaAcceptedRevision;
    if (Number.isInteger(rawRevision) && rawRevision > 0) {
        return rawRevision;
    }
    if (typeof rawRevision === 'string') {
        const parsedRevision = Number.parseInt(rawRevision, 10);
        if (Number.isInteger(parsedRevision) && parsedRevision > 0) {
            return parsedRevision;
        }
    }
    if (state.appData?.settings?.eulaAccepted === true) {
        return CURRENT_EULA_REVISION;
    }
    return null;
}

export function normalizeLoadedEulaState() {
    if (!state.appData.settings) {
        state.appData.settings = {};
    }

    let changed = false;
    const acceptedRevision = getAcceptedEulaRevision();

    if (acceptedRevision == null) {
        if (state.appData.settings.eulaAcceptedRevision != null) {
            delete state.appData.settings.eulaAcceptedRevision;
            changed = true;
        }
    } else if (state.appData.settings.eulaAcceptedRevision !== acceptedRevision) {
        state.appData.settings.eulaAcceptedRevision = acceptedRevision;
        changed = true;
    }

    const rawAcceptedAt = state.appData.settings.eulaAcceptedAt;
    if (rawAcceptedAt != null) {
        const parsedAcceptedAt = Number(rawAcceptedAt);
        if (Number.isFinite(parsedAcceptedAt) && parsedAcceptedAt > 0) {
            if (state.appData.settings.eulaAcceptedAt !== parsedAcceptedAt) {
                state.appData.settings.eulaAcceptedAt = parsedAcceptedAt;
                changed = true;
            }
        } else {
            delete state.appData.settings.eulaAcceptedAt;
            changed = true;
        }
    }

    if ('eulaAccepted' in state.appData.settings) {
        delete state.appData.settings.eulaAccepted;
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
        if (state.isIOS) {
            await checkScreentimeAuth();
            if (state.screentimeAuthorized) {
                await initializeIOSBlockingState();
            }
        } else if (state.isAndroid) {
            await checkAndroidPermissions();
            // Not gated on the accessibility grant: migration must run
            // before ANY set_schedules call, because Kotlin stores the
            // synced schedules under the same legacy prefs key
            // ("routines") that the migration reads — a pre-migration
            // sync would overwrite the legacy data and then re-import
            // our own schedules as duplicates. Neither command needs
            // accessibility; enforcement simply stays off until granted.
            await initializeAndroidBlockingState();
        } else {
            // Run first-launch migration off the legacy helper + check
            // Automation TCC (macOS) + extension compliance. Idempotent;
            // a no-op on subsequent launches past the current version.
            setupEnforcerUiAlerts();
            setupWebAutomationUiAlerts();
            await ensureInstalledAppsCache();
            await runDesktopOnboarding();
            await checkHelperStatus();
            console.log('[startup-sync] Desktop startup helperAvailable:', state.helperAvailable);
            // Reconcile manual blocks first so paused one-offs are removed from helper state after reinstall.
            await syncActiveBlocksToHelper();
            // Then sync schedules to helper so both enforcement sources are aligned.
            await syncSchedulesToHelper();
            console.log('[startup-sync] Startup helper reconciliation complete');
            // Push active schedule / block app sets into the in-process watcher
            // immediately — don't wait for the 1s tick interval.
            await updateHostsFile();
            await updateBlockedApps();
            if (!migrationOnboardingActive) {
                try {
                    await invoke('enforcer_start');
                } catch (e) {
                    console.warn('[startup] enforcer_start failed:', e);
                }
            }
            // Start the automation watcher even while the migration overlay
            // is open — blocks may already be active and the watcher is
            // idle until then anyway.
            await startWebAutomationWatcher();
        }
        render();
        startTickInterval();

        // Check for app updates (non-blocking, desktop only)
        if (!state.isIOS && !state.isAndroid) {
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

// ---- Welcome screen --------------------------------------------------------
//
// Friendly one-screen intro shown once per machine, before the EULA.
// Sets context (open-source, who built it) before legal acceptance
// and the macOS Automation / Firefox extension setup overview.
//
// Persistence: `state.appData.settings.welcomeOnboardingShown` (boolean).
// Wiped by `scripts/dev-reset-fda-onboarding.sh` (incl. --nuke; shared
// storage at /var/lib/redd-block is cleared too).
function hasWelcomeOnboardingBeenShown() {
    return state.appData?.settings?.welcomeOnboardingShown === true;
}

async function persistWelcomeOnboardingShown() {
    if (!state.appData.settings) state.appData.settings = {};
    state.appData.settings.welcomeOnboardingShown = true;
    try {
        await saveData();
    } catch (e) {
        console.warn('[welcome-onboarding] persist failed:', e);
    }
}

async function runInitialOnboardingSequence() {
    if (!state.isIOS && !hasWelcomeOnboardingBeenShown()) {
        await presentWelcomeOnboarding();
        await persistWelcomeOnboardingShown();
    }
    updateOnboardingVisibility();
}

function presentWelcomeOnboarding(onContinue) {
    return (async () => {
        const overlay = document.getElementById('welcome-onboarding');
        const btn = document.getElementById('welcome-onboarding-continue-btn');
        if (!overlay || !btn) {
            return;
        }

        showExclusiveOnboardingScreen('welcome-onboarding');
        document.getElementById('main-content')?.classList.add('hidden');
        document.getElementById('now-blocking-row')?.classList.add('hidden');
        resetWelcomeDemoPanel();
        welcomeFirefoxInstalled = await detectWelcomeFirefoxInstalled();
        applyWelcomeOnboardingLanguage();

        await new Promise((resolve) => {
            const onClick = () => {
                btn.removeEventListener('click', onClick);
                overlay.classList.add('hidden');
                onContinue?.();
                resolve();
            };
            btn.addEventListener('click', onClick);
        });
    })();
}

function syncSetupBannerHeadline() {
    const headlineEl = document.getElementById('setup-banner-headline');
    if (!headlineEl) return;
    const browsers = lastOnboardingState?.browsers;
    if (!browsers) {
        headlineEl.textContent = tSettings(state.isMacOSDesktop ? 'setupBrowsersBannerHeadlineMac' : 'setupBrowsersBannerHeadline');
        return;
    }
    const detectedKeys = Object.keys(BROWSER_STORE_LINKS).filter(k => browsers[k] && browsers[k].installed);
    headlineEl.textContent = tSettings(bannerHeadlineKey(browsers, detectedKeys));
}

function showEulaOnboardingScreen() {
    showExclusiveOnboardingScreen('eula-onboarding');
    document.getElementById('main-content')?.classList.add('hidden');
    document.getElementById('now-blocking-row')?.classList.add('hidden');
    applyEulaOnboardingLanguage();
    const eulaContinueBtn = document.getElementById('eula-continue-btn');
    const eulaCheckbox = document.getElementById('eula-agree-checkbox');
    if (eulaCheckbox && hasAcceptedEula()) {
        eulaCheckbox.checked = true;
    }
    if (eulaContinueBtn) {
        eulaContinueBtn.disabled = !eulaCheckbox?.checked;
        eulaContinueBtn.textContent = tSettings('eulaContinueBtn');
    }
}

function isFirstRunOnboardingInProgress() {
    if (!hasAcceptedEula()) return false;
    return firstRunExtensionSetupPending && !migrationOnboardingDismissed;
}

function continueFirstRunOnboardingFromWelcome() {
    if (!hasAcceptedEula()) {
        updateOnboardingVisibility();
        return;
    }
    if (isFirstRunOnboardingInProgress()) {
        showEulaOnboardingScreen();
        return;
    }
    updateOnboardingVisibility();
}

/** macOS welcome screen: whether Firefox.app is on disk (step 2 gate). */
let welcomeFirefoxInstalled = false;

async function detectWelcomeFirefoxInstalled() {
    if (!state.isMacOSDesktop) return false;
    try {
        return !!(await invoke('is_firefox_installed'));
    } catch (e) {
        console.warn('[welcome-onboarding] is_firefox_installed failed:', e);
        return false;
    }
}

/** Cached for enforcement copy when the browser scan is not available yet. */
let enforcementCopyFirefoxInstalled = false;

function firefoxInstalledFromState(state) {
    const b = state?.browsers?.firefox ?? lastMigrationBrowserState?.browsers?.firefox;
    if (!b) return null;
    return !!b.installed;
}

async function resolveEnforcementCopyFirefoxInstalled(state) {
    if (!appState.isMacOSDesktop) return false;
    const fromState = firefoxInstalledFromState(state);
    if (fromState !== null) {
        enforcementCopyFirefoxInstalled = fromState;
        return fromState;
    }
    enforcementCopyFirefoxInstalled = await detectWelcomeFirefoxInstalled();
    return enforcementCopyFirefoxInstalled;
}

function migrationEnforcementDescHtml(firefoxInstalled = enforcementCopyFirefoxInstalled) {
    if (!state.isMacOSDesktop) {
        return tSettings('migrationEnforcementDescExtension');
    }
    return tSettings(firefoxInstalled
        ? 'migrationEnforcementDescMacFirefox'
        : 'migrationEnforcementDescMacAutomation');
}

function settingsEnforcementHintHtml(firefoxInstalled = enforcementCopyFirefoxInstalled) {
    if (!state.isMacOSDesktop) {
        return tSettings('settingsEnforcementRowHintExtension');
    }
    return tSettings(firefoxInstalled
        ? 'settingsEnforcementRowHintMacFirefox'
        : 'settingsEnforcementRowHintMacAutomation');
}

export async function applyEnforcementDescCopy(state) {
    await resolveEnforcementCopyFirefoxInstalled(state);
    setHtmlById('enforcement-toggle-desc-text', migrationEnforcementDescHtml());
    setHtmlById('settings-enforcement-toggle-desc-text', settingsEnforcementHintHtml());
}

function setHtmlById(id, html) {
    const el = document.getElementById(id);
    if (el) el.innerHTML = html;
}

function returnToWelcomeFromEula() {
    presentWelcomeOnboarding(continueFirstRunOnboardingFromWelcome);
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
/** True while the welcome → EULA → extension-setup chain is in progress. */
let firstRunExtensionSetupPending = false;
// While the migration post-phase is on screen, the user is bouncing
// between this window and Safari (or Chrome/Firefox/etc.) toggling
// extension settings. The window-`focus` listener below already
// re-polls on tab-back, but a user who has Safari and ReDD Blocker
// side-by-side never triggers focus events as they click toggles.
// Run a low-frequency poll so the checklist ticks itself off within
// the "up to 20 seconds" window the UI already promises. Cleared
// when the overlay is dismissed.
let migrationPollIntervalId = null;
/** Preserves "Show me how" across `renderBrowserInstallButtons` poll refreshes. */
const migrationShowMeHowExpandedKeys = new Set();
/** Preserves Safari duplicate "How did this happen?" across poll refreshes. */
let migrationSafariDuplicateHelpExpanded = false;
/** Snapshot for re-rendering localized browser rows when language changes mid-overlay. */
export let lastMigrationBrowserState = null;
/** Skips full DOM rebuild on poll when compliance state is unchanged (prevents icon flash). */
let lastMigrationBrowserRenderSignature = '';
/** Skips header/how-to HTML rewrites on poll when copy inputs are unchanged (prevents logo flash). */
let lastMigrationHeaderCopyKey = '';
let lastMigrationHowtoCopyKey = '';
const MIGRATION_POLL_MS = 2500;
const EXT_ONBOARDING_DISMISSED_KEY = 'reddBlockExtOnboardingDismissed';

async function runDesktopOnboarding() {
    if (state.isIOS || state.isAndroid) return;
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

        const state = await invoke('onboarding_state');

        // Returning macOS upgraders: one-time intro before the full browser-
        // setup overlay (which would take over the window and hide this).
        if (await maybeShowMacAutomationIntro(state)) {
            return;
        }

        // Fresh-user case: surface the extension setup screen until the
        // user dismisses it. renderBrowserInstallButtons falls back to a
        // Chrome row when no installed browsers are detected yet.
        await ensureExtensionSetupOnboardingShown();

        if (migrationOnboardingActive) return;

        await updateBehaviourChangeBanner(state);
    } catch (e) {
        console.warn('[onboarding] state check failed:', e);
    }
}

function hasMacAutomationIntroBeenShown() {
    return state.appData?.settings?.macAutomationIntroShown === true;
}

async function persistMacAutomationIntroShown() {
    if (!state.appData.settings) state.appData.settings = {};
    if (state.appData.settings.macAutomationIntroShown) return;
    state.appData.settings.macAutomationIntroShown = true;
    try {
        await saveData();
    } catch (e) {
        console.warn('[mac-automation-intro] persist failed:', e);
    }
}

async function persistOnboardingComplete() {
    if (!state.appData.settings) state.appData.settings = {};
    if (state.appData.settings.onboardingComplete) return;
    state.appData.settings.onboardingComplete = true;
    try {
        await saveData();
    } catch (e) {
        console.warn('[onboarding] persist onboardingComplete failed:', e);
    }
}

function applyMacAutomationIntroCopy() {
    const setText = (id, text) => {
        const el = document.getElementById(id);
        if (el) el.textContent = text;
    };
    const setHtml = (id, html) => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = html;
    };

    setText('mac-automation-intro-badge-text', tSettings('macAutomationIntroBadge'));
    setText('mac-automation-intro-title', tSettings('macAutomationIntroTitle'));
    setHtml('mac-automation-intro-lead', tSettings('macAutomationIntroLeadHtml'));
    setText('mac-automation-intro-automation-browsers-label', tSettings('macAutomationIntroAutomationBrowsers'));
    setText('mac-automation-intro-automation-method', tSettings('macAutomationIntroAutomationMethod'));
    setText('mac-automation-intro-firefox-label', tSettings('macAutomationIntroFirefoxLabel'));
    setText('mac-automation-intro-extension-method', tSettings('macAutomationIntroExtensionMethod'));
    setHtml('mac-automation-intro-unchanged', tSettings('macAutomationIntroUnchangedHtml'));
    setText('mac-automation-intro-dismiss-btn', tSettings('macAutomationIntroDismissBtn'));
    setText('mac-automation-intro-review-btn', tSettings('macAutomationIntroReviewBtn'));

    const stack = document.getElementById('mac-automation-intro-automation-icons');
    if (stack && !stack.dataset.ready) {
        for (const key of ['safari', 'chrome', 'edge', 'brave']) {
            const img = document.createElement('img');
            img.src = browserIconUrl(key);
            img.alt = '';
            img.className = 'mac-automation-intro-stack-icon';
            stack.appendChild(img);
        }
        stack.dataset.ready = '1';
    }
    const firefoxIcon = document.getElementById('mac-automation-intro-firefox-icon');
    if (firefoxIcon) firefoxIcon.src = browserIconUrl('firefox');
}

function hideMacAutomationIntroModal() {
    document.getElementById('mac-automation-intro-modal')?.classList.add('hidden');
}

async function dismissMacAutomationIntroModal({ openSetup = false } = {}) {
    await persistMacAutomationIntroShown();
    hideMacAutomationIntroModal();
    if (openSetup) {
        await openExtensionSetupOverlay();
    }
}

// True when ReDD Focus was previously set up in a browser that now
// blocks via Automation — i.e. they used the old extension-based model.
function hadLegacyAutomationBrowserExtension(state) {
    const browsers = state?.browsers || {};
    for (const key of AUTOMATION_BROWSER_KEYS) {
        const b = browsers[key];
        if (!b?.installed) continue;
        const profiles = b.profiles || [];
        if (key === 'safari') {
            if (profiles.some((p) => p.installed)) return true;
            continue;
        }
        const def = profiles.find((p) => p.isDefault) || profiles[0];
        if (def?.installed) return true;
    }
    return false;
}

async function shouldShowMacAutomationIntro(state) {
    if (!appState.isMacOSDesktop || !hasAcceptedEula() || !hasWelcomeOnboardingBeenShown()) return false;
    if (hasMacAutomationIntroBeenShown() || migrationOnboardingActive) return false;

    const extDismissed = !!localStorage.getItem(EXT_ONBOARDING_DISMISSED_KEY);
    const returningUser = appState.appData?.settings?.onboardingComplete === true || extDismissed;
    if (!returningUser) return false;

    // Fresh first-run path after EULA — browser-setup overlay covers it.
    if (firstRunExtensionSetupPending && !extDismissed) return false;

    await refreshAutomationPermissionStatus();
    const browsers = state?.browsers || {};
    const automationKeys = AUTOMATION_BROWSER_KEYS.filter(
        (k) => browsers[k]?.installed && browserUsesAutomation(k),
    );
    if (automationKeys.length === 0) {
        await persistMacAutomationIntroShown();
        return false;
    }

    const allAutomationGranted = automationKeys.every(
        (k) => (lastAutomationPermissionByKey[k] || 'unknown') === 'granted',
    );
    if (allAutomationGranted) {
        await persistMacAutomationIntroShown();
        return false;
    }

    // Prefer the legacy-extension signal for ambiguous cases; anyone who
    // already finished onboarding is treated as an upgrader.
    if (!hadLegacyAutomationBrowserExtension(state)
        && appState.appData?.settings?.onboardingComplete !== true) {
        return false;
    }

    return true;
}

async function maybeShowMacAutomationIntro(state) {
    if (!(await shouldShowMacAutomationIntro(state))) return false;
    applyMacAutomationIntroCopy();
    document.getElementById('migration-onboarding')?.classList.add('hidden');
    migrationOnboardingActive = false;
    stopMigrationPolling();
    document.getElementById('main-content')?.classList.remove('hidden');
    document.getElementById('now-blocking-row')?.classList.remove('hidden');
    document.getElementById('mac-automation-intro-modal')?.classList.remove('hidden');
    return true;
}

function setupMacAutomationIntroModal() {
    const modal = document.getElementById('mac-automation-intro-modal');
    if (!modal || modal._wired) return;
    modal._wired = true;

    document.getElementById('mac-automation-intro-dismiss-btn')
        ?.addEventListener('click', () => { void dismissMacAutomationIntroModal(); });
    document.getElementById('mac-automation-intro-review-btn')
        ?.addEventListener('click', () => { void dismissMacAutomationIntroModal({ openSetup: true }); });
    modal.addEventListener('click', (e) => {
        if (e.target === modal) void dismissMacAutomationIntroModal();
    });
}

async function ensureExtensionSetupOnboardingShown() {
    if (state.isIOS || state.isAndroid || migrationOnboardingActive) return;
    if (safariUsesExtensionMode()) {
        await ensureSafariExtensionFdaBeforeSetup();
    }
    const dismissed = localStorage.getItem(EXT_ONBOARDING_DISMISSED_KEY);
    if (!firstRunExtensionSetupPending && (dismissed || migrationOnboardingDismissed)) return;
    try {
        if (firstRunExtensionSetupPending) {
            migrationOnboardingDismissed = false;
        }
        const state = await invoke('onboarding_state');
        await showMigrationOnboarding('post', state, { mode: 'fresh' });
    } catch (e) {
        console.warn('[onboarding] extension setup overlay failed:', e);
    }
}

async function showMigrationOnboarding(phase, state, opts = {}) {
    const screen = document.getElementById('migration-onboarding');
    const pre = document.getElementById('migration-phase-pre');
    const post = document.getElementById('migration-phase-post');
    const main = document.getElementById('main-content');
    if (!screen || !pre || !post) return;

    applyMigrationOverlayStaticCopy();
    pre.classList.toggle('hidden', phase !== 'pre');
    post.classList.toggle('hidden', phase !== 'post');

    // Configure the target phase while still hidden so we never flash the
    // wrong framing (e.g. "Cleanup complete" before fresh-user copy).
    if (phase === 'post') {
        const mode = opts.mode || 'fresh';
        const title = document.getElementById('migration-post-title');
        const subtitle = document.getElementById('migration-post-subtitle');
        const titleRow = document.getElementById('migration-post-title-row');
        const cleanupItems = post.querySelectorAll('.migration-cleanup-only');
        if (mode === 'after-cleanup') {
            if (title) {
                title.textContent = tSettings('migrationPostTitleCleanup');
            }
            if (subtitle) {
                subtitle.textContent = tSettings('migrationPostSubtitleCleanup');
            }
            titleRow?.classList.remove('hidden');
            cleanupItems.forEach(el => el.classList.remove('hidden'));
        } else {
            titleRow?.classList.add('hidden');
            cleanupItems.forEach(el => el.classList.add('hidden'));
        }
        syncMigrationPostHeader(state);
        wireMigrationPostPhase(state);
    } else if (phase === 'pre') {
        wireMigrationPrePhase();
    }

    migrationOnboardingActive = true;
    startMigrationPolling();
    showExclusiveOnboardingScreen('migration-onboarding');
    document.getElementById('now-blocking-row')?.classList.add('hidden');
    if (main) main.classList.add('hidden');

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
}

let extensionSetupPausedForBackNavigation = false;

function pauseMigrationOnboardingForBackNavigation() {
    document.getElementById('migration-onboarding')?.classList.add('hidden');
    migrationOnboardingActive = false;
    stopMigrationPolling();
}

function syncMigrationPostBackButtonVisibility() {
    const backBtn = document.getElementById('migration-back-btn');
    if (backBtn) {
        backBtn.classList.toggle('hidden', !firstRunExtensionSetupPending);
    }
}

async function returnFromExtensionSetupOnboarding() {
    if (!firstRunExtensionSetupPending) return;
    extensionSetupPausedForBackNavigation = true;
    pauseMigrationOnboardingForBackNavigation();
    showEulaOnboardingScreen();
}

function hideMigrationOnboarding() {
    const screen = document.getElementById('migration-onboarding');
    const main = document.getElementById('main-content');
    if (screen) screen.classList.add('hidden');
    if (main) main.classList.remove('hidden');
    migrationOnboardingActive = false;
    migrationOnboardingDismissed = true;
    firstRunExtensionSetupPending = false;
    migrationShowMeHowExpandedKeys.clear();
    migrationSafariDuplicateHelpExpanded = false;
    lastMigrationBrowserState = null;
    lastMigrationBrowserRenderSignature = '';
    invalidateMigrationMacCopyCache();
    stopMigrationPolling();
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
    btn.textContent = tSettings('migrationContinue');
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
            status.textContent = tSettings('migrationApproveAdminPrompt');
            status.classList.remove('hidden', 'error');
        }

        const failTryAgain = (msg) => {
            btn.disabled = false;
            btn.textContent = tSettings('migrationTryAgain');
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
                    failTryAgain(tSettings('migrationCleanupNeedAdmin'));
                    return;
                }
                if (Date.now() - start > TIMEOUT_MS) {
                    failTryAgain(tSettings('migrationCleanupRetryGeneric'));
                    return;
                }
            }
            const fresh = await invoke('onboarding_state');
            // Explicit after-cleanup framing: we just finished the
            // pre-phase elevated cleanup, so the post screen must
            // surface the "Old version cleaned up / Your blocklists
            // are preserved" rows and the cleanup-flavoured title.
            // Without this, the post phase renders in the default
            // 'fresh' mode for a frame, gets immediately overwritten
            // by the window-focus handler at the bottom of
            // setupEventListeners() (which re-runs runDesktopOnboarding
            // and re-enters with mode: 'after-cleanup' because
            // migration_was_pending_at_launch is still true) — visible
            // on Windows as a flash of the fresh framing right before
            // the cleanup framing settles.
            await showMigrationOnboarding('post', fresh, { mode: 'after-cleanup' });
        } catch (e) {
            console.warn('[migration] poll failed:', e);
            failTryAgain(tSettings('migrationCleanupRetryGeneric'));
        }
    });
}

function wireMigrationPostPhase(state) {
    renderBrowserInstallButtons(state);
    // macOS: the first paint shows Automation rows as 'unknown' because
    // the native status query is async. Fetch it, then re-render so the
    // rows settle to their real Allowed / needs-permission state.
    if (appState.isMacOSDesktop) {
        refreshAutomationPermissionStatus().then(() => {
            if (migrationOnboardingActive) renderBrowserInstallButtons(state, { force: true });
        });
    }
    wireEnforcementToggle();
    syncMigrationPostBackButtonVisibility();
    const doneBtn = document.getElementById('migration-done-btn');
    const skipBtn = document.getElementById('migration-skip-btn');
    const backBtn = document.getElementById('migration-back-btn');

    const finish = async () => {
        try {
            await invoke('enforcer_start');
        } catch (e) {
            console.warn('[migration] enforcer_start failed:', e);
        }
        await startWebAutomationWatcher();
        // Persist dismissal so we don't surface this full-screen
        // again on every launch — the slim extension-compliance
        // banner takes over for ongoing nagging. Stored locally
        // (per-install) which is fine for a UX hint.
        try { localStorage.setItem(EXT_ONBOARDING_DISMISSED_KEY, String(Date.now())); }
        catch (_) { /* localStorage may be disabled; harmless */ }
        await persistOnboardingComplete();
        await persistMacAutomationIntroShown();
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
    if (backBtn && !backBtn._listenerAdded) {
        backBtn._listenerAdded = true;
        backBtn.addEventListener('click', () => {
            void returnFromExtensionSetupOnboarding();
        });
    }
}

// ---- Enforcement opt-in toggle -------------------------------------------
// Reads the current enforcement-enabled setting from the backend and
// wires the toggle in the extension setup dialog. When a block is
// active and enforcement is ON, the toggle is locked (disabled) so
// the user can't weaken enforcement mid-session. The server-side
// guard in enforcement_toggle.rs is the ultimate backstop.

function setSettingsBlockingMethodExpanded(expanded) {
    const toggle = document.getElementById('settings-blocking-method-toggle');
    const content = document.getElementById('settings-blocking-method-content');
    if (!toggle || !content) return;
    toggle.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    content.classList.toggle('hidden', !expanded);
}

export function resetSettingsEnforcementSection() {
    setSettingsBlockingMethodExpanded(false);
}

function setupSettingsEnforcementSection() {
    const toggle = document.getElementById('settings-blocking-method-toggle');
    if (!toggle || toggle.dataset.bound === '1') return;
    toggle.dataset.bound = '1';
    toggle.addEventListener('click', () => {
        const isOpen = toggle.getAttribute('aria-expanded') === 'true';
        setSettingsBlockingMethodExpanded(!isOpen);
    });
}

function syncGraceSettingVisibility(enabled) {
    const row = document.getElementById('settings-grace-row');
    const input = document.getElementById('grace-seconds-input');
    const errorEl = document.getElementById('grace-error');
    if (row) row.classList.toggle('hidden', !enabled);
    if (input) input.classList.toggle('hidden', !enabled);
    if (errorEl && !enabled) {
        errorEl.textContent = '';
        errorEl.classList.add('hidden');
    }
    if (enabled) updateGraceSettingLock();
}

export function updateGraceSettingLock() {
    const input = document.getElementById('grace-seconds-input');
    const row = document.getElementById('settings-grace-row');
    const wrap = document.getElementById('settings-grace-input-wrap');
    const tooltip = document.getElementById('grace-input-lock-tooltip');
    if (!input || !wrap || row?.classList.contains('hidden')) return;

    const locked = hasAnyEnforcedBlocks();
    input.disabled = locked;
    if (locked) {
        input.setAttribute('aria-disabled', 'true');
    } else {
        input.removeAttribute('aria-disabled');
    }
    if (tooltip) {
        tooltip.textContent = locked ? tSettings('settingsEnforcementLockedTooltip') : '';
        tooltip.classList.toggle('hidden', !locked);
    }
}

function syncEnforcementToggleSectionVisual(_toggle) {
    const migrationToggle = document.getElementById('enforcement-toggle-input');
    const migrationSection = document.getElementById('enforcement-toggle-section');
    if (migrationSection && migrationToggle) {
        const on = !!migrationToggle.checked;
        migrationSection.classList.toggle('enforcement-on', on);
        migrationSection.classList.toggle('enforcement-off', !on);
    }
    syncGraceSettingVisibility(getEnforcementToggleInputs().some((t) => t.checked));
}

function getEnforcementToggleInputs() {
    return Array.from(document.querySelectorAll('.enforcement-toggle-input'));
}

async function updateAllEnforcementToggleLocks() {
    for (const toggle of getEnforcementToggleInputs()) {
        await updateEnforcementToggleLock(toggle);
    }
}

function syncAllEnforcementToggleInputs(checked) {
    for (const toggle of getEnforcementToggleInputs()) {
        toggle.checked = !!checked;
        syncEnforcementToggleSectionVisual(toggle);
    }
}

let enforcementToggleWired = false;

async function onEnforcementToggleChange(changedToggle) {
    const desired = changedToggle.checked;
    syncAllEnforcementToggleInputs(desired);
    try {
        const saved = await invoke('set_enforcement_enabled', { enabled: desired });
        syncAllEnforcementToggleInputs(saved);
        await updateAllEnforcementToggleLocks();
    } catch (e) {
        console.warn('[enforcement-toggle] set failed:', e);
        syncAllEnforcementToggleInputs(!desired);
        await updateAllEnforcementToggleLocks();
    }
}

export async function wireEnforcementToggle() {
    if (state.isIOS) return;
    const toggles = getEnforcementToggleInputs();
    if (!toggles.length) return;

    let enabled = false;
    try {
        enabled = !!(await invoke('get_enforcement_enabled'));
    } catch (e) {
        console.warn('[enforcement-toggle] read failed:', e);
    }

    syncAllEnforcementToggleInputs(enabled);
    await updateAllEnforcementToggleLocks();

    if (!enforcementToggleWired) {
        enforcementToggleWired = true;
        for (const toggle of toggles) {
            toggle.addEventListener('change', () => { void onEnforcementToggleChange(toggle); });
        }
    }
}

let blockingMethodSettingsWired = false;
let lastSettingsBlockingMethodBrowsers = null;

function syncBlockingMethodRowVisibility(browsers = {}) {
    if (!state.isMacOSDesktop) return;
    lastSettingsBlockingMethodBrowsers = browsers;
    const installed = new Set(installedMacBlockingMethodKeys(browsers));
    for (const key of MAC_BLOCKING_METHOD_KEYS) {
        const select = document.getElementById(`blocking-method-${key}`);
        const row = select?.closest('.settings-row');
        if (row) row.classList.toggle('hidden', !installed.has(key));
    }
    const section = document.getElementById('settings-blocking-method-section');
    if (section) section.classList.toggle('hidden', installed.size === 0);
}

function syncBlockingMethodLabelIcons() {
    for (const key of MAC_BLOCKING_METHOD_KEYS) {
        const icon = document.getElementById(`settings-blocking-method-${key}-icon`);
        if (icon) icon.src = browserIconUrl(key);
    }
}

function syncBlockingMethodSelects(methods = getBlockingMethodsMap()) {
    for (const key of MAC_BLOCKING_METHOD_KEYS) {
        const select = document.getElementById(`blocking-method-${key}`);
        if (!select) continue;
        const value = methods[key] || 'automation';
        select.value = value;
        select.disabled = false;
    }
}

export async function wireBlockingMethodSettings() {
    if (!state.isMacOSDesktop) return;

    let browsers = lastOnboardingState?.browsers || lastMigrationBrowserState?.browsers || {};
    try {
        const fresh = await invoke('onboarding_state');
        if (fresh?.browsers) browsers = fresh.browsers;
    } catch (e) {
        console.warn('[blocking-method] browser scan failed:', e);
    }
    syncBlockingMethodRowVisibility(browsers);

    let methods = getBlockingMethodsMap();
    try {
        methods = await tauriAPI.getBlockingMethods();
        if (!state.appData.settings) state.appData.settings = {};
        state.appData.settings.blockingMethods = methods;
    } catch (e) {
        console.warn('[blocking-method] read failed:', e);
    }
    syncBlockingMethodSelects(methods);
    syncBlockingMethodLabelIcons();

    if (!blockingMethodSettingsWired) {
        blockingMethodSettingsWired = true;
        for (const key of MAC_BLOCKING_METHOD_KEYS) {
            const select = document.getElementById(`blocking-method-${key}`);
            if (!select) continue;
            select.addEventListener('change', () => {
                void onBlockingMethodChange(key, select);
            });
        }
        const safariFdaBtn = document.getElementById('settings-safari-fda-grant-btn');
        if (safariFdaBtn && !safariFdaBtn._safariFdaWired) {
            safariFdaBtn._safariFdaWired = true;
            safariFdaBtn.addEventListener('click', () => {
                void (async () => {
                    try {
                        await invoke('open_safari_fda_settings');
                    } catch (e) {
                        console.warn('[safari-fda] open settings failed:', e);
                    }
                    await pollSafariFdaUntilGranted({ refreshSettings: true });
                })();
            });
        }
    }
    syncSafariFdaSettingsRow();
}

function safariUsesExtensionMode() {
    return state.isMacOSDesktop && browserBlockingMethod('safari') === 'extension';
}

let activeSafariFdaOnboardingSession = null;

function hideSafariFdaOnboardingUi() {
    const session = activeSafariFdaOnboardingSession;
    if (!session) return;
    session.overlay?.classList.add('hidden');
    if (session.pollHandle) {
        clearInterval(session.pollHandle);
        session.pollHandle = null;
    }
}

async function syncSafariFdaOnboardingGrantButton() {
    const grantBtn = document.getElementById('fda-onboarding-grant-btn');
    const whyEl = document.getElementById('fda-onboarding-why');
    if (!grantBtn) return false;
    let granted = false;
    try {
        granted = !!(await invoke('sync_safari_fda_access'));
    } catch (_) { /* not granted */ }
    grantBtn.textContent = granted
        ? tSettings('safariFdaOnboardingAlreadyGrantedBtn')
        : tSettings('safariFdaOnboardingGrantBtn');
    if (whyEl) {
        whyEl.innerHTML = granted
            ? tSettings('safariFdaOnboardingAlreadyGrantedWhy')
            : tSettings('safariFdaOnboardingWhyHtml');
    }
    if (activeSafariFdaOnboardingSession) {
        activeSafariFdaOnboardingSession.fdaLiveGranted = granted;
    }
    return granted;
}

async function finalizeSafariFdaOnboardingGrant(statusEl) {
    if (statusEl) {
        statusEl.classList.remove('hidden');
        statusEl.textContent = tSettings('safariFdaOnboardingGrantedStatus');
    }
    try {
        await invoke('complete_safari_fda_onboarding');
    } catch (e) {
        console.warn('[safari-fda] complete failed:', e);
        return false;
    }
    hideSafariFdaOnboardingUi();
    const resolve = activeSafariFdaOnboardingSession?.resolve;
    activeSafariFdaOnboardingSession = null;
    resolve?.();
    return true;
}

function showSafariFdaOnboardingOverlay() {
    if (!safariUsesExtensionMode()) {
        return Promise.resolve();
    }
    if (activeSafariFdaOnboardingSession) {
        void presentSafariFdaOnboardingUi();
        return activeSafariFdaOnboardingSession.promise;
    }
    let session;
    const promise = new Promise((resolve) => {
        const overlay = document.getElementById('fda-onboarding');
        const grantBtn = document.getElementById('fda-onboarding-grant-btn');
        const statusEl = document.getElementById('fda-onboarding-status');
        if (!overlay || !grantBtn) {
            resolve();
            return;
        }
        applySafariFdaOnboardingLanguage();

        const onGrant = async () => {
            let alreadyGranted = false;
            try {
                alreadyGranted = !!(await invoke('sync_safari_fda_access'));
            } catch (_) { /* fall through */ }
            if (alreadyGranted) {
                await finalizeSafariFdaOnboardingGrant(statusEl);
                return;
            }
            grantBtn.disabled = true;
            const originalLabel = grantBtn.textContent;
            grantBtn.textContent = tSettings('safariFdaOnboardingOpeningSettings');
            try {
                await invoke('open_safari_fda_settings');
            } catch (e) {
                console.warn('[safari-fda] open settings failed:', e);
            }
            grantBtn.textContent = originalLabel;
            grantBtn.disabled = false;
            if (statusEl) {
                statusEl.classList.remove('hidden');
                statusEl.textContent = tSettings('safariFdaOnboardingWaiting');
            }
            if (!session.pollHandle) {
                session.pollHandle = setInterval(async () => {
                    try {
                        const granted = await invoke('sync_safari_fda_access');
                        session.fdaLiveGranted = granted;
                        if (granted) {
                            await finalizeSafariFdaOnboardingGrant(statusEl);
                        }
                    } catch (_) { /* transient */ }
                }, 1500);
            }
        };

        session = {
            overlay,
            grantBtn,
            statusEl,
            pollHandle: null,
            resolve,
            onGrant,
        };
        activeSafariFdaOnboardingSession = session;
        if (!grantBtn._safariFdaGrantListenerAdded) {
            grantBtn._safariFdaGrantListenerAdded = true;
            grantBtn.addEventListener('click', () => {
                void session.onGrant?.();
            });
        }
        const backBtn = document.getElementById('fda-onboarding-back-btn');
        if (backBtn && !backBtn._safariFdaBackWired) {
            backBtn._safariFdaBackWired = true;
            backBtn.addEventListener('click', () => {
                hideSafariFdaOnboardingUi();
                const r = activeSafariFdaOnboardingSession?.resolve;
                activeSafariFdaOnboardingSession = null;
                r?.();
            });
        }
        void presentSafariFdaOnboardingUi();
    });
    if (session) session.promise = promise;
    return promise;
}

async function presentSafariFdaOnboardingUi() {
    const session = activeSafariFdaOnboardingSession;
    if (!session) return;
    document.getElementById('settings-modal')?.classList.add('hidden');
    setLanguagePickerOpen(false);
    showExclusiveOnboardingScreen('fda-onboarding');
    document.getElementById('main-content')?.classList.add('hidden');
    document.getElementById('now-blocking-row')?.classList.add('hidden');
    const statusEl = document.getElementById('fda-onboarding-status');
    if (statusEl && !session.pollHandle) {
        statusEl.classList.add('hidden');
        statusEl.textContent = '';
    }
    await syncSafariFdaOnboardingGrantButton();
}

async function pollSafariFdaUntilGranted({ refreshSettings = false } = {}) {
    for (let i = 0; i < 40; i++) {
        let granted = false;
        try {
            granted = !!(await invoke('sync_safari_fda_access'));
        } catch (_) { /* retry */ }
        if (granted) {
            try {
                await invoke('complete_safari_fda_onboarding');
            } catch (e) {
                console.warn('[safari-fda] complete failed:', e);
            }
            if (refreshSettings) syncSafariFdaSettingsRow();
            if (migrationOnboardingActive || isModalVisible('migration-onboarding')) {
                const fresh = await invoke('onboarding_state');
                renderBrowserInstallButtons(fresh, { force: true });
            }
            await refreshBehaviourBannerIfStale({ force: true });
            return true;
        }
        await new Promise(r => setTimeout(r, 1500));
    }
    return false;
}

async function ensureSafariExtensionFdaBeforeSetup() {
    if (!safariUsesExtensionMode()) return;
    let granted = false;
    try {
        const probe = await invoke('check_safari_fda_access');
        granted = !!(probe && probe.granted);
    } catch (_) { /* not granted */ }
    if (granted) {
        try {
            await invoke('complete_safari_fda_onboarding');
        } catch (_) { /* marker only */ }
        return;
    }
    await showSafariFdaOnboardingOverlay();
}

async function syncSafariFdaSettingsRow() {
    const row = document.getElementById('settings-safari-fda-row');
    const statusEl = document.getElementById('settings-safari-fda-status');
    const grantBtn = document.getElementById('settings-safari-fda-grant-btn');
    if (!row || !statusEl) return;
    const browsers = lastSettingsBlockingMethodBrowsers
        || lastOnboardingState?.browsers
        || lastMigrationBrowserState?.browsers
        || {};
    if (!safariUsesExtensionMode() || !browsers.safari?.installed) {
        row.classList.add('hidden');
        return;
    }
    row.classList.remove('hidden');
    if (grantBtn) grantBtn.textContent = tSettings('safariFdaSettingsGrantBtn');
    let granted = false;
    try {
        granted = !!(await invoke('sync_safari_fda_access'));
    } catch (_) { /* not granted */ }
    statusEl.textContent = granted
        ? tSettings('safariFdaSettingsGranted')
        : tSettings('safariFdaSettingsNotGranted');
    if (grantBtn) grantBtn.classList.toggle('hidden', granted);
}

async function onBlockingMethodChange(key, select) {
    const previous = browserBlockingMethod(key);
    const desired = select.value === 'extension' ? 'extension' : 'automation';
    select.disabled = true;
    try {
        const methods = await tauriAPI.setBlockingMethod(key, desired);
        if (!state.appData.settings) state.appData.settings = {};
        state.appData.settings.blockingMethods = methods;
        syncBlockingMethodSelects(methods);
        await refreshAutomationPermissionStatus({ force: true });
        if (migrationOnboardingActive || isModalVisible('migration-onboarding')) {
            const fresh = await invoke('onboarding_state');
            renderBrowserInstallButtons(fresh, { force: true });
        }
        if (key === 'safari' && desired === 'automation') {
            hideSafariFdaOnboardingUi();
            syncSafariFdaSettingsRow();
        }
        if (desired === 'extension') {
            if (key === 'safari') {
                await ensureSafariExtensionFdaBeforeSetup();
            }
            let fresh = null;
            try {
                fresh = await invoke('onboarding_state');
            } catch (e) {
                console.warn('[blocking-method] onboarding_state failed:', e);
            }
            const needsSetup = fresh
                && effectiveBrowserComplianceStatus(key, fresh.browsers || {}) !== 'compliant';
            if (needsSetup) {
                document.getElementById('settings-modal')?.classList.add('hidden');
                setLanguagePickerOpen(false);
                await openExtensionSetupOverlay();
            } else if (fresh) {
                await updateBehaviourChangeBanner(fresh);
            }
            if (key === 'safari') syncSafariFdaSettingsRow();
        } else if (key === 'safari') {
            syncSafariFdaSettingsRow();
        }
    } catch (e) {
        console.warn('[blocking-method] set failed:', e);
        select.value = previous;
        await ask(
            String(e?.message || e || 'Could not change blocking method.'),
            { title: 'Blocking method', kind: 'error' },
        );
    } finally {
        select.disabled = false;
    }
}

async function updateEnforcementToggleLock(toggle) {
    if (!toggle) return;
    try {
        // Try a no-op read to check current state; the real lock check
        // is whether turning OFF would be rejected. We approximate by
        // checking if enforcement is ON and the backend would reject
        // disabling it. Simplest: try a dry-run disable, catch the
        // error. But that's ugly — instead, check if any block is
        // active by reading from the data file the same way the
        // backend does. For simplicity, we just check if the toggle
        // is ON and read the active-block state via the data.
        const data = await invoke('load_data');
        const activeBlocks = (data && data.activeBlocks) || [];
        const schedules = (data && data.schedules) || [];
        const nowMs = Date.now();
        const nowDate = new Date(nowMs);
        const anyActive = activeBlocks.some(b => {
            const start = b.startTime || Infinity;
            const end = b.endTime;
            const paused = b.isPaused || false;
            const isAlways = end === null || end === undefined;
            return start <= nowMs && (isAlways || end > nowMs) && !paused;
        }) || schedules.some(schedule => isScheduleSegmentActiveNow(schedule, nowDate));

        const isLocked = toggle.checked && anyActive;
        toggle.disabled = isLocked;
        const label = toggle.closest('.enforcement-switch-with-tip');
        const tooltip = label?.querySelector('.enforcement-switch-tooltip');
        if (tooltip) {
            tooltip.textContent = isLocked ? tSettings('settingsEnforcementLockedTooltip') : '';
            tooltip.classList.toggle('hidden', !isLocked);
        }
    } catch (e) {
        // Can't determine lock state — leave unlocked
        toggle.disabled = false;
        const label = toggle.closest('.enforcement-switch-with-tip');
        const tooltip = label?.querySelector('.enforcement-switch-tooltip');
        if (tooltip) {
            tooltip.textContent = '';
            tooltip.classList.add('hidden');
        }
    }
}

// Per-browser metadata: label + extension store URL (Chromium-family
// browsers all use the Chrome Web Store listing).
export const BROWSER_STORE_LINKS = {
    chrome: { label: 'Chrome', url: 'https://chromewebstore.google.com/detail/redd-focus-hide-distracti/hhblkhfdjijdinijakbmcpkmdfhoadcd' },
    brave: { label: 'Brave', url: 'https://chromewebstore.google.com/detail/redd-focus-hide-distracti/hhblkhfdjijdinijakbmcpkmdfhoadcd' },
    edge: { label: 'Edge', url: 'https://microsoftedge.microsoft.com/addons/detail/redd-focus-hide-distract/gmjfgjdhnhcegfelcddbdljdffiaepam' },
    firefox: { label: 'Firefox', url: 'https://addons.mozilla.org/en-US/firefox/addon/reddfocus/' },
    safari: { label: 'Safari', url: 'macappstore://apps.apple.com/app/id1660218371' },
};

// On macOS we block Safari + Chromium browsers via the Automation
// (Apple Events) watcher rather than the browser extension — so for
// these the onboarding "compliance" is about the per-browser Automation
// grant, not whether ReDD Focus is installed/enabled. Firefox stays on
// the extension path. Non-macOS keeps the extension model everywhere.
const AUTOMATION_BROWSER_KEYS = ['chrome', 'brave', 'edge', 'safari'];
export const MAC_BLOCKING_METHOD_KEYS = ['safari', 'chrome', 'edge', 'brave'];
/** @deprecated use MAC_BLOCKING_METHOD_KEYS */
const MAC_CHROMIUM_BLOCKING_KEYS = MAC_BLOCKING_METHOD_KEYS;

function installedMacBlockingMethodKeys(browsers = {}) {
    return MAC_BLOCKING_METHOD_KEYS.filter((key) => browsers[key]?.installed);
}

function getBlockingMethodsMap() {
    return state.appData?.settings?.blockingMethods || {};
}

export function browserBlockingMethod(key) {
    if (!state.isMacOSDesktop || !MAC_BLOCKING_METHOD_KEYS.includes(key)) {
        if (state.isMacOSDesktop && key === 'firefox') return 'extension';
        return 'extension';
    }
    return getBlockingMethodsMap()[key] || 'automation';
}

export function browserUsesAutomation(key) {
    if (!state.isMacOSDesktop) return false;
    if (key === 'firefox') return false;
    if (MAC_BLOCKING_METHOD_KEYS.includes(key)) {
        return browserBlockingMethod(key) === 'automation';
    }
    return false;
}

// key -> 'granted' | 'denied' | 'unknown', refreshed from
// `web_automation_permission_status` (a no-prompt native query). Empty
// until the first refresh; treated as 'unknown' per key.
let lastAutomationPermissionByKey = {};
let lastAutomationRunningByKey = {};
let lastAutomationPermissionFetchAt = 0;
// False until the first successful macOS Automation status fetch; while
// false, automation browsers are treated as compliant so the setup banner
// doesn't flash "Allow Automation…" during startup.
let automationPermissionStatusReady = false;
const AUTOMATION_PERMISSION_FETCH_MIN_MS = 2000;

// Pull the live per-browser Automation decision (no consent prompt) and
// cache it by browser key. Safe to call on any platform — no-ops off
// macOS. Returns the cached map for convenience.
function normalizeLaunchProbeBrowsers(browserKeyOrLabels) {
    if (browserKeyOrLabels == null) return null;
    const list = Array.isArray(browserKeyOrLabels) ? browserKeyOrLabels : [browserKeyOrLabels];
    const keys = list.map((b) => browserKeyFromLabel(b) || b).filter(Boolean);
    return keys.length > 0 ? keys : null;
}

async function refreshAutomationPermissionStatus({
    force = false,
    launchProbe = false,
    launchProbeBrowser = null,
    launchProbeBrowsers = null,
} = {}) {
    if (!state.isMacOSDesktop) return lastAutomationPermissionByKey;
    const now = Date.now();
    if (!force && now - lastAutomationPermissionFetchAt < AUTOMATION_PERMISSION_FETCH_MIN_MS) {
        return lastAutomationPermissionByKey;
    }
    try {
        const probeList = launchProbeBrowsers ?? normalizeLaunchProbeBrowsers(launchProbeBrowser);
        const list = await tauriAPI.webAutomationPermissionStatus({
            launchProbe,
            launchProbeBrowser: probeList ? null : launchProbeBrowser,
            launchProbeBrowsers: probeList,
        });
        lastAutomationPermissionFetchAt = now;
        const map = {};
        const runningMap = {};
        for (const info of (list || [])) {
            const key = browserKeyFromLabel(info.label || info.browser);
            if (key) {
                map[key] = info.state; // 'granted' | 'denied' | 'unknown'
                runningMap[key] = !!info.running;
            }
        }
        lastAutomationPermissionByKey = map;
        lastAutomationRunningByKey = runningMap;
        if (state.isMacOSDesktop) automationPermissionStatusReady = true;
    } catch (e) {
        console.warn('[automation] permission status fetch failed:', e);
    }
    return lastAutomationPermissionByKey;
}

// Unified onboarding compliance status that knows about the macOS
// Automation model. For Automation browsers, mirrors
// `automationBrowserRowMode`: only flag when the browser is running
// and we know access is missing — closed browsers with unknown status
// stay compliant so the setup banner doesn't nag prematurely. Falls
// back to the extension compliance for Firefox / non-macOS.
function automationBrowserIsRunning(key, browserScan) {
    if (automationPermissionStatusReady && Object.prototype.hasOwnProperty.call(lastAutomationRunningByKey, key)) {
        return !!lastAutomationRunningByKey[key];
    }
    return !!browserScan?.present;
}

function effectiveBrowserComplianceStatus(key, browsers) {
    if (browserUsesAutomation(key)) {
        const browserScan = (browsers || {})[key];
        if (!automationPermissionStatusReady) {
            // Before the first permission fetch, still surface a running
            // browser the onboarding scan sees — avoids hiding the setup
            // banner when Chrome is open but the Automation cache is cold.
            if (browserScan?.present) return 'needs-automation';
            return 'compliant';
        }
        const mode = automationBrowserRowMode(key, browserScan);
        if (mode === 'granted' || mode === 'awaiting-open') return 'compliant';
        return 'needs-automation';
    }
    return browserComplianceStatus(key, (browsers || {})[key]) || 'needs-install';
}

// Compute per-step status for the migration UI:
//   - 'compliant': extension installed, enabled, allowed in private, allowed on all websites
//   - 'needs-deduplicate': Safari has both bundled + standalone ReDD Focus
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
        if (b.duplicateExtensions?.detected) return 'needs-deduplicate';
        if (b.needsFdaAccess || profiles.some(p => /Full Disk Access/i.test(p.note || ''))) {
            return 'needs-fda';
        }
        if (!profiles.length || profiles.some(p => !p.installed)) return 'needs-install';
        if (profiles.some(p => p.enabled !== true)) return 'needs-enable';
        if (profiles.some(p => p.privateBrowsing === false)) return 'needs-private';
        if (profiles.some(p => p.websiteAccessAll === false)) return 'needs-website-access';
        return 'compliant';
    }
    if (!def || !def.installed) return 'needs-install';
    const enabled = def.enabled;
    if (enabled === false) return 'needs-enable';
    const priv = def.privateBrowsing;
    if (priv !== true) return 'needs-private';
    if (key === 'firefox' && state.isMacOSDesktop && b.nativeHostReady === false) {
        return 'needs-native-host';
    }
    return 'compliant';
}

function statusLabel(key, status) {
    switch (status) {
        case 'compliant': return tSettings('migrationComplianceOk');
        case 'needs-deduplicate': return tSettings('migrationStatusDuplicateSafari');
        case 'needs-fda': return tSettings('migrationStatusGrantFda');
        case 'needs-website-access': return tSettings('migrationStatusAllowAllWebsites');
        case 'needs-private': return tSettings('migrationStatusAllowPrivate');
        case 'needs-enable': return tSettings('migrationStatusEnableExtension');
        case 'needs-native-host': return tSettings('migrationStatusNativeHost');
        case 'needs-install': return tSettings('migrationStatusInstall');
        default: return tSettings('migrationStatusInstall');
    }
}

function safariProfileLabel(profile) {
    const name = String(profile && profile.name ? profile.name : '').trim();
    const legacyDefault = SETTINGS_TRANSLATIONS.en.migrationSafariProfileDefaultName;
    if (!name || name === legacyDefault || name === '(Default Safari profile)') {
        return tSettings('migrationSafariProfileDefaultName');
    }
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
            default: return false;
        }
    });
    if (!failing.length) return null;

    const labels = failing.slice(0, 3).map(safariProfileLabel);
    const more = failing.length > labels.length
        ? tSettingsFmt('migrationSafariProfilesMore', { n: failing.length - labels.length })
        : '';
    return `${tSettings('migrationSafariProfilesAffected')} ${labels.join(', ')}${more}.`;
}

function extensionsUrl(key) {
    switch (key) {
        case 'chrome': return 'chrome://extensions';
        case 'edge': return 'edge://extensions';
        case 'brave': return 'brave://extensions';
        case 'firefox': return 'about:addons';
        case 'safari': return tSettings('migrationSafariSettingsPath');
        default: return 'extensions';
    }
}

function isCopyableExtensionsTarget(key) {
    return key !== 'safari';
}

// Renders an inline URL chip with a small copy-to-clipboard icon.
// Clicking the chip copies the URL so the user can paste it into
// the browser's address bar.
const COPY_ICON_SVG = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;margin-left:4px;opacity:0.7"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';

export function extensionsUrlChipHtml(key) {
    const url = extensionsUrl(key);
    if (!isCopyableExtensionsTarget(key)) {
        return `<span class="migration-inline-url-btn migration-copy-chip-static">${url}</span>`;
    }
    return `<button type="button" class="migration-inline-url-btn migration-copy-chip" data-copy-url="${url}">${url}${COPY_ICON_SVG}</button>`;
}

// Attach clipboard copy behaviour to any .migration-copy-chip inside
// the given root element.
export function attachCopyChipHandlers(root) {
    root.querySelectorAll('.migration-copy-chip').forEach(btn => {
        btn.addEventListener('click', async () => {
            const url = btn.dataset.copyUrl;
            try {
                await navigator.clipboard.writeText(url);
                btn.classList.add('copied');
                const orig = btn.innerHTML;
                btn.innerHTML = tSettings('migrationCopied');
                setTimeout(() => { btn.innerHTML = orig; btn.classList.remove('copied'); }, 1500);
            } catch (e) {
                console.warn('[migration] clipboard copy failed:', e);
            }
        });
    });
}

function privateModeNoun(key) {
    switch (key) {
        case 'chrome': return tSettings('migrationPrivateIncognitoChrome');
        case 'edge': return tSettings('migrationPrivateIncognitoEdge');
        case 'brave': return tSettings('migrationPrivateIncognitoBrave');
        case 'firefox': return tSettings('migrationPrivateIncognitoFirefox');
        case 'safari': return tSettings('migrationPrivateIncognitoSafari');
        default: return tSettings('migrationPrivateIncognito');
    }
}

// Open the user's extension settings for a given browser. For Safari
// we prefer SafariServices' showPreferencesForExtension (via the
// in-process Swift bridge), which deep-links to ReDD Focus in
// Safari → Settings → Extensions. The Rust command retries after
// launching Safari when needed, then falls back to AppleScript for
// dev builds (`cargo tauri dev`) and other cases where SafariServices
// can't find the host extension. AppleScript needs Accessibility
// permission for ReDD Blocker (or your terminal, when running dev).
async function openExtensionSettings(key) {
    if (key === 'safari') {
        try {
            await invoke('open_safari_extension_settings');
            return;
        } catch (e) {
            console.warn('[migration] safari extension settings failed, falling back:', e);
        }
    }
    return invoke('open_browser_extension_settings', { browser: key });
}

function browserStatusHint(key, entry, b, status) {
    const hasMultipleSafariProfiles = key === 'safari' && Array.isArray(b && b.profiles) && b.profiles.length > 1;
    const safariSuffix = key === 'safari'
        ? ` ${safariProfileStatusHint(b, status) || tSettings('migrationSafariCheckEveryProfile')}`
        : '';
    switch (status) {
        case 'needs-enable':
            return key === 'safari'
                ? hasMultipleSafariProfiles
                    ? tSettingsFmt('migrationHintEnableSafariMulti', { SUFFIX: safariSuffix })
                    : tSettings('migrationHintEnableSafariOne')
                : tSettingsFmt('migrationHintEnableBrowser', { BROWSER: entry.label });
        case 'needs-private':
            return key === 'safari'
                ? hasMultipleSafariProfiles
                    ? tSettingsFmt('migrationHintPrivateSafariMulti', { SUFFIX: safariSuffix })
                    : tSettings('migrationHintPrivateSafariOne')
                : tSettingsFmt('migrationHintPrivateBrowser', { BROWSER: entry.label });
        case 'needs-website-access':
            return hasMultipleSafariProfiles
                ? tSettingsFmt('migrationHintWebsitesSafariMulti', { SUFFIX: safariSuffix })
                : tSettings('migrationHintWebsitesSafariOne');
        default:
            return '';
    }
}

function renderSafariDuplicateExtensionPanel(row, key) {
    const panel = document.createElement('div');
    panel.className = 'safari-duplicate-panel';

    const intro = document.createElement('p');
    intro.className = 'safari-duplicate-intro';
    intro.innerHTML = tSettings('migrationSafariDuplicateIntroHtml');
    panel.appendChild(intro);

    const instructions = document.createElement('div');
    instructions.className = 'safari-duplicate-instructions';

    const instructionsHeading = document.createElement('div');
    instructionsHeading.className = 'safari-duplicate-instructions-heading';
    instructionsHeading.textContent = tSettings('migrationSafariDuplicateInstructionsHeading');
    instructions.appendChild(instructionsHeading);

    instructions.appendChild(buildSafariDuplicateInstructionStep(1, 'migrationSafariDuplicateStep1Html'));
    instructions.appendChild(buildSafariDuplicateInstructionStep(2, 'migrationSafariDuplicateStep2Html'));
    panel.appendChild(instructions);

    const actionsRow = document.createElement('div');
    actionsRow.className = 'migration-actions-row safari-duplicate-actions';

    const openBtn = document.createElement('button');
    openBtn.type = 'button';
    openBtn.className = 'migration-primary-btn safari-duplicate-open-btn';
    openBtn.textContent = tSettings('migrationSafariDuplicateOpenBtn');
    openBtn.addEventListener('click', () => {
        openExtensionSettings(key).catch(e => console.warn('[migration] open ext settings:', e));
    });
    actionsRow.appendChild(openBtn);

    const helpToggle = document.createElement('button');
    helpToggle.type = 'button';
    helpToggle.className = 'safari-duplicate-help-toggle';
    if (migrationSafariDuplicateHelpExpanded) helpToggle.classList.add('open');
    helpToggle.setAttribute('aria-expanded', migrationSafariDuplicateHelpExpanded ? 'true' : 'false');
    helpToggle.innerHTML = `<span>${tSettings('migrationSafariDuplicateHelpLink')}</span><svg class="safari-duplicate-help-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="9 6 15 12 9 18"></polyline></svg>`;
    actionsRow.appendChild(helpToggle);

    panel.appendChild(actionsRow);

    const helpWrap = document.createElement('div');
    helpWrap.className = 'safari-duplicate-help-wrap';
    helpWrap.classList.toggle('hidden', !migrationSafariDuplicateHelpExpanded);

    const helpText = document.createElement('p');
    helpText.className = 'safari-duplicate-help-text';
    helpText.textContent = tSettings('migrationSafariDuplicateHelpText');
    helpWrap.appendChild(helpText);
    panel.appendChild(helpWrap);

    helpToggle.addEventListener('click', () => {
        migrationSafariDuplicateHelpExpanded = !migrationSafariDuplicateHelpExpanded;
        helpWrap.classList.toggle('hidden', !migrationSafariDuplicateHelpExpanded);
        helpToggle.classList.toggle('open', migrationSafariDuplicateHelpExpanded);
        helpToggle.setAttribute('aria-expanded', migrationSafariDuplicateHelpExpanded ? 'true' : 'false');
    });

    row.appendChild(panel);
}

function buildSafariDuplicateInstructionStep(stepNum, translationKey, extraClass = '') {
    const step = document.createElement('div');
    step.className = `safari-duplicate-step${extraClass ? ` ${extraClass}` : ''}`;

    const num = document.createElement('span');
    num.className = 'safari-duplicate-step-num';
    num.textContent = String(stepNum);
    num.setAttribute('aria-hidden', 'true');

    const body = document.createElement('div');
    body.className = 'safari-duplicate-step-body';
    body.innerHTML = tSettings(translationKey);

    step.appendChild(num);
    step.appendChild(body);
    return step;
}

// Display order for the extension-setup rows. Safari sits above the
// Chromium browsers; Firefox stays last.
const MIGRATION_BROWSER_ORDER = ['safari', 'chrome', 'brave', 'edge', 'firefox'];

function migrationBrowserKeys(state) {
    const browsers = state?.browsers || {};
    const detectedKeys = MIGRATION_BROWSER_ORDER.filter(k => {
        const b = browsers[k];
        return b && b.installed;
    });
    return detectedKeys.length > 0 ? detectedKeys : ['chrome'];
}

// HTML for the extension-setup header (bold title + lighter subtitle).
// On macOS the path is Automation for Safari/Chromium plus — only when
// Firefox is installed — the ReDD Focus extension in Firefox, so the
// subtitle is built from live state. Other platforms keep the
// extension-everywhere copy.
function migrationExtHeaderCopy(state) {
    if (!appState.isMacOSDesktop) return null;
    const focusLogoHtml =
        `<img src="${logoReddFocusUrl}" alt="" class="welcome-reddfocus-inline-logo" aria-hidden="true"> `;
    const browsers = state?.browsers || lastMigrationBrowserState?.browsers || {};
    const firefoxInstalled = !!(browsers.firefox && browsers.firefox.installed);
    return {
        titleHtml: tSettings('migrationExtTitleMac'),
        subtitleHtml: (firefoxInstalled
            ? tSettings('migrationExtSubMacFirefox')
            : tSettings('migrationExtSubMac')).replace('{FOCUS}', focusLogoHtml),
    };
}

function migrationMacCopyKey(state) {
    const browsers = state?.browsers || lastMigrationBrowserState?.browsers || {};
    const firefoxInstalled = !!(browsers.firefox && browsers.firefox.installed);
    return `${getSettingsLanguage()}:${firefoxInstalled ? 1 : 0}`;
}

function invalidateMigrationMacCopyCache() {
    lastMigrationHeaderCopyKey = '';
    lastMigrationHowtoCopyKey = '';
}

function syncMigrationMacHowto(state) {
    if (!appState.isMacOSDesktop) return;
    const focusLogoHtml =
        `<img src="${logoReddFocusUrl}" alt="" class="welcome-reddfocus-inline-logo" aria-hidden="true"> `;
    const browsers = state?.browsers || lastMigrationBrowserState?.browsers || {};
    const firefoxInstalled = !!(browsers.firefox && browsers.firefox.installed);
    const li1 = document.getElementById('migration-howto-li1');
    const li2 = document.getElementById('migration-howto-li2');
    const li3 = document.getElementById('migration-howto-li3');
    const copyKey = migrationMacCopyKey(state);
    if (copyKey !== lastMigrationHowtoCopyKey) {
        if (li1) li1.innerHTML = tSettings('migrationExtStep1Mac');
        if (li2) {
            li2.innerHTML = tSettings('migrationExtStep2MacFirefox').replace('{FOCUS}', focusLogoHtml);
        }
        lastMigrationHowtoCopyKey = copyKey;
    }
    if (li2) li2.classList.toggle('hidden', !firefoxInstalled);
    if (li3) li3.classList.add('hidden');
}

function isMigrationFreshPostPhase() {
    return !!document.getElementById('migration-post-title-row')?.classList.contains('hidden');
}

function migrationSetupAllCompliant(state) {
    const browsers = state?.browsers || {};
    const keys = migrationBrowserKeys(state);
    if (keys.length === 0) return false;
    return keys.every(k => effectiveBrowserComplianceStatus(k, browsers) === 'compliant');
}

function isMacFreshMigrationPost() {
    return state.isMacOSDesktop && isMigrationFreshPostPhase();
}

function syncMigrationPostHeader(state) {
    const header = document.getElementById('migration-post-header');
    const checklist = document.getElementById('migration-checklist');
    const readyBanner = document.getElementById('migration-setup-ready-banner');
    const readyText = document.getElementById('migration-setup-ready-banner-text');
    if (!header) return;

    const freshPost = isMigrationFreshPostPhase();
    const allReady = migrationSetupAllCompliant(state);
    const showReadyBanner = freshPost && allReady;

    if (readyBanner) {
        readyBanner.classList.toggle('hidden', !showReadyBanner);
        if (showReadyBanner && readyText) {
            readyText.innerHTML = tSettings('migrationSetupAllReady');
        }
    }

    const skipBtn = document.getElementById('migration-skip-btn');
    if (skipBtn) skipBtn.classList.toggle('hidden', allReady);

    if (!isMacFreshMigrationPost()) {
        header.classList.add('hidden');
        checklist?.classList.remove('hidden');
        return;
    }

    header.classList.remove('hidden');
    const copy = migrationExtHeaderCopy(state);
    if (copy) {
        const shieldLogo = document.getElementById('migration-post-header-shield-logo');
        const titleEl = document.getElementById('migration-post-header-title');
        const subEl = document.getElementById('migration-post-header-subtitle');
        const copyKey = migrationMacCopyKey(state);
        if (copyKey !== lastMigrationHeaderCopyKey) {
            if (shieldLogo) shieldLogo.src = logoReddShieldUrl;
            if (titleEl) titleEl.textContent = copy.titleHtml;
            if (subEl) subEl.innerHTML = copy.subtitleHtml;
            lastMigrationHeaderCopyKey = copyKey;
        }
    }
    checklist?.classList.add('hidden');
}

function migrationExtLinesHtml(state) {
    const focusLogoHtml =
        `<img src="${logoReddFocusUrl}" alt="" class="welcome-reddfocus-inline-logo" aria-hidden="true"> `;
    if (appState.isMacOSDesktop) {
        if (isMacFreshMigrationPost()) {
            return '';
        }
        const copy = migrationExtHeaderCopy(state);
        if (copy) {
            return `<span style="font-weight:400;font-size:1.25em">${copy.titleHtml}</span><br>${copy.subtitleHtml}`;
        }
    }
    return tSettings('migrationChecklistExtLinesHtml').replace('{LOGO}', focusLogoHtml);
}

// After the user grants/opens settings, nudge a couple of quick
// re-checks so the row flips to "Allowed" without waiting for the next
// regular poll tick. Pass `launchProbe: true` only here (and other
// explicit post-settings actions) — never on background banner polls,
// or we'd relaunch browsers the enforcer just closed.
function schedulePostGrantPoll() {
    setTimeout(() => pollMigrationCompliance({ launchProbe: true }), 1200);
    setTimeout(() => pollMigrationCompliance({ launchProbe: true }), 3500);
}

function scheduleAutomationVerificationPoll(browserKeyOrLabels = null) {
    const probeTargets = normalizeLaunchProbeBrowsers(browserKeyOrLabels);
    const verify = async () => {
        await refreshAutomationPermissionStatus({
            force: true,
            launchProbe: false,
            launchProbeBrowsers: probeTargets,
        });
        try {
            const fresh = await invoke('onboarding_state');
            lastOnboardingState = fresh;
            await updateBehaviourChangeBanner(fresh);
            await syncEnforcerClosedBannersWithCompliance(fresh);
        } catch (_) { /* no-op */ }
    };
    setTimeout(verify, 1200);
    setTimeout(verify, 3500);
}

// Build an onboarding row for a macOS Automation-blocked browser
// (Safari / Chromium). States:
//   granted           -> green "Allowed" badge (only when last live check
//                        was granted — may stay while the browser is closed)
//   awaiting-open     -> grey row: browser not running and we cannot confirm
//                        a grant (unknown / denied / never probed)
//   needs-grant       -> browser open, not granted yet: "Grant access" prompt
//   denied            -> browser open, revoked: deep-link to System Settings
function automationBrowserRowMode(key, browserScan) {
    const perm = lastAutomationPermissionByKey[key] || 'unknown';
    const running = automationBrowserIsRunning(key, browserScan);
    if (perm === 'granted') return 'granted';
    if (!running) return 'awaiting-open';
    if (perm === 'denied') return 'denied';
    return 'needs-grant';
}

function buildAutomationBrowserRow(key, entry, browserScan) {
    const mode = automationBrowserRowMode(key, browserScan);
    const granted = mode === 'granted';
    const denied = mode === 'denied';
    const awaitingOpen = mode === 'awaiting-open';
    const status = granted ? 'compliant' : (awaitingOpen ? 'automation-awaiting-open' : 'needs-enable');

    const row = document.createElement('div');
    row.className = `migration-browser-row ${status}`;

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
    badge.textContent = granted
        ? tSettings('migrationBadgeAutomationOn')
        : (awaitingOpen
            ? tSettings('migrationBadgeAutomationUnknown')
            : tSettings('migrationBadgeAutomationOff'));
    header.appendChild(badge);
    row.appendChild(header);

    if (granted) return row;

    const hint = document.createElement('div');
    hint.className = 'migration-browser-hint';
    hint.textContent = awaitingOpen
        ? tSettingsFmt('migrationAutomationAwaitingOpenHint', { browser: entry.label })
        : (denied
            ? tSettingsFmt('migrationAutomationDeniedHint', { browser: entry.label })
            : tSettingsFmt('migrationAutomationGrantHint', { browser: entry.label }));
    row.appendChild(hint);

    if (awaitingOpen) {
        const delayNote = document.createElement('div');
        delayNote.className = 'migration-browser-hint migration-delay-note';
        delayNote.textContent = tSettings('migrationDelayDetectionNote');
        row.appendChild(delayNote);
        return row;
    }

    const actionsRow = document.createElement('div');
    actionsRow.className = 'migration-actions-row';

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'migration-primary-btn';
    const restore = (label) => setTimeout(() => { btn.textContent = label; }, 1800);

    if (denied) {
        const label = tSettings('migrationOpenAutomationSettings');
        btn.textContent = label;
        btn.addEventListener('click', async () => {
            try {
                await tauriAPI.openAutomationSettings();
                btn.textContent = tSettings('migrationOpened');
            } catch (e) {
                console.warn('[automation] open settings failed:', e);
                btn.textContent = tSettings('migrationFailed');
            }
            restore(label);
            schedulePostGrantPoll();
        });
    } else {
        const label = tSettingsFmt('migrationGrantAutomation', { browser: entry.label });
        btn.textContent = label;
        btn.addEventListener('click', async () => {
            try {
                // Launches the browser and surfaces the system Automation
                // prompt for it. If the prompt can't appear (already
                // answered once), fall back to the Settings deep-link.
                await tauriAPI.requestAutomationPermission(entry.label);
                btn.textContent = tSettings('migrationGrantAutomationOpened');
            } catch (e) {
                console.warn('[automation] request permission failed, opening settings:', e);
                try { await tauriAPI.openAutomationSettings(); } catch (_) { /* no-op */ }
                btn.textContent = tSettings('migrationGrantAutomationOpened');
            }
            restore(label);
            schedulePostGrantPoll();
        });
    }
    actionsRow.appendChild(btn);

    const steps = automationScreenshotSteps();
    if (steps.length) {
        const showMeBtn = document.createElement('button');
        showMeBtn.type = 'button';
        showMeBtn.className = 'migration-show-me-btn';
        showMeBtn.setAttribute('aria-expanded', 'false');
        showMeBtn.innerHTML = `<span>${tSettings('migrationShowMeHow')}</span><svg class="migration-show-me-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="9 6 15 12 9 18"></polyline></svg>`;
        actionsRow.appendChild(showMeBtn);

        const delayNote = document.createElement('div');
        delayNote.className = 'migration-browser-hint migration-delay-note';
        delayNote.textContent = tSettings('migrationDelayDetectionNote');
        row.appendChild(actionsRow);
        row.appendChild(delayNote);

        const expandKey = `${key}-automation`;
        const screenshotsWrap = document.createElement('div');
        screenshotsWrap.className = 'migration-screenshots-wrap hidden';

        const screenshotsContainer = document.createElement('div');
        screenshotsContainer.className = 'extension-enforcer-screenshots screenshots-row';

        steps.forEach((step, i) => {
            const figure = document.createElement('figure');
            figure.className = 'extension-enforcer-step';
            const cap = formatExtensionScreenshotCaption(step, i);
            if (cap) {
                const caption = document.createElement('figcaption');
                caption.className = 'extension-enforcer-step-label';
                caption.textContent = cap;
                figure.appendChild(caption);
            }
            const img = document.createElement('img');
            img.className = 'extension-enforcer-screenshot';
            img.src = step.src;
            img.alt = screenshotAltText(step, i, cap);
            figure.appendChild(img);
            screenshotsContainer.appendChild(figure);
        });

        applyScreenshotContainerLayout(screenshotsContainer, steps);

        screenshotsWrap.appendChild(screenshotsContainer);
        row.appendChild(screenshotsWrap);

        showMeBtn.addEventListener('click', () => {
            const isOpen = showMeBtn.classList.toggle('open');
            screenshotsWrap.classList.toggle('hidden', !isOpen);
            showMeBtn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
            if (isOpen) migrationShowMeHowExpandedKeys.add(expandKey);
            else migrationShowMeHowExpandedKeys.delete(expandKey);
        });

        if (migrationShowMeHowExpandedKeys.has(expandKey)) {
            showMeBtn.classList.add('open');
            screenshotsWrap.classList.remove('hidden');
            showMeBtn.setAttribute('aria-expanded', 'true');
        }
    } else {
        row.appendChild(actionsRow);
    }

    return row;
}

function migrationBrowserRenderSignature(state) {
    const browsers = state?.browsers || {};
    return migrationBrowserKeys(state).map(k => {
        if (browserUsesAutomation(k)) {
            const present = browsers[k]?.present ? 1 : 0;
            return `${k}:auto:${lastAutomationPermissionByKey[k] || 'unknown'}:${present}`;
        }
        const b = browsers[k];
        const status = browserComplianceStatus(k, b) || 'needs-install';
        if (k === 'firefox') {
            return `${k}:${status}:${b?.nativeHostReady ? 1 : 0}`;
        }
        if (k === 'safari' && b?.profiles?.length) {
            const profileSig = b.profiles.map(p =>
                `${p.installed ? 1 : 0}${p.enabled === true ? 1 : p.enabled === false ? 0 : '?'}${p.privateBrowsing === true ? 1 : p.privateBrowsing === false ? 0 : '?'}${p.websiteAccessAll === true ? 1 : p.websiteAccessAll === false ? 0 : '?'}`
            ).join(';');
            return `${k}:${status}:${b.needsFdaAccess ? 'fda' : ''}:${b.duplicateExtensions?.detected ? 'dup' : ''}:${profileSig}`;
        }
        return `${k}:${status}`;
    }).join('|');
}

function updateMigrationBrowserChecklist(state) {
    const checklistItem = document.getElementById('migration-checklist-ext');
    const browsers = state?.browsers || {};
    const keys = migrationBrowserKeys(state);

    const howto = document.getElementById('migration-howto');
    const anyMissing = keys.some(k => effectiveBrowserComplianceStatus(k, browsers) !== 'compliant');
    const showHowto = anyMissing;
    if (howto) howto.classList.toggle('hidden', !showHowto);

    if (!checklistItem) return;
    const allCompliant = keys.length > 0
        && keys.every(k => effectiveBrowserComplianceStatus(k, browsers) === 'compliant');
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

function renderBrowserInstallButtons(state, { force = false } = {}) {
    lastMigrationBrowserState = state;
    void applyEnforcementDescCopy(state);
    // Keep the header subtitle in sync with the live scan (the macOS
    // copy depends on whether Firefox is installed).
    syncMigrationPostHeader(state);
    if (appState.isMacOSDesktop) syncMigrationMacHowto(state);
    const extLines = document.getElementById('migration-checklist-ext-lines');
    if (extLines) extLines.innerHTML = migrationExtLinesHtml(state);
    const sig = migrationBrowserRenderSignature(state);
    if (!force && sig === lastMigrationBrowserRenderSignature) {
        updateMigrationBrowserChecklist(state);
        return;
    }
    lastMigrationBrowserRenderSignature = sig;

    const container = document.getElementById('migration-browser-buttons');
    if (!container) return;
    container.innerHTML = '';

    const browsers = state && state.browsers ? state.browsers : {};

    // Show every browser we detect on disk (regardless of running
    // state). During migration the user may need to install the
    // extension in browsers they haven't opened yet — only filtering
    // to running browsers (as the in-session compliance banner does)
    // would hide those.
    const keys = migrationBrowserKeys(state);

    for (const key of keys) {
        const entry = BROWSER_STORE_LINKS[key];
        if (!entry) continue;

        // macOS: Safari + Chromium block via Automation, not the
        // extension — render a permission-grant row instead.
        if (browserUsesAutomation(key)) {
            container.appendChild(buildAutomationBrowserRow(key, entry, browsers[key]));
            continue;
        }

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
            case 'needs-deduplicate': badge.textContent = tSettings('migrationBadgeDuplicateSafari'); break;
            case 'needs-install': badge.textContent = tSettings('migrationBadgeNotInstalled'); break;
            case 'needs-enable': badge.textContent = tSettings('migrationBadgeDisabled'); break;
            case 'needs-private': badge.textContent = tSettings('migrationBadgeNotPrivate'); break;
            case 'needs-native-host': badge.textContent = tSettings('migrationBadgeNativeHost'); break;
            case 'needs-fda': badge.textContent = tSettings('migrationStatusGrantFda'); break;
            case 'needs-website-access': badge.textContent = tSettings('migrationBadgeNoWebsiteAccess'); break;
            default: badge.textContent = tSettings('migrationBadgeNotInstalled');
        }
        header.appendChild(badge);

        row.appendChild(header);

        if (status === 'needs-fda') {
            const hint = document.createElement('div');
            hint.className = 'migration-browser-hint migration-browser-after-hint';
            hint.innerHTML = tSettings('safariFdaSetupHintHtml');
            row.appendChild(hint);
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'migration-primary-btn';
            btn.textContent = tSettings('safariFdaOnboardingGrantBtn');
            btn.addEventListener('click', () => {
                void showSafariFdaOnboardingOverlay().then(async () => {
                    const fresh = await invoke('onboarding_state');
                    renderBrowserInstallButtons(fresh, { force: true });
                    await updateBehaviourChangeBanner(fresh);
                });
            });
            const actionsRow = document.createElement('div');
            actionsRow.className = 'migration-actions-row';
            actionsRow.appendChild(btn);
            row.appendChild(actionsRow);
        } else if (status === 'needs-install') {
            // Instruction hint first, then Install button below (matching
            // the needs-enable/private layout where instruction precedes action).
            const afterHint = document.createElement('div');
            afterHint.className = 'migration-browser-hint migration-browser-after-hint';
            const privNoun = privateModeNoun(key);
            if (key === 'firefox') {
                afterHint.innerHTML = appState.isMacOSDesktop
                    ? tSettings('migrationPostInstallFirefoxMacHtml')
                    : tSettings('migrationPostInstallFirefoxHtml');
            } else if (key === 'safari') {
                afterHint.innerHTML = tSettings('migrationPostInstallSafariHtml');
            } else if (appState.isMacOSDesktop) {
                const tpl = tSettings('migrationPostInstallChromiumMacHtml');
                afterHint.innerHTML = tpl
                    .replace('{URL_CHIP}', extensionsUrlChipHtml(key))
                    .replace(/{BROWSER}/g, entry.label)
                    .replace(/{PRIV}/g, privNoun);
                attachCopyChipHandlers(afterHint);
            } else {
                const tpl = tSettings('migrationPostInstallChromiumHtml');
                afterHint.innerHTML = tpl
                    .replace('{URL_CHIP}', extensionsUrlChipHtml(key))
                    .replace(/{BROWSER}/g, entry.label)
                    .replace(/{PRIV}/g, privNoun);
                attachCopyChipHandlers(afterHint);
            }
            row.appendChild(afterHint);

            const installBtn = document.createElement('button');
            installBtn.type = 'button';
            installBtn.className = 'migration-browser-copy';
            installBtn.textContent = tSettings('migrationInstallButton');
            installBtn.title = tSettingsFmt('migrationInstallStoreTitle', { browser: entry.label });
            installBtn.addEventListener('click', async () => {
                try {
                    await invoke('open_url_in_browser', { browser: key, url: entry.url });
                    installBtn.textContent = tSettings('migrationInstallOpened');
                    setTimeout(() => { installBtn.textContent = tSettings('migrationInstallButton'); }, 2000);
                } catch (e) {
                    console.warn('[migration] open_url_in_browser failed, falling back to clipboard:', e);
                    try {
                        await navigator.clipboard.writeText(entry.url);
                        installBtn.textContent = tSettings('migrationUrlCopied');
                        setTimeout(() => { installBtn.textContent = tSettings('migrationInstallButton'); }, 2000);
                    } catch (e2) {
                        installBtn.textContent = tSettings('migrationFailed');
                        setTimeout(() => { installBtn.textContent = tSettings('migrationInstallButton'); }, 2000);
                    }
                }
            });

            const actionsRow = document.createElement('div');
            actionsRow.className = 'migration-actions-row';
            actionsRow.appendChild(installBtn);
            row.appendChild(actionsRow);
        } else if (status === 'needs-deduplicate') {
            renderSafariDuplicateExtensionPanel(row, key);
        } else if (status === 'needs-native-host') {
            const hint = document.createElement('div');
            hint.className = 'migration-browser-hint migration-browser-after-hint';
            hint.innerHTML = tSettings('migrationFirefoxNativeHostHtml');
            row.appendChild(hint);
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'migration-browser-copy';
            btn.textContent = tSettings('migrationFirefoxNativeHostButton');
            btn.addEventListener('click', async () => {
                try {
                    await invoke('ensure_firefox_native_host');
                    const fresh = await invoke('onboarding_state');
                    renderBrowserInstallButtons(fresh, { force: true });
                    await updateBehaviourChangeBanner(fresh);
                } catch (e) {
                    console.warn('[firefox] ensure_firefox_native_host failed:', e);
                }
            });
            const actionsRow = document.createElement('div');
            actionsRow.className = 'migration-actions-row';
            actionsRow.appendChild(btn);
            row.appendChild(actionsRow);
        } else if (status === 'needs-enable' || status === 'needs-private' || status === 'needs-website-access') {
            // Mirror the notification-banner layout for clarity:
            // [optional ✓ Extension installed]
            // instruction text (single line for Chromium / Firefox,
            //   three-step checklist for Safari)
            // [Open Extension Settings] [Show me how ▶]
            // delay note
            // [screenshots wrap, full-row when expanded]
            const isSafari = key === 'safari';

            // "✓ Extension installed" line. Always show for Safari —
            // we bundle the .appex inside ReDD Blocker.app, so install
            // is structurally guaranteed at this point. For Chromium /
            // Firefox we only show it once we've moved past the
            // install step (status !== 'needs-enable') because there
            // the install + enable are distinct user actions.
            if (isSafari || status !== 'needs-enable') {
                const extInstalledLine = document.createElement('div');
                extInstalledLine.className = 'migration-checklist-line migration-checklist-done';
                extInstalledLine.textContent = `✓ ${tSettings('migrationExtensionInstalledMark')}`;
                row.appendChild(extInstalledLine);
            }

            const privNoun = privateModeNoun(key);
            const steps = enforcerScreenshotSteps(key);
            const hasSteps = steps && steps.length;

            if (isSafari) {
                const safariBrowser = browsers[key];
                const profiles = (safariBrowser && Array.isArray(safariBrowser.profiles)) ? safariBrowser.profiles : [];
                const allEnabled = profiles.length > 0 && profiles.every(p => p.enabled === true);
                const allPrivate = profiles.length > 0 && profiles.every(p => p.privateBrowsing === true);
                const allAllSites = profiles.length > 0 && profiles.every(p => p.websiteAccessAll === true);

                const stepDefs = [
                    { label: tSettings('migrationSafariStepEnable'), done: allEnabled },
                    { label: tSettings('migrationSafariStepPrivate'), done: allPrivate },
                    { label: tSettings('migrationSafariStepEveryWebsite'), done: allAllSites },
                ];
                const activeIdx = stepDefs.findIndex(s => !s.done);

                const checklist = document.createElement('div');
                checklist.className = 'migration-safari-steps';

                stepDefs.forEach((step, i) => {
                    const line = document.createElement('div');
                    let klass = 'migration-checklist-line';
                    const lineLabel = tSettingsFmt('migrationSafariChecklistLine', { n: String(i + 1), label: step.label });
                    if (step.done) {
                        klass += ' migration-checklist-done';
                        line.className = klass;
                        line.textContent = `✓ ${lineLabel}`;
                    } else {
                        let iconHtml;
                        if (i === activeIdx) {
                            klass += ' migration-checklist-active';
                            iconHtml = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#b45309" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 6 15 12 9 18"/></svg>`;
                        } else {
                            klass += ' migration-checklist-pending';
                            iconHtml = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8" opacity="0.4"/></svg>`;
                        }
                        line.className = klass;
                        line.innerHTML = `<span class="migration-check-icon">${iconHtml}</span> ${lineLabel}`;
                    }
                    checklist.appendChild(line);
                });

                row.appendChild(checklist);
            } else {
                const instructionLine = document.createElement('div');
                instructionLine.className = 'migration-instruction';
                let tplKey;
                if (status === 'needs-enable') {
                    tplKey = 'migrationInstructionEnableHtml';
                } else if (status === 'needs-website-access') {
                    tplKey = 'migrationInstructionWebsiteAccessHtml';
                } else if (key === 'firefox') {
                    tplKey = 'migrationInstructionFirefoxPrivateHtml';
                } else {
                    tplKey = 'migrationInstructionChromiumPrivateHtml';
                }
                const chip = extensionsUrlChipHtml(key);
                instructionLine.innerHTML = tSettings(tplKey)
                    .replace('{URL_CHIP}', chip)
                    .replace(/{BROWSER}/g, entry.label)
                    .replace(/{PRIV}/g, privNoun);
                attachCopyChipHandlers(instructionLine);
                row.appendChild(instructionLine);
            }

            const actionsRow = document.createElement('div');
            actionsRow.className = 'migration-actions-row';

            const primaryBtn = document.createElement('button');
            primaryBtn.type = 'button';
            primaryBtn.className = 'migration-primary-btn';
            primaryBtn.textContent = tSettings('migrationOpenExtensionSettings');
            primaryBtn.addEventListener('click', () => {
                openExtensionSettings(key).catch(e => console.warn('[migration] open ext settings:', e));
            });
            actionsRow.appendChild(primaryBtn);

            let showMeBtn = null;
            if (hasSteps) {
                showMeBtn = document.createElement('button');
                showMeBtn.type = 'button';
                showMeBtn.className = 'migration-show-me-btn';
                showMeBtn.setAttribute('aria-expanded', 'false');
                showMeBtn.innerHTML = `<span>${tSettings('migrationShowMeHow')}</span><svg class="migration-show-me-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="9 6 15 12 9 18"></polyline></svg>`;
                actionsRow.appendChild(showMeBtn);
            }

            row.appendChild(actionsRow);

            const delayNote = document.createElement('div');
            delayNote.className = 'migration-browser-hint migration-delay-note';
            delayNote.textContent = tSettings('migrationDelayDetectionNote');
            row.appendChild(delayNote);

            if (hasSteps) {
                const screenshotsWrap = document.createElement('div');
                screenshotsWrap.className = 'migration-screenshots-wrap hidden';

                const screenshotsContainer = document.createElement('div');
                const safariTwoUp = key === 'safari' && steps.length === 2;
                screenshotsContainer.className = `extension-enforcer-screenshots ${steps.length >= 3 ? 'screenshots-grid' : 'screenshots-row'}${safariTwoUp ? ' safari-screenshots-asymmetric' : ''}`;

                steps.forEach((step, i) => {
                    if (i > 0 && steps.length < 3) {
                        const arrow = document.createElement('span');
                        arrow.className = 'extension-enforcer-screenshot-arrow';
                        arrow.textContent = '→';
                        screenshotsContainer.appendChild(arrow);
                    }
                    const figure = document.createElement('figure');
                    figure.className = 'extension-enforcer-step';
                    const cap = formatExtensionScreenshotCaption(step, i);
                    if (cap) {
                        const caption = document.createElement('figcaption');
                        caption.className = 'extension-enforcer-step-label';
                        caption.textContent = cap;
                        figure.appendChild(caption);
                    }
                    const img = document.createElement('img');
                    img.className = 'extension-enforcer-screenshot';
                    img.src = step.src;
                    img.alt = screenshotAltText(step, i, cap);
                    figure.appendChild(img);
                    screenshotsContainer.appendChild(figure);
                });

                screenshotsWrap.appendChild(screenshotsContainer);
                row.appendChild(screenshotsWrap);

                showMeBtn.addEventListener('click', () => {
                    const isOpen = showMeBtn.classList.toggle('open');
                    screenshotsWrap.classList.toggle('hidden', !isOpen);
                    showMeBtn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
                    if (isOpen) migrationShowMeHowExpandedKeys.add(key);
                    else migrationShowMeHowExpandedKeys.delete(key);
                });

                if (migrationShowMeHowExpandedKeys.has(key)) {
                    showMeBtn.classList.add('open');
                    screenshotsWrap.classList.remove('hidden');
                    showMeBtn.setAttribute('aria-expanded', 'true');
                }
            }
        }

        container.appendChild(row);
    }

    updateMigrationBrowserChecklist(state);
}

// While the post-cleanup screen is open, periodically re-check
// extension compliance so the checklist ticks itself off when the
// user comes back from the store.
async function pollMigrationCompliance({ launchProbe = false } = {}) {
    if (!migrationOnboardingActive) return;
    try {
        await refreshAutomationPermissionStatus({ force: true, launchProbe });
        const fresh = await invoke('onboarding_state');
        renderBrowserInstallButtons(fresh);
    } catch (e) { /* no-op */ }
}

function startMigrationPolling() {
    if (migrationPollIntervalId) return;
    migrationPollIntervalId = setInterval(pollMigrationCompliance, MIGRATION_POLL_MS);
}

function stopMigrationPolling() {
    if (migrationPollIntervalId) {
        clearInterval(migrationPollIntervalId);
        migrationPollIntervalId = null;
    }
}

function onAppForeground() {
    if (typeof kickClockNow === 'function') kickClockNow();
    void reconcileBlockingWarningShell();
    behaviourBannerDismissedThisSession = false;
    if (migrationOnboardingActive) {
        pollMigrationCompliance();
        return;
    }
    if (!hasAcceptedEula() || !startupInitializationComplete) return;
    refreshBehaviourBannerIfStale({ force: true });
    void reconcileBlockingWarningShell();
}

function setupAppForegroundRefresh() {
    if (state.isIOS || state.isAndroid) return;
    window.addEventListener('focus', onAppForeground);
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') onAppForeground();
    });
    getCurrentWindow().onFocusChanged(({ payload: focused }) => {
        if (focused) onAppForeground();
    }).catch((e) => {
        console.warn('[app] window focus listener unavailable:', e);
    });
    // Keep the setup banner in sync when extension state changes
    // without a window focus (e.g. user toggles an extension while
    // ReDD Blocker stays visible). Matches enforcer tick (~5 s).
    setInterval(() => {
        if (!startupInitializationComplete || migrationOnboardingActive) return;
        if (!hasAcceptedEula()) return;
        void refreshBehaviourBannerIfStale();
    }, 5_000);
}

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
// Last `onboarding_state` snapshot we've observed. Updated by
// `runDesktopOnboarding`, `refreshBehaviourBannerIfStale`, and
// `pollMigrationCompliance`.
export let lastOnboardingState = null;

async function updateBehaviourChangeBanner(state) {
    const banner = document.getElementById('behaviour-change-banner');
    if (!banner) return;

    if (!state?.browsers) {
        try {
            state = await invoke('onboarding_state');
        } catch (_) {
            return;
        }
    }

    lastOnboardingState = state;

    if (appState.isMacOSDesktop) await refreshAutomationPermissionStatus({ force: true, launchProbe: false });

    let enforcementEnabled = false;
    try {
        enforcementEnabled = await invoke('get_enforcement_enabled');
    } catch (_) { /* non-desktop or command not available */ }

    // ---- Browser-side compliance ------------------------------------
    // `installed` means the browser app exists on disk (regardless of
    // running state) — same scope the welcome screen uses, so the
    // user doesn't get nagged about Brave if they don't have Brave.
    const browsers = (state && state.browsers) || {};
    const detectedKeys = Object.keys(BROWSER_STORE_LINKS).filter(k => browsers[k] && browsers[k].installed);
    const allCompliant = detectedKeys.length > 0
        && detectedKeys.every(k => effectiveBrowserComplianceStatus(k, browsers) === 'compliant');
    const hasBrowserIssues = detectedKeys.length > 0 && !allCompliant;

    const shouldShow = !behaviourBannerDismissedThisSession
        && detectedKeys.length > 0
        && (hasBrowserIssues || !enforcementEnabled);
    if (!shouldShow) {
        banner.classList.add('hidden');
        return;
    }
    banner.classList.remove('hidden');

    const headlineEl = document.getElementById('setup-banner-headline');
    if (headlineEl) {
        const headlineKey = bannerHeadlineKey(browsers, detectedKeys);
        headlineEl.textContent = tSettings(headlineKey);
    }

    const parts = [];
    const actionSummary = buildBannerActionSummary(browsers, detectedKeys);
    if (actionSummary) parts.push(actionSummary);
    if (!enforcementEnabled && detectedKeys.length > 0) {
        parts.push(tSettings('bannerTurnOnBrowserProtection'));
    }

    const bodyEl = document.getElementById('behaviour-change-text');
    if (bodyEl) {
        bodyEl.textContent = parts.join(' · ');
    }

    const helpBtn = document.getElementById('behaviour-change-help');
    const dismissBtn = document.getElementById('behaviour-change-dismiss');

    if (helpBtn) {
        helpBtn.classList.remove('hidden', 'ghost');
        if (!helpBtn._listenerAdded) {
            helpBtn._listenerAdded = true;
            helpBtn.addEventListener('click', openExtensionSetupOverlay);
        }
    }

    if (dismissBtn && !dismissBtn._listenerAdded) {
        dismissBtn._listenerAdded = true;
        dismissBtn.addEventListener('click', () => {
            behaviourBannerDismissedThisSession = true;
            banner.classList.add('hidden');
        });
    }
}

function bannerHeadlineKey(browsers, detectedKeys) {
    if (!state.isMacOSDesktop) {
        return 'setupBrowsersBannerHeadline';
    }

    const extensionStatuses = new Set([
        'needs-install',
        'needs-native-host',
        'needs-enable',
        'needs-private',
        'needs-website-access',
    ]);

    const hasExtensionIssue = detectedKeys.some((key) =>
        extensionStatuses.has(effectiveBrowserComplianceStatus(key, browsers))
    );

    return hasExtensionIssue
        ? 'setupBrowsersBannerHeadline'
        : 'setupBrowsersBannerHeadlineMac';
}

// Build a compact, action-grouped summary of what's still missing
// across the user's installed browsers. Browsers with the same
// outstanding action are grouped into a single phrase so the
// banner doesn't repeat verbs:
//
//   "Install in Chrome and Edge · Allow in private browsing in Brave"
//   "Allow on all websites in Safari"
//
// Order is foundational-first (install → enable → private → website
// access) so the user sees the prerequisite step before any follow-up
// step. Returns "" when nothing is non-compliant — the caller is
// expected to have already gated on that, but defending against an
// empty result keeps callers safe.
function buildBannerActionSummary(browsers, detectedKeys) {
    const groups = new Map();
    for (const key of detectedKeys) {
        const status = effectiveBrowserComplianceStatus(key, browsers);
        if (!status || status === 'compliant') continue;
        const label = BROWSER_STORE_LINKS[key]?.label || key;
        if (!groups.has(status)) groups.set(status, []);
        groups.get(status).push(label);
    }

    const order = ['needs-install', 'needs-automation', 'needs-fda', 'needs-native-host', 'needs-enable', 'needs-private', 'needs-website-access'];
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
        case 'needs-install':
            return tSettings('bannerActionInstallIn');
        case 'needs-automation':
            return tSettings('bannerActionAutomationIn');
        case 'needs-fda':
            return tSettings('bannerActionGrantFdaIn');
        case 'needs-enable':
            return tSettings('bannerActionEnableIn');
        case 'needs-private':
            return tSettings('bannerActionPrivateBrowsingIn');
        case 'needs-website-access':
            return tSettings('bannerActionAllWebsitesIn');
        default:
            return tSettings('bannerActionSetUpIn');
    }
}

// Natural-language join: "Chrome", "Chrome and Edge",
// "Chrome, Edge, and Brave" (Oxford comma in English).
// Danish: no comma before the final conjunction.
function joinBrowserNames(list) {
    if (list.length === 0) return '';
    if (list.length === 1) return list[0];
    const and = tSettings('andWord');
    if (list.length === 2) return `${list[0]} ${and} ${list[1]}`;
    if (getSettingsLanguage() === 'da') {
        return `${list.slice(0, -1).join(', ')} ${and} ${list[list.length - 1]}`;
    }
    return `${list.slice(0, -1).join(', ')}, ${and} ${list[list.length - 1]}`;
}

// Re-opens the post-cleanup migration overlay (the per-browser
// install checklist) — the canonical "set up ReDD Focus" surface.
// Used by both the slim banner's "Set up browsers" button and the
// new Settings → Advanced Options entry. Centralised so both call
// sites stay in sync if the overlay's API changes.
export async function openExtensionSetupOverlay() {
    try {
        const fresh = await invoke('onboarding_state');
        migrationOnboardingDismissed = false;
        // Hide settings if it was the launch point — the migration
        // overlay needs the full window.
        document.getElementById('settings-modal')?.classList.add('hidden');
        setLanguagePickerOpen(false);
        await showMigrationOnboarding('post', fresh, { mode: 'fresh' });
    } catch (e) {
        console.warn('[setup-overlay] reopen failed:', e);
    }
}

async function continueOnboardingReplayFromWelcome() {
    if (!hasAcceptedEula()) {
        updateOnboardingVisibility();
        return;
    }
    await openExtensionSetupOverlay();
}

export async function restartOnboardingFromSettings() {
    if (state.isIOS || state.isAndroid) return;
    document.getElementById('settings-modal')?.classList.add('hidden');
    setLanguagePickerOpen(false);

    migrationOnboardingDismissed = false;
    localStorage.removeItem(EXT_ONBOARDING_DISMISSED_KEY);
    firstRunExtensionSetupPending = true;
    lastMigrationBrowserRenderSignature = '';
    extensionSetupPausedForBackNavigation = false;

    await presentWelcomeOnboarding(continueOnboardingReplayFromWelcome);
}

// Re-poll extension compliance so the slim banner reflects reality
// if the user just finished setting up an extension in another
// browser and tabbed back. Throttled to match the enforcer tick (~5 s)
// so it stays in sync with the countdown banner without hammering
// `onboarding_state` on rapid focus toggling. Pass `force: true` to
// bypass the throttle when compliance clearly changed (enforcer
// grace-resolved, window hide → show, etc.).
let lastBannerRefreshAt = 0;
const BANNER_REFRESH_THROTTLE_MS = 5_000;
async function refreshBehaviourBannerIfStale({ force = false } = {}) {
    if (state.isIOS || state.isAndroid) return;
    if (migrationOnboardingActive) return; // overlay is the source of truth
    if (!startupInitializationComplete) return;
    const now = Date.now();
    if (!force && now - lastBannerRefreshAt < BANNER_REFRESH_THROTTLE_MS) return;
    lastBannerRefreshAt = now;
    try {
        if (state.isMacOSDesktop) await refreshAutomationPermissionStatus({ force });
        const fresh = await invoke('onboarding_state');
        await updateBehaviourChangeBanner(fresh);
        await syncEnforcerClosedBannersWithCompliance(fresh);
    } catch (_) { /* no-op */ }
}

// ---- Enforcer UI: dynamic per-browser action banners ---------------------
// Subscribes to Rust enforcer events and shows attention-grabbing dark-orange
// banners with a live countdown when a browser is about to be closed.

let enforcerUiAlertsAttached = false;
const ENFORCER_ACTIVE_BANNER_ID = 'extension-enforcer-action-banner-active';
const ENFORCER_CLOSED_BANNER_ID = 'extension-enforcer-action-banner-closed';
const enforcerActionBannerStates = new Map();
const enforcerClosedBannerStates = new Map();
let enforcerActionBannerInterval = null;
let enforcerClosedBannerPollInterval = null;
let enforcerScreenshotResizeTimer = null;
const ENFORCER_CLOSED_BANNER_POLL_MS = 5_000;

function stopEnforcerClosedBannerPoll() {
    if (enforcerClosedBannerPollInterval) {
        clearInterval(enforcerClosedBannerPollInterval);
        enforcerClosedBannerPollInterval = null;
    }
}

function ensureEnforcerClosedBannerPoll() {
    if (enforcerClosedBannerStates.size === 0) {
        stopEnforcerClosedBannerPoll();
        return;
    }
    void syncEnforcerClosedBannersWithCompliance();
    if (enforcerClosedBannerPollInterval) return;
    enforcerClosedBannerPollInterval = setInterval(() => {
        void syncEnforcerClosedBannersWithCompliance();
    }, ENFORCER_CLOSED_BANNER_POLL_MS);
}

async function syncEnforcerClosedBannersWithCompliance(state) {
    if (enforcerClosedBannerStates.size === 0) {
        stopEnforcerClosedBannerPoll();
        return;
    }
    if (!state?.browsers) {
        try {
            state = await invoke('onboarding_state');
        } catch (_) {
            return;
        }
    }
    if (appState.isMacOSDesktop) await refreshAutomationPermissionStatus({ force: true, launchProbe: false });
    const browsers = state.browsers || {};
    let changed = false;
    for (const key of [...enforcerClosedBannerStates.keys()]) {
        const b = browsers[key];
        if (b && effectiveBrowserComplianceStatus(key, browsers) === 'compliant') {
            enforcerClosedBannerStates.delete(key);
            changed = true;
        }
    }
    if (changed) {
        renderCombinedEnforcerClosedBanner();
    } else if (enforcerClosedBannerStates.size === 0) {
        stopEnforcerClosedBannerPoll();
    }
}

function setupEnforcerUiAlerts() {
    if (state.isIOS || state.isAndroid || enforcerUiAlertsAttached) return;
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
        // Enforcer just re-scanned and found this browser compliant —
        // refresh the setup banner immediately so it doesn't lag up
        // to 30 s behind the countdown banner (same profile scan,
        // but the setup banner was on a separate throttle).
        void refreshBehaviourBannerIfStale({ force: true });
    }).catch((e) => {
        console.warn('[enforcer-ui] failed to attach grace-resolved listener:', e);
    });
    tauriAPI.onEnforcerBrowserClosed((event) => {
        const payload = event?.payload || {};
        renderEnforcerClosedBanner(payload);
    }).catch((e) => {
        console.warn('[enforcer-ui] failed to attach browser-closed listener:', e);
    });
    window.addEventListener('resize', () => {
        clearTimeout(enforcerScreenshotResizeTimer);
        enforcerScreenshotResizeTimer = setTimeout(syncAllEnforcerScreenshotHeights, 100);
    });
}

// ---- Website automation (macOS) permission prompt --------------------------
//
// The Automation watcher (src-tauri/src/web_automation.rs) drives
// Safari + Chromium blocking via Apple Events. The first event to each
// browser surfaces the system "ReDD Blocker wants to control <App>"
// prompt; if the user denies it, the watcher emits
// `web-automation://permission-needed` (and `...resolved` once granted).
// Without the grant, website blocking silently does nothing, so we show
// a persistent banner with a one-click jump to System Settings. The
// banner reuses the shared `update-banner setup-banner` look (same as
// the "Enable ReDD Focus in your browsers" reminder) so we don't grow a
// second banner style; it's created on demand and parked in the top
// banner stack just above `#behaviour-change-banner`. The whole thing is
// macOS-only and self-contained — it deliberately does not touch the
// extension enforcer's banner machinery.

const WEB_AUTOMATION_BANNER_ID = 'web-automation-permission-banner';
const webAutomationPendingBrowsers = new Map(); // label -> true
let webAutomationUiAlertsAttached = false;

async function startWebAutomationWatcher() {
    if (!state.isMacOSDesktop) return;
    try {
        await tauriAPI.webAutomationStart();
    } catch (e) {
        console.warn('[web-automation] web_automation_start failed:', e);
    }
}

function setupWebAutomationUiAlerts() {
    if (!state.isMacOSDesktop || webAutomationUiAlertsAttached) return;
    webAutomationUiAlertsAttached = true;
    tauriAPI.onWebAutomationPermissionNeeded(async (event) => {
        const label = event?.payload?.label || event?.payload?.browser;
        if (!label) return;
        const key = browserKeyFromLabel(label);
        if (key) lastAutomationPermissionByKey[key] = 'denied';
        if (migrationOnboardingActive && lastMigrationBrowserState) {
            renderBrowserInstallButtons(lastMigrationBrowserState, { force: true });
        }
        // When enforcement is enabled, the extension enforcer already runs
        // a grace countdown for the denied browser and force-closes it,
        // surfacing its own banner + deep-link. Showing this soft banner
        // too would be redundant. Only surface it when enforcement is OFF
        // (where blocking silently no-ops and this is the user's only cue).
        try {
            if (await invoke('get_enforcement_enabled')) return;
        } catch (_) { /* fall through and show the banner */ }
        webAutomationPendingBrowsers.set(String(label), true);
        renderWebAutomationPermissionBanner();
    }).catch((e) => {
        console.warn('[web-automation] failed to attach permission-needed listener:', e);
        webAutomationUiAlertsAttached = false;
    });
    tauriAPI.onWebAutomationPermissionResolved((event) => {
        const label = event?.payload?.label || event?.payload?.browser;
        if (!label) return;
        const key = browserKeyFromLabel(label);
        if (key) lastAutomationPermissionByKey[key] = 'granted';
        webAutomationPendingBrowsers.delete(String(label));
        hideEnforcerActionBanner(label);
        renderWebAutomationPermissionBanner();
        void refreshBehaviourBannerIfStale({ force: true });
        if (migrationOnboardingActive && lastMigrationBrowserState) {
            renderBrowserInstallButtons(lastMigrationBrowserState, { force: true });
        }
    }).catch((e) => {
        console.warn('[web-automation] failed to attach permission-resolved listener:', e);
    });
}

// Build (once) the soft permission banner. Reuses the same DOM shape and
// classes as the static `#behaviour-change-banner` (info icon + headline +
// body + dark CTA + × dismiss) so all styling comes from the shared
// `.update-banner`/`.setup-banner` rules — no bespoke inline styles. It's
// parked just above `#behaviour-change-banner` in the top banner stack,
// mirroring how the enforcer banners insert themselves.
function ensureWebAutomationBanner() {
    let banner = document.getElementById(WEB_AUTOMATION_BANNER_ID);
    if (banner) return banner;

    banner = document.createElement('div');
    banner.id = WEB_AUTOMATION_BANNER_ID;
    banner.className = 'update-banner setup-banner hidden';
    banner.innerHTML = `
        <div class="update-banner-content">
            <svg class="setup-banner-info-icon" width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="12" cy="12" r="11" fill="currentColor"></circle>
                <circle cx="12" cy="7.5" r="1.3" fill="white"></circle>
                <rect x="11" y="10" width="2" height="8" rx="1" fill="white"></rect>
            </svg>
            <div class="setup-banner-message">
                <strong class="setup-banner-headline web-automation-banner-headline"></strong>
                <span class="setup-banner-body web-automation-banner-text"></span>
                <div class="setup-banner-actions-row">
                    <button class="update-banner-btn web-automation-banner-open" type="button"></button>
                </div>
            </div>
        </div>
        <button class="update-banner-dismiss web-automation-banner-dismiss" title="Dismiss" type="button">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
        </button>
    `;

    banner.querySelector('.web-automation-banner-open')?.addEventListener('click', () => {
        tauriAPI.openAutomationSettings()
            .then(() => scheduleAutomationVerificationPoll())
            .catch((e) =>
                console.warn('[web-automation] openAutomationSettings failed:', e));
    });
    banner.querySelector('.web-automation-banner-dismiss')?.addEventListener('click', () => {
        webAutomationPendingBrowsers.clear();
        banner.classList.add('hidden');
    });

    const setupBanner = document.getElementById('behaviour-change-banner');
    if (setupBanner) {
        setupBanner.insertAdjacentElement('beforebegin', banner);
    } else {
        document.querySelector('.app-container')?.prepend(banner);
    }
    return banner;
}

function renderWebAutomationPermissionBanner() {
    const labels = [...webAutomationPendingBrowsers.keys()];
    if (labels.length === 0) {
        document.getElementById(WEB_AUTOMATION_BANNER_ID)?.classList.add('hidden');
        return;
    }
    const banner = ensureWebAutomationBanner();
    const list = joinBrowserNames(labels);
    const headlineEl = banner.querySelector('.web-automation-banner-headline');
    if (headlineEl) headlineEl.textContent = tSettings('webAutomationBannerHeadline');
    const text = banner.querySelector('.web-automation-banner-text');
    if (text) text.textContent = tSettingsFmt('webAutomationBannerBody', { browsers: list });
    const openBtn = banner.querySelector('.web-automation-banner-open');
    if (openBtn) openBtn.textContent = tSettings('migrationOpenAutomationSettings');
    banner.classList.remove('hidden');
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

export function browserIconUrl(key) {
    switch (key) {
        case 'firefox': return iconFirefoxUrl;
        case 'edge': return iconEdgeUrl;
        case 'safari': return iconSafariUrl;
        case 'brave': return iconBraveUrl;
        case 'chrome':
        default: return iconChromeUrl;
    }
}

function formatExtensionScreenshotCaption(step, index) {
    if (step.hideCaption) return '';
    if (step.captionKey) return tSettings(step.captionKey);
    if (step.labelKey) {
        const label = tSettings(step.labelKey);
        return tSettingsFmt('migrationScreenshotCaptionStep', { n: String(index + 1), label });
    }
    if (step.caption) return step.caption;
    if (step.label) return tSettingsFmt('migrationScreenshotCaptionStep', { n: String(index + 1), label: step.label });
    return tSettingsFmt('migrationScreenshotStepOnly', { n: String(index + 1) });
}

function screenshotAltText(step, index, caption) {
    if (step.altKey) return tSettings(step.altKey);
    if (caption) return caption;
    return tSettingsFmt('migrationScreenshotStepOnly', { n: String(index + 1) });
}

function enforcerShowMeHowButtonHtml() {
    return `<span>${tSettings('migrationShowMeHow')}</span><svg class="extension-enforcer-show-me-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="9 6 15 12 9 18"></polyline></svg>`;
}

function automationScreenshotSteps() {
    return [
        {
            src: screenshotAutomationSettings,
            plainPanel: true,
            hideCaption: true,
            altKey: 'migrationShotAutomationStep1',
        },
    ];
}

function enforcerScreenshotSteps(key) {
    if (key === 'chrome') return [
        { src: screenshotChromeStep1, labelKey: 'migrationShotChromeStep1' },
        { src: screenshotChromeStep2, labelKey: 'migrationShotChromeStep2' },
    ];
    if (key === 'edge') return [
        { src: screenshotEdgeStep1, labelKey: 'migrationShotEdgeStep1' },
        { src: screenshotEdgeStep2, labelKey: 'migrationShotEdgeStep2' },
    ];
    if (key === 'firefox') return [
        { src: screenshotFirefoxStep1, labelKey: 'migrationShotFirefoxStep1' },
        { src: screenshotFirefoxStep2, labelKey: 'migrationShotFirefoxStep2' },
    ];
    if (key === 'safari') return [
        { src: screenshotSafariStep1, captionKey: 'migrationShotSafariCap1' },
        { src: screenshotSafariStep2, captionKey: 'migrationShotSafariCap2' },
    ];
    return null;
}

function enforcerCopy(payload) {
    const browserRaw = payload.label || payload.browser;
    const browser = browserRaw || tSettings('enforcerBrowserFallback');
    const seconds = Math.max(0, Number(payload.remaining_secs ?? payload.remainingSecs ?? 0));
    const issue = payload.issue || 'unknown';
    const closeHeadline = tSettingsFmt('enforcerClosingHeadline', { browser });
    const countdownStr = (key = 'enforcerCountdownDefault') => tSettingsFmt(key, { seconds: String(seconds), browser });

    if (issue === 'missing') {
        return {
            headline: tSettingsFmt('enforcerHeadlineMissing', { browser }),
            countdownHeadline: closeHeadline,
            countdownInstruction: tSettings('enforcerCountdownInstrMissing'),
            countdown: countdownStr('enforcerCountdownMissing'),
            instruction: tSettingsFmt('enforcerInstrMissing', { browser }),
            action: tSettings('enforcerActionInstall'),
        };
    }
    if (issue === 'disabled') {
        const key = browserKeyFromLabel(browser);
        const screenshotSteps = enforcerScreenshotSteps(key);
        return {
            headline: tSettingsFmt('enforcerHeadlineDisabled', { browser }),
            countdownHeadline: closeHeadline,
            countdownInstruction: tSettings('enforcerCountdownInstrDisabled'),
            countdown: countdownStr('enforcerCountdownDisabled'),
            instructionHtml: tSettings('migrationInstructionEnableHtml')
                .replace('{URL_CHIP}', extensionsUrlChipHtml(key))
                .replace(/{BROWSER}/g, browser),
            note: tSettings('migrationDelayDetectionNote'),
            action: tSettingsFmt('enforcerActionOpenExtensions', { browser }),
            actionHtml: tSettings('migrationOpenExtensionSettings'),
            screenshotSteps,
        };
    }
    if (issue === 'private') {
        const key = browserKeyFromLabel(browser);
        const privNoun = privateModeNoun(key);
        const screenshotSteps = enforcerScreenshotSteps(key);
        const tplKey = key === 'firefox'
            ? 'migrationInstructionFirefoxPrivateHtml'
            : 'migrationInstructionChromiumPrivateHtml';
        return {
            headline: tSettingsFmt('enforcerHeadlinePrivate', { browser }),
            countdownHeadline: closeHeadline,
            countdownInstruction: tSettings('enforcerCountdownInstrPrivate'),
            countdown: countdownStr('enforcerCountdownPrivate'),
            instructionHtml: tSettings(tplKey)
                .replace('{URL_CHIP}', extensionsUrlChipHtml(key))
                .replace(/{BROWSER}/g, browser)
                .replace(/{PRIV}/g, privNoun),
            note: tSettings('migrationDelayDetectionNote'),
            action: tSettingsFmt('enforcerActionOpenExtensions', { browser }),
            actionHtml: tSettings('migrationOpenExtensionSettings'),
            screenshotSteps,
        };
    }
    if (issue === 'websiteaccess') {
        return {
            headline: tSettingsFmt('enforcerHeadlineWebsiteAccess', { browser }),
            countdownHeadline: closeHeadline,
            countdownInstruction: tSettings('enforcerCountdownInstrWebsiteAccess'),
            countdown: countdownStr('enforcerCountdownWebsiteAccess'),
            instruction: tSettingsFmt('enforcerInstrWebsiteAccessPlain', { browser }),
            action: tSettingsFmt('enforcerActionOpenExtensions', { browser }),
        };
    }
    if (issue === 'access') {
        return {
            headline: tSettingsFmt('enforcerHeadlineAccess', { browser }),
            countdownHeadline: closeHeadline,
            countdownInstruction: tSettings('enforcerCountdownInstrAccess'),
            countdown: countdownStr('enforcerCountdownAccess'),
            instruction: browser === 'Safari'
                ? tSettings('enforcerInstrAccessSafari')
                : tSettingsFmt('enforcerInstrAccessBrowser', { browser }),
            action: browser === 'Safari'
                ? tSettings('migrationOpenExtensionSettings')
                : tSettingsFmt('enforcerActionOpenBrowserSettings', { browser }),
        };
    }
    if (issue === 'automation') {
        // macOS: ReDD Blocker lost the Automation grant for this browser,
        // so it can't redirect blocked tabs. No extension URL applies —
        // the only fix is re-enabling the grant in System Settings.
        return {
            headline: tSettingsFmt('enforcerHeadlineAutomation', { browser }),
            countdownHeadline: closeHeadline,
            countdownInstruction: tSettings('enforcerCountdownInstrAutomation'),
            countdown: countdownStr(),
            instruction: tSettingsFmt('enforcerInstrAutomation', { browser }),
            action: tSettings('migrationOpenAutomationSettings'),
            hideUrlChip: true,
            screenshotSteps: automationScreenshotSteps(),
        };
    }
    return {
        headline: tSettingsFmt('enforcerHeadlineDefault', { browser }),
        countdownHeadline: closeHeadline,
        countdownInstruction: tSettings('enforcerCountdownInstrDefault'),
        countdown: countdownStr(),
        instruction: tSettingsFmt('enforcerInstrDefault', { browser }),
        action: tSettingsFmt('enforcerActionOpenExtensions', { browser }),
    };
}

function renderEnforcerCountdownInstruction(el, baseText) {
    if (!el) return;
    el.replaceChildren();
    let base = (baseText || '').trim();
    const delay = tSettings('enforcerCountdownDelayNote');
    if (base.endsWith('.')) base = base.slice(0, -1);
    if (base) {
        el.append(document.createTextNode(`${base} `));
    }
    const delaySpan = document.createElement('span');
    delaySpan.className = 'extension-enforcer-countdown-delay-note';
    delaySpan.textContent = delay;
    el.appendChild(delaySpan);
}

function renderEnforcerActionCopy(banner, payload, copy) {
    const key = enforcerBannerKey(payload);
    const isClosed = banner.classList.contains('extension-enforcer-action-banner-closed');
    const isActiveCountdown = !!copy.countdown && !isClosed;
    const icon = banner.querySelector('.extension-enforcer-browser-icon');
    const headlineText = banner.querySelector('.extension-enforcer-action-headline-text');
    const countdown = banner.querySelector('.extension-enforcer-action-countdown');
    const countdownRow = banner.querySelector('.extension-enforcer-action-countdown-row');
    const instruction = banner.querySelector('.extension-enforcer-action-instruction');
    const closedStatus = banner.querySelector('.extension-enforcer-closed-status');

    if (icon) {
        icon.src = browserIconUrl(key);
        icon.alt = '';
        icon.title = payload.label || payload.browser || key;
    }
    if (headlineText) headlineText.textContent = isActiveCountdown ? (copy.countdownHeadline || '') : (copy.headline || '');
    if (countdown) {
        const seconds = Math.max(0, Number(payload.remaining_secs ?? payload.remainingSecs ?? 0));
        countdown.replaceChildren();
        if (isActiveCountdown) {
            const mins = Math.floor(seconds / 60);
            const secs = String(seconds % 60).padStart(2, '0');
            const time = document.createElement('strong');
            time.className = 'extension-enforcer-countdown-time';
            time.textContent = `${mins}:${secs}`;
            const label = document.createElement('span');
            label.className = 'extension-enforcer-countdown-label';
            label.textContent = tSettings('enforcerCountdownRemaining');
            countdown.append(time, label);
        }
    }
    if (countdownRow) countdownRow.classList.toggle('hidden', !isActiveCountdown);
    if (closedStatus) {
        closedStatus.textContent = tSettings('enforcerClosedStatus');
        closedStatus.classList.toggle('hidden', !isClosed);
    }
    if (instruction) {
        if (isActiveCountdown) {
            renderEnforcerCountdownInstruction(instruction, copy.countdownInstruction || '');
        } else if (copy.instructionHtml) {
            instruction.innerHTML = copy.instructionHtml;
            attachCopyChipHandlers(instruction);
        } else {
            instruction.textContent = copy.instruction || '';
        }
    }

    const note = banner.querySelector('.extension-enforcer-action-note');
    if (note) {
        note.textContent = isActiveCountdown ? '' : (copy.note || '');
        note.classList.toggle('hidden', isActiveCountdown || !copy.note);
    }

    const url = banner.querySelector('.extension-enforcer-action-url');
    if (url) {
        const href = extensionsUrl(key);
        const showUrl = (isActiveCountdown || isClosed) && !!href;
        url.replaceChildren();
        if (showUrl) {
            populateEnforcerUrlChip(url, key);
        } else {
            delete url.dataset.copyUrl;
            delete url.dataset.copiedUntil;
            url.classList.remove('copied');
            url.disabled = false;
        }
        url.classList.toggle('hidden', !showUrl);
    }

    const progress = banner.querySelector('.extension-enforcer-progress-bar');
    if (progress) {
        const remaining = Math.max(0, Number(payload.remaining_secs ?? payload.remainingSecs ?? 0));
        const totalRaw = payload.total_secs ?? payload.totalSecs ?? remaining;
        const total = Math.max(1, Number(totalRaw || 1));
        const pct = Math.max(0, Math.min(100, (remaining / total) * 100));
        progress.style.width = isActiveCountdown ? `${pct}%` : '0%';
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
                applyScreenshotContainerLayout(container, steps, {
                    browserKey: banner.dataset.browser,
                });
                steps.forEach((step, i) => {
                    const figure = document.createElement('figure');
                    figure.className = 'extension-enforcer-step';
                    const cap = formatExtensionScreenshotCaption(step, i);
                    if (cap) {
                        const caption = document.createElement('figcaption');
                        caption.className = 'extension-enforcer-step-label';
                        caption.textContent = cap;
                        figure.appendChild(caption);
                    }
                    const img = document.createElement('img');
                    img.className = 'extension-enforcer-screenshot';
                    img.src = step.src;
                    img.alt = screenshotAltText(step, i, cap);
                    figure.appendChild(img);
                    container.appendChild(figure);
                });
            }
            applyScreenshotContainerLayout(container, steps, {
                browserKey: banner.dataset.browser,
            });
            showMeBtn.classList.remove('hidden');
            if (!screenshotsWrap.classList.contains('hidden')) {
                scheduleEnforcerScreenshotSync(screenshotsWrap);
            }
        } else {
            showMeBtn.classList.add('hidden');
            showMeBtn.classList.remove('open');
            showMeBtn.setAttribute('aria-expanded', 'false');
            screenshotsWrap.classList.add('hidden');
            container.classList.remove('safari-screenshots-asymmetric');
        }
    }
}

function enforcerBannerKey(payload) {
    return browserKeyFromLabel(payload?.label || payload?.browser || 'chrome');
}

function enforcerBannerId(key) {
    return `extension-enforcer-action-banner-${key}`;
}

function formatBrowserList(labels) {
    const clean = labels.filter(Boolean);
    if (clean.length <= 1) return clean[0] || tSettings('enforcerBrowserFallback');
    if (clean.length === 2) return `${clean[0]} and ${clean[1]}`;
    return `${clean.slice(0, -1).join(', ')}, and ${clean[clean.length - 1]}`;
}

function ensureActiveEnforcerActionBanner() {
    let banner = document.getElementById(ENFORCER_ACTIVE_BANNER_ID);
    if (banner) return banner;

    banner = document.createElement('div');
    banner.id = ENFORCER_ACTIVE_BANNER_ID;
    banner.className = 'update-banner extension-enforcer-action-banner';
    banner.innerHTML = `
        <div class="extension-enforcer-progress-track" aria-hidden="true">
            <div class="extension-enforcer-progress-bar"></div>
        </div>
        <div class="extension-enforcer-banner-top">
            <div class="update-banner-content">
                <svg class="extension-enforcer-alert-icon" width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
                    <circle cx="12" cy="12" r="11" fill="currentColor"></circle>
                    <rect x="11" y="6" width="2" height="8" rx="1" fill="white"></rect>
                    <circle cx="12" cy="17" r="1.3" fill="white"></circle>
                </svg>
                <div class="extension-enforcer-message">
                    <strong class="extension-enforcer-action-headline">
                        <span class="extension-enforcer-action-headline-text"></span>
                    </strong>
                    <em class="extension-enforcer-action-instruction"></em>
                </div>
                <div class="extension-enforcer-action-right">
                    <div class="extension-enforcer-action-countdown-row">
                        <span class="extension-enforcer-action-countdown"></span>
                    </div>
                </div>
            </div>
            <button class="update-banner-dismiss extension-enforcer-action-dismiss" title="Dismiss" type="button"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>
        </div>
        <div class="extension-enforcer-action-strip">
            <div class="extension-enforcer-actions-row extension-enforcer-active-actions"></div>
        </div>
        <div class="extension-enforcer-screenshots-wrap hidden">
            <div class="extension-enforcer-screenshots"></div>
        </div>
    `;

    banner.querySelector('.extension-enforcer-action-dismiss')?.addEventListener('click', () => {
        banner.classList.add('hidden');
    });

    const setupBanner = document.getElementById('behaviour-change-banner');
    if (setupBanner) {
        setupBanner.insertAdjacentElement('beforebegin', banner);
    } else {
        document.querySelector('.app-container')?.prepend(banner);
    }
    return banner;
}

function ensureClosedEnforcerActionBanner() {
    let banner = document.getElementById(ENFORCER_CLOSED_BANNER_ID);
    if (banner) return banner;

    banner = document.createElement('div');
    banner.id = ENFORCER_CLOSED_BANNER_ID;
    banner.className = 'update-banner extension-enforcer-action-banner extension-enforcer-action-banner-closed hidden';
    banner.innerHTML = `
        <div class="extension-enforcer-banner-top">
            <div class="update-banner-content">
                <img class="extension-enforcer-browser-icon" aria-hidden="true">
                <div class="extension-enforcer-message">
                    <strong class="extension-enforcer-action-headline">
                        <span class="extension-enforcer-action-headline-text"></span>
                    </strong>
                    <em class="extension-enforcer-action-instruction"></em>
                </div>
            </div>
            <button class="update-banner-dismiss extension-enforcer-action-dismiss" title="Dismiss" type="button"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>
        </div>
        <div class="extension-enforcer-action-strip">
            <div class="extension-enforcer-actions-row extension-enforcer-closed-actions"></div>
        </div>
        <div class="extension-enforcer-screenshots-wrap hidden">
            <div class="extension-enforcer-screenshots"></div>
        </div>
    `;

    banner.querySelector('.extension-enforcer-action-dismiss')?.addEventListener('click', () => {
        banner.classList.add('hidden');
        enforcerClosedBannerStates.clear();
        stopEnforcerClosedBannerPoll();
    });

    const activeBanner = document.getElementById(ENFORCER_ACTIVE_BANNER_ID);
    const setupBanner = document.getElementById('behaviour-change-banner');
    if (activeBanner) {
        activeBanner.insertAdjacentElement('afterend', banner);
    } else if (setupBanner) {
        setupBanner.insertAdjacentElement('beforebegin', banner);
    } else {
        document.querySelector('.app-container')?.prepend(banner);
    }
    return banner;
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
        <div class="extension-enforcer-progress-track" aria-hidden="true">
            <div class="extension-enforcer-progress-bar"></div>
        </div>
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
                </div>
                <div class="extension-enforcer-action-right">
                    <div class="extension-enforcer-action-countdown-row">
                        <span class="extension-enforcer-action-countdown"></span>
                    </div>
                    <small class="extension-enforcer-action-note hidden"></small>
                    <div class="extension-enforcer-closed-status hidden"></div>
                </div>
            </div>
            <button class="update-banner-dismiss extension-enforcer-action-dismiss" title="Dismiss" type="button"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>
        </div>
        <div class="extension-enforcer-action-strip">
            <div class="extension-enforcer-actions-row">
                <button class="update-banner-btn extension-enforcer-action-btn" type="button"></button>
                <button class="extension-enforcer-show-me-btn hidden" type="button" aria-expanded="false"></button>
            </div>
            <button type="button" class="extension-enforcer-action-url hidden"></button>
        </div>
        <div class="extension-enforcer-screenshots-wrap hidden">
            <div class="extension-enforcer-screenshots"></div>
        </div>
    `;

    const showMeBtn = banner.querySelector('.extension-enforcer-show-me-btn');
    if (showMeBtn) showMeBtn.innerHTML = enforcerShowMeHowButtonHtml();
    const screenshotsWrap = banner.querySelector('.extension-enforcer-screenshots-wrap');
    if (showMeBtn && screenshotsWrap) {
        showMeBtn.addEventListener('click', () => {
            const isOpen = showMeBtn.classList.toggle('open');
            screenshotsWrap.classList.toggle('hidden', !isOpen);
            showMeBtn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
            if (isOpen) scheduleEnforcerScreenshotSync(screenshotsWrap);
        });
    }
    const urlBtn = banner.querySelector('.extension-enforcer-action-url');
    if (urlBtn) {
        urlBtn.addEventListener('click', async () => {
            const url = urlBtn.dataset.copyUrl;
            if (!url) return;
            try {
                await navigator.clipboard.writeText(url);
                urlBtn.dataset.copiedUntil = String(Date.now() + 1500);
                urlBtn.classList.add('copied');
                urlBtn.textContent = tSettings('migrationCopied');
                setTimeout(() => {
                    delete urlBtn.dataset.copiedUntil;
                    urlBtn.classList.remove('copied');
                }, 1500);
            } catch (e) {
                console.warn('[enforcer-ui] copy URL failed:', e);
            }
        });
    }

    const setupBanner = document.getElementById('behaviour-change-banner');
    const existingBanners = document.querySelectorAll('.extension-enforcer-action-banner');
    const lastExistingBanner = existingBanners[existingBanners.length - 1];
    if (lastExistingBanner) {
        lastExistingBanner.insertAdjacentElement('afterend', banner);
    } else if (setupBanner) {
        setupBanner.insertAdjacentElement('beforebegin', banner);
    } else {
        document.querySelector('.app-container')?.prepend(banner);
    }

    banner.querySelector('.extension-enforcer-action-dismiss')?.addEventListener('click', () => {
        banner.classList.add('hidden');
    });
    return { banner, key };
}

function enforcerClosedCopy(payload) {
    const browserRaw = payload.label || payload.browser;
    const browser = browserRaw || tSettings('enforcerBrowserFallback');
    const issue = payload.issue || 'unknown';
    if (issue === 'private') {
        const key = browserKeyFromLabel(browser);
        const instruction = key === 'chrome'
            ? tSettings('enforcerClosedInstrPrivateChrome')
            : key === 'firefox'
            ? tSettings('enforcerClosedInstrPrivateFirefox')
            : '';
        const screenshotSteps = enforcerScreenshotSteps(key);
        return {
            headline: tSettingsFmt('enforcerClosedPrivate', { browser }),
            instruction: instruction.trim(),
            action: tSettingsFmt('enforcerActionOpenExtensions', { browser }),
            actionHtml: tSettings('migrationOpenExtensionSettings'),
            screenshotSteps,
        };
    }
    if (issue === 'disabled') {
        const key = browserKeyFromLabel(browser);
        const screenshotSteps = enforcerScreenshotSteps(key);
        return {
            headline: tSettingsFmt('enforcerClosedDisabled', { browser }),
            instruction: tSettingsFmt('enforcerClosedInstrDisabled', { browser }),
            action: tSettingsFmt('enforcerActionOpenExtensions', { browser }),
            actionHtml: tSettings('migrationOpenExtensionSettings'),
            screenshotSteps,
        };
    }
    if (issue === 'missing') {
        return {
            headline: tSettingsFmt('enforcerClosedMissing', { browser }),
            instruction: tSettingsFmt('enforcerClosedInstrMissing', { browser }),
            action: tSettings('enforcerActionInstall'),
        };
    }
    if (issue === 'websiteaccess') {
        return {
            headline: tSettingsFmt('enforcerClosedWebsiteAccess', { browser }),
            instruction: tSettingsFmt('enforcerClosedInstrWebsiteAccess', { browser }),
            action: tSettingsFmt('enforcerActionOpenExtensions', { browser }),
        };
    }
    if (issue === 'access') {
        return {
            headline: tSettingsFmt('enforcerClosedAccess', { browser }),
            instruction: browser === 'Safari' ? tSettings('enforcerClosedInstrAccessSafari') : '',
            action: browser === 'Safari'
                ? tSettings('migrationOpenExtensionSettings')
                : tSettingsFmt('enforcerActionOpenBrowserSettings', { browser }),
        };
    }
    if (issue === 'automation') {
        return {
            headline: tSettingsFmt('enforcerClosedAutomation', { browser }),
            instruction: tSettingsFmt('enforcerClosedInstrAutomation', { browser }),
            action: tSettings('migrationOpenAutomationSettings'),
            hideUrlChip: true,
            screenshotSteps: automationScreenshotSteps(),
        };
    }
    return {
        headline: tSettingsFmt('enforcerClosedDefault', { browser }),
        instruction: tSettingsFmt('enforcerClosedInstrDefault', { browser }),
        action: tSettingsFmt('enforcerActionOpenExtensions', { browser }),
    };
}

async function openEnforcerFix(payload) {
    const browser = payload.label || payload.browser || 'Chrome';
    const key = browserKeyFromLabel(browser);
    try {
        if (payload.issue === 'automation') {
            await tauriAPI.openAutomationSettings();
            return;
        }
        if (payload.issue === 'missing' && key && BROWSER_STORE_LINKS[key]?.url) {
            try {
                await invoke('open_url_in_browser', { browser: key, url: BROWSER_STORE_LINKS[key].url });
            } catch (_) {
                await openUrl(BROWSER_STORE_LINKS[key].url);
            }
            return;
        }
        if (payload.issue === 'access' && key === 'safari') {
            await openExtensionSettings('safari');
            return;
        }
        await openExtensionSettings(key || browser);
    } catch (e) {
        console.warn('[enforcer-ui] fix action failed:', e);
    }
}

function populateEnforcerUrlChip(button, key) {
    const href = extensionsUrl(key);
    button.replaceChildren();
    button.dataset.browserKey = key;
    button.classList.toggle('extension-enforcer-action-url-static', !isCopyableExtensionsTarget(key));
    delete button.dataset.copyUrl;
    button.disabled = !isCopyableExtensionsTarget(key);
    if (!isCopyableExtensionsTarget(key)) {
        button.classList.remove('copied');
        button.textContent = href;
        return;
    }
    button.dataset.copyUrl = href;
    const copied = Number(button.dataset.copiedUntil || 0) > Date.now();
    button.classList.toggle('copied', copied);
    if (copied) {
        button.textContent = tSettings('migrationCopied');
        return;
    }

    const text = document.createElement('span');
    text.textContent = href;
    const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    icon.setAttribute('width', '13');
    icon.setAttribute('height', '13');
    icon.setAttribute('viewBox', '0 0 24 24');
    icon.setAttribute('fill', 'none');
    icon.setAttribute('stroke', 'currentColor');
    icon.setAttribute('stroke-width', '2');
    icon.setAttribute('stroke-linecap', 'round');
    icon.setAttribute('stroke-linejoin', 'round');
    icon.setAttribute('aria-hidden', 'true');
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x', '9');
    rect.setAttribute('y', '9');
    rect.setAttribute('width', '13');
    rect.setAttribute('height', '13');
    rect.setAttribute('rx', '2');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1');
    icon.append(rect, path);
    button.append(text, icon);
}

async function copyEnforcerUrlChip(button) {
    const url = button.dataset.copyUrl;
    if (!url || button.disabled) return;
    try {
        await navigator.clipboard.writeText(url);
        button.dataset.copiedUntil = String(Date.now() + 1500);
        button.classList.add('copied');
        button.textContent = tSettings('migrationCopied');
        setTimeout(() => {
            delete button.dataset.copiedUntil;
            button.classList.remove('copied');
            populateEnforcerUrlChip(button, button.dataset.browserKey || '');
        }, 1500);
    } catch (e) {
        console.warn('[enforcer-ui] copy URL failed:', e);
    }
}

function scheduleEnforcerScreenshotSync(wrap) {
    if (!wrap) return;
    requestAnimationFrame(() => {
        syncEnforcerScreenshotHeights(wrap);
        requestAnimationFrame(() => syncEnforcerScreenshotHeights(wrap));
        wrap.querySelectorAll('.extension-enforcer-screenshot').forEach(img => {
            if (img.complete) return;
            img.addEventListener('load', () => scheduleEnforcerScreenshotSync(wrap), { once: true });
        });
    });
}

function syncAllEnforcerScreenshotHeights() {
    document.querySelectorAll('.extension-enforcer-screenshots-wrap:not(.hidden)')
        .forEach(scheduleEnforcerScreenshotSync);
}

/** Size enforcer how-to screenshots to fill remaining viewport height. */
function syncEnforcerScreenshotHeights(wrap) {
    if (!wrap || wrap.classList.contains('hidden')) {
        if (wrap) {
            wrap.style.maxHeight = '';
            wrap.style.overflowY = '';
        }
        return;
    }

    const container = wrap.querySelector('.extension-enforcer-screenshots');
    if (!container) return;

    const images = [...container.querySelectorAll('.extension-enforcer-screenshot')];
    images.forEach(img => {
        img.style.maxHeight = '';
        img.style.width = '';
        img.style.height = '';
    });

    const bottomPadding = 10;
    const availableTotal = Math.max(
        180,
        window.innerHeight - wrap.getBoundingClientRect().top - bottomPadding,
    );
    wrap.style.maxHeight = `${availableTotal}px`;
    wrap.style.overflowY = 'auto';

    const containerStyle = getComputedStyle(container);
    const panelOverhead = parseFloat(containerStyle.paddingTop)
        + parseFloat(containerStyle.paddingBottom)
        + 8;
    const labels = [...container.querySelectorAll('.extension-enforcer-step-label')];
    const labelOverhead = labels.length
        ? Math.max(...labels.map(label => label.getBoundingClientRect().height)) + 6
        : 0;
    const maxImgHeight = Math.max(160, availableTotal - panelOverhead - labelOverhead);

    images.forEach(img => {
        const step = img.closest('.extension-enforcer-step');
        const columnWidth = step?.getBoundingClientRect().width || 0;
        const naturalW = img.naturalWidth;
        const naturalH = img.naturalHeight;

        img.style.maxHeight = '';
        img.style.maxWidth = '';
        img.style.width = '';
        img.style.height = '';

        if (naturalW > 0 && naturalH > 0 && columnWidth > 0) {
            const heightAtFullWidth = (columnWidth / naturalW) * naturalH;
            if (heightAtFullWidth <= maxImgHeight) {
                img.style.width = `${Math.round(columnWidth)}px`;
                img.style.height = `${Math.round(heightAtFullWidth)}px`;
            } else {
                img.style.width = `${Math.round((maxImgHeight / naturalH) * naturalW)}px`;
                img.style.height = `${Math.round(maxImgHeight)}px`;
            }
            return;
        }

        img.style.maxHeight = `${maxImgHeight}px`;
        img.style.maxWidth = columnWidth > 0 ? `${Math.round(columnWidth)}px` : '100%';
        img.style.width = 'auto';
        img.style.height = 'auto';
    });
}

function applyScreenshotContainerLayout(container, steps, { browserKey } = {}) {
    if (!container || !steps?.length) return;
    container.classList.toggle('screenshots-grid', steps.length >= 3);
    container.classList.toggle('screenshots-row', steps.length < 3);
    container.classList.toggle(
        'screenshots-plain',
        steps.length === 1 && steps.every(s => s.plainPanel),
    );
    container.classList.toggle(
        'safari-screenshots-asymmetric',
        browserKey === 'safari' && steps.length === 2,
    );
}

function renderEnforcerScreenshots(container, steps, browserKey) {
    if (!container || !steps?.length) return;
    const stepsKey = `${browserKey}:${steps.map(s => s.src).join(',')}`;
    if (container.dataset.stepsKey === stepsKey) return;
    container.dataset.stepsKey = stepsKey;
    container.innerHTML = '';
    applyScreenshotContainerLayout(container, steps, { browserKey });
    steps.forEach((step, i) => {
        const figure = document.createElement('figure');
        figure.className = 'extension-enforcer-step';
        const cap = formatExtensionScreenshotCaption(step, i);
        if (cap) {
            const caption = document.createElement('figcaption');
            caption.className = 'extension-enforcer-step-label';
            caption.textContent = cap;
            figure.appendChild(caption);
        }
        const img = document.createElement('img');
        img.className = 'extension-enforcer-screenshot';
        img.src = step.src;
        img.alt = screenshotAltText(step, i, cap);
        figure.appendChild(img);
        container.appendChild(figure);
    });
    const wrap = container.closest('.extension-enforcer-screenshots-wrap');
    if (wrap && !wrap.classList.contains('hidden')) {
        scheduleEnforcerScreenshotSync(wrap);
    }
}

function closedIssueCopyKey(issue) {
    switch (issue) {
        case 'missing': return 'enforcerClosedCombinedMissing';
        case 'disabled': return 'enforcerClosedCombinedDisabled';
        case 'private': return 'enforcerClosedCombinedPrivate';
        case 'websiteaccess': return 'enforcerClosedCombinedWebsiteAccess';
        case 'access': return 'enforcerClosedCombinedAccess';
        case 'automation': return 'enforcerClosedCombinedAutomation';
        default: return 'enforcerClosedCombinedDefault';
    }
}

function closedInstructionCopyKey(issue) {
    switch (issue) {
        case 'missing': return 'enforcerClosedInstrMissing';
        case 'disabled': return 'enforcerClosedInstrDisabled';
        case 'private': return 'enforcerClosedInstrPrivateGeneric';
        case 'websiteaccess': return 'enforcerClosedInstrWebsiteAccess';
        case 'access': return 'enforcerClosedInstrDefault';
        case 'automation': return 'enforcerClosedInstrAutomationGeneric';
        default: return 'enforcerClosedInstrDefault';
    }
}

function ensureClosedBannerBrowserIcon(banner) {
    const content = banner.querySelector('.update-banner-content');
    if (!content) return null;
    let icon = content.querySelector('.extension-enforcer-browser-icon');
    if (!icon) {
        icon = document.createElement('img');
        icon.className = 'extension-enforcer-browser-icon';
        icon.setAttribute('aria-hidden', 'true');
        const message = content.querySelector('.extension-enforcer-message');
        if (message) content.insertBefore(icon, message);
        else content.prepend(icon);
    }
    return icon;
}

function partitionEnforcerStates(states) {
    const automation = [];
    const focus = [];
    for (const state of states) {
        if (state.payload?.issue === 'automation') automation.push(state);
        else focus.push(state);
    }
    return { automation, focus };
}

function renderEnforcerAutomationActionRow(automationStates, mode) {
    const row = document.createElement('div');
    row.className = 'extension-enforcer-browser-action-row extension-enforcer-automation-row';

    const action = document.createElement('button');
    action.className = 'update-banner-btn extension-enforcer-action-btn';
    action.type = 'button';
    action.textContent = tSettings('migrationOpenAutomationSettings');
    const keys = automationStates.map((s) => s.key);
    action.onclick = async () => {
        try {
            await tauriAPI.openAutomationSettings();
            if (mode === 'closed') scheduleAutomationVerificationPoll(keys);
        } catch (e) {
            console.warn('[enforcer-ui] automation fix failed:', e);
        }
    };
    row.appendChild(action);

    const steps = automationScreenshotSteps();
    const showMe = document.createElement('button');
    showMe.className = 'extension-enforcer-show-me-btn';
    showMe.type = 'button';
    showMe.setAttribute('aria-expanded', 'false');
    showMe.innerHTML = enforcerShowMeHowButtonHtml();
    showMe.classList.toggle('hidden', !steps?.length);
    showMe.onclick = () => {
        const banner = mode === 'closed'
            ? ensureClosedEnforcerActionBanner()
            : ensureActiveEnforcerActionBanner();
        const screenshotsWrap = banner.querySelector('.extension-enforcer-screenshots-wrap');
        const screenshots = banner.querySelector('.extension-enforcer-screenshots');
        if (!steps?.length || !screenshotsWrap || !screenshots) return;
        const browserKey = keys[0] || 'chrome';
        const wasOpen = !screenshotsWrap.classList.contains('hidden')
            && screenshots.dataset.stepsKey?.startsWith(`${browserKey}:`);
        if (wasOpen) {
            screenshotsWrap.classList.add('hidden');
            showMe.classList.remove('open');
            showMe.setAttribute('aria-expanded', 'false');
        } else {
            renderEnforcerScreenshots(screenshots, steps, browserKey);
            screenshotsWrap.classList.remove('hidden');
            showMe.classList.add('open');
            showMe.setAttribute('aria-expanded', 'true');
            scheduleEnforcerScreenshotSync(screenshotsWrap);
        }
    };
    row.appendChild(showMe);

    return row;
}

function renderEnforcerActionRows(states, mode) {
    const { automation, focus } = partitionEnforcerStates(states);
    const frag = document.createDocumentFragment();
    if (automation.length) frag.appendChild(renderEnforcerAutomationActionRow(automation, mode));
    for (const state of focus) frag.appendChild(renderEnforcerBrowserActionRow(state, mode));
    return frag;
}

function renderEnforcerBrowserActionRow(state, mode) {
    const row = document.createElement('div');
    row.className = 'extension-enforcer-browser-action-row';

    if (mode !== 'closed') {
        const icon = document.createElement('img');
        icon.className = 'extension-enforcer-browser-action-icon';
        icon.src = browserIconUrl(state.key);
        icon.alt = '';
        row.appendChild(icon);
    }

    const action = document.createElement('button');
    action.className = 'update-banner-btn extension-enforcer-action-btn';
    action.type = 'button';
    if (state.copy.actionHtml) {
        action.innerHTML = state.copy.actionHtml;
    } else {
        action.textContent = state.copy.action || tSettingsFmt('enforcerActionOpenExtensions', { browser: state.payload.label || state.payload.browser || state.key });
    }
    action.onclick = () => openEnforcerFix(state.payload);
    row.appendChild(action);

    const showMe = document.createElement('button');
    showMe.className = 'extension-enforcer-show-me-btn';
    showMe.type = 'button';
    showMe.setAttribute('aria-expanded', 'false');
    showMe.innerHTML = enforcerShowMeHowButtonHtml();
    const steps = state.copy.screenshotSteps;
    showMe.classList.toggle('hidden', !steps?.length);
    showMe.onclick = () => {
        const banner = mode === 'closed'
            ? ensureClosedEnforcerActionBanner()
            : ensureActiveEnforcerActionBanner();
        const screenshotsWrap = banner.querySelector('.extension-enforcer-screenshots-wrap');
        const screenshots = banner.querySelector('.extension-enforcer-screenshots');
        if (!steps?.length || !screenshotsWrap || !screenshots) return;
        const wasOpen = !screenshotsWrap.classList.contains('hidden')
            && screenshots.dataset.stepsKey?.startsWith(`${state.key}:`);
        if (wasOpen) {
            screenshotsWrap.classList.add('hidden');
            showMe.classList.remove('open');
            showMe.setAttribute('aria-expanded', 'false');
        } else {
            renderEnforcerScreenshots(screenshots, steps, state.key);
            screenshotsWrap.classList.remove('hidden');
            showMe.classList.add('open');
            showMe.setAttribute('aria-expanded', 'true');
            scheduleEnforcerScreenshotSync(screenshotsWrap);
        }
    };
    row.appendChild(showMe);

    // The automation issue has no extension URL to copy — skip the chip.
    if (!state.copy.hideUrlChip) {
        const url = document.createElement('button');
        url.type = 'button';
        url.className = 'extension-enforcer-action-url';
        if (state.urlCopiedUntil) url.dataset.copiedUntil = String(state.urlCopiedUntil);
        populateEnforcerUrlChip(url, state.key);
        url.onclick = async () => {
            await copyEnforcerUrlChip(url);
            const store = mode === 'closed' ? enforcerClosedBannerStates : enforcerActionBannerStates;
            const stored = store.get(state.key);
            if (stored) stored.urlCopiedUntil = Number(url.dataset.copiedUntil || 0);
        };
        row.appendChild(url);
    }

    return row;
}

function hasActiveEnforcerCountdown() {
    const now = Date.now();
    return [...enforcerActionBannerStates.values()].some(state =>
        state.closing || state.deadline > now);
}

function promoteEnforcerActionToClosed(key, payload) {
    if (!payload) return;
    enforcerClosedBannerStates.set(key, {
        ...(enforcerClosedBannerStates.get(key) || {}),
        payload,
        closedAt: Date.now(),
    });
}

function resetEnforcerClosedBannerCycle() {
    if (enforcerClosedBannerStates.size === 0) return;
    enforcerClosedBannerStates.clear();
    stopEnforcerClosedBannerPoll();
    document.getElementById(ENFORCER_CLOSED_BANNER_ID)?.classList.add('hidden');
}

function renderCombinedEnforcerActionBanner() {
    const banner = ensureActiveEnforcerActionBanner();
    const states = [...enforcerActionBannerStates.entries()].map(([key, state]) => ({ key, ...state }));
    if (states.length === 0) {
        banner.classList.add('hidden');
        renderCombinedEnforcerClosedBanner();
        return;
    }

    const activeStates = states
        .map(state => {
            const remainingSecs = state.closing
                ? 0
                : Math.max(0, Math.ceil((state.deadline - Date.now()) / 1000));
            const payload = { ...state.payload, remaining_secs: remainingSecs, remainingSecs };
            return { ...state, payload, remainingSecs, copy: enforcerCopy(payload) };
        })
        .filter(state => state.remainingSecs > 0 || state.closing);

    if (activeStates.length === 0) {
        banner.classList.add('hidden');
        renderCombinedEnforcerClosedBanner();
        return;
    }

    const allClosing = activeStates.every(state => state.closing);
    const timerState = activeStates.reduce((max, state) => (
        state.remainingSecs > max.remainingSecs ? state : max
    ), activeStates[0]);
    const labels = activeStates.map(state => state.payload.label || state.payload.browser || BROWSER_STORE_LINKS[state.key]?.label || state.key);
    const browserList = formatBrowserList(labels);

    const headline = banner.querySelector('.extension-enforcer-action-headline-text');
    if (headline) {
        headline.textContent = allClosing
            ? tSettingsFmt('enforcerClosingNowHeadline', { browser: browserList })
            : tSettingsFmt('enforcerClosingHeadline', { browser: browserList });
    }

    const instruction = banner.querySelector('.extension-enforcer-action-instruction');
    if (instruction) {
        const { automation, focus } = partitionEnforcerStates(activeStates);
        const base = activeStates.length > 1
            ? (automation.length && !focus.length
                ? tSettings('enforcerCountdownInstrAutomation')
                : tSettings('enforcerCountdownInstrMultiple'))
            : (timerState.copy.countdownInstruction || '');
        renderEnforcerCountdownInstruction(instruction, base);
    }

    const countdown = banner.querySelector('.extension-enforcer-action-countdown');
    const countdownRow = banner.querySelector('.extension-enforcer-action-countdown-row');
    if (countdownRow) countdownRow.classList.toggle('hidden', allClosing);
    if (countdown) {
        if (allClosing) {
            countdown.replaceChildren();
        } else {
            const mins = Math.floor(timerState.remainingSecs / 60);
            const secs = String(timerState.remainingSecs % 60).padStart(2, '0');
            countdown.replaceChildren();
            const time = document.createElement('strong');
            time.className = 'extension-enforcer-countdown-time';
            time.textContent = `${mins}:${secs}`;
            const label = document.createElement('span');
            label.className = 'extension-enforcer-countdown-label';
            label.textContent = tSettings('enforcerCountdownRemaining');
            countdown.append(time, label);
        }
    }

    const progress = banner.querySelector('.extension-enforcer-progress-bar');
    if (progress) {
        const totalRaw = timerState.payload.total_secs ?? timerState.payload.totalSecs ?? timerState.remainingSecs;
        const total = Math.max(1, Number(totalRaw || 1));
        const pct = Math.max(0, Math.min(100, (timerState.remainingSecs / total) * 100));
        progress.style.width = `${pct}%`;
    }

    const actions = banner.querySelector('.extension-enforcer-active-actions');
    if (actions) {
        actions.innerHTML = '';
        actions.appendChild(renderEnforcerActionRows(activeStates, 'active'));
    }

    banner.classList.remove('hidden', 'extension-enforcer-action-banner-closed');
    document.getElementById(ENFORCER_CLOSED_BANNER_ID)?.classList.add('hidden');
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
        // Smooth handoff: once the local countdown reaches zero, keep
        // the active banner alive in "Closing..." mode until the
        // backend confirms the browser is gone (post-close) or resolved.
        if (remainingSecs <= 0) {
            state.closing = true;
        }
    }
    renderCombinedEnforcerActionBanner();
    if (enforcerActionBannerStates.size === 0 && enforcerActionBannerInterval) {
        clearInterval(enforcerActionBannerInterval);
        enforcerActionBannerInterval = null;
    }
}

function renderEnforcerActionBanner(payload) {
    if (!payload || !payload.browser) return;
    const key = enforcerBannerKey(payload);
    if (enforcerActionBannerStates.size === 0) {
        // A fresh countdown starts a new enforcement cycle. Drop any
        // previous post-close browsers so the next closed banner only
        // reflects browsers involved in this cycle.
        resetEnforcerClosedBannerCycle();
    }

    const remainingSecs = Math.max(0, Number(payload.remaining_secs ?? payload.remainingSecs ?? 0));
    const existing = enforcerActionBannerStates.get(key);
    enforcerActionBannerStates.set(key, {
        payload: { ...payload, remaining_secs: remainingSecs, remainingSecs },
        deadline: Date.now() + remainingSecs * 1000,
        closing: payload.closing != null ? !!payload.closing : (existing?.closing ?? false),
        urlCopiedUntil: existing?.urlCopiedUntil,
    });

    renderCombinedEnforcerActionBanner();
    document.getElementById(ENFORCER_CLOSED_BANNER_ID)?.classList.add('hidden');
    if (!enforcerActionBannerInterval) {
        enforcerActionBannerInterval = setInterval(updateEnforcerActionBannerCountdown, 1000);
    }
}

function renderCombinedEnforcerClosedBanner() {
    const banner = ensureClosedEnforcerActionBanner();
    if (hasActiveEnforcerCountdown()) {
        banner.classList.add('hidden');
        return;
    }

    const states = [...enforcerClosedBannerStates.entries()]
        .map(([key, state]) => ({ key, ...state, copy: enforcerClosedCopy(state.payload) }));

    if (states.length === 0) {
        banner.classList.add('hidden');
        stopEnforcerClosedBannerPoll();
        return;
    }

    ensureEnforcerClosedBannerPoll();

    banner.querySelector('.extension-enforcer-action-right')?.remove();

    const browserList = formatBrowserList(states.map(state => (
        state.payload.label || state.payload.browser || BROWSER_STORE_LINKS[state.key]?.label || state.key
    )));
    const issue = states.every(state => state.payload.issue === states[0].payload.issue)
        ? states[0].payload.issue
        : 'unknown';

    const headline = banner.querySelector('.extension-enforcer-action-headline-text');
    if (headline) {
        headline.textContent = states.length === 1
            ? states[0].copy.headline
            : tSettingsFmt(closedIssueCopyKey(issue), { browser: browserList });
    }

    const browserIcon = ensureClosedBannerBrowserIcon(banner);
    if (browserIcon) {
        if (states.length === 1) {
            browserIcon.src = browserIconUrl(states[0].key);
            browserIcon.alt = '';
            browserIcon.style.visibility = 'visible';
        } else {
            browserIcon.style.visibility = 'hidden';
        }
    }

    const instruction = banner.querySelector('.extension-enforcer-action-instruction');
    if (instruction) {
        const { automation, focus } = partitionEnforcerStates(states);
        if (states.length > 1) {
            if (automation.length && !focus.length) {
                instruction.textContent = tSettingsFmt(
                    'enforcerClosedInstrAutomationGeneric',
                    { browser: formatBrowserList(automation.map((s) => (
                        s.payload.label || s.payload.browser || BROWSER_STORE_LINKS[s.key]?.label || s.key
                    ))) }
                );
            } else {
                instruction.textContent = tSettings('enforcerClosedInstrMultiple');
            }
        } else {
            // Single-browser case: pass the browser name in for
            // `{browser}` substitution. Several of these instruction
            // strings (enforcerClosedInstrDisabled / Missing /
            // WebsiteAccess) contain `{browser}` — using tSettings()
            // here left the literal placeholder visible in the UI.
            const single = states[0];
            const browser = single.payload.label
                || single.payload.browser
                || BROWSER_STORE_LINKS[single.key]?.label
                || single.key;
            instruction.textContent = tSettingsFmt(
                closedInstructionCopyKey(issue),
                { browser }
            );
        }
    }

    const actions = banner.querySelector('.extension-enforcer-closed-actions');
    if (actions) {
        actions.innerHTML = '';
        actions.appendChild(renderEnforcerActionRows(states, 'closed'));
    }

    banner.classList.remove('hidden');
}

function renderEnforcerClosedBanner(payload) {
    if (!payload || (!payload.browser && !payload.label)) return;
    const key = enforcerBannerKey(payload);
    enforcerActionBannerStates.delete(key);
    if (enforcerActionBannerStates.size === 0 && enforcerActionBannerInterval) {
        clearInterval(enforcerActionBannerInterval);
        enforcerActionBannerInterval = null;
    }
    promoteEnforcerActionToClosed(key, payload);
    renderCombinedEnforcerActionBanner();
}

function hideEnforcerActionBanner(browser) {
    const key = browserKeyFromLabel(browser);
    enforcerActionBannerStates.delete(key);
    enforcerClosedBannerStates.delete(key);
    renderCombinedEnforcerActionBanner();
    if (enforcerActionBannerStates.size === 0 && enforcerActionBannerInterval) {
        clearInterval(enforcerActionBannerInterval);
        enforcerActionBannerInterval = null;
    }
}

// ---- App-blocking: "Let's go!" warning (driven by native watcher) ---------
//
// Two pieces of UI:
//   1. The full-screen always-on-top overlay (raised by the native watcher
//      when a blocked PID first appears; rendered out of `appBlockingWarningRows`
//      entries that have NO `ackedDeadlineMs`).
//   2. The in-app countdown banner (shown after the user clicks "Let's go!";
//      driven by entries that have an `ackedDeadlineMs` set).
//
// Per-row ack metadata so the overlay and banner can coexist sensibly
// when a new blocked app gets launched mid-countdown — the new PID
// shows in the overlay while the previously-acked PIDs continue
// counting down in the banner.

/** @type {Map<number, { name: string, ackedDeadlineMs?: number }>} */
const appBlockingWarningRows = new Map();
let appBlockingWarningUiAttached = false;
let appBlockingClosedownTickInterval = null;

/// 30 seconds of wrap-up time after the user clicks "Let's go!" before
/// the watcher sends the polite Cmd-Q. Mirrors `PREQUIT_DURATION` in
/// `app_watcher.rs`. Kept in JS too so the banner can show the right
/// countdown without a server round-trip.
const APP_BLOCKING_CLOSEDOWN_PREQUIT_MS = 30 * 1000;
/// Schedule-block warnings may be snoozed once for this long before the
/// overlay reappears (without the snooze button on the second show).
const APP_BLOCKING_SCHEDULE_SNOOZE_MS = 2 * 60 * 1000;

function buildAppBlockingSnoozeIconImg(size) {
    return `<img src="${snoozeIconUrl}" alt="" class="app-blocking-snooze-icon" width="${size}" height="${size}" aria-hidden="true">`;
}

export const APP_BLOCKING_SNOOZE_ICON_IMG_12 = buildAppBlockingSnoozeIconImg(12);

/** `'schedule'` | `'manual'` | null — set when apps newly enter the blocked set. */
let appBlockingWarningSnoozeUsed = false;
export let appBlockingWarningSnoozedUntilMs = 0;
let appBlockingWarningSnoozeTimer = null;
let appBlockingSnoozedBlocklistId = null;
let appBlockingSnoozeCardTickInterval = null;
let appBlockingPreviousManualAppsSet = null;
let appBlockingPreviousScheduleAppsSet = null;
/** Per-app attribution for the block that just started blocking it. */
/** @type {Map<string, { blocklistId: string, source: 'schedule'|'manual' }>} */
const appBlockingNewlyAddedMeta = new Map();

function clearAppBlockingWarningSnoozeTimer() {
    if (appBlockingWarningSnoozeTimer !== null) {
        window.clearTimeout(appBlockingWarningSnoozeTimer);
        appBlockingWarningSnoozeTimer = null;
    }
}

function stopAppBlockingSnoozeCardTick() {
    if (appBlockingSnoozeCardTickInterval !== null) {
        window.clearInterval(appBlockingSnoozeCardTickInterval);
        appBlockingSnoozeCardTickInterval = null;
    }
}

function ensureAppBlockingSnoozeCardTick() {
    if (appBlockingSnoozeCardTickInterval !== null) return;
    appBlockingSnoozeCardTickInterval = window.setInterval(() => {
        if (appBlockingWarningSnoozedUntilMs <= Date.now()) {
            stopAppBlockingSnoozeCardTick();
            return;
        }
        if (typeof renderBlocklists === 'function') renderBlocklists();
    }, 1000);
}

export function getActiveAppBlockingSnoozeBlocklistId(now = Date.now()) {
    if (appBlockingWarningSnoozedUntilMs <= now) return null;
    return appBlockingSnoozedBlocklistId;
}

function resolveSnoozedBlocklistIdFromWarning() {
    const unknownApp = tSettings('appBlockingUnknownApp');
    const rawNames = [];
    for (const [, row] of appBlockingWarningRows) {
        if (row.ackedDeadlineMs) continue;
        const n = (row.name || unknownApp).trim() || unknownApp;
        rawNames.push(n);
    }
    const names = uniqueBlockedAppDisplayNames(rawNames);
    if (names.length === 0) return null;
    return findResponsibleBlocklistForWarningApps(names)?.id ?? null;
}

export function formatAppBlockingSnoozeStartsIn(remainingMs) {
    const mins = Math.max(1, Math.ceil(remainingMs / 60000));
    if (mins < 60) {
        return tSettingsFmt('blocklistScheduleStartsInMinutesFmt', { n: String(mins) });
    }
    const hrs = Math.floor(mins / 60);
    const remMins = mins % 60;
    if (hrs < 24) {
        if (remMins > 0) {
            return tSettingsFmt('blocklistScheduleStartsInHoursFmt', { n: String(hrs) })
                + ` ${remMins}m`;
        }
        return tSettingsFmt('blocklistScheduleStartsInHoursFmt', { n: String(hrs) });
    }
    return tSettingsFmt('blocklistScheduleStartsInDaysFmt', {
        n: String(Math.floor(mins / (24 * 60))),
    });
}

function resetAppBlockingWarningSnoozeState() {
    clearAppBlockingWarningSnoozeTimer();
    stopAppBlockingSnoozeCardTick();
    appBlockingWarningSnoozedUntilMs = 0;
    appBlockingWarningSnoozeUsed = false;
    appBlockingSnoozedBlocklistId = null;
    appBlockingNewlyAddedMeta.clear();
    if (typeof renderBlocklists === 'function') renderBlocklists();
}

function collectManualBlockedApps(now = Date.now()) {
    const set = new Set();
    for (const block of state.appData.activeBlocks || []) {
        if (block.startTime > now || block.endTime <= now || block.isPaused) continue;
        const blocklist = state.appData.blocklists.find((bl) => bl.id === block.blocklistId);
        for (const app of blocklist?.apps || []) {
            if (!isProtectedApp(app)) set.add(app);
        }
    }
    return set;
}

function collectScheduleBlockedApps(now = Date.now()) {
    const set = new Set();
    const nowDate = new Date(now);
    for (const schedule of state.appData.schedules || []) {
        if (!schedule.segments) continue;
        if (isSchedulePausedNow(schedule, now)) continue;
        if (!isScheduleSegmentActiveNow(schedule, nowDate)) continue;
        const blocklist = state.appData.blocklists.find((bl) => bl.id === schedule.blocklistId);
        for (const app of blocklist?.apps || []) {
            if (!isProtectedApp(app)) set.add(app);
        }
    }
    return set;
}

function findManualBlocklistIdForApp(appName, now = Date.now()) {
    const target = String(appName || '').trim().toLowerCase();
    if (!target) return null;
    for (const block of state.appData.activeBlocks || []) {
        if (block.startTime > now || block.endTime <= now || block.isPaused) continue;
        const blocklist = state.appData.blocklists.find((bl) => bl.id === block.blocklistId);
        if (blocklist?.apps?.some((a) => String(a).trim().toLowerCase() === target)) {
            return blocklist.id;
        }
    }
    return null;
}

function findScheduleBlocklistIdForApp(appName, now = Date.now(), nowDate = new Date(now)) {
    const target = String(appName || '').trim().toLowerCase();
    if (!target) return null;
    for (const schedule of state.appData.schedules || []) {
        if (!schedule.segments) continue;
        if (isSchedulePausedNow(schedule, now)) continue;
        if (!isScheduleSegmentActiveNow(schedule, nowDate)) continue;
        const blocklist = state.appData.blocklists.find((bl) => bl.id === schedule.blocklistId);
        if (blocklist?.apps?.some((a) => String(a).trim().toLowerCase() === target)) {
            return blocklist.id;
        }
    }
    return null;
}

function noteAppBlockingNewlyAddedMeta(
    newlyAddedApps,
    manualApps,
    scheduleApps,
    prevManual,
    prevSchedule,
    now,
    nowDate,
) {
    appBlockingNewlyAddedMeta.clear();
    for (const app of newlyAddedApps) {
        const newFromManual = !prevManual.has(app) && manualApps.has(app);
        const newFromSchedule = !prevSchedule.has(app) && scheduleApps.has(app);
        if (newFromSchedule && !newFromManual) {
            const blocklistId = findScheduleBlocklistIdForApp(app, now, nowDate);
            if (blocklistId) appBlockingNewlyAddedMeta.set(app, { blocklistId, source: 'schedule' });
        } else if (newFromManual) {
            const blocklistId = findManualBlocklistIdForApp(app, now);
            if (blocklistId) appBlockingNewlyAddedMeta.set(app, { blocklistId, source: 'manual' });
        } else if (newFromSchedule) {
            const blocklistId = findManualBlocklistIdForApp(app, now)
                ?? findScheduleBlocklistIdForApp(app, now, nowDate);
            if (blocklistId) appBlockingNewlyAddedMeta.set(app, { blocklistId, source: 'manual' });
        }
    }
}

/** True when the current warning is from a schedule block (not a manual one-off). */
function isAppBlockingWarningScheduleEligible(appNames) {
    return appNames.some((appName) => {
        const meta = appBlockingNewlyAddedMeta.get(appName);
        if (meta) return meta.source === 'schedule';
        if (findManualBlocklistIdForApp(appName)) return false;
        return !!findScheduleBlocklistIdForApp(appName);
    });
}

function onAppBlockingSnoozeExpired() {
    appBlockingWarningSnoozeTimer = null;
    appBlockingWarningSnoozedUntilMs = 0;
    appBlockingSnoozedBlocklistId = null;
    stopAppBlockingSnoozeCardTick();
    if (typeof renderBlocklists === 'function') renderBlocklists();

    const unackedPids = [...appBlockingWarningRows.entries()]
        .filter(([, row]) => !row.ackedDeadlineMs)
        .map(([pid]) => pid);
    if (unackedPids.length === 0) return;

    renderAppBlockingWarningOverlay();
    tauriAPI
        .reshowBlockingWarning(unackedPids)
        .catch((e) => console.warn('[app-blocking-ui] snooze re-show:', e));
}

function setupAppBlockingWarningOverlay() {
    if (state.isIOS || state.isAndroid || appBlockingWarningUiAttached) return;
    appBlockingWarningUiAttached = true;

    const snoozeIconEl = document.querySelector('#app-blocking-snooze-btn .app-blocking-snooze-icon');
    if (snoozeIconEl) snoozeIconEl.src = snoozeIconUrl;

    // Resolve friendly app names (e.g. "Microsoft Edge") when the warning UI needs them.
    void ensureInstalledAppsCache().then(() => {
        if (appBlockingWarningRows.size > 0) {
            renderAppBlockingWarningOverlay();
            renderAppBlockingClosedownBanner();
        }
        if (typeof renderBlocklists === 'function' && state.appData?.blocklists?.length) {
            renderBlocklists();
        }
    });

    const onFail = (label) => (e) => {
        console.warn(`[app-blocking-ui] failed to attach ${label}:`, e);
        appBlockingWarningUiAttached = false;
    };

    // The new flow has just two events: warning-show (user-ack required)
    // and warning-hide (the PID exited or got SIGKILLed). The old
    // warning-update countdown stream is gone — there's no number to tick.
    tauriAPI.onAppBlockingWarningShow((event) => {
        const p = event?.payload || {};
        const pid = Number(p.pid);
        if (!Number.isFinite(pid)) return;
        appBlockingWarningRows.set(pid, {
            name: p.name || 'App',
        });
        renderAppBlockingWarningOverlay();
        renderAppBlockingClosedownBanner();
    }).catch(onFail('warning-show'));

    tauriAPI.onAppBlockingWarningHide((event) => {
        const p = event?.payload || {};
        const pid = Number(p.pid);
        if (!Number.isFinite(pid)) return;
        appBlockingWarningRows.delete(pid);
        if (appBlockingWarningRows.size === 0) {
            resetAppBlockingWarningSnoozeState();
        }
        renderAppBlockingWarningOverlay();
        renderAppBlockingClosedownBanner();
    }).catch(onFail('warning-hide'));

    const snoozeBtn = document.getElementById('app-blocking-snooze-btn');
    snoozeBtn?.addEventListener('click', () => {
        appBlockingWarningSnoozeUsed = true;
        appBlockingWarningSnoozedUntilMs = Date.now() + APP_BLOCKING_SCHEDULE_SNOOZE_MS;
        appBlockingSnoozedBlocklistId = resolveSnoozedBlocklistIdFromWarning();
        applyWarningOverlayPresence();
        clearAppBlockingWarningSnoozeTimer();
        ensureAppBlockingSnoozeCardTick();
        if (typeof renderBlocklists === 'function') renderBlocklists();
        appBlockingWarningSnoozeTimer = window.setTimeout(
            onAppBlockingSnoozeExpired,
            APP_BLOCKING_SCHEDULE_SNOOZE_MS,
        );
        tauriAPI
            .snoozeBlockingWarning()
            .catch((e) => console.warn('[app-blocking-ui] snooze:', e));
    });

    // "Let's go!" button — ack every currently-awaiting row, hide the
    // full-screen overlay immediately, and surface the in-app close-down
    // countdown banner. The watcher's AwaitingUserAck → PreQuit
    // transition happens server-side via `letsGoAcknowledge`; we just
    // mirror that timeline in the UI so the user sees how long they
    // have to wrap up.
    const letsGoBtn = document.getElementById('app-blocking-lets-go-btn');
    letsGoBtn?.addEventListener('click', () => {
        resetAppBlockingWarningSnoozeState();
        void playAppBlockingLetsGoVoice();
        const ackedDeadlineMs = Date.now() + APP_BLOCKING_CLOSEDOWN_PREQUIT_MS;
        for (const row of appBlockingWarningRows.values()) {
            if (!row.ackedDeadlineMs) row.ackedDeadlineMs = ackedDeadlineMs;
        }
        applyWarningOverlayPresence();
        renderAppBlockingClosedownBanner();
        tauriAPI
            .letsGoAcknowledge()
            .catch((e) => console.warn('[app-blocking-ui] lets-go ack:', e));
    });

    void reconcileBlockingWarningShell();
}

/** Find a blocklist that currently enforces blocking for `appName`
 *  (active schedule segment or one-off), preferring schedules. */
function findActiveBlocklistForBlockedAppName(appName) {
    if (!appName) return null;
    const target = String(appName).trim().toLowerCase();
    if (!target) return null;
    const now = Date.now();
    const nowDate = new Date(now);

    for (const schedule of state.appData.schedules || []) {
        if (!schedule.segments) continue;
        if (isSchedulePausedNow(schedule, now)) continue;
        if (!isScheduleSegmentActiveNow(schedule, nowDate)) continue;
        const blocklist = state.appData.blocklists.find((bl) => bl.id === schedule.blocklistId);
        if (blocklist?.apps?.some((a) => String(a).trim().toLowerCase() === target)) {
            return blocklist;
        }
    }

    for (const block of state.appData.activeBlocks || []) {
        if (block.startTime > now || block.endTime <= now || block.isPaused) continue;
        const blocklist = state.appData.blocklists.find((bl) => bl.id === block.blocklistId);
        if (blocklist?.apps?.some((a) => String(a).trim().toLowerCase() === target)) {
            return blocklist;
        }
    }

    return null;
}

/** Pick the blocklist to show in the warning overlay for the given apps. */
export function findResponsibleBlocklistForWarningApps(appNames) {
    for (const appName of appNames) {
        const meta = appBlockingNewlyAddedMeta.get(appName);
        if (meta?.blocklistId) {
            const blocklist = state.appData.blocklists.find((bl) => bl.id === meta.blocklistId);
            if (blocklist) return blocklist;
        }
    }
    for (const appName of appNames) {
        const blocklist = findActiveBlocklistForBlockedAppName(appName);
        if (blocklist) return blocklist;
    }
    for (const appName of appNames) {
        const blocklist = findBlocklistForBlockedAppName(appName);
        if (blocklist) return blocklist;
    }
    return null;
}

/** Find any blocklist that lists `appName` (case-insensitive). Last-resort
 *  fallback when no active enforcement source can be determined. */
function findBlocklistForBlockedAppName(appName) {
    if (!appName) return null;
    const target = String(appName).trim().toLowerCase();
    if (!target) return null;
    const blocklists = state.appData?.blocklists || [];
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

    if (appBlockingWarningRows.size === 0) {
        state.appBlockingActiveStartOverlay = null;
        applyWarningOverlayPresence();
        return;
    }

    const unknownApp = tSettings('appBlockingUnknownApp');
    const rawNames = [];
    for (const [, row] of appBlockingWarningRows) {
        if (row.ackedDeadlineMs) continue;
        const n = (row.name || unknownApp).trim() || unknownApp;
        rawNames.push(n);
    }
    const names = uniqueBlockedAppDisplayNames(rawNames);
    if (names.length === 0) {
        state.appBlockingActiveStartOverlay = null;
        applyWarningOverlayPresence();
        return;
    }

    const responsibleBlocklist = findResponsibleBlocklistForWarningApps(names);
    const blocklistName = responsibleBlocklist?.name || tSettings('appBlockingFallbackBlocklistName');
    const blocklistEmoji = responsibleBlocklist?.emoji || '🎯';
    const startOverlay = getScheduleStartOverlayForWarningApps(names);

    const headingEl = document.getElementById('app-blocking-warning-heading');
    const summaryEl = document.getElementById('app-blocking-warning-summary');
    const emojiWrapEl = document.getElementById('app-blocking-warning-emoji-wrap');
    const emojiEl = document.getElementById('app-blocking-warning-emoji');
    const imageEl = document.getElementById('app-blocking-warning-image');
    const letsGoBtn = document.getElementById('app-blocking-lets-go-btn');
    const letsGoLabelEl = document.getElementById('app-blocking-lets-go-btn-label');
    const letsGoVoiceIconEl = document.getElementById('app-blocking-lets-go-voice-icon');
    const snoozeBtn = document.getElementById('app-blocking-snooze-btn');

    letsGoBtn?.removeAttribute('disabled');

    const showSnooze = isAppBlockingWarningScheduleEligible(names)
        && !appBlockingWarningSnoozeUsed
        && appBlockingWarningSnoozedUntilMs <= Date.now();
    snoozeBtn?.classList.toggle('hidden', !showSnooze);

    // Native code enters full-screen warning mode before this handler runs.
    // Show the overlay immediately so the window is never a blank white shell
    // while custom overlay assets load.
    applyWarningOverlayPresence();

    void applyScheduleStartOverlayPresentation({
        overlay: startOverlay,
        blocklistName,
        blocklistEmoji,
        appNames: names,
        headingEl,
        summaryEl,
        emojiWrapEl,
        emojiEl,
        imageEl,
        letsGoLabelEl,
        letsGoVoiceIconEl,
    }).then((activeOverlay) => {
        state.appBlockingActiveStartOverlay = activeOverlay;
        applyWarningOverlayPresence();
    }).catch((err) => {
        console.warn('[schedule-overlay] warning presentation failed:', err);
        applyWarningOverlayPresence();
    });
}

// ---- Warning-overlay coordinator -----------------------------------------
//
// Reconciles the always-on-top compact-window panel mode with the only
// warning surface we now have — the app-blocking "Let's go!" warning.
// The native watcher's `blocking_warning_begin/end` already manages the
// panel-mode refcount in Rust (see `emit_warning_show/_hide`), so this
// function is purely DOM-side: overlay visibility, body class for the
// compact-mode CSS, and resize-observer setup.
function applyWarningOverlayPresence() {
    if (state.isIOS || state.isAndroid) return;
    const overlay = document.getElementById('app-blocking-warning-overlay');
    if (!overlay) return;

    // Show the overlay only for rows the user hasn't yet acknowledged
    // — once they've clicked "Let's go!" the row gets an
    // `ackedDeadlineMs` and migrates from the overlay to the banner.
    // Also hide while a schedule snooze is active.
    const hasUnackedRows = [...appBlockingWarningRows.values()]
        .some((row) => !row.ackedDeadlineMs);
    const isSnoozed = appBlockingWarningSnoozedUntilMs > Date.now();

    overlay.classList.toggle('hidden', !hasUnackedRows || isSnoozed);
    const inWarningMode = hasUnackedRows && !isSnoozed;
    document.documentElement.classList.toggle('app-blocking-warning-window-mode', inWarningMode);
    document.body.classList.toggle('app-blocking-warning-window-mode', inWarningMode);

    if (!inWarningMode) {
        void restoreBlockingWarningShellIfIdle();
    }
}

function restoreBlockingWarningShellIfIdle() {
    if (state.isIOS || state.isAndroid) return Promise.resolve();
    return tauriAPI.reconcileBlockingWarningShell().catch(() => {});
}

async function reconcileBlockingWarningShell() {
    if (state.isIOS || state.isAndroid) return;
    applyWarningOverlayPresence();
}

/// Render the in-app close-down countdown banner. Idempotent — call
/// whenever rows change or the timer ticks. Shows the soonest deadline
/// across acked rows so the countdown reads honestly.
function renderAppBlockingClosedownBanner() {
    const banner = document.getElementById('app-blocking-closedown-banner');
    const text = document.getElementById('app-blocking-closedown-banner-text');
    if (!banner || !text) return;

    const acked = [...appBlockingWarningRows.values()].filter(
        (row) => typeof row.ackedDeadlineMs === 'number',
    );
    if (acked.length === 0) {
        banner.classList.add('hidden');
        stopAppBlockingClosedownTick();
        return;
    }

    const appFallback = tSettings('appBlockingBannerAppFallback');
    const rawNames = acked.map((r) => (r.name || appFallback).trim() || appFallback);
    const names = uniqueBlockedAppDisplayNames(rawNames);
    const appsHtml = joinAppListWithLimit(names, 3);
    const soonestDeadline = Math.min(...acked.map((r) => r.ackedDeadlineMs));
    const remainingMs = Math.max(0, soonestDeadline - Date.now());
    const remainingSecs = Math.ceil(remainingMs / 1000);

    if (remainingSecs > 0) {
        text.innerHTML = tSettingsFmt('appBlockingClosedownCountdownHtml', {
            apps: appsHtml,
            seconds: String(remainingSecs),
        });
    } else {
        // PreQuit elapsed — Rust is now sending Cmd-Q and waiting on
        // the 10s SIGKILL grace. Banner stays up until the watcher's
        // warning-hide event clears the row.
        const finalKey = names.length === 1
            ? 'appBlockingClosedownFinalSingleHtml'
            : 'appBlockingClosedownFinalMultiHtml';
        text.innerHTML = tSettingsFmt(finalKey, { apps: appsHtml });
    }

    banner.classList.remove('hidden');
    ensureAppBlockingClosedownTick();
}

function ensureAppBlockingClosedownTick() {
    if (appBlockingClosedownTickInterval !== null) return;
    appBlockingClosedownTickInterval = window.setInterval(() => {
        renderAppBlockingClosedownBanner();
    }, 1000);
}

function stopAppBlockingClosedownTick() {
    if (appBlockingClosedownTickInterval !== null) {
        window.clearInterval(appBlockingClosedownTickInterval);
        appBlockingClosedownTickInterval = null;
    }
}

function normalizeBlockedAppKey(name) {
    return String(name || '').trim().replace(/\.exe$/i, '').toLowerCase();
}

export function displayNameForBlockedApp(processName) {
    const key = normalizeBlockedAppKey(processName);
    if (!key) return processName;
    const match = (state.installedAppsCache || []).find(
        (a) => normalizeBlockedAppKey(a.process_name) === key,
    );
    if (match?.display_name) return match.display_name;

    return key.charAt(0).toUpperCase() + key.slice(1);
}

export async function ensureInstalledAppsCache() {
    if (state.installedAppsCache) return;
    if (state.isIOS) return;
    try {
        if (state.isAndroid) {
            const result = await tauriAPI.androidGetInstalledApps();
            state.installedAppsCache = (result?.apps || []).map((app) => ({
                display_name: app.label || app.packageName,
                process_name: app.packageName,
                icon_base64: app.iconBase64 || null,
            }))
                .filter((app) => app.process_name)
                .sort((a, b) => a.display_name.localeCompare(b.display_name));
        } else {
            state.installedAppsCache = await tauriAPI.listInstalledApps();
        }
    } catch (e) {
        console.warn('[installed-apps] Failed to preload installed apps cache:', e);
    }
}

/** One entry per blocked app — Edge's many PIDs collapse to a single name. */
function uniqueBlockedAppDisplayNames(names) {
    const seen = new Set();
    const out = [];
    for (const name of names) {
        const key = normalizeBlockedAppKey(name);
        if (!key || seen.has(key)) continue;
        seen.add(key);
        out.push(displayNameForBlockedApp(name));
    }
    return out;
}

/** Pretty list join: "A", "A and B", "A, B and C", "A, B and 4 more". */
export function joinAppListWithLimit(names, max = 3, { bold = true } = {}) {
    const arr = names.filter(Boolean);
    const wrap = bold
        ? (n) => `<strong>${escapeHtml(n)}</strong>`
        : (n) => escapeHtml(n);
    if (arr.length === 0) return '';
    if (arr.length === 1) return wrap(arr[0]);
    const and = tSettings('andWord');
    if (arr.length <= max) {
        const head = arr.slice(0, -1).map(wrap).join(', ');
        const tail = wrap(arr[arr.length - 1]);
        return `${head} ${and} ${tail}`;
    }
    const shown = arr.slice(0, max - 1).map(wrap).join(', ');
    const remaining = arr.length - (max - 1);
    const moreLabel = tSettingsFmt('appBlockingListMoreFmt', { n: String(remaining) });
    return `${shown} ${and} ${wrap(moreLabel)}`;
}

// Check if the helper daemon is available (desktop only)
export async function checkHelperStatus() {
    if (state.isIOS || state.isAndroid) return; // Mobile uses platform blockers, not helper daemon.
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
export function isHelperInstallCancelled(errorMsg) {
    if (!errorMsg || typeof errorMsg !== 'string') return false;
    return errorMsg.startsWith('cancelled:') || errorMsg.toLowerCase().includes('cancelled');
}

/** True if the error indicates the helper daemon is not reachable (e.g. connection refused on Windows). */
export function isHelperConnectionError(errorMsg) {
    if (!errorMsg || typeof errorMsg !== 'string') return false;
    return errorMsg.includes('Failed to connect to helper') || errorMsg.includes('refused') || errorMsg.includes('10061');
}


// Check Screen Time authorization (iOS only)
async function checkScreentimeAuth() {
    try {
        const result = await tauriAPI.screentimeCheckAuth();
        state.screentimeAuthorized = result.granted;
        console.log('Screen Time auth status:', result.status);
        if (!state.screentimeAuthorized) {
            console.log('Screen Time not authorized - will prompt on first block');
        }
    } catch (err) {
        console.error('Error checking Screen Time auth:', err);
        state.screentimeAuthorized = false;
    }
    updateOnboardingVisibility();
}

// Request Screen Time authorization (iOS only)
export async function requestScreentimeAuth() {
    try {
        const result = await tauriAPI.screentimeRequestAuth();
        state.screentimeAuthorized = result.granted;
        console.log('Screen Time auth result:', result);
        return result;
    } catch (err) {
        console.error('Error requesting Screen Time auth:', err);
        state.screentimeAuthorized = false;
        return { granted: false, status: 'error', error: err.toString() };
    }
}

// Check Accessibility permission (Android only). Called on startup and
// again on `visibilitychange` while the onboarding gate is showing,
// since the user grants Accessibility in a separate system settings
// screen and there's no callback for "user came back".
async function checkAndroidPermissions() {
    try {
        const result = await tauriAPI.androidCheckPermissions();
        state.androidPermissionsGranted = !!result.accessibilityEnabled;
        console.log('Android permissions:', result);
    } catch (err) {
        console.error('Error checking Android permissions:', err);
        state.androidPermissionsGranted = false;
    }
    updateOnboardingVisibility();
}

async function initializeAndroidBlockingState() {
    await migrateAndroidNativeSchedules();
    await syncSchedulesToHelper();
}

const ANDROID_DAY_TO_MON0 = {
    MONDAY: 0, TUESDAY: 1, WEDNESDAY: 2, THURSDAY: 3, FRIDAY: 4, SATURDAY: 5, SUNDAY: 6,
};

// One-time upward migration: reads the legacy redd-block-android app's
// SharedPreferences (via `read_native_schedules`, same device-protected
// storage file the Kotlin plugin still writes/reads — applicationId is
// unchanged across the update, see tauri-plugin-android-blocker/README)
// and converts each legacy Schedule into this app's blocklist+schedule
// model. Runs once; the flag is only set after a successful save+sync so
// a crash mid-migration doesn't leave a half-imported state.
async function migrateAndroidNativeSchedules() {
    if (!state.isAndroid) return;
    if (state.appData.settings?.androidMigrationDone) return;

    try {
        const { routinesJson } = await tauriAPI.androidReadNativeSchedules();
        const legacySchedules = JSON.parse(routinesJson || '[]');

        if (Array.isArray(legacySchedules) && legacySchedules.length > 0) {
            for (const legacy of legacySchedules) {
                const timing = legacy.schedule || {};

                const blocklistId = generateId();
                state.appData.blocklists.push({
                    id: blocklistId,
                    name: legacy.name || 'Imported Schedule',
                    websites: legacy.blockedWebsites || [],
                    apps: legacy.blockedApps || [],
                    overrideDifficulty: { type: 'random-words', count: legacy.frictionWordCount || 15 },
                });

                if (timing.type === 'MANUAL') {
                    // Legacy manual (toggle-on) blocks are deliberately not
                    // carried over as active blocks: the old model toggled
                    // indefinitely, the new one is "block for N minutes".
                    // The curated list survives as the blocklist above; any
                    // still-running legacy session ends when the first
                    // set_schedules sync replaces the Kotlin schedule set.
                    console.info('[migrateAndroidNativeSchedules] Imported MANUAL legacy schedule as blocklist only:', legacy.id);
                    continue;
                }

                const days = timing.type === 'WEEKLY'
                    ? (timing.daysOfWeek || []).map(d => ANDROID_DAY_TO_MON0[d]).filter(d => d !== undefined)
                    : [0, 1, 2, 3, 4, 5, 6]; // DAILY: every day

                // Map legacy disabled state onto the pause model:
                //  - disabledUntil in the future = mid temporary-unlock →
                //    timed pause, auto-resumes at the same moment.
                //  - disabledUntil passed = the legacy re-enable was due →
                //    import as enabled.
                //  - no disabledUntil = user turned it off → indefinite pause.
                const nowMs = Date.now();
                const disabledUntil = typeof legacy.disabledUntil === 'number' ? legacy.disabledUntil : null;
                const isPaused = !legacy.isEnabled && (!disabledUntil || disabledUntil > nowMs);
                const pauseEndTime = (isPaused && disabledUntil) ? disabledUntil : undefined;

                state.appData.schedules.push({
                    id: generateId(),
                    blocklistId,
                    isPaused,
                    ...(pauseEndTime ? { pauseEndTime } : {}),
                    // Legacy DAILY/WEEKLY schedules recur indefinitely.
                    // Without repeatType, isNonRepeatingSchedule() would
                    // misclassify these as one-shot occurrences.
                    repeatType: 'forever',
                    repeatDate: null,
                    createdAt: Date.now(),
                    segments: [{
                        startHour: timing.timeHour ?? 0,
                        startMinute: timing.timeMinute ?? 0,
                        endHour: timing.endTimeHour ?? 23,
                        endMinute: timing.endTimeMinute ?? 59,
                        days,
                    }],
                });
            }
        }

        if (!state.appData.settings) state.appData.settings = {};
        state.appData.settings.androidMigrationDone = true;
        await saveData();
        console.log('[migrateAndroidNativeSchedules] Imported', legacySchedules.length, 'legacy schedules');
    } catch (e) {
        // Leave the flag unset on failure so we retry on next launch —
        // the Kotlin side keeps enforcing the legacy prefs regardless,
        // so there's no urgency/harm in retrying.
        console.error('[migrateAndroidNativeSchedules] Failed:', e);
    }
}

// Registers the friction-gate Channel with the Kotlin plugin. BlockerService
// launches the main activity with block details as intent extras when it
// intercepts a blocked app/website; BlockerPlugin forwards them through this
// channel. See tauri-plugin-android-blocker/android/.../BlockerPlugin.kt.
function listenForAndroidFrictionGate() {
    const channel = new Channel();
    channel.onmessage = (event) => {
        if (event.type === 'resumed') {
            // BlockerPlugin.onResume() — the reliable native-lifecycle
            // signal for "user came back from a system settings screen".
            // DOM visibilitychange is unreliable inside an Android
            // WebView-hosted Activity, so this is the primary path (the
            // visibilitychange listener in setupEventListeners is a
            // fallback in case onResume didn't fire for some reason).
            onAndroidResumed();
        } else if (event.type === 'friction-gate') {
            openAndroidFrictionGateModal(event);
        }
    };
    tauriAPI.androidSetEventHandler(channel).catch((err) => {
        console.error('Failed to register Android friction-gate handler:', err);
    });
}

async function onAndroidResumed() {
    if (state.androidPermissionsGranted) return;
    const wasGranted = state.androidPermissionsGranted;
    await checkAndroidPermissions();
    if (!wasGranted && state.androidPermissionsGranted) {
        try {
            await initializeAndroidBlockingState();
            render();
        } catch (err) {
            console.error('Error initializing Android blocking state after permission grant:', err);
        }
    }
}

// Dedicated close functions for modals where blindly re-adding .hidden
// would skip cleanup (resetting state.editingBlocklistId, state.challengeText, etc.).
// Modals not listed here (app-picker-modal's close is a local closure,
// settings-modal has no dedicated close fn) fall back to a plain hide —
// an acceptable degradation (stale state clears on next legitimate
// open/close), much better than the app closing outright.
const ANDROID_MODAL_CLOSE_FNS = {
    'blocklist-modal': closeBlocklistModal,
    'override-modal': closeOverrideModal,
    'pause-modal': closePauseModal,
    'start-block-confirm-modal': closeStartBlockConfirmModal,
    'start-schedule-confirm-modal': closeScheduleConfirmModal,
};

// Tauri's generated WryActivity.onKeyDown only calls webView.goBack() on
// hardware/gesture back if canGoBack() is true; otherwise it falls
// through to the default Activity behavior, which closes the app (see
// gen/android/.../WryActivity.kt). This app never pushed history state
// for its modals, so every back press closed the app outright —
// including e.g. backing out of the blocklist/schedule editor. Trap
// it: push one history entry whenever a modal-overlay opens, and on
// popstate (which goBack() triggers) close the topmost open modal
// instead of letting the Activity finish.
function setupAndroidBackButtonHandling() {
    let trapArmed = false;

    function topmostVisibleModal() {
        const overlays = document.querySelectorAll('.modal-overlay');
        let topmost = null;
        for (const el of overlays) {
            if (!el.classList.contains('hidden')) topmost = el;
        }
        return topmost;
    }

    function armTrapIfNeeded() {
        if (trapArmed) return;
        if (!topmostVisibleModal()) return;
        trapArmed = true;
        history.pushState({ androidModalTrap: true }, '');
    }

    // Any modal-overlay's `hidden` class toggling is how every open*Modal
    // function in this codebase shows a modal — watching that generically
    // avoids having to hook every individual open function.
    const observer = new MutationObserver(() => armTrapIfNeeded());
    document.querySelectorAll('.modal-overlay').forEach((el) => {
        observer.observe(el, { attributes: true, attributeFilter: ['class'] });
    });

    window.addEventListener('popstate', () => {
        const modal = topmostVisibleModal();
        if (!modal) {
            trapArmed = false;
            return;
        }
        const closeFn = ANDROID_MODAL_CLOSE_FNS[modal.id];
        if (closeFn) {
            closeFn();
        } else {
            modal.classList.add('hidden');
        }
        // Re-arm if another modal was underneath (nested case).
        trapArmed = false;
        armTrapIfNeeded();
    });
}

function findAndroidBlockingTarget(nativeScheduleId) {
    const activeBlock = state.appData.activeBlocks?.find(block => block.id === nativeScheduleId);
    if (activeBlock) {
        return { type: 'block', block: activeBlock };
    }

    for (const schedule of state.appData.schedules || []) {
        // Kotlin ids are the schedule id plus a flattened suffix:
        // `<id>-<segIdx>` for repeating segments, `<id>-<segIdx>-<occIdx>`
        // for one-shot occurrences. Schedule ids are UUIDs, so prefix
        // matching can't collide with another schedule.
        if (nativeScheduleId === schedule.id || nativeScheduleId.startsWith(`${schedule.id}-`)) {
            return { type: 'schedule', schedule };
        }
    }

    return null;
}

// Shows the shared override-challenge UI for a block that fired on Android.
// Kotlin sends either the manual block id or the flattened schedule-segment id
// (`<scheduleId>-<segmentIndex>`). Route both back into the same JS-owned stop
// flows used elsewhere so the visible app state and native blocking state stay
// in lockstep.
function openAndroidFrictionGateModal(event) {
    delete window.overrideScheduleId;
    state.overrideBlockId = null;
    state.overrideBlocklistIdForHelper = null;

    const target = findAndroidBlockingTarget(event.scheduleId);
    if (!target) {
        // Every Kotlin schedule is created from state.appData via set_schedules
        // (or imported by migrateAndroidNativeSchedules), so an unknown id
        // means the two stores are out of sync. Don't show a challenge we
        // can't act on; the next syncSchedulesToHelper reconciles Kotlin.
        console.error('[friction-gate] No matching block/schedule for id:', event.scheduleId);
        return;
    }

    let blocklist = null;
    let actionLabel = tSettings('stopSchedule');

    if (target.type === 'block') {
        state.overrideBlockId = target.block.id;
        blocklist = state.appData.blocklists.find(bl => bl.id === target.block.blocklistId);
        actionLabel = tSettings('stopBlock');
    } else {
        window.overrideScheduleId = target.schedule.id || target.schedule.blocklistId;
        blocklist = state.appData.blocklists.find(bl => bl.id === target.schedule.blocklistId);
        actionLabel = tSettings('stopSchedule');
    }

    const blocklistName = blocklist?.name || event.scheduleName || 'ReDD Block';

    const difficulty = blocklist?.overrideDifficulty || { type: 'random-words', count: 15 };
    const charCount = difficulty.count || 15;
    const isRandom = difficulty.type === 'gibberish';

    state.challengeText = isRandom ? generateGibberish(charCount) : generateRandomWords(charCount);

    const confirmBtn = document.getElementById('confirm-override-btn');
    if (confirmBtn) confirmBtn.textContent = actionLabel;

    const titleEl = document.getElementById('override-modal-title');
    if (titleEl) titleEl.textContent = `${actionLabel} ${blocklistName}`;

    const challengeTextEl = document.getElementById('challenge-text');
    if (challengeTextEl) challengeTextEl.textContent = state.challengeText;
    const challengeInput = document.getElementById('challenge-input');
    if (challengeInput) challengeInput.value = '';
    const progressBar = document.getElementById('challenge-progress-bar');
    if (progressBar) progressBar.style.width = '0%';

    document.getElementById('override-modal').classList.remove('hidden');
}

async function initializeIOSBlockingState() {
    // Sync state.lastBlockedDomains from active (non-paused) blocks so pause/resume works after restart
    const now = Date.now();
    const activeDomains = new Set();
    state.appData.activeBlocks
        .filter(b => b.startTime <= now && b.endTime > now && !b.isPaused)
        .forEach(b => {
            const bl = state.appData.blocklists.find(bl => bl.id === b.blocklistId);
            if (bl && bl.websites) bl.websites.forEach(d => activeDomains.add(d));
        });
    state.lastBlockedDomains = activeDomains;
    // Re-register DeviceActivity schedules so background activation survives app restarts.
    await syncSchedulesToHelper();
}

export function updateOnboardingVisibility() {
    if (activeExclusiveOnboardingScreenId()) {
        return;
    }
    const eulaOverlay = document.getElementById('eula-onboarding');
    const screentimeOverlay = document.getElementById('ios-screentime-onboarding');
    const androidOverlay = document.getElementById('android-permissions-onboarding');
    const main = document.getElementById('main-content');
    const showEula = !hasAcceptedEula();
    const showScreentime = state.isIOS && !showEula && !state.screentimeAuthorized;
    const showAndroidPermissions = state.isAndroid && !showEula && !state.androidPermissionsGranted;
    const keepEulaVisibleForPendingSetup = !state.isIOS
        && !state.isAndroid
        && isFirstRunOnboardingInProgress()
        && !migrationOnboardingActive;
    const showEulaScreen = showEula || keepEulaVisibleForPendingSetup;
    const blockMainUi = showEulaScreen
        || showScreentime
        || showAndroidPermissions
        || migrationOnboardingActive
        || (!state.isIOS && !state.isAndroid && isFirstRunOnboardingInProgress());

    eulaOverlay?.classList.toggle('hidden', !showEulaScreen);
    screentimeOverlay?.classList.toggle('hidden', !showScreentime);
    androidOverlay?.classList.toggle('hidden', !showAndroidPermissions);
    main?.classList.toggle('hidden', blockMainUi);
    if (showAndroidPermissions) {
        document.getElementById('android-accessibility-status')?.classList.toggle('hidden', state.androidPermissionsGranted);
    }

    // Hide the BLOCKING NOW title-bar row on onboarding screens
    const nowBlockingRow = document.getElementById('now-blocking-row');
    if (nowBlockingRow) {
        nowBlockingRow.classList.toggle('hidden', blockMainUi);
    }

}

function activeExclusiveOnboardingScreenId() {
    const screenIds = [
        'welcome-onboarding',
        'fda-onboarding',
        'migration-onboarding',
    ];
    return screenIds.find((id) => !document.getElementById(id)?.classList.contains('hidden')) || null;
}

function showExclusiveOnboardingScreen(activeId) {
    const screenIds = [
        'welcome-onboarding',
        'eula-onboarding',
        'fda-onboarding',
        'migration-onboarding',
        'ios-screentime-onboarding',
        'android-permissions-onboarding',
    ];
    screenIds.forEach((id) => {
        document.getElementById(id)?.classList.toggle('hidden', id !== activeId);
    });
}

async function acceptEula() {
    if (!state.appData.settings) {
        state.appData.settings = {};
    }
    const alreadyAccepted = getAcceptedEulaRevision() === CURRENT_EULA_REVISION;
    forceShowEulaThisSession = false;
    if (!alreadyAccepted) {
        state.appData.settings.eulaAcceptedRevision = CURRENT_EULA_REVISION;
        state.appData.settings.eulaAcceptedAt = Date.now();
        await saveData();
    }
    if (state.isIOS) {
        await checkScreentimeAuth();
    } else if (state.isAndroid) {
        await checkAndroidPermissions();
    } else {
        if (!state.appData.settings.onboardingComplete) {
            firstRunExtensionSetupPending = true;
        }
        updateOnboardingVisibility();
    }
    await runPostAcceptanceStartup();
}

function getExternalLinkTarget(href) {
    if (!href || typeof href !== 'string') return null;
    const trimmed = href.trim();
    const lower = trimmed.toLowerCase();
    if (lower.startsWith('https://') || lower.startsWith('http://') || lower.startsWith('mailto:')) {
        return trimmed;
    }
    return null;
}

export async function openExternal(target) {
    try {
        await openUrl(target);
    } catch (err) {
        console.warn('[openExternal] opener plugin failed:', err);
        if (!state.isIOS && !state.isAndroid) {
            window.open(target, '_blank', 'noopener,noreferrer');
        }
    }
}

/** Mobile webviews do not reliably open target=_blank links in the system browser; route via opener plugin. */
function setupMobileExternalLinkOpens() {
    if (!state.isIOS && !state.isAndroid) return;
    document.addEventListener('click', (event) => {
        const anchor = event.target.closest('a[href]');
        if (!anchor) return;
        const url = getExternalLinkTarget(anchor.dataset.externalUrl || anchor.getAttribute('href'));
        if (!url) return;
        event.preventDefault();
        event.stopPropagation();
        void openExternal(url);
    }, true);
}

// Load data from main process
/// Run expiry once (e.g. on app load) so in-memory state matches Screen Time / helper.
/// Clears expired blocks and pause state, then syncs to plugin/helper.
async function runExpiryOnce() {
    const now = Date.now();
    let changed = false;

    // Clear expired pause on blocks
    for (const block of state.appData.activeBlocks) {
        if (block.isPaused && block.pauseEndTime && block.pauseEndTime <= now) {
            delete block.isPaused;
            delete block.pauseEndTime;
            changed = true;
        }
    }
    // Clear expired pause on schedules
    if (state.appData.schedules) {
        for (const schedule of state.appData.schedules) {
            if (schedule.isPaused && schedule.pauseEndTime && schedule.pauseEndTime <= now) {
                delete schedule.isPaused;
                delete schedule.pauseEndTime;
                changed = true;
            }
        }
    }
    // Remove expired blocks
    const prevCount = state.appData.activeBlocks.length;
    state.appData.activeBlocks = state.appData.activeBlocks.filter(b => b.endTime > now);
    if (state.appData.activeBlocks.length !== prevCount) changed = true;

    // Remove expired schedules (date-limited or non-repeating past end)
    if (state.appData.schedules && state.appData.schedules.length > 0) {
        const nowDate = new Date(now);
        const expiredIds = [];
        for (const schedule of state.appData.schedules) {
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
            state.appData.schedules = state.appData.schedules.filter(s => !expiredIds.includes(s.id));
            changed = true;
        }
    }

    if (!changed) return;
    await saveData();
    await updateHostsFile();
    await syncSchedulesToHelper();
    await updateBlockedApps();
}





function getModalDismissButton(modalOverlay) {
    if (!modalOverlay) return null;
    return modalOverlay.querySelector('.modal-buttons .cancel-btn, [id^="cancel-"], [id^="close-"]');
}

function resetModalScrollPosition(modalEl) {
    if (!modalEl) return;
    const apply = () => {
        modalEl.scrollTop = 0;
        const content = modalEl.querySelector('.modal-content');
        if (content) content.scrollTop = 0;
        const scrollBody = modalEl.querySelector('.mobile-modal-scroll-body');
        if (scrollBody) scrollBody.scrollTop = 0;
    };
    apply();
    requestAnimationFrame(apply);
}

function attachModalScrollResetOnShow(modalEl) {
    if (!modalEl || modalEl.dataset.scrollResetOnShow === '1') return;
    modalEl.dataset.scrollResetOnShow = '1';
    new MutationObserver(() => {
        if (!modalEl.classList.contains('hidden')) {
            resetModalScrollPosition(modalEl);
        }
    }).observe(modalEl, { attributes: true, attributeFilter: ['class'] });
}

function setupHandsetModalScreens() {
    const modalIds = [
        'blocklist-modal',
        'override-modal',
        'pause-modal',
        'start-block-confirm-modal',
        'start-schedule-confirm-modal',
        'settings-modal',
        'override-all-modal'
    ];

    for (const modalId of modalIds) {
        const overlay = document.getElementById(modalId);
        const content = overlay?.querySelector('.modal-content');
        const titleSource = content?.querySelector('h3');
        if (!overlay || !content || !titleSource || content.querySelector('.mobile-modal-header')) continue;

        overlay.classList.add('mobile-fullscreen-modal');
        const isRoomStyleConfirmModal =
            modalId === 'start-block-confirm-modal' || modalId === 'start-schedule-confirm-modal';
        if (!isRoomStyleConfirmModal) {
            titleSource.classList.add('mobile-modal-title-source');
        }

        const header = document.createElement('div');
        header.className = 'mobile-modal-header';

        const backButton = document.createElement('button');
        backButton.type = 'button';
        backButton.className = 'mobile-modal-back-btn';
        backButton.setAttribute('aria-label', 'Back');
        backButton.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M15 18l-6-6 6-6"></path>
            </svg>
        `;

        const headerTitle = document.createElement('div');
        headerTitle.className = 'mobile-modal-header-title';

        const syncHeaderTitle = () => {
            const nextTitle = titleSource.textContent?.trim() || titleSource.innerText?.trim() || '';
            if (!isRoomStyleConfirmModal) {
                headerTitle.textContent = nextTitle;
            }
            backButton.setAttribute('aria-label', nextTitle ? `Back from ${nextTitle}` : 'Back');
        };

        syncHeaderTitle();
        new MutationObserver(syncHeaderTitle).observe(titleSource, {
            childList: true,
            characterData: true,
            subtree: true
        });

        backButton.addEventListener('click', () => {
            const dismissButton = getModalDismissButton(overlay);
            if (dismissButton) dismissButton.click();
            else overlay.classList.add('hidden');
        });

        header.append(backButton);
        if (!isRoomStyleConfirmModal) {
            header.append(headerTitle);
        }
        if (modalId === 'settings-modal') {
            const versionEl = content.querySelector('#current-app-version');
            const settingsHeader = content.querySelector('.settings-modal-header');
            if (document.body.classList.contains('handset-device')) {
                if (versionEl) {
                    versionEl.classList.add('settings-header-version');
                    header.appendChild(versionEl);
                }
                settingsHeader?.classList.add('hidden');
            }
        }
        content.prepend(header);

        if (isRoomStyleConfirmModal) {
            const roomHeader = content.querySelector('.start-confirm-header-room');
            // Handset only: title lives in the sticky mobile header. On desktop/iPad the
            // header wrapper is display:none — keep the room header in the scroll body.
            if (roomHeader && document.body.classList.contains('handset-device')) {
                header.appendChild(roomHeader);
            }
        }

        const scrollBody = document.createElement('div');
        scrollBody.className = 'mobile-modal-scroll-body';
        const keepFooterOutsideScroll =
            modalId === 'blocklist-modal' || modalId === 'settings-modal';
        while (header.nextSibling) {
            const node = header.nextSibling;
            if (
                keepFooterOutsideScroll
                && node.nodeType === Node.ELEMENT_NODE
                && node.classList.contains('modal-buttons')
            ) {
                break;
            }
            scrollBody.appendChild(node);
        }
        content.appendChild(scrollBody);
        if (keepFooterOutsideScroll) {
            const footer = content.querySelector(':scope > .modal-buttons');
            if (footer) content.appendChild(footer);
        }
        attachModalScrollResetOnShow(overlay);
    }
}


// Detect platform for window controls and iOS
function detectPlatform() {
    // Check for iOS (Tauri iOS uses a WKWebView with standard iOS user agent)
    const isIOSDevice = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
        (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

    if (isIOSDevice) {
        state.isIOS = true;
        document.body.classList.add('ios');
        // iPhone / iPod (anything not iPad): used for layout (e.g. hide week calendar)
        const isIPad = /iPad/.test(navigator.userAgent) ||
            (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
        if (!isIPad) {
            document.body.classList.add('ios-phone');
            document.body.classList.add('handset-device');
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

        /* Browse buttons in #blocklist-modal: layout + captions from CSS (body.ios …) and applySettingsLanguage(). */
    } else if (/Android/.test(navigator.userAgent)) {
        state.isAndroid = true;
        document.body.classList.add('android');
        document.body.classList.add('handset-device');
        // Hide desktop-only UI on Android — same fullscreen-webview
        // treatment as iOS (custom title bar / window controls make no
        // sense on a mobile OS).
        document.getElementById('window-controls')?.classList.add('hidden');
        document.querySelector('.title-bar')?.classList.add('hidden');
        document.getElementById('helper-settings-section')?.classList.add('hidden');
        // Unlike iOS, Android app blocking uses plain package names (same
        // shape as desktop's process names), so the text input + picker
        // both stay usable — no UI to hide here.
    } else {
        const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
        if (isMac) {
            document.body.classList.add('mac');
            state.isMacOSDesktop = true;
            // Hide controls on macOS - native traffic lights are used
            document.getElementById('window-controls')?.classList.add('hidden');
        } else {
            document.body.classList.add('windows');
            // Show controls on Windows
            document.getElementById('window-controls')?.classList.remove('hidden');
        }
    }
    updateManageSectionVisibility();
}

// Update window height to fit content
export function updateWindowHeight() {
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

// Update maximize button icon based on window state (Windows custom title bar only).
let lastMaximizedButtonState = null;
let maximizeButtonSyncInFlight = false;
let maximizeButtonResizeSyncTimer = null;
let maximizeButtonSyncInitialized = false;
/** @type {(() => void) | null} */
let unlistenMaximizeButtonResized = null;
/** @type {(() => void) | null} */
let unlistenMaximizeButtonFocus = null;

function isWindowsDesktopWithCustomTitleBar() {
    return document.body.classList.contains('windows')
        && !!document.getElementById('titlebar-maximize')
        && !document.getElementById('window-controls')?.classList.contains('hidden');
}

async function updateMaximizeButton() {
    const maximizeBtn = document.getElementById('titlebar-maximize');
    const maximizeIcon = document.getElementById('maximize-icon');
    const restoreIcon = document.getElementById('restore-icon');

    if (!maximizeBtn || !maximizeIcon || !restoreIcon) return;

    const win = getCurrentWindow();
    let isMaximized;
    try {
        isMaximized = await win.isMaximized();
    } catch (err) {
        console.warn('Failed to read window maximize state:', err);
        return;
    }

    if (isMaximized === lastMaximizedButtonState) return;
    lastMaximizedButtonState = isMaximized;

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

async function syncMaximizeButtonFromWindow({ force = false } = {}) {
    if (!isWindowsDesktopWithCustomTitleBar()) return;
    if (maximizeButtonSyncInFlight) return;
    maximizeButtonSyncInFlight = true;
    try {
        if (force) lastMaximizedButtonState = null;
        await updateMaximizeButton();
    } finally {
        maximizeButtonSyncInFlight = false;
    }
}

function scheduleMaximizeButtonSyncFromResize() {
    if (maximizeButtonResizeSyncTimer) {
        clearTimeout(maximizeButtonResizeSyncTimer);
    }
    // Coalesce rapid resize events (e.g. drag-resize) without delaying click/focus syncs.
    maximizeButtonResizeSyncTimer = setTimeout(() => {
        maximizeButtonResizeSyncTimer = null;
        void syncMaximizeButtonFromWindow();
    }, 50);
}

async function setupMaximizeButtonSync() {
    if (maximizeButtonSyncInitialized || !isWindowsDesktopWithCustomTitleBar()) return;
    maximizeButtonSyncInitialized = true;

    await syncMaximizeButtonFromWindow({ force: true });

    const win = getCurrentWindow();

    if (unlistenMaximizeButtonResized) {
        unlistenMaximizeButtonResized();
        unlistenMaximizeButtonResized = null;
    }
    if (unlistenMaximizeButtonFocus) {
        unlistenMaximizeButtonFocus();
        unlistenMaximizeButtonFocus = null;
    }

    unlistenMaximizeButtonResized = await win.onResized(() => {
        scheduleMaximizeButtonSyncFromResize();
    });

    unlistenMaximizeButtonFocus = await win.onFocusChanged(({ payload: focused }) => {
        if (focused) void syncMaximizeButtonFromWindow();
    });

    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            void syncMaximizeButtonFromWindow();
        }
    });
}

// Setup event listeners
function setupEventListeners() {
    // Window controls (using Tauri docs naming)
    document.getElementById('titlebar-minimize')?.addEventListener('click', () => {
        tauriAPI.minimizeWindow();
    });

    document.getElementById('titlebar-maximize')?.addEventListener('click', async () => {
        await tauriAPI.maximizeWindow();
        // State may settle asynchronously on Windows — refresh immediately and once more.
        await syncMaximizeButtonFromWindow({ force: true });
        setTimeout(() => {
            void syncMaximizeButtonFromWindow({ force: true });
        }, 100);
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
        if (firstRunExtensionSetupPending && hasAcceptedEula()) {
            extensionSetupPausedForBackNavigation = false;
            document.getElementById('eula-onboarding')?.classList.add('hidden');
            void ensureExtensionSetupOnboardingShown();
            return;
        }
        eulaContinueBtn.disabled = true;
        eulaContinueBtn.textContent = tSettings('eulaContinueBusy');
        try {
            await acceptEula();
        } catch (err) {
            console.error('Failed to accept EULA:', err);
            alert(tSettings('eulaAcceptSaveFailedAlert'));
            eulaContinueBtn.disabled = !eulaCheckbox.checked;
            eulaContinueBtn.textContent = tSettings('eulaContinueBtn');
            return;
        }
        eulaContinueBtn.textContent = tSettings('eulaContinueBtn');
    });

    document.getElementById('eula-back-btn')?.addEventListener('click', () => {
        returnToWelcomeFromEula();
    });

    // EULA onboarding: delegated listeners so localized HTML can rebuild links/text without losing handlers.
    const eulaRoot = document.getElementById('eula-onboarding');
    if (eulaRoot) {
        eulaRoot.addEventListener(
            'click',
            (event) => {
                const toggleHost = event.target.closest('[data-toggle-target]');
                if (toggleHost && eulaRoot.contains(toggleHost) && !event.target.closest('a')) {
                    const target = document.getElementById(toggleHost.dataset.toggleTarget);
                    if (!target) return;
                    target.checked = !target.checked;
                    target.dispatchEvent(new Event('change', { bubbles: true }));
                }
            },
            true
        );
    }

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
                note.textContent = 'Screen Time access was denied. Please tap the button again, or enable ReDD Blocker in Settings > Screen Time > Apps With Screen Time Access.';
            } else if (result.error) {
                note.textContent = `Screen Time access failed: ${result.error}`;
            }
        }
        updateOnboardingVisibility();

        btn.disabled = false;
        btn.textContent = originalText;
    });

    document.getElementById('android-accessibility-grant-btn')?.addEventListener('click', async () => {
        const btn = document.getElementById('android-accessibility-grant-btn');
        const status = document.getElementById('android-accessibility-status');
        if (!btn) return;

        const originalText = btn.textContent;
        btn.disabled = true;
        btn.textContent = 'Opening Settings...';
        if (status) {
            status.textContent = 'Enable ReDD Blocker in Accessibility, then return here.';
            status.classList.remove('hidden');
        }

        try {
            await tauriAPI.androidOpenAccessibilitySettings();
        } catch (err) {
            console.error('Failed to open Android accessibility settings:', err);
            if (status) {
                status.textContent = `Could not open Accessibility settings: ${err}`;
            }
        } finally {
            btn.disabled = false;
            btn.textContent = originalText;
        }
    });

    if (state.isAndroid) {
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') {
                void onAndroidResumed();
            }
        });
    }

    // Windows custom title bar: sync maximize/restore icon from window events (no polling).
    void setupMaximizeButtonSync();

    // Time pickers — instant end uses compact `input.time-part time-popover-anchor` (click opens list + caret);
    // schedule uses its own overlays; pause modal uses button anchors.
    document.querySelectorAll('.time-popover-anchor').forEach(el => {
        el.addEventListener('click', handleTimePartClick);
    });

    // Close popovers on outside click
    document.addEventListener('click', handlePopoverOutsideClick);

    // Click on background to deselect blocklists
    document.addEventListener('click', (e) => {
        // Don't deselect if clicking on interactive elements
        if (e.target.closest('.blocklist-card') ||
            e.target.closest('.scheduler-section') ||
            e.target.closest('.time-picker-container') ||
            e.target.closest('.schedule-block-panel') ||
            e.target.closest('.repeat-dropdown-wrapper') ||
            e.target.closest('.repeat-dropdown-menu') ||
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
        if (state.selectedBlocklistId) {
            deselectBlocklist();
        }
    });

    // Close blocklist card menus when clicking outside
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.blocklist-menu-wrapper')) {
            closeAllBlocklistMenus();
        }
    });

    // ESC: sub-overlays → dialog → (elsewhere) deselect selected blocklist
    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        if (dismissTopmostEscapeLayer()) {
            e.preventDefault();
            return;
        }
        if (state.selectedBlocklistId) {
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
        if (state.blocklistModalUndoStack.length > 0) {
            state.blocklistModalApplyingUndo = true;
            const entry = state.blocklistModalUndoStack.pop();
            try {
                entry.undo();
            } finally {
                state.blocklistModalApplyingUndo = false;
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

    // Quick-select buttons: timed durations + until-I-stop option
    document.querySelectorAll('.duration-quick-btn').forEach(btn => {
        btn.addEventListener('click', handleDurationQuickBtn);
    });

    // Initialize time picker with defaults
    initializeTimeInputs();
    setupEndTimeDirectInputs();

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
    document.getElementById('start-block-confirm-modal')?.addEventListener('click', (e) => {
        if (e.target.classList.contains('modal-overlay')) {
            closeStartBlockConfirmModal();
        }
    });

    // Schedule confirmation modal buttons.
    // The proceed button routes between the start-flow and edit-flow handlers via
    // window.editScheduleData (set by showScheduleEditConfirmModal). A single
    // dispatch listener avoids a previous bug where both addEventListener and a
    // per-flow .onclick fired, causing proceedWithSchedule to add a duplicate
    // schedule after an edit-flow save.
    document.getElementById('cancel-schedule-confirm-btn')?.addEventListener('click', closeScheduleConfirmModal);
    document.getElementById('proceed-schedule-confirm-btn')?.addEventListener('click', () => {
        if (window.editScheduleData) {
            proceedWithScheduleEdit();
        } else {
            proceedWithSchedule();
        }
    });
    document.getElementById('start-schedule-confirm-modal')?.addEventListener('click', (e) => {
        if (e.target.classList.contains('modal-overlay')) {
            closeScheduleConfirmModal();
        }
    });

    setupScheduleOverlayCustomiseModal();

    // Schedule mode tabs
    document.getElementById('instant-mode-tab')?.addEventListener('click', () => setScheduleMode(false));
    document.getElementById('schedule-mode-tab')?.addEventListener('click', () => setScheduleMode(true));

    // Add segment button
    document.getElementById('add-segment-btn')?.addEventListener('click', addScheduleSegment);

    // Start schedule button
    document.getElementById('start-schedule-btn')?.addEventListener('click', startSchedule);
    document.getElementById('schedule-pending-save')?.addEventListener('click', saveSchedulePendingChanges);
    document.getElementById('schedule-pending-discard')?.addEventListener('click', discardSchedulePendingChanges);

    // Repeat dropdown (renamed from Until)
    document.getElementById('repeat-dropdown-btn')?.addEventListener('click', toggleRepeatDropdown);
    document.getElementById('schedule-panel-overlay-dropdown-btn')?.addEventListener('click', toggleSchedulePanelOverlayDropdown);
    document.getElementById('schedule-panel-overlay-dropdown-menu')?.addEventListener('click', handleSchedulePanelOverlayOptionClick);
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

export function resetWebsitesImportMenuPosition() {
    const menu = document.getElementById('websites-import-menu');
    if (!menu) return;
    menu.classList.remove('websites-import-menu-fixed');
    menu.style.top = '';
    menu.style.bottom = '';
    menu.style.left = '';
    menu.style.right = '';
    menu.style.width = '';
    menu.style.minWidth = '';
    menu.style.maxHeight = '';
}

// Wire up the Edit Blocklist "Import" popover for the websites field. The
// caller supplies a callback that receives an array of cleaned domain
// strings; it's responsible for de-duplicating against current modal state
// and pushing an undo entry.
function setupWebsitesImportMenu({ addDomainsToModal }) {
    const importBtn = document.getElementById('modal-import-websites-btn');
    const menu = document.getElementById('websites-import-menu');
    if (!importBtn || !menu) return;

    const resetMenuPosition = () => {
        resetWebsitesImportMenuPosition();
    };

    const positionMenu = () => {
        const rect = importBtn.getBoundingClientRect();
        const viewportPadding = 12;
        const gap = 4;
        const minWidth = Math.max(rect.width, 220);
        const maxMenuHeight = Math.min(320, Math.round(window.innerHeight * 0.45));

        menu.classList.add('websites-import-menu-fixed');
        menu.style.left = 'auto';
        menu.style.right = `${Math.max(viewportPadding, window.innerWidth - rect.right)}px`;
        menu.style.width = `${minWidth}px`;
        menu.style.minWidth = `${minWidth}px`;

        const spaceBelow = window.innerHeight - rect.bottom - viewportPadding;
        const spaceAbove = rect.top - viewportPadding;
        const openUpward = spaceBelow < 180 && spaceAbove > spaceBelow;

        if (openUpward) {
            menu.style.top = 'auto';
            menu.style.bottom = `${Math.max(viewportPadding, window.innerHeight - rect.top + gap)}px`;
            menu.style.maxHeight = `${Math.max(120, Math.min(maxMenuHeight, spaceAbove - gap))}px`;
        } else {
            menu.style.bottom = 'auto';
            menu.style.top = `${Math.max(viewportPadding, rect.bottom + gap)}px`;
            menu.style.maxHeight = `${Math.max(120, Math.min(maxMenuHeight, spaceBelow - gap))}px`;
        }
    };

    const closeMenu = () => {
        menu.classList.add('hidden');
        importBtn.setAttribute('aria-expanded', 'false');
        resetMenuPosition();
    };
    const openMenu = () => {
        menu.classList.remove('hidden');
        importBtn.setAttribute('aria-expanded', 'true');
        requestAnimationFrame(positionMenu);
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

    menu.addEventListener('touchmove', (e) => e.stopPropagation(), { passive: true });
    menu.addEventListener('wheel', (e) => e.stopPropagation(), { passive: true });
    window.addEventListener('resize', () => {
        if (!menu.classList.contains('hidden')) positionMenu();
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
        const displayApps = modalApps.map(displayNameForBlockedApp);
        const screenTimeLabel = formatIOSScreenTimeSelectionLabel(modalIOSScreenTimeSelection);
        if (screenTimeLabel) {
            displayApps.push(screenTimeLabel);
        }
        return displayApps;
    };

    const getModalLockedAppDisplayItems = () => {
        const screenTimeLabel = formatIOSScreenTimeSelectionLabel(modalIOSScreenTimeSelection);
        return (window.lockedApps || []).map((app) => (
            app === screenTimeLabel ? app : displayNameForBlockedApp(app)
        ));
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
            if (!isAppLocked(a)) selectedApps.add(displayNameForBlockedApp(a));
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
        const displayApps = getModalDisplayApps();
        const lockedDisplay = new Set(getModalLockedAppDisplayItems());
        const isDisplayLocked = (displayName) => lockedDisplay.has(displayName);
        const result = moveSelectionInList(displayApps, isDisplayLocked, selectedApps, direction);
        if (result) {
            window.renderModalTags();
            if (result === 'deselected') modalAppInput.focus();
        }
        return result;
    };

    const deleteSelectedApps = () => {
        if (selectedApps.size === 0) return false;
        const iosLabel = formatIOSScreenTimeSelectionLabel(modalIOSScreenTimeSelection);
        const toDeleteApps = modalApps.filter(
            a => selectedApps.has(displayNameForBlockedApp(a)) && !isAppLocked(a),
        );
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

    function confirmModalWebsiteInputValue() {
        const raw = modalWebsiteInput.value.trim();
        if (!raw) return null;

        const result = processWebsiteInput(raw);
        const errorMsg = document.getElementById('website-input-error');

        if (result.websiteInvalid) {
            if (errorMsg) {
                errorMsg.classList.remove('hidden');
                setTimeout(() => errorMsg.classList.add('hidden'), 3000);
            }
        } else if (errorMsg) {
            errorMsg.classList.add('hidden');
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
        return result;
    }

    function focusModalWebsiteInputFromNameField() {
        modalWebsiteInput.focus({ preventScroll: true });
        const pendingLen = modalWebsiteInput.value.length;
        const caret = pendingLen > 0 ? pendingLen : 0;
        modalWebsiteInput.setSelectionRange(caret, caret);
    }

    // Mobile: Name → websites. iOS shows plain Return (no default advance).
    if (state.isIOS) {
        const nameInput = document.getElementById('blocklist-name');
        nameInput.setAttribute('enterkeyhint', 'next');
        nameInput.addEventListener('keydown', (e) => {
            if (e.key !== 'Enter' && e.keyCode !== 13) return;
            e.preventDefault();
            e.stopPropagation();
            focusModalWebsiteInputFromNameField();
        }, true);
    }

    document.getElementById('blocklist-name').addEventListener('input', () => {
        const nameInput = document.getElementById('blocklist-name');
        nameInput.classList.remove('input-error');
        const previous = state.lastBlocklistNameValue;
        pushModalUndo('name', () => {
            nameInput.value = previous;
            state.lastBlocklistNameValue = previous;
            nameInput.classList.remove('input-error');
        });
        state.lastBlocklistNameValue = nameInput.value;
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
            confirmModalWebsiteInputValue();
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
                // Show brief warning — ReDD Blocker cannot block itself
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
    if (state.isIOS && modalBrowseBtn) {
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
            // Open the in-app installed apps picker instead of the OS file picker
            openInstalledAppsPicker();
        });
    }
    // Override type
    document.getElementById('override-type').addEventListener('change', (e) => {
        const overrideTypeSelect = e.target;
        const previousType = state.lastOverrideTypeValue;
        pushModalUndo('override-type', () => {
            overrideTypeSelect.value = previousType;
            state.lastOverrideTypeValue = previousType;
            overrideTypeSelect.dispatchEvent(new Event('change'));
        });

        const type = e.target.value;
        const overrideCountInput = document.getElementById('override-count');
        applyOverrideTypeUi(type);

        // Clamp to the new type-specific max when switching types.
        overrideCountInput.value = normalizeOverrideCount(overrideCountInput.value, type);
        state.lastOverrideTypeValue = overrideTypeSelect.value;

        const maxDifficultyCb = document.getElementById('override-max-difficulty-checkbox');
        if (maxDifficultyCb && maxDifficultyCb.checked && type !== 'custom') {
            const maxCount = getMaxOverrideCharsForType(type);
            overrideCountInput.value = String(maxCount);
            overrideCountInput.max = String(maxCount);
            state.lastOverrideCountValue = overrideCountInput.value;
            setOverrideCountMaxMode(true);
        }
    });
    document.getElementById('override-max-difficulty-checkbox').addEventListener('change', (e) => {
        const checked = e.target.checked;
        const overrideTypeSelect = document.getElementById('override-type');
        const overrideCountInput = document.getElementById('override-count');
        if (checked) {
            state.lastOverrideTypeValueBeforeMaxDifficulty = overrideTypeSelect.value;
            state.lastOverrideCountValueBeforeMaxDifficulty = overrideCountInput.value.trim() || state.lastOverrideCountValueBeforeMaxDifficulty;
            const type = overrideTypeSelect.value;
            applyOverrideTypeUi(type);
            const maxCount = getMaxOverrideCharsForType(type);
            overrideCountInput.value = String(maxCount);
            overrideCountInput.max = String(maxCount);
            state.lastOverrideCountValue = overrideCountInput.value;
            setOverrideCountMaxMode(true);
            updateOverridePreview(); // preview must reflect max count (set just above)
        } else {
            const typeToRestore = state.lastOverrideTypeValueBeforeMaxDifficulty;
            overrideTypeSelect.value = typeToRestore;
            applyOverrideTypeUi(typeToRestore);
            const maxChars = getMaxOverrideCharsForType(typeToRestore);
            overrideCountInput.max = String(maxChars);
            overrideCountInput.value = normalizeOverrideCount(String(state.lastOverrideCountValueBeforeMaxDifficulty), typeToRestore);
            state.lastOverrideCountValue = overrideCountInput.value;
            state.lastOverrideCountValueBeforeMaxDifficulty = overrideCountInput.value;
            setOverrideCountMaxMode(false);
            updateOverridePreview(); // preview must reflect restored count (set just above)
        }
    });
    document.getElementById('custom-override-text').addEventListener('input', (e) => {
        const customTextArea = e.target;
        const previous = state.lastCustomOverrideTextValue;
        pushModalUndo('custom-override-text', () => {
            customTextArea.value = previous;
            state.lastCustomOverrideTextValue = previous;
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
        state.lastCustomOverrideTextValue = e.target.value;
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
        const previous = state.lastOverrideCountValue;
        const current = overrideCountInput.value;
        if (previous !== current) {
            pushModalUndo('override-count', () => {
                overrideCountInput.value = previous;
                state.lastOverrideCountValue = previous;
            });
        }

        const warningEl = document.getElementById('override-count-warning');
        const overrideType = document.getElementById('override-type')?.value || 'random-words';
        const maxChars = getMaxOverrideCharsForType(overrideType);
        const unitLabel = usesMobileWordCountForOverrideType(overrideType) ? 'words' : 'characters';
        e.target.max = String(maxChars);
        const rawValue = e.target.value.trim();
        if (rawValue === '') {
            warningEl.classList.add('hidden');
            warningEl.textContent = '';
            state.lastOverrideCountValue = e.target.value;
            updateOverridePreview();
            return;
        }

        const parsed = parseInt(rawValue, 10);
        if (Number.isFinite(parsed) && parsed > maxChars) {
            const estimatedMinutes = getOverrideEstimatedMinutes(overrideType, maxChars, '');
            e.target.value = maxChars;
            warningEl.textContent = `Max is ${maxChars} ${unitLabel} so it's still possible to override in case of emergency (takes you ~${estimatedMinutes} minutes to type).`;
            warningEl.classList.remove('hidden');
        } else {
            warningEl.classList.add('hidden');
            warningEl.textContent = '';
        }
        state.lastOverrideCountValue = e.target.value;
        updateOverridePreview();
    });
    document.getElementById('override-count').addEventListener('blur', (e) => {
        const overrideType = document.getElementById('override-type')?.value || 'random-words';
        e.target.value = normalizeOverrideCount(e.target.value, overrideType);
        updateOverridePreview();
    });

    const adjustOverrideCount = (delta) => {
        const overrideCountInput = document.getElementById('override-count');
        const maxDifficultyCb = document.getElementById('override-max-difficulty-checkbox');
        if (!overrideCountInput || maxDifficultyCb?.checked) return;
        const overrideType = document.getElementById('override-type')?.value || 'random-words';
        const parsed = Number.parseInt(overrideCountInput.value, 10);
        const current = Number.isFinite(parsed) ? parsed : DEFAULT_OVERRIDE_COUNT;
        overrideCountInput.value = normalizeOverrideCount(String(current + delta), overrideType);
        overrideCountInput.dispatchEvent(new Event('input', { bubbles: true }));
    };
    document.getElementById('override-count-minus')?.addEventListener('click', () => adjustOverrideCount(-1));
    document.getElementById('override-count-plus')?.addEventListener('click', () => adjustOverrideCount(1));

    document.querySelectorAll('.color-swatch').forEach(swatch => {
        swatch.addEventListener('click', () => {
            document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('selected'));
            swatch.classList.add('selected');
            applyModalBlocklistTint(swatch.dataset.color);
        });
    });
    document.getElementById('custom-color-input')?.addEventListener('input', (e) => {
        const customSwatch = document.getElementById('custom-color-swatch');
        const color = e.target.value;
        customSwatch.style.background = color;
        customSwatch.dataset.color = color;
        document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('selected'));
        customSwatch.classList.add('selected');
        applyModalBlocklistTint(color);
    });

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
        function positionEmojiPickerPopover() {
            const gap = 8;
            const padding = 8;
            const titleBarHeight = parseFloat(
                getComputedStyle(document.documentElement).getPropertyValue('--title-bar-height')
            ) || 44;
            const titleBarHidden = document.querySelector('.title-bar')?.classList.contains('hidden');
            const minTop = titleBarHidden ? padding : titleBarHeight + padding;

            emojiPickerPopover.style.top = '';
            emojiPickerPopover.style.bottom = '';
            emojiPickerPopover.style.left = '';
            emojiPickerPopover.style.right = '';

            // Escape modal overflow clipping while open
            if (emojiPickerPopover.parentElement !== document.body) {
                document.body.appendChild(emojiPickerPopover);
            }

            emojiPickerPopover.classList.remove('hidden');

            const rect = customEmojiSwatch.getBoundingClientRect();
            const popoverRect = emojiPickerPopover.getBoundingClientRect();
            const popoverHeight = popoverRect.height;
            const popoverWidth = popoverRect.width;

            const spaceAbove = rect.top - minTop;
            let top = spaceAbove >= popoverHeight + gap
                ? rect.top - popoverHeight - gap
                : rect.bottom + gap;
            top = Math.max(minTop, Math.min(top, window.innerHeight - popoverHeight - padding));

            let left = rect.right - popoverWidth;
            left = Math.max(padding, Math.min(left, window.innerWidth - popoverWidth - padding));

            emojiPickerPopover.style.top = `${top}px`;
            emojiPickerPopover.style.left = `${left}px`;
        }

        // Toggle popover on swatch click
        customEmojiSwatch.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();

            if (emojiPickerPopover.classList.contains('hidden')) {
                positionEmojiPickerPopover();
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
            const willExpand = blocklistAdvancedContent.classList.contains('hidden');
            blocklistAdvancedToggle.classList.toggle('expanded');
            blocklistAdvancedContent.classList.toggle('hidden');
            if (willExpand) {
                requestAnimationFrame(() => {
                    const scrollBody = blocklistAdvancedContent.closest('.mobile-modal-scroll-body');
                    scrollElementWithinContainer(scrollBody, blocklistAdvancedContent);
                });
            }
        });
    }

    // Cancel button
    document.getElementById('cancel-blocklist-btn').addEventListener('click', () => {
        closeBlocklistModal();
    });

    // Save button
    document.getElementById('save-blocklist-btn').addEventListener('click', () => {
        const nameInput = document.getElementById('blocklist-name');
        const name = truncateBlocklistName(nameInput.value.trim());
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
            const result = confirmModalWebsiteInputValue();
            if (result?.hadProtected) return;
            if (result?.websiteInvalid) websiteInvalid = true;
        }

        if (nameEmpty || websiteInvalid) return;

        nameInput.value = name;

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
        const emoji = selectedEmoji ? selectedEmoji.dataset.emoji : '📱';

        const showItemDetails = document.getElementById('show-item-details-checkbox').checked;
        // Preserve the blocklist's existing schedule visibility (toggled via the chips above the
        // schedule); default to true for new blocklists.
        const existingBlocklistForSave = state.editingBlocklistId
            ? state.appData.blocklists.find(bl => bl.id === state.editingBlocklistId)
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
                String(state.lastOverrideCountValueBeforeMaxDifficulty),
                state.lastOverrideTypeValueBeforeMaxDifficulty
            );
            overrideDifficultyPayload.typeBeforeMax = state.lastOverrideTypeValueBeforeMaxDifficulty;
        }

        // IMPORTANT: Create copies of the arrays, not references!
        const blocklist = {
            id: state.editingBlocklistId || generateId(),
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

        if (state.editingBlocklistId) {
            const idx = state.appData.blocklists.findIndex(bl => bl.id === state.editingBlocklistId);
            if (idx !== -1) {
                state.appData.blocklists[idx] = blocklist;
            }
        } else {
            state.appData.blocklists.push(blocklist);
        }

        saveData();

        // If this blocklist is active (block or schedule), update blocking rules immediately
        const now = Date.now();
        const hasActiveBlock = state.appData.activeBlocks.some(
            b => b.blocklistId === blocklist.id && b.startTime <= now && b.endTime > now
        );
        const hasActiveSchedule = state.appData.schedules?.some(
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
        state.blocklistModalPreviewSnapshot = null;
        closeBlocklistModal();

        // Only update blocklist display without resetting schedule segments
        renderBlocklists();
        renderBlocklistSelector();
        renderWeekBlocks(); // Refresh calendar so colour / emoji / name changes propagate
        renderNowBlockingRow(); // Title-bar chips read emoji/name from freshly saved blocklist
        renderScheduleAlwaysOnRow();

        // If this was the first blocklist created from the empty state,
        // auto-select it so the user doesn't have to click it. `force`
        // clears the deselect flag — creating a new blocklist is a
        // strong "I want to use this" signal.
        if (!state.editingBlocklistId) autoSelectSoleBlocklist({ force: true });

        // Re-trigger blocklist selection to update button text (name may have changed)
        if (state.selectedBlocklistId) {
            const dropdown = document.getElementById('blocklist-select');
            if (dropdown) {
                dropdown.value = state.selectedBlocklistId;
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
        const screenTimeLabel = formatIOSScreenTimeSelectionLabel(modalIOSScreenTimeSelection);
        renderTags(modalAppsTags, displayApps, (idx) => {
            if (displayApps[idx] === screenTimeLabel) {
                if (isAppLocked(screenTimeLabel)) return;
                const previousSelection = cloneIOSScreenTimeSelection(modalIOSScreenTimeSelection);
                pushModalUndo('ios-screentime-selection-remove', () => {
                    modalIOSScreenTimeSelection = cloneIOSScreenTimeSelection(previousSelection);
                    window.renderModalTags();
                });
                modalIOSScreenTimeSelection = null;
            } else {
                const processName = modalApps[idx];
                if (!processName || isAppLocked(processName)) return;
                const appIdx = modalApps.indexOf(processName);
                if (appIdx === -1) return;
                pushModalUndo('app', () => {
                    modalApps.splice(appIdx, 0, processName);
                    window.renderModalTags();
                });
                modalApps.splice(appIdx, 1);
            }
            window.renderModalTags();
        }, getModalLockedAppDisplayItems(), {
            selectedItems: selectedApps,
            onTagClick: (idx) => {
                const value = displayApps[idx];
                if (!value) return;
                if (value === screenTimeLabel) {
                    if (isAppLocked(screenTimeLabel)) return;
                } else if (isAppLocked(modalApps[idx])) {
                    return;
                }
                if (selectedApps.has(value)) {
                    selectedApps.delete(value);
                } else {
                    selectedApps.add(value);
                }
                window.renderModalTags();
                modalAppInput.focus();
            }
        });

        syncModalWebsitePlaceholder();
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
    const challengeWordInput = document.getElementById('challenge-word-input');
    const progressBar = document.getElementById('challenge-progress-bar');
    const challengeTextEl = document.getElementById('challenge-text');
    const challengeCurrentWordEl = document.getElementById('challenge-current-word');

    function getOverrideTypedValue() {
        return state.overrideWordChallengeState?.typedText ?? challengeInput.value;
    }

    // Helper to render challenge text with optional error highlight
    function renderChallengeText(errorIndex = -1) {
        if (errorIndex < 0 || errorIndex >= state.challengeText.length) {
            challengeTextEl.textContent = state.challengeText;
        } else {
            // Highlight the error character
            const before = escapeHtml(state.challengeText.slice(0, errorIndex));
            const errorChar = escapeHtml(state.challengeText[errorIndex]);
            const after = escapeHtml(state.challengeText.slice(errorIndex + 1));
            challengeTextEl.innerHTML = `${before}<span class="error-char">${errorChar}</span>${after}`;
        }
    }

    // Prevent paste - users must type manually
    challengeInput.addEventListener('paste', (e) => {
        e.preventDefault();
    });
    challengeWordInput.addEventListener('paste', (e) => {
        e.preventDefault();
    });

    challengeInput.addEventListener('input', () => {
        const typed = challengeInput.value;
        const target = state.challengeText;

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

        // Show red highlight on the reference text at the first mismatch (-1 clears)
        renderChallengeText(firstErrorIndex);
    });

    challengeWordInput.addEventListener('input', () => {
        if (!state.overrideWordChallengeState) return;
        challengeCurrentWordEl.textContent = getCurrentChallengeWord(state.overrideWordChallengeState);
    });

    // Enter key submits the override
    challengeInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault(); // Prevent newline in textarea
            document.getElementById('confirm-override-btn').click();
        }
    });
    challengeWordInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            document.getElementById('confirm-override-btn').click();
        }
    });

    document.getElementById('cancel-override-btn').addEventListener('click', () => {
        // Check for helper removal special case
        if (state.overrideBlockId === 'helper-removal' && window.helperRemovalCancelCallback) {
            window.helperRemovalCancelCallback();
            return;
        }
        closeOverrideModal();
    });

    // Pause block button
    document.getElementById('pause-block-btn').addEventListener('click', () => {
        if (!state.selectedBlocklistId) return;
        const now = Date.now();

        // Try one-off block first
        const activeBlock = state.appData.activeBlocks.find(b =>
            b.blocklistId === state.selectedBlocklistId && b.startTime <= now && b.endTime > now
        );
        if (activeBlock) {
            if (activeBlock.isPaused) {
                // Resume — show confirmation dialog
                openResumeConfirmation(state.selectedBlocklistId, 'block', activeBlock.id);
            } else {
                // Pause
                state.pauseScheduleData = null;
                openPauseModal(activeBlock.id);
            }
            return;
        }

        // Try schedule — find the currently active segment
        const schedule = state.appData.schedules?.find(s => s.blocklistId === state.selectedBlocklistId);
        if (schedule) {
            if (isSchedulePausedNow(schedule, now)) {
                // Resume — show confirmation dialog
                openResumeConfirmation(state.selectedBlocklistId, 'schedule', null);
                return;
            }
            state.pauseScheduleData = {
                blocklistId: state.selectedBlocklistId,
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
    const pauseChallengeWordInput = document.getElementById('pause-challenge-word-input');
    const pauseCurrentWordEl = document.getElementById('pause-current-word');
    pauseChallengeInput.addEventListener('input', () => {
        const typed = pauseChallengeInput.value;
        const target = state.pauseChallengeText;
        const progress = target.length > 0 ? Math.min(100, (typed.length / target.length) * 100) : 0;
        document.getElementById('pause-challenge-progress-bar').style.width = `${progress}%`;

        // Enable/disable confirm button
        document.getElementById('confirm-pause-btn').disabled = (typed !== target);
    });
    pauseChallengeWordInput.addEventListener('paste', (e) => {
        e.preventDefault();
    });
    pauseChallengeWordInput.addEventListener('input', () => {
        if (!state.pauseWordChallengeState) return;
        pauseCurrentWordEl.textContent = getCurrentChallengeWord(state.pauseWordChallengeState);
    });

    pauseChallengeInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            document.getElementById('confirm-pause-btn').click();
        }
    });
    pauseChallengeWordInput.addEventListener('keydown', (e) => {
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

    const blockActionButtons = document.getElementById('block-action-buttons');
    if (blockActionButtons && typeof ResizeObserver !== 'undefined') {
        const stopButtonFitRo = new ResizeObserver(() => syncAllStopBtnLabelFits());
        stopButtonFitRo.observe(blockActionButtons);
    }
    window.addEventListener('resize', () => syncAllStopBtnLabelFits());
    window.addEventListener('resize', () => syncMobileScheduleDayLabelsViewportMode());
    window.visualViewport?.addEventListener('resize', syncMobileScheduleDayLabelsViewportMode);

    document.getElementById('confirm-override-btn').addEventListener('click', async () => {
        if (state.overrideWordChallengeState) {
            const expectedWord = getCurrentChallengeWord(state.overrideWordChallengeState);
            const typedWord = challengeWordInput.value.trim();
            if (typedWord === expectedWord) {
                state.overrideWordChallengeState.currentIndex++;
                const completedText = getCompletedChallengeText(state.overrideWordChallengeState);
                state.overrideWordChallengeState.typedText = state.overrideWordChallengeState.currentIndex >= state.overrideWordChallengeState.words.length
                    ? state.challengeText
                    : completedText;
                if (state.overrideWordChallengeState.currentIndex < state.overrideWordChallengeState.words.length) {
                    renderOverrideWordChallengeState();
                    challengeWordInput.focus();
                    return;
                }
            } else {
                const modalContent = document.querySelector('#override-modal .modal-content');
                modalContent.classList.remove('wiggle');
                void modalContent.offsetWidth;
                modalContent.classList.add('wiggle');
                challengeCurrentWordEl.textContent = getCurrentChallengeWord(state.overrideWordChallengeState);
                return;
            }
        }

        const typed = getOverrideTypedValue();
        const target = state.challengeText;

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

        if (typed === target && (state.overrideBlockId || window.overrideScheduleId)) {
            // Check for helper removal special case
            if (state.overrideBlockId === 'helper-removal' && window.helperRemovalConfirmCallback) {
                window.helperRemovalConfirmCallback();
                return;
            }

            if (state.overrideBlockId && state.overrideBlockId !== 'helper-removal') {
                const overriddenBlock = state.appData.activeBlocks.find(b => b.id === state.overrideBlockId);
                const blocklistIdToClear = state.overrideBlocklistIdForHelper ?? (overriddenBlock ? overriddenBlock.blocklistId : null);
                state.appData.activeBlocks = state.appData.activeBlocks.filter(b => b.id !== state.overrideBlockId);
                await saveData();

                if (state.isIOS) {
                    await tauriAPI.screentimeClearBlock();
                    state.lastBlockedDomains = new Set();
                    await updateHostsFile();
                    await syncSchedulesToHelper();
                } else if (state.isAndroid) {
                    try {
                        await tauriAPI.androidStopManualBlock(state.overrideBlockId);
                    } catch (err) {
                        console.error('androidStopManualBlock failed:', err);
                    }
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

                state.overrideBlocklistIdForHelper = null;
                // Update blocked apps (will stop watcher if no apps to block, including schedules)
                await updateBlockedApps();
            } else if (window.overrideScheduleId) {
                // Schedules behave like one-off blocks now: stopping always tears down the
                // entire schedule (no per-instance skip). Segments are re-loaded into the
                // editor so the user can re-start them later without re-typing them.
                const scheduleId = window.overrideScheduleId;
                const scheduleToStop = state.appData.schedules.find(s =>
                    s.id === scheduleId || s.blocklistId === scheduleId
                );

                if (scheduleToStop) {
                    state.scheduleSegments = scheduleToStop.segments.map(seg => ({ ...seg }));
                    state.activeScheduleSegmentCount = 0; // No segments are locked anymore

                    // Save these segments as pending so they persist when clicking off/on
                    if (!state.appData.settings) state.appData.settings = {};
                    if (!state.appData.settings.pendingScheduleSegments) state.appData.settings.pendingScheduleSegments = {};
                    state.appData.settings.pendingScheduleSegments[scheduleToStop.blocklistId] = state.scheduleSegments.map(seg => ({ ...seg }));

                    state.appData.schedules = state.appData.schedules.filter(s =>
                        s.id !== scheduleId && s.blocklistId !== scheduleId
                    );

                    // Rebuild UI to show all segments as editable if we're viewing this blocklist
                    if (state.selectedBlocklistId === scheduleToStop.blocklistId && state.isScheduleMode) {
                        rebuildScheduleSegments();
                        disableScheduleControls(false);
                    }
                } else {
                    state.activeScheduleSegmentCount = 0;
                }

                // On iOS, clear both Screen Time stores so the overridden schedule's blocks are removed
                // immediately; updateHostsFile and syncSchedulesToHelper will then re-apply correct state.
                if (state.isIOS) {
                    await tauriAPI.screentimeClearBlock();
                    state.lastBlockedDomains = new Set();
                }

                await saveData();
                await updateHostsFile();
                await syncSchedulesToHelper();
                await updateBlockedApps();

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
            if (state.overrideWordChallengeState) {
                challengeCurrentWordEl.textContent = getCurrentChallengeWord(state.overrideWordChallengeState);
            } else {
                renderChallengeText(firstErrorIndex);
            }
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

// Pad number with leading zero

// Show schedule confirmation modal

// Update blocked apps sent to the in-process app watcher (desktop only).
// Computes the effective union of apps from active one-off blocks AND active schedule
// segments. Both sources are evaluated on the frontend now that the legacy helper
// daemon (which previously merged schedule + manual apps internally) is gone.
/// Set of app names that were in the blocked set at the LAST
/// `updateBlockedApps` call. Used to compute which apps just
/// transitioned to blocking ("newly added") so the watcher can
/// distinguish "block just starting → raise Let's-go warning" from
/// "user launched a blocked app while a block was already running →
/// silent SIGTERM". `null` until the first call so the very first
/// sync (typically right after app launch, when blocks may already
/// be active from a prior session) doesn't fire warnings — we treat
/// that initial state as "what was already running before we got
/// here", not as a transition the user just initiated.
let appBlockingPreviousAppsSet = null;

export async function updateBlockedApps() {
    // iOS uses Screen Time API for app blocking
    if (state.isIOS) return;
    // Android: app blocking is embedded in the schedule sync itself
    // (blockedApps on each Kotlin Schedule), not a separate helper-daemon
    // push — see syncSchedulesToHelper.
    if (state.isAndroid) return;

    const now = Date.now();
    const nowDate = new Date(now);
    const manualApps = collectManualBlockedApps(now);
    const scheduleApps = collectScheduleBlockedApps(now);
    const allBlockedApps = new Set([...manualApps, ...scheduleApps]);
    const appsArray = Array.from(allBlockedApps).sort();

    const prevAll = appBlockingPreviousAppsSet;
    const prevManual = appBlockingPreviousManualAppsSet ?? new Set();
    const prevSchedule = appBlockingPreviousScheduleAppsSet ?? new Set();

    // Compute the diff against the last sync so the watcher knows
    // which apps just transitioned to blocked (warning-eligible) vs
    // which were already blocked (silent enforcement). On the very
    // first call the previous sets are null — we treat that as
    // "initial state, no transitions" and skip warnings entirely.
    const newlyAddedApps = prevAll === null
        ? []
        : appsArray.filter((a) => !prevAll.has(a));
    if (newlyAddedApps.length > 0) {
        noteAppBlockingNewlyAddedMeta(
            newlyAddedApps,
            manualApps,
            scheduleApps,
            prevManual,
            prevSchedule,
            now,
            nowDate,
        );
        appBlockingWarningSnoozeUsed = false;
        clearAppBlockingWarningSnoozeTimer();
        appBlockingWarningSnoozedUntilMs = 0;
    }
    appBlockingPreviousAppsSet = new Set(appsArray);
    appBlockingPreviousManualAppsSet = new Set(manualApps);
    appBlockingPreviousScheduleAppsSet = new Set(scheduleApps);

    // Desktop v3: `set_blocked_apps_via_helper` routes to the in-process
    // app watcher — always push while the app is alive. The legacy
    // helper-daemon gate left schedule app blocking as a no-op whenever
    // `state.helperAvailable` was still false at the first tick.
    try {
        const result = await tauriAPI.setBlockedAppsViaHelper(appsArray, newlyAddedApps);
        if (result && result.success) {
            console.log(
                '[updateBlockedApps] Apps synced to watcher:',
                appsArray.length, 'apps,', newlyAddedApps.length, 'newly added',
            );
        } else {
            console.warn('[updateBlockedApps] Watcher sync failed:', result?.error);
        }
    } catch (e) {
        console.warn('[updateBlockedApps] Failed to sync blocked apps to watcher:', e);
    }
}



// Start interval to update remaining time

// Utility functions
export function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

export function formatTime(date) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// Last minute of the civil day (23:59). Drag/snap math uses 1440 as exclusive
// end-of-day; converting 1440 through hour/minute fields wrongly yielded 23:00.
export const MINUTES_PER_DAY = 1440;
export const MAX_SAME_DAY_END_MINUTES = MINUTES_PER_DAY - 1;

export function clampSameDayMinutes(totalMinutes) {
    return Math.max(0, Math.min(MAX_SAME_DAY_END_MINUTES, Math.round(totalMinutes)));
}

export function snapMinutesToInterval(minutes, intervalMinutes = 15) {
    return clampSameDayMinutes(Math.round(minutes / intervalMinutes) * intervalMinutes);
}

// Format a minutes-since-midnight value as zero-padded "HH:MM". Used by drag-resize
// handlers to live-update the time label inside a preview block.
export function formatMinutesAsHHMM(totalMinutes) {
    const clamped = clampSameDayMinutes(totalMinutes);
    const h = Math.floor(clamped / 60);
    const m = clamped % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function formatDuration(minutes) {
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

/** Remaining time chip, e.g. EN "1h 39m left", DA "1t 39m endnu" (`totalMins` = full minutes). */
export function formatBlockTimeRemainingShort(totalMins) {
    const n = Math.max(0, Math.floor(totalMins));
    const hrs = Math.floor(n / 60);
    const mins = n % 60;
    if (getSettingsLanguage() === 'da') {
        if (hrs > 0 && mins > 0) return `${hrs}t ${mins}m endnu`;
        if (hrs > 0) return `${hrs}t endnu`;
        return `${mins}m endnu`;
    }
    if (hrs > 0 && mins > 0) return `${hrs}h ${mins}m left`;
    if (hrs > 0) return `${hrs}h left`;
    return `${mins}m left`;
}


export function buildWordChallengeState(text) {
    const words = String(text || '').split(/\s+/).filter(Boolean);
    return {
        words,
        currentIndex: 0,
        typedText: ''
    };
}


export function isMobileWordByWordChallenge(difficulty) {
    return !!(isMobileOverrideChallengePlatform() && (difficulty?.type === 'random-words' || difficulty?.type === 'gibberish'));
}

export function getCurrentChallengeWord(state) {
    if (!state || state.currentIndex >= state.words.length) return '';
    return state.words[state.currentIndex];
}

export function getCompletedChallengeText(state) {
    if (!state || state.currentIndex <= 0) return '';
    return state.words.slice(0, state.currentIndex).join(' ');
}

export function setOverrideWordChallengeMode(enabled) {
    document.getElementById('challenge-word-progress')?.classList.toggle('hidden', !enabled);
    document.getElementById('challenge-current-word')?.classList.toggle('hidden', !enabled);
    document.getElementById('challenge-word-input')?.classList.toggle('hidden', !enabled);
    document.getElementById('challenge-input')?.classList.toggle('hidden', enabled);
}

export function renderOverrideWordChallengeState() {
    const progressLabelEl = document.getElementById('challenge-word-progress');
    const currentWordEl = document.getElementById('challenge-current-word');
    const wordInput = document.getElementById('challenge-word-input');
    const progressBar = document.getElementById('challenge-progress-bar');
    if (!state.overrideWordChallengeState || !progressLabelEl || !currentWordEl || !wordInput || !progressBar) return;
    const currentWord = getCurrentChallengeWord(state.overrideWordChallengeState);
    const completedText = getCompletedChallengeText(state.overrideWordChallengeState);
    const targetText = completedText ? `${completedText} ${currentWord}` : currentWord;
    progressLabelEl.textContent = `Word ${state.overrideWordChallengeState.currentIndex + 1} of ${state.overrideWordChallengeState.words.length}`;
    currentWordEl.textContent = currentWord;
    wordInput.value = '';
    progressBar.style.width = state.challengeText.length > 0
        ? `${Math.min(100, (targetText.length / state.challengeText.length) * 100)}%`
        : '0%';
    document.getElementById('confirm-override-btn').disabled = !currentWord;
}

export function setPauseWordChallengeMode(enabled) {
    document.getElementById('pause-word-progress')?.classList.toggle('hidden', !enabled);
    document.getElementById('pause-current-word')?.classList.toggle('hidden', !enabled);
    document.getElementById('pause-challenge-word-input')?.classList.toggle('hidden', !enabled);
    document.getElementById('pause-challenge-input')?.classList.toggle('hidden', enabled);
}

export function renderPauseWordChallengeState() {
    const progressLabelEl = document.getElementById('pause-word-progress');
    const currentWordEl = document.getElementById('pause-current-word');
    const wordInput = document.getElementById('pause-challenge-word-input');
    const progressBar = document.getElementById('pause-challenge-progress-bar');
    if (!state.pauseWordChallengeState || !progressLabelEl || !currentWordEl || !wordInput || !progressBar) return;
    const currentWord = getCurrentChallengeWord(state.pauseWordChallengeState);
    const completedText = getCompletedChallengeText(state.pauseWordChallengeState);
    const targetText = completedText ? `${completedText} ${currentWord}` : currentWord;
    progressLabelEl.textContent = `Word ${state.pauseWordChallengeState.currentIndex + 1} of ${state.pauseWordChallengeState.words.length}`;
    currentWordEl.textContent = currentWord;
    wordInput.value = '';
    progressBar.style.width = state.pauseChallengeText.length > 0
        ? `${Math.min(100, (targetText.length / state.pauseChallengeText.length) * 100)}%`
        : '0%';
    document.getElementById('confirm-pause-btn').disabled = !currentWord;
}

export function setOverrideAllWordChallengeMode(enabled) {
    document.getElementById('override-all-word-progress')?.classList.toggle('hidden', !enabled);
    document.getElementById('override-all-current-word')?.classList.toggle('hidden', !enabled);
    document.getElementById('override-all-challenge-word-input')?.classList.toggle('hidden', !enabled);
    document.getElementById('override-all-challenge-input')?.classList.toggle('hidden', enabled);
}

export function renderOverrideAllWordChallengeState() {
    const progressLabelEl = document.getElementById('override-all-word-progress');
    const currentWordEl = document.getElementById('override-all-current-word');
    const wordInput = document.getElementById('override-all-challenge-word-input');
    const progressBar = document.getElementById('override-all-progress-bar');
    if (!overrideAllWordChallengeState || !progressLabelEl || !currentWordEl || !wordInput || !progressBar) return;
    const currentWord = getCurrentChallengeWord(overrideAllWordChallengeState);
    const completedText = getCompletedChallengeText(overrideAllWordChallengeState);
    const targetText = completedText ? `${completedText} ${currentWord}` : currentWord;
    progressLabelEl.textContent = `Word ${overrideAllWordChallengeState.currentIndex + 1} of ${overrideAllWordChallengeState.words.length}`;
    currentWordEl.textContent = currentWord;
    wordInput.value = '';
    progressBar.style.width = overrideAllChallengeText.length > 0
        ? `${Math.min(100, (targetText.length / overrideAllChallengeText.length) * 100)}%`
        : '0%';
    document.getElementById('confirm-override-all-btn').disabled = !currentWord;
}

// Clean up URL for display (remove protocol, www, trailing slash)

const MOBILE_COMPACT_SCHEDULE_DAY_LABELS_MAX_VIEWPORT_WIDTH = 1024;

/** Smaller mobile viewports, including iPad portrait, use single-letter day pills from first render. */
export function shouldUseCompactMobileScheduleDayLabels() {
    if (!state.isIOS && !state.isAndroid) return false;
    const effVp = Math.round(getEffectiveViewportWidth());
    return effVp > 0 && effVp <= MOBILE_COMPACT_SCHEDULE_DAY_LABELS_MAX_VIEWPORT_WIDTH;
}

export function syncMobileScheduleDayLabelsViewportMode() {
    if (!state.isIOS && !state.isAndroid) return;
    const nextCompact = shouldUseCompactMobileScheduleDayLabels();
    if (nextCompact === state.mobileCompactScheduleDayLabelsActive) return;
    state.mobileCompactScheduleDayLabelsActive = nextCompact;

    const schedulePanel = document.getElementById('schedule-block-panel');
    if (state.isScheduleMode && schedulePanel && !schedulePanel.classList.contains('hidden')) {
        rebuildScheduleSegments();
    }

    const scheduleConfirmModal = document.getElementById('start-schedule-confirm-modal');
    if (scheduleConfirmModal && !scheduleConfirmModal.classList.contains('hidden')) {
        renderScheduleConfirmSegments(document.getElementById('schedule-confirm-segments'), state.scheduleSegments);
    }
}


const LANGUAGE_PICKER_ROOT_IDS = ['language-picker', 'welcome-language-picker'];

function languagePickerElements(rootId) {
    return {
        picker: document.getElementById(rootId),
        trigger: document.getElementById(`${rootId}-trigger`),
        dropdown: document.getElementById(`${rootId}-dropdown`),
        triggerFlag: document.getElementById(`${rootId}-trigger-flag`),
        triggerCode: document.getElementById(`${rootId}-trigger-code`),
        currentName: document.getElementById(`${rootId}-current-name`),
        currentFlag: document.getElementById(`${rootId}-current-flag`),
        switchName: document.getElementById(`${rootId}-switch-name`),
        switchFlag: document.getElementById(`${rootId}-switch-flag`),
        curLabel: document.getElementById(`${rootId}-current-label`),
        swLabel: document.getElementById(`${rootId}-switch-label`),
        switchBtn: document.getElementById(`${rootId}-switch-btn`),
    };
}

export function isAnyLanguagePickerOpen() {
    return LANGUAGE_PICKER_ROOT_IDS.some((rootId) => {
        const { dropdown } = languagePickerElements(rootId);
        return dropdown && !dropdown.classList.contains('hidden');
    });
}

export function closeAllLanguagePickers() {
    for (const rootId of LANGUAGE_PICKER_ROOT_IDS) {
        const { dropdown, trigger } = languagePickerElements(rootId);
        if (!dropdown || !trigger) continue;
        dropdown.classList.add('hidden');
        trigger.setAttribute('aria-expanded', 'false');
    }
}

export function setLanguagePickerOpen(open, rootId) {
    if (open) {
        for (const id of LANGUAGE_PICKER_ROOT_IDS) {
            const { dropdown, trigger } = languagePickerElements(id);
            if (!dropdown || !trigger) continue;
            const show = id === rootId;
            dropdown.classList.toggle('hidden', !show);
            trigger.setAttribute('aria-expanded', show ? 'true' : 'false');
        }
        return;
    }
    if (rootId) {
        const { dropdown, trigger } = languagePickerElements(rootId);
        if (!dropdown || !trigger) return;
        dropdown.classList.add('hidden');
        trigger.setAttribute('aria-expanded', 'false');
        return;
    }
    closeAllLanguagePickers();
}

function syncLanguagePickerUIForRoot(rootId) {
    const lang = getSettingsLanguage();
    const other = lang === 'da' ? 'en' : 'da';
    const {
        picker,
        trigger,
        triggerFlag,
        triggerCode,
        currentName,
        currentFlag,
        switchName,
        switchFlag,
        curLabel,
        swLabel,
    } = languagePickerElements(rootId);
    if (!picker) return;

    if (triggerCode) {
        triggerCode.textContent = languageNativeLabel(lang);
    }
    if (triggerFlag) triggerFlag.innerHTML = LANGUAGE_FLAG_SVG[lang] || '';
    if (currentFlag) currentFlag.innerHTML = LANGUAGE_FLAG_SVG[lang] || '';
    if (switchFlag) switchFlag.innerHTML = LANGUAGE_FLAG_SVG[other] || '';

    const curLabelText = languageNativeLabel(lang);
    const othLabelText = languageNativeLabel(other);
    if (currentName) currentName.textContent = curLabelText;
    if (switchName) switchName.textContent = othLabelText;
    if (curLabel) curLabel.textContent = tSettings('languagePickerCurrent');
    if (swLabel) swLabel.textContent = tSettings('languagePickerSwitch');
    if (trigger) trigger.setAttribute('aria-label', tSettings('language'));
}

function syncLanguagePickerUI() {
    for (const rootId of LANGUAGE_PICKER_ROOT_IDS) {
        syncLanguagePickerUIForRoot(rootId);
    }
}

function switchLanguageSetting() {
    const cur = getSettingsLanguage();
    const next = cur === 'da' ? 'en' : 'da';
    if (!state.appData.settings) state.appData.settings = {};
    state.appData.settings.language = next;
    applySettingsLanguage();
    saveData();
    if (!state.isIOS && !state.isAndroid) void refreshBehaviourBannerIfStale({ force: true });
    closeAllLanguagePickers();
}

let languagePickerDocClickBound = false;

function setupLanguagePickerForRoot(rootId) {
    const { picker, trigger, dropdown, switchBtn } = languagePickerElements(rootId);
    if (!picker || !trigger || !dropdown || !switchBtn) return;
    if (picker.dataset.bound === '1') return;
    picker.dataset.bound = '1';

    trigger.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const isOpen = trigger.getAttribute('aria-expanded') === 'true';
        setLanguagePickerOpen(!isOpen, rootId);
    });

    dropdown.addEventListener('click', (e) => e.stopPropagation());

    switchBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        switchLanguageSetting();
    });
}

export function setupLanguagePicker() {
    for (const rootId of LANGUAGE_PICKER_ROOT_IDS) {
        setupLanguagePickerForRoot(rootId);
    }

    if (!languagePickerDocClickBound) {
        languagePickerDocClickBound = true;
        document.addEventListener('click', () => {
            closeAllLanguagePickers();
        });
        document.addEventListener('keydown', (e) => {
            if (e.key !== 'Escape') return;
            if (isAnyLanguagePickerOpen()) closeAllLanguagePickers();
        });
    }
}

/** Confirmation modals — describe typing challenge count + time estimate */
export function formatConfirmModalOverrideTypingLine({ type, count, estimatedMinutes, resumeShortGibberish = false }) {
    const minutes = estimatedMinutes;
    const charUnitDa = 'tegn';
    const charUnitEn = count === 1 ? 'character' : 'characters';
    const charUnit = getSettingsLanguage() === 'da' ? charUnitDa : charUnitEn;
    const wordUnitDa = count === 1 ? 'ord' : 'ord';
    const wordUnitEn = count === 1 ? 'word' : 'words';
    const wordUnit = getSettingsLanguage() === 'da' ? wordUnitDa : wordUnitEn;

    if (type === 'custom') {
        return tSettingsFmt('confirmOverrideCustomPhraseFmt', { count, minutes });
    }
    if (type === 'gibberish') {
        if (usesMobileWordCountForOverrideType(type)) {
            return tSettingsFmt('confirmOverrideGibberishWordsFmt', { count, wordUnit, minutes });
        }
        if (resumeShortGibberish) {
            return tSettingsFmt('confirmOverrideGibberishShortFmt', { count, minutes });
        }
        return tSettingsFmt('confirmOverrideGibberishLettersFmt', { count, charUnit, minutes });
    }
    return usesMobileWordCountForOverrideType(type)
        ? tSettingsFmt('confirmOverrideRandomWordsIosFmt', { count, wordUnit, minutes })
        : tSettingsFmt('confirmOverrideRandomWordsFmt', { count, charUnit, minutes });
}

/** Static copy on the migration / extension-setup overlay — call when language changes. */
function applyMigrationOverlayStaticCopy() {
    invalidateMigrationMacCopyCache();
    const setHtml = (id, html) => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = html;
    };
    const setText = (id, text) => {
        const el = document.getElementById(id);
        if (el) el.textContent = text;
    };
    setText('migration-pre-title', tSettings('migrationPreWelcomeTitle'));
    setText('migration-pre-subtitle', tSettings('migrationPreSubtitle'));
    setHtml('migration-pre-explainer', tSettings('migrationPreExplainerHtml'));
    setText('migration-pre-bullet-1', tSettings('migrationPreBulletHelper'));
    setHtml('migration-pre-bullet-2', tSettings('migrationPreBulletHostsHtml'));
    setText('migration-pre-bullet-3', tSettings('migrationPreBulletBlocklists'));
    setHtml('migration-pre-warn', tSettings('migrationPreWarnHtml'));
    setText('migration-checklist-cleaned-label', tSettings('migrationChecklistCleanedOld'));
    setText('migration-checklist-blocks-label', tSettings('migrationChecklistBlocklistsPreserved'));
    syncMigrationPostHeader(lastMigrationBrowserState);
    setHtml('migration-checklist-ext-lines', migrationExtLinesHtml(lastMigrationBrowserState));
    setText('migration-howto-title', tSettings('migrationHowtoHeading'));
    if (state.isMacOSDesktop) {
        syncMigrationMacHowto(lastMigrationBrowserState);
    } else {
        setHtml('migration-howto-li1', tSettings('migrationHowtoLi1Html'));
        document.getElementById('migration-howto-li2')?.classList.add('hidden');
        document.getElementById('migration-howto-li3')?.classList.remove('hidden');
        setHtml('migration-howto-li3', tSettings('migrationHowtoLi3Html'));
    }
    setText('migration-done-btn', tSettings('migrationDone'));
    setText('migration-skip-btn', tSettings('migrationSkip'));
    setText('migration-back-btn', tSettings('eulaBackBtn'));
    syncMigrationPostBackButtonVisibility();
    setText('enforcement-toggle-headline-text', tSettings('migrationEnforcementHeadline'));
    void applyEnforcementDescCopy(lastMigrationBrowserState);
    setText('enforcement-toggle-disable-note-text', tSettings('migrationEnforcementDisableNote'));
    void updateAllEnforcementToggleLocks();
    setText('settings-enforcement-heading', tSettings('settingsEnforcementHeading'));
    const continueBtn = document.getElementById('migration-continue-btn');
    if (continueBtn && !continueBtn.disabled) {
        continueBtn.textContent = tSettings('migrationContinue');
    }
    setText('migration-post-title', tSettings('migrationPostTitleCleanup'));
    setText('migration-post-subtitle', tSettings('migrationPostSubtitleCleanup'));
}

/** First-run EULA screen — localized from current UI language / saved preference / browser locale (da). */
function applyEulaOnboardingLanguage() {
    const title = tSettings('welcomeOnboardingTitle');

    const shieldLogo = document.getElementById('eula-onboarding-shield-logo');
    if (shieldLogo) {
        shieldLogo.src = logoReddShieldUrl;
        shieldLogo.alt = '';
    }

    const heading = document.getElementById('eula-welcome-title');
    if (heading) heading.textContent = title;

    const headingIos = document.getElementById('eula-welcome-title-ios');
    if (headingIos) headingIos.textContent = title;

    const subtitle = document.getElementById('eula-onboarding-subtitle');
    if (subtitle) subtitle.textContent = tSettings('welcomeOnboardingSubtitle');

    const subtitleIos = document.getElementById('eula-onboarding-subtitle-ios');
    if (subtitleIos) subtitleIos.textContent = tSettings('welcomeOnboardingSubtitle');

    const appIcon = document.getElementById('eula-onboarding-app-icon');
    if (appIcon) appIcon.setAttribute('alt', tSettings('eulaWelcomeIconAlt'));

    const agreeInner = document.getElementById('eula-agree-line-inner');
    if (agreeInner) agreeInner.innerHTML = tSettings('eulaAgreeLineHtml');

    const note = document.getElementById('eula-note');
    if (note) note.innerHTML = tSettings('eulaNoteHtml');

    const blurb = document.getElementById('eula-project-blurb');
    if (blurb) blurb.innerHTML = tSettings('eulaProjectBlurb');

    const footer1 = document.getElementById('eula-onboarding-footer-1');
    if (footer1) footer1.innerHTML = tSettings('welcomeFooter1Html');

    const footer2 = document.getElementById('eula-onboarding-footer-2');
    if (footer2) footer2.innerHTML = tSettings('welcomeFooter2Html');

    const cb = document.getElementById('eula-agree-checkbox');
    if (cb) cb.setAttribute('aria-label', tSettings('eulaAgreeAria'));

    const continueBtn = document.getElementById('eula-continue-btn');
    if (continueBtn) continueBtn.textContent = tSettings('eulaContinueBtn');

    const backBtn = document.getElementById('eula-back-btn');
    if (backBtn) {
        backBtn.textContent = tSettings('eulaBackBtn');
        backBtn.classList.toggle('hidden', state.isIOS);
    }
}

/** Safari FDA onboarding — same layout/copy pattern as the EULA screen. */
function applySafariFdaOnboardingLanguage() {
    const shield = document.getElementById('fda-onboarding-shield-logo');
    if (shield) {
        shield.src = logoReddShieldUrl;
        shield.alt = '';
    }
    const screenshot = document.getElementById('fda-onboarding-screenshot');
    if (screenshot) screenshot.src = screenshotEnableFda;

    const title = document.getElementById('fda-onboarding-title');
    if (title) title.textContent = tSettings('safariFdaOnboardingTitle');

    const howto = document.getElementById('fda-onboarding-howto');
    if (howto) howto.textContent = tSettings('safariFdaOnboardingHowto');

    const backBtn = document.getElementById('fda-onboarding-back-btn');
    if (backBtn) backBtn.textContent = tSettings('eulaBackBtn');

    void syncSafariFdaOnboardingGrantButton();
}

/** Welcome onboarding screen — localized in the same way as the EULA screen. */
function applyWelcomeOnboardingLanguage() {
    const shieldLogo = document.getElementById('welcome-onboarding-shield-logo');
    if (shieldLogo) {
        shieldLogo.src = logoReddShieldUrl;
        shieldLogo.alt = '';
    }

    const heading = document.getElementById('welcome-onboarding-title');
    if (heading) heading.textContent = tSettings('welcomeOnboardingTitle');

    const subtitle = document.getElementById('welcome-onboarding-subtitle');
    if (subtitle) subtitle.textContent = tSettings('welcomeOnboardingSubtitle');

    const howHeading = document.getElementById('welcome-how-heading');
    if (howHeading) howHeading.textContent = tSettings('welcomeHowHeading');

    const focusLogoHtml =
        `<img src="${logoReddFocusUrl}" alt="" class="welcome-reddfocus-inline-logo" aria-hidden="true"> `;
    const appleLogoHtml =
        `<img src="${appleLogoUrl}" alt="" class="welcome-apple-inline-logo" aria-hidden="true"> `;

    const stepMac = document.getElementById('welcome-step-mac');
    const stepFirefox = document.getElementById('welcome-step-firefox');

    const step1Title = document.getElementById('welcome-step-1-title');
    const step1Body = document.getElementById('welcome-step-1-body');
    const step2Title = document.getElementById('welcome-step-2-title');
    const step2Body = document.getElementById('welcome-step-2-body');

    if (state.isMacOSDesktop) {
        stepMac?.classList.remove('hidden');
        stepFirefox?.classList.toggle('hidden', !welcomeFirefoxInstalled);

        if (step1Title) {
            step1Title.innerHTML = tSettings('welcomeStep1TitleAutomationHtml').replace('{APPLE}', appleLogoHtml);
        }
        if (step1Body) step1Body.innerHTML = tSettings('welcomeStep1BodyAutomationHtml');

        if (welcomeFirefoxInstalled) {
            if (step2Title) {
                step2Title.innerHTML = tSettings('welcomeStep2TitleFirefoxHtml')
                    .replace('{APPLE}', appleLogoHtml)
                    .replace('{LOGO}', focusLogoHtml);
            }
            if (step2Body) {
                step2Body.innerHTML = tSettings('welcomeStep2BodyFirefoxHtml');
            }
        }
    } else {
        stepMac?.classList.add('hidden');
        stepFirefox?.classList.remove('hidden');

        let step2TitleKey = 'welcomeStep2TitleHtml';
        let step2BodyKey = 'welcomeStep2BodyHtml';
        if (state.isAndroid) {
            step2TitleKey = 'welcomeStep2TitleAndroidHtml';
            step2BodyKey = 'welcomeStep2BodyAndroidHtml';
        } else if (state.isIOS) {
            step2TitleKey = 'welcomeStep2TitleIosHtml';
            step2BodyKey = 'welcomeStep2BodyIosHtml';
        }

        if (step2Title) step2Title.innerHTML = tSettings(step2TitleKey);
        if (step2Body) {
            step2Body.innerHTML = tSettings(step2BodyKey).replace('{LOGO}', focusLogoHtml);
        }
    }

    const step3Title = document.getElementById('welcome-step-3-title');
    if (step3Title) step3Title.textContent = tSettings('welcomeStep3TitleHtml');
    const step3Body = document.getElementById('welcome-step-3-body');
    if (step3Body) step3Body.innerHTML = tSettings('welcomeStep3BodyHtml');

    document.querySelectorAll('#welcome-onboarding .welcome-step:not(.hidden) .welcome-step-num').forEach((num, i) => {
        num.textContent = String(i + 1);
    });

    const demoToggleLabel = document.getElementById('welcome-demo-toggle-label');
    if (demoToggleLabel) demoToggleLabel.textContent = tSettings('welcomeDemoToggleLabel');

    const demoCaption = document.getElementById('welcome-demo-video-caption');
    if (demoCaption) demoCaption.textContent = tSettings('welcomeDemoVideoCaption');

    const demoPlayBtn = document.getElementById('welcome-demo-play-btn');
    syncWelcomeDemoPlayLabel();

    const closeLabel = document.getElementById('welcome-demo-close-label');
    if (closeLabel) closeLabel.textContent = tSettings('welcomeDemoCloseLabel');
    const closeBtn = document.getElementById('welcome-demo-close-btn');
    if (closeBtn) closeBtn.setAttribute('aria-label', tSettings('welcomeDemoCloseLabel'));

    syncWelcomeDemoFullscreenLabel();

    const demoVideo = document.getElementById('welcome-demo-video');
    if (demoVideo && !demoVideo.src) {
        demoVideo.src = welcomeDemoVideoUrl;
    }

    const continueBtn = document.getElementById('welcome-onboarding-continue-btn');
    if (continueBtn) continueBtn.textContent = tSettings('welcomeOnboardingContinueBtn');

    const footer1 = document.getElementById('welcome-onboarding-footer-1');
    if (footer1) footer1.innerHTML = tSettings('welcomeFooter1Html');

    const footer2 = document.getElementById('welcome-onboarding-footer-2');
    if (footer2) footer2.innerHTML = tSettings('welcomeFooter2Html');
}

function isWelcomeDemoVideoExpanded() {
    return document.getElementById('welcome-demo-video-wrap')?.classList.contains('welcome-demo-video-wrap--expanded') ?? false;
}

function setWelcomeDemoVideoExpanded(expanded) {
    const wrap = document.getElementById('welcome-demo-video-wrap');
    const fullscreenBtn = document.getElementById('welcome-demo-fullscreen-btn');
    const closeBtn = document.getElementById('welcome-demo-close-btn');
    if (!wrap) return;
    wrap.classList.toggle('welcome-demo-video-wrap--expanded', expanded);
    fullscreenBtn?.toggleAttribute('hidden', expanded);
    closeBtn?.toggleAttribute('hidden', !expanded);
    syncWelcomeDemoFullscreenLabel();
}

function syncWelcomeDemoFullscreenLabel() {
    const fullscreenBtn = document.getElementById('welcome-demo-fullscreen-btn');
    if (!fullscreenBtn) return;
    fullscreenBtn.setAttribute(
        'aria-label',
        tSettings(isWelcomeDemoVideoExpanded() ? 'welcomeDemoFullscreenExitAriaLabel' : 'welcomeDemoFullscreenEnterAriaLabel'),
    );
}

function syncWelcomeDemoPlayLabel() {
    const playBtn = document.getElementById('welcome-demo-play-btn');
    const video = document.getElementById('welcome-demo-video');
    if (!playBtn || !video) return;
    const labelKey = video.paused
        ? (video.currentTime > 0 ? 'welcomeDemoResumeAriaLabel' : 'welcomeDemoPlayAriaLabel')
        : 'welcomeDemoPauseAriaLabel';
    playBtn.setAttribute('aria-label', tSettings(labelKey));
}

function syncWelcomeDemoVideoCaption() {
    const caption = document.getElementById('welcome-demo-video-caption');
    const video = document.getElementById('welcome-demo-video');
    if (!caption || !video) return;
    caption.classList.toggle('hidden', !video.paused);
}

function toggleWelcomeDemoPlayback(video) {
    if (video.paused) {
        video.play().catch(() => {});
    } else {
        video.pause();
    }
}

function resetWelcomeDemoPanel() {
    const toggle = document.getElementById('welcome-demo-toggle');
    const panel = document.getElementById('welcome-demo-panel');
    const video = document.getElementById('welcome-demo-video');
    const playBtn = document.getElementById('welcome-demo-play-btn');
    setWelcomeDemoVideoExpanded(false);
    if (toggle) {
        toggle.classList.remove('open');
        toggle.setAttribute('aria-expanded', 'false');
    }
    if (panel) panel.classList.add('hidden');
    if (video) {
        video.pause();
        video.currentTime = 0;
    }
    if (playBtn) playBtn.classList.remove('hidden');
    syncWelcomeDemoVideoCaption();
}

function initWelcomeDemoControls() {
    // Skip on Android: the welcome demo video is a large mp4 served
    // through Tauri's custom-protocol asset handler, which doesn't
    // support the HTTP Range requests Android WebView's <video> element
    // needs — it 404/fails to load there even though it works fine in
    // WKWebView on iOS. Hide the whole toggle/panel rather than show a
    // permanently-broken video player.
    if (state.isAndroid) {
        document.getElementById('welcome-demo-toggle')?.classList.add('hidden');
        document.getElementById('welcome-demo-panel')?.classList.add('hidden');
        return;
    }

    const toggle = document.getElementById('welcome-demo-toggle');
    const panel = document.getElementById('welcome-demo-panel');
    const videoWrap = document.getElementById('welcome-demo-video-wrap');
    const video = document.getElementById('welcome-demo-video');
    const playBtn = document.getElementById('welcome-demo-play-btn');
    const fullscreenBtn = document.getElementById('welcome-demo-fullscreen-btn');
    const closeBtn = document.getElementById('welcome-demo-close-btn');
    if (!toggle || !panel || !video || !playBtn) return;

    toggle.addEventListener('click', () => {
        const isOpen = toggle.classList.toggle('open');
        toggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
        panel.classList.toggle('hidden', !isOpen);
        if (!isOpen) {
            setWelcomeDemoVideoExpanded(false);
            video.pause();
            video.currentTime = 0;
            playBtn.classList.remove('hidden');
        }
    });

    playBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        toggleWelcomeDemoPlayback(video);
    });

    fullscreenBtn?.addEventListener('click', (event) => {
        event.stopPropagation();
        setWelcomeDemoVideoExpanded(true);
    });

    closeBtn?.addEventListener('click', (event) => {
        event.stopPropagation();
        setWelcomeDemoVideoExpanded(false);
    });

    let demoClickTimer = null;
    video.addEventListener('click', () => {
        if (demoClickTimer) clearTimeout(demoClickTimer);
        demoClickTimer = setTimeout(() => {
            demoClickTimer = null;
            toggleWelcomeDemoPlayback(video);
        }, 220);
    });

    video.addEventListener('dblclick', (event) => {
        event.preventDefault();
        if (demoClickTimer) {
            clearTimeout(demoClickTimer);
            demoClickTimer = null;
        }
        if (isWelcomeDemoVideoExpanded()) {
            setWelcomeDemoVideoExpanded(false);
        } else {
            setWelcomeDemoVideoExpanded(true);
        }
    });

    window.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && isWelcomeDemoVideoExpanded()) {
            event.preventDefault();
            setWelcomeDemoVideoExpanded(false);
        }
    }, true);

    videoWrap?.addEventListener('click', (event) => {
        if (!isWelcomeDemoVideoExpanded() || event.target !== videoWrap) return;
        setWelcomeDemoVideoExpanded(false);
    });

    video.addEventListener('play', () => {
        playBtn.classList.add('hidden');
        syncWelcomeDemoPlayLabel();
        syncWelcomeDemoVideoCaption();
    });
    video.addEventListener('pause', () => {
        if (video.currentTime < video.duration) playBtn.classList.remove('hidden');
        syncWelcomeDemoPlayLabel();
        syncWelcomeDemoVideoCaption();
    });
    video.addEventListener('ended', () => {
        playBtn.classList.remove('hidden');
        video.currentTime = 0;
        syncWelcomeDemoPlayLabel();
        syncWelcomeDemoVideoCaption();
    });
}

export function websiteWord(count) {
    if (getSettingsLanguage() === 'da') {
        return count === 1 ? 'hjemmeside' : 'hjemmesider';
    }
    return count === 1 ? 'website' : 'websites';
}

function siteWord(count) {
    if (getSettingsLanguage() === 'da') {
        return count === 1 ? 'websted' : 'websteder';
    }
    return count === 1 ? 'site' : 'sites';
}

/** Short label from a blocked domain, e.g. instagram.com → instagram. */
function siteNameForDisplay(url) {
    const host = cleanUrlForDisplay(url).split('/')[0].split(':')[0];
    const parts = host.split('.').filter(Boolean);
    if (parts.length === 0) return host;
    if (parts.length === 1) return parts[0];
    return parts[parts.length - 2];
}

/** Room card line, e.g. "3 sites · instagram, youtube, reddit". */
export function formatBlocklistCardSitesSummary(websiteCount, websites, showDetails) {
    const countLabel = `${websiteCount} ${siteWord(websiteCount)}`;
    if (!showDetails || websiteCount === 0) return countLabel;
    const names = (websites || []).map(siteNameForDisplay);
    return names.length > 0 ? `${countLabel} · ${names.join(', ')}` : countLabel;
}

function formatCurrentVersionText(version) {
    return `${tSettings('yourVersionPrefix')} ${version || 'Unknown'}`;
}

function formatLatestVersionText(version) {
    return `${tSettings('latestVersionPrefix')} ${version || 'Unknown'}`;
}

export function applyFormattedCurrentVersion(el, version) {
    if (!el) return;
    el.dataset.appVersion = version || 'Unknown';
    el.textContent = formatCurrentVersionText(el.dataset.appVersion);
}

export function applyFormattedLatestVersion(el, version) {
    if (!el) return;
    el.dataset.appVersion = version;
    el.textContent = formatLatestVersionText(version);
}

function refreshSettingsVersionLabels() {
    const currentVersionEl = document.getElementById('current-app-version');
    if (currentVersionEl?.dataset.appVersion) {
        currentVersionEl.textContent = formatCurrentVersionText(currentVersionEl.dataset.appVersion);
    }
    const latestVersionEl = document.getElementById('latest-app-version');
    if (latestVersionEl?.dataset.appVersion) {
        latestVersionEl.textContent = formatLatestVersionText(latestVersionEl.dataset.appVersion);
    }
}

/** Blocklist modal: always show the example placeholder in the websites input row. */
function syncModalWebsitePlaceholder() {
    const el = document.getElementById('modal-website-input');
    if (!el || el.classList.contains('input-error')) return;
    el.placeholder = tSettings('placeholderWebsiteExample');
}

export function applySettingsLanguage() {
    const setText = (id, text) => {
        const el = document.getElementById(id);
        if (el) el.textContent = text;
    };
    const setHtml = (id, html) => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = html;
    };

    // Main shell / scheduler
    setText('update-banner-prefix', tSettings('updateBannerPrefix'));
    setText('update-banner-suffix', tSettings('updateBannerSuffix'));
    if (!updateDownloadInProgress) {
        setText('update-banner-link', tSettings('updateBannerCta'));
    }
    const updateWhatsNewBtn = document.getElementById('update-banner-whats-new');
    if (updateWhatsNewBtn && !updateWhatsNewBtn.classList.contains('hidden')) {
        updateWhatsNewBtn.innerHTML = updateBannerWhatsNewButtonHtml();
    }
    setText(
        'setup-banner-headline',
        tSettings(state.isMacOSDesktop ? 'setupBrowsersBannerHeadlineMac' : 'setupBrowsersBannerHeadline'),
    );
    syncSetupBannerHeadline();
    setText('behaviour-change-help', tSettings('setupBrowsersBannerCta'));
    const behaviourDismissBtn = document.getElementById('behaviour-change-dismiss');
    if (behaviourDismissBtn) {
        behaviourDismissBtn.title = tSettings('setupBrowsersBannerDismissTitle');
    }
    setText('main-start-block-title', tSettings('mainStartBlockTitle'));
    setText('instant-mode-tab-label', tSettings('modeTimer'));
    setText('schedule-mode-tab-label', tSettings('modeSchedule'));
    setText('selection-prompt-label', tSettings('selectionPrompt'));
    const blocklistSelect = document.getElementById('blocklist-select');
    if (blocklistSelect && blocklistSelect.options.length > 0) {
        blocklistSelect.options[0].textContent = tSettings('selectionPromptOption');
    }
    setText('main-blocklists-title', tSettings('yourBlocklists'));
    setText('main-schedule-title', tSettings('scheduleTitle'));
    setText('no-active-blocks-label', tSettings('noActiveBlocks'));
    setText('always-on-row-label-lead', tSettings('alwaysOnRowLead'));
    setText(
        'always-on-row-label-hint',
        ` (${tSettings('alwaysOnRowTimelineHint')}):`
    );
    setText('now-blocking-label-text', tSettings('nowBlockingLabel'));
    setText('schedule-footer-hint', tSettings('scheduleFooterHint'));
    setText('duration-quick-btn-15', tSettings('durationQuick15m'));
    setText('duration-quick-btn-30', tSettings('durationQuick30m'));
    setText('duration-quick-btn-45', tSettings('durationQuick45m'));
    setText('duration-quick-btn-60', tSettings('durationQuick1Hour'));
    setText('duration-quick-btn-120', tSettings('durationQuick2Hours'));
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
    setText('schedule-segments-heading', tSettings('scheduleWhenHeading'));
    setText('repeat-label', tSettings('repeat'));
    setText('schedule-panel-overlay-label', tSettings('scheduleActiveOverlayLabel'));
    const repeatNo = document.querySelector('.repeat-option[data-value="no"]');
    const repeatForever = document.querySelector('.repeat-option[data-value="forever"]');
    const repeatDate = document.querySelector('.repeat-option[data-value="date"]');
    if (repeatNo) repeatNo.textContent = tSettings('repeatNo');
    if (repeatForever) repeatForever.textContent = tSettings('repeatForever');
    if (repeatDate) repeatDate.textContent = tSettings('repeatUntilDate');
    const repeatDropdownText = document.getElementById('repeat-dropdown-text');
    if (repeatDropdownText) {
        if (state.scheduleRepeatType === 'forever') repeatDropdownText.textContent = tSettings('repeatForever');
        else if (state.scheduleRepeatType === 'date') repeatDropdownText.textContent = tSettings('repeatUntilDate');
        else repeatDropdownText.textContent = tSettings('repeatNo');
    }
    setText('pause-btn-label', tSettings('pause'));
    setBtnActionLabel(document.getElementById('start-block-btn-label'), tSettings('startBlockButton'), { simple: true });
    const startBlockBtn = document.getElementById('start-block-btn');
    if (startBlockBtn) {
        setStartBlockBtnLeadingIcon(
            startBlockBtn,
            startBlockBtn.classList.contains('stop-block') ? 'stop' : 'enter',
        );
    }
    setBtnActionLabel(document.getElementById('start-schedule-btn-label'), tSettings('startScheduleButton'));
    const startScheduleBtn = document.getElementById('start-schedule-btn');
    if (startScheduleBtn) {
        setStartBlockBtnLeadingIcon(
            startScheduleBtn,
            startScheduleBtn.classList.contains('stop-schedule') ? 'stop' : 'enter',
        );
    }
    setText('footer-made-with', tSettings('madeWith'));
    setText('footer-by', tSettings('by'));
    const setPlaceholder = (id, text) => {
        const el = document.getElementById(id);
        if (el) el.placeholder = text;
    };
    setPlaceholder('blocklist-name', tSettings('placeholderNameExample'));
    setPlaceholder('modal-app-input', tSettings('placeholderAppExample'));
    syncModalWebsitePlaceholder();
    setPlaceholder('challenge-input', tSettings('typeHere'));
    setPlaceholder('pause-challenge-input', tSettings('typeHere'));
    setPlaceholder('override-all-challenge-input', tSettings('typeHere'));
    setText('website-input-error', tSettings('invalidDomainMsg'));

    // Blocklist modal
    const modalTitle = document.getElementById('modal-title');
    if (modalTitle) {
        modalTitle.textContent = state.editingBlocklistId ? tSettings('editBlocklist') : tSettings('createBlocklist');
    }
    setText('active-blocklist-warning-text', tSettings('activeBlocklistWarning'));
    setText('blocklist-name-label', tSettings('name'));
    setText('blocklist-websites-label', tSettings('websites'));
    setText('blocklist-websites-tooltip', tSettings('websitesTooltip'));
    setText('blocklist-apps-label', tSettings('apps'));
    setText('blocklist-apps-tooltip', tSettings(
        'appsTooltip'
    ));
    setText('override-difficulty-label', tSettings('overrideDifficulty'));
    setText('override-method-label', tSettings('overrideMethod'));
    setText('override-option-random-words', tSettings('overrideRandomWords'));
    setText('override-option-gibberish', tSettings('overrideGibberish'));
    setText('override-option-custom', tSettings('overrideCustomText'));
    setText('override-max-difficulty-label', tSettings('overrideMaxDifficulty'));
    setText('override-preview-label', tSettings('overridePreviewLooksLike'));
    const overrideType = document.getElementById('override-type')?.value || 'random-words';
    syncOverrideCountUi(overrideType);
    updateOverridePreview();
    setText('blocklist-emoji-label', tSettings('emoji'));
    setText('blocklist-color-label', tSettings('color'));
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
    setText('modal-import-websites-caption', tSettings('modalPremadeListsCaption'));
    setText('modal-browse-apps-caption', tSettings('modalBrowseAppsCaption'));
    const modalBrowseAppsBtn = document.getElementById('modal-browse-apps-btn');
    if (modalBrowseAppsBtn) {
        const browseTitle = document.body.classList.contains('ios')
            ? tSettings('modalBrowseAppsTitleIos')
            : tSettings('browseApplicationsTitle');
        modalBrowseAppsBtn.title = browseTitle;
        modalBrowseAppsBtn.setAttribute('aria-label', browseTitle);
    }
    setText('cancel-blocklist-btn', tSettings('cancel'));
    setText('save-blocklist-btn', tSettings('save'));

    // Modal copy
    setText('override-modal-title', tSettings('stopFocusSpaceTitle'));
    setText('override-confirm-blocking-label', tSettings('startConfirmBlockingLabel'));
    setText('override-confirm-show-all-blocking', tSettings('showAll'));
    setText('override-modal-instruction', tSettings('overrideInstruction'));
    setText('cancel-override-btn', tSettings('cancel'));
    setStartConfirmPrimaryLabel('confirm-override-btn', tSettings('stopBlock'));
    setText('pause-modal-title', tSettings('pauseFocusSpaceTitle'));
    setText('pause-confirm-blocking-label', tSettings('startConfirmBlockingLabel'));
    setText('pause-confirm-show-all-blocking', tSettings('showAll'));
    setText('pause-modal-instruction', tSettings('pauseInstruction'));
    setText('pause-for-label', tSettings('pauseFor'));
    setText('pause-restarts-at-label', tSettings('restartsAt'));
    setText('cancel-pause-btn', tSettings('cancel'));
    setStartConfirmPrimaryLabel('confirm-pause-btn', tSettings('pauseBlock'));
    setText('start-block-confirm-title', tSettings('startThisBlock'));
    setText('start-confirm-blocking-label', tSettings('startConfirmBlockingLabel'));
    setText('start-confirm-duration-label', tSettings('startConfirmDurationLabel'));
    setText('start-confirm-show-all-blocking', tSettings('showAll'));
    setText('confirm-override-header', tSettings('startBlockHoldHeader'));
    setText('cancel-start-confirm-btn', tSettings('cancel'));
    setStartConfirmPrimaryLabel('proceed-start-confirm-btn', tSettings('startBlock'));
    setText('start-schedule-confirm-title', tSettings('startThisSchedule'));
    setText('schedule-confirm-blocking-label', tSettings('startConfirmBlockingLabel'));
    setText('schedule-confirm-show-all-blocking', tSettings('showAll'));
    setText('schedule-confirm-times-label', tSettings('startConfirmTimesLabel'));
    setText('schedule-confirm-repeat-label', tSettings('startConfirmRepeatsLabel'));
    setText('schedule-confirm-overlay-label', tSettings('scheduleConfirmOverlayLabel'));
    const confirmOverlayCustomiseBtn = document.getElementById('schedule-confirm-overlay-customise-btn');
    if (confirmOverlayCustomiseBtn) {
        confirmOverlayCustomiseBtn.title = tSettings('scheduleOverlayCustomiseBtn');
        confirmOverlayCustomiseBtn.setAttribute('aria-label', tSettings('scheduleOverlayCustomiseBtn'));
    }
    const panelOverlayCustomiseBtn = document.getElementById('schedule-panel-overlay-customise-btn');
    if (panelOverlayCustomiseBtn) {
        panelOverlayCustomiseBtn.title = tSettings('scheduleOverlayCustomiseBtn');
        panelOverlayCustomiseBtn.setAttribute('aria-label', tSettings('scheduleOverlayCustomiseBtn'));
    }
    const overlayDescEl = document.getElementById('schedule-confirm-overlay-desc');
    if (overlayDescEl && !overlayDescEl.textContent) {
        overlayDescEl.textContent = tSettings('scheduleConfirmOverlayDefaultDesc');
    }
    syncScheduleOverlayCustomiseTitle();
    setText('schedule-overlay-select-label', tSettings('scheduleOverlaySelectLabel'));
    setText('schedule-overlay-select-unsaved-badge', tSettings('scheduleOverlayUnsavedBadge'));
    setText('schedule-overlay-add-new-btn', tSettings('scheduleOverlayAddNewBtn'));
    setText('schedule-overlay-delete-btn', tSettings('scheduleOverlayDeleteBtn'));
    setText('schedule-overlay-delete-title', tSettings('scheduleOverlayDeleteConfirmTitle'));
    setText('cancel-schedule-overlay-delete-btn', tSettings('cancel'));
    setText('confirm-schedule-overlay-delete-btn', tSettings('scheduleOverlayDeleteBtn'));
    setText('schedule-overlay-discard-title', tSettings('scheduleOverlayDiscardConfirmTitle'));
    setText('cancel-schedule-overlay-discard-btn', tSettings('scheduleOverlayKeepEditingBtn'));
    setText('confirm-schedule-overlay-discard-btn', tSettings('scheduleOverlayDiscardConfirmBtn'));
    if (isScheduleOverlayCustomiseModalOpen() && state.scheduleOverlayCustomiseSelection) {
        populateScheduleOverlayCustomiseSelector(state.scheduleOverlayCustomiseSelection);
        syncScheduleOverlayCustomiseEditorState(state.scheduleOverlayCustomiseSelection);
        syncScheduleOverlayCustomiseTitle(state.scheduleOverlayCustomiseSelection);
        syncScheduleOverlayCustomiseDirtyState();
        const noticeEl = document.getElementById('schedule-overlay-default-notice');
        if (noticeEl && state.scheduleOverlayCustomiseSelection === SCHEDULE_OVERLAY_DEFAULT_PRESET_VALUE) {
            noticeEl.textContent = tSettings('scheduleOverlayDefaultNotice');
        }
    }
    setText('schedule-overlay-name-label', tSettings('scheduleOverlayNameLabel'));
    const overlayNameInput = document.getElementById('schedule-overlay-name-input');
    if (overlayNameInput) overlayNameInput.placeholder = tSettings('scheduleOverlayNamePlaceholder');
    setText('schedule-overlay-heading-label', tSettings('scheduleOverlayHeadingLabel'));
    setText('schedule-overlay-heading-placeholders-note', tSettings('scheduleOverlayHeadingPlaceholdersHint'));
    const overlayHeadingInput = document.getElementById('schedule-overlay-heading-input');
    if (overlayHeadingInput) overlayHeadingInput.placeholder = tSettings('scheduleOverlayHeadingPlaceholder');
    setText('schedule-overlay-message-label', tSettings('scheduleOverlayMessageLabel'));
    setText('schedule-overlay-message-placeholders-note', tSettings('scheduleOverlayMessagePlaceholdersHint'));
    setText('schedule-overlay-lets-go-label', tSettings('scheduleOverlayLetsGoFieldLabel'));
    setText('schedule-overlay-image-label', tSettings('scheduleOverlayImageLabel'));
    setText('schedule-overlay-image-drop-hint', tSettings('scheduleOverlayImageDropHint'));
    setText('schedule-overlay-voice-label', tSettings('scheduleOverlayVoiceLabel'));
    setText('schedule-overlay-voice-help', tSettings('scheduleOverlayVoiceHelp'));
    setText('schedule-overlay-choose-image-btn', tSettings('scheduleOverlayChooseImage'));
    setText('schedule-overlay-record-voice-btn-label', tSettings('scheduleOverlayRecordVoice'));
    setText('schedule-overlay-stop-record-voice-btn-label', tSettings('scheduleOverlayStopRecording'));
    setText('schedule-overlay-choose-voice-btn', tSettings('scheduleOverlayChooseAudio'));
    setText('schedule-overlay-preview-label', tSettings('scheduleOverlayPreviewLabel'));
    setText('schedule-overlay-customise-cancel-btn', tSettings('cancel'));
    setText('schedule-overlay-customise-save-btn', tSettings('scheduleOverlaySaveBtn'));
    setText('schedule-overlay-reset-heading-btn', tSettings('scheduleOverlaySectionReset'));
    setText('schedule-overlay-reset-message-btn', tSettings('scheduleOverlaySectionReset'));
    setText('schedule-overlay-reset-button-btn', tSettings('scheduleOverlaySectionReset'));
    setText('schedule-overlay-reset-image-btn', tSettings('scheduleOverlaySectionReset'));
    setText('schedule-overlay-reset-voice-btn', tSettings('scheduleOverlaySectionReset'));
    setText('schedule-confirm-override-header', tSettings('startScheduleHoldHeader'));
    setText('cancel-schedule-confirm-btn', tSettings('cancel'));
    setStartConfirmPrimaryLabel('proceed-schedule-confirm-btn', tSettings('startSchedule'));
    setText('undo-toast-btn', tSettings('undo'));
    const undoToastMsg = document.getElementById('undo-toast-message');
    if (undoToastMsg && pendingDelete?.blocklist) {
        undoToastMsg.textContent = tSettingsFmt('deleteUndoToastFmt', { name: pendingDelete.blocklist.name });
    }
    setText('override-all-title', tSettings('overrideAllTitle'));
    setText('override-all-warning-strong', tSettings('overrideAllWarningStrong'));
    setText('override-all-warning-body', tSettings('overrideAllWarningBody'));
    setText('override-all-instruction', tSettings('overrideAllInstruction'));
    setText('cancel-override-all-btn', tSettings('cancel'));
    setText('confirm-override-all-btn', tSettings('overrideAll'));
    setText('next-day-indicator', `+1 ${tSettings('nextDay')}`);
    setText('pause-next-day-indicator', `+1 ${tSettings('nextDay')}`);

    setText('settings-modal-title', tSettings('settingsTitle'));
    setText('settings-general-heading', tSettings('settingsGeneralHeading'));
    setText('settings-manage-heading', tSettings('settingsManageHeading'));
    setText('settings-theme-label', tSettings('lightDarkMode'));
    setText('settings-zoom-label', tSettings('zoomLevel'));
    setText('settings-language-label', tSettings('language'));
    syncLanguagePickerUI();
    setText('theme-option-system', tSettings('themeAuto'));
    setText('theme-option-light', tSettings('themeLight'));
    setText('theme-option-dark', tSettings('themeDark'));
    setText('settings-override-all-label', tSettings('settingsOverrideAllLabel'));
    setText('settings-override-all-hint', tSettings('settingsOverrideAllHint'));
    setText('settings-override-all-btn-label', tSettings('settingsOverrideAllBtn'));
    setText('settings-uninstall-label', tSettings('uninstallApp'));
    setText('settings-uninstall-hint', tSettings('settingsUninstallHint'));
    setText('settings-uninstall-btn-label', tSettings('uninstallAppBtn'));
    setText('settings-windows-uninstall-label', tSettings('uninstallApp'));
    setText('settings-windows-uninstall-hint', tSettings('windowsUninstallHint'));
    setText('settings-windows-uninstall-btn-label', tSettings('windowsUninstallOpenSettingsBtn'));
    setText('settings-help-label', tSettings('settingsDiagnosticsLabel'));
    setText('settings-enforcement-heading', tSettings('settingsEnforcementHeading'));
    setText('settings-blocking-method-toggle-label', tSettings('settingsBlockingMethodHeading'));
    setText('settings-blocking-method-hint', tSettings('settingsBlockingMethodHint'));
    setText('settings-blocking-method-chrome-label', tSettings('settingsBlockingMethodChrome'));
    setText('settings-blocking-method-brave-label', tSettings('settingsBlockingMethodBrave'));
    setText('settings-blocking-method-edge-label', tSettings('settingsBlockingMethodEdge'));
    setText('settings-blocking-method-safari-label', tSettings('settingsBlockingMethodSafari'));
    syncBlockingMethodLabelIcons();
    for (const key of MAC_BLOCKING_METHOD_KEYS) {
        const select = document.getElementById(`blocking-method-${key}`);
        if (!select) continue;
        const current = select.value || browserBlockingMethod(key);
        select.innerHTML = '';
        for (const [value, labelKey] of [
            ['automation', 'settingsBlockingMethodAutomation'],
            ['extension', 'settingsBlockingMethodExtension'],
        ]) {
            const opt = document.createElement('option');
            opt.value = value;
            opt.textContent = tSettings(labelKey);
            if (value === current) opt.selected = true;
            select.appendChild(opt);
        }
    }
    setText('settings-enforcement-row-label', tSettings('settingsEnforcementRowLabel'));
    void applyEnforcementDescCopy(lastMigrationBrowserState);
    setText('settings-setup-btn-label', tSettings('settingsSetupBtn'));
    setText('settings-diagnostics-btn-label', tSettings('settingsDiagnosticsBtn'));
    setText('diagnostics-modal-title', tSettings('diagnosticsModalTitle'));
    setText('diagnostics-refresh-btn-label', tSettings('diagnosticsRefresh'));
    setText('diagnostics-copy-btn-label', tSettings('diagnosticsCopyReport'));
    setText('close-diagnostics-btn', tSettings('close'));
    setText('settings-onboarding-btn-label', tSettings('settingsOnboardingBtn'));
    setText('settings-blocklists-io-label', tSettings('settingsBlocklistsIoLabel'));
    setText('settings-blocklists-io-hint', tSettings('settingsBlocklistsIoHint'));
    setText('settings-export-blocklists-btn-label', tSettings('settingsExportBlocklistsBtn'));
    setText('settings-import-blocklists-btn-label', tSettings('settingsImportBlocklistsBtn'));
    setText('uninstall-confirm-title', tSettings('uninstallConfirmTitle'));
    setText('uninstall-delete-data-label', tSettings('uninstallDeleteDataLabel'));
    syncUninstallConfirmModal(null);
    setText('cancel-uninstall-confirm-btn', tSettings('cancel'));
    setText('confirm-uninstall-confirm-btn', tSettings('uninstallConfirmOk'));
    applyMacAutomationIntroCopy();
    // The hint paragraph and button tooltip need re-translation too —
    // refreshUninstallButtonState reads from tSettings() and rewrites
    // both. Cheap to call unconditionally.
    refreshUninstallButtonState();
    updateOverrideAllButtonVisibility();
    void updateAllEnforcementToggleLocks();
    setText('settings-helper-service-label', tSettings('helperService'));
    setText('settings-update-helper-label', tSettings('updateHelper'));
    setText('settings-clean-hosts-label', tSettings('cleanHostsFile'));
    setText('settings-helper-hint', tSettings('helperHint'));
    setText('close-settings-btn', tSettings('settingsDone'));
    setText('grace-period-label-text', tSettings('gracePeriodLabel'));
    setText('grace-period-hint-text', tSettings('gracePeriodHint'));
    setText('app-blocking-lets-go-btn-label', tSettings('appBlockingLetsGo'));
    setText('app-blocking-snooze-btn-label', tSettings('appBlockingSnoozeBtn'));
    setHtml('settings-feedback-footer-text', tSettings('settingsFeedbackFooterHtml'));
    updateGraceSettingLock();
    refreshSettingsVersionLabels();

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

    applyMigrationOverlayStaticCopy();
    applyEulaOnboardingLanguage();
    applyWelcomeOnboardingLanguage();
    applySafariFdaOnboardingLanguage();
    setText('ios-screentime-onboarding-title', tSettings('welcomeOnboardingTitle'));
    setText('ios-screentime-onboarding-note', tSettings('eulaProjectBlurb'));

    if (migrationOnboardingActive && lastMigrationBrowserState) {
        renderBrowserInstallButtons(lastMigrationBrowserState, { force: true });
    }

    // Re-render pieces with dynamic language-dependent text.
    renderAppBlockingWarningOverlay();
    renderAppBlockingClosedownBanner();
    renderBlocklists();
    if (document.getElementById('blocklist-select')) renderBlocklistSelector();
    if (typeof updateScheduleButtonState === 'function') updateScheduleButtonState();
    if (typeof syncSelectedControlState === 'function') syncSelectedControlState();
    if (typeof updateWeekCalendar === 'function') updateWeekCalendar();
    if (typeof rebuildScheduleSegments === 'function') rebuildScheduleSegments();
    renderNowBlockingRow();
    if (typeof updateOverridePreview === 'function') updateOverridePreview();
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
