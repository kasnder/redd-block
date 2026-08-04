// Quick start: one-off block/allow without naming or permanently saving a
// focus space. Creates a hidden isQuickStart blocklist, opens the same
// start-confirm modal (effort barrier) as a normal block, then restores
// the previous selection after confirm or cancel.
import { state } from './state.js';
import { tSettings, tSettingsFmt } from './i18n.js';
import { tauriAPI } from './tauri-api.js';
import { escapeHtml } from './utils.js';
import {
    isProtectedDomain,
    isProtectedApp,
    cloneIOSScreenTimeSelection,
    normalizeIOSScreenTimeSelection,
    formatIOSScreenTimeSelectionLabel,
    isQuickStartBlocklist,
    QUICK_START_EMOJI,
} from './blocklist-utils.js';
import {
    cleanDomainInput,
    isValidDomain,
    processWebsiteInput,
    setupWebsitesImportMenu,
} from './website-input.js';
import { openInstalledAppsPicker } from './apps-picker.js';
import { displayNameForBlockedApp, resetModalScrollPosition } from './blocking-platform.js';
import {
    MIN_OVERRIDE_CHARS,
    getMaxOverrideCharsForType,
    getOverrideEstimatedMinutes,
    normalizeOverrideCount,
    usesMobileWordCountForOverrideType,
} from './override-challenge.js';
import { saveData } from './persistence.js';
import {
    cloneOverrideDifficulty,
    deselectBlocklist,
    handleBlocklistSelect,
    openBlocklistModal,
    startBlock,
} from './confirm-modals.js';
import { setBlocklistModalMode } from './list-mode.js';

export { isQuickStartBlocklist };

const QS_OVERRIDE_TYPE = 'random-words';
const QS_DEFAULT_SLIDER = 3; // ~20 chars on the linear 5…1000 scale
const QS_DEFAULT_DURATION_MINS = 60;
const QS_MAX_OVERRIDE_CHARS = 1000;
const QS_COLOR = '#B8D1DE';
const QS_EMOJI = QUICK_START_EMOJI;

let qsWebsites = [];
let qsApps = [];
let qsIOSScreenTimeSelection = null;
let qsMode = 'blocklist';
let qsDurationMins = QS_DEFAULT_DURATION_MINS;
let qsAlwaysOn = false;
let qsEffortSlider = QS_DEFAULT_SLIDER;
let qsWired = false;
let savedModalAppsBridge = null;
let savedRenderModalTagsBridge = null;
let activeQuickStartTooltip = null;

function generateQuickStartId() {
    return `qs-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function sliderToOverrideCount(sliderValue) {
    const t = Math.max(0, Math.min(100, Number(sliderValue) || 0)) / 100;
    const min = MIN_OVERRIDE_CHARS;
    const max = Math.min(QS_MAX_OVERRIDE_CHARS, getMaxOverrideCharsForType(QS_OVERRIDE_TYPE));
    const count = Math.round(min + (max - min) * t);
    return normalizeOverrideCount(count, QS_OVERRIDE_TYPE);
}

function getSelectedMode() {
    const active = document.querySelector('#quick-start-mode-toggle .mode-btn.active');
    return active?.dataset?.mode === 'allowlist' ? 'allowlist' : 'blocklist';
}

function applyQuickStartTint() {
    const modal = document.getElementById('quick-start-modal');
    if (!modal) return;
    modal.style.setProperty('--blocklist-tint', QS_COLOR);
    modal.style.setProperty('--blocklist-tag-text', '#1e2d3e');
}

function restoreQuickStartTooltip(tooltip = activeQuickStartTooltip) {
    if (!tooltip) return;
    tooltip.classList.remove('info-tooltip-portaled');
    tooltip.removeAttribute('data-tooltip-side');
    tooltip.style.left = '';
    tooltip.style.top = '';
    tooltip.style.zIndex = '';
    tooltip.style.removeProperty('--info-tooltip-arrow-left');
    const wrapper = tooltip._quickStartTooltipWrapper;
    if (wrapper && tooltip.parentElement !== wrapper) {
        wrapper.appendChild(tooltip);
    }
    delete tooltip._quickStartTooltipWrapper;
    if (activeQuickStartTooltip === tooltip) activeQuickStartTooltip = null;
}

function positionQuickStartTooltip(wrapper) {
    const tooltip = wrapper?.querySelector('.info-tooltip');
    if (!tooltip) return;
    if (activeQuickStartTooltip && activeQuickStartTooltip !== tooltip) {
        restoreQuickStartTooltip(activeQuickStartTooltip);
    }
    if (tooltip.parentElement !== document.body) {
        tooltip._quickStartTooltipWrapper = wrapper;
        document.body.appendChild(tooltip);
    }
    tooltip.classList.add('info-tooltip-portaled');
    tooltip.style.zIndex = '1001';

    const padding = 8;
    const gap = 10;
    const anchorRect = wrapper.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();
    const openBelow = anchorRect.top < tooltipRect.height + gap + padding
        && window.innerHeight - anchorRect.bottom > anchorRect.top;
    const maxLeft = window.innerWidth - tooltipRect.width - padding;
    const left = Math.max(padding, Math.min(anchorRect.left - 2, maxLeft));
    const top = openBelow
        ? Math.min(window.innerHeight - tooltipRect.height - padding, anchorRect.bottom + gap)
        : Math.max(padding, anchorRect.top - tooltipRect.height - gap);
    const arrowLeft = Math.max(
        12,
        Math.min(tooltipRect.width - 12, anchorRect.left + (anchorRect.width / 2) - left),
    );

    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
    tooltip.style.setProperty('--info-tooltip-arrow-left', `${arrowLeft}px`);
    tooltip.dataset.tooltipSide = openBelow ? 'bottom' : 'top';
    activeQuickStartTooltip = tooltip;
}

function setupQuickStartTooltips() {
    document.querySelectorAll('#quick-start-modal .info-tooltip-wrapper').forEach((wrapper) => {
        if (wrapper.dataset.quickStartTooltipWired === '1') return;
        wrapper.dataset.quickStartTooltipWired = '1';
        wrapper.addEventListener('mouseenter', () => positionQuickStartTooltip(wrapper));
        wrapper.addEventListener('mouseleave', () => restoreQuickStartTooltip());
    });
    window.addEventListener('resize', () => {
        const wrapper = activeQuickStartTooltip?._quickStartTooltipWrapper;
        if (wrapper) positionQuickStartTooltip(wrapper);
    });
    document.addEventListener('scroll', () => {
        const wrapper = activeQuickStartTooltip?._quickStartTooltipWrapper;
        if (wrapper) positionQuickStartTooltip(wrapper);
    }, true);
}

function setQuickStartMode(mode) {
    qsMode = mode === 'allowlist' ? 'allowlist' : 'blocklist';
    document.querySelectorAll('#quick-start-mode-toggle .mode-btn').forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.mode === qsMode);
    });
    updateQuickStartModeLabels();
    updateStartButtonLabel();
}

function updateQuickStartModeLabels() {
    const isAllow = qsMode === 'allowlist';
    const setText = (id, text) => {
        const el = document.getElementById(id);
        if (el) el.textContent = text;
    };
    setText('quick-start-mode-label', tSettings('blocklistModeLabel'));
    setText('quick-start-mode-sentence-before', tSettings('blocklistModeSentenceBefore'));
    setText('quick-start-mode-sentence-after', tSettings('blocklistModeSentenceAfter'));
    setText('quick-start-mode-hint', tSettings(isAllow ? 'allowlistModeHint' : 'blocklistModeHint'));
    setText('quick-start-websites-label', tSettings(isAllow ? 'websitesAllow' : 'websites'));
    setText('quick-start-apps-label', tSettings(isAllow ? 'appsAllow' : 'apps'));
    setText(
        'quick-start-websites-tooltip',
        tSettings(isAllow ? 'websitesAllowTooltip' : 'websitesTooltip'),
    );
    setText(
        'quick-start-apps-tooltip',
        tSettings(isAllow ? 'appsAllowTooltip' : 'appsTooltip'),
    );
    const websiteInput = document.getElementById('quick-start-website-input');
    if (websiteInput && !websiteInput.classList.contains('input-error')) {
        websiteInput.placeholder = tSettings('placeholderWebsiteExample');
    }
    const appInput = document.getElementById('quick-start-app-input');
    if (appInput) {
        appInput.placeholder = tSettings('placeholderAppExample');
    }
}

function updateStartButtonLabel() {
    const label = document.getElementById('quick-start-start-btn-label');
    if (!label) return;
    label.textContent = tSettings(
        qsMode === 'allowlist' ? 'quickStartStartAllowing' : 'quickStartStartBlocking',
    );
}

function updateEffortSummary() {
    const summary = document.getElementById('quick-start-effort-summary');
    const slider = document.getElementById('quick-start-effort-slider');
    if (slider) {
        slider.style.setProperty('--qs-effort-pct', `${qsEffortSlider}%`);
    }
    if (!summary) return;
    const count = sliderToOverrideCount(qsEffortSlider);
    const minutes = getOverrideEstimatedMinutes(QS_OVERRIDE_TYPE, count, '');
    const locale = tSettings('locale');
    const countStr = count.toLocaleString(locale);
    const summaryKey = usesMobileWordCountForOverrideType(QS_OVERRIDE_TYPE)
        ? 'quickStartEffortSummaryWords'
        : 'quickStartEffortSummary';
    summary.textContent = tSettingsFmt(summaryKey, {
        count: countStr,
        minutes: String(minutes),
    });
}

function updateDurationButtons() {
    document.querySelectorAll('.quick-start-duration-btn').forEach((btn) => {
        if (btn.dataset.mode === 'always') {
            btn.classList.toggle('active', qsAlwaysOn);
        } else {
            const mins = parseInt(btn.dataset.mins, 10);
            btn.classList.toggle('active', !qsAlwaysOn && mins === qsDurationMins);
        }
    });
}

function renderQsTags() {
    qsApps = qsApps.filter((app) => !isProtectedApp(app));
    const websitesEl = document.getElementById('quick-start-websites-tags');
    const appsEl = document.getElementById('quick-start-apps-tags');
    if (!websitesEl || !appsEl) return;

    websitesEl.innerHTML = qsWebsites
        .map(
            (item, idx) => `
        <span class="tag" data-idx="${idx}">
          ${escapeHtml(item)}
          <button type="button" class="tag-remove" data-idx="${idx}">×</button>
        </span>`,
        )
        .join('');

    websitesEl.querySelectorAll('.tag-remove').forEach((btn) => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const idx = parseInt(btn.dataset.idx, 10);
            if (!Number.isFinite(idx)) return;
            qsWebsites.splice(idx, 1);
            renderQsTags();
        });
    });

    const iosLabel = formatIOSScreenTimeSelectionLabel(qsIOSScreenTimeSelection);
    const displayApps = qsApps.map(displayNameForBlockedApp);
    if (iosLabel) displayApps.push(iosLabel);

    appsEl.innerHTML = displayApps
        .map(
            (item, idx) => `
        <span class="tag" data-idx="${idx}">
          ${escapeHtml(item)}
          <button type="button" class="tag-remove" data-idx="${idx}">×</button>
        </span>`,
        )
        .join('');

    appsEl.querySelectorAll('.tag-remove').forEach((btn) => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const idx = parseInt(btn.dataset.idx, 10);
            if (!Number.isFinite(idx)) return;
            if (iosLabel && displayApps[idx] === iosLabel) {
                qsIOSScreenTimeSelection = null;
            } else {
                qsApps.splice(idx, 1);
            }
            renderQsTags();
        });
    });
}

function confirmWebsiteInput() {
    const input = document.getElementById('quick-start-website-input');
    const errorMsg = document.getElementById('quick-start-website-input-error');
    if (!input) return;
    const raw = input.value.trim();
    if (!raw) return;

    const result = processWebsiteInput(raw);
    if (result.websiteInvalid) {
        errorMsg?.classList.remove('hidden');
        setTimeout(() => errorMsg?.classList.add('hidden'), 3000);
    } else {
        errorMsg?.classList.add('hidden');
    }

    if (result.hadProtected) {
        input.placeholder = tSettings('cannotBlockDomainPlaceholder');
        input.classList.add('input-error');
        setTimeout(() => {
            input.classList.remove('input-error');
            input.placeholder = tSettings('placeholderWebsiteExample');
        }, 2500);
    }

    result.toAdd.forEach((domain) => {
        if (!qsWebsites.includes(domain)) qsWebsites.push(domain);
    });
    input.value = result.inputValueToSet;
    renderQsTags();
}

function confirmAppInput() {
    const input = document.getElementById('quick-start-app-input');
    if (!input) return;
    const raw = input.value.trim();
    if (!raw) return;
    if (isProtectedApp(raw)) {
        input.value = '';
        input.placeholder = tSettings('cannotBlockSelfAppPlaceholder');
        input.classList.add('input-error');
        setTimeout(() => {
            input.classList.remove('input-error');
            input.placeholder = tSettings('placeholderAppExample');
        }, 2000);
        return;
    }
    if (!qsApps.some((a) => a.toLowerCase() === raw.toLowerCase())) {
        qsApps.push(raw);
    }
    input.value = '';
    renderQsTags();
}

function installAppsPickerBridge() {
    if (savedModalAppsBridge == null) {
        savedModalAppsBridge = window.modalApps;
        savedRenderModalTagsBridge = window.renderModalTags;
    }
    window.modalApps = qsApps;
    window.renderModalTags = renderQsTags;
}

function restoreAppsPickerBridge() {
    if (savedRenderModalTagsBridge) {
        window.renderModalTags = savedRenderModalTagsBridge;
    }
    if (savedModalAppsBridge != null) {
        window.modalApps = savedModalAppsBridge;
    }
    savedModalAppsBridge = null;
    savedRenderModalTagsBridge = null;
}

function buildQuickStartBlocklist() {
    const count = sliderToOverrideCount(qsEffortSlider);
    return {
        id: generateQuickStartId(),
        name: tSettings('quickStartDefaultName'),
        mode: qsMode,
        color: QS_COLOR,
        emoji: QS_EMOJI,
        websites: [...qsWebsites],
        apps: qsApps.filter((app) => !isProtectedApp(app)),
        iosScreenTimeSelection: cloneIOSScreenTimeSelection(qsIOSScreenTimeSelection),
        showItemDetails: true,
        alwaysShowInSchedule: false,
        isQuickStart: true,
        overrideDifficulty: cloneOverrideDifficulty({
            type: QS_OVERRIDE_TYPE,
            count,
            maxDifficulty: false,
        }),
    };
}

/** Set while the start-confirm modal is open for a Quick start draft. */
let pendingQuickStart = null;

function restorePreviousSelection(previous) {
    if (!previous) return;
    const previousStillExists = previous.id
        && state.appData.blocklists.some((bl) => bl.id === previous.id && !isQuickStartBlocklist(bl));
    if (previousStillExists) {
        state.selectedBlocklistId = previous.id;
        state.isAlwaysOnMode = previous.alwaysOn;
        state.targetDurationMinutes = previous.duration;
        state.selectedEndHour = previous.endHour;
        state.selectedEndMinute = previous.endMinute;
        state.userEditedEndTime = previous.userEditedEnd;
        const dropdown = document.getElementById('blocklist-select');
        if (dropdown) {
            dropdown.value = previous.id;
            handleBlocklistSelect({ target: dropdown });
        }
    } else {
        deselectBlocklist();
    }
}

async function clearPendingQuickStart({ keepIfStarted }) {
    if (!pendingQuickStart) return;
    const { blocklistId, previous } = pendingQuickStart;
    pendingQuickStart = null;
    state.pendingQuickStartBlocklistId = null;

    const now = Date.now();
    const started = state.appData.activeBlocks.some(
        (b) => b.blocklistId === blocklistId && b.endTime > now,
    );
    if (!(keepIfStarted && started)) {
        state.appData.blocklists = state.appData.blocklists.filter((bl) => bl.id !== blocklistId);
        await saveData();
    }

    // Restore prior selection so the hidden Quick start space is not left selected.
    restorePreviousSelection(previous);
}

/** Cancel path: discard the unsaved Quick start draft. */
export async function discardPendingQuickStart() {
    await clearPendingQuickStart({ keepIfStarted: false });
}

/** After proceedWithBlock: keep the draft only if the block actually started. */
export async function settlePendingQuickStart() {
    await clearPendingQuickStart({ keepIfStarted: true });
}

/**
 * Arm the Quick start confirm/cancel lifecycle for a draft already in
 * `state.appData.blocklists`, then select it for startBlock().
 */
export function armPendingQuickStart(blocklistId) {
    pendingQuickStart = {
        blocklistId,
        previous: {
            id: state.selectedBlocklistId,
            alwaysOn: state.isAlwaysOnMode,
            duration: state.targetDurationMinutes,
            endHour: state.selectedEndHour,
            endMinute: state.selectedEndMinute,
            userEditedEnd: state.userEditedEndTime,
        },
    };
    state.pendingQuickStartBlocklistId = blocklistId;
    state.selectedBlocklistId = blocklistId;
}

/** Override character/word count from the embedded Quick start effort slider. */
export function getQuickStartOverrideCount() {
    return sliderToOverrideCount(qsEffortSlider);
}

/** Apply the Quick start duration chips to the main scheduler start state. */
export function applyQuickStartDurationToSchedulerState() {
    state.isAlwaysOnMode = qsAlwaysOn;
    state.userEditedEndTime = false;
    if (!qsAlwaysOn) {
        state.targetDurationMinutes = qsDurationMins;
        const end = new Date(Date.now() + qsDurationMins * 60 * 1000);
        state.selectedEndHour = end.getHours();
        state.selectedEndMinute = end.getMinutes();
    }
}

/** Reset duration chips + effort slider when opening / switching to Quick start. */
export function resetEmbeddedQuickStartControls() {
    qsDurationMins = QS_DEFAULT_DURATION_MINS;
    qsAlwaysOn = false;
    qsEffortSlider = QS_DEFAULT_SLIDER;
    const slider = document.getElementById('quick-start-effort-slider');
    if (slider) slider.value = String(qsEffortSlider);
    updateDurationButtons();
    updateEffortSummary();
}

async function startQuickStart() {
    confirmWebsiteInput();
    confirmAppInput();

    if (qsWebsites.length === 0 && qsApps.length === 0 && !qsIOSScreenTimeSelection) {
        alert(tSettings('quickStartNeedItems'));
        return;
    }

    const startBtn = document.getElementById('quick-start-start-btn');
    if (startBtn) startBtn.disabled = true;

    try {
        const blocklist = buildQuickStartBlocklist();
        state.appData.blocklists.unshift(blocklist);
        await saveData();

        armPendingQuickStart(blocklist.id);
        state.isAlwaysOnMode = qsAlwaysOn;
        state.userEditedEndTime = false;
        if (!qsAlwaysOn) {
            state.targetDurationMinutes = qsDurationMins;
            const end = new Date(Date.now() + qsDurationMins * 60 * 1000);
            state.selectedEndHour = end.getHours();
            state.selectedEndMinute = end.getMinutes();
        }

        closeQuickStartModal();
        // Same effort-barrier confirm as starting a normal focus space.
        startBlock();
    } finally {
        if (startBtn) startBtn.disabled = false;
    }
}

function saveAsFocusSpace() {
    confirmWebsiteInput();
    confirmAppInput();
    const draft = {
        websites: [...qsWebsites],
        apps: qsApps.filter((app) => !isProtectedApp(app)),
        mode: qsMode,
        overrideDifficulty: {
            type: QS_OVERRIDE_TYPE,
            count: sliderToOverrideCount(qsEffortSlider),
            maxDifficulty: false,
        },
        iosScreenTimeSelection: cloneIOSScreenTimeSelection(qsIOSScreenTimeSelection),
    };
    closeQuickStartModal();
    openBlocklistModal(null);
    setBlocklistModalMode(draft.mode);
    window.setModalData?.(
        draft.websites,
        draft.apps,
        draft.iosScreenTimeSelection,
    );
    const overrideType = document.getElementById('override-type');
    const overrideCount = document.getElementById('override-count');
    if (overrideType) overrideType.value = draft.overrideDifficulty.type;
    if (overrideCount) overrideCount.value = String(draft.overrideDifficulty.count);
    overrideType?.dispatchEvent(new Event('change'));
}

export function openQuickStartModal() {
    const modal = document.getElementById('quick-start-modal');
    if (!modal) return;

    qsWebsites = [];
    qsApps = [];
    qsIOSScreenTimeSelection = null;
    qsDurationMins = QS_DEFAULT_DURATION_MINS;
    qsAlwaysOn = false;
    qsEffortSlider = QS_DEFAULT_SLIDER;

    setQuickStartMode('blocklist');
    updateDurationButtons();

    const slider = document.getElementById('quick-start-effort-slider');
    if (slider) slider.value = String(qsEffortSlider);
    updateEffortSummary();
    renderQsTags();
    applyQuickStartTint();

    installAppsPickerBridge();
    modal.classList.remove('hidden');
    resetModalScrollPosition(modal);
    // Desktop popup scrolls the inner body; handset uses .mobile-modal-scroll-body.
    modal.querySelector('.quick-start-modal-scroll-body')?.scrollTo(0, 0);
}

export function closeQuickStartModal() {
    const modal = document.getElementById('quick-start-modal');
    modal?.classList.add('hidden');
    restoreQuickStartTooltip();
    restoreAppsPickerBridge();
}

export function applyQuickStartLanguage() {
    const setText = (id, text) => {
        const el = document.getElementById(id);
        if (el) el.textContent = text;
    };
    setText('quick-start-title', tSettings('quickStartTitle'));
    setText('quick-start-mode-label', tSettings('blocklistModeLabel'));
    setText('quick-start-mode-sentence-before', tSettings('blocklistModeSentenceBefore'));
    setText('quick-start-mode-sentence-after', tSettings('blocklistModeSentenceAfter'));
    setText('quick-start-mode-blocklist-label', tSettings('blocklistModeBlocklist'));
    setText('quick-start-mode-allowlist-label', tSettings('blocklistModeAllowlist'));
    setText('quick-start-duration-label', tSettings('quickSelect'));
    setText('quick-start-duration-15', tSettings('durationQuick15m'));
    setText('quick-start-duration-30', tSettings('durationQuick30m'));
    setText('quick-start-duration-60', tSettings('durationQuick1Hour'));
    setText('quick-start-duration-120', tSettings('durationQuick2Hours'));
    setText('quick-start-duration-always-label', tSettings('durationQuickAlways'));
    setText('quick-start-effort-label', tSettings('quickStartEffortLabel'));
    setText('quick-start-effort-easy', tSettings('quickStartEffortEasy'));
    setText('quick-start-effort-hard', tSettings('quickStartEffortHard'));
    setText('quick-start-import-websites-caption', tSettings('modalPremadeListsCaption'));
    setText('quick-start-browse-apps-caption', tSettings('modalBrowseAppsCaption'));
    setText('quick-start-import-menu-text-file-label', tSettings('importWebsitesFromFile'));
    setText('quick-start-import-menu-section-label', tSettings('importWebsitesPreMadeList'));
    setText('quick-start-website-input-error', tSettings('invalidDomainMsg'));

    const importPresetKeys = {
        email: 'importPresetEmail',
        gambling: 'importPresetGambling',
        news: 'importPresetNews',
        porn: 'importPresetPorn',
        'search-engines': 'importPresetSearchEngines',
        shopping: 'importPresetShopping',
        'social-media': 'importPresetSocialMedia',
    };
    document.querySelectorAll('#quick-start-websites-import-menu [data-preset]').forEach((btn) => {
        const key = importPresetKeys[btn.dataset.preset];
        if (key) btn.textContent = tSettings(key);
    });

    const importWebsitesBtn = document.getElementById('quick-start-import-websites-btn');
    if (importWebsitesBtn) {
        importWebsitesBtn.title = tSettings('importWebsitesTitle');
        importWebsitesBtn.setAttribute('aria-label', tSettings('importWebsitesTitle'));
    }

    const browseAppsBtn = document.getElementById('quick-start-browse-apps-btn');
    if (browseAppsBtn) {
        const browseTitle = state.isIOS
            ? tSettings('modalBrowseAppsTitleIos')
            : tSettings('browseApplicationsTitle');
        browseAppsBtn.title = browseTitle;
        browseAppsBtn.setAttribute('aria-label', browseTitle);
    }

    const btn = document.getElementById('quick-start-btn');
    if (btn) {
        const label = tSettings('quickStartBtn');
        btn.title = label;
        btn.setAttribute('aria-label', label);
    }
    const btnLabel = document.getElementById('quick-start-btn-label');
    if (btnLabel) btnLabel.textContent = tSettings('quickStartBtn');

    const hint = document.getElementById('quick-start-hint');
    if (hint) {
        const linkLabel = tSettings('quickStartSaveAsLink');
        hint.innerHTML = `${escapeHtml(tSettings('quickStartHintBefore'))} <button type="button" class="quick-start-save-link" id="quick-start-save-as-link">${escapeHtml(linkLabel)}</button> ${escapeHtml(tSettings('quickStartHintAfter'))}`;
        document.getElementById('quick-start-save-as-link')?.addEventListener('click', saveAsFocusSpace);
    }

    updateQuickStartModeLabels();
    updateStartButtonLabel();
    updateEffortSummary();
}

export function setupQuickStart() {
    if (qsWired) return;
    qsWired = true;

    // Entry button removed from My Blocklists (replaced by Allow only create).
    // Modal + wiring kept for any remaining internal open paths.
    document.getElementById('close-quick-start-btn')?.addEventListener('click', () => closeQuickStartModal());

    document.getElementById('quick-start-modal')?.addEventListener('click', (e) => {
        if (e.target.classList.contains('modal-overlay')) closeQuickStartModal();
    });
    setupQuickStartTooltips();

    document.querySelectorAll('#quick-start-mode-toggle .mode-btn').forEach((btn) => {
        btn.addEventListener('click', () => setQuickStartMode(btn.dataset.mode));
    });

    document.querySelectorAll('.quick-start-duration-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
            if (btn.dataset.mode === 'always') {
                qsAlwaysOn = true;
            } else {
                qsAlwaysOn = false;
                qsDurationMins = parseInt(btn.dataset.mins, 10) || QS_DEFAULT_DURATION_MINS;
            }
            updateDurationButtons();
        });
    });

    document.getElementById('quick-start-effort-slider')?.addEventListener('input', (e) => {
        qsEffortSlider = parseInt(e.target.value, 10) || 0;
        updateEffortSummary();
    });

    const websiteInput = document.getElementById('quick-start-website-input');
    websiteInput?.addEventListener('keydown', (e) => {
        if ((e.key === 'Enter' || e.key === ' ') && websiteInput.value.trim()) {
            e.preventDefault();
            confirmWebsiteInput();
        }
        if (e.key === 'Backspace' && !websiteInput.value && qsWebsites.length > 0) {
            qsWebsites.pop();
            renderQsTags();
            e.preventDefault();
        }
    });

    const appInput = document.getElementById('quick-start-app-input');
    appInput?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && appInput.value.trim()) {
            e.preventDefault();
            confirmAppInput();
        }
        if (e.key === 'Backspace' && !appInput.value && qsApps.length > 0) {
            qsApps.pop();
            renderQsTags();
            e.preventDefault();
        }
    });

    setupWebsitesImportMenu({
        importBtnId: 'quick-start-import-websites-btn',
        menuId: 'quick-start-websites-import-menu',
        textFileBtnId: 'quick-start-import-menu-text-file',
        addDomainsToModal: (rawDomains) => {
            const cleaned = (rawDomains || [])
                .map((d) => cleanDomainInput(d))
                .filter((d) => isValidDomain(d) && !isProtectedDomain(d));
            cleaned.forEach((d) => {
                if (!qsWebsites.includes(d)) qsWebsites.push(d);
            });
            renderQsTags();
        },
    });

    const browseBtn = document.getElementById('quick-start-browse-apps-btn');
    if (state.isIOS && browseBtn) {
        browseBtn.addEventListener('click', async () => {
            try {
                const result = await tauriAPI.showActivityPicker({
                    initialApplicationTokenData: qsIOSScreenTimeSelection?.applicationTokens || [],
                    initialCategoryTokenData: qsIOSScreenTimeSelection?.categoryTokens || [],
                    mode: getSelectedMode(),
                });
                if (!result.cancelled && (result.applicationCount > 0 || result.categoryCount > 0)) {
                    qsIOSScreenTimeSelection = normalizeIOSScreenTimeSelection({
                        applicationTokens: result.applicationTokens || [],
                        categoryTokens: result.categoryTokens || [],
                        applicationCount: result.applicationCount || 0,
                        categoryCount: result.categoryCount || 0,
                        requiresReselection: false,
                    });
                    renderQsTags();
                } else if (!result.cancelled) {
                    qsIOSScreenTimeSelection = null;
                    renderQsTags();
                }
            } catch (err) {
                console.error('Activity picker error:', err);
                alert(tSettingsFmt('activityPickerFailedFmt', { error: String(err) }));
            }
        });
    } else if (browseBtn) {
        browseBtn.addEventListener('click', () => {
            installAppsPickerBridge();
            openInstalledAppsPicker();
        });
    }

    document.getElementById('quick-start-start-btn')?.addEventListener('click', () => {
        startQuickStart();
    });
    document.getElementById('quick-start-save-as-link')?.addEventListener('click', saveAsFocusSpace);
}
