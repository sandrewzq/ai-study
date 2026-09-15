/* 布局探针（开发用，不影响阅读）
 * 用途：在看不到渲染结果的情况下，用几何测量代替肉眼检查。
 * 用法：把本文件用 <script src="_probe.js"></script> 引入任一材料页的 </main> 之后，
 *       再用无头浏览器 --dump-dom 打开，页面底部会输出一段 ===LAYOUT=== 报告，包含：
 *       · 流式管道是否换行   · 页面是否横向溢出
 *       · SVG 文字是否越出 viewBox / 宽于所在盒子 / 互相重叠
 *       · 比例条的实际渲染占比
 */
window.addEventListener('load', function () {
  var R = []; function push(s){ R.push(s); }
  document.querySelectorAll('.pipeline').forEach(function (p, i) {
    var nodes = [].slice.call(p.querySelectorAll('.node'));
    var tops = new Set(nodes.map(function(n){ return Math.round(n.getBoundingClientRect().top); }));
    push('pipeline#' + i + ': 节点' + nodes.length + ' 行数=' + tops.size + (tops.size === 1 ? '  OK' : '  >>> 换行了'));
  });
  var de = document.documentElement;
  push('横向: scrollWidth=' + de.scrollWidth + ' clientWidth=' + de.clientWidth + (de.scrollWidth <= de.clientWidth + 1 ? '  OK' : '  >>> 溢出'));
  document.querySelectorAll('svg.svgfig').forEach(function (s, i) {
    var vb = s.viewBox.baseVal;
    var texts = [].slice.call(s.querySelectorAll('text'));
    var rects = [].slice.call(s.querySelectorAll('rect'));
    var oob = 0, over = 0, lap = 0, msg = [], boxes = [];
    texts.forEach(function (t) {
      var b = t.getBBox(); boxes.push({ t: t, b: b });
      if (b.x < vb.x - 1 || b.x + b.width > vb.x + vb.width + 1 || b.y < vb.y - 1 || b.y + b.height > vb.y + vb.height + 1) {
        oob++; msg.push('   越出 viewBox: "' + t.textContent + '"');
      }
    });
    boxes.forEach(function (o) {
      var cx = o.b.x + o.b.width / 2, cy = o.b.y + o.b.height / 2;
      rects.forEach(function (r) {
        var rb = r.getBBox();
        if (cx > rb.x && cx < rb.x + rb.width && cy > rb.y && cy < rb.y + rb.height) {
          if (o.b.width > rb.width + 1) { over++; msg.push('   文字宽于盒子: "' + o.t.textContent + '" 字' + (o.b.width|0) + ' > 盒' + (rb.width|0)); }
          if (o.b.height > rb.height + 1) { over++; msg.push('   文字高于盒子: "' + o.t.textContent + '"'); }
        }
      });
    });
    var rectsScreen = boxes.map(function(o){ return o.t.getBoundingClientRect(); });
    for (var a = 0; a < boxes.length; a++) for (var c = a + 1; c < boxes.length; c++) {
      var A = rectsScreen[a], B = rectsScreen[c];
      if (A.x < B.x + B.width - 1 && B.x < A.x + A.width - 1 && A.y < B.y + B.height - 1 && B.y < A.y + A.height - 1) {
        lap++; msg.push('   文字重叠: "' + boxes[a].t.textContent + '" × "' + boxes[c].t.textContent + '"');
      }
    }
    push('svg#' + i + ' viewBox=' + vb.width + 'x' + vb.height + ' 文字' + texts.length + ' 越界=' + oob + ' 超盒=' + over + ' 重叠=' + lap + ((oob + over + lap) === 0 ? '  OK' : '  >>> 检查'));
    msg.slice(0, 10).forEach(push);
  });
  document.querySelectorAll('.dilute .bar').forEach(function (b, i) {
    var seg = b.querySelector('.seg');
    var w = seg ? seg.getBoundingClientRect().width : 0, W = b.getBoundingClientRect().width;
    push('比例条#' + i + ': 实际占比=' + (W ? (w / W * 100).toFixed(1) : 0) + '%');
  });
  var pre = document.createElement('pre');
  pre.id = 'LAYOUT_REPORT';
  pre.textContent = '===LAYOUT===' + R.join(' ||| ') + '===END===';
  document.body.appendChild(pre);
});
