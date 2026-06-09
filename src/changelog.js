import changelogMarkdown from '../changelog.md?raw';

/**
 * Extract user-facing bullet lines from changelog.md for a release version.
 * Expects a heading like `## v3.1.10`. Returns `[]` when the section is missing
 * or has no eligible bullets.
 *
 * @param {string} markdown Full changelog.md text
 * @param {string} version Semver without leading `v` (e.g. `3.1.10`)
 * @returns {string[]} One string per bullet (continuation lines joined)
 */
export function parseChangelogBullets(markdown, version) {
    const normalized = String(version || '').replace(/^v/i, '').trim();
    if (!normalized || !markdown) return [];

    const sectionRe = new RegExp(`^## v${escapeRegExp(normalized)}(?:\\s|$)`);
    const lines = markdown.split('\n');
    let inSection = false;
    const bullets = [];
    let current = null;

    for (const line of lines) {
        if (/^## v[0-9]/.test(line)) {
            if (inSection) break;
            if (sectionRe.test(line)) inSection = true;
            continue;
        }
        if (!inSection) continue;

        if (line.startsWith('- ')) {
            if (current) bullets.push(current);
            const text = line.slice(2).trim();
            if (/^\*\*Version:\*\*/i.test(text)) {
                current = null;
                continue;
            }
            current = text;
        } else if (current && line.trim() && !line.startsWith('#')) {
            current += ` ${line.trim()}`;
        }
    }
    if (current) bullets.push(current);

    return bullets;
}

/**
 * Release notes for a version from the bundled changelog.md.
 * @param {string} version
 * @returns {string[]}
 */
export function getReleaseNotesForVersion(version) {
    return parseChangelogBullets(changelogMarkdown, version);
}

function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
