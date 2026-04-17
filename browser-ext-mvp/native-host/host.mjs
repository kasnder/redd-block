#!/usr/bin/env node
// Native messaging host for the ReDD Focus extension.
// Protocol: each message is a 4-byte little-endian length followed by a
// JSON-encoded UTF-8 payload, on stdin (extension -> host) and stdout
// (host -> extension). stderr is free for logging.
//
// MVP behavior:
//   1. On connect, push a hardcoded blocklist.
//   2. Echo any incoming message back with { echo: ... } for debugging.
//
// Real integration point: replace BLOCKLIST with whatever redd-block
// wants to enforce right now (scheduled focus session, user prefs, etc).

import { stdin, stdout, stderr } from "node:process";
import { appendFileSync } from "node:fs";

const LOG = `${process.env.HOME || "/tmp"}/Library/Application Support/redd-block-mvp/host.log`;
const log = (s) => { try { appendFileSync(LOG, `[host ${new Date().toISOString()}] ${s}\n`); } catch {} };
log(`spawned pid=${process.pid} argv=${process.argv.join(" ")}`);
process.on("exit", code => log(`exit ${code}`));
process.on("uncaughtException", e => log(`uncaughtException: ${e.stack}`));

const BLOCKLIST = [
  "reddit.com",
  "youtube.com",
  "x.com",
  "twitter.com",
  "instagram.com",
  "facebook.com",
];

function send(obj) {
  const buf = Buffer.from(JSON.stringify(obj), "utf8");
  const len = Buffer.alloc(4);
  len.writeUInt32LE(buf.length, 0);
  stdout.write(Buffer.concat([len, buf]));
}

// Read length-prefixed frames from stdin.
let buffer = Buffer.alloc(0);
stdin.on("data", chunk => {
  buffer = Buffer.concat([buffer, chunk]);
  while (buffer.length >= 4) {
    const len = buffer.readUInt32LE(0);
    if (buffer.length < 4 + len) break;
    const payload = buffer.slice(4, 4 + len).toString("utf8");
    buffer = buffer.slice(4 + len);
    try {
      const msg = JSON.parse(payload);
      stderr.write(`[host] recv: ${payload}\n`);
      send({ echo: msg });
    } catch (e) {
      stderr.write(`[host] parse error: ${e.message}\n`);
    }
  }
});

stdin.on("end", () => process.exit(0));

// Push the blocklist immediately on connect.
send({ blocklist: BLOCKLIST });
stderr.write(`[host] sent blocklist (${BLOCKLIST.length} domains)\n`);
