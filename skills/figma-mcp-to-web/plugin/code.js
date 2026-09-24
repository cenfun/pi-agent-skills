// Read-only Figma plugin for the bundled figma-mcp-to-web bridge.
// export_node_as_image honors SVG and the other requested export formats.

figma.showUI(__html__, { width: 360, height: 260 });

figma.ui.onmessage = async message => {
  if (message.type !== 'execute-command') return;
  try {
    const result = await handleCommand(message.command, message.params || {});
    figma.ui.postMessage({ type: 'command-result', id: message.id, result });
  } catch (error) {
    figma.ui.postMessage({
      type: 'command-error',
      id: message.id,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};

async function handleCommand(command, params) {
  switch (command) {
    case 'get_document_info':
      return getDocumentInfo();
    case 'get_selection':
      return getSelection();
    case 'read_my_design':
      return readMyDesign();
    case 'get_node_info':
      return getNodeInfo(requireString(params.nodeId, 'nodeId'));
    case 'get_nodes_info':
      return getNodesInfo(requireStringArray(params.nodeIds, 'nodeIds'));
    case 'scan_nodes_by_types':
      return scanNodesByTypes(params);
    case 'scan_text_nodes':
      return scanTextNodes(params);
    case 'get_styles':
      return getStyles();
    case 'get_local_components':
      return getLocalComponents(params);
    case 'get_annotations':
      return getAnnotations(params);
    case 'get_reactions':
      return getReactions(requireStringArray(params.nodeIds, 'nodeIds'), params.commandId);
    case 'export_node_as_image':
      return exportNodeAsImage(params);
    default:
      throw new Error(`Unsupported read-only command: ${command}`);
  }
}

function requireString(value, name) {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`Missing ${name} parameter`);
  return value;
}

function requireStringArray(value, name) {
  if (!Array.isArray(value) || value.length === 0 || value.some(item => typeof item !== 'string' || !item)) {
    throw new Error(`Missing or invalid ${name} parameter`);
  }
  return value;
}

function commandId(value) {
  return value || `cmd_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

async function progress(id, command, status, percentage, totalItems, processedItems, message, payload) {
  figma.ui.postMessage({
    type: 'command-progress',
    commandId: id,
    commandType: command,
    status,
    progress: percentage,
    totalItems,
    processedItems,
    message,
    timestamp: Date.now(),
    ...(payload ? { payload } : {}),
  });
  await new Promise(resolve => setTimeout(resolve, 0));
}

async function getDocumentInfo() {
  await figma.currentPage.loadAsync();
  const page = figma.currentPage;
  return {
    name: page.name,
    id: page.id,
    type: page.type,
    children: page.children.map(node => ({ id: node.id, name: node.name, type: node.type })),
    currentPage: { id: page.id, name: page.name, childCount: page.children.length },
    pages: [{ id: page.id, name: page.name, childCount: page.children.length }],
  };
}

function getSelection() {
  return {
    selectionCount: figma.currentPage.selection.length,
    selection: figma.currentPage.selection.map(node => ({
      id: node.id,
      name: node.name,
      type: node.type,
      visible: node.visible,
    })),
  };
}

function rgbaToHex(color) {
  const channels = [color.r, color.g, color.b].map(value => Math.round(value * 255));
  const alpha = color.a === undefined ? 255 : Math.round(color.a * 255);
  if (alpha !== 255) channels.push(alpha);
  return `#${channels.map(value => value.toString(16).padStart(2, '0')).join('')}`;
}

function filterPaint(paint) {
  const filtered = { ...paint };
  delete filtered.boundVariables;
  delete filtered.imageRef;
  if (filtered.color) filtered.color = rgbaToHex(filtered.color);
  if (filtered.gradientStops) {
    filtered.gradientStops = filtered.gradientStops.map(stop => {
      const result = { ...stop };
      delete result.boundVariables;
      if (result.color) result.color = rgbaToHex(result.color);
      return result;
    });
  }
  return filtered;
}

function filterFigmaNode(node) {
  if (!node || node.type === 'VECTOR') return null;
  const filtered = { id: node.id, name: node.name, type: node.type };
  if (Array.isArray(node.fills) && node.fills.length) filtered.fills = node.fills.map(filterPaint);
  if (Array.isArray(node.strokes) && node.strokes.length) filtered.strokes = node.strokes.map(filterPaint);
  if (node.cornerRadius !== undefined) filtered.cornerRadius = node.cornerRadius;
  if (node.absoluteBoundingBox) filtered.absoluteBoundingBox = node.absoluteBoundingBox;
  if (node.characters) filtered.characters = node.characters;
  if (node.style) {
    filtered.style = {
      fontFamily: node.style.fontFamily,
      fontStyle: node.style.fontStyle,
      fontWeight: node.style.fontWeight,
      fontSize: node.style.fontSize,
      textAlignHorizontal: node.style.textAlignHorizontal,
      letterSpacing: node.style.letterSpacing,
      lineHeightPx: node.style.lineHeightPx,
    };
  }
  if (Array.isArray(node.children)) {
    filtered.children = node.children.map(filterFigmaNode).filter(Boolean);
  }
  return filtered;
}

async function exportNodeJson(node) {
  if (!node || !('exportAsync' in node)) throw new Error('Node does not support JSON export');
  const response = await node.exportAsync({ format: 'JSON_REST_V1' });
  return filterFigmaNode(response.document);
}

async function getNodeInfo(nodeId) {
  const node = await figma.getNodeByIdAsync(nodeId);
  if (!node) throw new Error(`Node not found with ID: ${nodeId}`);
  return exportNodeJson(node);
}

async function getNodesInfo(nodeIds) {
  const nodes = await Promise.all(nodeIds.map(id => figma.getNodeByIdAsync(id)));
  return Promise.all(nodes.filter(Boolean).map(async node => ({
    nodeId: node.id,
    document: await exportNodeJson(node),
  })));
}

async function readMyDesign() {
  return getNodesInfo(figma.currentPage.selection.map(node => node.id));
}

function nodePath(node) {
  const parts = [];
  let current = node;
  while (current && current.type !== 'DOCUMENT') {
    parts.unshift(current.name || `Unnamed ${current.type}`);
    current = current.parent;
  }
  return parts.join(' > ');
}

async function walkVisible(root, visitor) {
  const stack = [{ node: root, depth: 0 }];
  let processed = 0;
  while (stack.length) {
    const item = stack.pop();
    if (item.node.visible === false) continue;
    await visitor(item.node, item.depth);
    if ('children' in item.node) {
      for (let index = item.node.children.length - 1; index >= 0; index -= 1) {
        stack.push({ node: item.node.children[index], depth: item.depth + 1 });
      }
    }
    processed += 1;
    if (processed % 100 === 0) await new Promise(resolve => setTimeout(resolve, 0));
  }
  return processed;
}

async function scanNodesByTypes(params) {
  const nodeId = requireString(params.nodeId, 'nodeId');
  const types = requireStringArray(params.types, 'types');
  const root = await figma.getNodeByIdAsync(nodeId);
  if (!root) throw new Error(`Node with ID ${nodeId} not found`);
  const id = commandId(params.commandId);
  await progress(id, 'scan_nodes_by_types', 'started', 0, 0, 0, `Scanning for: ${types.join(', ')}`);
  const matchingNodes = [];
  const processed = await walkVisible(root, node => {
    if (!types.includes(node.type)) return;
    matchingNodes.push({
      id: node.id,
      name: node.name || `Unnamed ${node.type}`,
      type: node.type,
      bbox: {
        x: typeof node.x === 'number' ? node.x : 0,
        y: typeof node.y === 'number' ? node.y : 0,
        width: typeof node.width === 'number' ? node.width : 0,
        height: typeof node.height === 'number' ? node.height : 0,
      },
    });
  });
  await progress(id, 'scan_nodes_by_types', 'completed', 100, processed, processed, `Found ${matchingNodes.length} matching nodes`);
  return {
    success: true,
    message: `Found ${matchingNodes.length} matching nodes.`,
    count: matchingNodes.length,
    matchingNodes,
    searchedTypes: types,
  };
}

function serializeTextNode(node, depth) {
  const fontName = node.fontName && node.fontName !== figma.mixed ? node.fontName : null;
  return {
    id: node.id,
    name: node.name || 'Text',
    type: node.type,
    characters: node.characters,
    fontSize: typeof node.fontSize === 'number' ? node.fontSize : 0,
    fontFamily: fontName && fontName.family ? fontName.family : '',
    fontStyle: fontName && fontName.style ? fontName.style : '',
    x: typeof node.x === 'number' ? node.x : 0,
    y: typeof node.y === 'number' ? node.y : 0,
    width: typeof node.width === 'number' ? node.width : 0,
    height: typeof node.height === 'number' ? node.height : 0,
    path: nodePath(node),
    depth,
  };
}

async function scanTextNodes(params) {
  const nodeId = requireString(params.nodeId, 'nodeId');
  const root = await figma.getNodeByIdAsync(nodeId);
  if (!root) throw new Error(`Node with ID ${nodeId} not found`);
  const id = commandId(params.commandId);
  const chunkSize = Number.isInteger(params.chunkSize) && params.chunkSize > 0 ? params.chunkSize : 10;
  await progress(id, 'scan_text_nodes', 'started', 0, 0, 0, `Scanning text under ${root.name || nodeId}`);
  const textNodes = [];
  let processedSinceProgress = 0;
  const processedNodes = await walkVisible(root, async (node, depth) => {
    if (node.type === 'TEXT') textNodes.push(serializeTextNode(node, depth));
    processedSinceProgress += 1;
    if (processedSinceProgress >= chunkSize) {
      processedSinceProgress = 0;
      await progress(id, 'scan_text_nodes', 'in_progress', 0, 0, textNodes.length, `Found ${textNodes.length} text nodes`);
    }
  });
  await progress(id, 'scan_text_nodes', 'completed', 100, processedNodes, processedNodes, `Found ${textNodes.length} text nodes`);
  return {
    success: true,
    message: `Scanned ${textNodes.length} text nodes.`,
    totalNodes: textNodes.length,
    processedNodes,
    chunks: Math.ceil(processedNodes / chunkSize),
    textNodes,
    commandId: id,
  };
}

async function getStyles() {
  const [colors, texts, effects, grids] = await Promise.all([
    figma.getLocalPaintStylesAsync(),
    figma.getLocalTextStylesAsync(),
    figma.getLocalEffectStylesAsync(),
    figma.getLocalGridStylesAsync(),
  ]);
  return {
    colors: colors.map(style => ({ id: style.id, name: style.name, key: style.key, paint: style.paints[0] })),
    texts: texts.map(style => ({ id: style.id, name: style.name, key: style.key, fontSize: style.fontSize, fontName: style.fontName })),
    effects: effects.map(style => ({ id: style.id, name: style.name, key: style.key })),
    grids: grids.map(style => ({ id: style.id, name: style.name, key: style.key })),
  };
}

async function getLocalComponents(params) {
  const id = commandId(params && params.commandId);
  const pages = figma.root.children;
  const components = [];
  await progress(id, 'get_local_components', 'started', 0, pages.length, 0, `Scanning ${pages.length} pages`);
  for (let index = 0; index < pages.length; index += 1) {
    const page = pages[index];
    await page.loadAsync();
    for (const component of page.findAllWithCriteria({ types: ['COMPONENT'] })) {
      components.push({ id: component.id, name: component.name, key: component.key || null });
    }
    await progress(
      id,
      'get_local_components',
      'in_progress',
      Math.round(((index + 1) / pages.length) * 100),
      pages.length,
      index + 1,
      `Scanned ${page.name}`,
    );
  }
  await progress(id, 'get_local_components', 'completed', 100, pages.length, pages.length, `Found ${components.length} components`);
  return { count: components.length, components };
}

async function getAnnotations(params) {
  const nodeId = requireString(params.nodeId, 'nodeId');
  const root = await figma.getNodeByIdAsync(nodeId);
  if (!root) throw new Error(`Node not found: ${nodeId}`);
  const mergedAnnotations = [];
  await walkVisible(root, node => {
    if ('annotations' in node && Array.isArray(node.annotations)) {
      for (const annotation of node.annotations) mergedAnnotations.push({ nodeId: node.id, annotation });
    }
  });
  const result = { nodeId: root.id, name: root.name, annotations: mergedAnnotations };
  if (params.includeCategories !== false) {
    result.categories = await figma.annotations.getAnnotationCategoriesAsync();
  }
  return result;
}

async function getReactions(nodeIds, providedCommandId) {
  const id = commandId(providedCommandId);
  const results = [];
  await progress(id, 'get_reactions', 'started', 0, nodeIds.length, 0, `Scanning ${nodeIds.length} roots`);
  for (let index = 0; index < nodeIds.length; index += 1) {
    const root = await figma.getNodeByIdAsync(nodeIds[index]);
    if (root) {
      await walkVisible(root, (node, depth) => {
        if (!('reactions' in node) || !Array.isArray(node.reactions) || node.reactions.length === 0) return;
        const reactions = node.reactions.filter(reaction => {
          if (reaction.action && reaction.action.navigation === 'CHANGE_TO') return false;
          return !Array.isArray(reaction.actions)
            || !reaction.actions.some(action => action.navigation === 'CHANGE_TO');
        });
        if (reactions.length) {
          results.push({
            id: node.id,
            name: node.name,
            type: node.type,
            depth,
            hasReactions: true,
            reactions,
            path: nodePath(node),
          });
        }
      });
    }
    await progress(id, 'get_reactions', 'in_progress', Math.round(((index + 1) / nodeIds.length) * 100), nodeIds.length, index + 1, `Processed ${index + 1}/${nodeIds.length}`);
  }
  await progress(id, 'get_reactions', 'completed', 100, nodeIds.length, nodeIds.length, `Found ${results.length} nodes with reactions`);
  return { nodesCount: nodeIds.length, nodesWithReactions: results.length, nodes: results };
}

const EXPORT_MIME_TYPES = {
  PNG: 'image/png',
  JPG: 'image/jpeg',
  SVG: 'image/svg+xml',
  PDF: 'application/pdf',
};

async function exportNodeAsImage(params) {
  const nodeId = requireString(params.nodeId, 'nodeId');
  const format = requireString(params.format, 'format').toUpperCase();
  if (!Object.prototype.hasOwnProperty.call(EXPORT_MIME_TYPES, format)) {
    throw new Error(`Unsupported export format: ${params.format}`);
  }
  const scale = params.scale === undefined ? 1 : Number(params.scale);
  if (!Number.isFinite(scale) || scale <= 0) throw new Error('scale must be a positive number');

  const node = await figma.getNodeByIdAsync(nodeId);
  if (!node) throw new Error(`Node not found with ID: ${nodeId}`);
  if (!('exportAsync' in node)) throw new Error(`Node does not support exporting: ${nodeId}`);

  let settings;
  if (format === 'PNG' || format === 'JPG') {
    settings = { format, constraint: { type: 'SCALE', value: scale } };
  } else if (format === 'SVG') {
    settings = {
      format: 'SVG',
      svgOutlineText: true,
      svgIdAttribute: true,
      svgSimplifyStroke: true,
    };
  } else {
    settings = { format: 'PDF' };
  }

  const bytes = await node.exportAsync(settings);
  return {
    nodeId,
    format,
    scale: format === 'PNG' || format === 'JPG' ? scale : null,
    mimeType: EXPORT_MIME_TYPES[format],
    imageData: encodeBase64(bytes),
  };
}

function encodeBase64(bytes) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let output = '';
  for (let index = 0; index < bytes.length; index += 3) {
    const a = bytes[index];
    const b = index + 1 < bytes.length ? bytes[index + 1] : 0;
    const c = index + 2 < bytes.length ? bytes[index + 2] : 0;
    const value = (a << 16) | (b << 8) | c;
    output += alphabet[(value >> 18) & 63];
    output += alphabet[(value >> 12) & 63];
    output += index + 1 < bytes.length ? alphabet[(value >> 6) & 63] : '=';
    output += index + 2 < bytes.length ? alphabet[value & 63] : '=';
  }
  return output;
}
