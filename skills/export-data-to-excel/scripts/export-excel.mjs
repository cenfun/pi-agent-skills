#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

function fail(message) {
  console.error(`Error: ${message}`);
  process.exit(1);
}

function usage() {
  console.log(`Usage:
  export-excel.mjs <input.json|-> [--output FILE] [--prefix NAME] [--sheet NAME]

Input may be an array of row objects, a single-sheet object, or an object with a
sheets array. Provide a topic-specific --prefix or filePrefix unless --output is set.
The default path pattern is .temp/<prefix>-YYMMDD-HHmmss.xlsx.`);
}

function parseArguments(argv) {
  const positional = [];
  const options = {};

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    if (argument === '--help' || argument === '-h') {
      options.help = true;
      continue;
    }

    if (!argument.startsWith('--')) {
      positional.push(argument);
      continue;
    }

    const [key, inlineValue] = argument.slice(2).split('=', 2);
    const value = inlineValue ?? argv[index + 1];
    if (value === undefined || value.startsWith('--')) {
      fail(`--${key} requires a value`);
    }

    options[key] = value;
    if (inlineValue === undefined) index += 1;
  }

  return { positional, options };
}

function loadXlsx() {
  const projectRequire = createRequire(path.resolve(process.cwd(), 'package.json'));
  const skillRequire = createRequire(import.meta.url);

  for (const requireFrom of [projectRequire, skillRequire]) {
    try {
      return requireFrom('xlsx');
    } catch (error) {
      if (error?.code !== 'MODULE_NOT_FOUND') throw error;
    }
  }

  fail('cannot load "xlsx". Install it in the target project (for example: npm install xlsx), then run this script from the project root.');
}

function readJson(inputPath) {
  let source;

  try {
    source = inputPath === '-'
      ? fs.readFileSync(0, 'utf8')
      : fs.readFileSync(path.resolve(inputPath), 'utf8');
  } catch (error) {
    fail(`cannot read ${inputPath}: ${error.message}`);
  }

  try {
    return JSON.parse(source.replace(/^\uFEFF/, ''));
  } catch (error) {
    fail(`invalid JSON in ${inputPath}: ${error.message}`);
  }
}

const pad = value => String(value).padStart(2, '0');

function formatFileTime(date) {
  const datePart = [
    pad(date.getFullYear() % 100),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
  ].join('');
  const timePart = [
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join('');

  return `${datePart}-${timePart}`;
}

function safePrefix(value) {
  const prefix = String(value ?? '')
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001F]+/g, '-')
    .replace(/[. ]+$/g, '');

  if (!prefix) {
    fail('a topic-specific filename prefix is required. Provide --prefix or filePrefix, or set --output explicitly.');
  }

  return prefix;
}

function validateSheetName(value, index) {
  const name = String(value || `sheet${index + 1}`).trim();

  if (!name) fail(`sheet ${index + 1} has an empty name`);
  if (name.length > 31) fail(`worksheet name is longer than 31 characters: ${name}`);
  if (/[:\\/?*\[\]]/.test(name)) fail(`worksheet name contains an invalid character: ${name}`);

  return name;
}

function normalizeRows(value, sheetName) {
  if (!Array.isArray(value)) fail(`rows for worksheet "${sheetName}" must be an array`);

  return value.map((row, index) => {
    if (!row || Array.isArray(row) || typeof row !== 'object') {
      fail(`row ${index + 1} in worksheet "${sheetName}" must be an object`);
    }
    return row;
  });
}

function inferColumnKeys(rows) {
  const seen = new Set();
  const keys = [];

  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (!seen.has(key)) {
        seen.add(key);
        keys.push(key);
      }
    }
  }

  return keys;
}

function normalizeColumns(value, rows, sheetName) {
  const source = value === undefined ? inferColumnKeys(rows) : value;
  if (!Array.isArray(source)) fail(`columns for worksheet "${sheetName}" must be an array`);

  const headers = new Set();
  return source.map((column, index) => {
    const definition = typeof column === 'string' ? { key: column } : column;
    if (!definition || Array.isArray(definition) || typeof definition !== 'object') {
      fail(`column ${index + 1} in worksheet "${sheetName}" is invalid`);
    }

    const key = String(definition.key ?? '').trim();
    const header = String(definition.header ?? key).trim();
    const width = definition.width === undefined ? undefined : Number(definition.width);

    if (!key) fail(`column ${index + 1} in worksheet "${sheetName}" has no key`);
    if (!header) fail(`column "${key}" in worksheet "${sheetName}" has an empty header`);
    if (headers.has(header)) fail(`worksheet "${sheetName}" has a duplicate header: ${header}`);
    if (width !== undefined && (!Number.isFinite(width) || width <= 0)) {
      fail(`column "${key}" in worksheet "${sheetName}" has an invalid width`);
    }

    headers.add(header);
    return { key, header, width };
  });
}

function normalizeCell(value) {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value;
  if (typeof value === 'object') return JSON.stringify(value);
  return value;
}

function displayLength(value) {
  const text = value instanceof Date ? value.toISOString() : String(value ?? '');
  return Array.from(text).reduce((length, character) => length + (/[^\u0000-\u00ff]/.test(character) ? 2 : 1), 0);
}

function columnWidths(columns, matrix) {
  return columns.map((column, columnIndex) => {
    if (column.width !== undefined) return { wch: column.width };

    let width = displayLength(column.header);
    for (let rowIndex = 1; rowIndex < matrix.length; rowIndex += 1) {
      width = Math.max(width, displayLength(matrix[rowIndex][columnIndex]));
    }

    return { wch: Math.min(60, Math.max(10, width + 2)) };
  });
}

function normalizeWorkbook(input, sheetOverride) {
  const filePrefix = !Array.isArray(input) && input && typeof input === 'object'
    ? input.filePrefix
    : undefined;

  const rawSheets = Array.isArray(input)
    ? [{ name: sheetOverride || 'data', rows: input }]
    : Array.isArray(input?.sheets)
      ? input.sheets
      : [{
          name: sheetOverride || input?.sheetName || 'data',
          rows: input?.rows,
          columns: input?.columns,
        }];

  if (!rawSheets.length) fail('the workbook must contain at least one worksheet');
  if (sheetOverride && rawSheets.length > 1) fail('--sheet can only be used with a single-sheet input');

  const names = new Set();
  const sheets = rawSheets.map((rawSheet, index) => {
    if (!rawSheet || Array.isArray(rawSheet) || typeof rawSheet !== 'object') {
      fail(`sheet ${index + 1} must be an object`);
    }

    const name = validateSheetName(sheetOverride || rawSheet.name || rawSheet.sheetName, index);
    if (names.has(name)) fail(`duplicate worksheet name: ${name}`);
    names.add(name);

    const rows = normalizeRows(rawSheet.rows, name);
    const columns = normalizeColumns(rawSheet.columns, rows, name);
    return { name, rows, columns };
  });

  return { filePrefix, sheets };
}

function outputPathFor(options, filePrefix) {
  let outputPath = options.output;

  if (!outputPath) {
    const filename = `${safePrefix(options.prefix || filePrefix)}-${formatFileTime(new Date())}.xlsx`;
    outputPath = path.join('.temp', filename);
  } else if (path.extname(outputPath).toLowerCase() !== '.xlsx') {
    outputPath = `${outputPath}.xlsx`;
  }

  return path.resolve(outputPath);
}

const { positional, options } = parseArguments(process.argv.slice(2));
if (options.help) {
  usage();
  process.exit(0);
}
if (positional.length !== 1) {
  usage();
  fail('exactly one JSON input path is required');
}

const input = readJson(positional[0]);
if (!Array.isArray(input) && (!input || typeof input !== 'object')) {
  fail('the JSON root must be a row array or a workbook object');
}

const XLSX = loadXlsx();
const specification = normalizeWorkbook(input, options.sheet);
const workbook = XLSX.utils.book_new();
const summary = [];

for (const sheet of specification.sheets) {
  const matrix = [
    sheet.columns.map(column => column.header),
    ...sheet.rows.map(row => sheet.columns.map(column => normalizeCell(row[column.key]))),
  ];
  const worksheet = XLSX.utils.aoa_to_sheet(matrix);
  worksheet['!cols'] = columnWidths(sheet.columns, matrix);
  XLSX.utils.book_append_sheet(workbook, worksheet, sheet.name);
  summary.push({ name: sheet.name, rows: sheet.rows.length, columns: sheet.columns.length });
}

const outputPath = outputPathFor(options, specification.filePrefix);
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
XLSX.writeFile(workbook, outputPath);

console.log(JSON.stringify({ outputPath, sheets: summary }, null, 2));
