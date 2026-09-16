// 用 plan/roadmap.md 重建 reference/plan.html 的学习计划正文
// 改计划只改 md，然后跑这个脚本。
//
// 和它的前身 build-entry.js 有两点不同：
//
//   1. 整份计划是**一个独立页面**了，不再嵌在入口页里。所以这里产出 reference/plan.html，
//      入口页只留「从哪开始 + 完整目录」。
//   2. 正文区间用 `<!-- plan:auto -->` 标记界定，不再靠
//      `indexOf('<h1 id="plan-sec-1">')` … `lastIndexOf('</main>')` 这套字面量切片。
//      那套写法靠两个巧合成立：h1 的锚点永远是 seq=1（md.js 的 seq 是跨层级全局计数器，
//      谁在它前面加一个小节都会把它顶掉），以及「计划正文是 main 里最后一块」。
//      标记写法两个都不依赖（add-toc.js 早就用的这个模式）。
const fs = require('fs'), path = require('path');
const { convert, relink } = require('./md');

const ROOT = path.resolve(__dirname, '..');
const REL = 'reference/plan.html';                 // 仓库根起算，linkify 和链接换算都用它
const PAGE = path.join(ROOT, REL);
const CHECK_ONLY = process.argv.includes('--check');
// 两个区。之所以把 h1 单独一个区：页面第一屏的顺序要是
// 「标题 → 导语 → 提示 → 正文」，而 md 的 h1 后面紧跟的是正文。
// 原先只有正文一个区时，plan.html 只能把导语和提示排在 h1 **前面**，
// 于是整页最大的那个标题落在第一屏四分之一处——那是「计划嵌在入口页中段」
// 时代的残留（当时它确实是中段的一个分区标题）。独立成页之后它就该在最上面。
const MARK_T_A = '<!-- plan:title -->';
const MARK_T_B = '<!-- /plan:title -->';
const MARK_A = '<!-- plan:auto -->';
const MARK_B = '<!-- /plan:auto -->';

const raw = fs.readFileSync(path.join(ROOT, 'plan/roadmap.md'), 'utf8');
// 编号从 plan-sec-1 开始，与既有锚点一致
const { body: rawBody, anchors } = convert(raw, 'plan-sec-');
// md 里的链接是相对 plan/ 写的，渲染到 reference/ 之后按输出页重算一遍
let body = relink(rawBody, 'plan', REL);

// 在这份文档的 h1 之后插入它自己的目录
const chapters = anchors.filter(a => a.lv === 2);
const tocBlock = `
<nav class="toc">
  <div class="toc-title">这份计划的目录</div>
  <ol>
${chapters.map(a => `    <li><a href="#${a.id}">${a.text}</a></li>`).join('\n')}
  </ol>
</nav>`;
body = body.replace(/(<h1[^>]*>[\s\S]*?<\/h1>)/, '$1\n' + tocBlock);

// 题号反查：把正文里每个题号接上「讲这道题的那份材料」。
// 必须在这一步做——这段正文是整段重建的，漏了这步，重建一次链接就全没了。
// 第三个参数是这段 html 要落到的那一页：题号链接要按它换算相对路径。
const { linkify } = require('./link-questions');
body = linkify(body, undefined, REL);

const cut = body.indexOf('</h1>');
if (cut === -1) throw new Error('plan/roadmap.md 里没有 h1，无法拆出页面标题');
const title = body.slice(0, cut + '</h1>'.length);
const rest = body.slice(cut + '</h1>'.length).replace(/^\n+/, '');

const html = fs.readFileSync(PAGE, 'utf8');
const splice = (src, a, b, content) => {
  const x = src.indexOf(a), y = src.indexOf(b);
  if (x === -1 || y === -1 || y < x)
    throw new Error(`plan.html 里找不到 ${a} … ${b} 标记，无法定位区间`);
  return src.slice(0, x + a.length) + '\n' + content + '\n' + src.slice(y);
};
const next = splice(splice(html, MARK_T_A, MARK_T_B, title), MARK_A, MARK_B, rest);

if (next === html) {
  console.log('✓ plan.html 已是最新（与 plan/roadmap.md 一致）');
  process.exit(0);
}
if (CHECK_ONLY) {
  const x = html.split('\n'), y = next.split('\n');
  console.log('✗ plan.html 与 plan/roadmap.md 不一致');
  let shown = 0;
  for (let i = 0; i < Math.max(x.length, y.length) && shown < 12; i++) {
    if (x[i] !== y[i]) {
      console.log(`  第 ${i + 1} 行`);
      console.log(`    现在: ${(x[i] || '').slice(0, 110)}`);
      console.log(`    应为: ${(y[i] || '').slice(0, 110)}`);
      shown++;
    }
  }
  process.exit(1);
}
fs.writeFileSync(PAGE, next, 'utf8');
console.log(`✓ 已重建 plan.html 的学习计划正文（${anchors.length} 个章节锚点）`);
