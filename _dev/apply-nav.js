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
//     <a class="up" href="../reference/plan.html">学习计划</a>
//     <a class="up" href="../reference/questions.html">题目索引</a>
//   </nav>
//
// 参考段那两条来自 pagekind.js 的 NAV 模型，本脚本不再自己拼字面量：
// 加第三条参考页时只改 pagekind.js 一处，这里和 navcheck 一起跟上。
// （v2 之前它是一条 `../index.html#plan`「学习计划全文」——跳进别人页面的中段，
//  全站唯一一处跨页半截跳转，已随计划独立成页一并去掉。）
//
// 用法：node _dev/apply-nav.js [--check]
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..');
const CHECK = process.argv.includes('--check');
const { kindOf, rootPrefix, hrefFrom, NAV } = require('./pagekind.js');

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

const UP_RE = /<a class="up( cur)?" href="([^"]*)">([\s\S]*?)<\/a>/g;

// 交互层（assets/app.js）和「跳到正文」也属于全站外壳，和顶栏、侧栏一样由本脚本统一注入——
// 68 个页面各写一遍必然会漂，而且改了样式也漏改。
//
// 三处注入点：
//   <head> 里紧跟 <title>      配色引导（必须在样式表之前跑，否则深色用户会闪一下白）
//   <body> 之后第一行          「跳到正文」，键盘用户的第一个落点
//   </body> 之前               app.js 本体（defer，不阻塞解析）
const THEME_BOOT =
  '<script data-shell="theme">/* 配色要在样式表之前定下来，否则深色用户会先看到一闪的白页。' +
  'localStorage 在 file:// 下可能直接抛错，所以整段包在 try 里。*/\n' +
  '(function(){try{var t=localStorage.getItem("aistudy.theme");' +
  'if(t==="dark"||t==="light")document.documentElement.setAttribute("data-theme",t);}catch(e){}})();' +
  '</script>';

// 已有的注入先按特征拆掉，再重新装——这样重复跑结果一致（可重入），
// 以后改 app.js 的路径或参数也不用先手工清一遍。
function stripShell(s) {
  return s
    .replace(/<script data-shell="theme">[\s\S]*?<\/script>\n?/, '')
    .replace(/<a class="skip" href="#main">[^<]*<\/a>\n?/, '')
    .replace(/<script src="[^"]*assets\/app\.js"[^>]*><\/script>\n?/, '')
    .replace(/<main class="wrap" id="main">/, '<main class="wrap">');
}

let changed = 0, topbarOnly = 0, shelled = 0;
const problems = [];

for (const rel of PAGES) {
  const abs = path.join(ROOT, rel);
  const orig = fs.readFileSync(abs, 'utf8');
  let s = stripShell(orig);
  const k = kindOf(rel);

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

  // 参考页（reference/ 下的 plan.html / questions.html）：侧栏**从导航模型生成**，
  // 不从现有 HTML 里解析。
  //
  // 两个理由：
  //   1. 它不是「某个步骤里的一份材料」：没有步骤名、没有材料 <ul>，
  //      解析式那套（.grp.sub 标题 + <ul> + 三条 .up）套不上。
  //   2. 这段必须排在下面 `if (ups.length)` **之前**。那一支在 .up 链接不符预期时
  //      会 continue，而 continue 连第 3 节的外壳注入一起跳过——第二次跑时
  //      参考页的 .up 形状与 材料页 不同，正好会踩中那个逃生口，
  //      于是「重跑一次」就把 app.js 弄丢了。
  //
  // 只有两段，没有「参考」段：这两个参考页本身就是「这一层」，
  // 再在第三段里把同一批链接列一遍，就是同一组链接出现两次，
  // 正是 plan/spec.md 第一节反对的「用途横跳 / 父子平铺」。
  if (k === 'ref') {
    let out = '\n  <div class="grp zone">往上</div>\n';
    out += `  <a class="up" href="${hrefFrom(rel, NAV.root)}">← 总目录</a>\n`;
    out += '  <div class="grp zone mid">这一层</div>\n';
    out += '  <div class="grp sub">参考</div>\n';
    out += '  <ul>\n' + NAV.refs.map(r => {
      // 「你在这儿」判的是**目标页**是不是本页。href 现在是从本页算出来的相对路径
      // （同目录时就是 'questions.html'），拿它直接和 rel 比会永远不等——
      // 比的是 r.href，仓库根起算的路径。
      return `    <li><a class="item${r.href === rel ? ' cur' : ''}" href="${hrefFrom(rel, r.href)}"><span>${r.label}</span></a></li>`;
    }).join('\n') + '\n  </ul>\n';

    const newNav = '<nav class="sidenav">' + out + '</nav>';
    if (nm[0] !== newNav) s = s.replace(nm[0], newNav);
  } else if (ups.length) {
    const upTop  = ups.find(u => u[2] === '../index.html');
    // 哨兵：这段侧栏是不是本脚本生成的形状？判据是**结构**——第一条 .up 是 ← 总目录，
    // 且后面至少还跟着一条（参考页那一段）。**不要拿参考段的 href 去比字面量。**
    //
    // 这里原先是 `upRef = ups.filter(u => u[2].endsWith('#plan') || refHrefs.includes(u[2]))`，
    // 出发点是对的（「改版前的树也要认」），但选错了判据：参考段那两条的 href 正是
    // **本脚本这一轮要改写的东西**，所以只要 NAV.refs 一变（这次是参考页搬进 reference/），
    // 老树上的 href 就既不是 `#plan` 也不是新值，哨兵必然落空——
    // 于是「第一次在新树上跑」= 全站 66 页踩逃生口。而逃生口的 continue 会连第 3 节
    // 的外壳注入一起跳过（页面从此没有 app.js）。判据依赖被改写的量，就是一个自锁。
    // 用结构判据就没有这个问题：无论参考段指向哪里，它都是总目录之后的那两条。
    if (!upTop || ups.length < 2) { problems.push(rel + '：侧栏 .up 链接不符合预期（' + ups.map(u => u[2]).join(',') + '）'); continue; }

    const isDirPage = kindOf(rel) === 'dir';

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
    out += NAV.refs.map(r => `  <a class="up" href="${hrefFrom(rel, r.href)}">${r.label}</a>\n`).join('');

    const newNav = '<nav class="sidenav">' + out + '</nav>';
    if (nm[0] !== newNav) s = s.replace(nm[0], newNav);
  }

  // ---------- 3) 外壳注入：配色引导 / 跳到正文 / 交互层 ----------
  const root = rootPrefix(rel);      // 材料页 '../'，根目录页 './'

  const s1 = s.replace(/(<title>[\s\S]*?<\/title>\n)/, '$1' + THEME_BOOT + '\n');
  if (s1 !== s) { s = s1; shelled++; }

  const s2 = s.replace(/<body>\n/, '<body>\n<a class="skip" href="#main">跳到正文</a>\n');
  if (s2 !== s) s = s2;

  // <main> 必须自带 id：没有 JS 时那个「跳到正文」也得有落点
  const s3 = s.replace(/<main class="wrap">/, '<main class="wrap" id="main">');
  if (s3 !== s) s = s3;

  const s4 = s.replace(/<\/body>/,
    '<script src="' + root + 'assets/app.js" defer data-root="' + root + '"></script>\n</body>');
  if (s4 !== s) s = s4;

  if (s !== orig) {
    changed++;
    if (CHECK) console.log('  ✗ 待改  ' + rel);
    else { fs.writeFileSync(abs, s); console.log('  ✓ ' + rel); }
  }
}

console.log('\n共 ' + PAGES.length + ' 个页面；' + (CHECK ? '待改 ' : '已改 ') + changed + ' 个（其中 topbar 去链接 ' + topbarOnly + ' 个）');
console.log(`外壳注入：配色引导 + 跳到正文 + assets/app.js`);
if (problems.length) { console.log('\n⚠️ 需要人工看：'); problems.forEach(p => console.log('  ' + p)); process.exitCode = 1; }
// 有漂移就退出码 1。**这一条曾经漏着**：其余生成脚本（add-toc / link-questions /
// build-*）都会在 --check 发现漂移时置退出码，只有这里打印「待改 N 个」却照常退 0。
// 于是把六个脚本串成一条 `for g in …; do node _dev/$g.js --check || exit 1; done`
// 的时候，唯一能悄悄漂过去的正是外壳这一环——而且它管的是全站 68 页的导航和 app.js 注入，
// 漂了后果最大。打印了却不算失败，比不打印更坏：它看起来是绿的。
if (CHECK && changed) process.exitCode = 1;
