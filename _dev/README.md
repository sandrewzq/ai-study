# _dev · 自检脚本

零依赖，只要有 Node。**所有脚本都在仓库根目录下执行**（不是在 `_dev/` 里）：

```bash
node _dev/navcheck.js      # 导航规范：顶栏无链接 / 无自链接 / 三段齐 / 当前页标记唯一 / 上层出口齐备
node _dev/checklinks.js    # 死链、锚点、标签配对、正文文件名引用、敏感词
node _dev/speccheck.js     # 图例、图说、ASCII 图、目录页对照表、材料页 12 项骨架
node _dev/density.js       # 每页可见字符数是否落在 3600~6600 区间
node _dev/themecheck.js    # 深色配色的两对映射块（跟随系统 / 手动切换）是否逐项对齐
node _dev/rendercheck.js   # 68 个页面 × 1440/768/360 三个视口：溢出、栅格、横向滚动
```

任一不过就退出码 1。前五个是纯文本检查，秒出；`rendercheck.js` 要跑无头浏览器，慢一些。

`checklinks.js` 的第 5 项是措辞检查，词表放在 `local-words.txt`。
**那个文件不进仓库**——它列的就是不该公开的字眼；没有它时这一项自动跳过，其余四项照常。

### `pagekind.js` · 页型的唯一判据

不是检查器，是上面几个脚本共用的一个模块：**一页套哪套规则，只在这里判一次。**

```js
const { kindOf, rootPrefix, hrefFrom, isSurvey, isSkeletonPage } = require('./pagekind.js');
```

判据是**名字**，不是位置——参考页那两条路径写在 `NAV.refs` 里：

| `kindOf(rel)` | 是哪些页 | 管什么 |
|---|---|---|
| `entry` | 根 `index.html` | 着陆页，侧栏装站点级导航 |
| `dir` | 子目录 `index.html` | 一个步骤 / 一个专题的材料目录 |
| `ref` | `NAV.refs` 点名的那两条（`reference/plan.html` / `reference/questions.html`） | 不属于任何步骤的查询页，侧栏只有两段 |
| `material` | 其余 | 正文页，11 项骨架 + 字数区间都管它 |

不要按内容特征判断（有没有 `.qbadges`、有没有 `.hero`）——那是内容的属性，会随内容漂。

> **参考页曾经按「根目录下任何非 `index.html` 的页」判**，那是一条位置事实：它随目录结构变，
> 而且变了不报错。两个参考页一搬进 `reference/`，`kindOf` 会把它们判成材料页——
> `apply-nav` 套错侧栏、`navcheck` 按材料页的规则验、`buildOwners` 把它们当认领方。
> 今天恰好都没炸（侧栏是手写的、没有 `.qbadges`），正是最坏的那种「静默失效」。
> 现在改目录只动 `NAV.refs` 一处，`hrefFrom` / `rootPrefix` / `kindOf` 全从它派生。

**豁免是两个问题，不是一个**，所以有两个谓词：`isSurvey`（不受字数区间约束）和
`isSkeletonPage`（不套 11 项骨架）。自查页只豁免前者——理由和那两个 bug 写在
`plan/spec.md` 第三节。

> 收这个模块的直接原因就是这两个 bug：判据此前在六个脚本里各写了一遍，其中两条豁免
> 正则看着口径一致、实际不一致，而且**两条都静默**（一条多豁免了一页，一条少豁免了一页，
> 被误伤的两页恰好都在区间内、骨架都齐）。同一件事写六遍，就有六个地方可以写错。

`node _dev/pagekind.js` 会打一张分类表，加页型时用它肉眼核对。

`themecheck.js` 盯的是「同一条映射写了两遍」这件事：`style.css` 里深色有两套触发方式
（`@media (prefers-color-scheme: dark)` 跟随系统、`:root[data-theme="dark"]` 手动切换），
每套都是一份 `--dk-*` → 正式变量的映射，共有两对（站点变量、语义色板）。
漏一项既不报错也不在浅色下露馅，只有「系统深色 + 手动切浅色」那一种组合下才缺色——
人工测不全，所以交给脚本比对变量名。

## 生成类

全都支持 `--check`：只比对、只报告漂移，不改写文件，有漂移就退出码 1。

```bash
node _dev/build-plan.js --check     # reference/plan.html 里的学习计划正文与 plan/roadmap.md 是否一致
node _dev/build-plan.js             # 不一致时重新生成（含计划正文、页内目录和题号链接）
node _dev/build-questions.js --check # reference/questions.html 里 242 题清单与 plan/questions.md + 各页徽章是否一致
node _dev/build-questions.js        # 不一致时重新生成
                                    # 导语和「这一页怎么用」写在 questions.html 的**壳**里（.lead + .warn），
                                    # 不在 md 里——md 只剩数据（h1 + 十个域 + 打勾条目）。改导语改壳。
node _dev/add-crosswalk.js --check  # 7 个目录页的「与学习计划的对照」表
node _dev/add-crosswalk.js          # 缺了就补（数据从页面自身推导，推导时会交叉校验）
node _dev/apply-nav.js --check      # 全站导航外壳（topbar + 三段侧栏 + 配色引导/跳到正文/app.js）
node _dev/apply-nav.js              # 按规范重写导航外壳（可重入，重复跑结果一致）
node _dev/add-toc.js --check        # 材料页正文开头的「本页目录」（目录页/入口页/参考页豁免）
node _dev/add-toc.js                # 按各页 h2 重新生成
node _dev/link-questions.js --check # 三个消费页里的题号是否都链到了讲它的那份材料
node _dev/link-questions.js         # 全量重刷（242 题 / 402 处）
node _dev/build-search.js --check   # assets/search-index.js 是否该重新生成
node _dev/build-search.js           # 68 页 / 347 个章节 / 约 135 KB
```

### 改内容的正确顺序

题目、正文这些**手改**；凡是「由别处推导出来」的，改完源头跑一遍上面这组脚本，
否则 `--check` 会报漂移：

```bash
# 改了 plan/roadmap.md（计划的章节与顺序）
node _dev/build-plan.js           # 重建 reference/plan.html 正文；它内部会调 link-questions 的 linkify，
                                  # 题号链接不会丢，不用再单独跑一次
                                  # 删/加一节会让其后锚点整体前移，它的 .toc 会一并重算

# 改了 plan/questions.md（242 题清单）
node _dev/build-questions.js && node _dev/build-search.js

# 改了任何一页的正文（新增/删除 h2、改标题、动题号徽章）
node _dev/add-toc.js && node _dev/build-search.js

# 新增了一页材料
node _dev/apply-nav.js && node _dev/add-toc.js && node _dev/build-search.js

# 改了某份材料覆盖的题号（哪份材料覆盖哪些题）
node _dev/link-questions.js && node _dev/build-search.js

# 收尾：全绿了再提交
node _dev/checklinks.js && node _dev/navcheck.js && node _dev/speccheck.js && \
  node _dev/density.js && node _dev/themecheck.js
```

`link-questions.js` 的映射是**强约束**，有**三条边**，都要成立：

| 边 | 不变量 | 破了说明什么 | 谁守 |
|---|---|---|---|
| A | 每个被引用的题号恰好一份材料认领 | 漏写材料 / 边界不清 | 逐页 `linkify()`，页内自检 |
| B | Σ(每份材料认领的题号数) == 该域标题里的题量 | 域标题和卡片对不上 | `add-crosswalk.js`，页内自检 |
| C | Σ(各目录页 crumb 里的题量) == 全站认领总数 | 每页都自洽、总数却变了 | `checkDirTotals()`，跨页自检 |

A 边其实是**两个方向**。反向那半（每个认领的题号都被引用）是后补的，补它的原因值得记一笔：
**原来只查「这一页里出现的题号」**，而入口页恰好含全部 242 个，于是约束靠这个巧合间接成立。
学习计划正文一从入口页搬到 `reference/plan.html`、题库独立成 `reference/questions.html`，
检查范围就会静默缩小，而脚本照旧打印「✓ 每个题号恰好一份材料认领」——
最坏的那种失效：**看起来更绿了**。
现在 `CONSUMERS` 列的是「哪些页面参与题号引用」，覆盖面是**比出来的**、不是数出来的，
正文搬到哪一页、拆成几页都不影响。

C 边是最容易漏的那种，因为 A 和 B 都只看**一页之内**：
少认领 5 个题号、同时把某个域的标题从 22 改成 17，A 和 B 会照旧通过——两边都「内部对上了」。
而 crumb 里的题量是读者最先看到的数字，它必须和全站认领数一致。

题号的判据（什么算题号、一页认领了哪些、一页声称有多少题）收在 `qids.js` 里一份，
上面三条边都读它。三条边分属两个脚本，各写一份正则必然分叉——**历史上就分叉过一次**。

两种失败都会在**写盘之前**退出（先全部算完再统一写），不会留下半成品。
`checklinks.js` 会顺带把生成的 402 条链接全验一遍，等于白捡一层回归。

`gen-plan-html.js` 把 `plan/spec.md` 渲染成 `plan/spec.html`（开发文档，不是学习材料，
所以它没有站点页面，也不进 68 页的统计）。它**不在上面那张生成类清单里、没有 `--check`**——
改完 spec.md 要手动跑一次，`checklinks` 会验它里面的链接。**只渲染 spec 这一份**：`roadmap.md` 从 v2 起
有正式落点了——`build-plan.js` 把它渲染成站点级的 `reference/plan.html`，再从这份脚本渲一遍到
`plan/roadmap.html` 就是同一个源的两个壳，必然漂（那一份的顶栏还停在「三个链接」时代，
侧栏没有分区，外壳没有 `assets/app.js`）。`plan/roadmap.html` 已删除，别再加回来。
渲染走 `md.js`，本脚本原先自带过一份 70 行的复制品，已删。

## 不用跑但要知道的

- **`.skelnote` 和 `.blank` 是手写进页面的，没有生成脚本。** 材料页「讲解骨架」标题后面那句
  用法说明、以及数字槽位 `X` / `XX` / `X%` 的填空样式，都是一次性写进去的
  （批量那一次跑的是 `oneoff/add-skelnote.js` 和 `oneoff/blank-inline.js`）。
  新增材料页要自己带上 `.skelnote`，`speccheck.js` 的第 9 项**连位置一起管**——
  它查的是标题后面紧跟的那一段。数字槽位的判据（哪些 `X` 该包、哪些是修辞占位）
  写在 `plan/spec.md` 第二节，**包错了没有脚本会报**，所以那两条反例要看一遍。
- `assets/app.js` 是交互层（搜索 / 完成标志打勾 / 配色切换 / 回到顶部），
  **由 `apply-nav.js` 统一注入**，别在页面里手写 `<script>` 标签——68 份手抄必然漂。
- `--topbar-h` 是锚点落点的唯一依据。CSS 里给了两档静态值供无 JS 时兜底，
  有 JS 时 `app.js` 会量真实高度写回去（窄屏 + 长 crumb 会让顶栏折成两行）。
  改顶栏高度或内边距后，`rendercheck.js` 看的是几何、看不出这个，得人工量一下。
- 深色配色在 `style.css` 里是**四块**映射、两对（站点变量 + 语义色板），
  每对都是「跟随系统」和「手动切换」各写一遍。色值单源在 `:root`。
  改色值只改 `:root` 那一处，别改映射块；映射块由 `themecheck.js` 回归。

## 目录

- `md.js` — 共用的 Markdown → HTML 转换器（支持块级原始 HTML 直通，追问链靠它）
- `pagekind.js` — 页型的唯一判据（见上）
- `qids.js` — 题号的唯一判据：什么算题号、一页认领了哪些、一页声称有多少题。
  `link-questions.js` 和 `add-crosswalk.js` 都读它，上面那三条边共用一份口径
- `probe.js` — 注入式的布局探针，`rendercheck.js` 用它读几何数据
- `_样式样张.html` — 样式样张，改 `assets/style.css` 时对着看
- `oneoff/` — **一次性迁移脚本，已经跑完，本地留档，不在仓库里**。
  在非 git 工作区里批量改文件用的，比如改文件名、修字符画、重建侧栏。别直接跑。
