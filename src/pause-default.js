// Default pause length: the duration prefilled when a focus space is paused
// — in the webview pause modal (#pause-modal) on every platform, and in the
// Android native friction gate (UnlockActivity). Stored in
// `appData.settings.defaultPauseMinutes`; Android additionally mirrors it into
// Kotlin prefs on every schedule sync (the gate can't reach the webview).
//
// Raising it weakens blocking, so changing it is gated by the same typing
// challenge as "Stop all" (hardest difficulty among whatever is currently
// blocking; no challenge when nothing is active).
import { state } from './state.js';
import { tSettingsFmt } from './i18n.js';
import { saveData } from './persistence.js';
import {
    applyChallengeTypedInputSanitization,
    generateOverrideChallengeText,
    renderChallengeReferenceText,
    sanitizeChallengeTargetText,
    shouldBlockChallengeSpaceKey,
} from './override-challenge.js';
import {
    buildWordChallengeState,
    getCompletedChallengeText,
    getCurrentChallengeWord,
    isMobileWordByWordChallenge,
} from './app.js';
import { findHardestChallenge } from './settings.js';
import { hasAnyBlockingStateToClear, syncSchedulesToHelper } from './schedule-engine.js';

/** Used until the user changes the setting. Mirrored by
 *  `FALLBACK_DEFAULT_PAUSE_MINUTES` in the Kotlin util/Prefs.kt. */
export const FALLBACK_DEFAULT_PAUSE_MINUTES = 10;
/** One day — the pause modal itself allows longer, this is only the prefill. */
export const MAX_DEFAULT_PAUSE_MINUTES = 24 * 60;

export function clampDefaultPauseMinutes(minutes) {
    return Math.max(1, Math.min(MAX_DEFAULT_PAUSE_MINUTES, Math.round(minutes)));
}

/** Configured prefill duration in minutes (never returns an invalid value). */
export function getDefaultPauseMinutes() {
    const raw = Number(state.appData?.settings?.defaultPauseMinutes);
    if (!Number.isFinite(raw) || raw <= 0) return FALLBACK_DEFAULT_PAUSE_MINUTES;
    return clampDefaultPauseMinutes(raw);
}

/** "45 min" / "2 hr" / "1 hr 30 min", for the settings row value. */
export function formatPauseMinutes(minutes) {
    const total = clampDefaultPauseMinutes(minutes);
    const hours = Math.floor(total / 60);
    const mins = total % 60;
    if (hours && mins) return tSettingsFmt('pauseDefaultValueHoursMinutesFmt', { h: hours, m: mins });
    if (hours) return tSettingsFmt('pauseDefaultValueHoursFmt', { h: hours });
    return tSettingsFmt('pauseDefaultValueMinutesFmt', { m: mins });
}

// Challenge state for the change-default gate. Module-private: nothing else
// reads it (unlike the override-all equivalents, which app.js renders).
let challengeText = '';
let wordChallengeState = null;

const el = (id) => document.getElementById(id);

/** Keeps the settings row's displayed value in sync with the setting. The row
 *  is shown on every platform — the pause modal it prefills is cross-platform;
 *  only the extra native-gate prefill is Android-specific. */
export function syncDefaultPauseSettingUi() {
    const value = el('settings-pause-default-btn-label');
    if (value) value.textContent = formatPauseMinutes(getDefaultPauseMinutes());
}

function setWordChallengeMode(enabled) {
    el('pause-default-word-progress')?.classList.toggle('hidden', !enabled);
    el('pause-default-current-word')?.classList.toggle('hidden', !enabled);
    el('pause-default-challenge-word-input')?.classList.toggle('hidden', !enabled);
    el('pause-default-challenge-input')?.classList.toggle('hidden', enabled);
}

function renderWordChallengeState() {
    const progressLabelEl = el('pause-default-word-progress');
    const currentWordEl = el('pause-default-current-word');
    const wordInput = el('pause-default-challenge-word-input');
    const progressBar = el('pause-default-progress-bar');
    if (!wordChallengeState || !progressLabelEl || !currentWordEl || !wordInput || !progressBar) return;
    const currentWord = getCurrentChallengeWord(wordChallengeState);
    const completedText = getCompletedChallengeText(wordChallengeState);
    renderChallengeReferenceText(el('pause-default-challenge-text'), challengeText, {
        errorIndex: -1,
        cursorIndex: completedText.length,
    });
    progressLabelEl.textContent = tSettingsFmt('challengeWordProgressFmt', {
        current: wordChallengeState.currentIndex + 1,
        total: wordChallengeState.words.length,
    });
    currentWordEl.textContent = currentWord;
    wordInput.value = '';
    progressBar.style.width = challengeText.length > 0
        ? `${Math.min(100, (completedText.length / challengeText.length) * 100)}%`
        : '0%';
    el('confirm-pause-default-btn').disabled = !currentWord;
}

/** Total minutes currently entered in the modal's hrs/mins inputs. */
function enteredMinutes() {
    const hours = parseInt(el('pause-default-hours').value, 10) || 0;
    const minutes = parseInt(el('pause-default-minutes').value, 10) || 0;
    return clampDefaultPauseMinutes(hours * 60 + minutes);
}

function fillInputsFrom(minutes) {
    el('pause-default-hours').value = Math.floor(minutes / 60);
    el('pause-default-minutes').value = minutes % 60;
}

/** Android back-button / escape close: returns the user to Settings, where
 *  the modal was opened from. */
export function closeDefaultPauseModal() {
    closeModal();
}

function closeModal({ reopenSettings = true } = {}) {
    el('pause-default-modal')?.classList.add('hidden');
    challengeText = '';
    wordChallengeState = null;
    setWordChallengeMode(false);
    if (reopenSettings) el('settings-modal')?.classList.remove('hidden');
}

function openModal() {
    const modal = el('pause-default-modal');
    if (!modal) return;
    el('settings-modal')?.classList.add('hidden');

    fillInputsFrom(getDefaultPauseMinutes());

    const challengeTextEl = el('pause-default-challenge-text');
    const instructionEl = el('pause-default-instruction');
    const progressEl = modal.querySelector('.challenge-progress');
    const textInput = el('pause-default-challenge-input');
    const wordInput = el('pause-default-challenge-word-input');
    const confirmBtn = el('confirm-pause-default-btn');

    // Nothing is blocking right now → no challenge, same as "Stop all".
    if (!hasAnyBlockingStateToClear()) {
        challengeText = '';
        wordChallengeState = null;
        setWordChallengeMode(false);
        if (challengeTextEl) challengeTextEl.style.display = 'none';
        if (instructionEl) instructionEl.style.display = 'none';
        if (progressEl) progressEl.style.display = 'none';
        if (textInput) textInput.style.display = 'none';
        if (wordInput) wordInput.style.display = 'none';
        confirmBtn.disabled = false;
        modal.classList.remove('hidden');
        return;
    }

    if (challengeTextEl) challengeTextEl.style.display = '';
    if (instructionEl) instructionEl.style.display = '';
    if (progressEl) progressEl.style.display = '';

    const hardestDifficulty = findHardestChallenge();
    challengeText = sanitizeChallengeTargetText(generateOverrideChallengeText(
        hardestDifficulty.type,
        hardestDifficulty.count,
        hardestDifficulty.customText,
    ));
    renderChallengeReferenceText(challengeTextEl, challengeText, { errorIndex: -1, cursorIndex: 0 });
    textInput.value = '';
    wordInput.value = '';
    wordChallengeState = isMobileWordByWordChallenge(hardestDifficulty)
        ? buildWordChallengeState(challengeText)
        : null;
    setWordChallengeMode(!!wordChallengeState);
    textInput.style.display = wordChallengeState ? 'none' : '';
    wordInput.style.display = wordChallengeState ? '' : 'none';
    el('pause-default-progress-bar').style.width = '0%';
    confirmBtn.disabled = !!wordChallengeState;

    modal.classList.remove('hidden');
    requestAnimationFrame(() => {
        if (wordChallengeState) {
            renderWordChallengeState();
            wordInput.focus();
        } else {
            textInput.focus();
        }
    });
}

function wiggle() {
    const modalContent = el('pause-default-modal')?.querySelector('.modal-content');
    if (!modalContent) return;
    modalContent.classList.remove('wiggle');
    void modalContent.offsetWidth;
    modalContent.classList.add('wiggle');
}

async function saveDefaultPauseMinutes(minutes) {
    if (!state.appData.settings) state.appData.settings = {};
    state.appData.settings.defaultPauseMinutes = minutes;
    await saveData();
    syncDefaultPauseSettingUi();
    // Push the new value into Kotlin prefs so the native gate prefills it.
    if (state.isAndroid) {
        try {
            await syncSchedulesToHelper();
        } catch (e) {
            console.warn('[pause-default] Failed to sync default pause length:', e);
        }
    }
}

/** Wires the settings row + gate modal. Call once at startup. */
export function setupDefaultPauseSetting() {
    const modal = el('pause-default-modal');
    const openBtn = el('settings-pause-default-btn');
    const cancelBtn = el('cancel-pause-default-btn');
    const confirmBtn = el('confirm-pause-default-btn');
    const textInput = el('pause-default-challenge-input');
    const wordInput = el('pause-default-challenge-word-input');
    if (!modal || !openBtn || !confirmBtn) return;

    syncDefaultPauseSettingUi();

    openBtn.addEventListener('click', openModal);
    cancelBtn?.addEventListener('click', () => closeModal());
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
    });

    for (const input of [el('pause-default-hours'), el('pause-default-minutes')]) {
        input?.addEventListener('change', () => fillInputsFrom(enteredMinutes()));
    }

    textInput?.addEventListener('paste', (e) => e.preventDefault());
    textInput?.addEventListener('input', () => {
        const typed = applyChallengeTypedInputSanitization(textInput);
        let correctChars = 0;
        let firstErrorIndex = -1;
        for (let i = 0; i < typed.length && i < challengeText.length; i++) {
            if (typed[i] === challengeText[i]) {
                correctChars++;
            } else {
                firstErrorIndex = i;
                break;
            }
        }
        el('pause-default-progress-bar').style.width =
            `${(correctChars / Math.max(1, challengeText.length)) * 100}%`;
        renderChallengeReferenceText(el('pause-default-challenge-text'), challengeText, {
            errorIndex: firstErrorIndex,
            cursorIndex: correctChars,
        });
    });
    textInput?.addEventListener('keydown', (e) => {
        if (shouldBlockChallengeSpaceKey(textInput, e)) {
            e.preventDefault();
            return;
        }
        if (e.key === 'Enter') {
            e.preventDefault();
            confirmBtn.click();
        }
    });

    wordInput?.addEventListener('paste', (e) => e.preventDefault());
    wordInput?.addEventListener('input', () => {
        if (!wordChallengeState) return;
        el('pause-default-current-word').textContent = getCurrentChallengeWord(wordChallengeState);
    });
    wordInput?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            confirmBtn.click();
        }
    });

    confirmBtn.addEventListener('click', async () => {
        // Word-by-word mode: each click advances one word until the last.
        if (wordChallengeState) {
            const expectedWord = getCurrentChallengeWord(wordChallengeState);
            const typedWord = wordInput.value.trim();
            if (typedWord !== expectedWord) {
                wiggle();
                el('pause-default-current-word').textContent = expectedWord;
                return;
            }
            wordChallengeState.currentIndex++;
            wordChallengeState.typedText = wordChallengeState.currentIndex >= wordChallengeState.words.length
                ? challengeText
                : getCompletedChallengeText(wordChallengeState);
            if (wordChallengeState.currentIndex < wordChallengeState.words.length) {
                renderWordChallengeState();
                wordInput.focus();
                return;
            }
        }

        const typed = wordChallengeState?.typedText ?? textInput.value;
        if (challengeText && typed !== challengeText) {
            wiggle();
            return;
        }

        await saveDefaultPauseMinutes(enteredMinutes());
        closeModal();
    });
}
