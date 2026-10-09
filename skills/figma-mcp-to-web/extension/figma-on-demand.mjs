import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Type } from '@earendil-works/pi-ai';

export const NAME = 'figma-mcp-to-web-lazy';
export const TOOL = 'start_figma_bridge';
const IDLE_MS = 10 * 60 * 1000;
const serverPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'bridge', 'server.mjs');

export default function (pi) {
  let running = false;
  let idleTimer;
  function stop() {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = undefined;
    if (running) {
      running = false;
      pi.unregisterMcpServer(NAME);
    }
  }
  function renew() {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(stop, IDLE_MS);
    idleTimer.unref?.();
  }
  pi.registerTool({
    name: TOOL,
    label: 'Start Figma bridge on demand',
    description: 'Start the bundled read-only Figma Desktop MCP bridge only when implementing a Figma design. Call before discovering Figma MCP tools.',
    parameters: Type.Object({}),
    async execute() {
      if (!existsSync(serverPath)) throw new Error(`Figma bridge not found: ${serverPath}`);
      if (!running) {
        pi.registerMcpServer(NAME, {
          command: process.execPath,
          args: [serverPath],
          timeout: 300,
          exposure: 'codemode',
          description: 'Read the open Figma Desktop document through the bundled local read-only bridge',
        });
        running = true;
      }
      renew();
      return {
        content: [{ type: 'text', text: `Native MCP bridge ${NAME} registered. Discover bridge_status via codemode; Pi connects the server in the background. The bridge stops after 10 minutes without tool calls.` }],
        details: { server: NAME },
      };
    },
  });
  pi.on('tool_call', (event) => {
    if (running && event.toolName.startsWith(`mcp__${NAME.replaceAll('-', '_')}__`)) renew();
  });
  pi.on('session_shutdown', stop);
}
