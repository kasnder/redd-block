#!/usr/bin/env node

const { spawn } = require("node:child_process");

const args = process.argv.slice(2);

const isWindows = process.platform === "win32";
const command = isWindows ? "powershell" : "bash";
const scriptPath = isWindows ? "./scripts/android-build.ps1" : "./scripts/android-build.sh";
const commandArgs = isWindows
  ? ["-ExecutionPolicy", "Bypass", "-File", scriptPath, ...args.map((arg) => (arg === "--apk" ? "-Apk" : arg))]
  : [scriptPath, ...args];

const child = spawn(command, commandArgs, {
  stdio: "inherit",
  shell: false,
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});

child.on("error", (error) => {
  console.error(`Failed to start ${command}:`, error.message);
  process.exit(1);
});
