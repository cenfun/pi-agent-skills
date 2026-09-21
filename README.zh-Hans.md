# pi-agent-skills

[English](README.md) | 简体中文

一组可供 [pi coding agent](https://pi.dev) 按需加载的 Agent Skills。

## Skills

| Skill | 说明 | 依赖 |
| --- | --- | --- |
| [`export-data-to-excel`](skills/export-data-to-excel/SKILL.md) | 将结构化数据、查询结果、日志和报告导出为 `.temp/` 下带日期的 `.xlsx` 工作簿。包含支持显式列、自动列宽和多工作表的通用导出脚本。 | Node.js、`xlsx` |
| [`figma-snapshot-to-html`](skills/figma-snapshot-to-html/SKILL.md) | 将插件导出的 `.temp/figma-snapshot.json` 页面与状态转换为高保真、响应式、可交互的 HTML/CSS、React、Vue、Svelte 等 Web UI。包含渐进式设计清单、导出保真度诊断、交互、资源和 Token 检查工具，以及视觉与行为验证指南。 | Figma 桌面版、**Figma to AI JSON** 插件、Node.js |
| [`prefer-nodejs-scripts`](skills/prefer-nodejs-scripts/SKILL.md) | 当任务需要临时脚本进行自动化、数据处理、代码生成、仓库维护或调试时，默认优先使用 Node.js 和内置模块，而不是 Python。 | Node.js |

## 安装本仓库的 Skills

首先，克隆或下载本仓库到本地：

```bash
git clone https://github.com/cenfun/pi-agent-skills.git
```

### 全局安装

将仓库中 `skills` 目录下的内容复制到 `~/.pi/agent/skills`：

```bash
mkdir -p ~/.pi/agent/skills
cp -R pi-agent-skills/skills/* ~/.pi/agent/skills/
```

全局安装的 Skills 可在所有项目中使用，pi 会在下次启动时自动发现它们。

### 项目安装

将仓库中 `skills` 目录下的内容复制到目标项目的 `.pi/skills`：

```bash
mkdir -p /path/to/project/.pi/skills
cp -R pi-agent-skills/skills/* /path/to/project/.pi/skills/
```

项目安装的 Skills 仅在该项目中可用。信任该项目后，pi 会自动发现它们。

## 使用

pi 会根据 Skill 的 `description` 判断是否需要加载它。你可以直接描述任务，例如：

```text
请将这些查询结果导出到 .temp 下的 Excel 工作簿，并分别生成汇总和明细工作表。
```

```text
请根据 .temp/figma-snapshot.json 中的“资产全览”页面，在当前 Vue 项目中实现对应页面。
```

```text
写一个临时脚本，扫描 src 目录并生成组件清单。
```

如果启用了 Skill Commands，也可以显式加载：

```text
/skill:export-data-to-excel
/skill:figma-snapshot-to-html
/skill:prefer-nodejs-scripts
```

## 安全提示

Skill 可能指导 Agent 执行命令或运行随附脚本。安装第三方 Skill 前，请先检查其 `SKILL.md`、脚本和相关资源，并仅在可信项目中启用项目级 Skill。

## License

[MIT](LICENSE) © 2026 CenFun
