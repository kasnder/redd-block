#!/usr/bin/env node
/**
 * Stamp What's new text into a Microsoft Store submission JSON from
 * `msstore submission get`, for `msstore submission updateMetadata`.
 *
 * Usage:
 *   node scripts/patch-store-release-notes.js submission.json whats_new.txt patched.json
 *
 * Walks listings case-insensitively (CLI may round-trip PascalCase or camelCase).
 */

const fs = require('fs');

const ANSI_RE =
  /\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b\][^\x07]*\x07|[\x00-\x08\x0b-\x1f]/g;

function keyOf(obj, name) {
  if (!obj || typeof obj !== 'object') return null;
  const lower = name.toLowerCase();
  for (const k of Object.keys(obj)) {
    if (k.toLowerCase() === lower) return k;
  }
  return null;
}

function patch(submission, notes) {
  const listingsKey = keyOf(submission, 'listings');
  if (!listingsKey || typeof submission[listingsKey] !== 'object') return 0;

  let stamped = 0;
  for (const listing of Object.values(submission[listingsKey])) {
    if (!listing || typeof listing !== 'object') continue;
    const baseKey = keyOf(listing, 'baseListing');
    const target =
      baseKey && listing[baseKey] && typeof listing[baseKey] === 'object'
        ? listing[baseKey]
        : listing;
    const notesKey = keyOf(target, 'releaseNotes') || 'releaseNotes';
    target[notesKey] = notes;
    stamped += 1;
  }
  return stamped;
}

/**
 * Repair `msstore submission get` stdout for JSON.parse.
 *
 * Spectre.Console wraps long lines at ~80 cols when stdout is redirected, which
 * inserts *literal* newlines inside JSON string values. Real newlines in those
 * strings were already escaped as `\n` by System.Text.Json — so any raw CR/LF
 * inside a string is a wrap artifact and must be removed (not turned into `\n`),
 * or we'd corrupt listing Description text on updateMetadata.
 */
function repairWrappedJsonStrings(text) {
  let out = '';
  let inString = false;
  let escape = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (escape) {
      out += c;
      escape = false;
      continue;
    }
    if (inString && c === '\\') {
      out += c;
      escape = true;
      continue;
    }
    if (c === '"') {
      inString = !inString;
      out += c;
      continue;
    }
    if (inString) {
      if (c === '\r') {
        if (text[i + 1] === '\n') i += 1;
        continue;
      }
      if (c === '\n') continue;
      const code = c.charCodeAt(0);
      if (code < 0x20) continue;
    }
    out += c;
  }
  return out;
}

function extractJson(raw) {
  const cleaned = raw.replace(ANSI_RE, '');
  const candidates = [];
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start !== -1 && end > start) {
    candidates.push(cleaned.slice(start, end + 1));
  }
  candidates.push(cleaned);

  let lastErr;
  for (const candidate of candidates) {
    for (const text of [candidate, repairWrappedJsonStrings(candidate)]) {
      try {
        return JSON.parse(text);
      } catch (err) {
        lastErr = err;
      }
    }
  }
  throw lastErr || new Error('no JSON object found in the CLI output');
}

function main() {
  const [subPath, notesPath, outPath] = process.argv.slice(2);
  if (!subPath || !notesPath || !outPath) {
    console.error(
      'usage: node scripts/patch-store-release-notes.js submission.json whats_new.txt patched.json',
    );
    process.exit(1);
  }

  const submission = extractJson(fs.readFileSync(subPath, 'utf8'));
  const notes = fs.readFileSync(notesPath, 'utf8').trim();
  if (!notes) {
    console.error('error: empty what\'s-new text');
    process.exit(1);
  }

  const stamped = patch(submission, notes);
  if (!stamped) {
    console.error(
      'error: no listings structure in the submission JSON — dump it and adjust this script.',
    );
    process.exit(1);
  }

  fs.writeFileSync(outPath, `${JSON.stringify(submission, null, 2)}\n`, 'utf8');
  console.log(`stamped releaseNotes on ${stamped} listing(s)`);
}

main();
