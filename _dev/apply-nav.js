// 导航收敛：把散在 topbar 和侧栏两处的同一组链接，收敛成「topbar 只报位置 + 侧栏唯一导航」
//
// 改前（58 个材料页，topbar 3 条 = 侧栏前 3 条，一字不差）：
//   <header class="topbar">
//     <a href="../index.html">← 总目录</a>
//     <a href="index.html">材料目录</a>
//     <a href="../index.html#plan">学习计划全文</a>
//     <span class="crumb">…</span>
//   </header>
//   <nav class="sidenav">
//     <a class="up" href="../index.html">← 总目录</a>
//     <a class="up" href="index.html">材料目录</a>
//     <a class="up" href="../index.html#plan">学习计划全文</a>
//     <div class="grp">步骤 2 · 做系统</div>
//     <ul>…</ul>
//   </nav>
//
// 改后：
//   <header class="topbar">
//     <span class="crumb">…</span>          ← 只留位置，不含任何链接
//   </header>
//   <nav class="sidenav">
//     <div class="grp">往上</div>
//     <a class="up" href="../index.html">← 总目录</a>
//     <a class="up" href="index.html">← 材料目录</a>     ← 目录页没有这条（原文是指向自己的自链接）
//     <div class="grp">这一层</div>
//     <div class="grp sub">步骤 2 · 做系统</div>
//     <ul>…</ul>                                        ← 原样搬过来，缩进不变
//     <div class="grp">参考</div>
//     <a class="up" href="../index.html#plan">学习计划全文</a>
//   </nav>
//
// 用法：node _dev/apply-nav.js [--check]
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..');
const CHECK = process.argv.includes('--check');

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

const UP_RE = /<a class="up( cur)?" href="([^"]*)">([\s\S]*?)<\/a>/g;

let changed = 0, topbarOnly = 0;
const problems = [];

for (const rel of PAGES) {
  const abs = path.join(ROOT, rel);
  const orig = fs.readFileSync(abs, 'utf8');
  let s = orig;

  // ---------- 1) topbar：只留 crumb ----------
  const tm = s.match(/<header class="topbar">([\s\S]*?)<\/header>/);
  if (!tm) { problems.push(rel + '：没有 topbar'); continue; }
  const cm = tm[1].match(/<span class="crumb">([\s\S]*?)<\/span>/);
  if (!cm) { problems.push(rel + '：topbar 里没有 crumb'); continue; }
  const newTop = '<header class="topbar">\n  <span class="crumb">' + cm[1] + '</span>\n</header>';
  if (tm[0] !== newTop) { s = s.replace(tm[0], newTop); topbarOnly++; }

  // ---------- 2) sidenav：改成 往上 / 这一层 / 参考 三段 ----------
  // 这一段是可重入的：解析只看「三个 .up 链接 + .grp.sub 的标题 + <ul>」，
  // 跟分区标题长什么样无关，所以重复跑结果一致。
  const nm = s.match(/<nav class="sidenav">([\s\S]*?)<\/nav>/);
  if (!nm) { problems.push(rel + '：没有 sidenav'); continue; }
  const inner = nm[1];
  const ups = [...inner.matchAll(UP_RE)];

  if (ups.length) {
    const upTop  = ups.find(u => u[2] === '../index.html');
    const upPlan = ups.find(u => u[2].endsWith('#plan'));
    if (!upTop || !upPlan) { problems.push(rel + '：侧栏 .up 链接不符合预期（' + ups.map(u => u[2]).join(',') + '）'); continue; }

    const isDirPage = path.basename(rel) === 'index.html';

    // 步骤名在材料页上是「回材料目录」的链接，在目录页上就是本页、只能是纯文本
    const grpM = inner.match(/<(?:div|a) class="grp sub"[^>]*>([\s\S]*?)<\/(?:div|a)>/);
    if (!grpM) { problems.push(rel + '：侧栏没有步骤分组标题（.grp.sub）'); continue; }
    const ulM = inner.match(/<ul>[\s\S]*?<\/ul>/);
    if (!ulM) { problems.push(rel + '：侧栏没有 <ul>'); continue; }

    // 分区标题的类名：
    //   zone   份量轻，窄屏时跟它的链接排在同一行
    //   mid    「这一层」，窄屏时隐藏（紧跟着的步骤名就是它的标题）
    const stepTitle = isDirPage
      ? '  <div class="grp sub">' + grpM[1] + '</div>\n'          // 本页，不做成链接（不出现指向自己的链接）
      : '  <a class="grp sub" href="index.html">' + grpM[1] + '</a>\n';   // 材料页：标题本身就是回目录的入口

    let out = '\n  <div class="grp zone">往上</div>\n';
    out += '  <a class="up" href="../index.html">← 总目录</a>\n';
    out += '  <div class="grp zone mid">这一层</div>\n';
    out += stepTitle;
    out += '  ' + ulM[0] + '\n';              // 原样搬，补回 <ul> 前那 2 个空格缩进
    out += '  <div class="grp zone">参考</div>\n';
    out += '  <a class="up" href="../index.html#plan">学习计划全文</a>\n';

    const newNav = '<nav class="sidenav">' + out + '</nav>';
    if (nm[0] !== newNav) s = s.replace(nm[0], newNav);
  }

  if (s !== orig) {
    changed++;
    if (CHECK) console.log('  ✗ 待改  ' + rel);
    else { fs.writeFileSync(abs, s); console.log('  ✓ ' + rel); }
  }
}

console.log('\n共 ' + PAGES.length + ' 个页面；' + (CHECK ? '待改 ' : '已改 ') + changed + ' 个（其中 topbar 去链接 ' + topbarOnly + ' 个）');
if (problems.length) { console.log('\n⚠️ 需要人工看：'); problems.forEach(p => console.log('  ' + p)); process.exitCode = 1; }
