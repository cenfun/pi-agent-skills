---
name: export-data-to-excel
description: Exports structured data to dated Excel .xlsx workbooks with Node.js and the xlsx package. Use when users ask to create, generate, save, or convert data, query results, logs, reports, JSON records, or tabular datasets into Excel files.
compatibility: Requires Node.js and the xlsx npm package in the target project.
---

# Export Data to Excel

Export structured data to an `.xlsx` workbook using Node.js and `xlsx`. Use the bundled script rather than creating a one-off Python, CSV-only, ExcelJS, or other spreadsheet implementation.

## Hard rules

1. **Use Node.js and `xlsx`.** Do not substitute Python libraries, ExcelJS, CSV output, or HTML renamed to `.xlsx`.
2. **Inspect the source data before exporting.** Confirm the intended records, columns, column order, header labels, worksheet names, and whether multiple worksheets are required.
3. **Keep generated inputs and workbooks under the target project's `.temp/` directory by default.** Create the directory when needed.
4. **Use a topic-specific, dated filename.** Derive a concise prefix from the export task's subject (for example, `cloudwatch-404-logs`, `user-report`, or `monthly-sales`) rather than using a fixed generic prefix. The bundled script produces `<prefix>-YYMMDD-HHmmss.xlsx` using local time and requires the prefix through `--prefix` or `filePrefix` unless an explicit `--output` is supplied.
5. **Preserve data meaning.** Keep numbers and booleans typed, use empty cells for `null`/`undefined`, and serialize nested objects or arrays as JSON text unless the user requests a different flattening strategy.
6. **Do not silently drop fields or records.** Build an explicit column list when ordering, translated headers, widths, or empty-result headers matter.
7. **Validate the result.** Report the absolute output path, worksheet names, and exported row counts. Never claim success if workbook generation fails.
8. **Handle sensitive data deliberately.** Export only requested fields, do not print secrets in the console, and mention that the generated `.temp` workbook remains on disk when the data is sensitive.

## Bundled exporter

Resolve this skill's directory from the loaded `SKILL.md`, then run the helper from the **target project's root** so it can load that project's `xlsx` dependency and use its `.temp/` directory:

```bash
node <skill-dir>/scripts/export-excel.mjs .temp/excel-data.json
```

If `xlsx` is not already declared in the target project, install it with the project's package manager before running the helper, for example:

```bash
npm install xlsx
```

Do not install another spreadsheet package as a fallback.

### CLI

```text
node <skill-dir>/scripts/export-excel.mjs <input.json|-> [options]

Options:
  --output <file>   Exact output path; otherwise writes .temp/<prefix>-<date>.xlsx
  --prefix <name>   Topic-specific output filename prefix
  --sheet <name>    Worksheet name for a single-sheet input (default: data)
  --help            Show usage
```

Use `-` as the input to read JSON from stdin. Prefer a `.temp/*.json` input when the dataset or transformation needs to be inspected and reproduced.

## Input formats

### Simple row array

```json
[
  { "id": 1, "name": "Alpha", "active": true },
  { "id": 2, "name": "Beta", "active": false }
]
```

### One worksheet with explicit columns

Use explicit columns whenever headers or order are important. `width` is an Excel character width.

```json
{
  "sheetName": "users",
  "filePrefix": "user-report",
  "columns": [
    { "key": "id", "header": "ID", "width": 12 },
    { "key": "name", "header": "Name", "width": 30 },
    { "key": "active", "header": "Active", "width": 12 }
  ],
  "rows": [
    { "id": 1, "name": "Alpha", "active": true }
  ]
}
```

A column may also be a key string such as `"id"`. Explicit columns preserve a header row even when `rows` is empty.

### Multiple worksheets

```json
{
  "filePrefix": "monthly-report",
  "sheets": [
    {
      "name": "summary",
      "columns": ["metric", "value"],
      "rows": [{ "metric": "Total", "value": 42 }]
    },
    {
      "name": "details",
      "columns": ["id", "message"],
      "rows": [{ "id": 1, "message": "Example" }]
    }
  ]
}
```

Excel worksheet names must be unique, no longer than 31 characters, and cannot contain `: \\ / ? * [ ]`.

## Required workflow

1. Inspect project instructions, package manager, module conventions, and the source of the data.
2. Confirm the workbook contract: one or more sheets, exact column keys and labels, ordering, widths, date/time formatting, and output prefix.
3. Transform application-specific records into flat export rows. Format timestamps explicitly when users require a timezone or display format; do not assume UTC or local time semantics.
4. Write the input payload under `.temp/`, omitting any fields that were not requested.
5. Choose a concise prefix that reflects the task's actual subject, then run `scripts/export-excel.mjs` from the target project root with `--prefix <topic>` or `filePrefix`. Use the dated `.temp/` path unless the user explicitly requests another path.
6. Check the script summary against the source counts. For critical exports, reopen the workbook with `xlsx` and verify sheet names, headers, row counts, and representative typed values.
7. Report the generated path and a concise sheet/row summary.

## Empty data and large datasets

- For an empty result, provide explicit `columns` so the workbook still contains the expected headers.
- The `xlsx` community package builds worksheets in memory. For very large datasets, estimate memory needs before exporting and tell the user if the requested volume is unsafe; do not silently truncate data.
