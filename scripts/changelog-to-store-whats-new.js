#!/usr/bin/env node
/**
 * Build store "What's new" plain text from changelog.md.
 *
 * User-facing Store notes (App Store–style): friendly intro, bullet list of
 * product changes only, then a fixed sign-off. Skips Version lines, empty
 * platform scaffolding, and release-engineering notes (CI / Store submit / …).
 *
 * Usage:
 *   node scripts/changelog-to-store-whats-new.js <version> [changelog.md] > whats_new.txt
 *   node scripts/changelog-to-store-whats-new.js 3.8.4 --out whats_new.txt
 *   node scripts/changelog-to-store-whats-new.js 3.8.4 --platform ios --out whats_new_ios.txt
 *
 * Without --platform, every bullet is included (existing Microsoft Store
 * behaviour). With --platform ios, only bullets that apply to iOS are kept:
 * shared sections (anything outside `### BY PLATFORM`) plus `#### iOS`
 * subsections; `#### DESKTOP` (and `##### macOS` / `##### Windows`) and
 * `#### ANDROID` bullets are dropped.
 *
 * Character limits: Partner Center allows 10,000 chars; the App Store
 * "What's New" field allows 4,000. We truncate the bullet list (keeping
 * intro + sign-off) if needed.
 */

const fs = require('fs');
const path = require('path');

const MAX_CHARS_DEFAULT = 10000;
const MAX_CHARS_APP_STORE = 4000;

const INTRO = `Hi folks,

This update comes with some helpful improvements!`;

const SIGNOFF = `Please keep suggesting improvements to the app - you can do so at https://github.com/ulyngs/redd-block

We hope you're enjoying ReDD Blocker!

- Ulrik, Tiago, & the Centre for Digital Habits Team
(digitalhabits.org)`;

function usage() {
  console.error(
    'usage: node scripts/changelog-to-store-whats-new.js <version> [changelog.md] [--platform ios] [--out file]',
  );
  process.exit(1);
}

function extractSection(changelog, version) {
  const tag = version.startsWith('v') ? version : `v${version}`;
  const lines = changelog.split(/\r?\n/);
  let found = false;
  const section = [];
  for (const line of lines) {
    if (/^## v\d/.test(line)) {
      if (found) break;
      if (line === `## ${tag}` || line.startsWith(`## ${tag} `)) {
        found = true;
        continue;
      }
    }
    if (found) section.push(line);
  }
  if (!found || section.every((l) => !l.trim())) {
    throw new Error(`No changelog section for ${tag} — add ## ${tag} first.`);
  }
  return section;
}

function stripMdInline(text) {
  return text
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .trim();
}

/** True for bullets that belong in the engineering changelog, not Store notes. */
function isInternalBullet(plain) {
  if (/^version:\s*/i.test(plain)) return true;
  if (
    /\b(store submit|partner center|github release|github actions|msstore|release workflow)\b/i.test(
      plain,
    )
  ) {
    return true;
  }
  if (/\bci\b.*\b(submit|publish|release)\b/i.test(plain)) return true;
  return false;
}

/**
 * Format a changelog bullet for Store notes.
 * `**Title.** Body` → `- "Title": Body`
 */
function formatStoreBullet(rawBody) {
  const plain = stripMdInline(rawBody);
  if (!plain || isInternalBullet(plain)) return null;

  const titled = plain.match(/^(.+?)\.\s+(.+)$/s);
  if (titled) {
    const title = titled[1].trim();
    const body = titled[2].trim();
    if (title && body) return `- "${title}": ${body}`;
  }
  return `- ${plain}`;
}

/**
 * Track which platform the current changelog subsection applies to.
 * `### <ANY>` headings are shared unless they are `### BY PLATFORM`;
 * under BY PLATFORM, `#### iOS` / `#### DESKTOP` / `#### ANDROID` scope
 * bullets to a platform (`##### macOS` / `##### Windows` stay desktop).
 */
function scopeForHeading(level, title, current) {
  if (level === 3) {
    return /by platform/i.test(title) ? 'by-platform' : 'shared';
  }
  if (level === 4) {
    if (/\bios\b/i.test(title)) return 'ios';
    if (/desktop|macos|windows|\bmac\b|\bwin\b/i.test(title)) return 'desktop';
    if (/android/i.test(title)) return 'android';
    return current === 'by-platform' ? 'by-platform' : 'shared';
  }
  // h5+ refine the current platform (e.g. macOS/Windows under DESKTOP).
  return current;
}

function scopeMatchesPlatform(scope, platform) {
  if (!platform) return true;
  if (scope === 'shared') return true;
  if (platform === 'ios') return scope === 'ios';
  return true;
}

function collectStoreBullets(sectionLines, platform) {
  const bullets = [];
  let scope = 'shared';
  for (let i = 0; i < sectionLines.length; i += 1) {
    const raw = sectionLines[i];
    const line = raw.replace(/\s+$/, '');

    if (/^>\s*/.test(line)) continue; // summary blockquote — intro covers this

    const heading = line.match(/^(#{3,6})\s+(.*)$/);
    if (heading) {
      scope = scopeForHeading(heading[1].length, heading[2], scope);
      continue;
    }
    if (/^#{2,6}\s+/.test(line)) continue; // drop remaining scaffolding

    if (!scopeMatchesPlatform(scope, platform)) continue;

    const bullet = line.match(/^\s*[-*]\s+(.*)$/);
    if (!bullet) continue;

    let body = bullet[1];
    while (i + 1 < sectionLines.length) {
      const next = sectionLines[i + 1];
      if (/^\s{2,}\S/.test(next) && !/^\s*[-*]\s+/.test(next) && !/^#{2,6}\s+/.test(next.trim())) {
        body = `${body} ${next.trim()}`;
        i += 1;
        continue;
      }
      break;
    }

    const formatted = formatStoreBullet(body);
    if (formatted) bullets.push(formatted);
  }
  return bullets;
}

function buildWhatsNew(bullets, maxChars, emptyOk) {
  if (!bullets.length) {
    if (emptyOk) return '';
    throw new Error(
      'No user-facing changelog bullets for Store notes (only Version / internal lines?).',
    );
  }

  const intro = INTRO;
  const signoff = SIGNOFF;
  const joiner = '\n\n';
  const fixedLen = intro.length + signoff.length + joiner.length * 2;

  let list = bullets.join('\n');
  if (fixedLen + list.length > maxChars) {
    const budget = maxChars - fixedLen - '\n\n…'.length;
    const kept = [];
    let used = 0;
    for (const b of bullets) {
      const add = (kept.length ? 1 : 0) + b.length;
      if (used + add > budget) break;
      kept.push(b);
      used += add;
    }
    if (!kept.length) {
      kept.push(`${bullets[0].slice(0, Math.max(40, budget - 1))}…`);
    }
    list = `${kept.join('\n')}\n…`;
  }

  return `${intro}${joiner}${list}${joiner}${signoff}`.trim();
}

function main() {
  const args = process.argv.slice(2);
  if (args.length < 1) usage();

  let outPath = null;
  let platform = null;
  let emptyOk = false;
  const positional = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--out') {
      outPath = args[++i];
      if (!outPath) usage();
    } else if (args[i] === '--empty-ok') {
      emptyOk = true;
    } else if (args[i] === '--platform') {
      platform = (args[++i] || '').toLowerCase();
      if (platform !== 'ios') usage();
    } else {
      positional.push(args[i]);
    }
  }

  const version = positional[0];
  if (!version) usage();
  const changelogPath = path.resolve(positional[1] || 'changelog.md');
  const maxChars = platform === 'ios' ? MAX_CHARS_APP_STORE : MAX_CHARS_DEFAULT;

  const markdown = fs.readFileSync(changelogPath, 'utf8');
  const sectionLines = extractSection(markdown, version);
  const bullets = collectStoreBullets(sectionLines, platform);
  const text = buildWhatsNew(bullets, maxChars, emptyOk);

  if (outPath) {
    fs.writeFileSync(outPath, text ? `${text}\n` : '', 'utf8');
    console.error(
      text
        ? `Wrote ${outPath} (${text.length} chars)`
        : `Wrote ${outPath} (empty — no ${platform || 'store'}-facing changes)`,
    );
  } else {
    process.stdout.write(text ? `${text}\n` : '');
  }
}

main();
