// 把 plan/spec.md 渲染成带外壳的 plan/spec.html（浏览器里读起来方便些）
// 用法: node _dev/gen-plan-html.js
//
// 为什么只剩 spec 一份：
//   roadmap.md 从 v2 起有正式落点了——_dev/build-plan.js 把它渲染成站点首页级的
//   reference/plan.html（带全站导航、搜索、配色、进度）。再从这份脚本渲一遍到
//   plan/roadmap.html，就是同一个源的两个壳，必然漂：这一份的顶栏还停在「三个链接」时代，
//   侧栏没有分区，外壳没有 assets/app.js，而它照样出现在 checklinks 的扫描范围里。
//   spec.md 不一样，它是**开发文档**，不是学习材料，没有也不该有站点页面，所以留在这里渲染。
//
// 转换器直接用 _dev/md.js：这份脚本原先自带一份 70 行的复制品（锚点前缀 sec-、
// 不支持单星号斜体、不支持块级 HTML 直通），和 md.js 是同一个源的两个实现。
// md.js 的默认 idPrefix 就是 'sec-'，锚点与旧输出一致，所以换过去是纯替换。
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..');
const PLAN = path.join(ROOT, 'plan');
const { convert, esc } = require('./md');

const PAGES = [
  { md: 'spec.md', title: '学习资料规范', crumb: '计划与规范 · 材料规范', lead: '规定学习材料怎么写、怎么排版、怎么自检。新增或修改任何一页材料前先看它。' },
];

// 侧栏：这一页自己 + 站点里那两个真页面。
// spec.html 在 plan/ 里是独苗（roadmap.md 已升级成站点页面 reference/plan.html），
// 所以列全三个。
// 「本页」那条用 self 标，不靠文件名推——NAV 里另外两条带 '../' 前缀，推不出来。
const NAV = [
  { file: 'spec.html', label: '材料规范', self: true },
  { file: '../reference/plan.html', label: '学习计划', self: false },
  { file: '../reference/questions.html', label: '题目索引', self: false },
];

for (const p of PAGES) {
  const raw = fs.readFileSync(path.join(PLAN, p.md), 'utf8');
  // md 自带的第一个 h1 拿来当页面标题，避免与外壳的 h1 重复
  const h1m = raw.match(/^#\s+(.*)$/m);
  const h1 = h1m ? h1m[1].trim() : p.title;
  const md = raw.replace(/^#\s+.*\n/, '');
  const { body, anchors } = convert(md);
  const toc = anchors.filter(a => a.lv <= 2 && a.lv > 1)
    .map(a => `<li><a class="item" href="#${a.id}"><span>${esc(a.text)}</span></a></li>`).join('\n      ');

  const siblings = NAV.map(n =>
    `<li><a class="item${n.self ? ' cur' : ''}" href="${n.file}"><span>${n.label}</span></a></li>`
  ).join('\n    ');

  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${h1} — AI Agent 学习资料</title>
<link rel="stylesheet" href="../assets/style.css">
</head>
<body>

<header class="topbar">
  <a href="../index.html">← 总目录</a>
  <a href="../reference/plan.html">学习计划</a>
  <span class="crumb">${p.crumb}</span>
</header>

<div class="layout">
<nav class="sidenav">
  <a class="up" href="../index.html">← 总目录</a>
  <a class="up" href="../reference/plan.html">学习计划</a>
  <div class="grp">参考</div>
  <ul>
    ${siblings}
  </ul>
  <div class="grp">本页目录</div>
  <ul>
      ${toc}
  </ul>
</nav>

<main class="wrap" id="main">

<h1>${h1}</h1>
<p class="lead">${p.lead}</p>

<div class="warn">
  <span class="tag">关于这一页</span>
  <p>这是 <code>plan/${p.md}</code> 的<strong>渲染版本</strong>，方便在浏览器里读。要改内容请改 Markdown 源文件后重新生成，这一页是生成出来的。</p>
</div>

${body}

<div class="pager">
  <a href="../reference/plan.html">← 学习计划</a><span class="spacer"></span><a href="../reference/questions.html">题目索引：哪份材料讲这道题 →</a>
</div>

</main>
</div>

</body>
</html>
`;
  const outFile = path.join(PLAN, p.md.replace(/\.md$/, '.html'));
  fs.writeFileSync(outFile, html, 'utf8');
  console.log(`  ✓ plan/${p.md}  →  plan/${path.basename(outFile)}  (${html.split('\n').length} 行, ${anchors.length} 个标题锚点)`);
}
