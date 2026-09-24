import assert from 'node:assert/strict';
import test from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { WebSocket } from 'ws';
import { createMcpServer, detectExportMimeType, FigmaPluginBridge, svgContainsRasterImage } from './server.mjs';

const base64 = value => Buffer.from(value).toString('base64');

test('uses the dedicated default bridge port', () => {
  const bridge = new FigmaPluginBridge({ log: () => {} });
  assert.equal(bridge.port, 3081);
});

test('detects SVG and raster export MIME types from payload bytes', () => {
  assert.equal(detectExportMimeType(base64('<svg xmlns="http://www.w3.org/2000/svg"></svg>'), 'image/png'), 'image/svg+xml');
  assert.equal(detectExportMimeType(base64('<!-- exported by Figma --><svg></svg>'), 'image/png'), 'image/svg+xml');
  assert.equal(detectExportMimeType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).toString('base64'), 'image/svg+xml'), 'image/png');
  assert.equal(detectExportMimeType(base64('unknown'), 'IMAGE/JPG; charset=binary'), 'image/jpeg');
  assert.equal(detectExportMimeType(base64('unknown'), 'text/html'), 'application/octet-stream');
  assert.equal(detectExportMimeType(base64('unknown'), undefined), 'application/octet-stream');
});

test('detects raster images embedded in SVG exports', () => {
  assert.equal(svgContainsRasterImage(base64('<svg><path d="M0 0h1v1z"/></svg>')), false);
  assert.equal(svgContainsRasterImage(base64('<svg><image href="data:image/png;base64,AA=="/></svg>')), true);
});

test('forwards SVG requests and warns when the plugin returns PNG bytes', async t => {
  let relayed;
  const pngData = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).toString('base64');
  const bridge = {
    async sendCommand(command, args) {
      relayed = { command, args };
      return { imageData: pngData, mimeType: 'image/png' };
    },
  };
  const server = createMcpServer(bridge);
  const client = new Client({ name: 'svg-export-test', version: '1.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  t.after(async () => {
    await client.close();
    await server.close();
  });

  const result = await client.callTool({
    name: 'export_node_as_image',
    arguments: { nodeId: '1:2', format: 'SVG', scale: 1 },
  });
  assert.deepEqual(relayed, {
    command: 'export_node_as_image',
    args: { nodeId: '1:2', format: 'SVG', scale: 1 },
  });
  assert.equal(result.content[0].type, 'image');
  assert.equal(result.content[0].mimeType, 'image/png');
  assert.match(result.content[1].text, /SVG was requested.*image\/png/);
});

function waitForMessage(socket, predicate, timeoutMs = 2_000) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error('Timed out waiting for WebSocket message'));
    }, timeoutMs);
    const onMessage = raw => {
      const value = JSON.parse(raw.toString());
      if (!predicate(value)) return;
      cleanup();
      resolve(value);
    };
    const cleanup = () => {
      clearTimeout(timeout);
      socket.off('message', onMessage);
    };
    socket.on('message', onMessage);
  });
}

async function connectPlugin(bridge, channel) {
  const port = bridge.wss.address().port;
  const socket = new WebSocket(`ws://localhost:${port}`);
  await new Promise((resolve, reject) => {
    socket.once('open', resolve);
    socket.once('error', reject);
  });
  const joined = waitForMessage(socket, message => message.type === 'system' && message.channel === channel);
  socket.send(JSON.stringify({ type: 'join', channel }));
  await joined;
  return socket;
}

test('returns exact SVG source alongside the SVG attachment', async t => {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0h1v1z"/></svg>';
  const bridge = {
    async sendCommand() {
      return { imageData: base64(svg), mimeType: 'image/svg+xml' };
    },
  };
  const server = createMcpServer(bridge);
  const client = new Client({ name: 'svg-source-test', version: '1.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  t.after(async () => {
    await client.close();
    await server.close();
  });

  const result = await client.callTool({
    name: 'export_node_as_image',
    arguments: { nodeId: '1:2', format: 'SVG', scale: 1 },
  });
  assert.equal(result.content[0].mimeType, 'image/svg+xml');
  assert.equal(result.content[1].type, 'text');
  assert.match(result.content[1].text, new RegExp(svg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.equal(result.content.some(item => item.type === 'text' && item.text.startsWith('Warning:')), false);
});

test('exposes the expected read-oriented MCP tool catalog', async t => {
  const bridge = new FigmaPluginBridge({ port: 0, log: () => {} });
  await bridge.start();
  const server = createMcpServer(bridge);
  const client = new Client({ name: 'bridge-test', version: '1.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  t.after(async () => {
    await client.close();
    await server.close();
    await bridge.stop();
  });

  const { tools } = await client.listTools();
  const names = tools.map(tool => tool.name);
  for (const expected of [
    'bridge_status',
    'list_channels',
    'join_channel',
    'get_document_info',
    'get_selection',
    'get_node_info',
    'export_node_as_image',
  ]) {
    assert.ok(names.includes(expected), `missing MCP tool: ${expected}`);
  }
  assert.equal(names.length, 15);
  assert.equal(names.some(name => /^(create_|set_|delete_|move_|resize_|clone_|rename_)/.test(name)), false);
  const exportTool = tools.find(tool => tool.name === 'export_node_as_image');
  assert.ok(exportTool.inputSchema.required.includes('format'));

  const status = await client.callTool({ name: 'bridge_status', arguments: {} });
  assert.equal(status.isError, undefined);
  const parsedStatus = JSON.parse(status.content[0].text);
  assert.equal(parsedStatus.websocket.listening, true);
  assert.equal(parsedStatus.ready, false);
  assert.match(parsedStatus.connectionMessage, /click "Connect"/);
});

test('auto-selects one plugin channel and relays command results', async t => {
  const bridge = new FigmaPluginBridge({ port: 0, timeoutMs: 2_000, log: () => {} });
  await bridge.start();
  t.after(() => bridge.stop());

  const plugin = await connectPlugin(bridge, 'test1234');
  t.after(() => plugin.close());

  assert.notEqual(bridge.status().websocket.port, 0);
  assert.equal(bridge.status().ready, true);
  assert.equal(bridge.status().connectionMessage, 'Connected to server in channel: test1234');

  plugin.on('message', raw => {
    const message = JSON.parse(raw.toString());
    if (message.type !== 'broadcast' || message.message?.command !== 'get_selection') return;
    plugin.send(JSON.stringify({
      type: 'message',
      channel: 'test1234',
      message: {
        id: message.message.id,
        result: { selectionCount: 1, selection: [{ id: '1:2', name: 'Screen', type: 'FRAME' }] },
      },
    }));
  });

  const result = await bridge.sendCommand('get_selection');
  assert.equal(bridge.status().activeChannel, 'test1234');
  assert.equal(result.selectionCount, 1);
  assert.equal(result.selection[0].id, '1:2');
});

test('requires explicit selection when multiple channels are connected', async t => {
  const bridge = new FigmaPluginBridge({ port: 0, timeoutMs: 2_000, log: () => {} });
  await bridge.start();
  t.after(() => bridge.stop());

  const first = await connectPlugin(bridge, 'first');
  const second = await connectPlugin(bridge, 'second');
  t.after(() => first.close());
  t.after(() => second.close());

  assert.equal(bridge.status().activeChannel, null);
  assert.throws(() => bridge.resolveSocket(), /Multiple Figma channels/);
  assert.equal(bridge.selectChannel('second'), 'second');
  assert.equal(bridge.resolveSocket().channel, 'second');
});

test('refreshes a command timeout when its plugin reports progress', async t => {
  const bridge = new FigmaPluginBridge({ port: 0, timeoutMs: 200, log: () => {} });
  await bridge.start();
  t.after(() => bridge.stop());

  const plugin = await connectPlugin(bridge, 'progress');
  t.after(() => plugin.close());

  plugin.on('message', raw => {
    const message = JSON.parse(raw.toString());
    if (message.type !== 'broadcast' || message.message?.command !== 'scan_text_nodes') return;
    const id = message.message.id;
    setTimeout(() => {
      plugin.send(JSON.stringify({
        id,
        type: 'progress_update',
        channel: 'progress',
        message: { id, type: 'progress_update', data: { progress: 50 } },
      }));
    }, 120);
    setTimeout(() => {
      plugin.send(JSON.stringify({
        id,
        type: 'message',
        channel: 'progress',
        message: { id, result: { success: true } },
      }));
    }, 250);
  });

  assert.deepEqual(await bridge.sendCommand('scan_text_nodes'), { success: true });
});

test('rejects a pending command when the plugin disconnects', async t => {
  const bridge = new FigmaPluginBridge({ port: 0, timeoutMs: 2_000, log: () => {} });
  await bridge.start();
  t.after(() => bridge.stop());

  const plugin = await connectPlugin(bridge, 'disconnect');
  const pending = bridge.sendCommand('get_document_info');
  plugin.close();
  await assert.rejects(pending, /disconnected/);
});
