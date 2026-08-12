#!/usr/bin/env node
// `preinstall` guard: refuse to install with anything but pnpm.
//
// Why this exists rather than the usual `npx only-allow pnpm`: only-allow is
// fetched from the registry on every install that runs this hook, which means a
// network round-trip and one more unpinned package executing during setup of an
// app whose whole job is enforcement. The check is four lines; it does not need
// a dependency.
//
// Why pnpm at all: see the package-manager section in AGENTS.md. Short version
// is that agent tasks run one git worktree each, and pnpm's content-addressed
// store hardlinks node_modules instead of copying ~250 MB per worktree.

const agent = process.env.npm_config_user_agent || '';

if (!agent.startsWith('pnpm/')) {
  const used = agent.split('/')[0] || 'that package manager';
  process.stderr.write(
    `\nThis project uses pnpm, not ${used}.\n\n` +
      `  pnpm install\n\n` +
      `If you don't have pnpm:  npm i -g pnpm  (or: corepack enable pnpm)\n` +
      `Why: AGENTS.md, "pnpm is the only supported package manager".\n\n`,
  );
  process.exit(1);
}
