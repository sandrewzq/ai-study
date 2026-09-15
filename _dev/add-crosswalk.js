// 给 6 个目录页补上「与学习计划的对照」表（步骤 1 那页早就有，其余 6 页缺失，不一致）
//
// 表格数据全部从页面自身推导，不手写：
//   · 步骤名 / 域组合 / 总题量 ← topbar 的 crumb
//   · 域编号（C/D/E/F/G/H/I/J）· 域名称 · 域题量 ← 各域的 <h2 id="c">上下文治理与流式通信（23 题）</h2>
//   · 每份材料的编号 / 标题 / 对应题号 ← 该域下面 .cards 里的 .card（.num / h3 / .qbadges）
//   · 00 导读页 ← 侧栏里那条 00 的标题
// 推导完会做校验：各域题量之和必须等于 crumb 里的总数，不一致就报错退出，不写文件。
//
// 用法：node _dev/add-crosswalk.js [--check]
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..');
const CHECK = process.argv.includes('--check');

// 不占步骤的两个专题，域那一格补一句定位说明
const DOMAIN_NOTE = {
  h: '不占步骤，全程并行',
  i: '不占步骤，按方向取舍',
};

const PAGES = [
  'step-2-systems/index.html',
  'step-3-frontend-and-cost/index.html',
  'step-4-storytelling/index.html',
  'step-5-final-prep/index.html',
  'ai-workflow/index.html',
  'ops-delivery/index.html',
];

const text = h => h.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

function build(rel) {
  const abs = path.join(ROOT, rel);
  const s = fs.readFileSync(abs, 'utf8');

  // 1) crumb：步骤名 + 域 + 总题量
  const crumb = text(s.match(/<span class="crumb">([\s\S]*?)<\/span>/)[1]);
  const totalM = crumb.match(/(\d+)\s*题/);
  if (!totalM) throw new Error('crumb 里找不到总题量：' + crumb);
  const total = +totalM[1];

  // 2) 00 导读页（有的域没有）
  const sidebar = s.match(/<nav class="sidenav">([\s\S]*?)<\/nav>/)[1];
  const zeroM = sidebar.match(/<span class="n">00<\/span><span>([\s\S]*?)<\/span>/);
  const zeroTitle = zeroM ? text(zeroM[1]) : null;

  // 3) 各域：<h2 id="c">标题（N 题）</h2> 后面跟的 .cards
  const body = s.slice(s.indexOf('<h1'));
  const marks = [...body.matchAll(/<h2 id="([a-j])">([\s\S]*?)<\/h2>/g)];
  const domains = [];
  for (let i = 0; i < marks.length; i++) {
    const [, id, rawTitle] = marks[i];
    if (id === 'how') continue;
    const title = text(rawTitle).replace(/（\d+\s*题）\s*$/, '');
    const cntM = text(rawTitle).match(/（(\d+)\s*题）/);
    if (!cntM) throw new Error(`域 ${id} 的 h2 里找不到题量：${text(rawTitle)}`);
    const seg = body.slice(marks[i].index, i + 1 < marks.length ? marks[i + 1].index : body.length);
    const cards = [...seg.matchAll(/<a class="card" href="([^"]*)">([\s\S]*?)<\/a>/g)].map(m => ({
      href: m[1],
      num: text(m[2].match(/<div class="num">([\s\S]*?)<\/div>/)[1]).replace(/\s*·.*$/, ''),
      title: text(m[2].match(/<h3>([\s\S]*?)<\/h3>/)[1]).replace(/（按方向选读）$/, ''),
      q: ((m[2].match(/<div class="qbadges">([\s\S]*?)<\/div>/) || [, ''])[1].trim())
        // 卡片里题号是紧挨的，表格里跟步骤 1 那页保持一致，用空格隔开
        .replace(/<\/span><span class="q">/g, '</span> <span class="q">'),
    }));
    domains.push({ id: id.toUpperCase(), title, count: +cntM[1], cards });
  }

  // 4) 校验：各域题量之和 == crumb 总数；各域卡片里列出的题号个数 == 该域题量
  const sum = domains.reduce((a, d) => a + d.count, 0);
  if (sum !== total) throw new Error(`各域题量之和 ${sum} ≠ crumb 总数 ${total}`);
  for (const d of domains) {
    if (!d.cards.length) throw new Error(`域 ${d.id} 下面没有卡片`);
    const listed = d.cards.reduce((a, c) => a + (c.q.match(/<span class="q">/g) || []).length, 0);
    if (listed !== d.count) throw new Error(`域 ${d.id} 卡片里列了 ${listed} 个题号，但标题写的是 ${d.count} 题`);
  }

  const matCount = domains.reduce((a, d) => a + d.cards.length, 0) + (zeroTitle ? 1 : 0);

  // 5) 拼表格
  const rows = [];
  if (zeroTitle) {
    rows.push(`    <tr><td>00</td><td>${zeroTitle}</td>` +
      `<td><strong>导读</strong>（不属于任何域，讲清这一步要做什么、做到什么程度）</td>` +
      `<td>不覆盖题目</td></tr>`);
  }
  for (const d of domains) {
    const note = DOMAIN_NOTE[d.id.toLowerCase()];
    const pos = `<strong>${d.id} 域 · ${d.title}</strong>（${d.count} 题${note ? '｜' + note : ''}）`;
    d.cards.forEach((c, i) => {
      const first = i === 0 ? `<td rowspan="${d.cards.length}">${pos}</td>` : '';
      rows.push(`    <tr><td>${c.num}</td><td>${c.title}</td>${first}<td>${c.q}</td></tr>`);
    });
  }

  const section =
    `<h2>与学习计划的对照</h2>\n\n` +
    `<p>这 ${matCount} 份材料严格对应学习计划里<strong>${crumb}</strong>，不多不少：</p>\n\n` +
    `<table>\n` +
    `  <thead><tr><th style="width:6%">#</th><th style="width:24%">材料</th>` +
    `<th style="width:34%">在学习计划里的位置</th><th>对应题号</th></tr></thead>\n` +
    `  <tbody>\n${rows.join('\n')}\n  </tbody>\n` +
    `</table>\n\n`;

  // 6) 插在 .warn 之前（和步骤 1 的顺序一致：导语 → 完成标志 → 对照表 → 提示）
  const warnAt = s.indexOf('<div class="warn">');
  if (warnAt < 0) throw new Error('找不到 <div class="warn">，无法定位插入点');
  if (s.includes('<h2>与学习计划的对照</h2>')) throw new Error('这一页已经有对照表了，先删掉再加');

  const out = s.slice(0, warnAt) + section + s.slice(warnAt);
  return { out, crumb, matCount, domains, total, abs };
}

let ok = 0;
for (const rel of PAGES) {
  try {
    const r = build(rel);
    const detail = r.domains.map(d => `${d.id}域 ${d.count}题/${d.cards.length}份`).join('  ');
    if (CHECK) {
      console.log(`  ✗ 待改  ${rel}\n         ${r.crumb}｜${r.matCount} 份｜${detail}`);
    } else {
      fs.writeFileSync(r.abs, r.out);
      console.log(`  ✓ ${rel}\n      ${r.crumb}｜${r.matCount} 份｜${detail}`);
    }
    ok++;
  } catch (e) {
    console.log(`  ⚠️  ${rel}\n      ${e.message}`);
    process.exitCode = 1;
  }
}
console.log(`\n${CHECK ? '待改' : '已改'} ${ok}/${PAGES.length} 个目录页`);
