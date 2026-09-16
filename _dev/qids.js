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

// ---------------- 落点（题号 → 该材料页里的哪一节） ----------------

// 一页的 h2 清单。id 为 null 表示这个 h2 没带 id。
function h2sIn(html) {
  return [...html.matchAll(/<h2([^>]*)>([\s\S]*?)<\/h2>/g)].map(m => ({
    id: (m[1].match(/\bid\s*=\s*"([^"]+)"/) || [])[1] || null,
    text: m[2].replace(/<[^>]+>/g, ''),
  }));
}

// 二层落点：讲解骨架那一节的 id。材料页是「N. 讲解骨架（看懂之后再背）」，
// 09-review-and-answers 没有骨架节，它的页是「4. 完整参考回答（3 份）」——
// 两个都要认，这就是它的答案所在。找不到返回 null。
const SKEL_HEAD = /讲解骨架|参考回答/;
function skeletonAnchorIn(html) {
  const h = h2sIn(html).find(x => x.id && SKEL_HEAD.test(x.text));
  return h ? h.id : null;
}

// 一层落点：**哪些 h2 的标题里写明了题号** → Map<题号, 该 h2 的 id>。
//
// 真值只有一个：h2 标题里写的题号。不另开一张「落点表」——两份必然漂。
// 题号写在标题里这个约定**早就有**（22 页一直在这么写，写出 `1. 用户量怎么答（ML-11）`），
// 本模块只是把它读出来；剩下 29 页补齐是内容活，不是新机制。
//
// 同一个题号写在**两个** h2 标题里是允许的，落点取文档顺序里第一个。
// 起初这里当成错误抛，磁盘上立刻撞到反例：step-4-storytelling/03-architecture-layers
// 的 YC-5 题干是「技术架构：你怎么拆模块？数据怎么流转？技术选型怎么做？」——
// 一题三个问号，s2 答「数据怎么流转」、s3 答「怎么拆模块、怎么选型」，两边都该写它。
// 强行只许写一处，等于逼作者少声明一处「这节也答了这题」，是拿检查器去扭曲内容。
// 取第一个是确定性的，且第一个必定是「往下读就能看到答案」的那一节。
//
// 两种写法仍然当错误抛：写进一个没有 id 的 h2（落点表达不出来），
// 以及（在 buildLandings 里，要拿 badgesIn 比对）标题里的题号不属于本页。
// 没有 id 这条看着离谱，但 00 导读页的 h2 真的没有 id（<h2>第一组 · 认识大模型</h2>）。
function landingsIn(html, page = '这一页') {
  const land = new Map();
  for (const h of h2sIn(html)) {
    for (const q of h.text.match(/[A-Za-z]+-\d+/g) || []) {
      if (!h.id)
        throw new Error(`${page} 的 h2「${h.text.trim()}」标题里写了题号 ${q}，但这个 h2 没有 id，落点无从表达`);
      if (!land.has(q)) land.set(q, h.id);     // 已经有过就保留先出现的那个
    }
  }
  return land;
}

// 题号 → 落点（全站唯一一份映射）。值形如 { page, anchor }。
//
// 两层：标题里写了该题号 → 那一节；没写 → 该页讲解骨架那一节。
// 兜底不是敷衍——骨架就是这一页所有题的答法。概念页（01-what-is-rag 那类）
// 的正文节答的是另一批问题，它的四道题的答案确实是整页给的，就该落到骨架。
//
// 只认材料页，和 buildOwners 同一批页、同一次遍历口径。它顺带把三条不变量查了
// （落点存在、不重复、标题里的题号属于本页），所以调用它就等于跑了一遍自检。
function buildLandings(root = path.resolve(__dirname, '..')) {
  const landings = new Map();
  for (const rel of walkPages(root)) {
    if (kindOf(rel) !== 'material') continue;
    const posix = toPosix(rel);
    const html = fs.readFileSync(path.join(root, rel), 'utf8');
    const badges = badgesIn(html);
    const titled = landingsIn(html, posix);

    // 标题里出现别页的题号 = 把邻居的题算到自己头上了。这条以前没人查，
    // 磁盘上真有一处：02-self-assessment 的「优点怎么答（FN-8、FN-9）」里 FN-9 是
    // 03-ai-era-value 的题。它不影响 A 边（A 看的是 .qbadges），但落点会指错页。
    const foreign = [...titled.keys()].filter(q => !badges.includes(q));
    if (foreign.length)
      throw new Error(`${posix} 的 h2 标题里写了不属于本页的题号：${foreign.join(', ')}`
        + `（本页认领的是 ${badges.join(', ') || '（没有）'}）`);

    if (!badges.length) continue;              // 导读页：不认领题号，无需落点
    const skel = skeletonAnchorIn(html);
    if (!skel)
      throw new Error(`${posix} 认领了 ${badges.length} 个题号，却找不到「讲解骨架」/「参考回答」那一节做兜底落点`);

    for (const q of badges) {
      const exact = titled.get(q);
      landings.set(q, { page: posix, anchor: exact || skel, fromTitle: !!exact });
    }
  }
  return landings;
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

module.exports = { QID, toPosix, walkPages, isDirPage, badgesIn, buildOwners, crumbTotal,
  h2sIn, skeletonAnchorIn, landingsIn, buildLandings, SKIP_DIR };
