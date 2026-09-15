// 导航规范校验（对齐 plan/spec.md 第一节「导航约定」）
//
// 规则：
//  R1  <header class="topbar"> 里不许出现 <a>（topbar 只报位置）
//  R2  侧栏不许出现指向当前页的链接（目录页上那条 href="index.html" 的自链接）
//  R3  非入口页侧栏必须有且只有「往上 / 这一层 / 参考」三个分区标题
//  R4  材料页侧栏必须有且只有一条 .item.cur
//  R5  材料页侧栏「往上」必须同时有 ← 总目录 和 ← 材料目录
//  R6  目录页侧栏「往上」只能有 ← 总目录
//  R7  全站每个页面（含入口页）都能从侧栏走到入口页
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..');

const PAGES = [];
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    if (e.name.startsWith('.')) continue;
    const p = path.join(d, e.name);
    if (e.isDirectory()) {
      if (!['_dev', 'notes', 'plan', 'node_modules', '.git'].includes(e.name)) walk(p);
    } else if (e.name.endsWith('.html')) PAGES.push(path.relative(ROOT, p));
  }
})(ROOT);
PAGES.sort();

const fail = [];
const bad = (rel, rule, msg) => fail.push(`${rel}  [${rule}] ${msg}`);

for (const rel of PAGES) {
  const s = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  const base = path.basename(rel);
  const isEntry = rel === 'index.html';
  const isDirPage = base === 'index.html' && !isEntry;
  const kind = isEntry ? '入口' : (isDirPage ? '目录' : '材料');

  const tb = s.match(/<header class="topbar">([\s\S]*?)<\/header>/);
  const nav = s.match(/<nav class="sidenav">([\s\S]*?)<\/nav>/);
  if (!tb) { bad(rel, 'R1', '没有 topbar'); continue; }
  if (!nav) { bad(rel, 'R*', '没有 sidenav'); continue; }
  const tbHtml = tb[1], navHtml = nav[1];

  // R1
  const tbLinks = [...tbHtml.matchAll(/<a\s[^>]*href="([^"]*)"/g)].map(m => m[1]);
  if (tbLinks.length) bad(rel, 'R1', `topbar 里有 ${tbLinks.length} 个链接：${tbLinks.join(', ')}`);
  if (!/<span class="crumb">/.test(tbHtml)) bad(rel, 'R1', 'topbar 里没有 crumb');

  // R2：当前页指回自己。只有目录页 / 入口页的自我文件名是 index.html 才可能自链接
  const selfHrefs = (isDirPage || isEntry) ? ['index.html', './index.html', base] : [];
  for (const h of selfHrefs) {
    if (new RegExp(`<a\\s[^>]*href="${h.replace('.', '\\.')}"`).test(navHtml))
      bad(rel, 'R2', `侧栏有指向自己的链接 href="${h}"`);
  }

  // R3
  if (!isEntry) {
    const zones = ['往上', '这一层', '参考'].filter(z => navHtml.includes('>' + z + '</div>'));
    if (zones.length !== 3)
      bad(rel, 'R3', `分区标题应为 往上/这一层/参考 三个，实际 ${zones.length} 个：[${zones.join(',')}]`);
  }

  // R4
  const cur = (navHtml.match(/class="item cur"/g) || []).length;
  if (kind === '材料' && cur !== 1) bad(rel, 'R4', `当前页标记 .item.cur 应为 1 条，实际 ${cur} 条`);

  // R5 / R6：数「往上」段里到底有几条 .up
  if (!isEntry) {
    const zoneUp = navHtml.slice(navHtml.indexOf('>往上</div>'), navHtml.indexOf('>这一层</div>'));
    const ups = [...zoneUp.matchAll(/<a class="up" href="([^"]*)"/g)].map(m => m[1]);
    if (kind === '材料') {
      if (!ups.includes('../index.html')) bad(rel, 'R5', '「往上」缺 ← 总目录');
      if (!ups.includes('index.html')) bad(rel, 'R5', '「往上」缺 ← 材料目录');
      if (ups.length !== 2) bad(rel, 'R5', `「往上」应恰好 2 条，实际 ${ups.length} 条：${ups.join(', ')}`);
    } else {
      if (ups.join(',') !== '../index.html') bad(rel, 'R6', `目录页「往上」应只有 ← 总目录，实际：${ups.join(', ')}`);
    }
    // 参考段
    if (!/>参考<\/div>\s*<a class="up" href="\.\.\/index\.html#plan">/.test(navHtml))
      bad(rel, 'R3', '「参考」段缺 学习计划全文');
  }

  // R7：从侧栏能回到入口页
  const reach = isEntry
    ? true
    : /href="\.\.\/index\.html(#[^"]*)?"/.test(navHtml);
  if (!reach) bad(rel, 'R7', '侧栏里没有回入口页的链接');
}

console.log(`检查 ${PAGES.length} 个页面`);
if (fail.length) {
  console.log(`✗ ${fail.length} 项不合规：`);
  fail.forEach(f => console.log('  ' + f));
  process.exit(1);
}
console.log('✓ 顶栏无链接 / 无自链接 / 三段齐 / 当前页标记唯一 / 上层出口齐备');
