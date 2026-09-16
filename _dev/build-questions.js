// 用 plan/questions.md 重建 reference/questions.html 的题库正文
// 改题库只改 md，然后跑这个脚本。
//
// 这一页和 reference/plan.html 是同一个模式（标记界定正文 + 目录自建 + linkify 接题号），
// 差别只在内容来源。
//
// 一条硬约束：**这一页绝不能出现 `class="qbadges"`。**
// link-questions.js 的 buildOwners() 是拿各页 .qbadges 反推「谁讲哪道题」的。
// 从 v3 起它走 pagekind.kindOf，参考页已被正确跳过（不再是靠「在不在根目录」侥幸挡住），
// 所以带上 qbadges 不会再把 242 个题号变成「被两个页面认领」。
// 规则照旧，理由换了：这一页**就是**那份题号清单本身，再声明一遍「我覆盖这些题号」
// 是自指的空话；而且读者读源码时会以为它是可认领的材料页，把它排除在外的判据却写在别处。
// 一句话：**声明覆盖的只有材料页，参考页只被引用。**
//
// 导语和「这一页怎么用」写在 reference/questions.html 的**壳**里（.lead + .warn），
// 不在这份 md 里。原先两边各有一份，同一件事说了两遍；md 这边现在只剩数据：
// h1 + 十个域 + 打勾条目。改导语改壳，别改 md。
// （shell 是手写的，build-questions 只重写 <!-- questions:auto --> 之间那一段。）
const fs = require('fs'), path = require('path');
const { convert, relink } = require('./md');

const ROOT = path.resolve(__dirname, '..');
const REL = 'reference/questions.html';            // 仓库根起算，linkify 和链接换算都用它
const PAGE = path.join(ROOT, REL);
const CHECK_ONLY = process.argv.includes('--check');
const MARK_A = '<!-- questions:auto -->';
const MARK_B = '<!-- /questions:auto -->';

const raw = fs.readFileSync(path.join(ROOT, 'plan/questions.md'), 'utf8');
const { body: rawBody, anchors } = convert(raw, 'q-sec-');
// md 里的链接是相对 plan/ 写的，渲染到 reference/ 之后按输出页重算一遍
let body = relink(rawBody, 'plan', REL);

// 目录：10 个域各一条，方便在两百多题里跳。
// 认 h3 而不是 h2——这一页只有「一、二、三」两层，域标题就是 h3。
// add-toc.js 不会来插手（它只认材料页，且只认 h2 的 <!-- toc:auto --> 标记）。
const domains = anchors.filter(a => a.lv === 3);
const tocBlock = `
<nav class="toc">
  <div class="toc-title">十个知识域</div>
  <ol>
${domains.map(a => `    <li><a href="#${a.id}">${a.text}</a></li>`).join('\n')}
  </ol>
</nav>`;
body = body.replace(/(<h1[^>]*>[\s\S]*?<\/h1>)/, '$1\n' + tocBlock);

// 题号反查：每个题号接上「讲这道题的那份材料」。这一页 242 个题号全接。
// 第三个参数是这段 html 要落到的那一页：题号链接要按它换算相对路径。
const { linkify } = require('./link-questions');
body = linkify(body, undefined, REL);

const html = fs.readFileSync(PAGE, 'utf8');
const a = html.indexOf(MARK_A), b = html.indexOf(MARK_B);
if (a === -1 || b === -1 || b < a)
  throw new Error(`questions.html 里找不到 ${MARK_A} … ${MARK_B} 标记，无法定位正文区间`);
const next = html.slice(0, a + MARK_A.length) + '\n' + body + '\n' + html.slice(b);

if (next === html) {
  console.log('✓ questions.html 已是最新（与 plan/questions.md 一致）');
  process.exit(0);
}
if (CHECK_ONLY) {
  const x = html.split('\n'), y = next.split('\n');
  console.log('✗ questions.html 与 plan/questions.md 不一致');
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
console.log(`✓ 已重建 questions.html 的题库正文（${anchors.length} 个章节锚点）`);
