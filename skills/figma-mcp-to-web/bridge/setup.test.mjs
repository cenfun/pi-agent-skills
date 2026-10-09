import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { installExtension, registerBridge, SERVER_NAME } from './setup.mjs';

function withConfig(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'figma-setup-'));
  try {
    const configPath = join(dir, 'mcp.json');
    const serverPath = join(dir, 'server.mjs');
    writeFileSync(serverPath, '');
    fn(configPath, serverPath, dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('disables a previous always-on bridge and preserves other MCP settings', () => withConfig((configPath, serverPath) => {
  writeFileSync(configPath, JSON.stringify({ autoEnableCodemode: false, mcpServers: {
    other: { url: 'https://example.com/mcp' },
    [SERVER_NAME]: { enabled: true, timeout: 400, command: 'old-node', args: ['old-path'] },
  } }));
  registerBridge(configPath, serverPath);
  const config = JSON.parse(readFileSync(configPath, 'utf8'));
  assert.equal(config.autoEnableCodemode, false);
  assert.deepEqual(config.mcpServers.other, { url: 'https://example.com/mcp' });
  assert.deepEqual(config.mcpServers[SERVER_NAME], { enabled: false, timeout: 400, command: 'old-node', args: ['old-path'] });
  registerBridge(configPath, serverPath);
  assert.deepEqual(JSON.parse(readFileSync(configPath, 'utf8')), config);
}));

test('creates a missing config; does not clobber malformed JSON', () => withConfig((configPath, serverPath) => {
  registerBridge(configPath, serverPath);
  assert.deepEqual(JSON.parse(readFileSync(configPath, 'utf8')).mcpServers, {});
  writeFileSync(configPath, '{invalid');
  assert.throws(() => registerBridge(configPath, serverPath), SyntaxError);
  assert.equal(readFileSync(configPath, 'utf8'), '{invalid');
}));

test('CLI installs a Pi-discoverable .js shim in the configured agent directory', () => withConfig((_configPath, _serverPath, dir) => {
  const result = spawnSync(process.execPath, [fileURLToPath(new URL('./setup.mjs', import.meta.url))], {
    env: { ...process.env, PI_CODING_AGENT_DIR: dir }, encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  assert.ok(existsSync(join(dir, 'extensions', 'figma-on-demand.js')));
  assert.ok(!existsSync(join(dir, 'extensions', 'figma-on-demand.mjs')));
}));

test('installs an idempotent shim referencing the installed skill', () => withConfig((_configPath, _serverPath, dir) => {
  const source = join(dir, 'extension', 'figma-on-demand.mjs');
  const shim = join(dir, 'pi', 'extensions', 'figma-on-demand.js');
  // Source must exist before installation.
  assert.throws(() => installExtension(source, shim), /not found/);
  mkdirSync(join(dir, 'extension'));
  writeFileSync(source, 'export default function () {}');
  installExtension(source, shim);
  const body = `export { default } from ${JSON.stringify(pathToFileURL(source).href)};\n`;
  assert.equal(readFileSync(shim, 'utf8'), body);
  installExtension(source, shim);
  assert.equal(readFileSync(shim, 'utf8'), body);
}));
