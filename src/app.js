const { ipcRenderer } = require('electron');

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

// Word list for random word challenges
const wordList = [
    // 1-2 chars
    'a', 'ad', 'am', 'an', 'as', 'at', 'be', 'by', 'do', 'go', 'he', 'hi', 'if', 'in', 'is', 'it', 'me', 'my', 'no', 'of', 'on', 'or', 'so', 'to', 'up', 'us', 'we',
    // 3 chars
    'act', 'add', 'age', 'aim', 'air', 'all', 'and', 'any', 'art', 'ask', 'bad', 'bag', 'bar', 'bat', 'bed', 'bee', 'big', 'bit', 'box', 'boy', 'bus', 'but', 'buy', 'can', 'car', 'cat', 'day', 'die', 'dog', 'dry', 'due', 'eat', 'egg', 'end', 'eye', 'far', 'few', 'fit', 'fly', 'for', 'fun', 'get', 'god', 'got', 'guy', 'hot', 'how', 'ice', 'ill', 'ink', 'job', 'joy', 'key', 'kid', 'law', 'lay', 'leg', 'let', 'lie', 'log', 'lot', 'low', 'man', 'map', 'may', 'men', 'mix', 'net', 'new', 'nod', 'nor', 'not', 'now', 'num', 'off', 'oil', 'old', 'one', 'out', 'own', 'pay', 'pen', 'per', 'pet', 'pie', 'pig', 'pin', 'pot', 'put', 'ran', 'raw', 'red', 'row', 'run', 'sad', 'say', 'sea', 'see', 'set', 'sex', 'she', 'sin', 'sit', 'six', 'sky', 'son', 'sun', 'tap', 'tax', 'tea', 'ten', 'the', 'tie', 'tip', 'toe', 'too', 'top', 'toy', 'try', 'two', 'use', 'van', 'war', 'way', 'who', 'why', 'win', 'yes', 'yet', 'you',
    // 4 chars
    'also', 'able', 'acid', 'aged', 'away', 'baby', 'back', 'ball', 'bank', 'base', 'bath', 'bear', 'beat', 'beer', 'bell', 'belt', 'best', 'bill', 'bird', 'blow', 'blue', 'boat', 'body', 'bomb', 'bond', 'bone', 'book', 'boom', 'born', 'boss', 'both', 'bowl', 'burn', 'busy', 'call', 'calm', 'came', 'camp', 'card', 'care', 'case', 'cash', 'cast', 'cell', 'chat', 'chip', 'city', 'club', 'coal', 'coat', 'code', 'cold', 'come', 'cook', 'cool', 'cope', 'core', 'cost', 'crew', 'crop', 'dark', 'date', 'dead', 'deal', 'dean', 'dear', 'debt', 'deep', 'deny', 'desk', 'dial', 'diet', 'disc', 'disk', 'does', 'done', 'door', 'dose', 'down', 'draw', 'drew', 'drop', 'drug', 'dual', 'duke', 'dust', 'duty', 'each', 'earn', 'ease', 'east', 'easy', 'edge', 'edit', 'else', 'even', 'ever', 'evil', 'exit', 'face', 'fact', 'fail', 'fair', 'fall', 'farm', 'fast', 'fate', 'fear', 'feed', 'feel', 'feet', 'fell', 'felt', 'file', 'fill', 'film', 'find', 'fine', 'fire', 'firm', 'fish', 'five', 'flat', 'fled', 'flew', 'flow', 'food', 'foot', 'ford', 'form', 'fort', 'four', 'free', 'from', 'fuel', 'full', 'fund', 'gain', 'game', 'gate', 'gave', 'gear', 'gene', 'gift', 'girl', 'give', 'glad', 'goal', 'goes', 'gold', 'golf', 'gone', 'good', 'gray', 'grew', 'grey', 'grow', 'hair', 'half', 'hall', 'hand', 'hang', 'hard', 'harm', 'hate', 'have', 'head', 'hear', 'heat', 'held', 'hell', 'help', 'here', 'hero', 'high', 'hill', 'hire', 'hold', 'hole', 'holy', 'home', 'hope', 'host', 'hour', 'huge', 'hung', 'hunt', 'hurt', 'idea', 'inch', 'into', 'iron', 'item', 'jack', 'jane', 'jean', 'join', 'joke', 'jump', 'jury', 'just', 'keep', 'kept', 'kick', 'kill', 'kind', 'king', 'knee', 'knew', 'know', 'lack', 'lady', 'laid', 'lake', 'land', 'lane', 'last', 'late', 'lead', 'left', 'less', 'life', 'lift', 'like', 'line', 'link', 'list', 'live', 'load', 'loan', 'lock', 'logo', 'long', 'look', 'lord', 'lose', 'loss', 'lost', 'love', 'luck', 'made', 'mail', 'main', 'make', 'male', 'many', 'mark', 'mass', 'mate', 'math', 'meal', 'mean', 'meat', 'meet', 'menu', 'mere', 'mike', 'mile', 'milk', 'mill', 'mind', 'mine', 'miss', 'mode', 'mood', 'moon', 'more', 'most', 'move', 'much', 'must', 'name', 'navy', 'near', 'neck', 'need', 'news', 'next', 'nice', 'nick', 'nine', 'none', 'nose', 'note', 'okay', 'once', 'only', 'onto', 'open', 'oral', 'over', 'pace', 'pack', 'page', 'paid', 'pain', 'pair', 'palm', 'park', 'part', 'pass', 'past', 'path', 'peak', 'pick', 'pile', 'pink', 'pipe', 'plan', 'play', 'plot', 'plug', 'plus', 'poll', 'pool', 'poor', 'port', 'post', 'pull', 'pure', 'push', 'race', 'rail', 'rain', 'rank', 'rare', 'rate', 'read', 'real', 'rear', 'rely', 'rent', 'rest', 'rice', 'rich', 'ride', 'ring', 'rise', 'risk', 'road', 'rock', 'role', 'roll', 'roof', 'room', 'root', 'rose', 'rule', 'rush', 'ruth', 'safe', 'said', 'sake', 'sale', 'salt', 'same', 'sand', 'save', 'seat', 'seed', 'seek', 'seem', 'seen', 'self', 'sell', 'send', 'sent', 'sept', 'ship', 'shop', 'shot', 'show', 'shut', 'sick', 'side', 'sign', 'silk', 'site', 'size', 'skin', 'slip', 'slow', 'snow', 'soft', 'soil', 'sold', 'sole', 'some', 'song', 'soon', 'sort', 'soul', 'spot', 'star', 'stay', 'step', 'stop', 'such', 'suit', 'sure', 'take', 'tale', 'talk', 'tall', 'tank', 'tape', 'task', 'team', 'tech', 'tell', 'tend', 'term', 'test', 'text', 'than', 'that', 'them', 'then', 'they', 'thin', 'this', 'thus', 'till', 'time', 'tiny', 'told', 'toll', 'tone', 'tony', 'took', 'tool', 'tour', 'town', 'tree', 'trip', 'true', 'tune', 'turn', 'twin', 'type', 'unit', 'upon', 'used', 'user', 'vary', 'vast', 'very', 'vice', 'view', 'vote', 'wage', 'wait', 'wake', 'walk', 'wall', 'want', 'ward', 'warm', 'wash', 'wave', 'ways', 'weak', 'wear', 'week', 'well', 'went', 'were', 'west', 'what', 'when', 'whom', 'wide', 'wife', 'wild', 'will', 'wind', 'wine', 'wing', 'wire', 'wise', 'wish', 'with', 'wood', 'word', 'work', 'yard', 'yeah', 'year', 'your', 'zero', 'zone',
    // 5+ chars (selection)
    'about', 'above', 'abuse', 'actor', 'acute', 'admit', 'adopt', 'adult', 'after', 'again', 'agent', 'agree', 'ahead', 'alarm', 'album', 'alert', 'alike', 'alive', 'allow', 'alone', 'along', 'alter', 'among', 'anger', 'angle', 'angry', 'apart', 'apple', 'apply', 'arena', 'argue', 'arise', 'array', 'aside', 'asset', 'audio', 'audit', 'avoid', 'award', 'aware', 'badly', 'baker', 'bases', 'basic', 'basis', 'beach', 'began', 'begin', 'begun', 'being', 'below', 'bench', 'billy', 'birth', 'black', 'blame', 'blind', 'block', 'blood', 'board', 'boost', 'booth', 'bound', 'brain', 'brand', 'bread', 'break', 'breed', 'brief', 'bring', 'broad', 'brown', 'brush', 'build', 'built', 'buyer', 'cable', 'calif', 'carry', 'catch', 'cause', 'chain', 'chair', 'chart', 'chase', 'cheap', 'check', 'chest', 'chief', 'child', 'china', 'chose', 'civil', 'claim', 'class', 'clean', 'clear', 'click', 'clock', 'close', 'coach', 'coast', 'could', 'count', 'court', 'cover', 'craft', 'crash', 'cream', 'crime', 'cross', 'crowd', 'crown', 'curve', 'cycle', 'daily', 'dance', 'dated', 'dealt', 'death', 'debut', 'delay', 'depth', 'doing', 'doubt', 'dozen', 'draft', 'drama', 'drawn', 'dream', 'dress', 'drill', 'drink', 'drive', 'drove', 'dying', 'eager', 'early', 'earth', 'eight', 'elite', 'empty', 'enemy', 'enjoy', 'enter', 'entry', 'equal', 'error', 'event', 'every', 'exact', 'exist', 'extra', 'faith', 'false', 'fault', 'fiber', 'field', 'fifth', 'fifty', 'fight', 'final', 'first', 'fixed', 'flash', 'fleet', 'floor', 'fluid', 'focus', 'force', 'forth', 'forty', 'forum', 'found', 'frame', 'frank', 'fraud', 'fresh', 'front', 'fruit', 'fully', 'funny', 'giant', 'given', 'glass', 'globe', 'going', 'grace', 'grade', 'grand', 'grant', 'grass', 'great', 'green', 'gross', 'group', 'grown', 'guard', 'guess', 'guest', 'guide', 'happy', 'harry', 'heart', 'heavy', 'hence', 'henry', 'horse', 'hotel', 'house', 'human', 'ideal', 'image', 'index', 'inner', 'input', 'issue', 'japan', 'jimmy', 'joint', 'jones', 'judge', 'known', 'label', 'large', 'laser', 'later', 'laugh', 'layer', 'learn', 'lease', 'least', 'leave', 'legal', 'level', 'lewis', 'light', 'limit', 'links', 'lives', 'local', 'logic', 'loose', 'lower', 'lucky', 'lunch', 'lying', 'magic', 'major', 'maker', 'march', 'maria', 'match', 'maybe', 'mayor', 'meantin', 'limit', 'admit', 'adult', 'advice', 'affect', 'afford', 'afraid', 'agency', 'agenda', 'almost', 'always', 'amount', 'animal', 'annual', 'answer', 'anyway', 'appeal', 'appear', 'aspect', 'assist', 'assume', 'attack', 'attend', 'august', 'author', 'avenue', 'backed', 'barely', 'battle', 'beauty', 'became', 'become', 'before', 'behalf', 'behind', 'belief', 'belong', 'berlin', 'better', 'beyond', 'bishop', 'border', 'bottle', 'bottom', 'bought', 'branch', 'breath', 'bridge', 'bright', 'broken', 'budget', 'burden', 'bureau', 'button', 'camera', 'cancer', 'cannot', 'carbon', 'career', 'castle', 'casual', 'caught', 'center', 'centre', 'chance', 'change', 'charge', 'choice', 'choose', 'chosen', 'church', 'circle', 'client', 'closed', 'closer', 'coffee', 'column', 'combat', 'coming', 'common', 'comply', 'copper', 'corner', 'costly', 'county', 'couple', 'course', 'covers', 'create', 'credit'
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
        const status = await ipcRenderer.invoke('check-helper-status');
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
    appData = await ipcRenderer.invoke('load-data');
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
    await ipcRenderer.invoke('save-data', appData);
}

// Detect platform for window controls
function detectPlatform() {
    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
    if (!isMac) {
        document.getElementById('window-controls').classList.remove('hidden');
    }
}

// Setup event listeners
function setupEventListeners() {
    // Window controls
    document.getElementById('min-btn')?.addEventListener('click', () => {
        ipcRenderer.send('window-minimize');
    });
    document.getElementById('max-btn')?.addEventListener('click', () => {
        ipcRenderer.send('window-maximize');
    });
    document.getElementById('close-btn')?.addEventListener('click', () => {
        ipcRenderer.send('window-close');
    });

    // Time pickers - custom popover handlers
    document.querySelectorAll('.time-part').forEach(btn => {
        btn.addEventListener('click', handleTimePartClick);
    });

    // Close popovers on outside click
    document.addEventListener('click', handlePopoverOutsideClick);

    // Duration picker - input change
    const durationInput = document.getElementById('duration-minutes-input');
    if (durationInput) {
        durationInput.addEventListener('input', handleDurationInputChange);
        durationInput.addEventListener('blur', () => {
            let mins = parseInt(durationInput.value);
            if (isNaN(mins) || mins < 1) mins = 60;
            if (mins > 1440) mins = 1440;
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

    // Click on timeline container (not on block) scrolls back to "now"
    document.querySelector('.timeline-container').addEventListener('click', (e) => {
        // Don't trigger if clicking on a block (they have their own handlers)
        if (!e.target.closest('.timeline-block')) {
            scrollToNow();
        }
    });

    // Listen for blocks updated from main process
    ipcRenderer.on('blocks-updated', async () => {
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
        const appName = await ipcRenderer.invoke('open-app-picker');
        if (appName && !onboardingApps.includes(appName)) {
            onboardingApps.push(appName);
            renderTags(appsTags, onboardingApps, (idx) => {
                onboardingApps.splice(idx, 1);
                renderTags(appsTags, onboardingApps);
            });
        }
    });

    document.getElementById('create-first-blocklist-btn').addEventListener('click', () => {
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
        const appName = await ipcRenderer.invoke('open-app-picker');
        if (appName && !modalApps.includes(appName)) {
            modalApps.push(appName);
            window.renderModalTags();
        }
    });
    // Override type
    document.getElementById('override-type').addEventListener('change', (e) => {
        const type = e.target.value;
        const customTextArea = document.getElementById('custom-override-text');
        const overrideCountInput = document.getElementById('override-count');
        const hintEl = document.getElementById('override-count-hint');

        if (type === 'custom') {
            customTextArea.classList.remove('hidden');
            overrideCountInput.classList.add('hidden');
            hintEl.classList.add('hidden');
        } else {
            customTextArea.classList.add('hidden');
            overrideCountInput.classList.remove('hidden');
            hintEl.classList.remove('hidden');

            if (type === 'random-words') {
                hintEl.innerHTML = "Total number of characters in the words to write.<br>E.g. 10 characters -> 'shine great'";
            } else {
                hintEl.innerHTML = "Number of characters to type to override<br>E.g. 10 -> a982j3+fd";
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

    // Custom emoji picker
    const customEmojiInput = document.getElementById('custom-emoji-input');
    const customEmojiSwatch = document.getElementById('custom-emoji-swatch');
    if (customEmojiInput && customEmojiSwatch) {
        customEmojiInput.addEventListener('input', (e) => {
            const val = e.target.value.trim();
            if (val) {
                // Take the last character (handles surrogate pairs)
                const char = Array.from(val).pop();
                customEmojiSwatch.innerHTML = char;
                customEmojiSwatch.dataset.emoji = char;

                document.querySelectorAll('.emoji-swatch').forEach(s => s.classList.remove('selected'));
                customEmojiSwatch.classList.add('selected');
            }
        });

        // Ensure swatch is selected when input is focused
        customEmojiInput.addEventListener('focus', () => {
            if (customEmojiSwatch.dataset.emoji) {
                document.querySelectorAll('.emoji-swatch').forEach(s => s.classList.remove('selected'));
                customEmojiSwatch.classList.add('selected');
            }
        });
    }

    // Cancel button
    document.getElementById('cancel-blocklist-btn').addEventListener('click', () => {
        closeBlocklistModal();
    });

    // Save button
    document.getElementById('save-blocklist-btn').addEventListener('click', () => {
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
            updateHostsFile();
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
            const status = await ipcRenderer.invoke('check-helper-status');
            if (status.running) {
                helperAvailable = true;
                await ipcRenderer.invoke('clear-block-via-helper');
            } else {
                // Fallback to direct update only if helper truly not running
                await updateHostsFile();
            }

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
    targetDurationMinutes = Math.min(mins, 1440);
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

// Handle time picker change
function handleTimeChange() {
    const previewBlock = document.getElementById('preview-timeline-block');
    const noBlocksMsg = document.getElementById('no-blocks-message');
    const startBtn = document.getElementById('start-block-btn');
    const nextDayIndicator = document.getElementById('next-day-indicator');

    // Get times (start is always now)
    let blockStart = getStartTimeAsDate();
    let blockEnd = getEndTimeAsDate();

    // Handle overnight: if end <= start, it's next day
    const isNextDay = blockEnd <= blockStart;
    if (isNextDay) {
        blockEnd.setDate(blockEnd.getDate() + 1);
    }

    // Show/hide +1 day indicator
    if (nextDayIndicator) {
        if (isNextDay) {
            nextDayIndicator.classList.remove('hidden');
        } else {
            nextDayIndicator.classList.add('hidden');
        }
    }

    // Calculate duration
    const durationMs = blockEnd.getTime() - blockStart.getTime();
    const durationMinutes = Math.round(durationMs / 60000);

    if (durationMinutes <= 0) {
        previewBlock.classList.add('hidden');
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
    noBlocksMsg.classList.add('hidden');

    // Expand track height to accommodate preview
    const track = document.getElementById('timeline-track');
    const runningBlocks = appData.activeBlocks.filter(b => b.endTime > Date.now());
    const dynamicHeight = 60 + runningBlocks.length * 18;
    track.style.minHeight = `${dynamicHeight}px`;

    updateWindowHeight(); // Adjust window height for new track size

    // Get timeline range for positioning
    const { startTime: timelineStart, timelineSpan } = getTimelineRange();

    // Update preview block on timeline
    const blocklist = appData.blocklists.find(bl => bl.id === selectedBlocklistId);
    if (blocklist) {
        // Calculate position
        const blockStartOffset = blockStart.getTime() - timelineStart.getTime();
        const leftPercent = (blockStartOffset / timelineSpan) * 100;
        const widthPercent = Math.min(100 - leftPercent, (durationMs / timelineSpan) * 100);

        previewBlock.style.left = `${Math.max(0, leftPercent)}%`;
        previewBlock.style.width = `${Math.max(0, widthPercent)}%`;

        // Position preview below running blocks
        previewBlock.style.top = `${4 + runningBlocks.length * 18}px`;

        // Apply blocklist color if available
        if (blocklist.color) {
            previewBlock.style.background = blocklist.color;
        } else {
            previewBlock.style.background = 'linear-gradient(135deg, #4a00e0 0%, #8e2de2 100%)';
        }

        previewBlock.innerHTML = `
            <div class="block-content">
                <span class="block-emoji">${blocklist.emoji || '🚫'}</span>
                <span class="block-label">${escapeHtml(blocklist.name)}</span>
                <span class="block-time">${formatTime(blockStart)}</span>
                <span class="block-time-sep">–</span>
                <span class="block-time">${formatTime(blockEnd)}</span>
            </div>
        `;
        previewBlock.classList.remove('hidden');
    } else {
        previewBlock.innerHTML = '<div class="block-content"><span class="block-label">Select a blocklist</span></div>';
        previewBlock.classList.remove('hidden');
    }
}

// Handle blocklist selection
function handleBlocklistSelect(e) {
    selectedBlocklistId = e.target.value || null;
    const timePicker = document.getElementById('time-picker-container');
    const passwordHint = document.getElementById('password-hint');
    const selectionPrompt = document.getElementById('selection-prompt');
    const startBlockBtn = document.getElementById('start-block-btn');

    if (selectedBlocklistId) {
        // Hide selection prompt, show time picker, hint, and start button
        if (selectionPrompt) selectionPrompt.classList.add('hidden');
        timePicker.classList.remove('hidden');
        if (passwordHint) passwordHint.classList.remove('hidden');
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
        initializeTimeInputs();
    } else {
        // Show selection prompt, hide time picker, hint, and start button
        if (selectionPrompt) selectionPrompt.classList.remove('hidden');
        timePicker.classList.add('hidden');
        if (passwordHint) passwordHint.classList.add('hidden');
        if (startBlockBtn) startBlockBtn.classList.add('hidden');
    }

    // Update visual selection state on blocklist cards
    const selectedBlocklist = selectedBlocklistId ? appData.blocklists.find(bl => bl.id === selectedBlocklistId) : null;
    document.querySelectorAll('.blocklist-card').forEach(card => {
        if (card.dataset.id === selectedBlocklistId && selectedBlocklist) {
            card.classList.add('selected');
            // Apply the blocklist's color as the selection border
            const color = selectedBlocklist.color || '#667eea';
            card.style.boxShadow = `0 0 0 2px ${color}, 0 4px 8px rgba(0, 0, 0, 0.1)`;
        } else {
            card.classList.remove('selected');
            card.style.boxShadow = '';
        }
    });

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
    let charsPerMinute = 20; // Conservative for random text

    if (difficulty.type === 'custom' && difficulty.customText) {
        charCount = difficulty.customText.length;
        charsPerMinute = 30; // Custom text is slightly easier (you can see the pattern)
        const estimatedMinutes = Math.ceil(charCount / charsPerMinute);
        overrideText = `Type a specific ${charCount}-character phrase exactly as shown (~${estimatedMinutes} min).`;
    } else if (difficulty.type === 'gibberish') {
        charsPerMinute = 15; // Gibberish is the hardest
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
        result = await ipcRenderer.invoke('start-block-via-helper', {
            domains: blocklist.websites || [],
            endTime: blockEnd.getTime(),
            blocklistId: selectedBlocklistId
        });
    } else {
        // Helper not available - check if it's installed but just not detected
        const status = await ipcRenderer.invoke('check-helper-status');

        if (status.running) {
            // It's running, use it
            helperAvailable = true;
            result = await ipcRenderer.invoke('start-block-via-helper', {
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

    // Reset dropdown and let handleBlocklistSelect handle the UI hiding/reset
    const blocklistSelect = document.getElementById('blocklist-select');
    blocklistSelect.value = '';
    handleBlocklistSelect({ target: blocklistSelect });

    // Hide preview
    document.getElementById('preview-timeline-block').classList.add('hidden');

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

    // Disable button while installing
    proceedBtn.disabled = true;
    proceedBtn.textContent = 'Installing...';

    // Try to install the helper
    const installResult = await ipcRenderer.invoke('install-helper');

    if (installResult.success) {
        helperAvailable = true;
        modal.classList.add('hidden');

        // Now start the pending block
        if (pendingBlockData) {
            const { block, blocklist, blockEnd } = pendingBlockData;

            const result = await ipcRenderer.invoke('start-block-via-helper', {
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
                document.getElementById('preview-timeline-block').classList.add('hidden');

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
        const status = await ipcRenderer.invoke('check-helper-status');
        console.log('[updateHostsFile] Helper status:', status);

        if (status.running) {
            console.log('[updateHostsFile] Helper running, using helper to update blocks');
            helperAvailable = true;

            if (domainsArray.length === 0) {
                // Clear all blocks via helper
                const result = await ipcRenderer.invoke('clear-block-via-helper');
                if (result && result.success) {
                    lastBlockedDomains = allDomains;
                }
                return result || { success: true };
            } else {
                // Find the latest end time among active blocks
                const latestEndTime = Math.max(...appData.activeBlocks
                    .filter(b => b.startTime <= now && b.endTime > now)
                    .map(b => b.endTime));

                const result = await ipcRenderer.invoke('start-block-via-helper', {
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
    const result = await ipcRenderer.invoke('block-websites', domainsArray);

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
    const overrideCountInput = document.getElementById('override-count');
    const hintEl = document.getElementById('override-count-hint');

    if (type === 'custom') {
        customTextArea.classList.remove('hidden');
        overrideCountInput.classList.add('hidden');
        hintEl.classList.add('hidden');
    } else {
        customTextArea.classList.add('hidden');
        overrideCountInput.classList.remove('hidden');
        hintEl.classList.remove('hidden');

        if (type === 'random-words') {
            hintEl.innerHTML = "Total number of characters in the words to write.<br>E.g. 10 characters -> 'shine great'";
        } else {
            hintEl.innerHTML = "Number of characters to type to override<br>E.g. 10 -> a982j3+fd";
        }
    }

    // Restore color swatch selection
    document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('selected'));
    const colorToSelect = blocklist?.color || 'linear-gradient(135deg, #4a00e0 0%, #8e2de2 100%)';
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
    const emojiToSelect = blocklist?.emoji || '🚫';
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
    // Show onboarding if not complete
    if (!appData.settings.onboardingComplete) {
        document.getElementById('onboarding-screen').classList.remove('hidden');
        document.getElementById('main-content').classList.add('hidden');
        return;
    }

    document.getElementById('onboarding-screen').classList.add('hidden');
    document.getElementById('main-content').classList.remove('hidden');

    updateTimelineAxis();
    renderActiveBlocks();
    renderBlocklistSelector();
    renderBlocklists();

    // Adjust window height to fit content
    updateWindowHeight();
}

// Get timeline range: 7 hours ago → 7am tomorrow
function getTimelineRange() {
    const now = new Date();

    // Start: 7 hours ago (rounded down to nearest hour)
    const startTime = new Date(now);
    startTime.setHours(startTime.getHours() - 7, 0, 0, 0);

    // End: 7am tomorrow
    const endTime = new Date(now);
    endTime.setDate(endTime.getDate() + 1);
    endTime.setHours(7, 0, 0, 0);

    const timelineSpan = endTime.getTime() - startTime.getTime();

    return { startTime, endTime, timelineSpan, now };
}

// Update timeline axis with actual clock times and position the now indicator
function updateTimelineAxis() {
    const { startTime, endTime, timelineSpan, now } = getTimelineRange();
    const axisEl = document.getElementById('timeline-axis');

    // Generate markers every 30 minutes (hourly get label, half-hour just tick)
    const markerInterval = 30 * 60 * 1000; // 30 minutes in ms
    const numMarkers = Math.floor(timelineSpan / markerInterval) + 1;

    // Clear existing markers and regenerate
    axisEl.innerHTML = '';

    for (let i = 0; i < numMarkers; i++) {
        const markerTime = new Date(startTime.getTime() + i * markerInterval);
        const percent = (i * markerInterval / timelineSpan) * 100;
        const isHour = markerTime.getMinutes() === 0;

        const marker = document.createElement('div');
        marker.className = isHour ? 'time-marker hour' : 'time-marker half-hour';
        marker.style.left = `${percent}%`;

        if (isHour) {
            marker.innerHTML = `<span>${formatTime(markerTime)}</span><div class="marker-line"></div>`;
        } else {
            marker.innerHTML = `<div class="marker-line"></div>`;
        }

        axisEl.appendChild(marker);
    }

    // Position the "now" indicator (but don't scroll)
    const nowIndicator = document.getElementById('now-indicator');
    if (nowIndicator) {
        const nowOffset = now.getTime() - startTime.getTime();
        const nowPercent = (nowOffset / timelineSpan) * 100;
        nowIndicator.style.left = `${Math.max(0, Math.min(100, nowPercent))}%`;
    }
}

// Scroll timeline so "now" is at 25% of visible width
function scrollToNow(smooth = true) {
    const { startTime, timelineSpan, now } = getTimelineRange();
    const container = document.querySelector('.timeline-container');
    if (!container) return;

    const wrapper = container.querySelector('.timeline-content-wrapper');
    if (!wrapper) return;

    const nowOffset = now.getTime() - startTime.getTime();
    const nowPercent = (nowOffset / timelineSpan) * 100;

    const wrapperWidth = wrapper.offsetWidth;
    const containerWidth = container.offsetWidth;
    const nowPosition = (nowPercent / 100) * wrapperWidth;

    // Position "now" at 25% from left of visible area
    const scrollTarget = Math.max(0, nowPosition - (containerWidth * 0.25));

    if (smooth) {
        container.scrollTo({
            left: scrollTarget,
            behavior: 'smooth'
        });
    } else {
        container.scrollLeft = scrollTarget;
    }
}

// Render active blocks on timeline
function renderActiveBlocks() {
    const track = document.getElementById('timeline-track');
    const noBlocksMsg = document.getElementById('no-blocks-message');

    // Use the same timeline range as the axis
    const { startTime, timelineSpan, now } = getTimelineRange();
    const nowMs = now.getTime();
    const startMs = startTime.getTime();
    const endMs = startMs + timelineSpan;

    // Get all blocks that are within the timeline range (don't filter expired for display)
    const visibleBlocks = appData.activeBlocks.filter(block =>
        block.endTime > startMs && block.startTime < endMs
    );

    // Active (still running) blocks for stacking calculations
    const runningBlocks = visibleBlocks.filter(block => block.endTime > nowMs);

    // Clear existing blocks (except preview and now-indicator)
    track.querySelectorAll('.timeline-block:not(.preview)').forEach(el => el.remove());

    if (visibleBlocks.length === 0 && document.getElementById('preview-timeline-block').classList.contains('hidden')) {
        noBlocksMsg.classList.remove('hidden');
        // Position message to the right of "now" indicator
        const nowOffset = nowMs - startMs;
        const nowPercent = (nowOffset / timelineSpan) * 100;
        noBlocksMsg.style.left = `${nowPercent + 2}%`; // Slightly to the right of now
        noBlocksMsg.style.transform = 'translateY(-50%)'; // Only center vertically
        track.style.minHeight = '60px'; // Default height
    } else {
        noBlocksMsg.classList.add('hidden');
        // Dynamic height: base 60px + 18px per additional running block
        const dynamicHeight = 60 + Math.max(0, runningBlocks.length - 1) * 18;
        track.style.minHeight = `${dynamicHeight}px`;
    }

    // Track running block index for stacking offset
    let runningIdx = 0;

    // Render each visible block on the timeline
    visibleBlocks.forEach((block) => {
        const blocklist = appData.blocklists.find(bl => bl.id === block.blocklistId);
        if (!blocklist) return;

        const blockStartTime = new Date(block.startTime);
        const blockEndTime = new Date(block.endTime);
        const isExpired = block.endTime <= nowMs;

        // Calculate position relative to timeline start
        const blockStart = Math.max(startMs, block.startTime);
        const leftOffset = blockStart - startMs;
        const leftPercent = (leftOffset / timelineSpan) * 100;

        // Width: from effective start to end
        const duration = block.endTime - blockStart;
        const widthPercent = Math.min(100 - leftPercent, (duration / timelineSpan) * 100);

        // Don't render if block is entirely past the timeline window
        if (leftPercent >= 100) return;

        const blockEl = document.createElement('div');
        blockEl.className = isExpired ? 'timeline-block expired' : 'timeline-block';
        blockEl.dataset.blockId = block.id;
        blockEl.style.left = `${leftPercent}%`;
        blockEl.style.width = `${widthPercent}%`; // True proportional width

        // Only offset running blocks (expired blocks stay at top)
        if (!isExpired) {
            blockEl.style.top = `${4 + runningIdx * 18}px`;
            blockEl.style.zIndex = runningIdx + 1;
            runningIdx++;
        } else {
            blockEl.style.top = '4px';
            blockEl.style.zIndex = 0;
        }

        // Apply blocklist color if available
        if (blocklist.color) {
            blockEl.style.background = blocklist.color;
        }

        blockEl.innerHTML = `
            <div class="block-content">
                <span class="block-emoji">${blocklist.emoji || '🚫'}</span>
                <span class="block-label">${escapeHtml(blocklist.name)}</span>
                <span class="block-time">${formatTime(blockStartTime)}</span>
                <span class="block-time-sep">–</span>
                <span class="block-time">${formatTime(blockEndTime)}</span>
            </div>
        `;

        // Add click handler for override (only for running blocks)
        if (!isExpired) {
            blockEl.addEventListener('click', () => {
                openOverrideModal(block.id);
            });
        }

        track.appendChild(blockEl);
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
        const isActive = appData.activeBlocks.some(b => b.blocklistId === bl.id && b.startTime <= now && b.endTime > now);
        const activeClass = isActive ? ' blocklist-card-active' : '';
        const activeBadge = isActive ? '<span class="active-badge">Active</span>' : '';

        // Check if this blocklist is selected for starting a block
        const isSelected = bl.id === selectedBlocklistId && !isActive;
        const selectedClass = isSelected ? ' selected' : '';

        return `
      <div class="blocklist-card${activeClass}${selectedClass}" data-id="${bl.id}" data-active="${isActive}" draggable="true">
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

// Calculate and set window height based on content
function updateWindowHeight() {
    const titleBar = document.querySelector('.title-bar');
    const topRow = document.querySelector('.grid-top-row');
    const timeline = document.querySelector('.timeline-section');

    if (!titleBar || !topRow || !timeline) return;

    // Measure content heights
    const topRowHeight = topRow.offsetHeight;
    const timelineHeight = timeline.offsetHeight;

    // CSS values (hardcoded based on styles.css)
    const gap = 20;               // .main-content gap
    const timelineMarginTop = 6;  // .timeline-section margin-top
    const mainPadTop = 12;        // .main-content padding-top
    const mainPadBottom = 20;     // .main-content padding-bottom
    const appPadBottom = 42;      // .app-container padding-bottom
    const titleHeight = titleBar.offsetHeight;

    // Calculate total required height
    const totalHeight = Math.ceil(
        titleHeight +
        mainPadTop +
        topRowHeight +
        gap +
        timelineMarginTop +
        timelineHeight +
        mainPadBottom +
        appPadBottom
    );

    ipcRenderer.send('set-window-height', totalHeight);
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
