---
name: prefer-nodejs-scripts
description: Prefer Node.js scripts over Python when creating or running helper scripts for automation, data processing, file conversion, code generation, repository maintenance, or debugging. Use whenever a task may require writing an ad hoc script or creating temporary files; temporary work belongs in the project root `.temp/` directory.
---

# Prefer Node.js Scripts

When a task requires creating or running a helper script, use Node.js instead of Python by default.

## Rules

1. Prefer a Node.js script for automation, data processing, file conversion, code generation, repository maintenance, debugging, and similar scripted work.
2. Use the Node.js version already available in the environment and prefer built-in modules such as `node:fs`, `node:path`, `node:url`, `node:process`, and `node:child_process`.
3. Follow the target repository's JavaScript module convention. Use ESM when the repository uses ESM; otherwise inspect `package.json` before choosing ESM or CommonJS.
4. Avoid adding npm dependencies for a temporary script when Node.js built-ins are sufficient.
5. Keep all temporary work inside the project root `.temp/` directory. If the repository instructions specify another location, follow them instead.
6. Store helper scripts in `.temp/scripts/` and write them so they can be reused later. Delete only scripts and artifacts that have no reuse value, or when the user asks for cleanup.
7. Use Python only when there is a concrete reason, such as:
   - the user explicitly requests Python;
   - the required library or existing project tooling is Python-specific;
   - an existing Python script should be extended rather than replaced;
   - Node.js is unavailable;
   - Python provides a materially safer or more reliable solution for the task.
8. If Python is chosen despite this preference, briefly state the reason.

Simple shell commands remain appropriate for basic file listing, searching, and invoking existing tools; this preference applies when an actual helper script needs to be written or executed.

## Temporary Directory Convention

Use `<project root>/.temp/` as the single default workspace for temporary scripts, intermediate data, generated artifacts, logs, and scratch files.

- Create `.temp/` on demand with `fs.mkdirSync(path.join(projectRoot, '.temp'), { recursive: true })` or `mkdir -p`.
- Determine the project root from repository markers (`.git/`, `package.json`, workspace files) or from the path the user points at, rather than assuming the current working directory. Never create `.temp/` in the home directory or an unrelated parent directory. Run scripts from the project root and resolve relative CLI paths against `process.cwd()`.
- If `.temp/` already exists, reuse it instead of creating a parallel temp location.
- Keep `.temp/` git-ignored. If the repository has no rule for it, add `.temp/` to `.gitignore` before generating files; use `.git/info/exclude` if the user prefers not to modify tracked files.
- Never put secrets, credentials, or anything that must be committed into `.temp/`.
- Clean up disposable output when the task is finished, and report any files you intentionally kept.

Recommended layout — keep small runs flat and create only the subdirectories you need (reusable scripts always live in `scripts/`):

```
.temp/
  scripts/   # reusable helper scripts
  data/      # intermediate inputs and exported data
  out/       # generated output to inspect or hand off
  logs/      # command logs, debug dumps
  scratch/   # truly disposable scratch files
```

## Reusable Script Conventions

Scripts in `.temp/scripts/` are a small toolbox, not write-once throwaways.

- Use descriptive kebab-case names and the extension that matches the repository module convention (`.mjs`, `.cjs`, or `.js`), for example `extract-json-from-html.mjs`.
- Make scripts parameterizable instead of hardcoding one task:
  - accept input and output paths as CLI arguments, with sensible defaults;
  - support `--help` that prints purpose, arguments, and a usage example;
  - resolve paths relative to the given arguments or `process.cwd()`, never absolute machine-specific paths;
  - document project-specific default values and allow overriding them;
  - validate arguments and exit with a clear message and a non-zero exit code.
- Make scripts idempotent and safe to re-run. Require an explicit flag such as `--force` before overwriting or deleting existing data.
- Extend an existing script instead of creating `foo2.mjs`, `foo-3.mjs`, or near-duplicate variants.
- Start each script with a short header comment: purpose, usage example, inputs, outputs, and any required dependencies.
- Prefer Node.js built-ins. If a dependency is genuinely required, state the install command in the header and check availability before running.
- When a script turns out to be broadly useful, promote it out of `.temp/scripts/` into the repository's real tooling directory (for example `scripts/` or `tools/`), with the user's confirmation. `.temp/` is a staging area, not a permanent home.
- In the final summary, mention which scripts were kept in `.temp/scripts/` and how to run them, or which files were removed.

Minimal reusable script template (ESM, Node 18.3+ for `node:util` `parseArgs`):

```js
#!/usr/bin/env node
// Purpose: convert <input> into <output> (describe the real task).
// Usage: node .temp/scripts/my-task.mjs <input> [-o output] [--force]

import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    output: { type: 'string', short: 'o' },
    force: { type: 'boolean', default: false },
    help: { type: 'boolean', short: 'h', default: false },
  },
});

if (values.help || positionals.length !== 1) {
  console.log('Usage: node .temp/scripts/my-task.mjs <input> [-o output] [--force]');
  process.exit(values.help ? 0 : 1);
}

const input = path.resolve(positionals[0]);
const output = path.resolve(values.output ?? `${input}.out`);
if (fs.existsSync(output) && !values.force) {
  console.error(`Refusing to overwrite ${output}; pass --force to replace it.`);
  process.exit(1);
}
// ...do the work, then write `output`...
```
