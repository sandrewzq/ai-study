// 共享的 Markdown → HTML 转换器（入口页与 plan/ 下的页面都用它，保证同源）
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function inline(s) {
  s = esc(s);
  s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
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

module.exports = { convert, inline, esc };
