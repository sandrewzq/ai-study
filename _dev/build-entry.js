// 用 plan/roadmap.md 重建 index.html 里的「学习计划全文」
// 改计划只改 md，然后跑这个脚本。
//
// 计划这一部分在入口页里相当于一份独立文档（有自己的 h1、自己的章节编号），
// 所以它的目录放在正文里（.toc 块），而不是塞进侧栏——
// 侧栏只留站点级导航（本页 / 学习步骤 / 不占步骤的专题）。
const fs = require('fs'), path = require('path');
const { convert } = require('./md');

const ROOT = path.resolve(__dirname, '..');
const ENTRY = path.join(ROOT, 'index.html');
const CHECK_ONLY = process.argv.includes('--check');

const raw = fs.readFileSync(path.join(ROOT, 'plan/roadmap.md'), 'utf8');
// 入口页连 md 的 h1 一起收进来，编号从 plan-sec-1 开始，与既有锚点保持一致
const { body: rawBody, anchors } = convert(raw, 'plan-sec-');
// md 里的相对链接是相对 plan/ 的，嵌进入口页（根目录）要去掉一层 ./
let body = rawBody.replace(/(href=")\.\.\//g, '$1');

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

const html = fs.readFileSync(ENTRY, 'utf8');
const next = (() => {
  let s = html;

  // 正文计划主体（从第一个计划章节标题到 </main> 之前）
  const bStart = s.indexOf('<h1 id="plan-sec-1">');
  const bEnd = s.lastIndexOf('</main>');
  if (bStart === -1 || bEnd === -1 || bEnd < bStart) throw new Error('找不到正文计划区块');
  s = s.slice(0, bStart) + body + '\n\n' + s.slice(bEnd);

  return s;
})();

if (next === html) {
  console.log('✓ index.html 已是最新（与 plan/roadmap.md 一致）');
  process.exit(0);
}
if (CHECK_ONLY) {
  const a = html.split('\n'), b = next.split('\n');
  console.log('✗ index.html 与 plan/roadmap.md 不一致');
  let shown = 0;
  for (let i = 0; i < Math.max(a.length, b.length) && shown < 12; i++) {
    if (a[i] !== b[i]) {
      console.log(`  第 ${i + 1} 行`);
      console.log(`    现在: ${(a[i] || '').slice(0, 110)}`);
      console.log(`    应为: ${(b[i] || '').slice(0, 110)}`);
      shown++;
    }
  }
  process.exit(1);
}
fs.writeFileSync(ENTRY, next, 'utf8');
console.log(`✓ 已重建 index.html 的计划全文（${anchors.length} 个章节锚点）`);
