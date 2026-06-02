#!/usr/bin/env node
/**
 * Load repo-root .env into process.env. Returns number of keys set.
 * Used by run-tauri.js; also parses manually if dotenv finds nothing (UTF-16 etc.).
 */
const fs = require('fs');
const path = require('path');

function loadDotenv(repoRoot) {
  const envPath = path.join(repoRoot, '.env');
  let count = 0;

  if (!fs.existsSync(envPath)) {
    return { count: 0, path: envPath, missing: true };
  }

  const parsed = require('dotenv').config({ path: envPath });
  if (parsed.parsed) {
    count = Object.keys(parsed.parsed).length;
  }

  if (count === 0) {
    const raw = fs.readFileSync(envPath, 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (key && process.env[key] === undefined) {
        process.env[key] = value;
        count += 1;
      }
    }
  }

  return { count, path: envPath, missing: false };
}

module.exports = { loadDotenv };
