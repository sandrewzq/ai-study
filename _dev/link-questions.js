// 题号反查：把消费页里每个题号变成指向「讲这道题的那份材料」的链接。
//
// 起因：全站唯一一份 242 题的清单（现在是 questions.html，v2 之前在入口页内嵌的计划里），
// 题号是纯文本。读者看到 `JR-5`，想知道哪里讲过，只能靠侧栏一个个点进材料页翻——反查完全断掉。
// 而材料页顶部本来就有 `.qbadges` 标着覆盖题号，这份映射一直是现成的，
// 只是没人把它反向接上。
//
// 为什么全接（399 处）而不是只接 .checklist 里的 242 处：
// 同一个题号会出现在「域清单」「高频重复题」「数字题」等好几张表里，
// 只接一处会造成「这里能点、那里不能点」的用途横跳，和 plan/spec.md
// 第一节反对的侧栏毛病是同一类。要么全接，要么不接。
//
// 为什么用静态链接而不是运行时 JS 装饰：checklinks.js 会顺带把这 399 条链接
// 全部验一遍（目标文件存在 + 跨页锚点存在），等于白捡一层回归。
//
// 映射规则：每个题号必须**有且只有一个**材料页认领它（读该页的 `.qbadges`）。
// 对不上就不写文件——0 个说明漏写材料，多个说明边界没划清，两种都得先解决。
//
// 链接末尾带**页内锚点**（`…#s5`），落到答这道题的那一节，而不是材料页顶部。
// 落点由 qids.js 的 buildLandings() 算：题号写在某个 h2 标题里 → 落到那一节；
// 没写 → 落到该页「讲解骨架」（09 那页是「完整参考回答」）。这个约定**早就有**，
// 22 页一直在标题里写 `1. 用户量怎么答（ML-11）`，本脚本只是把它读出来当锚点用。
//
// plan.html 的计划正文由 build-plan.js 从 plan/roadmap.md 重建、questions.html 由
// build-questions.js 从 plan/questions.md 重建，两个脚本都会调用本模块的
// linkify()，所以重建之后题号链接不会丢；单独跑本脚本则是全量重刷一遍。
//
// 用法：node _dev/link-questions.js [--check]
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..');
const CHECK = process.argv.includes('--check');
// 题号的判据与提取收在 qids.js：本模块和 add-crosswalk.js 都读它，
// 各写一份必然分叉（历史上就分叉过一次，见那个文件顶部的注释）。
const { QID, walkPages, toPosix, isDirPage, buildOwners, buildLandings, crumbTotal } = require('./qids.js');
const { hrefFrom } = require('./pagekind.js');

// 会生成题号链接的页面。**入口页不在这份清单里**是有意的：它是纯目录，
// 一个题号都不出现（`0 处`）。留着它是因为规则是「谁可能引用题号谁就进来」，
// 而不是「谁今天引用了谁进来」——哪天入口页上加一句带题号的引导语，
// 它必须已经在覆盖面检查的范围里，而不是静默漏掉。
//
// 计划正文原本含全部 242 个题号，约束靠这个「恰好」间接守住；正文一搬走就守不住了，
// 所以从 v2 起覆盖面由下面的 checkCoverage() 显式保证，跟这一行有几个页面无关。
//
// 这份清单里的路径同时是**输出页的落点**：linkify() 的第三个参数就是它，
// 用来把「材料页的仓库根起算路径」换算成从这一页出发的相对链接。
// 从 v3 起三个消费者不再同层（入口页在根、两个参考页在 reference/），
// 所以这个换算是必需的，不能再用 owners 里的路径直接当 href。
const CONSUMERS = ['index.html', 'reference/plan.html', 'reference/questions.html'];

// 已经接过的一层（用于幂等：先拆再装）
const WRAP_RE = /<a class="qref" href="[^"]*">(<code>[A-Za-z]+-[0-9]+<\/code>)<\/a>/g;

// 注意这和 qids.js 的 QID 不是一回事：QID 判「这个字符串是不是题号」，
// 这条找的是「正文里被 <code> 包起来的题号」——即需要接链接的那些位置。
const QID_RE = /<code>([A-Za-z]+-[0-9]+)<\/code>/g;

// 一页正文里出现的题号集合，外加一个「这个位置在不在 <pre> 里」的判定。
// linkify 和 checkCoverage 都要跳过 <pre>——代码块里的题号是示例，不是可点的引用，
// 既不该接链接，也不该被算进覆盖率。两处各写一遍就会漂，所以收在这里。
function qidsIn(html) {
  const preSpans = [];
  for (const m of html.matchAll(/<pre[\s\S]*?<\/pre>/g)) preSpans.push([m.index, m.index + m[0].length]);
  const inPre = i => preSpans.some(([a, b]) => i >= a && i < b);
  const set = new Set();
  for (const m of html.matchAll(QID_RE)) if (!inPre(m.index)) set.add(m[1]);
  return { set, inPre };
}

// 覆盖不变量：**全站引用到的题号** 与 **材料页认领的题号** 必须完全相等。
//
// 为什么必须单独做一次全局比对，而不是靠 linkify() 里那个检查：
// linkify 的 orphan 检查范围是「**这一页里出现的**题号」。今天入口页恰好含全部 242 个，
// 约束是被这个巧合**间接**守住的。计划正文一从入口页搬走，检查范围会静默缩小，
// 而 CLI 照旧打印「✓ 每个题号恰好一份材料认领」——最坏的那种失效：看起来更绿了。
// 这个函数不看任何字面量、不依赖任何页面含全集，只比两个集合，所以搬到哪里都守得住。
function checkCoverage(pages, owners) {
  const owned = new Set(owners.keys());
  const referenced = new Set();
  for (const rel of pages) {
    const { set } = qidsIn(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
    for (const id of set) referenced.add(id);
  }
  return {
    owned, referenced,
    onlyOwned: [...owned].filter(x => !referenced.has(x)),        // 有材料讲，全站没人引用
    onlyReferenced: [...referenced].filter(x => !owned.has(x)),   // 有人引用，没材料认领
  };
}

// 给一段 html 里的每个题号套上 <a class="qref">。映射不成立时抛错，绝不写出半成品。
// page 是**这一段 html 将要落到的那个页面**（仓库根起算的路径），href 从它算出来，
// 所以同一个题号在入口页和 reference/ 下的参考页里会写成不同的相对路径。
//
// href 末尾带页内锚点（`…#s5`），落点由 landings 给出——见 qids.js 的 buildLandings()。
// 只落到「哪一节」这一级，不落到骨架段内部：讲解骨架是**一页一段**、不是一题一段，
// 页内的 <details class="ask"> 追问块与题号也不是一一对应（03 页 3 个 ask 的 summary
// 并不是那 3 道题的题面）。硬切到段内只会指错地方。
function linkify(html, owners = buildOwners(), page, landings = buildLandings()) {
  if (!page) throw new Error('linkify() 少了第三个参数：这段 html 要落到哪一页');
  const { set: used, inPre } = qidsIn(html);

  const orphan = [], multi = [];
  for (const id of used) {
    const own = owners.get(id) || [];
    if (own.length === 0) orphan.push(id);
    else if (own.length > 1) multi.push(id + ' ← ' + own.join(' / '));
  }
  if (orphan.length || multi.length) {
    const msg = [];
    if (orphan.length) msg.push(`${orphan.length} 个题号没有任何材料页认领：${orphan.join(', ')}`);
    if (multi.length) msg.push(`${multi.length} 个题号被多个材料页认领（边界不清）：\n    ` + multi.join('\n    '));
    throw new Error('题号映射不成立：\n  ' + msg.join('\n  '));
  }

  // 落点必须**纯由 landings 派生**，不能读这一段 html 自己的上下文。
  // 生成脚本只对 `<!-- …:auto -->` 区间跑 linkify，CLI 对整页跑，两条路径的产出
  // 必须逐字节一致；只要有一处读的是「当前这段」，--check 就会永久报漂移。
  // landings 和 owners 同源（都是走一遍材料页），所以这里是安全的。
  const unwrapped = html.replace(WRAP_RE, '$1');
  let out = '', last = 0;
  for (const m of unwrapped.matchAll(QID_RE)) {
    if (inPre(m.index)) continue;              // 原样留在 out 里（靠 last 推进）
    const href = hrefFrom(page, owners.get(m[1])[0].split(path.sep).join('/'));
    const land = landings.get(m[1]);
    out += unwrapped.slice(last, m.index)
      + `<a class="qref" href="${href}${land ? '#' + land.anchor : ''}">${m[0]}</a>`;
    last = m.index + m[0].length;
  }
  return out + unwrapped.slice(last);
}

module.exports = { linkify, buildOwners, buildLandings, checkCoverage, qidsIn, CONSUMERS };

// 第三条边：Σ(各目录页 crumb 里声称的题量) == 认领总数。
//
// 为什么单拎出来：另外两条边各自内部自洽，接不上。少认领 5 个题号、同时把某个
// 域标题从 22 改成 17，link-questions 的 A 边（每页 .qbadges 互不重叠）和
// add-crosswalk 的 B 边（卡片题号数 == 域标题题量）都会照旧通过——
// 因为两边都「内部对上了」，只有跨页的那个总数变了。
// 目录页 crumb 是读者最先看到的数字，它必须和全站认领数一致。
function checkDirTotals(owners) {
  const dirs = [];
  for (const rel of walkPages(ROOT)) {
    if (!isDirPage(rel)) continue;
    const n = crumbTotal(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
    if (n !== null) dirs.push({ rel: toPosix(rel), n });
  }
  const sum = dirs.reduce((a, d) => a + d.n, 0);
  return { dirs, sum, mismatch: sum !== owners.size };
}

// ---------------- CLI ----------------
if (require.main === module) {
  const owners = buildOwners(ROOT);

  // ① 落点表。buildLandings() 顺带把三条落点不变量查了（每个认领的题号都能解析出
  //    落点、h2 标题里的题号属于本页、写了题号的 h2 有 id），所以它一抛错就不用往下走。
  let landings;
  try { landings = buildLandings(ROOT); }
  catch (e) { console.log('✗ ' + e.message + '\n未改写任何文件。'); process.exit(1); }

  // ①b 先查覆盖面。这一步不通过就一个文件都不动——
  //    今天它等价于「242 个题号每个都被引用了」，但它是**比出来的**，不是数出来的。
  const cov = checkCoverage(CONSUMERS, owners);
  if (cov.onlyOwned.length || cov.onlyReferenced.length) {
    // 失效时可能一次列出两百多个题号，全是重点等于没有重点——掐到 12 个，
    // 剩下的报个数。这种失败要的是「去查覆盖面」，不是把两百个 ID 读完。
    const list = (a) => a.slice(0, 12).join(', ') + (a.length > 12 ? ` …（还有 ${a.length - 12} 个）` : '');
    console.log('✗ 题号覆盖面不成立（全站引用集 ≠ 材料认领集）：');
    if (cov.onlyOwned.length)
      console.log(`  ${cov.onlyOwned.length} 个题号有材料讲、但全站没有任何页面引用它们：\n    ${list(cov.onlyOwned)}`);
    if (cov.onlyReferenced.length)
      console.log(`  ${cov.onlyReferenced.length} 个题号被引用、但没有材料页认领：\n    ${list(cov.onlyReferenced)}`);
    console.log('未改写任何文件。');
    process.exit(1);
  }

  // ①b 第三条边：目录页 crumb 里声称的题量之和 == 认领总数。
  //     与 ① 一样，不通过就一个文件都不动。
  const tot = checkDirTotals(owners);
  if (tot.mismatch) {
    console.log('✗ 目录页声称的题量与材料认领总数对不上：');
    console.log('  ' + tot.dirs.map(d => `${d.rel} ${d.n} 题`).join('；'));
    console.log(`  合计 ${tot.sum} 题，但材料页一共认领 ${owners.size} 题`
      + `（差 ${tot.sum - owners.size}）`);
    console.log('未改写任何文件。');
    process.exit(1);
  }

  // ② 逐页接链接。映射不成立时 linkify 抛错，此时前面的页可能已落盘——
  //    所以先在内存里全部算完，确认无误再统一写。
  const results = [];
  for (const rel of CONSUMERS) {
    const orig = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    let out;
    try { out = linkify(orig, owners, rel, landings); }
    catch (e) { console.log('✗ ' + e.message + '\n未改写任何文件。'); process.exit(1); }
    results.push({ rel, orig, out, instances: (orig.match(QID_RE) || []).length });
  }

  let stale = 0;
  for (const r of results) {
    if (r.out === r.orig) continue;
    stale++;
    if (CHECK) console.log('  ✗ 待改  ' + r.rel);
    else { fs.writeFileSync(path.join(ROOT, r.rel), r.out); console.log('  ✓ ' + r.rel); }
  }

  const perPage = results.map(r => `${r.rel} ${r.instances} 处`).join('；');
  console.log(`\n映射表：${owners.size} 个题号有材料认领；${CONSUMERS.length} 个消费页共引用 `
    + `${cov.referenced.size} 个（${perPage}）`);
  console.log(`目录页题量：${tot.dirs.length} 页共 ${tot.sum} 题，与认领总数一致`);
  console.log('✓ 覆盖面成立：每个认领的题号都被引用，每个被引用的题号恰好一份材料认领');

  // 落点分布。**兜底那 137 个不是待办清单**——概念页（01-what-is-rag 那类）正文节答的是
  // 另一批问题，它的答案确实是整页给的，落到骨架就是正确答案，这些数字不会降到 0。
  // 摆出来是为了「改标题时看得见自己动了多少」，不是「数字越小越好」。
  const exact = [...landings.values()].filter(l => l.fromTitle).length;
  const instances = results.reduce((a, r) => a + r.instances, 0);
  const anchored = results.reduce((a, r) => a + (r.out.match(/class="qref" href="[^"]*#/g) || []).length, 0);
  console.log(`落点：${owners.size} 个题号全部可解析；${exact} 个落在标题写明的那一节，`
    + `${owners.size - exact} 个走兜底（讲解骨架 / 参考回答）`);
  console.log(`带锚点的题号链接：${anchored} / ${instances} 处`);
  console.log(CHECK
    ? (stale ? '✗ 需要重跑 node _dev/link-questions.js' : '✓ 链接已是最新')
    : (stale ? `✓ 已改写 ${stale} 个页面` : '- 无变化'));
  if (CHECK && stale) process.exitCode = 1;
}
