# pi-agent-skills

[English](README.md) | 简体中文

一组可供 [pi coding agent](https://pi.dev) 按需加载的 Agent Skills。

## Skills

| Skill | 说明 | 依赖 |
| --- | --- | --- |
| [`figma-snapshot-to-html`](skills/figma-snapshot-to-html/SKILL.md) | 分析插件导出的 `.temp/figma-snapshot.json`，逐步提取页面结构、设计 Token、布局、字体和资源信息，并结合现有项目技术栈实现 HTML/CSS、React、Vue 等页面。包含 Snapshot 检查脚本和格式参考文档。 | Figma 桌面版、**Figma to AI JSON** 插件、Node.js |
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
请根据 .temp/figma-snapshot.json 中的“资产全览”页面，在当前 Vue 项目中实现对应页面。
```

```text
写一个临时脚本，扫描 src 目录并生成组件清单。
```

如果启用了 Skill Commands，也可以显式加载：

```text
/skill:figma-snapshot-to-html
/skill:prefer-nodejs-scripts
```

## 安全提示

Skill 可能指导 Agent 执行命令或运行随附脚本。安装第三方 Skill 前，请先检查其 `SKILL.md`、脚本和相关资源，并仅在可信项目中启用项目级 Skill。

## License

[MIT](LICENSE) © 2026 CenFun
