// Override challenge generation: word lists, gibberish, difficulty math.
// Extracted verbatim from app.js.
import { state } from './state.js';
import { tSettings, tSettingsFmt, getSettingsLanguage } from './i18n.js';

// Word list for random word challenges
export const MIN_OVERRIDE_CHARS = 5;
export const DEFAULT_OVERRIDE_COUNT = 10;
export const TARGET_MAX_OVERRIDE_MINUTES = 30;
/** iOS random-words / gibberish: max word count (random-words: 2500 letters at max; gibberish: 3000). */
export const MAX_IOS_OVERRIDE_WORD_COUNT = 500;
/** iOS word-count override UI: ~30 min at max (500 words). */
export const IOS_OVERRIDE_WORDS_PER_MINUTE = MAX_IOS_OVERRIDE_WORD_COUNT / TARGET_MAX_OVERRIDE_MINUTES;
/** When character count >= this, preview text is frozen (no more regeneration) for random words and gibberish. */
export const OVERRIDE_PREVIEW_TRUNCATE_AT = 50;

export function usesMobileWordCountForOverrideType(type) {
    return !!((state.isIOS || state.isAndroid) && (type === 'random-words' || type === 'gibberish'));
}

export function isMobileOverrideChallengePlatform() {
    return state.isIOS || state.isAndroid;
}

export function formatIOSGibberishChallenge(text) {
    const compact = String(text || '').replace(/\s+/g, '');
    return compact.replace(/(.{6})(?=.)/g, '$1 ');
}


/** Five-letter words only — used for iOS word-count random-words (predictable length per word). */
let wordList5Cache = null;

export const wordList = [
    // 1-2 chars
    'a', 'ad', 'am', 'an', 'as', 'at', 'be', 'by', 'do', 'go', 'he', 'hi', 'if', 'in', 'is', 'it', 'me', 'my', 'no', 'of', 'on', 'or', 'so', 'to', 'up', 'us', 'we',
    // 3 chars
    'act', 'add', 'age', 'aim', 'air', 'all', 'and', 'any', 'art', 'ask', 'bad', 'bag', 'bar', 'bat', 'bed', 'bee', 'big', 'bit', 'box', 'boy', 'bus', 'but', 'buy', 'can', 'car', 'cat', 'day', 'die', 'dog', 'dry', 'due', 'eat', 'egg', 'end', 'eye', 'far', 'few', 'fit', 'fly', 'for', 'fun', 'get', 'god', 'got', 'guy', 'hot', 'how', 'ice', 'ill', 'ink', 'job', 'joy', 'key', 'kid', 'law', 'lay', 'leg', 'let', 'lie', 'log', 'lot', 'low', 'man', 'map', 'may', 'men', 'mix', 'net', 'new', 'nod', 'nor', 'not', 'now', 'num', 'off', 'oil', 'old', 'one', 'out', 'own', 'pay', 'pen', 'per', 'pet', 'pie', 'pig', 'pin', 'pot', 'put', 'ran', 'raw', 'red', 'row', 'run', 'sad', 'say', 'sea', 'see', 'set', 'she', 'sin', 'sit', 'six', 'sky', 'son', 'sun', 'tap', 'tax', 'tea', 'ten', 'the', 'tie', 'tip', 'toe', 'too', 'top', 'toy', 'try', 'two', 'use', 'van', 'war', 'way', 'who', 'why', 'win', 'yes', 'yet', 'you',
    // 4 chars
    'also', 'able', 'acid', 'aged', 'away', 'baby', 'back', 'ball', 'bank', 'base', 'bath', 'bear', 'beat', 'beer', 'bell', 'belt', 'best', 'bill', 'bird', 'blow', 'blue', 'boat', 'body', 'bomb', 'bond', 'bone', 'book', 'boom', 'born', 'boss', 'both', 'bowl', 'burn', 'busy', 'call', 'calm', 'came', 'camp', 'card', 'care', 'case', 'cash', 'cast', 'cell', 'chat', 'chip', 'city', 'club', 'coal', 'coat', 'code', 'cold', 'come', 'cook', 'cool', 'cope', 'core', 'cost', 'crew', 'crop', 'dark', 'date', 'dead', 'deal', 'dean', 'dear', 'debt', 'deep', 'deny', 'desk', 'dial', 'diet', 'disc', 'disk', 'does', 'done', 'door', 'dose', 'down', 'draw', 'drew', 'drop', 'drug', 'dual', 'duke', 'dust', 'duty', 'each', 'earn', 'ease', 'east', 'easy', 'edge', 'edit', 'else', 'even', 'ever', 'evil', 'exit', 'face', 'fact', 'fail', 'fair', 'fall', 'farm', 'fast', 'fate', 'fear', 'feed', 'feel', 'feet', 'fell', 'felt', 'file', 'fill', 'film', 'find', 'fine', 'fire', 'firm', 'fish', 'five', 'flat', 'fled', 'flew', 'flow', 'food', 'foot', 'ford', 'form', 'fort', 'four', 'free', 'from', 'fuel', 'full', 'fund', 'gain', 'game', 'gate', 'gave', 'gear', 'gene', 'gift', 'girl', 'give', 'glad', 'goal', 'goes', 'gold', 'golf', 'gone', 'good', 'gray', 'grew', 'grey', 'grow', 'hair', 'half', 'hall', 'hand', 'hang', 'hard', 'harm', 'hate', 'have', 'head', 'hear', 'heat', 'held', 'hell', 'help', 'here', 'hero', 'high', 'hill', 'hire', 'hold', 'hole', 'holy', 'home', 'hope', 'host', 'hour', 'huge', 'hung', 'hunt', 'hurt', 'idea', 'inch', 'into', 'iron', 'item', 'join', 'joke', 'jump', 'jury', 'just', 'keep', 'kept', 'kick', 'kill', 'kind', 'king', 'knee', 'knew', 'know', 'lack', 'lady', 'laid', 'lake', 'land', 'lane', 'last', 'late', 'lead', 'left', 'less', 'life', 'lift', 'like', 'line', 'link', 'list', 'live', 'load', 'loan', 'lock', 'logo', 'long', 'look', 'lord', 'lose', 'loss', 'lost', 'love', 'luck', 'made', 'mail', 'main', 'make', 'male', 'many', 'mark', 'mass', 'mate', 'math', 'meal', 'mean', 'meat', 'meet', 'menu', 'mere', 'mile', 'milk', 'mill', 'mind', 'mine', 'miss', 'mode', 'mood', 'moon', 'more', 'most', 'move', 'much', 'must', 'name', 'navy', 'near', 'neck', 'need', 'news', 'next', 'nice', 'nick', 'nine', 'none', 'nose', 'note', 'okay', 'once', 'only', 'onto', 'open', 'oral', 'over', 'pace', 'pack', 'page', 'paid', 'pain', 'pair', 'palm', 'park', 'part', 'pass', 'past', 'path', 'peak', 'pick', 'pile', 'pink', 'pipe', 'plan', 'play', 'plot', 'plug', 'plus', 'poll', 'pool', 'poor', 'port', 'post', 'pull', 'pure', 'push', 'race', 'rail', 'rain', 'rank', 'rare', 'rate', 'read', 'real', 'rear', 'rely', 'rent', 'rest', 'rice', 'rich', 'ride', 'ring', 'rise', 'risk', 'road', 'rock', 'role', 'roll', 'roof', 'room', 'root', 'rose', 'rule', 'rush', 'safe', 'said', 'sake', 'sale', 'salt', 'same', 'sand', 'save', 'seat', 'seed', 'seek', 'seem', 'seen', 'self', 'sell', 'send', 'sent', 'ship', 'shop', 'shot', 'show', 'shut', 'sick', 'side', 'sign', 'silk', 'site', 'size', 'skin', 'slip', 'slow', 'snow', 'soft', 'soil', 'sold', 'sole', 'some', 'song', 'soon', 'sort', 'soul', 'spot', 'star', 'stay', 'step', 'stop', 'such', 'suit', 'sure', 'take', 'tale', 'talk', 'tall', 'tank', 'tape', 'task', 'team', 'tech', 'tell', 'tend', 'term', 'test', 'text', 'than', 'that', 'them', 'then', 'they', 'thin', 'this', 'thus', 'till', 'time', 'tiny', 'told', 'toll', 'tone', 'took', 'tool', 'tour', 'town', 'tree', 'trip', 'true', 'tune', 'turn', 'twin', 'type', 'unit', 'upon', 'used', 'user', 'vary', 'vast', 'very', 'vice', 'view', 'vote', 'wage', 'wait', 'wake', 'walk', 'wall', 'want', 'ward', 'warm', 'wash', 'wave', 'ways', 'weak', 'wear', 'week', 'well', 'went', 'were', 'west', 'what', 'when', 'whom', 'wide', 'wife', 'wild', 'will', 'wind', 'wine', 'wing', 'wire', 'wise', 'wish', 'with', 'wood', 'word', 'work', 'yard', 'yeah', 'year', 'your', 'zero', 'zone',
    // 5+ chars (selection)
    'about', 'above', 'abuse', 'actor', 'acute', 'admit', 'adopt', 'adult', 'after', 'again', 'agent', 'agree', 'ahead', 'alarm', 'album', 'alert', 'alike', 'alive', 'allow', 'alone', 'along', 'alter', 'among', 'anger', 'angle', 'angry', 'apart', 'apple', 'apply', 'arena', 'argue', 'arise', 'array', 'aside', 'asset', 'audio', 'audit', 'avoid', 'award', 'aware', 'badly', 'baker', 'bases', 'basic', 'basis', 'beach', 'began', 'begin', 'begun', 'being', 'below', 'bench', 'birth', 'black', 'blame', 'blind', 'block', 'blood', 'board', 'boost', 'booth', 'bound', 'brain', 'brand', 'bread', 'break', 'breed', 'brief', 'bring', 'broad', 'brown', 'brush', 'build', 'built', 'buyer', 'cable', 'carry', 'catch', 'cause', 'chain', 'chair', 'chart', 'chase', 'cheap', 'check', 'chest', 'chief', 'child', 'china', 'chose', 'civil', 'claim', 'class', 'clean', 'clear', 'click', 'clock', 'close', 'coach', 'coast', 'could', 'count', 'court', 'cover', 'craft', 'crash', 'cream', 'crime', 'cross', 'crowd', 'crown', 'curve', 'cycle', 'daily', 'dance', 'dated', 'dealt', 'death', 'debut', 'delay', 'depth', 'doing', 'doubt', 'dozen', 'draft', 'drama', 'drawn', 'dream', 'dress', 'drill', 'drink', 'drive', 'drove', 'dying', 'eager', 'early', 'earth', 'eight', 'elite', 'empty', 'enemy', 'enjoy', 'enter', 'entry', 'equal', 'error', 'event', 'every', 'exact', 'exist', 'extra', 'faith', 'false', 'fault', 'fiber', 'field', 'fifth', 'fifty', 'fight', 'final', 'first', 'fixed', 'flash', 'fleet', 'floor', 'fluid', 'focus', 'force', 'forth', 'forty', 'forum', 'found', 'frame', 'frank', 'fraud', 'fresh', 'front', 'fruit', 'fully', 'funny', 'giant', 'given', 'glass', 'globe', 'going', 'grace', 'grade', 'grand', 'grant', 'grass', 'great', 'green', 'gross', 'group', 'grown', 'guard', 'guess', 'guest', 'guide', 'happy', 'heart', 'heavy', 'hence', 'horse', 'hotel', 'house', 'human', 'ideal', 'image', 'index', 'inner', 'input', 'issue', 'japan', 'joint', 'judge', 'known', 'label', 'large', 'laser', 'later', 'laugh', 'layer', 'learn', 'lease', 'least', 'leave', 'legal', 'level', 'light', 'limit', 'links', 'lives', 'local', 'logic', 'loose', 'lower', 'lucky', 'lunch', 'lying', 'magic', 'major', 'maker', 'march', 'match', 'maybe', 'mayor', 'limit', 'admit', 'adult', 'advice', 'affect', 'afford', 'afraid', 'agency', 'agenda', 'almost', 'always', 'amount', 'animal', 'annual', 'answer', 'anyway', 'appeal', 'appear', 'aspect', 'assist', 'assume', 'attack', 'attend', 'august', 'author', 'avenue', 'backed', 'barely', 'battle', 'beauty', 'became', 'become', 'before', 'behalf', 'behind', 'belief', 'belong', 'berlin', 'better', 'beyond', 'bishop', 'border', 'bottle', 'bottom', 'bought', 'branch', 'breath', 'bridge', 'bright', 'broken', 'budget', 'burden', 'bureau', 'button', 'camera', 'cancer', 'cannot', 'carbon', 'career', 'castle', 'casual', 'caught', 'center', 'centre', 'chance', 'change', 'charge', 'choice', 'choose', 'chosen', 'church', 'circle', 'client', 'closed', 'closer', 'coffee', 'column', 'combat', 'coming', 'common', 'comply', 'copper', 'corner', 'costly', 'county', 'couple', 'course', 'covers', 'create', 'credit'
];

export function getWordList5() {
    if (!wordList5Cache) {
        wordList5Cache = wordList.filter(w => w.length === 5);
    }
    return wordList5Cache;
}

/** Typed letters only for N five-letter words (spaces in display are not counted). */
export function getIOSRandomWordsCharCount(wordCount) {
    const n = Math.max(0, Math.floor(wordCount));
    return n * 5;
}

/** iOS: generate exactly `wordCount` random five-letter words. */
export function generateRandomWordsByCount(wordCount) {
    const n = Math.max(0, Math.floor(wordCount));
    if (n === 0) return '';
    const pool = getWordList5();
    if (pool.length === 0) return '';
    const words = [];
    for (let i = 0; i < n; i++) {
        words.push(pool[Math.floor(Math.random() * pool.length)]);
    }
    return words.join(' ');
}

// Generate random words to reach target character count exactly (desktop / character-count mode)
export function generateRandomWords(targetChars) {
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

export function generateOverrideChallengeText(type, count, customText = '') {
    if (type === 'custom' && customText) return customText;
    const normalizedCount = normalizeOverrideCount(count, type);
    if (type === 'gibberish') {
        const raw = generateGibberish(usesMobileWordCountForOverrideType(type) ? normalizedCount * 6 : normalizedCount);
        return isMobileOverrideChallengePlatform() ? formatIOSGibberishChallenge(raw) : raw;
    }
    if (usesMobileWordCountForOverrideType(type)) {
        return generateRandomWordsByCount(normalizedCount);
    }
    return generateRandomWords(normalizedCount);
}

// Generate gibberish
export function generateGibberish(count) {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < count; i++) {
        result += chars[Math.floor(Math.random() * chars.length)];
    }
    return result;
}

export function normalizeOverrideCount(value, type = 'random-words') {
    const parsed = parseInt(value, 10);
    if (!Number.isFinite(parsed)) return DEFAULT_OVERRIDE_COUNT;
    const maxCount = getMaxOverrideCharsForType(type);
    return Math.min(maxCount, Math.max(MIN_OVERRIDE_CHARS, parsed));
}

export function normalizeCustomOverrideText(value) {
    const text = typeof value === 'string' ? value : '';
    const maxChars = getMaxOverrideCharsForType('custom');
    return text.slice(0, maxChars);
}

export function getTypingCharsPerMinuteForType(type) {
    if (type === 'gibberish') return 150;
    if (type === 'custom') return 250; // Same assumption as random-words
    return 200; // random-words: used only for estimated time
}

export function getMaxOverrideCharsForType(type) {
    if (usesMobileWordCountForOverrideType(type)) return MAX_IOS_OVERRIDE_WORD_COUNT;
    if (type === 'gibberish') return 5000;
    return 7500; // random-words and custom: fixed max; estimated time uses CPM
}

export function getOverrideGeneratedCharCount(type, count) {
    const parsed = Number.parseInt(count, 10);
    const normalizedCount = Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
    if (!usesMobileWordCountForOverrideType(type)) return normalizedCount;

    if (type === 'random-words') {
        return getIOSRandomWordsCharCount(normalizedCount);
    }
    return normalizedCount * 6;
}

/** Letters-only workload for comparing override difficulties (e.g. override-all hardest). */
export function getDifficultyTypingCharCount(difficulty) {
    if (!difficulty) return 0;
    if (difficulty.type === 'custom') {
        return typeof difficulty.customText === 'string' ? difficulty.customText.length : 0;
    }
    const parsed = Number(difficulty.count);
    const count = difficulty.maxDifficulty === true
        ? getMaxOverrideCharsForType(difficulty.type)
        : (Number.isFinite(parsed) && parsed > 0 ? parsed : 50);
    return getOverrideGeneratedCharCount(difficulty.type, count);
}

/** Preview text for override difficulty (random words, gibberish, or custom). Used in blocklist modal. */
export function getOverridePreviewText(type, count, customText) {
    if (type === 'custom') {
        const t = typeof customText === 'string' ? customText : '';
        const normalized = t.replace(/[\r\n]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
        return normalized || 'Your custom text will appear here';
    }
    const num = parseInt(count, 10);
    const countNum = Number.isFinite(num) && num >= 0 ? num : 10;
    const generatedCharCount = getOverrideGeneratedCharCount(type, countNum);

    if (type !== state.lastOverridePreviewType) {
        state.lastOverridePreviewType = type;
        state.overridePreviewFrozenByType[type] = null;
    }

    if (type === 'random-words' || type === 'gibberish') {
        if (generatedCharCount >= OVERRIDE_PREVIEW_TRUNCATE_AT) {
            let frozen = state.overridePreviewFrozenByType[type];
            if (frozen != null) return frozen;
            const generated = type === 'gibberish'
                ? (isMobileOverrideChallengePlatform() ? formatIOSGibberishChallenge(generateGibberish(countNum * 6)) : generateGibberish(OVERRIDE_PREVIEW_TRUNCATE_AT))
                : (usesMobileWordCountForOverrideType(type)
                    ? generateRandomWordsByCount(countNum)
                    : generateRandomWords(countNum));
            frozen = generated.slice(0, OVERRIDE_PREVIEW_TRUNCATE_AT);
            state.overridePreviewFrozenByType[type] = frozen;
            return frozen;
        }
    }

    if (type === 'gibberish') {
        const generated = generateGibberish(usesMobileWordCountForOverrideType(type) ? countNum * 6 : countNum);
        return isMobileOverrideChallengePlatform() ? formatIOSGibberishChallenge(generated) : generated;
    }
    if (usesMobileWordCountForOverrideType(type)) {
        return generateRandomWordsByCount(countNum);
    }
    return generateRandomWords(countNum);
}

/** Estimated minutes to type the override challenge (based on character count and type). */
export function getOverrideEstimatedMinutes(type, count, customText) {
    if (type === 'custom') {
        const charCount = typeof customText === 'string' ? customText.length : 0;
        if (charCount <= 0) return 0;
        return Math.ceil(charCount / getTypingCharsPerMinuteForType('custom'));
    }

    const parsed = Number.parseInt(count, 10);
    const normalizedCount = Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
    if (normalizedCount <= 0) return 0;

    if (usesMobileWordCountForOverrideType(type)) {
        return Math.ceil(normalizedCount / IOS_OVERRIDE_WORDS_PER_MINUTE);
    }

    const charCount = getOverrideGeneratedCharCount(type, count);
    const cpm = getTypingCharsPerMinuteForType(type);
    return Math.ceil(charCount / cpm);
}

export function formatOverrideMaxDifficultyHint(type) {
    const count = getMaxOverrideCharsForType(type);
    const usesWords = usesMobileWordCountForOverrideType(type);
    const locale = getSettingsLanguage() === 'da' ? 'da-DK' : 'en-US';
    const countStr = count.toLocaleString(locale);
    return tSettingsFmt(
        usesWords ? 'overrideMaxDifficultyHintWords' : 'overrideMaxDifficultyHintChars',
        { count: countStr }
    );
}
