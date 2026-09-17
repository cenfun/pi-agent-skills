#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

function fail(message) {
  console.error(`Error: ${message}`);
  process.exit(1);
}

function usage() {
  console.log(`Usage:
  inspect-snapshot.mjs <snapshot.json> summary
  inspect-snapshot.mjs <snapshot.json> outline [--depth N] [--max N]
  inspect-snapshot.mjs <snapshot.json> screens [--width N] [--height N] [--max N]
  inspect-snapshot.mjs <snapshot.json> search <query> [--type TYPE] [--max N]
  inspect-snapshot.mjs <snapshot.json> get <tree/path> [--depth N] [--out FILE]
  inspect-snapshot.mjs <snapshot.json> assets [--max N]
  inspect-snapshot.mjs <snapshot.json> css-vars`);
}

function parseOptions(argv) {
  const positional = [];
  const options = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) {
      positional.push(arg);
      continue;
    }
    const [rawKey, inlineValue] = arg.slice(2).split('=', 2);
    if (inlineValue !== undefined) {
      options[rawKey] = inlineValue;
    } else if (argv[i + 1] && !argv[i + 1].startsWith('--')) {
      options[rawKey] = argv[i + 1];
      i += 1;
    } else {
      options[rawKey] = true;
    }
  }
  return { positional, options };
}

function numberOption(options, name, fallback) {
  if (options[name] === undefined) return fallback;
  const value = Number(options[name]);
  if (!Number.isFinite(value) || value < 0) fail(`--${name} must be a non-negative number`);
  return value;
}

function loadSnapshot(file) {
  let source;
  try {
    source = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
  } catch (error) {
    fail(`cannot read ${file}: ${error.message}`);
  }
  try {
    return JSON.parse(source);
  } catch (error) {
    fail(`invalid JSON in ${file}: ${error.message}`);
  }
}

function walk(node, nodePath = 'tree', depth = 0, parent = null, visit) {
  if (!node || typeof node !== 'object') return;
  visit(node, nodePath, depth, parent);
  if (!Array.isArray(node.ch)) return;
  node.ch.forEach((child, index) => walk(child, `${nodePath}/ch/${index}`, depth + 1, node, visit));
}

function resolveTreePath(snapshot, value) {
  const parts = value.replace(/^\/+|\/+$/g, '').split('/').filter(Boolean);
  if (parts[0] !== 'tree') fail('get path must start with tree');
  let current = snapshot.tree;
  for (let i = 1; i < parts.length; i += 1) {
    const part = parts[i];
    if (part === 'ch') {
      const index = Number(parts[i + 1]);
      if (!Number.isInteger(index) || !Array.isArray(current?.ch) || !current.ch[index]) {
        fail(`invalid child index at ${parts.slice(0, i + 2).join('/')}`);
      }
      current = current.ch[index];
      i += 1;
    } else {
      if (!current || !(part in current)) fail(`unknown path segment: ${part}`);
      current = current[part];
    }
  }
  return current;
}

function compactText(node, max = 54) {
  const value = typeof node.c === 'string' ? node.c.replace(/\s+/g, ' ').trim() : '';
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

function describe(node) {
  const dimensions = node.w !== undefined || node.h !== undefined ? ` ${node.w ?? '?'}x${node.h ?? '?'}` : '';
  const layout = node.l ? ` ${node.l}${node.g !== undefined ? ` gap=${node.g}` : ''}` : '';
  const children = Array.isArray(node.ch) ? ` children=${node.ch.length}` : '';
  const component = node.componentName ? ` component=${JSON.stringify(node.componentName)}` : '';
  const role = node.sm?.role ? ` role=${node.sm.role}` : '';
  const text = compactText(node);
  return `${node.t ?? '?'} ${JSON.stringify(node.n ?? '')}${dimensions}${layout}${children}${component}${role}${text ? ` text=${JSON.stringify(text)}` : ''}`;
}

function countTree(root) {
  const types = {};
  let count = 0;
  walk(root, 'tree', 0, null, node => {
    count += 1;
    types[node.t ?? 'unknown'] = (types[node.t ?? 'unknown'] ?? 0) + 1;
  });
  return { count, types };
}

function prune(node, maxDepth, depth = 0) {
  if (!node || typeof node !== 'object') return node;
  if (Array.isArray(node)) return node.map(value => prune(value, maxDepth, depth));
  const result = {};
  for (const [key, value] of Object.entries(node)) {
    if (key === 'ch' && Array.isArray(value)) {
      if (depth >= maxDepth) {
        result._omittedChildren = value.length;
      } else {
        result.ch = value.map(child => prune(child, maxDepth, depth + 1));
      }
    } else {
      result[key] = value;
    }
  }
  return result;
}

const { positional, options } = parseOptions(process.argv.slice(2));
if (positional.length < 2 || positional.includes('--help')) {
  usage();
  process.exit(positional.length < 2 ? 1 : 0);
}

const [snapshotFile, command, ...commandArgs] = positional;
const snapshot = loadSnapshot(snapshotFile);
if (!snapshot.tree) fail('snapshot has no tree');

switch (command) {
  case 'summary': {
    const { count, types } = countTree(snapshot.tree);
    const tokens = snapshot.tokens ?? {};
    console.log(JSON.stringify({
      version: snapshot.v,
      name: snapshot.name,
      format: snapshot._meta?.format,
      nodes: count,
      types,
      tokens: {
        colors: Object.keys(tokens.colors ?? {}).length,
        fonts: Object.keys(tokens.fonts ?? {}).length,
        shadows: Object.keys(tokens.shadows ?? {}).length,
      },
      root: {
        ...Object.fromEntries(Object.entries(snapshot.tree).filter(([key]) => key !== 'ch')),
        children: snapshot.tree.ch?.map((node, index) => ({ index, description: describe(node) })) ?? [],
      },
    }, null, 2));
    break;
  }

  case 'outline': {
    const maxDepth = numberOption(options, 'depth', 3);
    const max = numberOption(options, 'max', 200);
    let emitted = 0;
    walk(snapshot.tree, 'tree', 0, null, (node, nodePath, depth) => {
      if (depth > maxDepth || emitted >= max) return;
      console.log(`${'  '.repeat(depth)}${nodePath}  ${describe(node)}`);
      emitted += 1;
    });
    if (emitted >= max) console.error(`Output limited to ${max} nodes. Increase --max or use search/get.`);
    break;
  }

  case 'screens': {
    const width = numberOption(options, 'width', 375);
    const height = numberOption(options, 'height', 812);
    const max = numberOption(options, 'max', 200);
    const matches = [];
    walk(snapshot.tree, 'tree', 0, null, (node, nodePath, depth, parent) => {
      if (node.t === 'frame' && Number(node.w) === width && Number(node.h) === height) {
        matches.push({ path: nodePath, depth, parent: parent?.n, description: describe(node) });
      }
    });
    console.log(JSON.stringify({ width, height, count: matches.length, results: matches.slice(0, max) }, null, 2));
    break;
  }

  case 'search': {
    const query = commandArgs.join(' ').toLocaleLowerCase();
    if (!query) fail('search requires a query');
    const type = options.type ? String(options.type).toLocaleLowerCase() : null;
    const max = numberOption(options, 'max', 100);
    const results = [];
    walk(snapshot.tree, 'tree', 0, null, (node, nodePath, depth, parent) => {
      if (results.length >= max || (type && String(node.t).toLocaleLowerCase() !== type)) return;
      const haystack = [node.n, node.c, node.componentName, node.sm?.role, node.pi?.pattern]
        .filter(value => value !== undefined)
        .map(value => typeof value === 'string' ? value : JSON.stringify(value))
        .join('\n')
        .toLocaleLowerCase();
      if (haystack.includes(query)) {
        results.push({ path: nodePath, depth, parent: parent?.n, description: describe(node) });
      }
    });
    console.log(JSON.stringify({ query, type, count: results.length, results }, null, 2));
    break;
  }

  case 'get': {
    const treePath = commandArgs[0];
    if (!treePath) fail('get requires a tree path');
    const maxDepth = numberOption(options, 'depth', 8);
    const value = prune(resolveTreePath(snapshot, treePath), maxDepth);
    const output = `${JSON.stringify(value, null, 2)}\n`;
    if (options.out) {
      const outputFile = path.resolve(String(options.out));
      fs.mkdirSync(path.dirname(outputFile), { recursive: true });
      fs.writeFileSync(outputFile, output);
      console.log(`Wrote ${outputFile}`);
    } else {
      process.stdout.write(output);
    }
    break;
  }

  case 'assets': {
    const max = numberOption(options, 'max', 100);
    const images = [];
    const vectors = [];
    walk(snapshot.tree, 'tree', 0, null, (node, nodePath, depth, parent) => {
      const record = {
        path: nodePath,
        parent: parent?.n,
        name: node.n,
        size: node.w !== undefined || node.h !== undefined ? [node.w, node.h] : undefined,
      };
      if (node.t === 'img') images.push({ ...record, nodeId: node.nId, imageRef: node.iR, fit: node.ft, alt: node.alt, originalSize: node.oS, cropRect: node.cR });
      if (node.t === 'vector') vectors.push({ ...record, color: node.bg, role: node.sm?.role, hasPathData: Boolean(node.path || node.paths || node.d) });
    });
    console.log(JSON.stringify({
      images: { count: images.length, results: images.slice(0, max) },
      vectors: { count: vectors.length, results: vectors.slice(0, max) },
    }, null, 2));
    break;
  }

  case 'css-vars': {
    const lines = [':root {'];
    for (const [name, value] of Object.entries(snapshot.tokens?.colors ?? {})) lines.push(`  --figma-${name}: ${value};`);
    for (const [name, value] of Object.entries(snapshot.tokens?.fonts ?? {})) lines.push(`  --figma-${name}: ${JSON.stringify(value)};`);
    for (const [name, value] of Object.entries(snapshot.tokens?.shadows ?? {})) lines.push(`  --figma-${name}: ${value};`);
    lines.push('}');
    console.log(lines.join('\n'));
    break;
  }

  default:
    usage();
    fail(`unknown command: ${command}`);
}
