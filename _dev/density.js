// 正文密度检查：去掉标签、SVG、折叠区后统计可见字符数
// 规范要求材料页 4000~6000 字符（±10%），查阅型页面（00 前置页 / 自测页）不受限
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..');
const SKIP = new Set(['.git', '_dev', 'notes', 'plan', 'node_modules']);
// 目录页不套材料骨架，字数不受限；00 前置页和自查页属查阅型，同样豁免
const EXEMPT = /(index|00-key-terms|review-and-answers|00-how-to-study)\.html$/;

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
  const exempt = EXEMPT.test(f);
  const bad = !exempt && (n < 3600 || n > 6600);
  if (bad) over++;
  const mark = exempt ? '·查阅型' : (bad ? '✗ 超出区间' : '✓');
  console.log(`  ${mark.padEnd(9)} ${String(n).padStart(5)}  ${rel}`);
}
console.log(over ? `\n✗ ${over} 个材料页字数超出 4000~6000（±10%）区间` : '\n✓ 材料页字数均在区间内');
