// 导航规范校验（对齐 plan/spec.md 第一节「导航约定」）
//
// 规则：
//  R1  <header class="topbar"> 里不许出现 <a>（topbar 只报位置）
//  R2  侧栏不许出现指向当前页的链接（目录页上那条 href="index.html" 的自链接）
//  R3  非入口页侧栏必须有且只有「往上 / 这一层 / 参考」三个分区标题
//  R4  材料页侧栏必须有且只有一条 .item.cur
//  R5  侧栏「往上」段只有一条 ← 总目录
//  R6  步骤名在材料页上是指向 index.html 的链接，在目录页上是纯文本（不许自链接）
//  R7  全站每个页面（含入口页）都能从侧栏走到入口页
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..');
const { kindOf, hrefFrom, NAV } = require('./pagekind.js');

const PAGES = [];
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    if (e.name.startsWith('.') || e.name.startsWith('__')) continue;
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
  const k = kindOf(rel);
  const isEntry = k === 'entry';
  const isDirPage = k === 'dir';
  const kind = { entry: '入口', dir: '目录', ref: '参考', material: '材料' }[k];
  // ref 是两个参考页（学习计划 / 题目索引），现在住在 reference/ 下。
  // 它和 material/dir 的差别只在两处：分区只有两段（「参考」段降级成纯文本分组标题，
  // 因为它自己就是那一层），以及.cur 那条自我标记是**故意的**（.item.cur 标「你在这儿」）。
  // 往上 / 参考段的路径不再手写——由 hrefFrom 从 NAV 模型算，和 apply-nav 生成时同一个函数。

  const tb = s.match(/<header class="topbar">([\s\S]*?)<\/header>/);
  const nav = s.match(/<nav class="sidenav">([\s\S]*?)<\/nav>/);
  if (!tb) { bad(rel, 'R1', '没有 topbar'); continue; }
  if (!nav) { bad(rel, 'R*', '没有 sidenav'); continue; }
  const tbHtml = tb[1], navHtml = nav[1];

  // R1
  const tbLinks = [...tbHtml.matchAll(/<a\s[^>]*href="([^"]*)"/g)].map(m => m[1]);
  if (tbLinks.length) bad(rel, 'R1', `topbar 里有 ${tbLinks.length} 个链接：${tbLinks.join(', ')}`);
  if (!/<span class="crumb">/.test(tbHtml)) bad(rel, 'R1', 'topbar 里没有 crumb');

  // R2：当前页指回自己。只有目录页 / 入口页的自我文件名是 index.html 才可能自链接。
  // 参考页的自我链接在「这一层」里，是**故意的**（.item.cur，标「你在这儿」），
  // 和这里要禁的那条不是一回事——它由 R4 的「恰好一条 .item.cur」守着。
  const selfHrefs = (isDirPage || isEntry) ? ['index.html', './index.html', base] : [];
  for (const h of selfHrefs) {
    if (new RegExp(`<a\\s[^>]*href="${h.replace('.', '\\.')}"`).test(navHtml))
      bad(rel, 'R2', `侧栏有指向自己的链接 href="${h}"`);
  }

  // R3：参考页两段（往上 / 这一层），其余非入口页三段
  if (k === 'ref') {
    const zones = ['往上', '这一层'].filter(z => navHtml.includes('>' + z + '</div>'));
    if (zones.length !== 2)
      bad(rel, 'R3', `参考页分区标题应为 往上/这一层 两个，实际 ${zones.length} 个：[${zones.join(',')}]`);
    if (/class="grp zone">参考<\/div>/.test(navHtml))
      bad(rel, 'R3', '参考页不该有「参考」段——两个参考页本身就是「这一层」，再列一遍就是同一组链接出现两次');
  } else if (!isEntry) {
    const zones = ['往上', '这一层', '参考'].filter(z => navHtml.includes('>' + z + '</div>'));
    if (zones.length !== 3)
      bad(rel, 'R3', `分区标题应为 往上/这一层/参考 三个，实际 ${zones.length} 个：[${zones.join(',')}]`);
  }

  // R4：材料页和参考页都要有且只有一条「你在这儿」
  const cur = (navHtml.match(/class="item cur"/g) || []).length;
  if ((kind === '材料' || k === 'ref') && cur !== 1)
    bad(rel, 'R4', `当前页标记 .item.cur 应为 1 条，实际 ${cur} 条`);

  if (k === 'ref') {
    // R5 / R6：参考页「往上」也是 ← 总目录，路径从 NAV 模型算（现在是 ../index.html）
    const zoneUp = navHtml.slice(navHtml.indexOf('>往上</div>'), navHtml.indexOf('>这一层</div>'));
    const ups = [...zoneUp.matchAll(/<a class="up" href="([^"]*)"/g)].map(m => m[1]);
    const wantUp = hrefFrom(rel, NAV.root);
    if (ups.join(',') !== wantUp)
      bad(rel, 'R5', `参考页「往上」应只有 ← 总目录（指向 ${wantUp}），实际：${ups.join(', ') || '（空）'}`);
    if (!/<div class="grp sub">参考<\/div>/.test(navHtml))
      bad(rel, 'R6', '参考页「这一层」的分组标题应是纯文本 <div class="grp sub">参考</div>');
  } else if (!isEntry) {
    // R5 / R6：往上段只有「← 总目录」；步骤名在材料页上是链接、在目录页上是纯文本
    const zoneUp = navHtml.slice(navHtml.indexOf('>往上</div>'), navHtml.indexOf('>这一层</div>'));
    const ups = [...zoneUp.matchAll(/<a class="up" href="([^"]*)"/g)].map(m => m[1]);
    if (ups.join(',') !== '../index.html')
      bad(rel, 'R5', `「往上」应只有 ← 总目录，实际：${ups.join(', ') || '（空）'}`);

    const subA = navHtml.match(/<a class="grp sub" href="([^"]*)">/);
    const subD = /<div class="grp sub">/.test(navHtml);
    if (kind === '材料') {
      // 材料页：步骤名本身就是回材料目录的入口，取代了原来那条「← 材料目录」
      if (!subA) bad(rel, 'R6', '材料页的步骤名应该是指向 index.html 的链接（<a class="grp sub">）');
      else if (subA[1] !== 'index.html') bad(rel, 'R6', `步骤名链接应指向 index.html，实际 ${subA[1]}`);
      if (subD) bad(rel, 'R6', '材料页的步骤名不该同时是纯文本');
    } else {
      // 目录页：那一步就是本页，不做成链接（不许出现指向自己的链接）
      if (!subD) bad(rel, 'R6', '目录页的步骤名应该是纯文本（<div class="grp sub">）');
      if (subA) bad(rel, 'R6', '目录页的步骤名不该是链接——那是指向本页的自链接');
    }

    // 参考段：两条，指向根目录的两个参考页。href 从 pagekind.js 的 NAV 模型算，
    // 不在检查器里写第二份字面量——这正是 apply-nav 生成时用的那一份。
    const wantRefs = NAV.refs.map(r => hrefFrom(rel, r.href)).join(',');
    const gotRefs = [...navHtml.matchAll(/<a class="up" href="([^"]*)">/g)]
      .map(m => m[1]).filter(h => h !== '../index.html').join(',');
    if (gotRefs !== wantRefs)
      bad(rel, 'R3', `「参考」段应指向 ${wantRefs}，实际：${gotRefs || '（空）'}`);
  }

  // R7：从侧栏能回到入口页。参考页搬进 reference/ 之后和材料页同一层，
  // 这条不再分叉——全站只有入口页自己豁免。
  const reach = isEntry ? true : /href="\.\.\/index\.html(#[^"]*)?"/.test(navHtml);
  if (!reach) bad(rel, 'R7', '侧栏里没有回入口页的链接');
}

console.log(`检查 ${PAGES.length} 个页面`);
if (fail.length) {
  console.log(`✗ ${fail.length} 项不合规：`);
  fail.forEach(f => console.log('  ' + f));
  process.exit(1);
}
console.log('✓ 顶栏无链接 / 无自链接 / 三段齐 / 当前页标记唯一 / 上层出口齐备');
