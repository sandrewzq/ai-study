// 规范校验：图例、图说、ASCII 图、目录页对照表、材料页 11 项骨架
// 规范见 plan/spec.md 第一节「导航约定」与第四节「图示规范」
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..');
const SKIP = new Set(['.git', '_dev', 'notes', 'plan', 'node_modules']);

const files = [];
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    if (e.name.startsWith('.')) continue;
    const p = path.join(d, e.name);
    if (e.isDirectory()) { if (!SKIP.has(e.name)) walk(p); }
    else if (e.name.endsWith('.html')) files.push(p);
  }
})(ROOT);
files.sort();

// 制表符：画框线用的字符
const ART = /[─│┌┐└┘├┤┬┴┼]/;
// 流程箭头：表示"从这到那"的方向符。
// 不含 ← 和 ⇒ —— 它们更多用作注释/推导（"← 这一项是瓶颈"、"⇒ 所以是 6~8 GB"），不是流程。
const FLOW = /[→↓↑↘↙]/;

let badLegend = [], badCap = [], asciiArt = [], badCrosswalk = [], badSkeleton = [];
let figTotal = 0;

// 材料页的 11 项骨架（plan/spec.md 第二节）
const SKELETON = [
  ['标题', /<h1>/],
  ['导语 .lead', /class="lead"/],
  ['覆盖题号 .qbadges', /class="qbadges"/],
  ['读之前 .warn', /class="warn"/],
  ['三层阅读法 .howto', /class="howto"/],
  ['主图 .hero', /class="hero"/],
  ['正文 h2', /<h2/],
  ['讲解骨架 .skeleton', /class="skeleton"/],
  ['追问预警 details.ask', /class="ask"/],
  ['回忆卡 .recall', /class="recall"/],
  ['翻页 .pager', /class="pager"/],
];
// 查阅型页面不套材料骨架：00 导读页 / 00 前置页 / 自查页 / 目录页
// 与 density.js 的豁免口径保持一致
const SURVEY = /(^|\/)(index|00-[^/]*|review-and-answers)\.html$/;

for (const f of files) {
  const rel = path.relative(ROOT, f).split(path.sep).join('/');
  const s = fs.readFileSync(f, 'utf8');

  // ① 图例：用了 SVG 图就必须有 .legend
  const svgN = (s.match(/<svg[^>]*class="[^"]*svgfig/g) || []).length;
  figTotal += svgN;
  const legendN = (s.match(/class="legend"/g) || []).length;
  if (svgN > 0 && legendN === 0) badLegend.push(rel);

  // ② 图说：每张图后面要有一句话说明
  //    统一措辞为「这张图在说什么」——全站其余 45 张图都是这个写法，保持一致性
  if (svgN > 0 && !/这张图在说什么/.test(s)) badCap.push(rel);

  // ③ ASCII 图：代码块里画图。
  //    判据：≥2 行，且含制表符、或多行里出现箭头。
  //    单行箭头（如「① → ② → ③」）和纯公式不算——它们不是图。
  const lines = s.split('\n');
  for (const m of s.matchAll(/<pre><code>([\s\S]*?)<\/code><\/pre>/g)) {
    const body = m[1];
    const ln = body.split('\n');
    const lineNo = s.slice(0, m.index).split('\n').length;
    // 判据：≥2 行，且【含框线字符】或【多行里出现流程箭头】
    // 单行箭头（① → ② → ③）和纯公式/推导不算——它们不是图
    const looksLikeArt =
      (ln.length >= 2 && ART.test(body)) ||
      (ln.length >= 2 && (body.match(new RegExp(FLOW.source, 'g')) || []).length >= 1);
    if (looksLikeArt) {
      asciiArt.push(`${rel}:${lineNo}  ${ln.length} 行  「${ln[0].slice(0, 40)}」`);
    }
  }

  // ④ 目录页（非根目录的 index.html）必须有且只有一张「与学习计划的对照」表，
  //    且表里的材料行数 = 卡片数 + 00 导读行（有就 1 行，没有就 0 行）。
  //    这一条是为了防止「步骤 1 有对照表、其余 6 页没有」这种不一致再出现。
  const isDirPage = path.basename(f) === 'index.html' && rel !== 'index.html';
  const cardN = (s.match(/<a class="card" href=/g) || []).length;
  if (isDirPage) {
    const secN = (s.match(/<h2>与学习计划的对照<\/h2>/g) || []).length;
    if (secN !== 1) {
      badCrosswalk.push(`${rel}  对照表 ${secN} 个（应为 1 个）`);
    } else if (cardN) {
      const sec = s.slice(s.indexOf('<h2>与学习计划的对照</h2>'));
      const table = sec.slice(0, sec.indexOf('</table>'));
      const rows = (table.match(/<tr>/g) || []).length - 1;          // 减去表头
      // 00 导读：步骤 1 那页做成了卡片，其余页做成顶部提示条。
      // 做成提示条时，对照表要额外给它一行。
      const zeroRow = /<td>00<\/td>/.test(table) ? 1 : 0;
      const zeroCard = /<a class="card" href="00-/.test(s) ? 1 : 0;
      const expected = cardN + zeroRow - zeroCard;
      if (rows !== expected)
        badCrosswalk.push(`${rel}  对照表 ${rows} 行材料，按「卡片 ${cardN} 张 + 00 行 ${zeroRow} - 00 卡片 ${zeroCard}」应为 ${expected} 行`);
    }
  }

  // ⑤ 材料页 11 项骨架：缺一项就不算完成（查阅型页面豁免）
  if (!SURVEY.test(rel)) {
    const miss = SKELETON.filter(([, re]) => !re.test(s)).map(([name]) => name);
    if (miss.length) badSkeleton.push(`${rel}  缺：${miss.join(' / ')}`);
  }
}

console.log(`扫描 ${files.length} 个页面，其中 ${figTotal} 张 SVG 图\n`);
console.log(`图例：${badLegend.length ? '✗ ' + badLegend.length + ' 个页面有图但没图例' : '✓ 全部齐备'}`);
badLegend.forEach(x => console.log('  ' + x));
console.log(`\n图说：${badCap.length ? '✗ ' + badCap.length + ' 个页面缺「这张图在说什么」' : '✓ 全部齐备'}`);
badCap.forEach(x => console.log('  ' + x));
console.log(`\nASCII 图：${asciiArt.length ? '✗ ' + asciiArt.length + ' 处（规范禁止）' : '✓ 已清零'}`);
asciiArt.forEach(x => console.log('  ' + x));
console.log(`\n目录页对照表：${badCrosswalk.length ? '✗ ' + badCrosswalk.length + ' 个目录页不合规' : '✓ 7 个目录页齐备且与卡片一一对应'}`);
badCrosswalk.forEach(x => console.log('  ' + x));
console.log(`\n材料页 11 项骨架：${badSkeleton.length ? '✗ ' + badSkeleton.length + ' 页缺项' : '✓ 全部齐备（查阅型页面已豁免）'}`);
badSkeleton.forEach(x => console.log('  ' + x));

process.exit(badLegend.length || badCap.length || asciiArt.length || badCrosswalk.length || badSkeleton.length ? 1 : 0);
