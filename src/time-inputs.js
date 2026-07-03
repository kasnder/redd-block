// Time-input popovers (hour/minute pickers) and duration quick controls.
// Extracted verbatim from app.js.
import { state } from './state.js';
import { tSettings } from './i18n.js';
import { handleTimeChange } from './confirm-modals.js';
import { setAlwaysOnMode, wireAllScheduleSegmentTimeControls } from './schedule-editor.js';
import { getGlobalStartOverlays } from './schedule-overlay.js';

export function pad(num) {
    return num.toString().padStart(2, '0');
}

// Disable or enable time controls (when a block is active, controls should be disabled)
export function disableTimeControls(disabled) {
    const durationInput = document.getElementById('duration-minutes-input');
    const endHourInput = document.getElementById('end-hour-input');
    const endMinuteInput = document.getElementById('end-minute-input');
    const endTimeDisplay = document.getElementById('end-time-display');
    const quickSelectBtns = document.querySelectorAll('.duration-quick-btn');
    const timePickerContainer = document.getElementById('time-picker-container');

    if (durationInput) {
        durationInput.disabled = disabled;
        durationInput.style.opacity = disabled ? '0.5' : '1';
        durationInput.style.pointerEvents = disabled ? 'none' : 'auto';
    }

    if (endHourInput) {
        endHourInput.disabled = disabled;
        endHourInput.style.opacity = disabled ? '0.5' : '1';
        endHourInput.style.pointerEvents = disabled ? 'none' : 'auto';
    }

    if (endMinuteInput) {
        endMinuteInput.disabled = disabled;
        endMinuteInput.style.opacity = disabled ? '0.5' : '1';
        endMinuteInput.style.pointerEvents = disabled ? 'none' : 'auto';
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
export function disableScheduleControls(disabled) {
    const repeatDropdown = document.getElementById('schedule-repeat-select');
    const addSegmentBtn = document.getElementById('add-segment-btn');
    const repeatDropdownBtn = document.getElementById('repeat-dropdown-btn');
    const repeatLabel = document.getElementById('repeat-label');
    const overlayLabel = document.getElementById('schedule-panel-overlay-label');
    const overlayDropdownBtn = document.getElementById('schedule-panel-overlay-dropdown-btn');

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

    if (overlayLabel) {
        overlayLabel.classList.toggle('repeat-label-disabled', getGlobalStartOverlays().length === 0);
    }

    if (overlayDropdownBtn) {
        const noPresets = getGlobalStartOverlays().length === 0;
        overlayDropdownBtn.disabled = noPresets;
        overlayDropdownBtn.style.pointerEvents = noPresets ? 'none' : 'auto';
        overlayDropdownBtn.style.cursor = noPresets ? 'default' : 'pointer';
        overlayDropdownBtn.classList.toggle('repeat-dropdown-disabled', noPresets);
    }

    // When schedule is active and repeat is "until date", grey out the date selector.
    // Use the persisted active schedule first so this updates immediately after starting.
    const dateWrapper = document.getElementById('repeat-date-wrapper');
    const dateInput = document.getElementById('repeat-date-input');
    if (dateWrapper && dateInput) {
        const activeSchedule = state.selectedBlocklistId && state.appData.schedules
            ? state.appData.schedules.find(s => s.blocklistId === state.selectedBlocklistId)
            : null;
        const isDateRepeatActive = !!(activeSchedule && activeSchedule.repeatType === 'date');
        const shouldDisableDateSelector = disabled && (isDateRepeatActive || state.scheduleRepeatType === 'date');

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

    // Add button stays enabled even when schedule is active — new segments append
    // as unsaved drafts and are committed via the pending-changes bar.
    if (addSegmentBtn) {
        addSegmentBtn.disabled = false;
        addSegmentBtn.style.opacity = '1';
        addSegmentBtn.style.pointerEvents = 'auto';
        addSegmentBtn.style.cursor = 'pointer';
    }

    // Disable controls on EXISTING segments (those within state.activeScheduleSegmentCount)
    document.querySelectorAll('.schedule-segment').forEach((segment, index) => {
        const isExistingSegment = index < state.activeScheduleSegmentCount;

        if (disabled && isExistingSegment) {
            // Disable this segment's controls
            segment.querySelectorAll(
                '.time-part, .segment-day-toggle, .remove-segment-btn, .segment-delete-btn, .segment-done-btn, .segment-day-preset, .segment-summary-btn'
            ).forEach(el => {
                el.disabled = true;
                el.style.opacity = '0.5';
                el.style.pointerEvents = 'none';
            });
            segment.classList.add('segment-locked');
        } else {
            // Enable this segment's controls
            segment.querySelectorAll(
                '.time-part, .segment-day-toggle, .remove-segment-btn, .segment-delete-btn, .segment-done-btn, .segment-day-preset, .segment-summary-btn'
            ).forEach(el => {
                el.disabled = false;
                el.style.opacity = '1';
                el.style.pointerEvents = 'auto';
            });
            segment.classList.remove('segment-locked');
        }
    });
}

// Initialize time picker with popover options (end time only)
export function initializeTimeInputs() {
    const now = new Date();

    // Reset editing flag and load saved duration for this blocklist (or default to 60)
    state.userEditedEndTime = false;

    // Restore always-on mode preference for this blocklist
    const savedAlwaysOn = state.selectedBlocklistId && state.appData.settings?.alwaysOnMode?.[state.selectedBlocklistId];
    setAlwaysOnMode(savedAlwaysOn !== undefined ? !!savedAlwaysOn : false);

    if (state.selectedBlocklistId && state.appData.settings?.instantBlockDuration?.[state.selectedBlocklistId] !== undefined) {
        state.targetDurationMinutes = state.appData.settings.instantBlockDuration[state.selectedBlocklistId];
    } else {
        state.targetDurationMinutes = 60;
    }

    // End time = now + target duration
    const endTime = new Date(now.getTime() + state.targetDurationMinutes * 60 * 1000);
    state.selectedEndHour = endTime.getHours();
    state.selectedEndMinute = endTime.getMinutes();

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

    // Populate minute options (0, 5, … 55) — typing still allows any 0–59
    const minuteContainer = document.getElementById('end-minute-options');
    if (minuteContainer) {
        minuteContainer.innerHTML = '';
        for (let m = 0; m < 60; m += 5) {
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

    // Initialize click handlers + typing for schedule segment time fields
    wireAllScheduleSegmentTimeControls();
}

// Update the end-time display (compact inputs; skip while focused).
export function updateTimeDisplay() {
    const endHourInput = document.getElementById('end-hour-input');
    const endMinuteInput = document.getElementById('end-minute-input');
    if (endHourInput && document.activeElement !== endHourInput) {
        endHourInput.value = pad(state.selectedEndHour);
    }
    if (endMinuteInput && document.activeElement !== endMinuteInput) {
        endMinuteInput.value = pad(state.selectedEndMinute);
    }

    // Update selected state in popovers
    updatePopoverSelection();
}

// Update selected state in popover options (end time only)
export function updatePopoverSelection() {
    // Clear all selections
    document.querySelectorAll('.popover-option').forEach(btn => btn.classList.remove('selected'));

    // Mark current end time selections
    document.querySelectorAll('#end-hour-options .popover-option').forEach(btn => {
        if (parseInt(btn.dataset.value) === state.selectedEndHour) btn.classList.add('selected');
    });
    let minuteListMatch = state.selectedEndMinute;
    if (state.selectedEndMinute % 5 !== 0) {
        const rounded = Math.round(state.selectedEndMinute / 5) * 5;
        minuteListMatch = rounded >= 60 ? 55 : rounded;
    }
    document.querySelectorAll('#end-minute-options .popover-option').forEach(btn => {
        if (parseInt(btn.dataset.value) === minuteListMatch) btn.classList.add('selected');
    });
}

/** Parse HH / MM from end-time numeric fields (0–23 / 0–59). Empty or invalid → null. */
export function parseEndTimeBoundedInt(raw, min, max) {
    const digits = String(raw ?? '').replace(/\D/g, '');
    if (digits === '') return null;
    const n = parseInt(digits, 10);
    if (Number.isNaN(n)) return null;
    return Math.min(max, Math.max(min, n));
}

export function commitEndHourInput() {
    const input = document.getElementById('end-hour-input');
    if (!input) return;
    const v = parseEndTimeBoundedInt(input.value, 0, 23);
    if (v === null) {
        input.value = pad(state.selectedEndHour);
        return;
    }
    state.selectedEndHour = v;
    input.value = pad(v);
    state.userEditedEndTime = true;
    updatePopoverSelection();
    handleTimeChange();
}

export function commitEndMinuteInput() {
    const input = document.getElementById('end-minute-input');
    if (!input) return;
    const v = parseEndTimeBoundedInt(input.value, 0, 59);
    if (v === null) {
        input.value = pad(state.selectedEndMinute);
        return;
    }
    state.selectedEndMinute = v;
    input.value = pad(v);
    state.userEditedEndTime = true;
    updatePopoverSelection();
    handleTimeChange();
}

/** Wire blur/input once for editable instant end HH:MM fields. */
export function setupEndTimeDirectInputs() {
    const hourEl = document.getElementById('end-hour-input');
    const minuteEl = document.getElementById('end-minute-input');
    if (!hourEl || !minuteEl) return;
    if (hourEl.dataset.directInputBound === '1') return;
    hourEl.dataset.directInputBound = '1';

    const digitsOnly = (el) => {
        const next = el.value.replace(/\D/g, '').slice(0, 2);
        if (next !== el.value) el.value = next;
    };

    hourEl.addEventListener('input', () => {
        closeAllPopovers();
        digitsOnly(hourEl);
    });
    hourEl.addEventListener('blur', () => commitEndHourInput());
    hourEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            hourEl.blur();
            minuteEl.focus({ preventScroll: true });
            if (typeof minuteEl.select === 'function') minuteEl.select();
        }
    });

    minuteEl.addEventListener('input', () => {
        closeAllPopovers();
        digitsOnly(minuteEl);
    });
    minuteEl.addEventListener('blur', () => commitEndMinuteInput());
    minuteEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            minuteEl.blur();
        }
    });
}

/** Scroll inside a popover list only — never the page (scrollIntoView would pan main-content). */
export function scrollPopoverOptionIntoView(scrollContainer, option) {
    if (!scrollContainer || !option) return;
    const optionTop = option.offsetTop;
    const optionHeight = option.offsetHeight;
    const containerHeight = scrollContainer.clientHeight;
    scrollContainer.scrollTop = Math.max(0, optionTop - (containerHeight - optionHeight) / 2);
}

/** Scroll an element into view inside a scroll container only — avoids panning the page. */
export function scrollElementWithinContainer(scrollContainer, element, padding = 12) {
    if (!scrollContainer || !element) return;
    const containerRect = scrollContainer.getBoundingClientRect();
    const elementRect = element.getBoundingClientRect();
    if (elementRect.bottom > containerRect.bottom - padding) {
        scrollContainer.scrollTop += elementRect.bottom - containerRect.bottom + padding;
    } else if (elementRect.top < containerRect.top + padding) {
        scrollContainer.scrollTop -= containerRect.top + padding - elementRect.top;
    }
}






export function readRootCssPx(varName) {
    const raw = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
    if (!raw) return 0;
    const probe = document.createElement('div');
    probe.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none;height:' + raw;
    document.body.appendChild(probe);
    const px = parseFloat(getComputedStyle(probe).height) || 0;
    probe.remove();
    return px;
}

// Handle click on time part (button or instant-end input): open list and mark active.
export function handleTimePartClick(e) {
    e.stopPropagation();
    const btn = e.currentTarget;
    const type = btn.dataset.type;
    const target = btn.dataset.target;

    // Close all popovers first (keep row scroll position when switching fields)
    closeAllPopovers();

    // Open the relevant popover
    const popover = document.getElementById(`${target}-${type}-popover`);
    if (!popover) return;
    popover.classList.remove('hidden');
    btn.classList.add('active');

    // Scroll to selected option inside the popover only
    const scroll = popover.querySelector('.popover-scroll');
    const selectedOption = popover.querySelector('.popover-option.selected');
    scrollPopoverOptionIntoView(scroll, selectedOption);
}



// Select a time option from popover (end time only)
export function selectTimeOption(e) {
    e.stopPropagation();
    const btn = e.currentTarget;
    const value = parseInt(btn.dataset.value);
    const type = btn.dataset.type;

    // User manually edited end time
    state.userEditedEndTime = true;

    // Update end time values
    if (type === 'hour') state.selectedEndHour = value;
    else state.selectedEndMinute = value;

    // Update display and close popover
    updateTimeDisplay();
    closeAllPopovers();
    handleTimeChange();
}


// Close all popovers
export function closeAllPopovers() {
    document.querySelectorAll('.time-popover:not(.schedule-time-popover)').forEach(p => p.classList.add('hidden'));
    document.querySelectorAll('.schedule-time-popover').forEach(p => p.remove());
    document.querySelectorAll('.time-part.active, .time-popover-anchor.active').forEach(el =>
        el.classList.remove('active'));
}

// Handle clicks outside popovers
export function handlePopoverOutsideClick(e) {
    if (
        e.target.closest('.time-popover') ||
        e.target.closest('.time-popover-anchor') ||
        e.target.closest('.schedule-start-display input.time-part') ||
        e.target.closest('.schedule-end-display input.time-part') ||
        e.target.closest('input.time-part.time-popover-anchor') ||
        e.target.closest('button.time-part')
    ) {
        return;
    }
    closeAllPopovers();
}

// Get start time as Date (always now, with seconds zeroed for consistent duration calculation)
export function getStartTimeAsDate() {
    const now = new Date();
    now.setSeconds(0, 0); // Zero out seconds and milliseconds to match end time format
    return now;
}

// Get end time as Date
export function getEndTimeAsDate() {
    const date = new Date();
    date.setHours(state.selectedEndHour, state.selectedEndMinute, 0, 0);
    return date;
}

// Get smart label for start time relative to now
export function getStartTimeLabel(startTime) {
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
export function handleDurationInputChange() {
    const input = document.getElementById('duration-minutes-input');
    const val = input.value;

    // Don't clamp while typing - allow it to be empty
    if (val === '') return;

    let mins = parseInt(val);
    if (isNaN(mins) || mins <= 0) return;

    // Track the target duration and reset end time editing flag
    state.targetDurationMinutes = Math.min(mins, 99999);
    state.userEditedEndTime = false;

    // Only update end time if it's a valid positive number
    const startTime = getStartTimeAsDate();
    const newEndTime = new Date(startTime.getTime() + state.targetDurationMinutes * 60 * 1000);

    state.selectedEndHour = newEndTime.getHours();
    state.selectedEndMinute = newEndTime.getMinutes();

    updateTimeDisplay();
    updateDurationQuickBtns(state.targetDurationMinutes);
    handleTimeChange();
}

// Handle duration quick toggle button click
// Handle a click on any of the quick-select buttons. The "Always" button switches into
// always-on mode; the numeric duration buttons switch into timed mode and apply the new
// duration.
export function handleDurationQuickBtn(e) {
    const btn = e.currentTarget || e.target.closest('.duration-quick-btn');
    if (!btn) return;

    if (btn.dataset.mode === 'always') {
        if (!state.isAlwaysOnMode) setAlwaysOnMode(true);
        // setAlwaysOnMode already refreshes the active button state via updateDurationQuickBtns.
        return;
    }

    // Timed selection: leave always-on mode if needed, then apply the new duration.
    if (state.isAlwaysOnMode) setAlwaysOnMode(false);

    const mins = parseInt(btn.dataset.mins);
    const input = document.getElementById('duration-minutes-input');
    if (input) input.value = mins;

    // Track the target duration and reset end time editing flag
    state.targetDurationMinutes = mins;
    state.userEditedEndTime = false;

    // Calculate new end time based on start + duration
    const startTime = getStartTimeAsDate();
    const newEndTime = new Date(startTime.getTime() + mins * 60 * 1000);

    state.selectedEndHour = newEndTime.getHours();
    state.selectedEndMinute = newEndTime.getMinutes();

    updateTimeDisplay();
    updateDurationQuickBtns(mins);
    handleTimeChange();
}

// Update quick-select button active states. In always-on mode the "Always" button is the
// only active one; in timed mode the button matching durationMinutes (if any) is active.
export function updateDurationQuickBtns(durationMinutes) {
    document.querySelectorAll('.duration-quick-btn').forEach(btn => {
        if (btn.dataset.mode === 'always') {
            btn.classList.toggle('active', state.isAlwaysOnMode);
        } else {
            const btnMins = parseInt(btn.dataset.mins);
            btn.classList.toggle('active', !state.isAlwaysOnMode && btnMins === durationMinutes);
        }
    });
}