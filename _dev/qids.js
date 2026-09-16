// 题号的唯一判据 —— 「什么算一个题号」「一页认领了哪些」「一页声称自己有多少题」。
//
// 抽这个模块的原因：这三件事此前分散在 link-questions.js 和 add-crosswalk.js 里，
// 两边各自写正则、各自解析，于是**三条本该闭合的边只连上了两条**：
//
//   A. 每个题号恰好一份材料认领（link-questions：owners 里没有重复值）
//   B. Σ(每份材料认领的题号数) == 该域标题里的题量（add-crosswalk）
//   C. Σ(各目录页 crumb 里的题量) == 认领总数（**缺的就是这条**）
//
// A 和 B 各自内部自洽，但中间没有一条边把「全站认领总数」和「各目录页声称的总数」接起来：
// 少认领 5 个题号、同时把某个域标题从 22 改成 17，A 和 B 都会照旧通过。
// 现在这条边由 link-questions 的 CLI 用本模块的两个函数比出来。
const fs = require('fs'), path = require('path');
const { kindOf } = require('./pagekind.js');

const QID = /^[A-Za-z]+-\d+$/;
const SKIP_DIR = new Set(['.git', '_dev', 'notes', 'plan', 'node_modules']);

// 站点里所有 .html 的相对路径（升序）
function walkPages(root) {
  const pages = [];
  (function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.name.startsWith('.') || e.name.startsWith('__')) continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) { if (!SKIP_DIR.has(e.name)) walk(p); }
      else if (e.name.endsWith('.html')) pages.push(path.relative(root, p));
    }
  })(root);
  return pages.sort();
}

const toPosix = rel => rel.split(path.sep).join('/');
const isDirPage = rel => path.posix.basename(toPosix(rel)) === 'index.html' && toPosix(rel).includes('/');

// 一页自报覆盖的题号（读 .qbadges）。形状过滤是必须的：同样的 .q 类在目录页卡片里
// 装的是「H 域 18 题」这类域徽章，不是题号。
function badgesIn(html) {
  const b = html.match(/<div class="qbadges">([\s\S]*?)<\/div>/);
  if (!b) return [];
  return [...b[1].matchAll(/<span class="q">([^<]+)<\/span>/g)]
    .map(m => m[1].trim()).filter(x => QID.test(x));
}

// 题号 → 认领它的材料页（全站唯一一份映射）。
// 只认材料页：目录页是导航，入口页 / 参考页自己是被接的那一方。
// 判据走 pagekind.kindOf，不在这里重写一遍「什么算材料页」——原来这里是
// `base === 'index.html' || !rel.includes('/')`，靠「参考页在根目录」这个位置事实
// 挡住了它们；两个参考页搬进 reference/ 之后那半条判据就失了效，
// 它们会被当成材料页走一遍（今天恰好没有 .qbadges，所以不出声）。
// root 默认就是仓库根（本目录的上一层），免得每个调用点都要记着传——
// 漏传的表现是 readdirSync(undefined)，报错信息离原因很远。
function buildOwners(root = path.resolve(__dirname, '..')) {
  const owners = new Map();
  for (const rel of walkPages(root)) {
    if (kindOf(rel) !== 'material') continue;   // 目录页 / 入口页 / 参考页都跳过
    for (const id of badgesIn(fs.readFileSync(path.join(root, rel), 'utf8'))) {
      if (!owners.has(id)) owners.set(id, []);
      owners.get(id).push(toPosix(rel));
    }
  }
  return owners;
}

// 目录页 crumb 里声称的题量：「…（C + D 域，60 题）」→ 60。找不到返回 null
// （入口页 / 参考页的 crumb 里没有题量，返回 null 是正常情况，不是错误）。
function crumbTotal(html) {
  const m = html.match(/<span class="crumb">([\s\S]*?)<\/span>/);
  if (!m) return null;
  const t = m[1].replace(/<[^>]+>/g, '');
  const n = t.match(/(\d+)\s*题/);
  return n ? +n[1] : null;
}

module.exports = { QID, toPosix, walkPages, isDirPage, badgesIn, buildOwners, crumbTotal, SKIP_DIR };
