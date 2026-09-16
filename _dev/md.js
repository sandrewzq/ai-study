// 共享的 Markdown → HTML 转换器（入口页与 plan/ 下的页面都用它，保证同源）
const path = require('path');
const { hrefFrom } = require('./pagekind.js');
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function inline(s) {
  s = esc(s);
  s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  // 单星号 = 斜体。**必须排在 `**粗体**` 后面**：粗体先被替换成 <strong>，
  // 里面不再有星号，这条才不会把 `**x**` 拆成两个 `<em>`。
  //
  // 补这条是因为它一直漏着：roadmap.md §2 那 10 行域描述用的是 `*……*`，
  // 而这里只认双星号，于是十个域的介绍页面上全都顶着字面的星号。
  // 当时没人发现，是因为那 10 行只在计划正文里，而计划正文此前只有一份拷贝。
  s = s.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (m, t, h) => `<a href="${h}">${t}</a>`);
  return s;
}

function convert(md, idPrefix = 'sec-') {
  const lines = md.split('\n');
  const out = [], anchors = [];
  let i = 0, seq = 0;
  while (i < lines.length) {
    const line = lines[i];

    if (/^---+$/.test(line.trim())) { out.push('<hr>'); i++; continue; }

    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      const lv = h[1].length, id = idPrefix + (++seq);
      anchors.push({ lv, text: h[2].replace(/[*`]/g, ''), id });
      out.push(`<h${lv} id="${id}">${inline(h[2])}</h${lv}>`);
      i++; continue;
    }

    if (/^>\s?/.test(line)) {
      const buf = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) { buf.push(inline(lines[i].replace(/^>\s?/, ''))); i++; }
      out.push('<blockquote>' + buf.filter(Boolean).map(b => `<p>${b}</p>`).join('') + '</blockquote>');
      continue;
    }

    if (/^\|/.test(line) && /^\|[\s:|-]+\|$/.test(lines[i + 1] || '')) {
      const head = line.split('|').slice(1, -1).map(c => c.trim());
      const align = lines[i + 1].split('|').slice(1, -1).map(c => {
        const a = c.trim();
        if (/^:-+:$/.test(a)) return 'center';
        if (/^-+:$/.test(a)) return 'right';
        return 'left';
      });
      i += 2;
      const rows = [];
      while (i < lines.length && /^\|/.test(lines[i])) { rows.push(lines[i].split('|').slice(1, -1).map(c => c.trim())); i++; }
      let t = '<table><thead><tr>' + head.map((c, j) => `<th style="text-align:${align[j]}">${inline(c)}</th>`).join('') + '</tr></thead><tbody>';
      for (const r of rows) t += '<tr>' + r.map((c, j) => `<td style="text-align:${align[j] || 'left'}">${inline(c)}</td>`).join('') + '</tr>';
      out.push(t + '</tbody></table>');
      continue;
    }

    if (/^```/.test(line)) {
      const buf = []; i++;
      while (i < lines.length && !/^```/.test(lines[i])) { buf.push(esc(lines[i])); i++; }
      i++;
      out.push('<pre><code>' + buf.join('\n') + '</code></pre>');
      continue;
    }

    // 原样透传 HTML 块：从块级标签开始，收集到空行为止。
    // 用于 Markdown 表达不了的结构（比如 .qchain 追问链）。
    if (/^<(div|ul|ol|table|section|figure|nav|details|aside)\b/.test(line)) {
      const buf = [];
      while (i < lines.length && lines[i].trim() !== '') { buf.push(lines[i]); i++; }
      out.push(buf.join('\n'));
      continue;
    }

    if (/^\s*([-*]|\d+\.)\s+/.test(line)) {
      const ordered = /^\s*\d+\.\s+/.test(line);
      const items = [];
      while (i < lines.length && (/^\s*([-*]|\d+\.)\s+/.test(lines[i]) || (/^\s{2,}\S/.test(lines[i]) && lines[i].trim()))) {
        const m2 = lines[i].match(/^\s*(?:[-*]|\d+\.)\s+(.*)$/);
        if (m2) {
          let body = m2[1], done = false, todo = false;
          if (/^\[ \]\s*/.test(body)) { body = body.replace(/^\[ \]\s*/, ''); todo = true; }
          else if (/^\[x\]\s*/i.test(body)) { body = body.replace(/^\[x\]\s*/i, ''); done = true; }
          items.push({ body: inline(body), done, todo, cont: [] });
        } else if (items.length) items[items.length - 1].cont.push(inline(lines[i].trim()));
        i++;
      }
      const tag = ordered ? 'ol' : 'ul';
      const cls = items.some(x => x.todo || x.done) ? ' class="checklist"' : '';
      out.push(`<${tag}${cls}>` + items.map(x =>
        `<li${x.done ? ' class="done"' : ''}>${x.body}${x.cont.length ? '<br>' + x.cont.join('<br>') : ''}</li>`
      ).join('') + `</${tag}>`);
      continue;
    }

    if (line.trim()) { out.push('<p>' + inline(line) + '</p>'); i++; continue; }
    i++;
  }
  return { body: out.join('\n'), anchors };
}

// 把渲染出来的正文里的相对链接，从「相对源文件所在目录」换算成「相对输出页」。
//
// md 里的链接是相对**这份 md 自己**写的（这样在编辑器 / GitHub 上点开也是对的）。
// 渲染到另一个目录之后，同一个目标就得换一种写法：
//   plan/roadmap.md（源）里的 `../reference/questions.html`
//   渲染到 reference/plan.html（输出）里应该写成 `questions.html`
// 两个目录同层时，旧写法 `replace(/(href=")\.\.\//g, '$1')` 碰巧对；
// 一旦源和输出不同层（或目标不在根目录），它就开始悄悄写错路径——
// 所以改成：先还原成仓库根起算的路径，再相对输出页求一次，两个方向都真算。
//
// 只碰相对链接：`http(s):` / `mailto:` / `data:`、根路径 `/…` 和纯锚点 `#…` 都原样留着。
function relink(html, fromDir, toRel) {
  return html.replace(/href="(?![a-z][a-z0-9+.-]*:|\/|#)([^"]*)"/gi, (m, h) => {
    const target = path.posix.normalize(path.posix.join(fromDir, h));
    return `href="${hrefFrom(toRel, target)}"`;
  });
}

module.exports = { convert, inline, esc, relink };
