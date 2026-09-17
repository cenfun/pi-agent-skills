---
name: prefer-nodejs-scripts
description: Prefer Node.js scripts over Python when creating or running helper scripts for automation, data processing, file conversion, code generation, repository maintenance, or debugging. Use whenever a task may require writing an ad hoc script.
---

# Prefer Node.js Scripts

When a task requires creating or running a helper script, use Node.js instead of Python by default.

## Rules

1. Prefer a Node.js script for automation, data processing, file conversion, code generation, repository maintenance, debugging, and similar scripted work.
2. Use the Node.js version already available in the environment and prefer built-in modules such as `node:fs`, `node:path`, `node:url`, `node:process`, and `node:child_process`.
3. Follow the target repository's JavaScript module convention. Use ESM when the repository uses ESM; otherwise inspect `package.json` before choosing ESM or CommonJS.
4. Avoid adding npm dependencies for a temporary script when Node.js built-ins are sufficient.
5. Put temporary scripts and generated artifacts in the location required by the repository instructions. If no location is specified, use an existing project temporary directory or create `.temp/` in the project root.
6. Delete temporary scripts after use unless they are useful project tooling or the user asks to keep them.
7. Use Python only when there is a concrete reason, such as:
   - the user explicitly requests Python;
   - the required library or existing project tooling is Python-specific;
   - an existing Python script should be extended rather than replaced;
   - Node.js is unavailable;
   - Python provides a materially safer or more reliable solution for the task.
8. If Python is chosen despite this preference, briefly state the reason.

Simple shell commands remain appropriate for basic file listing, searching, and invoking existing tools; this preference applies when an actual helper script needs to be written or executed.
