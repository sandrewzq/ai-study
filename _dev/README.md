# _dev · 自检脚本

零依赖，只要有 Node。**所有脚本都在仓库根目录下执行**（不是在 `_dev/` 里）：

```bash
node _dev/navcheck.js      # 导航规范：顶栏无链接 / 无自链接 / 三段齐 / 当前页标记唯一 / 上层出口齐备
node _dev/checklinks.js    # 死链、锚点、标签配对、正文文件名引用、敏感词
node _dev/speccheck.js     # 图例、图说、ASCII 图、目录页对照表、材料页 11 项骨架
node _dev/density.js       # 每页可见字符数是否落在 4000~6000 区间
node _dev/rendercheck.js   # 66 个页面 × 1440/768/360 三个视口：溢出、栅格、横向滚动
```

任一不过就退出码 1。前四个是纯文本检查，秒出；`rendercheck.js` 要跑无头浏览器，慢一些。

`checklinks.js` 的第 5 项是措辞检查，词表放在 `local-words.txt`。
**那个文件不进仓库**——它列的就是不该公开的字眼；没有它时这一项自动跳过，其余四项照常。

## 生成类

```bash
node _dev/build-entry.js --check   # 校验 index.html 里的学习计划正文与 plan/roadmap.md 是否一致
node _dev/build-entry.js           # 不一致时重新生成（含计划正文和它自带的目录）
node _dev/add-crosswalk.js --check # 校验 7 个目录页的「与学习计划的对照」表
node _dev/add-crosswalk.js         # 缺了就补（数据从页面自身推导，推导时会交叉校验）
node _dev/apply-nav.js --check     # 校验全站导航外壳（topbar + 三段侧栏）
node _dev/apply-nav.js             # 按规范重写导航外壳（可重入，重复跑结果一致）
```

`gen-plan-html.js` 把 `plan/*.md` 渲染成同名 `.html`，**产物不进仓库**（见 `.gitignore`），
学习计划的正式载体是 `index.html` 里嵌的那一份。

## 目录

- `md.js` — 共用的 Markdown → HTML 转换器（支持块级原始 HTML 直通，追问树靠它）
- `probe.js` — 注入式的布局探针，`rendercheck.js` 用它读几何数据
- `_样式样张.html` — 样式样张，改 `assets/style.css` 时对着看
- `oneoff/` — **一次性迁移脚本，已经跑完，本地留档，不在仓库里**。
  在非 git 工作区里批量改文件用的，比如改文件名、修字符画、重建侧栏。别直接跑。
