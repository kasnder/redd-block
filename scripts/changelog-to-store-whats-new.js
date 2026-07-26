#!/usr/bin/env node
/**
 * Build Partner Center "What's new" plain text from changelog.md.
 *
 * Usage:
 *   node scripts/changelog-to-store-whats-new.js <version> [changelog.md] > whats_new.txt
 *   node scripts/changelog-to-store-whats-new.js 3.8.3 --out whats_new.txt
 *
 * Partner Center What's new limit is 10,000 characters; we truncate with an
 * ellipsis note if needed.
 */

const fs = require('fs');
const path = require('path');

const MAX_CHARS = 10000;

function usage() {
  console.error(
    'usage: node scripts/changelog-to-store-whats-new.js <version> [changelog.md] [--out file]',
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
  return section.join('\n');
}

function toStorePlainText(markdown) {
  const out = [];
  for (const raw of markdown.split(/\r?\n/)) {
    let line = raw.replace(/\s+$/, '');

    if (!line.trim()) {
      if (out.length && out[out.length - 1] !== '') out.push('');
      continue;
    }

    if (/^>\s*/.test(line)) {
      line = line.replace(/^>\s*/, '').replace(/\*\*/g, '').trim();
      if (line) out.push(line);
      continue;
    }

    const heading = line.match(/^(#{2,6})\s+(.*)$/);
    if (heading) {
      const title = heading[2].replace(/\*\*/g, '').trim();
      if (title) {
        if (out.length && out[out.length - 1] !== '') out.push('');
        out.push(title);
      }
      continue;
    }

    const bullet = line.match(/^\s*[-*]\s+(.*)$/);
    if (bullet) {
      const body = bullet[1]
        .replace(/\*\*([^*]+)\*\*/g, '$1')
        .replace(/`([^`]+)`/g, '$1')
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        .trim();
      out.push(`• ${body}`);
      continue;
    }

    // Indented continuation of the previous bullet
    if (/^\s{2,}\S/.test(raw) && out.length && out[out.length - 1].startsWith('• ')) {
      const cont = line
        .replace(/\*\*([^*]+)\*\*/g, '$1')
        .replace(/`([^`]+)`/g, '$1')
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        .trim();
      if (cont) out[out.length - 1] = `${out[out.length - 1]} ${cont}`;
      continue;
    }

    line = line
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .trim();
    if (line) out.push(line);
  }

  while (out.length && out[out.length - 1] === '') out.pop();
  return out.join('\n').trim();
}

function truncate(text) {
  if (text.length <= MAX_CHARS) return text;
  const note = '\n\n…(truncated for Store listing length)';
  const budget = MAX_CHARS - note.length;
  let cut = text.slice(0, budget);
  const lastNewline = cut.lastIndexOf('\n');
  if (lastNewline > budget * 0.6) cut = cut.slice(0, lastNewline);
  return `${cut.trimEnd()}${note}`;
}

function main() {
  const args = process.argv.slice(2);
  if (args.length < 1) usage();

  let outPath = null;
  const positional = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--out') {
      outPath = args[++i];
      if (!outPath) usage();
    } else {
      positional.push(args[i]);
    }
  }

  const version = positional[0];
  if (!version) usage();
  const changelogPath = path.resolve(positional[1] || 'changelog.md');

  const markdown = fs.readFileSync(changelogPath, 'utf8');
  const section = extractSection(markdown, version);
  const text = truncate(toStorePlainText(section));
  if (!text) {
    console.error('error: empty What\'s new after converting changelog section');
    process.exit(1);
  }

  if (outPath) {
    fs.writeFileSync(outPath, `${text}\n`, 'utf8');
    console.error(`Wrote ${outPath} (${text.length} chars)`);
  } else {
    process.stdout.write(`${text}\n`);
  }
}

main();
