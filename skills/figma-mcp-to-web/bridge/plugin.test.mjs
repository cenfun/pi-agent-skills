import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

test('bundled plugin manifest and UI script are valid', async () => {
  const manifest = JSON.parse(await readFile(new URL('../plugin/manifest.json', import.meta.url), 'utf8'));
  assert.equal(manifest.main, 'code.js');
  assert.equal(manifest.ui, 'ui.html');
  assert.equal(manifest.id, 'figma-mcp-to-web-plugin');
  assert.equal(manifest.name, 'Figma MCP to Web Plugin');
  assert.deepEqual(manifest.networkAccess.allowedDomains, ['ws://localhost:3081']);

  const html = await readFile(new URL('../plugin/ui.html', import.meta.url), 'utf8');
  const script = html.match(/<script>([\s\S]*?)<\/script>/);
  assert.ok(script, 'plugin UI must contain an inline script');
  assert.match(html, /<title>Figma MCP to Web Plugin<\/title>/);
  assert.match(html, /id="port"[^>]*value="3081"/);
  assert.doesNotThrow(() => new vm.Script(script[1]));
});

async function loadPlugin(exportBytes = new Uint8Array()) {
  const messages = [];
  const exportSettings = [];
  let uiOptions;
  const node = {
    id: '1:2',
    name: 'Icon',
    type: 'VECTOR',
    visible: true,
    async exportAsync(settings) {
      exportSettings.push(settings);
      return exportBytes;
    },
  };
  const figma = {
    mixed: Symbol('mixed'),
    showUI(_html, options) {
      uiOptions = options;
    },
    ui: {
      onmessage: null,
      postMessage(message) {
        messages.push(message);
      },
    },
    async getNodeByIdAsync(id) {
      return id === node.id ? node : null;
    },
  };
  const source = await readFile(new URL('../plugin/code.js', import.meta.url), 'utf8');
  vm.runInNewContext(source, {
    __html__: '<html></html>',
    console,
    Error,
    figma,
    Math,
    Number,
    Object,
    Promise,
    Set,
    String,
    Uint8Array,
    setTimeout,
  }, { filename: 'plugin/code.js' });
  return { exportSettings, figma, messages, uiOptions };
}

test('bundled plugin opens a taller UI without scrollbars', async () => {
  const { uiOptions } = await loadPlugin();
  assert.deepEqual(JSON.parse(JSON.stringify(uiOptions)), { width: 360, height: 260 });

  const html = await readFile(new URL('../plugin/ui.html', import.meta.url), 'utf8');
  assert.match(html, /html, body \{ overflow: hidden; \}/);
});

test('bundled plugin exports SVG directly without a raster scale constraint', async () => {
  const svgBytes = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0h1v1z"/></svg>');
  const { exportSettings, figma, messages } = await loadPlugin(svgBytes);

  await figma.ui.onmessage({
    type: 'execute-command',
    id: 'svg-request',
    command: 'export_node_as_image',
    params: { nodeId: '1:2', format: 'SVG', scale: 4 },
  });

  assert.deepEqual(JSON.parse(JSON.stringify(exportSettings)), [{
    format: 'SVG',
    svgOutlineText: true,
    svgIdAttribute: true,
    svgSimplifyStroke: true,
  }]);
  assert.equal(messages[0].type, 'command-result');
  assert.equal(messages[0].result.format, 'SVG');
  assert.equal(messages[0].result.mimeType, 'image/svg+xml');
  assert.equal(Buffer.from(messages[0].result.imageData, 'base64').toString(), new TextDecoder().decode(svgBytes));
});

test('bundled plugin keeps raster scale constraints for PNG', async () => {
  const { exportSettings, figma, messages } = await loadPlugin(new Uint8Array([0x89, 0x50, 0x4e, 0x47]));

  await figma.ui.onmessage({
    type: 'execute-command',
    id: 'png-request',
    command: 'export_node_as_image',
    params: { nodeId: '1:2', format: 'PNG', scale: 2 },
  });

  assert.deepEqual(JSON.parse(JSON.stringify(exportSettings)), [{ format: 'PNG', constraint: { type: 'SCALE', value: 2 } }]);
  assert.equal(messages[0].result.mimeType, 'image/png');
});

test('bundled plugin rejects mutation commands', async () => {
  const { figma, messages } = await loadPlugin();

  await figma.ui.onmessage({
    type: 'execute-command',
    id: 'mutation-request',
    command: 'create_rectangle',
    params: {},
  });

  assert.equal(messages[0].type, 'command-error');
  assert.match(messages[0].error, /Unsupported read-only command/);
});
