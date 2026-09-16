// 页型：一页套哪套规则，由它决定——豁免哪些检查、侧栏长什么样、相对路径怎么写。
//
// 收这个模块的原因：这个判断此前在六个脚本里各写了一遍，口径已经开始分叉——
// density.js 逐个点名 00 页（`00-key-terms|00-how-to-study`），speccheck.js 用
// `00-[^/]*` 通配，当前 6 个 00 页恰好都被点名，所以只是「碰巧一致」，不是真的对齐。
// 再加一种页型就要改六处，漏一处不会报错，只会少一层回归。
//
// 判据只有两条：**在不在这份参考页名单里、文件名是不是 index.html**。
// 不要按内容特征判断（有没有 .qbadges、有没有 .hero）——那是内容的属性，会随
// 内容漂；页型是文件在站点里的位置决定的，只随目录结构变。
//
//   入口 entry     根 index.html      着陆页，侧栏装站点级导航
//   目录 dir       子目录 index.html  一个步骤 / 一个专题的材料目录
//   参考 ref       NAV.refs 点名的那两条路径（学习计划 / 题目索引）
//   材料 material  其余一切 .html     正文页，11 项骨架 + 字数区间都管它
//
// 参考页的判据原来是「在根目录、又不是 index.html」。这两个页面搬进 reference/
// 之后，根目录只剩一个 index.html，那条判据就空了——所以改成**在 NAV.refs 里点名**。
// 名单写的仍然是路径，不是内容特征，「页型只随目录结构变」这条没变；
// 而且这份名单本来就是侧栏「参考」段的唯一数据源，判据与导航共用一份，不会分叉。
//
// 之所以参考页要单独一类而不是并进「材料」：材料骨架描述的是一份步骤内的材料，
// 参考页不属于任何步骤，套不上。
const path = require('path');

const toPosix = rel => rel.split(path.sep).join('/');

// 站点导航模型：侧栏「参考」段的内容，全站只有一个源。
// 它是导航（点了去另一个页面），和 topbar 那条位置栏无关。
const NAV = {
  root: 'index.html',
  refs: [
    { href: 'reference/plan.html', label: '学习计划' },
    { href: 'reference/questions.html', label: '题目索引' },
  ],
};

const REF_SET = new Set(NAV.refs.map(r => r.href));

function depthOf(rel) { return toPosix(rel).split('/').length - 1; }

function kindOf(rel) {
  const r = toPosix(rel);
  if (REF_SET.has(r)) return 'ref';
  const base = path.posix.basename(r);
  if (base === 'index.html') return depthOf(rel) === 0 ? 'entry' : 'dir';
  return 'material';
}

// 从仓库根目录写起的相对前缀：材料页 '../'，根目录页 './'。
// 给 <script src> / <link href> 用（'./assets/app.js'）；锚点链接用 hrefFrom。
function rootPrefix(rel) {
  const d = depthOf(rel);
  return d ? '../'.repeat(d) : './';
}

// 从 rel 这一页指向仓库根下 target 的链接（不带 './'，'plan.html' 比 './plan.html'
// 短且同样明确）。
//
// 原来是 `'../'.repeat(depth) + target`，只成立在「目标在根目录」这一种情形。
// 参考页搬进 reference/ 之后就不够了：从 reference/plan.html 指向 reference/questions.html
// 本该是 'questions.html'，套旧公式会得到 '../reference/questions.html'——点得开，
// 但绕到根目录再折回来，而且从别的目录看就错了。
// 所以改成真算相对路径：目标一律写成**仓库根起算**的路径，不必关心调用者在哪一层。
function hrefFrom(rel, target) {
  const r = path.posix.relative(path.posix.dirname(toPosix(rel)), target);
  return r === '' ? path.posix.basename(target) : r;
}

// 下面两个豁免是**两个不同的问题**，不要合成一个谓词。
//
// 这里踩过一个坑：density.js 的 EXEMPT 和 speccheck.js 的 SURVEY 注释上都写着
// 「口径保持一致」，实际并没有——`step-1-foundation/09-review-and-answers.html`
// 被 density 豁免（它的 `review-and-answers` 后缀没有前缀锚定），却被 speccheck
// 要求套满 11 项骨架（它的正则带 `(^|\/)`，而那个文件名前面是 `09-` 不是 `/`）。
// 之所以一直没暴露，是因为那一页**恰好 11 项都齐**——两个口径同时满足，
// 分歧就藏起来了。合谓词会把其中一边悄悄改掉，所以这里把问题拆开问。

// ① 字数豁免：哪些页不受 3600~6600 区间约束（plan/spec.md 第三节的例外条款）
//   入口 / 目录 / 参考页（页面本身就是导航或索引）
//   00-*（导读页、前置页：术语表这类要反复查的）
//   自查页（题库，天然超长）
const SURVEY = /(^|\/)00-[^/]*\.html$|review-and-answers\.html$/;
const isSurvey = rel => kindOf(rel) !== 'material' || SURVEY.test(toPosix(rel));

// ② 骨架豁免：哪些页不套第二节那 11 项材料骨架
//   只有 00-* 和「根本不是材料页」的那些。
//   **自查页不在豁免之列**：它虽然叫「查阅型」，但实测 11 项一项不少，
//   而要求它并不会误伤——少一层检查才是真的损失。规范里那句「不套材料骨架」
//   说的是它可以简写，不是它现在简写了。
const NOT_SKELETON = /(^|\/)00-[^/]*\.html$/;
const isSkeletonPage = rel => kindOf(rel) === 'material' && !NOT_SKELETON.test(toPosix(rel));

module.exports = { kindOf, depthOf, rootPrefix, hrefFrom, isSurvey, isSkeletonPage, NAV, SURVEY };

// 直接跑（node _dev/pagekind.js）时打一张分类表，方便加页型时肉眼核对。
if (require.main === module) {
  const fs = require('fs');
  const ROOT = path.resolve(__dirname, '..');
  const SKIP = new Set(['.git', '_dev', 'notes', 'plan', 'node_modules']);
  const pages = [];
  (function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.name.startsWith('.') || e.name.startsWith('__')) continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) { if (!SKIP.has(e.name)) walk(p); }
      else if (e.name.endsWith('.html')) pages.push(path.relative(ROOT, p));
    }
  })(ROOT);
  pages.sort();

  const byKind = {};
  for (const rel of pages) (byKind[kindOf(rel)] ||= []).push(rel);
  for (const k of ['entry', 'dir', 'ref', 'material']) {
    const list = byKind[k] || [];
    console.log(`${k.padEnd(9)} ${String(list.length).padStart(3)} 页`
      + (k === 'ref' || k === 'entry' || k === 'dir' ? '  ' + list.join(' ') : ''));
  }
  const survey = pages.filter(isSurvey).length;
  const skeleton = pages.filter(isSkeletonPage).length;
  console.log(`\n豁免字数区间 ${survey} 页；要求 11 项骨架 ${skeleton} 页`
    + `（差集 = 只豁免字数、仍要骨架的那些：`
    + `${pages.filter(r => isSurvey(r) && isSkeletonPage(r)).map(r => r.split('/').pop()).join(' ') || '无'}）`);
}
