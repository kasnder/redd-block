#!/usr/bin/env node
// Scan installed browsers on macOS and report whether the ReDD Focus
// extension is present, enabled, and allowed in private/incognito mode
// across every user profile.
//
// Usage:
//   node scan.mjs
//   node scan.mjs --json
//
// Extension IDs (override via env if needed):
//   FIREFOX_EXT_ID   default: mindshield@example.com
//   CHROMIUM_EXT_ID  default: (unset — Chrome/Brave check skipped until known)

import { readFile, readdir, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { homedir, platform } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const pexec = promisify(execFile);

const HOME = homedir();
const PLATFORM = platform(); // "darwin" | "win32" | "linux"
const FIREFOX_ID = process.env.FIREFOX_EXT_ID || "mindshield@example.com";
// ReDD Focus: Hide Distractions (Chrome Web Store).
const CHROMIUM_ID = process.env.CHROMIUM_EXT_ID || "hhblkhfdjijdinijakbmcpkmdfhoadcd";

// Windows env var roots.
const APPDATA = process.env.APPDATA || `${HOME}\\AppData\\Roaming`;
const LOCALAPPDATA = process.env.LOCALAPPDATA || `${HOME}\\AppData\\Local`;

// Per-platform root paths. Windows + Linux entries are best-effort from
// vendor docs and haven't been validated on real machines yet.
const ROOTS = {
  firefox: {
    darwin: `${HOME}/Library/Application Support/Firefox`,
    win32: `${APPDATA}\\Mozilla\\Firefox`,
    linux: `${HOME}/.mozilla/firefox`,
  },
  chrome: {
    darwin: `${HOME}/Library/Application Support/Google/Chrome`,
    win32: `${LOCALAPPDATA}\\Google\\Chrome\\User Data`,
    linux: `${HOME}/.config/google-chrome`,
  },
  brave: {
    darwin: `${HOME}/Library/Application Support/BraveSoftware/Brave-Browser`,
    win32: `${LOCALAPPDATA}\\BraveSoftware\\Brave-Browser\\User Data`,
    linux: `${HOME}/.config/BraveSoftware/Brave-Browser`,
  },
  edge: {
    darwin: `${HOME}/Library/Application Support/Microsoft Edge`,
    win32: `${LOCALAPPDATA}\\Microsoft\\Edge\\User Data`,
    linux: `${HOME}/.config/microsoft-edge`,
  },
};

const BROWSERS = {
  firefox: { label: "Firefox", root: ROOTS.firefox[PLATFORM] },
  chrome:  { label: "Chrome",  root: ROOTS.chrome[PLATFORM] },
  brave:   { label: "Brave",   root: ROOTS.brave[PLATFORM] },
  edge:    { label: "Edge",    root: ROOTS.edge[PLATFORM] },
  safari:  { label: "Safari" }, // macOS only; handled specially.
};

// ---- Firefox ---------------------------------------------------------------

async function scanFirefox() {
  const root = BROWSERS.firefox.root;
  if (!existsSync(root)) return { present: false, profiles: [] };

  const profilesIni = join(root, "profiles.ini");
  const profileDirs = [];
  const defaultPaths = new Set();
  if (existsSync(profilesIni)) {
    const ini = await readFile(profilesIni, "utf8");
    // Per-installation default (authoritative for modern Firefox):
    // [InstallXXXX] Default=<relative path>
    for (const block of ini.split(/^\[/m)) {
      if (!block.startsWith("Install")) continue;
      const m = block.match(/^Default=(.+)$/m);
      if (m) defaultPaths.add(m[1].trim());
    }
    for (const m of ini.matchAll(/^Path=(.+)$/gm)) {
      profileDirs.push(m[1].trim());
    }
  } else {
    const profRoot = join(root, "Profiles");
    if (existsSync(profRoot)) {
      for (const entry of await readdir(profRoot)) {
        profileDirs.push(`Profiles/${entry}`);
      }
    }
  }

  const profiles = [];
  for (const rel of profileDirs) {
    const dir = join(root, rel);
    try {
      const st = await stat(dir);
      if (!st.isDirectory()) continue;
    } catch {
      continue;
    }

    const result = { name: rel, isDefault: defaultPaths.has(rel), installed: false, enabled: false, privateBrowsing: false };

    // extensions.json holds addon state.
    const extFile = join(dir, "extensions.json");
    if (existsSync(extFile)) {
      try {
        const data = JSON.parse(await readFile(extFile, "utf8"));
        const addon = (data.addons || []).find(a => a.id === FIREFOX_ID);
        if (addon) {
          result.installed = true;
          result.enabled = addon.active === true && addon.userDisabled !== true && addon.appDisabled !== true;
        }
      } catch {}
    }

    // Private-browsing permission lives in extension-preferences.json (newer) or permissions.sqlite.
    const prefsFile = join(dir, "extension-preferences.json");
    if (existsSync(prefsFile)) {
      try {
        const data = JSON.parse(await readFile(prefsFile, "utf8"));
        const perms = data[FIREFOX_ID]?.permissions || [];
        result.privateBrowsing = perms.includes("internal:privateBrowsingAllowed");
      } catch {}
    }

    profiles.push(result);
  }

  return { present: true, profiles };
}

// ---- Chromium (Chrome / Brave / Edge) --------------------------------------

async function scanChromium(browserKey) {
  const root = BROWSERS[browserKey].root;
  if (!existsSync(root)) return { present: false, profiles: [] };

  // "Local State" lists all profiles under profile.info_cache.
  const localStatePath = join(root, "Local State");
  const profileNames = [];
  let lastUsed = null;
  if (existsSync(localStatePath)) {
    try {
      const ls = JSON.parse(await readFile(localStatePath, "utf8"));
      for (const name of Object.keys(ls?.profile?.info_cache || {})) {
        profileNames.push(name);
      }
      lastUsed = ls?.profile?.last_used || null;
    } catch {}
  }
  if (profileNames.length === 0) {
    // Fallback: look for any directory that contains a Preferences file.
    for (const entry of await readdir(root, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      if (existsSync(join(root, entry.name, "Preferences"))) profileNames.push(entry.name);
    }
  }

  const profiles = [];
  for (const name of profileNames) {
    const dir = join(root, name);
    // "Default" is the initial profile dir; "last_used" is the most
    // recently active one. Mark either as default for user-facing display.
    const isDefault = name === (lastUsed || "Default");
    const result = { name, isDefault, installed: false, enabled: false, privateBrowsing: false };

    const prefsPath = join(dir, "Preferences");
    const securePrefsPath = join(dir, "Secure Preferences");
    const merged = {};
    for (const p of [prefsPath, securePrefsPath]) {
      if (!existsSync(p)) continue;
      try {
        const data = JSON.parse(await readFile(p, "utf8"));
        Object.assign(merged, data.extensions?.settings || {});
      } catch {}
    }

    if (!CHROMIUM_ID) {
      result.note = "CHROMIUM_EXT_ID not set";
      profiles.push(result);
      continue;
    }

    const ext = merged[CHROMIUM_ID];
    if (ext) {
      result.installed = true;
      // state: 1 = enabled, 0 = disabled, 2 = blacklisted.
      // Chromium often omits `state` for freshly-enabled webstore installs;
      // treat absent state + no disable_reasons as enabled.
      const hasDisableReasons = Array.isArray(ext.disable_reasons)
        ? ext.disable_reasons.length > 0
        : (typeof ext.disable_reasons === "number" && ext.disable_reasons !== 0);
      result.enabled = ext.state === 1 || (ext.state == null && !hasDisableReasons);
      result.privateBrowsing = ext.incognito === true;
    }
    profiles.push(result);
  }

  return { present: true, profiles };
}

// ---- Safari ---------------------------------------------------------------

async function scanSafari() {
  // Safari Web Extensions are App Extensions shipped inside a host app and
  // registered with PluginKit. Filter by protocol to avoid noise.
  const BUNDLE_ID = process.env.SAFARI_EXT_BUNDLE_ID || "com.ulriklyngs.mind-shield.mind-shield";
  const result = { present: true, profiles: [] };

  try {
    const { stdout } = await pexec("/usr/bin/pluginkit", [
      "-m", "-A", "-vvv", "-p", "com.apple.Safari.web-extension",
    ]);
    const lines = stdout.split("\n");
    const idx = lines.findIndex(l => l.includes(BUNDLE_ID));
    const found = idx >= 0;
    // pluginkit prefix: '+' enabled, '-' disabled, space = default (unset).
    // Safari's default is "disabled until user toggles it on", so an unset
    // state is likely disabled — but the ground-truth enable bit lives in
    // Safari's sandboxed prefs which require Full Disk Access to read.
    // We report `enabled: null` when unknown so callers can distinguish
    // "definitely off" from "can't tell".
    let enabled = null;
    if (found) {
      const prefix = lines[idx][0];
      if (prefix === "+") enabled = true;
      else if (prefix === "-") enabled = false;
    }
    result.profiles.push({
      name: "(Safari has no profiles)",
      isDefault: true,
      installed: found,
      enabled,
      privateBrowsing: null, // Not reachable without extension cooperation; see TODOs.
    });
  } catch (e) {
    result.present = false;
    result.error = e.message;
  }
  return result;
}

// ---- Main ------------------------------------------------------------------

const out = {
  firefox: await scanFirefox(),
  chrome: await scanChromium("chrome"),
  brave: await scanChromium("brave"),
  edge: await scanChromium("edge"),
  safari: PLATFORM === "darwin"
    ? await scanSafari()
    : { present: false, profiles: [], note: "Safari is macOS-only" },
};

if (process.argv.includes("--json")) {
  console.log(JSON.stringify(out, null, 2));
  process.exit(0);
}

const fmt = (b) => {
  if (!b.present) return "  (not installed)";
  if (b.profiles.length === 0) return "  (no profiles found)";
  return b.profiles.map(p => {
    const mark = (v) => (v === true ? "✓" : v === false ? "·" : "?");
    const note = p.note ? `  [${p.note}]` : "";
    const star = p.isDefault ? " ★" : "";
    return `  ${p.name}${star}\n    installed ${mark(p.installed)}  enabled ${mark(p.enabled)}  private ${mark(p.privateBrowsing)}${note}`;
  }).join("\n");
};

for (const [k, v] of Object.entries(out)) {
  console.log(`\n${BROWSERS[k].label}`);
  console.log(fmt(v));
}
