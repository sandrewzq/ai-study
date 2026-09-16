// 生成站内搜索索引：assets/search-index.js
//
// 起因：66 个页面、242 道题、6000 字的材料，全站没有任何搜索。读者想找「虚拟滚动
// 在哪讲的」，只能记住它在哪个步骤、点进去一页页翻侧栏。
//
// 为什么是 .js 而不是 .json：站点是双击直接打开的（file://），file:// 下
// fetch()/XHR 读本地文件会被浏览器拦掉（跨源），而 <script src> 不受影响。
// 所以索引必须是一个「加载即赋值」的 .js，由 app.js 在第一次搜索时才按需加载。
//
// 索引里放什么：页面标题、顶栏位置、导语、**各章节的标题 + 开头一段正文**、覆盖题号。
//
// 为什么要带正文摘录：只索引标题的话，读者记得住的概念八成搜不到——试过
// 「虚拟滚动」，它只出现在正文里，标题和章节名都没有，结果一条都搜不出来。
// 摘录控制在每节 100 字符：够把这一节在讲什么说清楚，又不至于让索引膨胀到正文的量级
// （全量正文 ~33 万字符、上兆的 UTF-8，为一个本地站点不值得）。
//
// 用法：node _dev/build-search.js [--check]
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..');
const CHECK = process.argv.includes('--check');
const OUT = path.join(ROOT, 'assets/search-index.js');
const SKIP_DIR = new Set(['.git', '_dev', 'notes', 'plan', 'node_modules']);

const text = h => h.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
const EXCERPT = 100;

// 每一节的开头一段正文。节与节之间靠 <h2 id=...> 切；样式表和脚本不算正文。
function sections(s) {
  const clean = s.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '');
  const marks = [...clean.matchAll(/<h2 id="([^"]+)"[^>]*>([\s\S]*?)<\/h2>/g)];
  return marks.map((m, i) => {
    const body = clean.slice(m.index + m[0].length, i + 1 < marks.length ? marks[i + 1].index : clean.length);
    // 折叠成一行再截断，否则摘录里全是换行和缩进
    const t = text(body);
    return [m[1], text(m[2]), t.length > EXCERPT ? t.slice(0, EXCERPT) + '…' : t];
  }).filter(x => x[1] || x[2]);
}

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

const entries = [];
for (const rel of PAGES) {
  const s = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  const url = rel.split(path.sep).join('/');

  const h1 = s.match(/<h1[^>]*>([\s\S]*?)<\/h1>/);
  const crumb = s.match(/<span class="crumb">([\s\S]*?)<\/span>/);
  const lead = s.match(/<p class="lead">([\s\S]*?)<\/p>/);
  // 题号：材料页的 .qbadges。注意 .q 这个类在目录页的卡片里装的是「H 域 18 题」
  // 这类域徽章，不是题号，所以按题号形状过滤，别把「18」这种数字灌进搜索词。
  const QID = /^[A-Za-z]+-\d+$/;
  const q = [...new Set([...s.matchAll(/<span class="q">([^<]+)<\/span>/g)]
    .map(m => m[1].trim()).filter(x => QID.test(x)))];
  // 章节：[锚点, 标题, 摘录]
  const h = sections(s);

  const e = { u: url, t: h1 ? text(h1[1]) : url };
  if (crumb) e.c = text(crumb[1]);
  if (lead) e.l = text(lead[1]).slice(0, 140);
  if (q.length) e.q = q;
  if (h.length) e.h = h;
  entries.push(e);
}

const ESC = s => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/<\//g, '<\\/');
const line = e => {
  const parts = [`u:"${ESC(e.u)}"`, `t:"${ESC(e.t)}"`];
  if (e.c) parts.push(`c:"${ESC(e.c)}"`);
  if (e.l) parts.push(`l:"${ESC(e.l)}"`);
  if (e.q) parts.push(`q:[${e.q.map(x => `"${ESC(x)}"`).join(',')}]`);
  if (e.h) parts.push(`h:[${e.h.map(x => `["${ESC(x[0])}","${ESC(x[1])}","${ESC(x[2])}"]`).join(',')}]`);
  return '  {' + parts.join(',') + '},';
};

const out = `// 由 node _dev/build-search.js 生成，不要手改。
// 搜索时由 assets/app.js 按需加载（file:// 下 fetch 不可用，所以走 <script src>）。
// 字段：u=路径 t=标题 c=顶栏位置 l=导语 q=覆盖题号 h=[章节锚点, 章节标题]
window.SITE_INDEX = [
${entries.map(line).join('\n')}
];
`;

let changed = false;
try { changed = fs.readFileSync(OUT, 'utf8') !== out; } catch { changed = true; }

if (CHECK) {
  console.log(changed ? `  ✗ 待改  assets/search-index.js` : '✓ 搜索索引已是最新');
} else if (changed) {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, out);
  console.log('  ✓ assets/search-index.js');
}

const kb = (Buffer.byteLength(out) / 1024).toFixed(1);
const secs = entries.reduce((a, e) => a + (e.h ? e.h.length : 0), 0);
console.log(`\n收录 ${entries.length} 页 / ${secs} 个章节 / ${kb} KB`);
if (CHECK && changed) process.exitCode = 1;
