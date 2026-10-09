#!/usr/bin/env node
// One-time on-demand extension installation. Run from the installed skill.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const SERVER_NAME = 'figma-mcp-to-web-bridge';

export function registerBridge(configPath, serverPath) {
  if (!existsSync(serverPath)) throw new Error(`Bridge not found: ${serverPath}`);
  let config = {};
  if (existsSync(configPath)) {
    config = JSON.parse(readFileSync(configPath, 'utf8'));
    if (!config || typeof config !== 'object' || Array.isArray(config)) {
      throw new Error(`Expected an object in ${configPath}`);
    }
  }
  const servers = config.mcpServers ?? {};
  if (!servers || typeof servers !== 'object' || Array.isArray(servers)) {
    throw new Error(`Expected mcpServers to be an object in ${configPath}`);
  }
  const previous = servers[SERVER_NAME];
  if (previous && (typeof previous !== 'object' || Array.isArray(previous))) {
    throw new Error(`Invalid ${SERVER_NAME} entry in ${configPath}`);
  }
  // Preserve other servers; a previous always-on bridge must not claim port 3081.
  if (previous) servers[SERVER_NAME] = { ...previous, enabled: false };
  config.mcpServers = servers;
  mkdirSync(dirname(configPath), { recursive: true });
  writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
  return configPath;
}

export function installExtension(extensionPath, shimPath) {
  if (!existsSync(extensionPath)) throw new Error(`Extension not found: ${extensionPath}`);
  mkdirSync(dirname(shimPath), { recursive: true });
  writeFileSync(shimPath, `export { default } from ${JSON.stringify(pathToFileURL(extensionPath).href)};\n`);
  return shimPath;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const serverPath = join(dirname(fileURLToPath(import.meta.url)), 'server.mjs');
    const agentDir = resolve(process.env.PI_CODING_AGENT_DIR || join(homedir(), '.pi', 'agent'));
    const configPath = join(agentDir, 'mcp.json');
    const extensionPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'extension', 'figma-on-demand.mjs');
    // Pi discovers direct extension files ending in .js or .ts, not .mjs.
    const shimPath = join(agentDir, 'extensions', 'figma-on-demand.js');
    registerBridge(configPath, serverPath);
    installExtension(extensionPath, shimPath);
    console.log(`Disabled any always-on ${SERVER_NAME} entry in ${configPath}.`);
    console.log(`Installed the on-demand extension at ${shimPath}.`);
    console.log('Run /reload (or restart Pi) once; then start the Figma Desktop plugin when using this skill.');
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
