/* AI Agent 学习资料 · 交互层
 *
 * 这 68 个页面原本是零 JS 的。加这一层只为解决四件「纯 CSS 做不到」的事，
 * 其余一律不碰——没有 JS 时页面必须照常可读，所以每个功能都是叠加式的：
 *
 *   1. 站内搜索   68 个页面 / 242 道题，没有搜索就只能靠侧栏一页页翻
 *   2. 清单打勾    「我会答这题了」需要记住，纯 CSS 记不住
 *   3. 配色切换    系统跟随之外的第三个选择
 *   4. 回顶部 / 全部展开   长页面滚到底之后的操作
 *
 * 由 _dev/apply-nav.js 注入，data-root 给出到仓库根目录的相对前缀（'./' 或 '../'）。
 * 索引文件由 _dev/build-search.js 事先生成——file:// 下 fetch() 会被拦，
 * 所以只能靠 <script src> 现加载。
 */
(function () {
  'use strict';

  var self = document.currentScript;
  var ROOT = (self && self.dataset && self.dataset.root) || './';
  var PAGE_KEY_ROOT = 'aistudy';
  var THEME_KEY = PAGE_KEY_ROOT + '.theme';
  var CK_KEY = PAGE_KEY_ROOT + '.checklist';
  var QID = /^[A-Za-z]+-\d+$/;

  /* file:// 下 localStorage 可能直接抛 SecurityError（Safari 等），
     拿不到就用内存版顶着：至少当前这次浏览里打勾是连贯的。 */
  var store = (function () {
    try {
      var t = '__aistudy_probe__';
      localStorage.setItem(t, '1');
      localStorage.removeItem(t);
      return localStorage;
    } catch (e) {
      var mem = {};
      return {
        getItem: function (k) { return Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null; },
        setItem: function (k, v) { mem[k] = String(v); },
        removeItem: function (k) { delete mem[k]; }
      };
    }
  })();

  function readJSON(k, d) {
    try { var v = store.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; }
  }
  function writeJSON(k, v) { try { store.setItem(k, JSON.stringify(v)); } catch (e) { /* 存不下就算了 */ } }

  /* ---------------------------------------------------------------- 配色 */
  var themeBtn = null;

  function currentTheme() {
    var t = store.getItem(THEME_KEY);
    if (t === 'light' || t === 'dark') return t;
    return (window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
  }
  function applyTheme(t) {
    if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
    else document.documentElement.removeAttribute('data-theme');
  }
  function paintThemeButton() {
    if (!themeBtn) return;
    var dark = currentTheme() === 'dark';
    themeBtn.textContent = dark ? '☀ 浅色' : '☾ 深色';
    themeBtn.setAttribute('aria-label', dark ? '切换到浅色配色' : '切换到深色配色');
  }
  function toggleTheme() {
    var next = currentTheme() === 'dark' ? 'light' : 'dark';
    store.setItem(THEME_KEY, next);
    applyTheme(next);
    paintThemeButton();
  }

  /* ------------------------------------------------------------ 搜索索引 */
  var indexState = 'idle';       // idle | loading | ready | failed
  var indexWaiters = [];

  function loadIndex(cb) {
    if (indexState === 'ready') return cb(window.SITE_INDEX);
    if (indexState === 'failed') return cb(null);
    indexWaiters.push(cb);
    if (indexState === 'loading') return;
    indexState = 'loading';
    var s = document.createElement('script');
    s.src = ROOT + 'assets/search-index.js';
    s.onload = function () {
      indexState = window.SITE_INDEX ? 'ready' : 'failed';
      indexWaiters.splice(0).forEach(function (f) { f(window.SITE_INDEX || null); });
    };
    s.onerror = function () {
      indexState = 'failed';
      indexWaiters.splice(0).forEach(function (f) { f(null); });
    };
    document.head.appendChild(s);
  }

  /* 打分：题号精确命中 > 标题 > 章节（标题+摘录）> 位置 > 导语。
     默认要求每个词都在同一页里出现（AND），这样搜「SSE 队列」不会返回一堆只沾一个词的页；
     一个词都凑不齐时才退回 OR，并把结果标成「部分匹配」——总比空手而归强。 */
  var FIELDS = [
    { k: 'q', w: 40, exact: true },   // 题号是精确的，命中就基本是这一页
    { k: 't', w: 12 },
    { k: 'h', w: 7 },
    { k: 'c', w: 4 },
    { k: 'l', w: 2 }
  ];

  function secTitle(x) { return x[1] || ''; }
  function secText(x) { return (x[1] || '') + ' ' + (x[2] || ''); }

  function hay(page, f) {
    if (f.k === 'q') return (page.q || []).join(' ');
    if (f.k === 'h') return (page.h || []).map(secText).join(' ');
    return page[f.k] || '';
  }

  // 命中的那一节（标题优先，其次摘录），用来决定跳到哪个锚点
  function pickSection(page, terms, needAll) {
    var hs = page.h || [], m, t, i;
    for (i = 0; i < hs.length; i++) {
      t = secTitle(hs[i]).toLowerCase();
      if (terms.every(function (x) { return t.indexOf(x) !== -1; })) return hs[i];
    }
    for (i = 0; i < hs.length; i++) {
      t = secText(hs[i]).toLowerCase();
      if (needAll ? terms.every(function (x) { return t.indexOf(x) !== -1; })
                  : terms.some(function (x) { return t.indexOf(x) !== -1; })) return hs[i];
    }
    return null;
  }

  function runSearch(q, needAll) {
    var terms = q.toLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.length) return [];
    var out = [];
    (window.SITE_INDEX || []).forEach(function (page) {
      var score = 0, best = null, hitCount = 0;
      for (var i = 0; i < terms.length; i++) {
        var term = terms[i], hitBest = 0, hitField = null;
        for (var j = 0; j < FIELDS.length; j++) {
          var f = FIELDS[j], text = hay(page, f);
          if (!text || text.toLowerCase().indexOf(term) === -1) continue;
          // 题号要整串相等：「JR-5」不该把「JR-50」也算命中
          var s = f.exact
            ? ((page.q || []).some(function (x) { return x.toLowerCase() === term; }) ? f.w : 0)
            : f.w;
          if (s > hitBest) { hitBest = s; hitField = f.k; }
        }
        if (!hitBest) { if (needAll) return; continue; }
        hitCount++;
        score += hitBest;
        if (!best || hitBest > best.w) best = { w: hitBest, field: hitField };
      }
      if (!hitCount) return;
      if (!needAll) score = hitCount * 100 + score;   // 命中词多的排前面

      // 命中的是章节时，直接把读者送到那一节
      var sec = best && best.field === 'h' ? pickSection(page, terms, needAll) : null;
      out.push({
        page: page, score: score,
        section: sec ? sec[1] : null,
        href: ROOT + page.u + (sec ? '#' + sec[0] : '')
      });
    });
    out.sort(function (a, b) { return b.score - a.score || a.page.t.localeCompare(b.page.t); });
    return out.slice(0, 12);
  }

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function mark(s, terms) {
    var out = esc(s);
    terms.forEach(function (t) {
      if (!t) return;
      var re = new RegExp('(' + t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'ig');
      out = out.replace(re, '<mark>$1</mark>');
    });
    return out;
  }

  /* -------------------------------------------------------------- 搜索面板 */
  var panel = null, input = null, listEl = null, results = [], sel = -1, trigger = null;

  function buildPanel() {
    panel = document.createElement('div');
    panel.className = 'searchpanel';
    panel.hidden = true;
    panel.innerHTML =
      '<div class="searchbox" role="dialog" aria-label="站内搜索">' +
        '<input type="search" autocomplete="off" spellcheck="false" ' +
               'placeholder="搜题号、概念、页面…" aria-label="站内搜索" ' +
               'role="combobox" aria-expanded="false" aria-controls="search-results">' +
        '<div class="search-hint"><span>↑↓ 选择</span><span>回车打开</span><span>Esc 关闭</span></div>' +
        '<ul class="search-results" id="search-results" role="listbox"></ul>' +
      '</div>';
    document.body.appendChild(panel);

    input = panel.querySelector('input');
    listEl = panel.querySelector('.search-results');

    panel.addEventListener('mousedown', function (e) { if (e.target === panel) closeSearch(); });
    input.addEventListener('input', function () { render(input.value); });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
      else if (e.key === 'Enter') { e.preventDefault(); activate(); }
      else if (e.key === 'Escape') { e.preventDefault(); closeSearch(); }
    });
  }

  function openSearch(seed) {
    if (!panel) buildPanel();
    panel.hidden = false;
    document.body.style.overflow = 'hidden';
    if (seed) input.value = seed;
    input.focus();
    input.select();
    input.setAttribute('aria-expanded', 'true');
    loadIndex(function (idx) { render(idx ? input.value : null); });
  }
  function closeSearch() {
    if (!panel || panel.hidden) return;
    panel.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    document.body.style.overflow = '';
    if (trigger) trigger.focus();
  }

  function links() { return listEl.querySelectorAll('a'); }

  function move(d) {
    if (!results.length) return;
    sel = (sel + d + results.length) % results.length;
    paintSel();
  }
  function paintSel() {
    var as = links();
    for (var i = 0; i < as.length; i++) as[i].classList.toggle('sel', i === sel);
    if (as[sel]) as[sel].scrollIntoView({ block: 'nearest' });
  }
  function activate() {
    var as = links();
    var a = as[sel >= 0 ? sel : 0];
    if (a) location.href = a.getAttribute('href');
  }

  function render(q) {
    if (q === null) {
      results = []; sel = -1;
      listEl.innerHTML = '<li><div class="search-empty">搜索索引没加载出来（assets/search-index.js）。' +
        '跑一下 <code>node _dev/build-search.js</code> 重新生成。</div></li>';
      return;
    }
    var terms = q.toLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.length) {
      results = []; sel = -1;
      listEl.innerHTML = '<li><div class="search-empty">输入题号（如 <code>JR-5</code>）、' +
        '概念（如 <code>虚拟滚动</code>）或页面名，都能搜。</div></li>';
      return;
    }
    results = runSearch(q, true);
    var loose = false;
    if (!results.length) { results = runSearch(q, false); loose = results.length > 0; }
    sel = results.length ? 0 : -1;
    if (!results.length) {
      listEl.innerHTML = '<li><div class="search-empty">没搜到「' + esc(q) + '」。' +
        '换个说法试试，或者回 <a href="' + ROOT + 'index.html">总入口</a> 按目录找。</div></li>';
      return;
    }
    listEl.innerHTML = (loose
        ? '<li><div class="search-empty">没找到同时讲这几个词的页，下面是把其中一部分讲到的：</div></li>'
        : '') +
      results.map(function (r) {
        var page = r.page;
        var sub = r.section
          ? '<span class="r-s">→ ' + mark(r.section, terms) + '</span><span class="r-where">本页章节</span>'
          : '<span class="r-s">' + mark(page.c || page.u, terms) + '</span>';
        return '<li role="option"><a href="' + esc(r.href) + '">' +
          '<span class="r-t">' + mark(page.t, terms) + '</span>' + sub + '</a></li>';
      }).join('');
    paintSel();
  }

  /* -------------------------------------------------------------- 顶栏工具 */
  function buildTools() {
    var bar = document.querySelector('header.topbar');
    if (!bar || bar.querySelector('.tools')) return;

    var tools = document.createElement('div');
    tools.className = 'tools';

    trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.innerHTML = '🔍 搜索 <span class="kbd">/</span>';
    trigger.setAttribute('aria-label', '打开站内搜索');
    trigger.addEventListener('click', function () { openSearch(''); });

    themeBtn = document.createElement('button');
    themeBtn.type = 'button';
    themeBtn.addEventListener('click', toggleTheme);

    tools.appendChild(trigger);
    tools.appendChild(themeBtn);
    bar.appendChild(tools);
    paintThemeButton();
  }

  /* ---------------------------------------------------------------- 清单 */
  function hash(s) {
    var h = 5381;
    for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
    return h.toString(36);
  }

  function itemId(li) {
    // 带题号的那份清单在 questions.html（242 条）。题号是稳定的 id：那份清单是由
    // plan/questions.md 生成的，条目会随源文件增删改序，而题号不会——用题号做 key，
    // 重新生成之后原先的勾还在原来那道题上。
    // 其余 13 页的 76 条「完成标志」只有文字，就用文字哈希——文字改了就当新的一项，
    // 旧勾留着不碍事。（材料页没有 .checklist，它的页尾是 .recall 回忆卡。）
    var code = li.querySelector('code');
    if (code) {
      var t = code.textContent.trim();
      if (QID.test(t)) return 'q:' + t;
    }
    return 'h:' + hash(li.textContent.replace(/\s+/g, ' ').trim());
  }

  /* 「文字改了就当新的一项」有个代价：id 变了，老勾就静默消失。
     平时无所谓（改的是措辞，那道题本来也不一样了），但 v2 把计划的一节重编号
     （§4 数字题 → §3），挂在完成标志上的那条「第 4 节数字表…」跟着改了字，
     于是它成了唯一一条会被清掉的老勾。这里一次性把老 key 改写成新 key。
     这是一次迁移、不是机制：绑定的是那两个具体哈希，等旧版页面不再有人用就可以删。 */
  var LEGACY_CK_IDS = { 'h:168k9l8': 'h:1wl79ij' };

  function migrateChecklist(all) {
    var moved = 0;
    Object.keys(LEGACY_CK_IDS).forEach(function (old) {
      if (all[old] === undefined) return;
      if (all[LEGACY_CK_IDS[old]] === undefined) all[LEGACY_CK_IDS[old]] = all[old];
      delete all[old];
      moved++;
    });
    return moved;
  }

  function setupChecklist(ul, all) {
    var items = [];
    for (var j = 0; j < ul.children.length; j++) {
      if (ul.children[j].tagName === 'LI') items.push(ul.children[j]);
    }
    if (!items.length) return;

    var bar = document.createElement('div');
    bar.className = 'ck-bar';
    var label = document.createElement('span');
    var track = document.createElement('span');
    track.className = 'ck-track';
    var fill = document.createElement('span');
    fill.className = 'ck-fill';
    track.appendChild(fill);
    var reset = document.createElement('button');
    reset.type = 'button';
    reset.textContent = '重置';
    reset.hidden = true;
    bar.appendChild(label); bar.appendChild(track); bar.appendChild(reset);
    ul.parentNode.insertBefore(bar, ul);

    var ids = [];
    items.forEach(function (li) {
      var id = itemId(li);
      ids.push(id);
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'ck';
      b.setAttribute('aria-label', '标记这段已掌握');
      b.setAttribute('aria-pressed', 'false');
      b.addEventListener('click', function () { toggle(li, b, id); });
      li.insertBefore(b, li.firstChild);
      if (all[id]) { li.classList.add('done'); b.setAttribute('aria-pressed', 'true'); }
    });
    ul.classList.add('live');

    function paint() {
      var n = 0;
      items.forEach(function (li) { if (li.classList.contains('done')) n++; });
      label.textContent = '已掌握 ' + n + '/' + ids.length;
      fill.style.width = (ids.length ? (n / ids.length * 100) : 0) + '%';
      reset.hidden = n === 0;
    }
    function toggle(li, b, id) {
      var on = !li.classList.contains('done');
      li.classList.toggle('done', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
      if (on) all[id] = 1; else delete all[id];
      writeJSON(CK_KEY, all);
      paint();
    }
    reset.addEventListener('click', function () {
      items.forEach(function (li) {
        li.classList.remove('done');
        var b = li.querySelector('.ck');
        if (b) b.setAttribute('aria-pressed', 'false');
        delete all[itemId(li)];
      });
      writeJSON(CK_KEY, all);
      paint();
    });
    paint();
  }

  function setupChecklists() {
    var lists = document.querySelectorAll('.checklist');
    if (!lists.length) return;
    var all = readJSON(CK_KEY, {});
    if (migrateChecklist(all)) writeJSON(CK_KEY, all);
    for (var i = 0; i < lists.length; i++) setupChecklist(lists[i], all);
  }

  /* ------------------------------------------------------ 右下角浮层按钮 */
  function setupFloaters() {
    var details = document.querySelectorAll('details');
    var wrap = document.createElement('div');
    wrap.className = 'floaters';

    if (details.length >= 5) {
      var expand = document.createElement('button');
      expand.type = 'button';
      var allOpen = function () {
        for (var i = 0; i < details.length; i++) if (!details[i].open) return false;
        return true;
      };
      var paint = function () { expand.textContent = allOpen() ? '收起全部' : '展开全部'; };
      expand.addEventListener('click', function () {
        var to = !allOpen();
        for (var i = 0; i < details.length; i++) details[i].open = to;
        paint();
      });
      for (var i = 0; i < details.length; i++) details[i].addEventListener('toggle', paint);
      paint();
      wrap.appendChild(expand);
    }

    var top = document.createElement('button');
    top.type = 'button';
    top.textContent = '↑ 回到顶部';
    top.hidden = true;
    top.addEventListener('click', function () { window.scrollTo({ top: 0, behavior: 'smooth' }); });
    wrap.appendChild(top);
    document.body.appendChild(wrap);

    var onScroll = function () { top.hidden = (window.scrollY || window.pageYOffset || 0) < 400; };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  /* ------------------------------------------------------------ 顶栏高度 */
  /* --topbar-h 是锚点落点的唯一依据（html{scroll-padding-top} 和侧栏粘顶都用它），
     而顶栏到底几行取决于 crumb 有多长 + 视口多窄，写死的值必然有页面兜不住。
     这里量一次真高写回去：CSS 里那两档静态值留给没 JS 的情况，有 JS 就以实测为准。
     （实测过：360px 宽、crumb 长的页面上，顶栏会折成两行从 72px 涨到 94px，
      静态值不够用，锚点会被盖住 1px。） */
  function measureTopbar() {
    var bar = document.querySelector('header.topbar');
    if (!bar) return;
    var h = Math.round(bar.getBoundingClientRect().height);
    if (h > 0) document.documentElement.style.setProperty('--topbar-h', h + 'px');
  }

  /* 带上 #锚点 打开时，浏览器是在 app.js 跑之前就跳好的，用的是 CSS 里那档静态值。
     量完真高之后如果发现目标被顶栏盖住了，就用新的间距重跳一次（只补这一种情况，
     正常浏览时它什么都不做）。 */
  function fixHashLanding() {
    if (!location.hash) return;
    var t = document.getElementById(decodeURIComponent(location.hash.slice(1)));
    var bar = document.querySelector('header.topbar');
    if (!t || !bar) return;
    if (t.getBoundingClientRect().top >= bar.getBoundingClientRect().bottom) return;
    var prev = document.documentElement.style.scrollBehavior;
    document.documentElement.style.scrollBehavior = 'auto';
    t.scrollIntoView();
    document.documentElement.style.scrollBehavior = prev;
  }

  function watchTopbar() {
    var queued = false;
    var again = function () {
      if (queued) return;
      queued = true;
      requestAnimationFrame(function () { queued = false; measureTopbar(); });
    };
    window.addEventListener('resize', again);
    // 字体晚一步落地时 crumb 会换行，高度跟着变
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { measureTopbar(); });
  }

  /* ------------------------------------------------------------ 快捷键 */
  function setupKeys() {
    document.addEventListener('keydown', function (e) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      var t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (e.key === '/') { e.preventDefault(); openSearch(''); }
    });
  }

  /* --------------------------------------------------------------- 启动 */
  function boot() {
    // 给 <main> 补个 id，顶栏那个「跳到正文」才有落点
    // （正常由 _dev/apply-nav.js 静态写好，这里只是兜底）
    var m = document.querySelector('main');
    if (m && !m.id) m.id = 'main';
    buildTools();
    setupChecklists();
    setupFloaters();
    setupKeys();
    measureTopbar();
    fixHashLanding();
    watchTopbar();
  }

  applyTheme(store.getItem(THEME_KEY));
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
