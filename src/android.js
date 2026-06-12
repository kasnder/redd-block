// ReDD Block — Android frontend.
//
// UI-only: every schedule mutation goes through tauri-plugin-androidblock,
// whose Kotlin side owns the data (device-protected SharedPreferences) and
// enforcement (Accessibility Service + WorkManager). Functionality mirrors
// redd-block-android's Compose screens 1:1; the styling follows the ReDD
// design language shared with the desktop and iOS apps.
import { invoke } from '@tauri-apps/api/core';

// ---------------------------------------------------------------------------
// Plugin bridge
// ---------------------------------------------------------------------------

// { schedules: [...legacy schedule JSON...], activeScheduleIds: [...],
//   permissions: { accessibility, notifications, batteryOptimization } }
let state = { schedules: [], activeScheduleIds: [], permissions: {} };

function applyState(response) {
    state = JSON.parse(response.stateJson);
    renderHome();
    renderSchedules();
    renderPermissions();
}

async function refreshState() {
    try {
        applyState(await invoke('plugin:androidblock|get_state'));
    } catch (e) {
        console.error('get_state failed', e);
    }
}

const saveSchedule = async (schedule) =>
    applyState(await invoke('plugin:androidblock|save_schedule', { scheduleJson: JSON.stringify(schedule) }));
const deleteSchedule = async (id) =>
    applyState(await invoke('plugin:androidblock|delete_schedule', { id }));
const toggleSchedule = async (id) =>
    applyState(await invoke('plugin:androidblock|toggle_schedule', { id }));

let installedAppsCache = null; // [{ packageName, label }]
async function getInstalledApps() {
    if (!installedAppsCache) {
        const { appsJson } = await invoke('plugin:androidblock|get_installed_apps');
        installedAppsCache = JSON.parse(appsJson);
    }
    return installedAppsCache;
}

function appLabel(pkg) {
    const hit = installedAppsCache?.find((a) => a.packageName === pkg);
    return hit ? hit.label : pkg;
}

// ---------------------------------------------------------------------------
// Navigation (simple stack of screen ids)
// ---------------------------------------------------------------------------

const screens = ['screen-home', 'screen-schedules', 'screen-edit', 'screen-friction', 'screen-permissions'];
let navStack = ['screen-home'];

function showScreen(id) {
    for (const s of screens) {
        document.getElementById(s).classList.toggle('hidden', s !== id);
    }
    window.scrollTo(0, 0);
}

function navigate(id) {
    navStack.push(id);
    showScreen(id);
}

function goBack() {
    if (navStack.length > 1) navStack.pop();
    const id = navStack[navStack.length - 1];
    if (id !== 'screen-friction') pendingFrictionAction = null;
    showScreen(id);
}

document.querySelectorAll('[data-back]').forEach((btn) => btn.addEventListener('click', goBack));

// ---------------------------------------------------------------------------
// Schedule helpers (parity with redd-block-android)
// ---------------------------------------------------------------------------

const DAYS = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];
const DAY_NARROW = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const pad = (n) => String(n).padStart(2, '0');
const fmtTime = (h, m) => `${pad(h)}:${pad(m)}`;

function isActive(scheduleId) {
    return state.activeScheduleIds.includes(scheduleId);
}

function describeSchedule(s) {
    const parts = [];
    const t = s.schedule;
    if (t.type === 'MANUAL') {
        parts.push('Manual');
    } else if (t.type === 'DAILY') {
        if (t.timeHour != null && t.endTimeHour != null) {
            parts.push(`Daily ${fmtTime(t.timeHour, t.timeMinute)} – ${fmtTime(t.endTimeHour, t.endTimeMinute)}`);
        }
    } else if (t.type === 'WEEKLY' && t.daysOfWeek?.length) {
        const names = [...t.daysOfWeek]
            .sort((a, b) => DAYS.indexOf(a) - DAYS.indexOf(b))
            .map((d) => DAY_SHORT[DAYS.indexOf(d)]);
        parts.push(names.join(', '));
    }
    const blocked = (s.blockedApps?.length || 0) + (s.blockedWebsites?.length || 0);
    if (blocked > 0) parts.push(`${blocked} blocked`);
    return parts.join(' • ');
}

// ---------------------------------------------------------------------------
// Home screen
// ---------------------------------------------------------------------------

function renderHome() {
    const perms = state.permissions;
    const allGranted = perms.accessibility && perms.notifications && perms.batteryOptimization;
    const activeCount = state.activeScheduleIds.length;

    const statusCard = document.getElementById('home-status-card');
    if (!perms.accessibility) {
        statusCard.className = 'card nav-card status-card warning';
        statusCard.innerHTML = `
            <span class="nav-card-icon" aria-hidden="true">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
            </span>
            <span class="nav-card-text">
                <span class="nav-card-title">Setup Required</span>
                <span class="nav-card-desc">Enable accessibility service to start blocking</span>
            </span>
            <span class="nav-card-chevron" aria-hidden="true">›</span>`;
    } else {
        statusCard.className = 'card nav-card status-card ok';
        statusCard.innerHTML = `
            <span class="nav-card-icon" aria-hidden="true">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
            </span>
            <span class="nav-card-text">
                <span class="nav-card-title">Protection Active</span>
                <span class="nav-card-desc">${activeCount > 0
                    ? `${activeCount} schedule${activeCount === 1 ? '' : 's'} active`
                    : 'No active schedules'}</span>
            </span>`;
    }

    document.getElementById('home-permissions-card').classList.toggle('hidden', allGranted);
}

document.getElementById('home-status-card').addEventListener('click', () => {
    if (!state.permissions.accessibility) navigate('screen-permissions');
});
document.getElementById('home-schedules-card').addEventListener('click', () => navigate('screen-schedules'));
document.getElementById('home-permissions-card').addEventListener('click', () => navigate('screen-permissions'));

// ---------------------------------------------------------------------------
// Schedules screen
// ---------------------------------------------------------------------------

function renderSchedules() {
    const list = document.getElementById('schedules-list');
    const empty = document.getElementById('schedules-empty');
    list.innerHTML = '';
    empty.classList.toggle('hidden', state.schedules.length > 0);

    for (const s of state.schedules) {
        const active = isActive(s.id);
        const row = document.createElement('div');
        row.className = `card schedule-card${active ? ' active' : ''}`;
        row.innerHTML = `
            <span class="nav-card-icon" aria-hidden="true">
                ${active
                    ? '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 3 20 12 6 21 6 3"></polygon></svg>'
                    : '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>'}
            </span>
            <span class="nav-card-text">
                <span class="nav-card-title"></span>
                <span class="nav-card-desc"></span>
            </span>
            <label class="switch">
                <input type="checkbox" ${s.isEnabled ? 'checked' : ''}>
                <span class="switch-slider"></span>
            </label>`;
        row.querySelector('.nav-card-title').textContent = s.name;
        row.querySelector('.nav-card-desc').textContent = describeSchedule(s);

        // Card tap → edit (friction-gated while the schedule is active)
        row.addEventListener('click', () => {
            if (active) requireFriction(s, () => openEditor(s.id));
            else openEditor(s.id);
        });

        // Toggle → friction gate first when disabling an active schedule
        const toggle = row.querySelector('input[type="checkbox"]');
        toggle.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault(); // state comes back via renderSchedules
            if (active) requireFriction(s, () => toggleSchedule(s.id));
            else toggleSchedule(s.id);
        });

        list.appendChild(row);
    }
}

document.getElementById('create-schedule-fab').addEventListener('click', () => openEditor(null));

// ---------------------------------------------------------------------------
// Friction gate (word challenge before touching an active schedule)
// ---------------------------------------------------------------------------

// Same word list as redd-block-android's FrictionGateScreen.
const WORD_LIST = [
    'apple', 'bridge', 'candle', 'desert', 'eagle', 'forest', 'garden',
    'harbor', 'island', 'jungle', 'kitchen', 'lemon', 'mirror', 'needle',
    'orange', 'palace', 'garden', 'river', 'silver', 'temple', 'under',
    'valley', 'winter', 'yellow', 'anchor', 'basket', 'castle', 'dragon',
    'engine', 'flower', 'guitar', 'hammer', 'insect', 'jacket', 'kitten',
    'lantern', 'marble', 'nature', 'ocean', 'pencil', 'rabbit', 'saddle',
    'timber', 'umbrella', 'velvet', 'walnut', 'zenith', 'branch', 'copper',
    'danger', 'eleven', 'falcon', 'gentle', 'hollow', 'ivory', 'jigsaw',
    'kettle', 'lumber', 'mango', 'narrow', 'oyster', 'pepper', 'quartz',
    'rocket', 'sunset', 'trophy', 'unfold', 'voyage', 'window', 'absent',
    'butter', 'circle', 'dinner', 'elbow', 'finger', 'gravel', 'helmet',
    'indent', 'jumble', 'kernel', 'ladder', 'mental', 'notice', 'offset',
    'planet', 'riddle', 'spiral', 'thread', 'unique', 'vertex', 'wander',
    'ballet', 'carbon', 'differ', 'effort', 'fabric', 'global', 'hidden',
    'impact', 'jungle', 'knight', 'linear', 'method', 'normal', 'obtain',
    'parent', 'random', 'simple', 'travel', 'update', 'vision', 'weekly',
];

let pendingFrictionAction = null;
let frictionWords = [];
let frictionIndex = 0;

function requireFriction(schedule, onPassed) {
    const count = schedule.frictionWordCount ?? 15;
    frictionWords = [...WORD_LIST].sort(() => Math.random() - 0.5).slice(0, count);
    frictionIndex = 0;
    pendingFrictionAction = onPassed;
    renderFrictionWord();
    navigate('screen-friction');
    document.getElementById('friction-input').focus();
}

function renderFrictionWord() {
    document.getElementById('friction-progress').style.width =
        `${(frictionIndex / frictionWords.length) * 100}%`;
    document.getElementById('friction-counter').textContent =
        `Word ${frictionIndex + 1} of ${frictionWords.length}`;
    document.getElementById('friction-word').textContent = frictionWords[frictionIndex];
    document.getElementById('friction-submit').textContent =
        frictionIndex >= frictionWords.length - 1 ? 'Finish' : 'Next';
    const input = document.getElementById('friction-input');
    input.value = '';
    document.getElementById('friction-error').classList.add('hidden');
    document.getElementById('friction-submit').disabled = true;
}

function checkFrictionWord() {
    const input = document.getElementById('friction-input');
    if (input.value.trim().toLowerCase() !== frictionWords[frictionIndex].toLowerCase()) {
        document.getElementById('friction-error').classList.remove('hidden');
        return;
    }
    if (frictionIndex >= frictionWords.length - 1) {
        const action = pendingFrictionAction;
        pendingFrictionAction = null;
        goBack();
        action?.();
    } else {
        frictionIndex++;
        renderFrictionWord();
        input.focus();
    }
}

document.getElementById('friction-submit').addEventListener('click', checkFrictionWord);
document.getElementById('friction-input').addEventListener('input', (e) => {
    document.getElementById('friction-error').classList.add('hidden');
    document.getElementById('friction-submit').disabled = e.target.value.trim() === '';
});
document.getElementById('friction-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.value.trim() !== '') checkFrictionWord();
});

// ---------------------------------------------------------------------------
// Create / edit schedule screen
// ---------------------------------------------------------------------------

// Working copy while the editor is open.
let editing = null; // { id|null, isEnabled, type, days:Set, blockedApps:[], blockedWebsites:[] }

async function openEditor(scheduleId) {
    const existing = scheduleId ? state.schedules.find((s) => s.id === scheduleId) : null;
    editing = {
        id: existing?.id ?? null,
        isEnabled: existing?.isEnabled ?? true,
        disabledUntil: existing?.disabledUntil,
        type: existing?.schedule?.type ?? 'WEEKLY',
        days: new Set(existing?.schedule?.daysOfWeek ?? []),
        blockedApps: [...(existing?.blockedApps ?? [])],
        blockedWebsites: [...(existing?.blockedWebsites ?? [])],
    };

    document.getElementById('edit-title').textContent = existing ? 'Edit Schedule' : 'Create Schedule';
    document.getElementById('edit-delete-btn').classList.toggle('hidden', !existing);
    document.getElementById('edit-name').value = existing?.name ?? '';
    document.getElementById('edit-start-time').value =
        fmtTime(existing?.schedule?.timeHour ?? 9, existing?.schedule?.timeMinute ?? 0);
    document.getElementById('edit-end-time').value =
        fmtTime(existing?.schedule?.endTimeHour ?? 17, existing?.schedule?.endTimeMinute ?? 0);
    const friction = existing?.frictionWordCount ?? 15;
    document.getElementById('edit-friction').value = friction;
    document.getElementById('edit-friction-value').textContent = friction;
    document.getElementById('edit-reenable').value = String(existing?.autoReenableMinutes ?? 1440);

    renderEditorType();
    renderEditorDays();
    renderEditorLists();
    updateSaveEnabled();
    navigate('screen-edit');

    // Resolve app labels for the blocked-apps rows in the background.
    getInstalledApps().then(renderEditorLists).catch(() => {});
}

function renderEditorType() {
    document.querySelectorAll('#edit-type .segment').forEach((b) => {
        b.classList.toggle('selected', b.dataset.type === editing.type);
    });
    const timed = editing.type !== 'MANUAL';
    document.getElementById('edit-times').classList.toggle('hidden', !timed);
    document.getElementById('edit-days-block').classList.toggle('hidden', editing.type !== 'WEEKLY');
}

function renderEditorDays() {
    const wrap = document.getElementById('edit-days');
    wrap.innerHTML = '';
    DAYS.forEach((day, i) => {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = `day-chip${editing.days.has(day) ? ' selected' : ''}`;
        chip.textContent = DAY_NARROW[i];
        chip.setAttribute('aria-label', day);
        chip.addEventListener('click', () => {
            editing.days.has(day) ? editing.days.delete(day) : editing.days.add(day);
            chip.classList.toggle('selected');
        });
        wrap.appendChild(chip);
    });
}

function renderEditorLists() {
    const makeRow = (label, onRemove) => {
        const row = document.createElement('div');
        row.className = 'card item-row';
        const text = document.createElement('span');
        text.className = 'item-row-label';
        text.textContent = label;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'item-remove';
        btn.setAttribute('aria-label', 'Remove');
        btn.textContent = '✕';
        btn.addEventListener('click', onRemove);
        row.append(text, btn);
        return row;
    };

    const appsWrap = document.getElementById('edit-apps-list');
    appsWrap.innerHTML = '';
    for (const pkg of editing.blockedApps) {
        appsWrap.appendChild(makeRow(appLabel(pkg), () => {
            editing.blockedApps = editing.blockedApps.filter((p) => p !== pkg);
            renderEditorLists();
        }));
    }

    const sitesWrap = document.getElementById('edit-websites-list');
    sitesWrap.innerHTML = '';
    for (const domain of editing.blockedWebsites) {
        sitesWrap.appendChild(makeRow(domain, () => {
            editing.blockedWebsites = editing.blockedWebsites.filter((d) => d !== domain);
            renderEditorLists();
        }));
    }
}

function updateSaveEnabled() {
    document.getElementById('edit-save').disabled =
        document.getElementById('edit-name').value.trim() === '';
}

document.getElementById('edit-name').addEventListener('input', updateSaveEnabled);
document.querySelectorAll('#edit-type .segment').forEach((b) =>
    b.addEventListener('click', () => {
        editing.type = b.dataset.type;
        renderEditorType();
    }));
document.getElementById('edit-friction').addEventListener('input', (e) => {
    document.getElementById('edit-friction-value').textContent = e.target.value;
});

document.getElementById('edit-save').addEventListener('click', async () => {
    const name = document.getElementById('edit-name').value.trim();
    if (!name) return;

    const manual = editing.type === 'MANUAL';
    const [sh, sm] = document.getElementById('edit-start-time').value.split(':').map(Number);
    const [eh, em] = document.getElementById('edit-end-time').value.split(':').map(Number);

    const timing = { type: editing.type, isRecurring: true, daysOfWeek: [] };
    if (!manual) {
        timing.timeHour = sh;
        timing.timeMinute = sm;
        timing.endTimeHour = eh;
        timing.endTimeMinute = em;
    }
    if (editing.type === 'WEEKLY') timing.daysOfWeek = [...editing.days];

    const schedule = {
        id: editing.id ?? crypto.randomUUID(),
        name,
        isEnabled: editing.isEnabled,
        schedule: timing,
        blockedApps: editing.blockedApps,
        blockedWebsites: editing.blockedWebsites,
        frictionWordCount: Number(document.getElementById('edit-friction').value),
        autoReenableMinutes: Number(document.getElementById('edit-reenable').value),
    };
    if (editing.disabledUntil != null) schedule.disabledUntil = editing.disabledUntil;

    await saveSchedule(schedule);
    goBack();
});

// Delete (with confirm modal)
document.getElementById('edit-delete-btn').addEventListener('click', () => {
    const name = document.getElementById('edit-name').value.trim() || 'this schedule';
    document.getElementById('delete-modal-text').textContent =
        `Delete "${name}"? This cannot be undone.`;
    document.getElementById('delete-modal').classList.remove('hidden');
});
document.getElementById('delete-cancel').addEventListener('click', () =>
    document.getElementById('delete-modal').classList.add('hidden'));
document.getElementById('delete-confirm').addEventListener('click', async () => {
    document.getElementById('delete-modal').classList.add('hidden');
    if (editing?.id) await deleteSchedule(editing.id);
    goBack();
});

// ---------------------------------------------------------------------------
// App picker modal
// ---------------------------------------------------------------------------

let pickerSelection = new Set();

async function openAppPicker() {
    pickerSelection = new Set();
    document.getElementById('app-picker-search').value = '';
    document.getElementById('app-picker-list').innerHTML =
        '<p class="modal-loading">Loading apps…</p>';
    updatePickerAddButton();
    document.getElementById('app-picker-modal').classList.remove('hidden');
    try {
        await getInstalledApps();
        renderAppPickerList();
    } catch (e) {
        document.getElementById('app-picker-list').innerHTML =
            '<p class="modal-loading">Could not load apps</p>';
    }
}

function renderAppPickerList() {
    const query = document.getElementById('app-picker-search').value.trim().toLowerCase();
    const wrap = document.getElementById('app-picker-list');
    wrap.innerHTML = '';

    const visible = (installedAppsCache ?? []).filter((a) =>
        !editing.blockedApps.includes(a.packageName) &&
        (query === '' ||
            a.label.toLowerCase().includes(query) ||
            a.packageName.toLowerCase().includes(query)));

    for (const app of visible) {
        const row = document.createElement('label');
        row.className = 'picker-row';
        const box = document.createElement('input');
        box.type = 'checkbox';
        box.checked = pickerSelection.has(app.packageName);
        box.addEventListener('change', () => {
            box.checked ? pickerSelection.add(app.packageName) : pickerSelection.delete(app.packageName);
            updatePickerAddButton();
        });
        const text = document.createElement('span');
        text.className = 'picker-row-text';
        const label = document.createElement('span');
        label.className = 'picker-row-label';
        label.textContent = app.label;
        const pkg = document.createElement('span');
        pkg.className = 'picker-row-pkg';
        pkg.textContent = app.packageName;
        text.append(label, pkg);
        row.append(box, text);
        wrap.appendChild(row);
    }
}

function updatePickerAddButton() {
    const btn = document.getElementById('app-picker-add');
    btn.disabled = pickerSelection.size === 0;
    btn.textContent = `Add (${pickerSelection.size})`;
}

document.getElementById('edit-add-app').addEventListener('click', openAppPicker);
document.getElementById('app-picker-search').addEventListener('input', renderAppPickerList);
document.getElementById('app-picker-cancel').addEventListener('click', () =>
    document.getElementById('app-picker-modal').classList.add('hidden'));
document.getElementById('app-picker-add').addEventListener('click', () => {
    editing.blockedApps = [...editing.blockedApps, ...pickerSelection];
    document.getElementById('app-picker-modal').classList.add('hidden');
    renderEditorLists();
});

// ---------------------------------------------------------------------------
// Website input modal
// ---------------------------------------------------------------------------

// Normalise to a bare lowercase domain — the blocker compares hostnames
// (lowercased, www-stripped), so "https://www.Reddit.com/r/all" → "reddit.com".
function normalizeDomain(raw) {
    let d = raw.trim().toLowerCase();
    d = d.replace(/^[a-z]+:\/\//, '').replace(/^www\./, '');
    d = d.split(/[/?#]/)[0];
    return d;
}

document.getElementById('edit-add-website').addEventListener('click', () => {
    document.getElementById('website-input').value = '';
    document.getElementById('website-add').disabled = true;
    document.getElementById('website-modal').classList.remove('hidden');
    document.getElementById('website-input').focus();
});
document.getElementById('website-input').addEventListener('input', (e) => {
    document.getElementById('website-add').disabled = normalizeDomain(e.target.value) === '';
});
document.getElementById('website-cancel').addEventListener('click', () =>
    document.getElementById('website-modal').classList.add('hidden'));

function addWebsiteFromModal() {
    const domain = normalizeDomain(document.getElementById('website-input').value);
    if (!domain) return;
    if (!editing.blockedWebsites.includes(domain)) {
        editing.blockedWebsites = [...editing.blockedWebsites, domain];
    }
    document.getElementById('website-modal').classList.add('hidden');
    renderEditorLists();
}
document.getElementById('website-add').addEventListener('click', addWebsiteFromModal);
document.getElementById('website-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addWebsiteFromModal();
});

// ---------------------------------------------------------------------------
// Permissions screen
// ---------------------------------------------------------------------------

function renderPermissions() {
    const perms = state.permissions;
    renderPermCard('perm-accessibility', perms.accessibility, true);
    renderPermCard('perm-notifications', perms.notifications, false);
    renderPermCard('perm-battery', perms.batteryOptimization, false);
}

function renderPermCard(id, granted, required) {
    const card = document.getElementById(id);
    card.className = `card perm-card${granted ? ' granted' : required ? ' required' : ''}`;
    card.innerHTML = `
        <span class="perm-status" aria-hidden="true">
            ${granted
                ? '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>'
                : '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"></circle></svg>'}
        </span>
        <span class="nav-card-text">
            <span class="nav-card-title">${card.dataset.title}
                ${required && !granted ? '<span class="required-badge">REQUIRED</span>' : ''}
            </span>
            <span class="nav-card-desc">${card.dataset.desc}</span>
        </span>`;
}

document.getElementById('perm-accessibility').addEventListener('click', () =>
    invoke('plugin:androidblock|open_accessibility_settings'));
document.getElementById('perm-notifications').addEventListener('click', () =>
    invoke('plugin:androidblock|open_notification_settings'));
document.getElementById('perm-battery').addEventListener('click', () =>
    invoke('plugin:androidblock|open_battery_settings'));

// ---------------------------------------------------------------------------
// Lifecycle: refresh whenever the app returns to the foreground (mirrors the
// ON_RESUME refresh in the Compose screens — e.g. coming back from Android
// settings after granting accessibility).
// ---------------------------------------------------------------------------

document.addEventListener('visibilitychange', () => {
    if (!document.hidden) refreshState();
});
window.addEventListener('focus', refreshState);

// Manual-testing hook: lets the UI be exercised in a plain desktop browser
// (vite dev/preview), where the Tauri plugin is unavailable. Same spirit as
// the desktop dev console helpers (runBlockingTests etc.).
window.__applyAndroidState = (stateJson) => applyState({ stateJson });

refreshState();
