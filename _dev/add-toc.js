// 给材料页补上「本页目录」。
//
// 起因：材料页的 h2 全都带 id（s0、s1……），但全站没有任何链接指向它们——
// 51 个页面白挂了一套锚点，读者在 4000~6000 字的正文里只能线性往下滚。
//
// 为什么放正文而不是侧栏：plan/spec.md 第一节有成文的教训——侧栏只装站点级导航，
// 本页锚点混进去会造成「用途横跳 / 父子平铺 / 篇幅失衡」。计划全文的目录
// 本来就是正文开头的 .toc 块，材料页照同一个形态来。
//
// 插入位置：第一个 <h2> 之前（也就是「三层阅读法」之后、正文开头）。
// 主图 .hero 位于第一节内部，所以不会被切开。
//
// 用法：node _dev/add-toc.js [--check]
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..');
const CHECK = process.argv.includes('--check');
const SKIP_DIR = new Set(['.git', '_dev', 'notes', 'plan', 'node_modules']);
const { kindOf } = require('./pagekind.js');

// 少于 3 个带 id 的 h2 就不值得做目录（00-key-terms 只有 1 个，自动跳过）
const MIN_SECTIONS = 3;
const MARK_A = '<!-- toc:auto -->';
const MARK_B = '<!-- /toc:auto -->';

const PAGES = [];
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    if (e.name.startsWith('.') || e.name.startsWith('__')) continue;
    const p = path.join(d, e.name);
    if (e.isDirectory()) { if (!SKIP_DIR.has(e.name)) walk(p); }
    else if (e.name.endsWith('.html')) PAGES.push(path.relative(ROOT, p));
  }
})(ROOT);
PAGES.sort();

// h2 正文里可能嵌 <strong> 之类，目录里只要纯文本
const stripTags = s => s.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

let written = 0, stale = 0, skipped = 0;
const problems = [];

for (const rel of PAGES) {
  // 目录页 / 入口页 / 参考页都不套材料骨架，本页目录也就不该有——
  // 判据走 pagekind.js。入口页的计划目录由 build-plan.js 自己生成，
  // 这里只认 <!-- toc:auto --> 标记、不认手写的 <nav class="toc">，
  // 放行的话会在第一个 <h2> 前再插一个，两个目录打乒乓。
  if (kindOf(rel) !== 'material') { skipped++; continue; }
  const abs = path.join(ROOT, rel);
  const s = fs.readFileSync(abs, 'utf8');

  const heads = [...s.matchAll(/<h2 id="([^"]+)"[^>]*>([\s\S]*?)<\/h2>/g)]
    .map(m => ({ id: m[1], text: stripTags(m[2]) }))
    .filter(h => h.text);
  if (heads.length < MIN_SECTIONS) { skipped++; continue; }

  const toc = MARK_A + '\n<nav class="toc">\n  <div class="toc-title">本页目录</div>\n  <ol>\n'
    + heads.map(h => `    <li><a href="#${h.id}">${h.text}</a></li>`).join('\n')
    + '\n  </ol>\n</nav>\n' + MARK_B;

  // 已经生成过：原地替换；否则插到第一个 h2 之前
  const have = new RegExp(MARK_A.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[\\s\\S]*?' + MARK_B.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  let out;
  if (have.test(s)) {
    out = s.replace(have, toc);
  } else {
    const at = s.search(/<h2[ >]/);
    if (at < 0) { problems.push(rel + '：找不到 <h2>，无法定位插入点'); continue; }
    // 插在 h2 所在行的行首，保住原有的缩进和空行
    const lineStart = s.lastIndexOf('\n', at) + 1;
    out = s.slice(0, lineStart) + toc + '\n\n' + s.slice(lineStart);
  }

  if (out !== s) {
    stale++;
    if (CHECK) console.log('  ✗ 待改  ' + rel);
    else { fs.writeFileSync(abs, out); written++; console.log('  ✓ ' + rel + `  (${heads.length} 节)`); }
  }
}

console.log('\n扫描 ' + PAGES.length + ' 页：'
  + (CHECK ? '待改 ' + stale : '已写 ' + written)
  + ' 页；豁免 ' + skipped + ' 页（目录页 / 入口页 / 章节不足 ' + MIN_SECTIONS + ' 个）');
if (problems.length) { console.log('\n⚠️ 需要人工看：'); problems.forEach(p => console.log('  ' + p)); process.exitCode = 1; }
if (CHECK && stale) process.exitCode = 1;
