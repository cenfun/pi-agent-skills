# pi-agent-skills

English | [简体中文](README.zh-Hans.md)

A collection of on-demand Agent Skills for [pi coding agent](https://pi.dev).

## Skills

| Skill | Description | Requirements |
| --- | --- | --- |
| [`export-data-to-excel`](skills/export-data-to-excel/SKILL.md) | Exports structured data, query results, logs, and reports to dated `.xlsx` workbooks under `.temp/`. Includes a reusable exporter with explicit columns, automatic widths, and multi-sheet support. | Node.js, `xlsx` |
| [`figma-snapshot-to-html`](skills/figma-snapshot-to-html/SKILL.md) | Converts plugin-exported `.temp/figma-snapshot.json` screens and states into high-fidelity, responsive, interactive UI in the existing HTML/CSS, React, Vue, Svelte, or other web stack. Includes progressive inventory, export-fidelity diagnostics, interaction, asset, and token inspection plus visual/behavioral validation guidance. | Figma desktop app, **Figma to AI JSON** plugin, Node.js |
| [`prefer-nodejs-scripts`](skills/prefer-nodejs-scripts/SKILL.md) | Prefers Node.js and its built-in modules over Python when temporary scripts are needed for automation, data processing, code generation, repository maintenance, or debugging. | Node.js |

## Installing the Skills from This Repository

First, clone or download this repository to your local machine:

```bash
git clone https://github.com/cenfun/pi-agent-skills.git
```

### Global installation

Copy the contents of the repository's `skills` directory to `~/.pi/agent/skills`:

```bash
mkdir -p ~/.pi/agent/skills
cp -R pi-agent-skills/skills/* ~/.pi/agent/skills/
```

Globally installed Skills are available in every project. Pi will discover them the next time it starts.

### Project installation

Copy the contents of the repository's `skills` directory to `.pi/skills` in the target project:

```bash
mkdir -p /path/to/project/.pi/skills
cp -R pi-agent-skills/skills/* /path/to/project/.pi/skills/
```

Project-installed Skills are available only within that project. Pi discovers them after the project is trusted.

## Usage

Pi uses each skill's `description` to decide when to load it. You can simply describe your task, for example:

```text
Export these query results to an Excel workbook in .temp with separate summary and detail sheets.
```

```text
Implement the "Asset Overview" screen from .temp/figma-snapshot.json in the current Vue project.
```

```text
Write a temporary script that scans the src directory and generates a component inventory.
```

If Skill Commands are enabled, you can load a skill explicitly:

```text
/skill:export-data-to-excel
/skill:figma-snapshot-to-html
/skill:prefer-nodejs-scripts
```

## Security

Skills may instruct an agent to execute commands or run bundled scripts. Before installing a third-party skill, review its `SKILL.md`, scripts, and related resources. Only enable project-level skills in projects you trust.

## License

[MIT](LICENSE) © 2026 CenFun
