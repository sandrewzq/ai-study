# AI Agent 学习笔记

按知识域系统整理的一套学习材料，覆盖 RAG 全链路、Agent 与多智能体，以及配套的后端与数据知识。

## 怎么用

浏览器打开根目录的 **`index.html`**（双击即可，纯静态、零依赖）。左侧是常驻目录，任何一页都能跳转。

也可以直接访问线上版本：**https://sandrewzq.github.io/ai-study/**

## 内容

| 路径 | 说明 |
|---|---|
| `index.html` | 总入口，同时也是 242 道题的完整分类与学习路线 |
| `step-1-foundation/` | 步骤 1 · 打地基：LLM 与 RAG、Agent 与多智能体（10 份材料） |
| `step-2-systems/` | 步骤 2 · 做系统：上下文治理与流式通信、后端与数据（11 份材料） |
| `plan/roadmap.html` | 学习计划的独立页（源文件是 `plan/roadmap.md`） |
| `plan/spec.html` | 材料写法与排版规范（源文件是 `plan/spec.md`） |
| `assets/style.css` | 全站共用样式表 |

`plan/` 下这两页是**从同名 Markdown 生成**的，改内容要改 `.md` 再重新生成：

```bash
node _dev/gen-plan-html.js      # 需要 _dev/（见下方说明）
```

## 结构

- 纯静态 HTML + 一份共用样式表，**不需要构建、不需要起服务器**
- 每份材料统一结构：导语 → 主图 → 正文 → 讲解骨架 → 延伸问题 → 自查卡
- 图示全部是内联 SVG / CSS，零外部依赖、离线可用、适配深色模式
- 目录名与文件名一律英文，页面标题和正文保持中文
- 根目录只放 `index.html`、`README.md`、`.gitignore`

## 自检

改动任何一页后跑这两个脚本（位于本地 `_dev/`，未随仓库发布）：

```bash
node _dev/checklinks.js     # 死链 + 页内锚点 + 标签配对
node _dev/rendercheck.js    # 7 个页面 × 3 个视口，查样式加载与横向溢出
```

## 说明

- 材料里的题目均为脱敏整理，公司名用缩写表示
- 本地开发辅助（`_dev/`）与第三方参考长文（`notes/`）已列入 `.gitignore`，不随仓库发布
