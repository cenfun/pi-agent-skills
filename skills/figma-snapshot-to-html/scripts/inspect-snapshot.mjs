#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

function fail(message) {
  console.error(`Error: ${message}`);
  process.exit(1);
}

function usage() {
  console.log(`Usage:
  inspect-snapshot.mjs <snapshot.json> summary [--max N]
  inspect-snapshot.mjs <snapshot.json> meta
  inspect-snapshot.mjs <snapshot.json> outline [--depth N] [--max N]
  inspect-snapshot.mjs <snapshot.json> screens [--width N] [--height N] [--max N]
  inspect-snapshot.mjs <snapshot.json> search <query> [--type TYPE] [--max N]
  inspect-snapshot.mjs <snapshot.json> get <tree/path> [--depth N] [--with-tokens] [--out FILE]
  inspect-snapshot.mjs <snapshot.json> inventory [tree/path] [--max N]
  inspect-snapshot.mjs <snapshot.json> diagnostics [tree/path] [--max N]
  inspect-snapshot.mjs <snapshot.json> interactions [tree/path] [--max N]
  inspect-snapshot.mjs <snapshot.json> assets [tree/path] [--max N]
  inspect-snapshot.mjs <snapshot.json> tokens [tree/path]
  inspect-snapshot.mjs <snapshot.json> css-vars [tree/path]`);
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

function countOption(options, name, fallback) {
  const value = numberOption(options, name, fallback);
  if (!Number.isSafeInteger(value)) fail(`--${name} must be a non-negative integer`);
  return value;
}

function loadSnapshot(file) {
  let source;
  try {
    source = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
  } catch (error) {
    fail(`cannot read ${file}: ${error.message}`);
  }
  let snapshot;
  try {
    snapshot = JSON.parse(source);
  } catch (error) {
    fail(`invalid JSON in ${file}: ${error.message}`);
  }
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
    fail(`${file} must contain a JSON object`);
  }
  if (!snapshot.tree || typeof snapshot.tree !== 'object' || Array.isArray(snapshot.tree)) {
    fail(`${file} has no valid tree object`);
  }
  return snapshot;
}

function walk(node, nodePath = 'tree', depth = 0, parent = null, visit, maxDepth = Infinity) {
  if (!node || typeof node !== 'object') return;
  visit(node, nodePath, depth, parent);
  if (depth >= maxDepth || !Array.isArray(node.ch)) return;
  node.ch.forEach((child, index) => walk(
    child,
    `${nodePath}/ch/${index}`,
    depth + 1,
    node,
    visit,
    maxDepth,
  ));
}

function resolveTreePath(snapshot, value) {
  const parts = value.replace(/^\/+|\/+$/g, '').split('/').filter(Boolean);
  if (parts[0] !== 'tree') fail('tree path must start with tree');
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

function commandRoot(snapshot, commandArgs) {
  const treePath = commandArgs[0] ?? 'tree';
  return { treePath, root: resolveTreePath(snapshot, treePath) };
}

const TOKEN_VALUE_KEYS = new Set(['bg', 'cl', 'f', 'sh', 'color']);

function collectTokenRefs(value, refs = new Set(), key = null, owner = null) {
  if (typeof value === 'string') {
    const isBorderColor = key === 'c' && owner && owner.t === undefined;
    if ((TOKEN_VALUE_KEYS.has(key) || isBorderColor) && /^\$(?:c|f|s)\d+$/.test(value)) {
      refs.add(value);
    }
  } else if (Array.isArray(value)) {
    value.forEach(item => collectTokenRefs(item, refs, key, owner));
  } else if (value && typeof value === 'object') {
    Object.entries(value).forEach(([childKey, item]) => collectTokenRefs(item, refs, childKey, value));
  }
  return refs;
}

function compareTokenRefs(a, b) {
  const [, aKind, aIndex] = /^\$([cfs])(\d+)$/.exec(a) ?? [];
  const [, bKind, bIndex] = /^\$([cfs])(\d+)$/.exec(b) ?? [];
  return aKind?.localeCompare(bKind) || Number(aIndex) - Number(bIndex);
}

function tokenDetails(snapshot, root) {
  const tokens = { colors: {}, fonts: {}, shadows: {} };
  const missing = [];
  const groups = { c: 'colors', f: 'fonts', s: 'shadows' };
  for (const ref of [...collectTokenRefs(root)].sort(compareTokenRefs)) {
    const match = /^\$([cfs])(\d+)$/.exec(ref);
    if (!match) continue;
    const group = groups[match[1]];
    const key = `${match[1]}${match[2]}`;
    if (Object.prototype.hasOwnProperty.call(snapshot.tokens?.[group] ?? {}, key)) {
      tokens[group][key] = snapshot.tokens[group][key];
    } else {
      missing.push(ref);
    }
  }
  return { tokens, missing };
}

function referencedTokens(snapshot, root) {
  return tokenDetails(snapshot, root).tokens;
}

const INTERACTIVE_ROLES = new Set(['button', 'input', 'link', 'tab', 'menu', 'dropdown', 'listItem']);

function interactionEvidence(node) {
  const sources = [];
  if (Array.isArray(node.ia) && node.ia.length > 0) sources.push('prototype');
  if (node.variantProps && Object.keys(node.variantProps).length > 0) sources.push('variant');
  if (node.sm?.state) sources.push('inferred-state');
  if (node.pi?.pattern) sources.push('inferred-pattern');
  if (node.sm?.interactive || INTERACTIVE_ROLES.has(node.sm?.role)) sources.push('inferred-semantic');
  return sources;
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
  const state = node.sm?.state ? ` state=${node.sm.state}` : '';
  const pattern = node.pi?.pattern ? ` pattern=${node.pi.pattern}` : '';
  const text = compactText(node);
  return `${node.t ?? '?'} ${JSON.stringify(node.n ?? '')}${dimensions}${layout}${children}${component}${role}${state}${pattern}${text ? ` text=${JSON.stringify(text)}` : ''}`;
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
if (options.help || positional[0] === 'help') {
  usage();
  process.exit(0);
}
if (positional.length < 2) {
  usage();
  process.exit(1);
}

const [snapshotFile, command, ...commandArgs] = positional;
const snapshot = loadSnapshot(snapshotFile);

switch (command) {
  case 'summary': {
    const { count, types } = countTree(snapshot.tree);
    const tokens = snapshot.tokens ?? {};
    const max = countOption(options, 'max', 40);
    const children = Array.isArray(snapshot.tree.ch) ? snapshot.tree.ch : [];
    console.log(JSON.stringify({
      version: snapshot.v,
      name: snapshot.name,
      format: snapshot._meta?.format,
      selfDocumented: Boolean(snapshot._meta),
      nodes: count,
      types,
      tokens: {
        colors: Object.keys(tokens.colors ?? {}).length,
        fonts: Object.keys(tokens.fonts ?? {}).length,
        shadows: Object.keys(tokens.shadows ?? {}).length,
      },
      root: {
        description: describe(snapshot.tree),
        childCount: children.length,
        children: children.slice(0, max).map((node, index) => ({ index, description: describe(node) })),
        truncated: children.length > max,
      },
    }, null, 2));
    break;
  }

  case 'meta': {
    console.log(JSON.stringify(snapshot._meta ?? {}, null, 2));
    break;
  }

  case 'outline': {
    const maxDepth = countOption(options, 'depth', 3);
    const max = countOption(options, 'max', 200);
    let matched = 0;
    let emitted = 0;
    walk(snapshot.tree, 'tree', 0, null, (node, nodePath, depth) => {
      matched += 1;
      if (emitted >= max) return;
      console.log(`${'  '.repeat(depth)}${nodePath}  ${describe(node)}`);
      emitted += 1;
    }, maxDepth);
    if (matched > emitted) console.error(`Output limited to ${max} nodes. Increase --max or use search/get.`);
    break;
  }

  case 'screens': {
    const width = numberOption(options, 'width', 375);
    const height = numberOption(options, 'height', 812);
    const max = countOption(options, 'max', 200);
    const results = [];
    let count = 0;
    walk(snapshot.tree, 'tree', 0, null, (node, nodePath, depth, parent) => {
      if (node.t === 'frame' && Number(node.w) === width && Number(node.h) === height) {
        count += 1;
        if (results.length < max) {
          results.push({ path: nodePath, depth, parent: parent?.n, description: describe(node) });
        }
      }
    });
    console.log(JSON.stringify({ width, height, count, results, truncated: count > results.length }, null, 2));
    break;
  }

  case 'search': {
    const query = commandArgs.join(' ').toLocaleLowerCase();
    if (!query) fail('search requires a query');
    const type = options.type ? String(options.type).toLocaleLowerCase() : null;
    const max = countOption(options, 'max', 100);
    const results = [];
    let count = 0;
    walk(snapshot.tree, 'tree', 0, null, (node, nodePath, depth, parent) => {
      if (type && String(node.t).toLocaleLowerCase() !== type) return;
      const haystack = [
        node.n,
        node.c,
        node.nId,
        node.componentName,
        node.componentDesc,
        node.variantProps,
        node.sm,
        node.pi,
        node.ia,
        node.di,
      ]
        .filter(value => value !== undefined)
        .map(value => typeof value === 'string' ? value : JSON.stringify(value))
        .join('\n')
        .toLocaleLowerCase();
      if (haystack.includes(query)) {
        count += 1;
        if (results.length < max) {
          results.push({ path: nodePath, depth, parent: parent?.n, description: describe(node) });
        }
      }
    });
    console.log(JSON.stringify({ query, type, count, results, truncated: count > results.length }, null, 2));
    break;
  }

  case 'get': {
    const treePath = commandArgs[0];
    if (!treePath) fail('get requires a tree path');
    const maxDepth = countOption(options, 'depth', 8);
    const value = prune(resolveTreePath(snapshot, treePath), maxDepth);
    const details = tokenDetails(snapshot, value);
    const result = options['with-tokens']
      ? {
          v: snapshot.v,
          name: value?.n ?? snapshot.name,
          tokens: details.tokens,
          ...(details.missing.length > 0 ? { missingTokenRefs: details.missing } : {}),
          tree: value,
        }
      : value;
    const output = `${JSON.stringify(result, null, 2)}\n`;
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

  case 'inventory': {
    const max = countOption(options, 'max', 120);
    const { treePath, root } = commandRoot(snapshot, commandArgs);
    const types = {};
    const layouts = {};
    const texts = [];
    const components = new Map();
    const roles = {};
    const patterns = {};
    const responsive = { breakpoints: {}, fluid: 0, grow: 0, shrink0: 0 };
    const interactionSources = {};
    let nodeCount = 0;
    let textCount = 0;
    let interactionCount = 0;
    let imageCount = 0;
    let vectorCount = 0;
    walk(root, treePath, 0, null, (node, nodePath) => {
      nodeCount += 1;
      types[node.t ?? 'unknown'] = (types[node.t ?? 'unknown'] ?? 0) + 1;
      if (node.l) layouts[node.l] = (layouts[node.l] ?? 0) + 1;
      if (typeof node.c === 'string') {
        textCount += 1;
        if (texts.length < max) texts.push({ path: nodePath, text: compactText(node, 160) });
      }
      if (node.componentName) {
        const key = JSON.stringify({ name: node.componentName, variants: node.variantProps ?? null });
        components.set(key, { name: node.componentName, variants: node.variantProps, count: (components.get(key)?.count ?? 0) + 1 });
      }
      if (node.sm?.role) roles[node.sm.role] = (roles[node.sm.role] ?? 0) + 1;
      if (node.pi?.pattern) patterns[node.pi.pattern] = (patterns[node.pi.pattern] ?? 0) + 1;
      if (node.rs?.breakpoint) {
        responsive.breakpoints[node.rs.breakpoint] = (responsive.breakpoints[node.rs.breakpoint] ?? 0) + 1;
      }
      if (node.rs?.fluid) responsive.fluid += 1;
      if (node.rs?.grow !== undefined) responsive.grow += 1;
      if (node.rs?.shrink === 0) responsive.shrink0 += 1;
      const evidence = interactionEvidence(node);
      if (evidence.length > 0) interactionCount += 1;
      for (const source of evidence) interactionSources[source] = (interactionSources[source] ?? 0) + 1;
      if (node.t === 'img') imageCount += 1;
      if (node.t === 'vector') vectorCount += 1;
    });
    console.log(JSON.stringify({
      path: treePath,
      root: describe(root),
      nodeCount,
      types,
      layouts,
      roles,
      patterns,
      responsive,
      tokenRefs: [...collectTokenRefs(root)].sort(compareTokenRefs),
      assets: { images: imageCount, vectors: vectorCount },
      interactionCandidates: interactionCount,
      interactionSources,
      components: [...components.values()].slice(0, max),
      textCount,
      texts,
      truncated: textCount > texts.length || components.size > max,
    }, null, 2));
    break;
  }

  case 'diagnostics': {
    const max = countOption(options, 'max', 40);
    const { treePath, root } = commandRoot(snapshot, commandArgs);
    const issueGroups = {
      missingLayoutGeometry: { count: 0, results: [] },
      imagesWithoutImageRef: { count: 0, results: [] },
      vectorsWithoutPathData: { count: 0, results: [] },
      heuristicOnlyInteractions: { count: 0, results: [] },
    };
    const addIssue = (group, issue) => {
      group.count += 1;
      if (group.results.length < max) group.results.push(issue);
    };
    walk(root, treePath, 0, null, (node, nodePath) => {
      if (!node.l && Array.isArray(node.ch) && node.ch.length > 1) {
        const unpositioned = node.ch.filter(child => child?.ps !== 'abs' || child.x === undefined || child.y === undefined).length;
        if (unpositioned > 0) {
          addIssue(issueGroups.missingLayoutGeometry, {
            path: nodePath,
            name: node.n,
            childCount: node.ch.length,
            childrenWithoutAbsoluteCoordinates: unpositioned,
          });
        }
      }
      if (node.t === 'img' && !node.iR) {
        addIssue(issueGroups.imagesWithoutImageRef, { path: nodePath, name: node.n, nodeId: node.nId });
      }
      if (node.t === 'vector' && !(node.path || node.paths || node.d)) {
        addIssue(issueGroups.vectorsWithoutPathData, { path: nodePath, name: node.n, size: [node.w, node.h] });
      }
      if (node.sm?.interactive && (!Array.isArray(node.ia) || node.ia.length === 0)) {
        addIssue(issueGroups.heuristicOnlyInteractions, { path: nodePath, name: node.n, semantic: node.sm });
      }
    });
    const tokenInfo = tokenDetails(snapshot, root);
    console.log(JSON.stringify({
      path: treePath,
      formatVersion: snapshot.v,
      missingTokenRefs: tokenInfo.missing,
      issues: issueGroups,
      hasFidelityRisks: issueGroups.missingLayoutGeometry.count > 0
        || issueGroups.imagesWithoutImageRef.count > 0
        || issueGroups.vectorsWithoutPathData.count > 0,
      note: 'These are risk indicators, not automatic blockers. Semantic and responsive metadata are heuristic; verify against a source screenshot and project assets.',
    }, null, 2));
    break;
  }

  case 'interactions': {
    const max = countOption(options, 'max', 120);
    const { treePath, root } = commandRoot(snapshot, commandArgs);
    const results = [];
    let count = 0;
    walk(root, treePath, 0, null, (node, nodePath, depth, parent) => {
      const evidence = interactionEvidence(node);
      if (evidence.length === 0) return;
      count += 1;
      if (results.length >= max) return;
      results.push({
        path: nodePath,
        depth,
        parent: parent?.n,
        description: describe(node),
        evidence,
        semantic: node.sm,
        pattern: node.pi,
        interactions: node.ia,
        variants: node.variantProps,
        notes: node.di,
      });
    });
    console.log(JSON.stringify({ path: treePath, count, results, truncated: count > results.length }, null, 2));
    break;
  }

  case 'assets': {
    const max = countOption(options, 'max', 100);
    const { treePath, root } = commandRoot(snapshot, commandArgs);
    const images = [];
    const vectors = [];
    let imageCount = 0;
    let vectorCount = 0;
    walk(root, treePath, 0, null, (node, nodePath, depth, parent) => {
      const record = {
        path: nodePath,
        parent: parent?.n,
        name: node.n,
        size: node.w !== undefined || node.h !== undefined ? [node.w, node.h] : undefined,
      };
      if (node.t === 'img') {
        imageCount += 1;
        if (images.length < max) {
          images.push({
            ...record,
            nodeId: node.nId,
            imageRef: node.iR,
            fit: node.ft,
            alt: node.alt,
            reportedOriginalSize: node.oS,
            intrinsicSizeKnown: false,
            cropRect: node.cR,
          });
        }
      }
      if (node.t === 'vector') {
        vectorCount += 1;
        if (vectors.length < max) {
          vectors.push({ ...record, color: node.bg, role: node.sm?.role, hasPathData: Boolean(node.path || node.paths || node.d) });
        }
      }
    });
    console.log(JSON.stringify({
      path: treePath,
      images: { count: imageCount, results: images },
      vectors: { count: vectorCount, results: vectors },
      truncated: imageCount > images.length || vectorCount > vectors.length,
    }, null, 2));
    break;
  }

  case 'tokens': {
    const { treePath, root } = commandRoot(snapshot, commandArgs);
    const details = tokenDetails(snapshot, root);
    console.log(JSON.stringify({ path: treePath, tokens: details.tokens, missingTokenRefs: details.missing }, null, 2));
    break;
  }

  case 'css-vars': {
    const { root } = commandRoot(snapshot, commandArgs);
    const tokens = referencedTokens(snapshot, root);
    const lines = [':root {'];
    for (const [name, value] of Object.entries(tokens.colors)) lines.push(`  --figma-${name}: ${value};`);
    for (const [name, value] of Object.entries(tokens.fonts)) lines.push(`  --figma-${name}: ${JSON.stringify(value)};`);
    for (const [name, value] of Object.entries(tokens.shadows)) lines.push(`  --figma-${name}: ${value};`);
    lines.push('}');
    console.log(lines.join('\n'));
    break;
  }

  default:
    usage();
    fail(`unknown command: ${command}`);
}
