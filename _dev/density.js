// 正文密度检查：去掉标签、SVG、折叠区后统计可见字符数
// 规范要求材料页 4000~6000 字符（±10%），查阅型页面（00 前置页 / 自测页）不受限
//
// 豁免判据走 pagekind.js，**不要在这里写正则**。
// 这里原先写的是 /(index|00-key-terms|review-and-answers|00-how-to-study)\.html$/，
// 没有前缀锚定，于是 `step-1-foundation/03-vector-store-and-index.html` 的
// `-index.html` 尾巴命中了 `index\.html$`——那一页被静默豁免至今（实测 3826 字，
// 其实一直在区间内，所以没人发现）。凡是在这里手写正则，就是把同一个坑再挖一遍。
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..');
const SKIP = new Set(['.git', '_dev', 'notes', 'plan', 'node_modules']);
const { isSurvey } = require('./pagekind.js');

const files = [];
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    if (e.name.startsWith('.') || e.name.startsWith('__')) continue;
    const p = path.join(d, e.name);
    if (e.isDirectory()) { if (!SKIP.has(e.name)) walk(p); }
    else if (e.name.endsWith('.html')) files.push(p);
  }
})(ROOT);
files.sort();

let over = 0;
for (const f of files) {
  const rel = path.relative(ROOT, f);
  let s = fs.readFileSync(f, 'utf8');
  s = s.replace(/<svg[\s\S]*?<\/svg>/g, ' ');          // 图不算正文
  s = s.replace(/<style[\s\S]*?<\/style>/g, ' ');
  s = s.replace(/<script[\s\S]*?<\/script>/g, ' ');
  s = s.replace(/<head[\s\S]*?<\/head>/g, ' ');
  s = s.replace(/<[^>]+>/g, ' ');                        // 去标签
  s = s.replace(/&[a-z]+;/gi, ' ');
  s = s.replace(/\s+/g, '');
  const n = s.length;
  const exempt = isSurvey(path.relative(ROOT, f));
  const bad = !exempt && (n < 3600 || n > 6600);
  if (bad) over++;
  const mark = exempt ? '·查阅型' : (bad ? '✗ 超出区间' : '✓');
  console.log(`  ${mark.padEnd(9)} ${String(n).padStart(5)}  ${rel}`);
}
console.log(over ? `\n✗ ${over} 个材料页字数超出 4000~6000（±10%）区间` : '\n✓ 材料页字数均在区间内');
