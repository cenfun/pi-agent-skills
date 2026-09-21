#!/usr/bin/env node

import { randomUUID } from 'node:crypto';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { WebSocket, WebSocketServer } from 'ws';
import { z } from 'zod';

const DEFAULT_PORT = 3055;
const DEFAULT_HOST = 'localhost';
const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_MAX_PAYLOAD_BYTES = 64 * 1024 * 1024;
const MAX_CHANNEL_LENGTH = 128;

function asPositiveInteger(value, fallback, name) {
  if (value === undefined || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return parsed;
}

function textResult(value) {
  return {
    content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value) }],
  };
}

function errorMessage(error) {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

function errorResult(error) {
  return {
    isError: true,
    content: [{ type: 'text', text: `Error: ${errorMessage(error)}` }],
  };
}

export class FigmaPluginBridge {
  constructor({
    host = DEFAULT_HOST,
    port = DEFAULT_PORT,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    maxPayloadBytes = DEFAULT_MAX_PAYLOAD_BYTES,
    log = console.error,
  } = {}) {
    this.host = host;
    this.port = port;
    this.timeoutMs = timeoutMs;
    this.maxPayloadBytes = maxPayloadBytes;
    this.log = log;
    this.channels = new Map();
    this.socketChannels = new Map();
    this.pending = new Map();
    this.activeChannel = null;
    this.wss = null;
  }

  async start() {
    if (this.wss) return;
    await new Promise((resolve, reject) => {
      const wss = new WebSocketServer({
        host: this.host,
        port: this.port,
        maxPayload: this.maxPayloadBytes,
      });
      this.wss = wss;
      this.attachServerHandlers();
      const onError = error => {
        wss.removeListener('listening', onListening);
        this.wss = null;
        reject(error);
      };
      const onListening = () => {
        wss.removeListener('error', onError);
        const address = wss.address();
        const port = typeof address === 'object' && address ? address.port : this.port;
        this.log(`[figma-bridge] WebSocket listening on ws://${this.host}:${port}`);
        resolve();
      };
      wss.once('error', onError);
      wss.once('listening', onListening);
    });
  }

  attachServerHandlers() {
    this.wss.on('connection', socket => {
      socket.send(JSON.stringify({ type: 'system', message: 'Please join a channel to start chatting' }));
      socket.on('message', data => this.handleSocketMessage(socket, data));
      socket.on('close', () => this.removeSocket(socket));
      socket.on('error', error => this.log(`[figma-bridge] WebSocket client error: ${error.message}`));
    });
    this.wss.on('error', error => this.log(`[figma-bridge] WebSocket server error: ${error.message}`));
  }

  handleSocketMessage(socket, rawData) {
    let data;
    try {
      data = JSON.parse(rawData.toString());
    } catch {
      socket.send(JSON.stringify({ type: 'error', message: 'Invalid JSON message' }));
      return;
    }

    if (data.type === 'join') {
      this.joinSocket(socket, data.channel, data.id);
      return;
    }

    if (data.type === 'progress_update') {
      const id = data.id ?? data.commandId ?? data.message?.id ?? data.message?.commandId;
      const pending = id ? this.pending.get(id) : undefined;
      if (
        pending
        && pending.socket === socket
        && this.socketChannels.get(socket) === data.channel
      ) {
        this.refreshPending(id);
      }
      return;
    }

    if (data.type !== 'message' || !data.channel || !data.message?.id) return;
    if (this.socketChannels.get(socket) !== data.channel) return;

    const pending = this.pending.get(data.message.id);
    if (!pending || pending.socket !== socket) return;
    const hasError = Object.prototype.hasOwnProperty.call(data.message, 'error');
    const hasResult = Object.prototype.hasOwnProperty.call(data.message, 'result');
    if (!hasError && !hasResult) return;

    clearTimeout(pending.timeout);
    this.pending.delete(data.message.id);
    if (hasError) pending.reject(new Error(errorMessage(data.message.error)));
    else pending.resolve(data.message.result);
  }

  joinSocket(socket, channel, requestId) {
    if (typeof channel !== 'string' || channel.trim() === '') {
      socket.send(JSON.stringify({ type: 'error', message: 'Channel name is required' }));
      return;
    }

    const normalized = channel.trim();
    if (normalized.length > MAX_CHANNEL_LENGTH) {
      socket.send(JSON.stringify({ type: 'error', message: `Channel name must be at most ${MAX_CHANNEL_LENGTH} characters` }));
      return;
    }

    this.removeSocket(socket);
    if (!this.channels.has(normalized)) this.channels.set(normalized, new Set());
    this.channels.get(normalized).add(socket);
    this.socketChannels.set(socket, normalized);

    const connected = this.connectedChannels();
    this.activeChannel = connected.length === 1 ? connected[0] : null;

    socket.send(JSON.stringify({
      type: 'system',
      message: `Joined channel: ${normalized}`,
      channel: normalized,
    }));
    socket.send(JSON.stringify({
      type: 'system',
      message: { id: requestId, result: `Connected to channel: ${normalized}` },
      channel: normalized,
    }));
    this.log(`[figma-bridge] Plugin joined channel ${normalized}`);
  }

  removeSocket(socket, rejectPending = true) {
    const channel = this.socketChannels.get(socket);
    if (channel) {
      const sockets = this.channels.get(channel);
      sockets?.delete(socket);
      if (sockets?.size === 0) this.channels.delete(channel);
      this.socketChannels.delete(socket);
    }

    if (rejectPending) {
      for (const [id, pending] of this.pending) {
        if (pending.socket === socket) {
          clearTimeout(pending.timeout);
          pending.reject(new Error('Figma plugin disconnected'));
          this.pending.delete(id);
        }
      }
    }

    const connected = this.connectedChannels();
    if (connected.length === 1) {
      this.activeChannel = connected[0];
    } else if (this.activeChannel && !connected.includes(this.activeChannel)) {
      this.activeChannel = null;
    }
  }

  connectedChannels() {
    return [...this.channels.entries()]
      .filter(([, sockets]) => [...sockets].some(socket => socket.readyState === WebSocket.OPEN))
      .map(([channel]) => channel);
  }

  hasConnectedChannel(channel) {
    return this.connectedChannels().includes(channel);
  }

  selectChannel(channel) {
    if (!this.hasConnectedChannel(channel)) {
      throw new Error(`No Figma plugin is connected to channel ${channel}`);
    }
    this.activeChannel = channel;
    return channel;
  }

  resolveSocket() {
    const channels = this.connectedChannels();
    if (this.activeChannel && channels.includes(this.activeChannel)) {
      const sockets = [...this.channels.get(this.activeChannel)].filter(socket => socket.readyState === WebSocket.OPEN);
      if (sockets.length === 1) return { channel: this.activeChannel, socket: sockets[0] };
      if (sockets.length > 1) throw new Error(`Channel ${this.activeChannel} has multiple plugin connections`);
    }
    if (channels.length === 0) {
      throw new Error('No Talk to Figma plugin is connected. Open the plugin in Figma Desktop, click "Connect", and wait for "Connected to server in channel: <channel>".');
    }
    if (channels.length > 1) throw new Error(`Multiple Figma channels are connected (${channels.join(', ')}); call join_channel first`);
    this.activeChannel = channels[0];
    return { channel: channels[0], socket: [...this.channels.get(channels[0])][0] };
  }

  refreshPending(id) {
    const pending = this.pending.get(id);
    if (!pending) return;
    clearTimeout(pending.timeout);
    pending.timeout = this.createTimeout(id);
  }

  createTimeout(id) {
    return setTimeout(() => {
      const pending = this.pending.get(id);
      if (!pending) return;
      this.pending.delete(id);
      pending.reject(new Error(`Figma command timed out after ${this.timeoutMs}ms`));
    }, this.timeoutMs);
  }

  sendCommand(command, params = {}) {
    const { channel, socket } = this.resolveSocket();
    const id = randomUUID();
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject, socket, timeout: this.createTimeout(id) });
      try {
        socket.send(JSON.stringify({
          type: 'broadcast',
          sender: 'peer',
          channel,
          message: { id, command, params: { ...params, commandId: id } },
        }));
      } catch (error) {
        clearTimeout(this.pending.get(id)?.timeout);
        this.pending.delete(id);
        reject(error);
      }
    });
  }

  status() {
    const channels = this.connectedChannels();
    const address = this.wss?.address();
    const port = typeof address === 'object' && address ? address.port : this.port;
    const activeSockets = this.activeChannel && this.channels.get(this.activeChannel)
      ? [...this.channels.get(this.activeChannel)].filter(socket => socket.readyState === WebSocket.OPEN)
      : [];
    const ready = activeSockets.length === 1;
    let connectionMessage;
    if (ready) {
      connectionMessage = `Connected to server in channel: ${this.activeChannel}`;
    } else if (channels.length > 1) {
      connectionMessage = `Multiple Figma channels are connected (${channels.join(', ')}). Select one with join_channel.`;
    } else {
      connectionMessage = 'Open Talk To Figma MCP Plugin in Figma Desktop, click "Connect", and wait for "Connected to server in channel: <channel>".';
    }
    return {
      ready,
      connectionMessage,
      websocket: { host: this.host, port, listening: Boolean(this.wss) },
      pluginConnections: channels.reduce((count, channel) => count + this.channels.get(channel).size, 0),
      channels,
      activeChannel: this.activeChannel,
      pendingRequests: this.pending.size,
    };
  }

  async stop() {
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timeout);
      pending.reject(new Error('Bridge stopped'));
      this.pending.delete(id);
    }
    for (const sockets of this.channels.values()) {
      for (const socket of sockets) socket.close(1001, 'Bridge stopped');
    }
    if (this.wss) {
      const wss = this.wss;
      this.wss = null;
      await new Promise(resolve => wss.close(resolve));
    }
  }
}

function registerJsonTool(server, bridge, name, description, schema, command = name, mapArgs = value => value) {
  server.tool(name, description, schema, async args => {
    try {
      return textResult(await bridge.sendCommand(command, mapArgs(args)));
    } catch (error) {
      return errorResult(error);
    }
  });
}

export function createMcpServer(bridge) {
  const server = new McpServer({ name: 'figma-mcp-local-bridge', version: '1.0.0' });

  server.tool('bridge_status', 'Show local bridge and connected Figma plugin status', {}, async () => textResult(bridge.status()));
  server.tool('list_channels', 'List channels currently connected by Talk to Figma plugins', {}, async () => textResult({ channels: bridge.connectedChannels(), activeChannel: bridge.activeChannel }));
  server.tool(
    'join_channel',
    'Select a connected Talk to Figma channel. Automatically optional when exactly one plugin is connected.',
    { channel: z.string().min(1).describe('Channel shown by the Talk to Figma plugin') },
    async ({ channel }) => {
      try {
        return textResult(`Successfully selected channel: ${bridge.selectChannel(channel)}`);
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  registerJsonTool(server, bridge, 'get_document_info', 'Get the current Figma page and its top-level nodes', {});
  registerJsonTool(server, bridge, 'get_selection', 'Get the current Figma selection', {});
  registerJsonTool(server, bridge, 'read_my_design', 'Recursively read every selected Figma node; avoid broad selections', {});
  registerJsonTool(server, bridge, 'get_node_info', 'Recursively get one Figma node', {
    nodeId: z.string().min(1),
  });
  registerJsonTool(server, bridge, 'get_nodes_info', 'Get multiple explicit Figma nodes; keep batches small', {
    nodeIds: z.array(z.string().min(1)).min(1),
  });
  registerJsonTool(server, bridge, 'scan_nodes_by_types', 'Scan descendants by Figma node type', {
    nodeId: z.string().min(1),
    types: z.array(z.string().min(1)).min(1),
  });
  registerJsonTool(server, bridge, 'scan_text_nodes', 'Scan text nodes in a Figma subtree with plugin-side chunking', {
    nodeId: z.string().min(1),
    chunkSize: z.number().int().positive().optional(),
  }, 'scan_text_nodes', args => ({ nodeId: args.nodeId, useChunking: true, chunkSize: args.chunkSize ?? 10 }));
  registerJsonTool(server, bridge, 'get_styles', 'Get local paint, text, effect, and grid style summaries', {});
  registerJsonTool(server, bridge, 'get_local_components', 'Scan local components across the Figma document', {});
  registerJsonTool(server, bridge, 'get_annotations', 'Get annotations for a Figma node', {
    nodeId: z.string().min(1),
    includeCategories: z.boolean().optional(),
  }, 'get_annotations', args => ({ nodeId: args.nodeId, includeCategories: args.includeCategories ?? true }));
  registerJsonTool(
    server,
    bridge,
    'get_reactions',
    'Get prototype reactions. WARNING: the current plugin temporarily highlights matching nodes on the canvas.',
    { nodeIds: z.array(z.string().min(1)).min(1) },
  );

  server.tool(
    'export_node_as_image',
    'Export a Figma node as an image. The current Community plugin always returns PNG.',
    {
      nodeId: z.string().min(1),
      format: z.enum(['PNG', 'JPG', 'SVG', 'PDF']).optional(),
      scale: z.number().positive().optional(),
    },
    async ({ nodeId, format, scale }) => {
      try {
        const result = await bridge.sendCommand('export_node_as_image', {
          nodeId,
          format: format ?? 'PNG',
          scale: scale ?? 1,
        });
        if (!result || typeof result.imageData !== 'string') {
          throw new Error('Figma plugin returned no image data');
        }
        return {
          content: [{
            type: 'image',
            data: result.imageData,
            mimeType: result.mimeType || 'image/png',
          }],
        };
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  return server;
}

export async function main() {
  const bridge = new FigmaPluginBridge({
    host: process.env.FIGMA_BRIDGE_HOST || DEFAULT_HOST,
    port: asPositiveInteger(process.env.FIGMA_BRIDGE_PORT, DEFAULT_PORT, 'FIGMA_BRIDGE_PORT'),
    timeoutMs: asPositiveInteger(process.env.FIGMA_BRIDGE_TIMEOUT_MS, DEFAULT_TIMEOUT_MS, 'FIGMA_BRIDGE_TIMEOUT_MS'),
    maxPayloadBytes: asPositiveInteger(
      process.env.FIGMA_BRIDGE_MAX_PAYLOAD_BYTES,
      DEFAULT_MAX_PAYLOAD_BYTES,
      'FIGMA_BRIDGE_MAX_PAYLOAD_BYTES',
    ),
  });

  await bridge.start();
  const server = createMcpServer(bridge);
  const transport = new StdioServerTransport();
  let stopping = false;
  const shutdown = async () => {
    if (stopping) return;
    stopping = true;
    await bridge.stop();
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
  process.stdin.once('end', shutdown);

  await server.connect(transport);
  console.error('[figma-bridge] MCP server connected over stdio');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch(error => {
    console.error(`[figma-bridge] Fatal: ${error instanceof Error ? error.stack : String(error)}`);
    process.exit(1);
  });
}
