---
name: prefer-nodejs-scripts
description: Prefer Node.js scripts over Python for helper scripts and reuse existing scripts whenever practical. Use when writing ad hoc scripts or creating temporary files for any AI Agent task; recommend the project root `.temp/` as a shared temporary workspace for centralized management and cleanup, and ensure it is covered by `.gitignore`.
---

# Prefer Node.js Scripts

When a task requires creating or running a helper script, use Node.js instead of Python by default.

## Rules

1. Prefer a Node.js script for automation, data processing, file conversion, code generation, repository maintenance, debugging, and similar scripted work.
2. Use the Node.js version already available in the environment and prefer built-in modules such as `node:fs`, `node:path`, `node:url`, `node:process`, and `node:child_process`.
3. Follow the target repository's JavaScript module convention. Use ESM when the repository uses ESM; otherwise inspect `package.json` before choosing ESM or CommonJS.
4. Avoid adding npm dependencies for a temporary script when Node.js built-ins are sufficient.
5. Recommend the target project's `.temp/` directory for this skill's temporary work and for temporary files from other AI Agent tasks, so project temporary files can be managed and cleaned up centrally. Ensure `.temp/` is covered by the project's `.gitignore`. Explicit user paths and repository instructions take precedence; deliverables and files intended for commit belong in their requested or conventional locations.
6. Before writing a helper script, inspect `.temp/scripts/` for a suitable existing script and reuse or extend it whenever practical. Store new helper script files there and make them reusable where useful without overengineering simple one-off work. Retain useful scripts and requested deliverables, and clean up only disposable files created by the current task.
7. Use Python only when there is a concrete reason, such as:
   - the user explicitly requests Python;
   - the required library or existing project tooling is Python-specific;
   - an existing Python script should be extended rather than replaced;
   - Node.js is unavailable;
   - Python provides a materially safer or more reliable solution for the task.
8. If Python is chosen despite this preference, briefly state the reason.

Simple shell commands remain appropriate for basic file listing, searching, and invoking existing tools; this preference applies when an actual helper script needs to be written or executed.

## Temporary Directory Convention

Recommend `<project root>/.temp/` as the shared default workspace for temporary scripts, intermediate data, generated artifacts, logs, screenshots, and scratch files from both this skill and other AI Agent tasks. Centralizing these files makes project-level inspection, management, and cleanup easier; this convention is not limited to Node.js scripting. Explicit user paths and repository instructions take precedence; do not relocate requested deliverables or committed source files into `.temp/`.

- Determine the target project root from the user's target path, repository instructions, and repository/workspace markers. Do not assume the current working directory or the nearest `package.json` is the intended root: monorepos can contain nested packages, and `.git` can be a file in a worktree. If the target is ambiguous, clarify before creating files. Never choose the home directory or an unrelated ancestor as a fallback.
- Keep `projectRoot` separate from the invocation working directory. Resolve user-provided relative CLI paths against the original invocation directory, while resolving default temporary paths against `projectRoot`. If an existing tool must run from the project root, convert user-supplied paths to absolute paths before changing directories.
- Create `.temp/` on demand with `fs.mkdirSync(path.join(projectRoot, '.temp'), { recursive: true })` or `mkdir -p`. Reuse an existing `.temp/` instead of creating a parallel temp location. For concurrent tasks or collision-prone scratch output, create a task-specific directory under `.temp/scratch/`.
- Ensure the project's `.gitignore` covers `.temp/` before generating temporary files. Inspect existing `.gitignore` rules; if none covers it, create or update the project-root `.gitignore` with `/.temp/`, preserving existing contents and avoiding duplicates. If configuring this from a parent repository's `.gitignore`, use the target project's actual repository-relative path. Local `.git/info/exclude` or global ignore rules alone do not satisfy this convention: the rule must be shared through `.gitignore`. In Git repositories, verify with `git check-ignore -v -- .temp/` and confirm the effective rule comes from a `.gitignore` file. Report any `.gitignore` change; ignore rules do not untrack files already committed, so do not remove tracked files from the index without authorization. If explicit instructions forbid changing `.gitignore`, report the conflict rather than silently substituting a local ignore rule.
- Do not write secrets or credentials to temporary files. For user-requested sensitive business data, minimize fields, avoid exposing contents in logs, and report retained files and their locations. Git ignore rules are not a security boundary.
- Clean up only disposable files created by the current task. Do not delete an existing `.temp/` wholesale, glob-delete unknown files, or remove other tasks' output. Retain requested deliverables even when they are stored in `.temp/`, and report intentionally kept artifacts. For broader cleanup requests, establish the scope before deleting unknown files.

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

First inspect existing scripts in `.temp/scripts/`, read any candidate before executing it, and reuse or extend a suitable script whenever practical instead of creating duplicates. Apply the following conventions to scripts worth retaining there. Keep one-off scripts minimal; do not add a full CLI or dependencies solely to make a throwaway task reusable.

- Use descriptive kebab-case names and the extension that matches the repository module convention (`.mjs`, `.cjs`, or `.js`), for example `extract-json-from-html.mjs`.
- Make scripts parameterizable instead of hardcoding one task:
  - accept input and output paths as CLI arguments, with sensible defaults;
  - support `--help` that prints purpose, arguments, and a usage example;
  - resolve user-provided relative paths against the invocation directory and default temporary output paths against the target project root; accept absolute user paths, but do not hardcode machine-specific paths;
  - document project-specific default values and allow overriding them;
  - validate arguments and exit with a clear message and a non-zero exit code.
- Make scripts safe to re-run. Require explicit authorization such as `--force` before overwriting or deleting existing data. For file creation, use exclusive writes (`flag: 'wx'`) rather than relying on an existence check followed by a write; reject input/output path collisions for transformations that must preserve their input.
- Extend an existing script instead of creating `foo2.mjs`, `foo-3.mjs`, or near-duplicate variants.
- Start each script with a short header comment: purpose, usage example, inputs, outputs, and any required dependencies.
- Prefer Node.js built-ins. If a dependency is genuinely required, state the install command in the header and check availability before running.
- When a script turns out to be broadly useful, promote it out of `.temp/scripts/` into the repository's real tooling directory (for example `scripts/` or `tools/`), with the user's confirmation. `.temp/` is a staging area, not a permanent home.
- In the final summary, mention which scripts were kept in `.temp/scripts/` and how to run them, or which files were removed.

Minimal reusable script template (ESM, Node 18.3+ for `node:util` `parseArgs`; adapt to the available Node version and module convention). This runnable example copies input bytes; replace the marked transformation with the actual task. Different inputs with the same basename share a default output name, so use `--output` to disambiguate rather than overwriting unrelated output.

```js
#!/usr/bin/env node
// Purpose: copy input bytes; replace the transformation for the real task.
// Usage: node <project-root>/.temp/scripts/my-task.mjs <input> [options]
// Inputs: one file. Outputs: .temp/out/<basename>.out unless -o is given.
// Dependencies: Node.js built-ins only; Node 18.3+.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

// Assumes this script lives in <project-root>/.temp/scripts/.
// Adapt this root resolver if repository instructions place scripts elsewhere.
const projectRoot = fileURLToPath(new URL('../../', import.meta.url));
const invocationDir = process.cwd();
const usage = `Usage: node <project-root>/.temp/scripts/my-task.mjs <input> [options]
  -o, --output <file>  Output path (default: <project-root>/.temp/out/<basename>.out)
  --force              Allow replacing an existing output file
  -h, --help           Show help
Relative input and explicit output paths use the invocation working directory.
Example (from project root): node .temp/scripts/my-task.mjs data.json`;

try {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      output: { type: 'string', short: 'o' },
      force: { type: 'boolean' },
      help: { type: 'boolean', short: 'h' },
    },
  });

  if (values.help) {
    console.log(usage);
  } else {
    if (positionals.length !== 1 || values.output === '') {
      throw new Error(`Expected one input file and a non-empty output path.\n${usage}`);
    }
    const input = path.resolve(invocationDir, positionals[0]);
    const output = values.output === undefined
      ? path.join(projectRoot, '.temp', 'out', `${path.basename(input)}.out`)
      : path.resolve(invocationDir, values.output);

    // Read before writing, and protect aliases such as symlinks/hard links too.
    const inputStat = fs.statSync(input, { bigint: true });
    if (!inputStat.isFile()) throw new Error('Input must be a regular file.');
    let outputStat;
    try {
      outputStat = fs.statSync(output, { bigint: true });
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    if (input === output || (outputStat &&
        inputStat.dev === outputStat.dev && inputStat.ino === outputStat.ino)) {
      throw new Error('Input and output must be different files, even with --force.');
    }

    const result = fs.readFileSync(input); // Replace with the actual transformation.
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, result, { flag: values.force ? 'w' : 'wx' });
    console.log(`Wrote ${output}`);
  }
} catch (error) {
  console.error(error.code === 'EEXIST'
    ? 'Output already exists; choose another path or pass --force to replace it.'
    : error.message);
  process.exitCode = 1;
}
```

Exclusive creation prevents accidental replacement during concurrent creation; this minimal template is not a sandbox against concurrent path or symlink changes. For destructive or security-sensitive operations, use stronger validation appropriate to the task.
