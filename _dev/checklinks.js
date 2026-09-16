// 静态链接校验：检查所有 html/md 的相对链接是否指向存在的文件与锚点
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const SKIP = ['.git', '.backup', '_dev', 'node_modules'];

const files = [];
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    if (e.name.startsWith('.') || e.name.startsWith('__')) continue;
    const p = path.join(d, e.name);
    if (e.isDirectory()) { if (!SKIP.includes(e.name)) walk(p); }
    else if (/\.(html|md)$/.test(e.name)) files.push(p);
  }
})(ROOT);

// 预扫每个 html 的锚点 id
const anchorCache = new Map();
function anchors(abs) {
  if (!anchorCache.has(abs)) {
    const c = fs.readFileSync(abs, 'utf8');
    anchorCache.set(abs, new Set([...c.matchAll(/\bid\s*=\s*"([^"]+)"/g)].map(m => m[1])));
  }
  return anchorCache.get(abs);
}

const re = /(?:\b(?:href|src)\s*=\s*"([^"]*)")|(?:\]\(([^)\s]+)\))/g;

// .md 里的行内代码和围栏代码是**举例**，不是本文件的链接。
// 比如 plan/spec.md 用 `href="index.html"` 演示材料页侧栏长什么样——那个相对路径
// 是相对材料页所在目录（step-N-xxx/）写的，拿本文档所在目录去解析必然落空。
// 把代码段按等长空格遮蔽后再扫，偏移量不变。
function maskSpans(s, pattern) {
  const c = [...s];
  for (const m of s.matchAll(pattern)) {
    for (let i = m.index; i < m.index + m[0].length; i++) if (c[i] !== '\n') c[i] = ' ';
    }
  return c.join('');
}
const mdScannable = c => maskSpans(maskSpans(c, /```[\s\S]*?```/g), /`[^`\n]*`/g);

// .html 里的 <code>/<pre> 同理，而且是**同一个例子**：spec.md 里 `href="index.html"`
// 渲染成 spec.html 之后就是 <code>…href="index.html"…</code>，`.md` 那一趟被遮蔽掉了、
// 这一趟没有，于是同一处示例在源文件里合格、在渲染件里报「文件不存在」。
// 两边口径必须一样，否则「改 md 不报错、重新生成渲染件就报错」这种怪事会一直有。
const htmlScannable = c => maskSpans(maskSpans(c, /<pre[\s\S]*?<\/pre>/g), /<code>[\s\S]*?<\/code>/g);

let total = 0, ok = 0;
const bad = [];

for (const f of files) {
  const isMd = f.endsWith('.md');
  const content = fs.readFileSync(f, 'utf8');
  const scannable = isMd ? mdScannable(content) : htmlScannable(content);
  const rel = path.relative(ROOT, f);
  for (const m of scannable.matchAll(re)) {
    const t = m[1] ?? m[2];
    if (/^(https?:|mailto:|data:|javascript:|tel:)/i.test(t) || t.startsWith('#')) continue;
    total++;
    const hash = t.indexOf('#');
    const pure = decodeURIComponent(hash === -1 ? t : t.slice(0, hash));
    const frag = hash === -1 ? '' : t.slice(hash + 1);
    const target = path.resolve(path.dirname(f), pure || path.basename(f));
    if (!fs.existsSync(target)) { bad.push(`${rel}  →  ${t}   [文件不存在]`); continue; }
    if (frag && target.endsWith('.html') && !anchors(target).has(frag)) {
      bad.push(`${rel}  →  ${t}   [锚点 #${frag} 不存在]`); continue;
    }
    ok++;
  }
}

console.log(`扫描 ${files.length} 个文件，共 ${total} 个相对链接`);
console.log(`  ✓ 有效: ${ok}`);
console.log(`  ✗ 失效: ${bad.length}`);
if (bad.length) { console.log('\n失效明细:'); bad.forEach(b => console.log('  ' + b)); }

// ---- 标签配对检查 ----
const PAIRS = [
  ['<div', '</div>'], ['<details', '</details>'], ['<table', '</table>'],
  ['<svg', '</svg>'], ['<dl', '</dl>'], ['<ul', '</ul>'], ['<nav', '</nav>'],
  // SVG 里手写容易写错闭合标签，一并查
  ['<rect', '</rect>'], ['<text', '</text>'], ['<details', '</details>'], ['<p', '</p>'],
];
const tagBad = [];
for (const f of files) {
  if (!f.endsWith('.html')) continue;
  const c = fs.readFileSync(f, 'utf8');
  const n = re => (c.match(re) || []).length;
  const off = PAIRS.filter(([o, x]) => n(new RegExp(o + '[\\s>]', 'g')) !== n(new RegExp(x, 'g')))
                   .map(([o, x]) => `${o} ${n(new RegExp(o + '[\\s>]', 'g'))}/${n(new RegExp(x, 'g'))}`);
  if (off.length) tagBad.push(path.relative(ROOT, f) + '  [' + off.join(', ') + ']');
}
console.log(`\n标签配对：${tagBad.length ? '✗ ' + tagBad.length + ' 个文件异常' : '✓ 全部配对'}`);
tagBad.forEach(b => console.log('  ' + b));

// ---- 正文里以纯文本出现的文件名是否真实存在 ----
// 改名时 href/src 会被改写，但 <code>01-RAG是什么.html</code> 这种正文文本不会，
// 于是页面会显示一个根本不存在的文件名，链接检查抓不到。这里单独兜住。
const allNames = new Set();
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    if (e.name.startsWith('.') || e.name.startsWith('__')) continue;
    if (e.isDirectory()) { if (!SKIP.includes(e.name)) walk(path.join(d, e.name)); }
    else allNames.add(e.name);
  }
})(ROOT);
const stale = [];
let refChecked = 0;
for (const f of files) {
  if (!f.endsWith('.html')) continue;
  const rel = path.relative(ROOT, f);
  // plan/ 是本地文档，里面大量出现 NN-topic.html 这类占位符，不参与检查
  if (/^(plan|notes)\//.test(rel.split(path.sep).join('/'))) continue;
  const c = fs.readFileSync(f, 'utf8');
  for (const m of c.matchAll(/<code>([^<>]*\.(?:html|css|js|md))<\/code>/g)) {
    const t = m[1];
    if (t.includes('/')) continue;                      // 路径写法交给上面的 href 检查
    if (/^(NN|N-)|[*]|^\.[a-z]+$/i.test(t)) continue;   // 模板占位符 / 纯扩展名
    refChecked++;
    if (!allNames.has(t)) stale.push(rel + '  正文提到  ' + t);
  }
}
// 这一项必须报**扫了多少**：它的校验点几乎全部来自学习计划 §9「配套学习资料」，
// 那一节搬走之后计数会掉到接近 0，而输出只报「✗ N 处」或「✓ 全部有效」——
// 不打印计数的话，检查范围缩到零和真的零问题长得一模一样。
console.log(`\n正文文件名引用：${stale.length
  ? '✗ ' + stale.length + ' 处指向不存在的文件（扫描 ' + refChecked + ' 处）'
  : '✓ 全部有效（扫描 ' + refChecked + ' 处）'}`);
stale.forEach(s => console.log('  ' + s));

// ---- 措辞检查 ----
// 词表不写在这里，放在 _dev/local-words.txt（不进仓库——它列的就是不该公开的字眼）。
// 没有那个文件时跳过这一项，其余四项照常。
const WORDLIST = path.join(__dirname, 'local-words.txt');
const BANNED = fs.existsSync(WORDLIST)
  ? fs.readFileSync(WORDLIST, 'utf8').split('\n')
      .map(l => l.trim()).filter(l => l && !l.startsWith('#'))
  : [];
const LITERAL = BANNED.filter(w => !/^[A-Za-z][A-Za-z0-9_.]*$/.test(w));   // 中文词按字面匹配
const WORDY   = BANNED.filter(w => /^[A-Za-z][A-Za-z0-9_.]*$/.test(w));    // 英文词按词边界匹配
const hits = [];
if (BANNED.length) {
  for (const f of files) {
    const rel = path.relative(ROOT, f).split(path.sep).join('/');
    if (/^notes\//.test(rel)) continue;                 // 第三方转载，不改写原文
    const lines = fs.readFileSync(f, 'utf8').split('\n');
    lines.forEach((ln, i) => {
      for (const w of LITERAL) if (ln.includes(w)) hits.push(`${rel}:${i + 1}  「${w}」`);
      for (const w of WORDY) {
        if (new RegExp(`\\b${w}\\b`).test(ln)) hits.push(`${rel}:${i + 1}  「${w}」`);
      }
    });
  }
}
const wordMsg = BANNED.length
  ? (hits.length ? `✗ ${hits.length} 处命中` : '✓ 零命中')
  : '· 跳过（没有 _dev/local-words.txt）';
console.log(`\n措辞检查：${wordMsg}`);
hits.slice(0, 20).forEach(h => console.log('  ' + h));
if (hits.length > 20) console.log(`  … 另有 ${hits.length - 20} 处`);

if (bad.length || tagBad.length || stale.length || hits.length) process.exit(1);
process.exit(0);
