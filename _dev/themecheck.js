// 深色配色有两对映射块，两对都必须逐项对齐。
//
// 起因：style.css 里深色有两套触发方式——@media (prefers-color-scheme: dark)（跟随系统）
// 和 :root[data-theme="dark"]（顶栏按钮手动切）。同一条映射写两遍，就有一遍漏项的可能：
//
//   A 对：--dk-*  → 站点变量（--bg / --fg / --line …）
//   B 对：--dk-c-* → 语义色板（--c-user / --c-model …，图示靠它编码「对象类型」）
//
// 为什么必须用脚本盯：漏一个变量既不报错、也不会在浅色下露馅——只有
// 「系统是深色、读者手动切回浅色」或者反过来那一种组合下，某一项才会缺色
// （最容易中招的是 B 对：图里某类盒子突然掉回浅色底）。这种组合人工测不全，
// 比对两份变量名才抓得到。
//
// 顺带查四件事：
//   ① 用到的 --dk-* 都定义了（var() 取不到值是不报错的，名字打错只会静默变成空）
//   ② 定义了的 --dk-* 都被用上了（防加色值没接线）
//   ③ 映射块左侧的变量在浅色 :root 里也有定义
//   ④ color-scheme 三态齐备（深色下浏览器自绘的搜索框、滚动条靠它）
//
// 用法：node _dev/themecheck.js
const fs = require('fs'), path = require('path');
const CSS = path.join(__dirname, '..', 'assets', 'style.css');
const s = fs.readFileSync(CSS, 'utf8');
const errs = [];

// 从 from 开始找到第一个 '{'，再花括号配对，返回块内容
function blockAt(from) {
  const i = s.indexOf('{', from);
  if (i < 0) return null;
  let d = 0;
  for (let j = i; j < s.length; j++) {
    if (s[j] === '{') d++;
    else if (s[j] === '}' && --d === 0) return { body: s.slice(i + 1, j), start: i };
  }
  return null;
}
const occurrences = sel => {
  const out = [];
  for (let i = s.indexOf(sel); i >= 0; i = s.indexOf(sel, i + 1)) out.push(i);
  return out;
};

// `--名字: var(--dk-xxx)` 形式的映射，保持出现顺序
const MAP = /(--[a-zA-Z0-9-]+)\s*:\s*var\((--[a-zA-Z0-9-]+)\)/g;
const asMap = body => new Map([...body.matchAll(MAP)].map(m => [m[1], m[2]]));

// ---- 深色映射块：媒体查询里的 + 手动切换的 ----
const sysBlocks = occurrences('prefers-color-scheme: dark')
  .map(at => blockAt(at))                      // @media { … }
  .map(b => b && blockAt(b.body.indexOf(':root:not([data-theme="light"])') + b.start))
  .filter(Boolean)
  .map(b => ({ kind: '跟随系统', map: asMap(b.body) }));

const manBlocks = occurrences(':root[data-theme="dark"]')
  .map(at => blockAt(at))
  .filter(Boolean)
  .map(b => ({ kind: '手动切换', map: asMap(b.body) }))
  .filter(b => b.map.size);            // 排除 `:root[data-theme="dark"] { color-scheme: dark }` 这类没有映射的块

if (!sysBlocks.length || !manBlocks.length) {
  console.log(`✗ 没找齐映射块（媒体查询里 ${sysBlocks.length} 块，手动切换 ${manBlocks.length} 块）`);
  process.exit(1);
}

// ---- 配对：按最大重叠认亲（不能用「键集相等」——漏项时键集就不等了，
//      那样只能报出「找不到对应」，而真正要看的是「少了哪一个」）----
const overlap = (a, b) => [...a.keys()].filter(k => b.has(k)).length;
const pairs = [];
for (const man of manBlocks) {
  const twin = sysBlocks.slice().sort((x, y) => overlap(y.map, man.map) - overlap(x.map, man.map))[0];
  if (!twin) { errs.push('媒体查询里一块映射都没有，无法比对'); continue; }

  // 给这块起个人能认的名字：站点变量 / 语义色板，而不是一串变量名
  const ks = [...man.map.keys()];
  const name = ks.some(k => k.startsWith('--c-')) ? '语义色板（--c-*）'
             : ks.includes('--bg') ? '站点变量（--bg / --fg / …）'
             : ks.slice(0, 3).join(' ');
  for (const k of man.map.keys())
    if (!twin.map.has(k)) errs.push(`「${name}」这块：跟随系统里少了 ${k}（手动切换有）`);
  for (const k of twin.map.keys())
    if (!man.map.has(k)) errs.push(`「${name}」这块：手动切换里少了 ${k}（跟随系统有）`);
  for (const [lhs, rhs] of man.map) {
    const other = twin.map.get(lhs);
    if (other !== undefined && other !== rhs)
      errs.push(`${lhs} 两处指向不同：跟随系统→ ${other}，手动切换→ ${rhs}`);
  }
  // 顺序：只看两块都有的那些键的相对顺序（有缺项时，按共同键比，
  // 否则「少了 --q-fg」会顺带引发一句无关的顺序抱怨）
  const manShared = [...man.map.keys()].filter(k => twin.map.has(k)).join();
  const sysShared = [...twin.map.keys()].filter(k => man.map.has(k)).join();
  if (manShared !== sysShared)
    errs.push(`「${name}」这块两处顺序不一致（内容对但不齐，容易看漏）`);

  pairs.push({ name, n: man.map.size, twin });
}

// ---- 色值定义：所有 :root 块（浅色的 + 只放色值的那两块）----
const allRoots = occurrences(':root')
  .map(at => ({ at, b: blockAt(at) }))
  .filter(x => x.b)
  // 排除深色映射块自身
  .filter(x => !/:root(\[data-theme="dark"\]|:not\(\[data-theme="light"\]\))/.test(s.slice(x.at, x.b.start)));
const rootDecls = allRoots.flatMap(x => [...x.b.body.matchAll(/(--[a-zA-Z0-9-]+)\s*:/g)].map(m => m[1]));
const dkDefined = new Set(rootDecls.filter(v => v.startsWith('--dk-')));
const lightDefined = new Set(rootDecls.filter(v => !v.startsWith('--dk-')));

// ① / ② --dk-* 的定义与引用要一一对上
const used = new Set(pairs.flatMap(p => [...p.twin.map.values()]));
for (const p of pairs) for (const rhs of p.twin.map.values())
  if (!dkDefined.has(rhs)) errs.push(`引用了未定义的 ${rhs}`);
for (const v of dkDefined)
  if (!used.has(v)) errs.push(`定义了 ${v} 但两处映射都没用它（浅色下正常、深色下少一处）`);

// ③ 映射块左侧的变量，浅色下也得有值
for (const p of pairs) for (const lhs of p.twin.map.keys())
  if (!lightDefined.has(lhs)) errs.push(`${lhs} 只在深色下定义，浅色下没有值`);

// ④ color-scheme 三态
const flat = s.replace(/\s+/g, ' ');
for (const need of [':root { color-scheme: light dark; }',
                    ':root[data-theme="light"] { color-scheme: light; }',
                    ':root[data-theme="dark"] { color-scheme: dark; }'])
  if (!flat.includes(need)) errs.push(`color-scheme 少了「${need}」——深色下搜索框/滚动条这些浏览器自绘控件会留在浅色`);

console.log(`深色配色：${dkDefined.size} 个 --dk-* 色值，${pairs.length} 对映射块`);
pairs.forEach(p => console.log(`  · ${p.n} 项  ${p.name}`));
if (errs.length) {
  console.log(`\n✗ ${errs.length} 处不一致：`);
  errs.forEach(e => console.log('  ' + e));
  process.exitCode = 1;
} else {
  console.log('✓ 每对映射逐项一致；无未定义引用、无未接线色值、浅色侧齐备');
}
