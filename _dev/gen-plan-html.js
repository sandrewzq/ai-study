// 把 plan/*.md 渲染成带站点外壳的 plan/*.html
// 用法: node _dev/gen-plan-html.js
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..');
const PLAN = path.join(ROOT, 'plan');

const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
function inline(s) {
  s = esc(s);
  s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (m, t, h) => `<a href="${h}">${t}</a>`);
  return s;
}

function convert(md) {
  const lines = md.split('\n');
  const out = [], anchors = [];
  let i = 0, seq = 0;
  while (i < lines.length) {
    const line = lines[i];

    if (/^---+$/.test(line.trim())) { out.push('<hr>'); i++; continue; }

    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      const lv = h[1].length, id = 'sec-' + (++seq);
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

const PAGES = [
  { md: 'roadmap.md', title: 'AI Agent 学习计划', crumb: '计划与规范 · 学习计划', lead: '这份文档把 242 题按依赖关系排成 A→J 十个域、步骤 0~5 的学习顺序。' },
  { md: 'spec.md', title: '学习资料规范', crumb: '计划与规范 · 材料规范', lead: '规定学习材料怎么写、怎么排版、怎么自检。新增或修改任何一页材料前先看它。' },
];

// 两个页面共用的侧栏（互为兄弟）
const NAV = [
  { file: 'roadmap.html', label: '学习计划' },
  { file: 'spec.html', label: '材料规范' },
];

for (const p of PAGES) {
  const raw = fs.readFileSync(path.join(PLAN, p.md), 'utf8');
  // md 自带的第一个 h1 拿来当页面标题，避免与外壳的 h1 重复
  const h1m = raw.match(/^#\s+(.*)$/m);
  const h1 = h1m ? h1m[1].trim() : p.title;
  const md = raw.replace(/^#\s+.*\n/, '');
  const { body, anchors } = convert(md);
  const toc = anchors.filter(a => a.lv <= 2 && a.lv > 1)
    .map(a => `<li><a class="item" href="#${a.id}"><span>${esc(a.text)}</span></a></li>`).join('\n      ');

  const siblings = NAV.map(n =>
    `<li><a class="item${n.file === p.md.replace(/\.md$/, '.html') ? ' cur' : ''}" href="${n.file}"><span>${n.label}</span></a></li>`
  ).join('\n    ');

  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${h1} — AI Agent 学习资料</title>
<link rel="stylesheet" href="../assets/style.css">
</head>
<body>

<header class="topbar">
  <a href="../index.html">← 总目录</a>
  <a href="../index.html#plan">学习计划全文</a>
  <span class="crumb">${p.crumb}</span>
</header>

<div class="layout">
<nav class="sidenav">
  <a class="up" href="../index.html">← 总目录</a>
  <a class="up" href="../index.html#plan">学习计划全文</a>
  <div class="grp">计划与规范</div>
  <ul>
    ${siblings}
  </ul>
  <div class="grp">本页目录</div>
  <ul>
      ${toc}
  </ul>
</nav>

<main class="wrap">

<h1>${h1}</h1>
<p class="lead">${p.lead}</p>

<div class="warn">
  <span class="tag">关于这一页</span>
  <p>这是 <code>plan/${p.md}</code> 的<strong>渲染版本</strong>，方便在浏览器里读。要改内容请改 Markdown 源文件后重新生成，这一页是生成出来的。</p>
</div>

${body}

<div class="pager">
  ${p.md === 'roadmap.md'
      ? '<span class="spacer"></span><a href="spec.html">材料规范：材料怎么写 →</a>'
      : '<a href="roadmap.html">← 学习计划</a><span class="spacer"></span>'}
</div>

</main>
</div>

</body>
</html>
`;
  const outFile = path.join(PLAN, p.md.replace(/\.md$/, '.html'));
  fs.writeFileSync(outFile, html, 'utf8');
  console.log(`  ✓ plan/${p.md}  →  plan/${path.basename(outFile)}  (${html.split('\n').length} 行, ${anchors.length} 个标题锚点)`);
}
