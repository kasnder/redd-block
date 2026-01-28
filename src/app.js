// Tauri API imports - proper ES modules from @tauri-apps/api
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';

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
    closeWindow: () => getCurrentWindow().hide(),

    // Helper daemon operations
    checkHelperStatus: () => invoke('check_helper_status').catch(() => ({ installed: false, running: false })),
    installHelper: () => invoke('install_helper'),
    startBlockViaHelper: (data) => invoke('start_block_via_helper', { ...data }),
    clearBlockViaHelper: () => invoke('clear_block_via_helper'),

    // App operations
    openAppPicker: () => invoke('open_app_picker'),
    blockWebsites: (domains) => invoke('block_websites', { domains }),
    refreshBlockedApps: () => invoke('refresh_blocked_apps').catch(() => { }),

    // Process watcher for app blocking
    setBlockedApps: (apps) => invoke('set_blocked_apps', { apps }),
    startProcessWatcher: () => invoke('start_process_watcher'),
    stopProcessWatcher: () => invoke('stop_process_watcher'),
    hideAllBlockedApps: () => invoke('hide_all_blocked_apps'),

    // Event listening
    onBlocksUpdated: (callback) => listen('blocks-updated', callback),
};

// State
let appData = {
    blocklists: [],
    activeBlocks: [],
    settings: {
        onboardingComplete: false
    }
};

let selectedBlocklistId = null;
let editingBlocklistId = null;
let overrideBlockId = null;
let challengeText = '';
let lastBlockedDomains = new Set(); // Track what's currently blocked to avoid re-prompting
let activatedBlockIds = new Set(); // Track blocks that have already triggered host updates
let helperAvailable = false; // Track if the privileged helper daemon is running
let pendingBlockData = null; // Store block data when waiting for helper installation
let draggedBlocklistId = null; // Track which blocklist is being dragged

// Week calendar state
let currentWeekStart = null; // Date object for Monday of the displayed week

// Schedule mode state
let isScheduleMode = false; // false = instant mode, true = schedule mode
let scheduleSegments = getDefaultScheduleSegments(); // Array of time segments with per-segment days
let scheduleRepeatType = 'no'; // 'no', 'forever', or 'date'
let scheduleRepeatDate = null; // Date object when repeatType is 'date'

// Word list for random word challenges
const wordList = [
    // 1-2 chars
    'a', 'ad', 'am', 'an', 'as', 'at', 'be', 'by', 'do', 'go', 'he', 'hi', 'if', 'in', 'is', 'it', 'me', 'my', 'no', 'of', 'on', 'or', 'so', 'to', 'up', 'us', 'we',
    // 3 chars
    'act', 'add', 'age', 'aim', 'air', 'all', 'and', 'any', 'art', 'ask', 'bad', 'bag', 'bar', 'bat', 'bed', 'bee', 'big', 'bit', 'box', 'boy', 'bus', 'but', 'buy', 'can', 'car', 'cat', 'day', 'die', 'dog', 'dry', 'due', 'eat', 'egg', 'end', 'eye', 'far', 'few', 'fit', 'fly', 'for', 'fun', 'get', 'god', 'got', 'guy', 'hot', 'how', 'ice', 'ill', 'ink', 'job', 'joy', 'key', 'kid', 'law', 'lay', 'leg', 'let', 'lie', 'log', 'lot', 'low', 'man', 'map', 'may', 'men', 'mix', 'net', 'new', 'nod', 'nor', 'not', 'now', 'num', 'off', 'oil', 'old', 'one', 'out', 'own', 'pay', 'pen', 'per', 'pet', 'pie', 'pig', 'pin', 'pot', 'put', 'ran', 'raw', 'red', 'row', 'run', 'sad', 'say', 'sea', 'see', 'set', 'sex', 'she', 'sin', 'sit', 'six', 'sky', 'son', 'sun', 'tap', 'tax', 'tea', 'ten', 'the', 'tie', 'tip', 'toe', 'too', 'top', 'toy', 'try', 'two', 'use', 'van', 'war', 'way', 'who', 'why', 'win', 'yes', 'yet', 'you',
    // 4 chars
    'also', 'able', 'acid', 'aged', 'away', 'baby', 'back', 'ball', 'bank', 'base', 'bath', 'bear', 'beat', 'beer', 'bell', 'belt', 'best', 'bill', 'bird', 'blow', 'blue', 'boat', 'body', 'bomb', 'bond', 'bone', 'book', 'boom', 'born', 'boss', 'both', 'bowl', 'burn', 'busy', 'call', 'calm', 'came', 'camp', 'card', 'care', 'case', 'cash', 'cast', 'cell', 'chat', 'chip', 'city', 'club', 'coal', 'coat', 'code', 'cold', 'come', 'cook', 'cool', 'cope', 'core', 'cost', 'crew', 'crop', 'dark', 'date', 'dead', 'deal', 'dean', 'dear', 'debt', 'deep', 'deny', 'desk', 'dial', 'diet', 'disc', 'disk', 'does', 'done', 'door', 'dose', 'down', 'draw', 'drew', 'drop', 'drug', 'dual', 'duke', 'dust', 'duty', 'each', 'earn', 'ease', 'east', 'easy', 'edge', 'edit', 'else', 'even', 'ever', 'evil', 'exit', 'face', 'fact', 'fail', 'fair', 'fall', 'farm', 'fast', 'fate', 'fear', 'feed', 'feel', 'feet', 'fell', 'felt', 'file', 'fill', 'film', 'find', 'fine', 'fire', 'firm', 'fish', 'five', 'flat', 'fled', 'flew', 'flow', 'food', 'foot', 'ford', 'form', 'fort', 'four', 'free', 'from', 'fuel', 'full', 'fund', 'gain', 'game', 'gate', 'gave', 'gear', 'gene', 'gift', 'girl', 'give', 'glad', 'goal', 'goes', 'gold', 'golf', 'gone', 'good', 'gray', 'grew', 'grey', 'grow', 'hair', 'half', 'hall', 'hand', 'hang', 'hard', 'harm', 'hate', 'have', 'head', 'hear', 'heat', 'held', 'hell', 'help', 'here', 'hero', 'high', 'hill', 'hire', 'hold', 'hole', 'holy', 'home', 'hope', 'host', 'hour', 'huge', 'hung', 'hunt', 'hurt', 'idea', 'inch', 'into', 'iron', 'item', 'join', 'joke', 'jump', 'jury', 'just', 'keep', 'kept', 'kick', 'kill', 'kind', 'king', 'knee', 'knew', 'know', 'lack', 'lady', 'laid', 'lake', 'land', 'lane', 'last', 'late', 'lead', 'left', 'less', 'life', 'lift', 'like', 'line', 'link', 'list', 'live', 'load', 'loan', 'lock', 'logo', 'long', 'look', 'lord', 'lose', 'loss', 'lost', 'love', 'luck', 'made', 'mail', 'main', 'make', 'male', 'many', 'mark', 'mass', 'mate', 'math', 'meal', 'mean', 'meat', 'meet', 'menu', 'mere', 'mile', 'milk', 'mill', 'mind', 'mine', 'miss', 'mode', 'mood', 'moon', 'more', 'most', 'move', 'much', 'must', 'name', 'navy', 'near', 'neck', 'need', 'news', 'next', 'nice', 'nick', 'nine', 'none', 'nose', 'note', 'okay', 'once', 'only', 'onto', 'open', 'oral', 'over', 'pace', 'pack', 'page', 'paid', 'pain', 'pair', 'palm', 'park', 'part', 'pass', 'past', 'path', 'peak', 'pick', 'pile', 'pink', 'pipe', 'plan', 'play', 'plot', 'plug', 'plus', 'poll', 'pool', 'poor', 'port', 'post', 'pull', 'pure', 'push', 'race', 'rail', 'rain', 'rank', 'rare', 'rate', 'read', 'real', 'rear', 'rely', 'rent', 'rest', 'rice', 'rich', 'ride', 'ring', 'rise', 'risk', 'road', 'rock', 'role', 'roll', 'roof', 'room', 'root', 'rose', 'rule', 'rush', 'safe', 'said', 'sake', 'sale', 'salt', 'same', 'sand', 'save', 'seat', 'seed', 'seek', 'seem', 'seen', 'self', 'sell', 'send', 'sent', 'ship', 'shop', 'shot', 'show', 'shut', 'sick', 'side', 'sign', 'silk', 'site', 'size', 'skin', 'slip', 'slow', 'snow', 'soft', 'soil', 'sold', 'sole', 'some', 'song', 'soon', 'sort', 'soul', 'spot', 'star', 'stay', 'step', 'stop', 'such', 'suit', 'sure', 'take', 'tale', 'talk', 'tall', 'tank', 'tape', 'task', 'team', 'tech', 'tell', 'tend', 'term', 'test', 'text', 'than', 'that', 'them', 'then', 'they', 'thin', 'this', 'thus', 'till', 'time', 'tiny', 'told', 'toll', 'tone', 'took', 'tool', 'tour', 'town', 'tree', 'trip', 'true', 'tune', 'turn', 'twin', 'type', 'unit', 'upon', 'used', 'user', 'vary', 'vast', 'very', 'vice', 'view', 'vote', 'wage', 'wait', 'wake', 'walk', 'wall', 'want', 'ward', 'warm', 'wash', 'wave', 'ways', 'weak', 'wear', 'week', 'well', 'went', 'were', 'west', 'what', 'when', 'whom', 'wide', 'wife', 'wild', 'will', 'wind', 'wine', 'wing', 'wire', 'wise', 'wish', 'with', 'wood', 'word', 'work', 'yard', 'yeah', 'year', 'your', 'zero', 'zone',
    // 5+ chars (selection)
    'about', 'above', 'abuse', 'actor', 'acute', 'admit', 'adopt', 'adult', 'after', 'again', 'agent', 'agree', 'ahead', 'alarm', 'album', 'alert', 'alike', 'alive', 'allow', 'alone', 'along', 'alter', 'among', 'anger', 'angle', 'angry', 'apart', 'apple', 'apply', 'arena', 'argue', 'arise', 'array', 'aside', 'asset', 'audio', 'audit', 'avoid', 'award', 'aware', 'badly', 'baker', 'bases', 'basic', 'basis', 'beach', 'began', 'begin', 'begun', 'being', 'below', 'bench', 'birth', 'black', 'blame', 'blind', 'block', 'blood', 'board', 'boost', 'booth', 'bound', 'brain', 'brand', 'bread', 'break', 'breed', 'brief', 'bring', 'broad', 'brown', 'brush', 'build', 'built', 'buyer', 'cable', 'carry', 'catch', 'cause', 'chain', 'chair', 'chart', 'chase', 'cheap', 'check', 'chest', 'chief', 'child', 'china', 'chose', 'civil', 'claim', 'class', 'clean', 'clear', 'click', 'clock', 'close', 'coach', 'coast', 'could', 'count', 'court', 'cover', 'craft', 'crash', 'cream', 'crime', 'cross', 'crowd', 'crown', 'curve', 'cycle', 'daily', 'dance', 'dated', 'dealt', 'death', 'debut', 'delay', 'depth', 'doing', 'doubt', 'dozen', 'draft', 'drama', 'drawn', 'dream', 'dress', 'drill', 'drink', 'drive', 'drove', 'dying', 'eager', 'early', 'earth', 'eight', 'elite', 'empty', 'enemy', 'enjoy', 'enter', 'entry', 'equal', 'error', 'event', 'every', 'exact', 'exist', 'extra', 'faith', 'false', 'fault', 'fiber', 'field', 'fifth', 'fifty', 'fight', 'final', 'first', 'fixed', 'flash', 'fleet', 'floor', 'fluid', 'focus', 'force', 'forth', 'forty', 'forum', 'found', 'frame', 'frank', 'fraud', 'fresh', 'front', 'fruit', 'fully', 'funny', 'giant', 'given', 'glass', 'globe', 'going', 'grace', 'grade', 'grand', 'grant', 'grass', 'great', 'green', 'gross', 'group', 'grown', 'guard', 'guess', 'guest', 'guide', 'happy', 'heart', 'heavy', 'hence', 'horse', 'hotel', 'house', 'human', 'ideal', 'image', 'index', 'inner', 'input', 'issue', 'japan', 'joint', 'judge', 'known', 'label', 'large', 'laser', 'later', 'laugh', 'layer', 'learn', 'lease', 'least', 'leave', 'legal', 'level', 'light', 'limit', 'links', 'lives', 'local', 'logic', 'loose', 'lower', 'lucky', 'lunch', 'lying', 'magic', 'major', 'maker', 'march', 'match', 'maybe', 'mayor', 'limit', 'admit', 'adult', 'advice', 'affect', 'afford', 'afraid', 'agency', 'agenda', 'almost', 'always', 'amount', 'animal', 'annual', 'answer', 'anyway', 'appeal', 'appear', 'aspect', 'assist', 'assume', 'attack', 'attend', 'august', 'author', 'avenue', 'backed', 'barely', 'battle', 'beauty', 'became', 'become', 'before', 'behalf', 'behind', 'belief', 'belong', 'berlin', 'better', 'beyond', 'bishop', 'border', 'bottle', 'bottom', 'bought', 'branch', 'breath', 'bridge', 'bright', 'broken', 'budget', 'burden', 'bureau', 'button', 'camera', 'cancer', 'cannot', 'carbon', 'career', 'castle', 'casual', 'caught', 'center', 'centre', 'chance', 'change', 'charge', 'choice', 'choose', 'chosen', 'church', 'circle', 'client', 'closed', 'closer', 'coffee', 'column', 'combat', 'coming', 'common', 'comply', 'copper', 'corner', 'costly', 'county', 'couple', 'course', 'covers', 'create', 'credit'
];

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    await loadData();
    await checkHelperStatus();
    setupEventListeners();
    setupTheme();
    render();
    scrollToNow(false); // Initial scroll (instant, no animation)
    startTickInterval();
    detectPlatform();
});

// Check if the helper daemon is available
async function checkHelperStatus() {
    try {
        const status = await tauriAPI.checkHelperStatus();
        helperAvailable = status.running;
        console.log('Helper status:', status);

        // If not installed, we'll prompt to install when they try to start a block
        if (!status.installed) {
            console.log('Helper not installed - will prompt on first block');
        }
    } catch (err) {
        console.error('Error checking helper status:', err);
        helperAvailable = false;
    }
}

// Load data from main process
async function loadData() {
    appData = await tauriAPI.loadData();
    if (!appData || !appData.blocklists) {
        appData = {
            blocklists: [],
            activeBlocks: [],
            settings: { onboardingComplete: false }
        };
    }
}

// Save data to main process
async function saveData() {
    await tauriAPI.saveData(appData);
}

// Detect platform for window controls
function detectPlatform() {
    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
    if (!isMac) {
        document.getElementById('window-controls').classList.remove('hidden');
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

// Setup event listeners
function setupEventListeners() {
    // Window controls
    document.getElementById('min-btn')?.addEventListener('click', () => {
        tauriAPI.minimizeWindow();
    });
    document.getElementById('max-btn')?.addEventListener('click', () => {
        tauriAPI.maximizeWindow();
    });
    document.getElementById('close-btn')?.addEventListener('click', () => {
        tauriAPI.closeWindow();
    });

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
            selectedBlocklistId = null;
            const blocklistSelect = document.getElementById('blocklist-select');
            blocklistSelect.value = '';
            handleBlocklistSelect({ target: blocklistSelect });
        }
    });

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

    // Duration picker - quick toggle buttons
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
    setupOnboardingListeners();

    // Modal listeners
    setupModalListeners();

    // Override modal
    setupOverrideModalListeners();

    // Undo toast button
    document.getElementById('undo-toast-btn')?.addEventListener('click', undoDelete);

    // Helper install modal buttons
    document.getElementById('cancel-helper-install-btn')?.addEventListener('click', () => {
        document.getElementById('helper-install-modal').classList.add('hidden');
        pendingBlockData = null;
    });

    document.getElementById('proceed-helper-install-btn')?.addEventListener('click', proceedWithHelperInstall);

    // Start block confirmation modal buttons
    document.getElementById('cancel-start-confirm-btn')?.addEventListener('click', closeStartBlockConfirmModal);
    document.getElementById('proceed-start-confirm-btn')?.addEventListener('click', proceedWithBlock);

    // Week calendar navigation buttons
    document.getElementById('prev-week-btn')?.addEventListener('click', () => navigateWeek(-1));
    document.getElementById('next-week-btn')?.addEventListener('click', () => navigateWeek(1));
    document.getElementById('today-btn')?.addEventListener('click', () => scrollToToday());

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

    // Week calendar scroll handling with day snap
    const calendarScroll = document.querySelector('.week-calendar-scroll');
    if (calendarScroll) {
        let scrollTimeout;
        calendarScroll.addEventListener('scroll', () => {
            clearTimeout(scrollTimeout);
            scrollTimeout = setTimeout(() => {
                // Update the visible date range display
                updateVisibleRangeDisplay();
            }, 150);
        });

        // Click on calendar (not on block) scrolls to today
        calendarScroll.addEventListener('click', (e) => {
            if (!e.target.closest('.calendar-block')) {
                scrollToToday();
            }
        });
    }

    // Listen for blocks updated from main process
    tauriAPI.onBlocksUpdated(async () => {
        await loadData();
        render();
    });
}

// Onboarding listeners
function setupOnboardingListeners() {
    const websiteInput = document.getElementById('website-input');
    const appInput = document.getElementById('app-input');
    const websitesTags = document.getElementById('websites-tags');
    const appsTags = document.getElementById('apps-tags');

    let onboardingWebsites = [];
    let onboardingApps = [];

    websiteInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && websiteInput.value.trim()) {
            e.preventDefault();
            const website = websiteInput.value.trim().toLowerCase();
            if (!onboardingWebsites.includes(website)) {
                onboardingWebsites.push(website);
                renderTags(websitesTags, onboardingWebsites, (idx) => {
                    onboardingWebsites.splice(idx, 1);
                    renderTags(websitesTags, onboardingWebsites);
                });
            }
            websiteInput.value = '';
        }
    });

    appInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && appInput.value.trim()) {
            e.preventDefault();
            const app = appInput.value.trim();
            if (!onboardingApps.includes(app)) {
                onboardingApps.push(app);
                renderTags(appsTags, onboardingApps, (idx) => {
                    onboardingApps.splice(idx, 1);
                    renderTags(appsTags, onboardingApps);
                });
            }
            appInput.value = '';
        }
    });

    // Browse button for onboarding
    document.getElementById('browse-apps-btn')?.addEventListener('click', async () => {
        const appName = await tauriAPI.openAppPicker();
        if (appName && !onboardingApps.includes(appName)) {
            onboardingApps.push(appName);
            renderTags(appsTags, onboardingApps, (idx) => {
                onboardingApps.splice(idx, 1);
                renderTags(appsTags, onboardingApps);
            });
        }
    });

    document.getElementById('create-first-blocklist-btn').addEventListener('click', () => {
        // Auto-confirm any pending input in the website/app fields
        const pendingWebsite = websiteInput.value.trim().toLowerCase();
        if (pendingWebsite && !onboardingWebsites.includes(pendingWebsite)) {
            onboardingWebsites.push(pendingWebsite);
            websiteInput.value = '';
            renderTags(websitesTags, onboardingWebsites, (idx) => {
                onboardingWebsites.splice(idx, 1);
                renderTags(websitesTags, onboardingWebsites);
            });
        }

        const pendingApp = appInput.value.trim();
        if (pendingApp && !onboardingApps.includes(pendingApp)) {
            onboardingApps.push(pendingApp);
            appInput.value = '';
            renderTags(appsTags, onboardingApps, (idx) => {
                onboardingApps.splice(idx, 1);
                renderTags(appsTags, onboardingApps);
            });
        }

        const name = document.getElementById('first-blocklist-name').value.trim();
        if (!name) {
            alert('Please enter a name for your blocklist');
            return;
        }
        if (onboardingWebsites.length === 0 && onboardingApps.length === 0) {
            alert('Please add at least one website or app to block');
            return;
        }

        const blocklist = {
            id: generateId(),
            name,
            mode: 'blocklist',
            websites: onboardingWebsites,
            apps: onboardingApps,
            overrideDifficulty: {
                type: 'random-words',
                count: 50
            }
        };

        appData.blocklists.push(blocklist);
        appData.settings.onboardingComplete = true;
        saveData();

        // Resize window from onboarding size to main app size
        tauriAPI.setWindowSize(840, 650);

        render();
    });
}

// Modal listeners
function setupModalListeners() {
    let modalWebsites = [];
    let modalApps = [];

    const modalWebsiteInput = document.getElementById('modal-website-input');
    const modalAppInput = document.getElementById('modal-app-input');
    const modalWebsitesTags = document.getElementById('modal-websites-tags');
    const modalAppsTags = document.getElementById('modal-apps-tags');

    // Close modal when clicking outside content
    document.getElementById('blocklist-modal').addEventListener('click', (e) => {
        if (e.target.classList.contains('modal-overlay')) {
            closeBlocklistModal();
        }
    });

    modalWebsiteInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && modalWebsiteInput.value.trim()) {
            e.preventDefault();
            const website = modalWebsiteInput.value.trim().toLowerCase();
            if (!modalWebsites.includes(website)) {
                modalWebsites.push(website);
                window.renderModalTags();
            }
            modalWebsiteInput.value = '';
        }
    });

    modalAppInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && modalAppInput.value.trim()) {
            e.preventDefault();
            const app = modalAppInput.value.trim();
            if (!modalApps.includes(app)) {
                modalApps.push(app);
                window.renderModalTags();
            }
            modalAppInput.value = '';
        }
    });

    // Browse button for modal
    document.getElementById('modal-browse-apps-btn')?.addEventListener('click', async () => {
        const appName = await tauriAPI.openAppPicker();
        if (appName && !modalApps.includes(appName)) {
            modalApps.push(appName);
            window.renderModalTags();
        }
    });
    // Override type
    document.getElementById('override-type').addEventListener('change', (e) => {
        const type = e.target.value;
        const customTextArea = document.getElementById('custom-override-text');
        const overrideCountWrapper = document.getElementById('override-count-wrapper');
        const hintEl = document.getElementById('override-count-hint');

        if (type === 'custom') {
            customTextArea.classList.remove('hidden');
            overrideCountWrapper.classList.add('hidden');
            hintEl.classList.add('hidden');
        } else {
            customTextArea.classList.add('hidden');
            overrideCountWrapper.classList.remove('hidden');
            hintEl.classList.remove('hidden');

            if (type === 'random-words') {
                hintEl.innerHTML = "E.g. 10 chars → 'shine great'";
            } else {
                hintEl.innerHTML = "E.g. 10 chars → 'a982j3+fd'";
            }
        }
    });

    // Override count blur on enter
    document.getElementById('override-count').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.target.blur();
        }
    });

    // Color swatches
    document.querySelectorAll('.color-swatch').forEach(swatch => {
        swatch.addEventListener('click', () => {
            document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('selected'));
            swatch.classList.add('selected');
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

    // Cancel button
    document.getElementById('cancel-blocklist-btn').addEventListener('click', () => {
        closeBlocklistModal();
    });

    // Save button
    document.getElementById('save-blocklist-btn').addEventListener('click', () => {
        // Auto-confirm any pending input in the website/app fields
        const pendingWebsite = modalWebsiteInput.value.trim().toLowerCase();
        if (pendingWebsite && !modalWebsites.includes(pendingWebsite)) {
            modalWebsites.push(pendingWebsite);
            modalWebsiteInput.value = '';
            window.renderModalTags();
        }

        const pendingApp = modalAppInput.value.trim();
        if (pendingApp && !modalApps.includes(pendingApp)) {
            modalApps.push(pendingApp);
            modalAppInput.value = '';
            window.renderModalTags();
        }

        const name = document.getElementById('blocklist-name').value.trim();
        if (!name) {
            alert('Please enter a name');
            return;
        }

        const mode = 'blocklist'; // Allowlist mode not yet implemented
        const overrideType = document.getElementById('override-type').value;
        const overrideCount = parseInt(document.getElementById('override-count').value) || 10;
        const customText = document.getElementById('custom-override-text').value;
        const selectedSwatch = document.querySelector('.color-swatch.selected');
        const color = selectedSwatch ? selectedSwatch.dataset.color : null;
        const selectedEmoji = document.querySelector('.emoji-swatch.selected');
        const emoji = selectedEmoji ? selectedEmoji.dataset.emoji : '🚫';

        // IMPORTANT: Create copies of the arrays, not references!
        const blocklist = {
            id: editingBlocklistId || generateId(),
            name,
            mode,
            color,
            emoji,
            websites: [...modalWebsites],  // Copy the array
            apps: [...modalApps],          // Copy the array
            overrideDifficulty: {
                type: overrideType,
                count: overrideCount,
                customText: overrideType === 'custom' ? customText : undefined
            }
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

        // If this blocklist is active, update blocking rules immediately
        const isActive = appData.activeBlocks.some(b => b.blocklistId === blocklist.id);
        if (isActive) {
            // Update website blocking
            updateHostsFile();

            // Update app blocking - collect all apps from active blocks
            const now = Date.now();
            const allBlockedApps = new Set();
            appData.activeBlocks
                .filter(block => block.startTime <= now && block.endTime > now)
                .forEach(block => {
                    const bl = appData.blocklists.find(b => b.id === block.blocklistId);
                    if (bl && bl.apps) {
                        bl.apps.forEach(app => allBlockedApps.add(app));
                    }
                });

            // Update the blocked apps list and hide any newly-blocked apps
            if (allBlockedApps.size > 0) {
                tauriAPI.setBlockedApps(Array.from(allBlockedApps));
                tauriAPI.hideAllBlockedApps();
            }
        }

        closeBlocklistModal();
        render();
    });

    // Store references for modal functions
    window.modalWebsites = modalWebsites;
    window.modalApps = modalApps;
    window.lockedWebsites = [];
    window.lockedApps = [];

    window.renderModalTags = () => {
        renderTags(modalWebsitesTags, modalWebsites, (idx) => {
            modalWebsites.splice(idx, 1);
            window.renderModalTags();
        }, window.lockedWebsites);

        renderTags(modalAppsTags, modalApps, (idx) => {
            modalApps.splice(idx, 1);
            window.renderModalTags();
        }, window.lockedApps);
    };

    window.setModalData = (websites, apps, lockedWebsitesList = [], lockedAppsList = []) => {
        modalWebsites.length = 0;
        modalApps.length = 0;
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
        closeOverrideModal();
    });

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

        if (typed === target && overrideBlockId) {
            // Correct! Remove the block
            appData.activeBlocks = appData.activeBlocks.filter(b => b.id !== overrideBlockId);
            await saveData();

            // Always try the helper first (it should be running after initial block was started)
            // Re-check helper status in case it was installed this session
            const status = await tauriAPI.checkHelperStatus();
            if (status.running) {
                helperAvailable = true;
                await tauriAPI.clearBlockViaHelper();
            } else {
                // Fallback to direct update only if helper truly not running
                await updateHostsFile();
            }

            // Notify main process to refresh blocked apps list (stops app blocking)
            tauriAPI.refreshBlockedApps();

            // Stop the process watcher since we're clearing blocks
            await tauriAPI.stopProcessWatcher();

            render();
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
function renderTags(container, items, onRemove, lockedItems = []) {
    container.innerHTML = items.map((item, idx) => {
        const isLocked = lockedItems.includes(item);
        const lockedClass = isLocked ? 'locked' : '';
        const removeBtn = !isLocked ? `<button class="tag-remove" data-idx="${idx}">×</button>` : '';

        return `
    <span class="tag ${lockedClass}">
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

// Initialize time picker with popover options (end time only)
function initializeTimeInputs() {
    const now = new Date();

    // Reset editing flag and set default duration
    userEditedEndTime = false;
    targetDurationMinutes = 60;

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
        return 'Now';
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
function handleDurationQuickBtn(e) {
    const mins = parseInt(e.target.dataset.mins);
    const input = document.getElementById('duration-minutes-input');
    input.value = mins;

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

// Update quick button active states based on current duration
function updateDurationQuickBtns(durationMinutes) {
    document.querySelectorAll('.duration-quick-btn').forEach(btn => {
        const btnMins = parseInt(btn.dataset.mins);
        if (btnMins === durationMinutes) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
}

// ========================================
// SCHEDULE MODE FUNCTIONS
// ========================================

// Get default schedule segments based on current time
// Start at the current hour (floor), end 2 hours later
function getDefaultScheduleSegments() {
    const now = new Date();
    const startHour = now.getHours();
    const endHour = (startHour + 2) % 24;
    // Get current day (0=Sun...6=Sat in JS, convert to 0=Mon...6=Sun)
    const jsDay = now.getDay();
    const currentDay = jsDay === 0 ? 6 : jsDay - 1; // Convert: Sun=6, Mon=0, Tue=1, etc.
    return [
        { startHour, startMinute: 0, endHour, endMinute: 0, days: [currentDay] }
    ];
}

// Switch between instant and schedule modes
function setScheduleMode(isSchedule) {
    isScheduleMode = isSchedule;

    // Update tab active states
    document.getElementById('instant-mode-tab').classList.toggle('active', !isSchedule);
    document.getElementById('schedule-mode-tab').classList.toggle('active', isSchedule);

    // Update section heading
    const heading = document.querySelector('#scheduler-section .section-header h2');
    if (heading) {
        heading.textContent = isSchedule ? 'Schedule a Block' : 'Start a Block';
    }

    // Toggle panels
    const instantPanel = document.getElementById('instant-block-panel');
    const schedulePanel = document.getElementById('schedule-block-panel');
    const startBlockBtn = document.getElementById('start-block-btn');
    const startScheduleBtn = document.getElementById('start-schedule-btn');

    if (isSchedule) {
        // Reset schedule segments to fresh default times
        scheduleSegments = getDefaultScheduleSegments();
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
        }
    }

    // Update calendar preview
    handleTimeChange();
}

// Toggle Repeat dropdown visibility
function toggleRepeatDropdown(e) {
    e.stopPropagation();
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
    const value = e.target.dataset.value;
    const menu = document.getElementById('repeat-dropdown-menu');
    const btnText = document.getElementById('repeat-dropdown-text');
    const dateInput = document.getElementById('repeat-date-input');

    scheduleRepeatType = value;

    // Update dropdown text
    if (btnText) {
        if (value === 'no') {
            btnText.textContent = 'No';
        } else if (value === 'forever') {
            btnText.textContent = 'Forever';
        } else {
            btnText.textContent = 'Until date';
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

// Format date for display (e.g., "3 Feb 2026")
function formatDateForDisplay(date) {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const day = date.getDate();
    const month = months[date.getMonth()];
    const year = date.getFullYear();
    return `${day} ${month} ${year}`;
}

// Update schedule button enabled state
function updateScheduleButtonState() {
    const startScheduleBtn = document.getElementById('start-schedule-btn');
    if (!startScheduleBtn) return;

    // Enable if blocklist is selected (days are optional - no days = today only)
    const isValid = selectedBlocklistId;
    startScheduleBtn.disabled = !isValid;

    // Update button name
    if (selectedBlocklistId) {
        const blocklist = appData.blocklists.find(bl => bl.id === selectedBlocklistId);
        if (blocklist) {
            startScheduleBtn.querySelector('.btn-name').textContent = blocklist.name;
        }
    }
}

// Add a new time segment
function addScheduleSegment() {
    const segmentIndex = scheduleSegments.length;

    // Get the previous segment's end time, round up to next full hour for new start
    const prevSegment = scheduleSegments[segmentIndex - 1];
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

    // Default to current day (0=Mon...6=Sun)
    const jsDay = new Date().getDay();
    const currentDay = jsDay === 0 ? 6 : jsDay - 1;

    // Add to state
    scheduleSegments.push({
        startHour: newStartHour,
        startMinute: newStartMinute,
        endHour: newEndHour,
        endMinute: newEndMinute,
        days: [currentDay]
    });

    // Create DOM element
    const container = document.getElementById('schedule-segments');
    const segment = document.createElement('div');
    segment.className = 'schedule-segment';
    segment.dataset.segmentIndex = segmentIndex;

    // Generate day toggle HTML with current day active
    const dayLabels = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
    const dayTogglesHtml = dayLabels.map((label, i) =>
        `<button type="button" class="segment-day-toggle${i === currentDay ? ' active' : ''}" data-day="${i}">${label}</button>`
    ).join('');

    segment.innerHTML = `
        <div class="segment-row">
            <div class="time-pickers-row">
                <div class="time-picker-group">
                    <div class="time-picker-row">
                        <div class="time-display schedule-start-display">
                            <div class="time-part-wrapper">
                                <button class="time-part schedule-hour-btn" data-type="hour" data-target="schedule-start-${segmentIndex}">${String(newStartHour).padStart(2, '0')}</button>
                            </div>
                            <span class="time-colon">:</span>
                            <div class="time-part-wrapper">
                                <button class="time-part schedule-minute-btn" data-type="minute" data-target="schedule-start-${segmentIndex}">${String(newStartMinute).padStart(2, '0')}</button>
                            </div>
                        </div>
                    </div>
                </div>
                <span class="time-separator">→</span>
                <div class="time-picker-group">
                    <div class="time-picker-row">
                        <div class="time-display schedule-end-display">
                            <div class="time-part-wrapper">
                                <button class="time-part schedule-hour-btn" data-type="hour" data-target="schedule-end-${segmentIndex}">${String(newEndHour).padStart(2, '0')}</button>
                            </div>
                            <span class="time-colon">:</span>
                            <div class="time-part-wrapper">
                                <button class="time-part schedule-minute-btn" data-type="minute" data-target="schedule-end-${segmentIndex}">${String(newEndMinute).padStart(2, '0')}</button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            <div class="segment-days-group">
                <div class="segment-days" data-segment-index="${segmentIndex}">
                    ${dayTogglesHtml}
                </div>
            </div>
        </div>
        <button type="button" class="remove-segment-btn" data-segment-index="${segmentIndex}">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
        </button>
    `;

    container.appendChild(segment);

    // Add click handlers for the new time buttons
    segment.querySelectorAll('.time-part').forEach(btn => {
        btn.addEventListener('click', handleScheduleTimeClick);
    });

    // Add click handlers for day toggles
    segment.querySelectorAll('.segment-day-toggle').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const dayIndex = parseInt(btn.dataset.day);
            handleSegmentDayToggle(segmentIndex, dayIndex, btn);
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

    // Update calendar preview
    handleTimeChange();
}

// Handle clicking a day toggle within a segment
function handleSegmentDayToggle(segmentIndex, dayIndex, btn) {
    const segment = scheduleSegments[segmentIndex];
    if (!segment) return;

    // Toggle the day in the segment's days array
    const dayIdx = segment.days.indexOf(dayIndex);
    if (dayIdx === -1) {
        segment.days.push(dayIndex);
        segment.days.sort((a, b) => a - b);
        btn.classList.add('active');
    } else {
        // Don't allow removing the last day
        if (segment.days.length > 1) {
            segment.days.splice(dayIdx, 1);
            btn.classList.remove('active');
        }
    }

    // Update preview and button state
    handleTimeChange();
    updateScheduleButtonState();
}

// Remove a time segment
function removeScheduleSegment(index) {
    if (scheduleSegments.length <= 1) return; // Always keep at least one

    // Remove from state
    scheduleSegments.splice(index, 1);

    // Rebuild DOM (simpler than updating indices)
    rebuildScheduleSegments();
}

// Rebuild schedule segments DOM from state
function rebuildScheduleSegments() {
    const container = document.getElementById('schedule-segments');
    container.innerHTML = '';

    const dayLabels = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

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

    for (let i = 0; i < max; i += step) {
        const option = document.createElement('button');
        option.className = 'popover-option' + (i === currentValue ? ' selected' : '');
        option.textContent = String(i).padStart(2, '0');
        option.addEventListener('click', (e) => {
            e.stopPropagation(); // Prevent blocklist deselection

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

// Start a schedule (placeholder - will be expanded)
async function startSchedule() {
    if (!selectedBlocklistId) return;

    const blocklist = appData.blocklists.find(bl => bl.id === selectedBlocklistId);
    if (!blocklist) return;

    // Check that at least one segment has days
    const hasAnyDays = scheduleSegments.some(seg => seg.days && seg.days.length > 0);
    if (!hasAnyDays) return;

    // Collect all unique days from all segments
    const allDays = [...new Set(scheduleSegments.flatMap(seg => seg.days || []))].sort((a, b) => a - b);

    // TODO: Implement schedule storage and activation
    // For now, just log the schedule
    console.log('Starting schedule:', {
        blocklistId: selectedBlocklistId,
        blocklistName: blocklist.name,
        segments: scheduleSegments,
        repeatType: scheduleRepeatType,
        repeatDate: scheduleRepeatDate
    });

    // Show feedback
    alert(`Schedule created for "${blocklist.name}"!\n\nDays: ${allDays.map(d => ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][d]).join(', ')}\nSegments: ${scheduleSegments.length}\nRepeat: ${scheduleRepeatType}`);
}
// Handle time picker change
function handleTimeChange() {
    const noBlocksMsg = document.getElementById('no-blocks-message');
    const startBtn = document.getElementById('start-block-btn');
    const nextDayIndicator = document.getElementById('next-day-indicator');

    // Remove any existing preview blocks
    document.querySelectorAll('.calendar-block.preview').forEach(el => el.remove());

    // Handle schedule mode separately
    if (isScheduleMode) {
        renderSchedulePreview();
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

    startBtn.disabled = !selectedBlocklistId;
    if (noBlocksMsg) {
        noBlocksMsg.classList.add('hidden');
    }

    // Create preview block in week calendar
    const blocklist = appData.blocklists.find(bl => bl.id === selectedBlocklistId);
    if (blocklist && currentWeekStart) {
        renderPreviewBlock(blockStart, blockEnd, blocklist);
    }

    updateWindowHeight();
}

// Render schedule preview blocks on the calendar
function renderSchedulePreview() {
    if (!selectedBlocklistId || !currentWeekStart) return;

    const blocklist = appData.blocklists.find(bl => bl.id === selectedBlocklistId);
    if (!blocklist) return;

    // For each segment, render blocks on its specific days
    scheduleSegments.forEach((segment, segmentIndex) => {
        // Get the days for this segment
        const segmentDays = segment.days || [];

        segmentDays.forEach(dayIndex => {
            // Calculate the date for this day in the current week
            const dayDate = new Date(currentWeekStart);
            dayDate.setDate(dayDate.getDate() + dayIndex);

            // For repeating schedules, check if outside the "until" date
            if (scheduleRepeatType === 'date' && scheduleRepeatDate && dayDate > scheduleRepeatDate) {
                return;
            }

            const blockStart = new Date(dayDate);
            blockStart.setHours(segment.startHour, segment.startMinute, 0, 0);

            const blockEnd = new Date(dayDate);
            blockEnd.setHours(segment.endHour, segment.endMinute, 0, 0);

            // Handle overnight blocks
            if (blockEnd <= blockStart) {
                blockEnd.setDate(blockEnd.getDate() + 1);
            }

            renderPreviewBlock(blockStart, blockEnd, blocklist, true, segmentIndex);
        });
    });
}

// Render preview block on week calendar
function renderPreviewBlock(blockStart, blockEnd, blocklist, skipClear = false, segmentIndex = null) {
    // Clear any existing preview blocks first (unless rendering multiple schedule blocks)
    if (!skipClear) {
        document.querySelectorAll('.calendar-block.preview').forEach(el => el.remove());
    }

    const startDay = new Date(blockStart);
    startDay.setHours(0, 0, 0, 0);

    const endDay = new Date(blockEnd);
    endDay.setHours(0, 0, 0, 0);

    // Render preview in each day it spans
    let currentDay = new Date(startDay);

    while (currentDay <= endDay) {
        const dateStr = currentDay.toISOString().split('T')[0];
        const track = document.querySelector(`.day-track[data-date="${dateStr}"]`);

        if (track) {
            // Calculate start time for this day segment
            const dayStart = new Date(currentDay);
            dayStart.setHours(0, 0, 0, 0);
            const dayEnd = new Date(currentDay);
            dayEnd.setHours(23, 59, 59, 999);

            const segmentStart = Math.max(blockStart.getTime(), dayStart.getTime());
            const segmentEnd = Math.min(blockEnd.getTime(), dayEnd.getTime());

            const startMinutes = new Date(segmentStart).getHours() * 60 + new Date(segmentStart).getMinutes();
            const endMinutes = new Date(segmentEnd).getHours() * 60 + new Date(segmentEnd).getMinutes();

            // Calculate position (40px per hour)
            const topPosition = (startMinutes / 60) * 40;
            const height = Math.max(20, ((endMinutes - startMinutes) / 60) * 40);

            const previewEl = document.createElement('div');
            previewEl.className = 'calendar-block preview';
            previewEl.style.top = `${topPosition}px`;
            previewEl.style.height = `${height}px`;

            if (segmentIndex !== null) {
                previewEl.dataset.segmentIndex = segmentIndex;
                previewEl.classList.add('interactive');
            }

            if (blocklist.color) {
                previewEl.style.background = blocklist.color;
            }

            // Add resize handles for schedule mode
            const resizeHandles = segmentIndex !== null ? `
                <div class="resize-handle resize-handle-top" data-handle="top"></div>
                <div class="resize-handle resize-handle-bottom" data-handle="bottom"></div>
            ` : '';

            previewEl.innerHTML = `
                ${resizeHandles}
                <span class="block-emoji">${blocklist.emoji || '🚫'}</span>
                <span class="block-label">${escapeHtml(blocklist.name)}</span>
                <span class="block-time">${formatTime(new Date(segmentStart))} - ${formatTime(new Date(segmentEnd))}</span>
            `;

            // Attach drag/resize event handlers for schedule mode
            if (segmentIndex !== null && isScheduleMode) {
                attachPreviewBlockDragHandlers(previewEl, segmentIndex, track);
            }

            track.appendChild(previewEl);
        }

        // Move to next day
        currentDay.setDate(currentDay.getDate() + 1);
    }
}
// Attach drag and resize handlers to a preview block
function attachPreviewBlockDragHandlers(previewEl, segmentIndex, track) {
    let isDragging = false;
    let isResizing = false;
    let resizeHandle = null;
    let startY = 0;
    let startX = 0;
    let startTop = 0;
    let startHeight = 0;
    let startDayIndex = null;
    let currentHoverTrack = track;
    const pixelsPerHour = 40;
    const snapMinutes = 15; // Snap to 15-minute intervals

    // Get the day index from the track's date
    function getDayIndexFromTrack(trackEl) {
        const dateStr = trackEl.dataset.date;
        if (!dateStr) return null;
        const date = new Date(dateStr);
        // Convert JS day (0=Sun) to our format (0=Mon)
        const jsDay = date.getDay();
        return jsDay === 0 ? 6 : jsDay - 1;
    }

    // Get the original day this block represents
    startDayIndex = getDayIndexFromTrack(track);

    // Convert pixels to minutes
    function pixelsToMinutes(px) {
        return (px / pixelsPerHour) * 60;
    }

    // Snap minutes to nearest interval
    function snapToInterval(minutes) {
        return Math.round(minutes / snapMinutes) * snapMinutes;
    }

    // Convert minutes to hours/minutes object
    function minutesToTime(totalMinutes) {
        totalMinutes = Math.max(0, Math.min(1440, totalMinutes)); // Clamp to 0-24 hours
        const hours = Math.floor(totalMinutes / 60);
        const minutes = totalMinutes % 60;
        return { hours: Math.min(23, hours), minutes };
    }

    // Update segment times and optionally days, then refresh UI
    function updateSegmentTimesAndDays(newStartMinutes, newEndMinutes, dayShift = 0) {
        const startTime = minutesToTime(newStartMinutes);
        const endTime = minutesToTime(newEndMinutes);

        // Ensure minimum duration of 15 minutes
        if (newEndMinutes - newStartMinutes < 15) {
            return;
        }

        scheduleSegments[segmentIndex].startHour = startTime.hours;
        scheduleSegments[segmentIndex].startMinute = startTime.minutes;
        scheduleSegments[segmentIndex].endHour = endTime.hours;
        scheduleSegments[segmentIndex].endMinute = endTime.minutes;

        // If there's a day shift, update the days array
        if (dayShift !== 0) {
            const segment = scheduleSegments[segmentIndex];
            const oldDays = segment.days || [];
            const newDays = oldDays.map(d => {
                let newDay = d + dayShift;
                // Wrap around the week (0-6)
                if (newDay < 0) newDay += 7;
                if (newDay > 6) newDay -= 7;
                return newDay;
            });
            segment.days = newDays;

            // Update the day toggle buttons in the UI
            updateDayToggleUI(segmentIndex);
        }

        // Update the time picker UI
        updateTimePickerUI(segmentIndex);

        // Re-render preview blocks
        document.querySelectorAll('.calendar-block.preview').forEach(el => el.remove());
        renderSchedulePreview();
    }

    // Update time picker buttons to reflect new times
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

    // Update day toggle buttons in the schedule segment UI
    function updateDayToggleUI(index) {
        const segment = scheduleSegments[index];
        const days = segment.days || [];
        const segmentContainer = document.querySelector(`.schedule-segment[data-segment-index="${index}"]`);
        if (!segmentContainer) return;

        const dayButtons = segmentContainer.querySelectorAll('.segment-day-toggle');
        dayButtons.forEach(btn => {
            const dayIndex = parseInt(btn.dataset.day);
            if (days.includes(dayIndex)) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
    }

    // Add hover listeners to resize handles to change cursor
    const resizeHandles = previewEl.querySelectorAll('.resize-handle');
    resizeHandles.forEach(handle => {
        handle.addEventListener('mouseenter', () => {
            previewEl.classList.add('resize-hover');
        });
        handle.addEventListener('mouseleave', () => {
            previewEl.classList.remove('resize-hover');
        });
    });

    // Mouse down handler
    previewEl.addEventListener('mousedown', (e) => {
        // Check if clicking on a resize handle
        const handle = e.target.closest('.resize-handle');
        if (handle) {
            isResizing = true;
            resizeHandle = handle.dataset.handle;
            previewEl.classList.add('resizing');
            document.body.style.cursor = 'ns-resize';
        } else {
            isDragging = true;
            previewEl.classList.add('dragging');
            document.body.style.cursor = 'grabbing';
        }

        startY = e.clientY;
        startX = e.clientX;
        startTop = parseFloat(previewEl.style.top) || 0;
        startHeight = parseFloat(previewEl.style.height) || 40;
        currentHoverTrack = track;

        e.preventDefault();

        // Add mouse move and up handlers to document
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
    });

    function handleMouseMove(e) {
        const deltaY = e.clientY - startY;

        if (isDragging) {
            // Find all preview blocks for this segment
            const allSegmentBlocks = document.querySelectorAll(`.calendar-block.preview[data-segment-index="${segmentIndex}"]`);

            // Move all blocks vertically together
            const newTop = Math.max(0, startTop + deltaY);
            const maxTop = (24 * pixelsPerHour) - parseFloat(previewEl.style.height);
            const finalTop = Math.min(newTop, maxTop);

            allSegmentBlocks.forEach(block => {
                block.style.top = `${finalTop}px`;
                block.classList.add('dragging');
            });

            // Check if mouse is over a different day track - move all blocks together horizontally
            const allTracks = Array.from(document.querySelectorAll('.day-track'));
            let targetTrackIndex = -1;

            for (let i = 0; i < allTracks.length; i++) {
                const rect = allTracks[i].getBoundingClientRect();
                if (e.clientX >= rect.left && e.clientX <= rect.right) {
                    targetTrackIndex = i;
                    currentHoverTrack = allTracks[i];
                    break;
                }
            }

            if (targetTrackIndex >= 0) {
                // Calculate day shift from original track position
                const originalTrackIndex = allTracks.indexOf(track);
                const dayShiftDuringDrag = targetTrackIndex - originalTrackIndex;

                // Move all segment blocks to their shifted day positions
                allSegmentBlocks.forEach(block => {
                    // Get this block's original track (stored as data attribute or calculate from current position)
                    if (!block.dataset.originalTrackIndex) {
                        block.dataset.originalTrackIndex = allTracks.indexOf(block.parentElement);
                    }
                    const blockOriginalIndex = parseInt(block.dataset.originalTrackIndex);
                    const newTrackIndex = blockOriginalIndex + dayShiftDuringDrag;

                    // Move block to new track if in valid range
                    if (newTrackIndex >= 0 && newTrackIndex < allTracks.length) {
                        if (allTracks[newTrackIndex] !== block.parentElement) {
                            allTracks[newTrackIndex].appendChild(block);
                        }
                    }
                });
            }
        } else if (isResizing) {
            // Find all preview blocks for this segment
            const allSegmentBlocks = document.querySelectorAll(`.calendar-block.preview[data-segment-index="${segmentIndex}"]`);

            if (resizeHandle === 'top') {
                // Resize from top - adjust start time
                const newTop = Math.max(0, startTop + deltaY);
                const newHeight = startHeight - deltaY;
                if (newHeight >= 10) { // Minimum height
                    allSegmentBlocks.forEach(block => {
                        block.style.top = `${newTop}px`;
                        block.style.height = `${newHeight}px`;
                    });
                }
            } else if (resizeHandle === 'bottom') {
                // Resize from bottom - adjust end time
                const newHeight = Math.max(10, startHeight + deltaY);
                const maxHeight = (24 * pixelsPerHour) - startTop;
                const finalHeight = Math.min(newHeight, maxHeight);
                allSegmentBlocks.forEach(block => {
                    block.style.height = `${finalHeight}px`;
                });
            }
        }
    }

    function handleMouseUp(e) {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);

        // Remove classes and data from all blocks in this segment
        const allSegmentBlocks = document.querySelectorAll(`.calendar-block.preview[data-segment-index="${segmentIndex}"]`);
        allSegmentBlocks.forEach(block => {
            block.classList.remove('dragging');
            block.classList.remove('resizing');
            delete block.dataset.originalTrackIndex;
        });
        document.body.style.cursor = '';

        if (isDragging || isResizing) {
            // Calculate new times based on final position
            const finalTop = parseFloat(previewEl.style.top) || 0;
            const finalHeight = parseFloat(previewEl.style.height) || 40;

            const newStartMinutes = snapToInterval(pixelsToMinutes(finalTop));
            const newEndMinutes = snapToInterval(pixelsToMinutes(finalTop + finalHeight));

            // Calculate day shift if block was moved to different day
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
    selectedBlocklistId = e.target.value || null;
    const timePicker = document.getElementById('time-picker-container');
    const passwordHint = document.getElementById('password-hint');
    const selectionPrompt = document.getElementById('selection-prompt');
    const startBlockBtn = document.getElementById('start-block-btn');
    const startScheduleBtn = document.getElementById('start-schedule-btn');
    const modeTabs = document.querySelector('.scheduler-mode-tabs');

    if (selectedBlocklistId) {
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
                // Update button text with blocklist name
                const blocklist = appData.blocklists.find(bl => bl.id === selectedBlocklistId);
                if (blocklist) {
                    const btnName = startBlockBtn.querySelector('.btn-name');
                    if (btnName) {
                        btnName.textContent = blocklist.name;
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
    }

    // Update visual selection state on blocklist cards
    renderBlocklists();

    handleTimeChange(); // Update button state and preview

    // Wait for DOM reflow to capture the correct height after showing/hiding elements
    setTimeout(() => {
        updateWindowHeight();
    }, 50);
}

// Show start block confirmation modal
function startBlock() {
    if (!selectedBlocklistId) return;

    const blocklist = appData.blocklists.find(bl => bl.id === selectedBlocklistId);
    if (!blocklist) return;

    // Get times for display
    let blockStart = getStartTimeAsDate();
    let blockEnd = getEndTimeAsDate();
    if (blockEnd <= blockStart) {
        blockEnd.setDate(blockEnd.getDate() + 1);
    }

    // Calculate duration for display
    const durationMs = blockEnd.getTime() - blockStart.getTime();
    const durationMinutes = Math.round(durationMs / 60000);
    const hours = Math.floor(durationMinutes / 60);
    const mins = durationMinutes % 60;
    let durationText = '';
    if (hours > 0 && mins > 0) {
        durationText = `${hours}h ${mins}m`;
    } else if (hours > 0) {
        durationText = `${hours} hour${hours > 1 ? 's' : ''}`;
    } else {
        durationText = `${mins} minute${mins > 1 ? 's' : ''}`;
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

    if (!blocklist.apps || blocklist.apps.length === 0) {
        appsRowEl.classList.add('hidden');
    } else {
        appsRowEl.classList.remove('hidden');
        if (blocklist.apps.length <= 3) {
            appsValueEl.textContent = blocklist.apps.join(', ');
            showAllAppsBtn.classList.add('hidden');
        } else {
            appsValueEl.textContent = blocklist.apps.slice(0, 3).join(', ') + ', ...';
            showAllAppsBtn.classList.remove('hidden');
            showAllAppsBtn.onclick = () => {
                appsValueEl.textContent = blocklist.apps.join(', ');
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
}

// Actually start a block (called after confirmation)
async function proceedWithBlock() {
    // Close confirmation modal
    closeStartBlockConfirmModal();

    const startBtn = document.getElementById('start-block-btn');

    if (!selectedBlocklistId) return;

    // Get times from the custom time picker
    let blockStart = getStartTimeAsDate();
    let blockEnd = getEndTimeAsDate();

    // If end is before or equal to start, assume end is next day
    if (blockEnd <= blockStart) {
        blockEnd.setDate(blockEnd.getDate() + 1);
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

    const block = {
        id: generateId(),
        blocklistId: selectedBlocklistId,
        startTime: blockStart.getTime(),
        endTime: blockEnd.getTime()
    };

    let result;

    // Try to use the helper daemon (no password required!)
    if (helperAvailable) {
        result = await tauriAPI.startBlockViaHelper({
            domains: blocklist.websites || [],
            endTime: blockEnd.getTime(),
            blocklistId: selectedBlocklistId
        });
    } else {
        // Helper not available - check if it's installed but just not detected
        const status = await tauriAPI.checkHelperStatus();

        if (status.running) {
            // It's running, use it
            helperAvailable = true;
            result = await tauriAPI.startBlockViaHelper({
                domains: blocklist.websites || [],
                endTime: blockEnd.getTime(),
                blocklistId: selectedBlocklistId
            });
        } else {
            // Helper not running - show the install modal
            pendingBlockData = {
                block,
                blocklist,
                blockEnd
            };
            document.getElementById('helper-install-modal').classList.remove('hidden');

            // Re-enable button and return - modal will handle the rest
            startBtn.disabled = false;
            startBtn.innerHTML = getStartBlockButtonHTML();
            return;
        }
    }

    if (!result.success) {
        // Re-enable button
        startBtn.disabled = false;
        startBtn.innerHTML = getStartBlockButtonHTML();

        // Only show error if user didn't cancel
        if (!result.cancelled) {
            alert('Could not start block: ' + (result.error || 'Unknown error'));
        }
        return;
    }

    // Add block to local data if using helper (which manages its own state)
    if (helperAvailable) {
        appData.activeBlocks.push(block);
        activatedBlockIds.add(block.id);
    }

    // Save data and reset UI
    await saveData();

    // Notify main process to refresh blocked apps list
    tauriAPI.refreshBlockedApps();

    // Start app blocking if this blocklist has apps
    if (blocklist.apps && blocklist.apps.length > 0) {
        console.log('Starting process watcher for apps:', blocklist.apps);
        await tauriAPI.setBlockedApps(blocklist.apps);
        await tauriAPI.startProcessWatcher();
        // Initial sweep: hide any already-open blocked apps
        await tauriAPI.hideAllBlockedApps();
    }

    // Reset dropdown and let handleBlocklistSelect handle the UI hiding/reset
    const blocklistSelect = document.getElementById('blocklist-select');
    blocklistSelect.value = '';
    handleBlocklistSelect({ target: blocklistSelect });

    // Button state is already Reset by handleTimeChange called inside handleBlocklistSelect
    // but let's ensure text is back to original
    startBtn.innerHTML = getStartBlockButtonHTML();

    render();
}

// Helper function for start block button HTML
function getStartBlockButtonHTML() {
    return `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
        </svg>
        Start Block
    `;
}

// Handle the Proceed button in the helper install modal
async function proceedWithHelperInstall() {
    const modal = document.getElementById('helper-install-modal');
    const proceedBtn = document.getElementById('proceed-helper-install-btn');

    // Disable button while installing with spinner
    proceedBtn.disabled = true;
    proceedBtn.innerHTML = '<span class="btn-spinner"></span>Installing...';

    // Try to install the helper
    const installResult = await tauriAPI.installHelper();

    if (installResult.success) {
        // Check if the helper is actually running
        if (!installResult.running) {
            // Helper installed but not running yet - this is the bug scenario
            // Wait a bit more and try again
            proceedBtn.innerHTML = '<span class="btn-spinner"></span>Starting helper...';

            // Additional wait with status check
            let helperReady = false;
            for (let i = 0; i < 5; i++) {
                await new Promise(resolve => setTimeout(resolve, 1000));
                const status = await tauriAPI.checkHelperStatus();
                if (status.running) {
                    helperReady = true;
                    break;
                }
            }

            if (!helperReady) {
                // Still not running - show a helpful error
                proceedBtn.disabled = false;
                proceedBtn.textContent = 'Proceed';
                alert('The helper was installed but is not running yet. Please try again, or restart your computer if the problem persists.');
                return;
            }
        }

        helperAvailable = true;
        modal.classList.add('hidden');

        // Now start the pending block
        if (pendingBlockData) {
            const { block, blocklist, blockEnd } = pendingBlockData;

            const result = await tauriAPI.startBlockViaHelper({
                domains: blocklist.websites || [],
                endTime: blockEnd.getTime(),
                blocklistId: blocklist.id
            });

            if (result.success) {
                // Add block to local data
                appData.activeBlocks.push(block);
                activatedBlockIds.add(block.id);
                await saveData();

                // Reset UI
                const blocklistSelect = document.getElementById('blocklist-select');
                blocklistSelect.value = '';
                handleBlocklistSelect({ target: blocklistSelect });


                render();
            } else {
                alert('Could not start block: ' + (result.error || 'Unknown error'));
            }

            pendingBlockData = null;
        }
    } else {
        // Installation failed
        if (!installResult.error?.includes('Permission denied')) {
            alert('Could not install helper: ' + (installResult.error || 'Unknown error'));
        }
    }

    // Re-enable button
    proceedBtn.disabled = false;
    proceedBtn.textContent = 'Proceed';
}

// Update hosts file based on active blocks
// silent = true means don't prompt for password (used for cleanup)
async function updateHostsFile(silent = false) {
    const allDomains = new Set();
    const now = Date.now();

    // Only block domains for blocks that are currently active (startTime <= now && endTime > now)
    appData.activeBlocks
        .filter(block => block.startTime <= now && block.endTime > now)
        .forEach(block => {
            const blocklist = appData.blocklists.find(bl => bl.id === block.blocklistId);
            if (blocklist && blocklist.websites) {
                blocklist.websites.forEach(domain => allDomains.add(domain));
            }
        });

    // Check if domains actually changed
    const domainsArray = Array.from(allDomains).sort();
    const lastDomainsArray = Array.from(lastBlockedDomains).sort();
    const domainsChanged = JSON.stringify(domainsArray) !== JSON.stringify(lastDomainsArray);

    if (!domainsChanged) {
        return { success: true, unchanged: true };
    }

    // For silent updates (cleanup), skip if it would require password
    if (silent && allDomains.size < lastBlockedDomains.size) {
        // Domains are being removed - this still needs sudo unfortunately
        // For now, we'll defer cleanup until the app is explicitly used
        return { success: true, deferred: true };
    }

    // Try to use helper daemon first (works on all platforms)
    try {
        console.log('[updateHostsFile] Checking helper status...');
        const status = await tauriAPI.checkHelperStatus();
        console.log('[updateHostsFile] Helper status:', status);

        if (status.running) {
            console.log('[updateHostsFile] Helper running, using helper to update blocks');
            helperAvailable = true;

            if (domainsArray.length === 0) {
                // Clear all blocks via helper
                const result = await tauriAPI.clearBlockViaHelper();
                if (result && result.success) {
                    lastBlockedDomains = allDomains;
                    // Also notify main process to refresh blocked apps list
                    tauriAPI.refreshBlockedApps();
                    // Stop the process watcher since all blocks are cleared
                    await tauriAPI.stopProcessWatcher();
                }
                return result || { success: true };
            } else {
                // Find the latest end time among active blocks
                const latestEndTime = Math.max(...appData.activeBlocks
                    .filter(b => b.startTime <= now && b.endTime > now)
                    .map(b => b.endTime));

                const result = await tauriAPI.startBlockViaHelper({
                    domains: domainsArray,
                    endTime: latestEndTime,
                    blocklistId: 'combined' // Multiple blocklists combined
                });
                if (result && result.success) {
                    lastBlockedDomains = allDomains;
                }
                return result || { success: true };
            }
        } else {
            console.log('[updateHostsFile] Helper NOT running, falling back');
        }
    } catch (e) {
        console.warn('Helper not available, falling back to direct method:', e);
    }

    // Fallback to direct hosts file modification (macOS)
    console.log('[updateHostsFile] Calling fallback block-websites');
    const result = await tauriAPI.blockWebsites(domainsArray);

    if (result && result.success) {
        lastBlockedDomains = allDomains;
    }

    return result || { success: true };
}


// Open blocklist modal
function openBlocklistModal(blocklist = null) {
    editingBlocklistId = blocklist?.id || null;

    document.getElementById('modal-title').textContent = blocklist ? 'Edit Blocklist' : 'Create Blocklist';

    document.getElementById('blocklist-name').value = blocklist?.name || '';

    document.getElementById('override-type').value = blocklist?.overrideDifficulty?.type || 'random-words';
    document.getElementById('override-count').value = blocklist?.overrideDifficulty?.count || 10;
    document.getElementById('custom-override-text').value = blocklist?.overrideDifficulty?.customText || '';

    const type = blocklist?.overrideDifficulty?.type || 'random-words';
    const customTextArea = document.getElementById('custom-override-text');
    const overrideCountWrapper = document.getElementById('override-count-wrapper');
    const hintEl = document.getElementById('override-count-hint');

    if (type === 'custom') {
        customTextArea.classList.remove('hidden');
        overrideCountWrapper.classList.add('hidden');
        hintEl.classList.add('hidden');
    } else {
        customTextArea.classList.add('hidden');
        overrideCountWrapper.classList.remove('hidden');
        hintEl.classList.remove('hidden');

        if (type === 'random-words') {
            hintEl.innerHTML = "E.g. 10 chars → 'shine great'";
        } else {
            hintEl.innerHTML = "E.g. 10 chars → 'a982j3+fd'";
        }
    }

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
            // Fallback default
            colorToSelect = 'linear-gradient(135deg, #4a00e0 0%, #8e2de2 100%)';
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

    // Check if active
    const isActive = blocklist?.id && appData.activeBlocks.some(b => b.blocklistId === blocklist.id);
    const warningEl = document.getElementById('active-blocklist-warning');
    const modeInputs = document.getElementById('blocklist-modal').querySelectorAll('.radio-option');
    const overrideInputs = [
        document.getElementById('override-type'),
        document.getElementById('override-count'),
        document.getElementById('custom-override-text')
    ];

    if (isActive) {
        warningEl.classList.remove('hidden');
        modeInputs.forEach(el => el.classList.add('disabled'));
        overrideInputs.forEach(el => el.disabled = true);
        // Pass existing items as locked
        window.setModalData(blocklist.websites || [], blocklist.apps || [], blocklist.websites || [], blocklist.apps || []);
    } else {
        warningEl.classList.add('hidden');
        modeInputs.forEach(el => el.classList.remove('disabled'));
        overrideInputs.forEach(el => el.disabled = false);
        window.setModalData(blocklist?.websites || [], blocklist?.apps || [], [], []);
    }

    document.getElementById('blocklist-modal').classList.remove('hidden');

    // Reset scroll position after modal is shown
    const modalContent = document.querySelector('#blocklist-modal .modal-content');
    if (modalContent) modalContent.scrollTop = 0;
}

// Close blocklist modal
function closeBlocklistModal() {
    document.getElementById('blocklist-modal').classList.add('hidden');
    editingBlocklistId = null;
    document.getElementById('blocklist-name').value = '';
    window.setModalData([], []);
}

// Open override modal
function openOverrideModal(blockId) {
    overrideBlockId = blockId;

    const block = appData.activeBlocks.find(b => b.id === blockId);
    const blocklist = appData.blocklists.find(bl => bl.id === block?.blocklistId);

    if (!blocklist) return;

    // Set modal title with blocklist name
    document.getElementById('override-modal-title').textContent = `Override ${blocklist.name}?`;

    // Set summary text
    const websiteCount = blocklist.websites?.length || 0;
    const appCount = blocklist.apps?.length || 0;
    const mode = blocklist.mode === 'allowlist' ? 'Allows' : 'Blocks';

    let metaParts = [];

    if (websiteCount > 0) {
        const displaySites = blocklist.websites.map(cleanUrlForDisplay);
        if (websiteCount <= 2) {
            metaParts.push(`${websiteCount} ${websiteCount === 1 ? 'website' : 'websites'} (${displaySites.join(', ')})`);
        } else {
            metaParts.push(`${websiteCount} websites (${displaySites.slice(0, 2).join(', ')}, ...)`);
        }
    }

    if (appCount > 0) {
        if (appCount <= 2) {
            metaParts.push(`${appCount} ${appCount === 1 ? 'app' : 'apps'} (${blocklist.apps.join(', ')})`);
        } else {
            metaParts.push(`${appCount} apps (${blocklist.apps.slice(0, 2).join(', ')}, ...)`);
        }
    }

    const itemsText = metaParts.length > 0 ? metaParts.join(' and ') : 'nothing';
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
    challengeText = '';
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

// Delete blocklist with undo support
let pendingDelete = null; // { blocklist, activeBlocks, timeoutId }

async function deleteBlocklist(id) {
    const blocklist = appData.blocklists.find(bl => bl.id === id);
    if (!blocklist) return;

    // Check if this blocklist has an active block running
    const now = Date.now();
    const hasActiveBlock = appData.activeBlocks.some(
        block => block.blocklistId === id && block.startTime <= now && block.endTime > now
    );

    if (hasActiveBlock) {
        alert(`Cannot delete "${blocklist.name}" while a block is running. Override the block first.`);
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
    // Show onboarding if not complete - window size is set in main.js
    if (!appData.settings.onboardingComplete) {
        document.getElementById('onboarding-screen').classList.remove('hidden');
        document.getElementById('main-content').classList.add('hidden');
        return;
    }

    document.getElementById('onboarding-screen').classList.add('hidden');
    document.getElementById('main-content').classList.remove('hidden');

    // Initialize currentWeekStart if not set
    if (!currentWeekStart) {
        currentWeekStart = getWeekStart(new Date());
    }

    updateWeekCalendar();
    renderWeekBlocks();
    renderBlocklistSelector();

    // Auto-select if there's only one available (non-active) blocklist
    if (!selectedBlocklistId) {
        const activeIds = appData.activeBlocks.map(b => b.blocklistId);
        const availableBlocklists = appData.blocklists.filter(bl => !activeIds.includes(bl.id));
        if (availableBlocklists.length === 1) {
            const dropdown = document.getElementById('blocklist-select');
            dropdown.value = availableBlocklists[0].id;
            handleBlocklistSelect({ target: dropdown });
        }
    }

    renderBlocklists();

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

// Get the Monday of the week containing the given date
function getWeekStart(date) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is Sunday
    d.setDate(diff);
    d.setHours(0, 0, 0, 0);
    return d;
}

// Format week display string like "Mon 26 Jan - Sun 1 Feb"
function formatWeekDisplay(start, end) {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    const startDay = days[start.getDay()];
    const startDate = start.getDate();
    const startMonth = months[start.getMonth()];

    const endDay = days[end.getDay()];
    const endDate = end.getDate();
    const endMonth = months[end.getMonth()];

    // Include year if different from current
    const currentYear = new Date().getFullYear();
    const startYear = start.getFullYear();
    const endYear = end.getFullYear();

    if (startMonth === endMonth && startYear === endYear) {
        const yearSuffix = startYear !== currentYear ? ` ${startYear}` : '';
        return `${startDay} ${startDate} - ${endDay} ${endDate} ${startMonth}${yearSuffix}`;
    } else if (startYear === endYear) {
        const yearSuffix = startYear !== currentYear ? ` ${startYear}` : '';
        return `${startDay} ${startDate} ${startMonth} - ${endDay} ${endDate} ${endMonth}${yearSuffix}`;
    } else {
        return `${startDay} ${startDate} ${startMonth} ${startYear} - ${endDay} ${endDate} ${endMonth} ${endYear}`;
    }
}

// Navigate to previous/next week
function navigateWeek(direction) {
    if (!currentWeekStart) {
        currentWeekStart = getWeekStart(new Date());
    }

    currentWeekStart.setDate(currentWeekStart.getDate() + (direction * 7));
    updateWeekCalendar();
    renderWeekBlocks();
    handleTimeChange(); // Re-render preview block after navigation
}

// Scroll to today's column and current time
function scrollToToday(smooth = true) {
    const today = new Date();
    const todayStart = getWeekStart(today);

    // If today is not in the current week, navigate to it first
    if (currentWeekStart.getTime() !== todayStart.getTime()) {
        currentWeekStart = todayStart;
        updateWeekCalendar();
        renderWeekBlocks();
        handleTimeChange(); // Re-render preview block after navigation
    }

    const scrollContainer = document.querySelector('.week-calendar-scroll');
    if (!scrollContainer) return;

    // Scroll to today's column (horizontal)
    const todayColumn = document.querySelector('.day-column.today');
    const headerTimeSpacerWidth = 50; // width of time spacer in header

    if (todayColumn) {
        // Calculate horizontal scroll: offset from left of content area
        const scrollTargetX = todayColumn.offsetLeft + headerTimeSpacerWidth - scrollContainer.offsetWidth / 2 + todayColumn.offsetWidth / 2;

        // Scroll vertically to 2 hours before current time
        // Header row is sticky at 28px, content starts below it
        const currentHour = today.getHours();
        const targetHour = Math.max(0, currentHour - 2); // 2 hours before, min 0
        const headerRowHeight = 28; // sticky header height
        const scrollTargetY = headerRowHeight + (targetHour * 40); // 40px per hour

        if (smooth) {
            scrollContainer.scrollTo({ left: scrollTargetX, top: scrollTargetY, behavior: 'smooth' });
        } else {
            scrollContainer.scrollLeft = scrollTargetX;
            scrollContainer.scrollTop = scrollTargetY;
        }
    }
}

// Legacy function name for compatibility
function scrollToNow(smooth = true) {
    scrollToToday(smooth);
}

// Update week calendar display
function updateWeekCalendar() {
    const timeAxis = document.getElementById('time-axis');
    const daysContainer = document.getElementById('days-container');
    const headerDays = document.getElementById('header-days');

    if (!timeAxis || !daysContainer) return;

    // Generate time axis (no header spacer - it's in the header row now)
    timeAxis.innerHTML = '';

    const now = new Date();
    const currentHour = now.getHours();

    for (let h = 0; h < 24; h++) {
        const marker = document.createElement('div');
        marker.className = h === currentHour ? 'time-marker current-hour' : 'time-marker';
        marker.textContent = `${String(h).padStart(2, '0')}:00`;
        timeAxis.appendChild(marker);
    }

    // Generate day columns - render 21 days (3 weeks) for open-ended scrolling
    // currentWeekStart represents the "anchor" week, we show 1 week before and 1 week after
    if (headerDays) headerDays.innerHTML = '';
    daysContainer.innerHTML = '';
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Start 7 days before currentWeekStart
    const renderStart = new Date(currentWeekStart);
    renderStart.setDate(renderStart.getDate() - 7);

    for (let d = 0; d < 21; d++) {
        const dayDate = new Date(renderStart);
        dayDate.setDate(dayDate.getDate() + d);

        const isToday = dayDate.getTime() === today.getTime();
        const dayOfWeek = dayDate.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

        // Day header cell (in sticky header row)
        if (headerDays) {
            const headerCell = document.createElement('div');
            headerCell.className = 'day-header-cell';
            if (isToday) headerCell.classList.add('today');
            if (isWeekend) headerCell.classList.add('weekend');
            headerCell.textContent = `${dayNames[dayOfWeek]} ${dayDate.getDate()}`;
            headerDays.appendChild(headerCell);
        }

        // Day column (no header - headers are in separate row)
        const column = document.createElement('div');
        column.className = 'day-column';
        if (isToday) column.classList.add('today');
        if (isWeekend) column.classList.add('weekend');
        column.dataset.date = dayDate.toISOString().split('T')[0];

        // Hour cells
        for (let h = 0; h < 24; h++) {
            const cell = document.createElement('div');
            cell.className = 'hour-cell';
            cell.dataset.hour = h;
            column.appendChild(cell);
        }

        // Day track for blocks
        const track = document.createElement('div');
        track.className = 'day-track';
        track.dataset.date = dayDate.toISOString().split('T')[0];
        column.appendChild(track);

        // Now indicator for today (no header offset - starts at top of column)
        if (isToday) {
            const nowIndicator = document.createElement('div');
            nowIndicator.className = 'now-indicator';
            nowIndicator.id = 'now-indicator';
            const nowMinutes = now.getHours() * 60 + now.getMinutes();
            const topPosition = (nowMinutes / 60) * 40; // hours * 40px per hour
            nowIndicator.style.top = `${topPosition}px`;
            column.appendChild(nowIndicator);
        }

        daysContainer.appendChild(column);
    }

    // Update visible range display after render
    updateVisibleRangeDisplay();
}

// Update the displayed date range based on visible columns
function updateVisibleRangeDisplay() {
    const scrollContainer = document.querySelector('.week-calendar-scroll');
    const weekDisplay = document.getElementById('week-display');
    const dayColumns = document.querySelectorAll('.day-column');

    if (!scrollContainer || !weekDisplay || dayColumns.length === 0) return;

    const scrollLeft = scrollContainer.scrollLeft;
    const containerWidth = scrollContainer.clientWidth;
    const timeAxisWidth = 50; // Width of time axis

    // Find first and last visible columns
    let firstVisible = null;
    let lastVisible = null;

    dayColumns.forEach(column => {
        const columnLeft = column.offsetLeft - timeAxisWidth;
        const columnRight = columnLeft + column.offsetWidth;

        // Column is visible if it overlaps the viewport
        if (columnRight > scrollLeft && columnLeft < scrollLeft + containerWidth) {
            if (!firstVisible) firstVisible = column;
            lastVisible = column;
        }
    });

    if (firstVisible && lastVisible) {
        const startDate = new Date(firstVisible.dataset.date);
        const endDate = new Date(lastVisible.dataset.date);
        weekDisplay.textContent = formatWeekDisplay(startDate, endDate);
    }
}
// Render active blocks on week calendar
function renderWeekBlocks() {
    const noBlocksMsg = document.getElementById('no-blocks-message');
    const now = Date.now();

    // Clear existing blocks from all day tracks
    document.querySelectorAll('.day-track').forEach(track => {
        track.innerHTML = '';
    });

    // Filter blocks within the week range
    const weekStart = currentWeekStart.getTime();
    const weekEnd = new Date(currentWeekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);
    const weekEndMs = weekEnd.getTime();

    const visibleBlocks = appData.activeBlocks.filter(block =>
        block.endTime > weekStart && block.startTime < weekEndMs
    );

    if (visibleBlocks.length === 0) {
        noBlocksMsg?.classList.remove('hidden');
    } else {
        noBlocksMsg?.classList.add('hidden');
    }

    // Render each block
    visibleBlocks.forEach(block => {
        const blocklist = appData.blocklists.find(bl => bl.id === block.blocklistId);
        if (!blocklist) return;

        const blockStart = new Date(block.startTime);
        const blockEnd = new Date(block.endTime);
        const isExpired = block.endTime <= now;

        // Determine which day(s) the block spans
        const startDay = new Date(blockStart);
        startDay.setHours(0, 0, 0, 0);

        const endDay = new Date(blockEnd);
        endDay.setHours(0, 0, 0, 0);

        // For simplicity, render block in each day it spans
        let currentDay = new Date(startDay);

        while (currentDay <= endDay) {
            const dateStr = currentDay.toISOString().split('T')[0];
            const track = document.querySelector(`.day-track[data-date="${dateStr}"]`);

            if (track) {
                // Calculate start time for this day segment
                const dayStart = new Date(currentDay);
                dayStart.setHours(0, 0, 0, 0);
                const dayEnd = new Date(currentDay);
                dayEnd.setHours(23, 59, 59, 999);

                const segmentStart = Math.max(block.startTime, dayStart.getTime());
                const segmentEnd = Math.min(block.endTime, dayEnd.getTime());

                const startMinutes = new Date(segmentStart).getHours() * 60 + new Date(segmentStart).getMinutes();
                const endMinutes = new Date(segmentEnd).getHours() * 60 + new Date(segmentEnd).getMinutes();

                // Calculate position (40px per hour, offset by nothing since track starts at hour 0)
                const topPosition = (startMinutes / 60) * 40;
                const height = Math.max(20, ((endMinutes - startMinutes) / 60) * 40);

                const blockEl = document.createElement('div');
                blockEl.className = isExpired ? 'calendar-block expired' : 'calendar-block';
                blockEl.dataset.blockId = block.id;
                blockEl.style.top = `${topPosition}px`;
                blockEl.style.height = `${height}px`;

                if (blocklist.color) {
                    blockEl.style.background = blocklist.color;
                }

                blockEl.innerHTML = `
                    <span class="block-emoji">${blocklist.emoji || '🚫'}</span>
                    <span class="block-label">${escapeHtml(blocklist.name)}</span>
                    <span class="block-time">${formatTime(new Date(segmentStart))} - ${formatTime(new Date(segmentEnd))}</span>
                `;

                // Add click handler for override (only for running blocks)
                if (!isExpired) {
                    blockEl.addEventListener('click', (e) => {
                        e.stopPropagation();
                        openOverrideModal(block.id);
                    });
                }

                track.appendChild(blockEl);
            }

            // Move to next day
            currentDay.setDate(currentDay.getDate() + 1);
        }
    });
}

// Render blocklist selector dropdown
function renderBlocklistSelector() {
    const select = document.getElementById('blocklist-select');
    const currentValue = select.value;
    const activeIds = appData.activeBlocks.map(b => b.blocklistId);

    const newHTML = `
    <option value="">Select a blocklist...</option>
    ${appData.blocklists.map(bl => {
        const isActive = activeIds.includes(bl.id);
        const disabledAttr = isActive ? 'disabled' : '';
        const activeLabel = isActive ? ' (Running)' : '';
        return `<option value="${bl.id}" ${disabledAttr}>${escapeHtml(bl.name)}${activeLabel}</option>`;
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
        <p>No blocklists yet</p>
        <p class="subtle">Click here to create one</p>
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
        const appCount = bl.apps?.length || 0;
        let metaParts = [];

        if (websiteCount > 0) {
            const displaySites = bl.websites.map(cleanUrlForDisplay);
            if (websiteCount <= 2) {
                metaParts.push(`${websiteCount} ${websiteCount === 1 ? 'website' : 'websites'} (${displaySites.join(', ')})`);
            } else {
                metaParts.push(`${websiteCount} websites (${displaySites.slice(0, 2).join(', ')}, ...)`);
            }
        }

        if (appCount > 0) {
            if (appCount <= 2) {
                metaParts.push(`${appCount} ${appCount === 1 ? 'app' : 'apps'} (${bl.apps.join(', ')})`);
            } else {
                metaParts.push(`${appCount} apps (${bl.apps.slice(0, 2).join(', ')}, ...)`);
            }
        }

        const metaText = metaParts.length > 0 ? metaParts.join(' and ') : 'No items';

        // Get color for left border
        // Get color for left border
        const borderColor = bl.color || 'linear-gradient(135deg, #4a00e0 0%, #8e2de2 100%)';

        // Check if this blocklist has an active block
        const now = Date.now();
        const activeBlock = appData.activeBlocks.find(b => b.blocklistId === bl.id && b.startTime <= now && b.endTime > now);
        const isActive = !!activeBlock;
        const activeClass = isActive ? ' blocklist-card-active' : '';

        // Calculate time remaining for active badge
        let activeBadge = '';
        if (isActive && activeBlock) {
            const remaining = activeBlock.endTime - now;
            const mins = Math.ceil(remaining / 60000);
            const timeText = mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins}m`;
            activeBadge = `<span class="active-badge">Active</span><span class="time-remaining">${timeText} left</span>`;
        }

        // Check if this blocklist is selected for starting a block
        const isSelected = bl.id === selectedBlocklistId && !isActive;
        const selectedClass = isSelected ? ' selected' : '';
        const selectedStyle = isSelected ? `style="box-shadow: 0 0 0 2px ${bl.color || '#667eea'}, 0 4px 8px rgba(0, 0, 0, 0.1);"` : '';

        // Dim if something is selected but this one isn't (and it's not active)
        const isDimmed = selectedBlocklistId && !isSelected && !isActive;
        const dimmedClass = isDimmed ? ' dimmed' : '';

        return `
      <div class="blocklist-card${activeClass}${selectedClass}${dimmedClass}" data-id="${bl.id}" data-active="${isActive}" ${selectedStyle} draggable="true">
        <div class="blocklist-stripe" style="background: ${borderColor}"></div>
        <div class="blocklist-info">
          <div class="blocklist-name"><span class="blocklist-emoji">${bl.emoji || '🚫'}</span>${escapeHtml(bl.name)}${activeBadge}</div>
          <div class="blocklist-meta">${escapeHtml(metaText)}</div>
        </div>
        <div class="blocklist-actions">
          ${isActive ? `
          <button class="blocklist-action-btn override-btn" title="Override Block">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="10" y1="15" x2="10" y2="9"></line>
              <line x1="14" y1="15" x2="14" y2="9"></line>
            </svg>
          </button>
          ` : ''}
          <button class="blocklist-action-btn edit-btn" title="Edit">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
            </svg>
          </button>
          <button class="blocklist-action-btn delete" title="Delete">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
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

        // Click card to select it in the dropdown (only if not active)
        card.addEventListener('click', () => {
            if (isActive) return; // Don't select active blocklists
            const dropdown = document.getElementById('blocklist-select');
            dropdown.value = id;
            handleBlocklistSelect({ target: dropdown });
        });

        card.querySelector('.edit-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            const blocklist = appData.blocklists.find(bl => bl.id === id);
            openBlocklistModal(blocklist);
        });

        // Override button (only exists when block is active)
        const overrideBtn = card.querySelector('.override-btn');
        if (overrideBtn) {
            overrideBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                // Find the active block for this blocklist
                const now = Date.now();
                const activeBlock = appData.activeBlocks.find(
                    b => b.blocklistId === id && b.startTime <= now && b.endTime > now
                );
                if (activeBlock) {
                    openOverrideModal(activeBlock.id);
                }
            });
        }

        card.querySelector('.delete').addEventListener('click', (e) => {
            e.stopPropagation();
            deleteBlocklist(id);
        });

        // Drag and drop event handlers
        card.addEventListener('dragstart', (e) => {
            draggedBlocklistId = id;
            card.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
        });

        card.addEventListener('dragend', () => {
            card.classList.remove('dragging');
            draggedBlocklistId = null;
            // Remove drag-over styling from all cards
            document.querySelectorAll('.blocklist-card').forEach(c => {
                c.classList.remove('drag-over');
            });
        });

        card.addEventListener('dragover', (e) => {
            e.preventDefault();
            if (!draggedBlocklistId || draggedBlocklistId === id) return;

            e.dataTransfer.dropEffect = 'move';

            // Live reordering: move the dragged card in the DOM
            const container = document.getElementById('blocklists-container');
            const draggingCard = container.querySelector('.blocklist-card.dragging');
            if (!draggingCard) return;

            // Find where to insert based on mouse Y position
            const afterElement = getDragAfterElement(container, e.clientY);
            if (afterElement == null) {
                container.appendChild(draggingCard);
            } else if (afterElement !== draggingCard) {
                container.insertBefore(draggingCard, afterElement);
            }
        });

        card.addEventListener('drop', (e) => {
            e.preventDefault();
            if (!draggedBlocklistId) return;

            // Save the new order based on DOM positions
            saveBlocklistOrderFromDOM();
        });
    });

    // Also handle dragover on the container for dropping at the end
    const blocklistsContainer = document.getElementById('blocklists-container');
    blocklistsContainer.addEventListener('dragover', (e) => {
        e.preventDefault();
        if (!draggedBlocklistId) return;

        // Only handle if not over a card
        if (e.target.closest('.blocklist-card')) return;

        const draggingCard = blocklistsContainer.querySelector('.blocklist-card.dragging');
        if (draggingCard) {
            blocklistsContainer.appendChild(draggingCard);
        }
    });

    blocklistsContainer.addEventListener('drop', (e) => {
        e.preventDefault();
        if (!draggedBlocklistId) return;
        saveBlocklistOrderFromDOM();
    });
}

// Helper to find insertion point for vertical lists
function getDragAfterElement(container, y) {
    const draggableElements = [...container.querySelectorAll('.blocklist-card:not(.dragging)')];

    return draggableElements.reduce((closest, child) => {
        const box = child.getBoundingClientRect();
        const offset = y - box.top - box.height / 2;

        if (offset < 0 && offset > closest.offset) {
            return { offset: offset, element: child };
        } else {
            return closest;
        }
    }, { offset: Number.NEGATIVE_INFINITY }).element;
}

// Save blocklist order based on DOM position
function saveBlocklistOrderFromDOM() {
    const container = document.getElementById('blocklists-container');
    const cardElements = Array.from(container.querySelectorAll('.blocklist-card'));

    // Build new order from DOM
    const newOrder = cardElements.map(card => card.dataset.id);

    // Reorder appData.blocklists to match
    const reorderedBlocklists = [];
    newOrder.forEach(id => {
        const blocklist = appData.blocklists.find(bl => bl.id === id);
        if (blocklist) {
            reorderedBlocklists.push(blocklist);
        }
    });

    // Add any blocklists that weren't in the DOM (shouldn't happen, but be safe)
    appData.blocklists.forEach(bl => {
        if (!reorderedBlocklists.find(r => r.id === bl.id)) {
            reorderedBlocklists.push(bl);
        }
    });

    appData.blocklists = reorderedBlocklists;
    saveData();
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

    setInterval(async () => {
        const now = Date.now();

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
            // Don't update hosts in tick - it causes password prompts
            // Just re-render the UI
            render();

            // If no more active blocks, stop the process watcher
            if (appData.activeBlocks.length === 0) {
                console.log('All blocks expired, stopping process watcher');
                tauriAPI.stopProcessWatcher();
                tauriAPI.setBlockedApps([]);
            }
        }

        // Update remaining times in UI
        document.querySelectorAll('.entry-remaining').forEach((el, idx) => {
            const block = appData.activeBlocks[idx];
            if (block) {
                const remaining = Math.max(0, Math.ceil((block.endTime - now) / 60000));
                el.textContent = `${formatDuration(remaining)} remaining`;
            }
        });

        // Auto-update end time if user hasn't manually edited it
        if (selectedBlocklistId && !userEditedEndTime) {
            const newEndTime = new Date(now + targetDurationMinutes * 60 * 1000);
            selectedEndHour = newEndTime.getHours();
            selectedEndMinute = newEndTime.getMinutes();
            updateTimeDisplay();
            // Don't call handleTimeChange here to avoid circular updates
        }
    }, 1000);
}

// Utility functions
function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

function formatTime(date) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
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


// Theme Handling
function setupTheme() {
    // Apply initial theme from saved settings
    applyTheme();

    // Toggle button listener
    const toggleBtn = document.getElementById('theme-toggle-btn');
    if (toggleBtn) {
        toggleBtn.addEventListener('click', () => {
            // Initialize settings object if it doesn't exist (safety check)
            if (!appData.settings) appData.settings = {};

            // Toggle boolean
            appData.settings.darkMode = !appData.settings.darkMode;

            // Apply and save
            applyTheme();
            saveData();
        });
    }
}

function applyTheme() {
    const isDark = appData.settings?.darkMode === true;
    const body = document.body;
    const sunIcon = document.querySelector('.sun-icon');
    const moonIcon = document.querySelector('.moon-icon');

    if (isDark) {
        body.classList.add('dark-mode');
        // Show Moon icon in Dark Mode
        sunIcon?.classList.add('hidden');
        moonIcon?.classList.remove('hidden');
    } else {
        body.classList.remove('dark-mode');
        // Show Sun icon in Light Mode
        sunIcon?.classList.remove('hidden');
        moonIcon?.classList.add('hidden');
    }
}
