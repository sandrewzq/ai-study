// 渲染校验：桌面 / 平板 / 手机三个视口下检查样式加载、布局与横向溢出
// 代码块（pre）自带 overflow-x:auto，内部横滚是预期行为，不计入溢出
const fs = require('fs'), path = require('path'), os = require('os');
const { execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..');
const SHELL = path.join(os.homedir(),
  'Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-arm64/chrome-headless-shell');

// 自动发现所有页面（新加材料不用改这个列表）
const PAGES = [];
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    if (e.name.startsWith('.')) continue;
    const p = path.join(d, e.name);
    if (e.isDirectory()) { if (!['_dev', 'notes', 'plan', 'node_modules', '.git'].includes(e.name)) walk(p); }
    else if (e.name.endsWith('.html')) PAGES.push(path.relative(ROOT, p));
  }
})(ROOT);
PAGES.sort();
const SIZES = [[1440, 900], [768, 1024], [360, 800]];

const PROBE = `<script>
window.addEventListener('load',function(){
  var vw=document.documentElement.clientWidth, de=document.documentElement;
  function clipped(el){
    for(var p=el.parentElement;p&&p!==document.body;p=p.parentElement){
      var ov=getComputedStyle(p).overflowX;
      if(ov==='auto'||ov==='scroll'||ov==='hidden')return true;
    }
    return false;
  }
  var bad=[];
  document.querySelectorAll('body *').forEach(function(el){
    var r=el.getBoundingClientRect();
    if(r.width>0 && r.right>vw+1 && !clipped(el))
      bad.push(el.tagName+(el.className?'.'+String(el.className).split(' ')[0]:''));
  });
  var L=document.querySelector('.layout');
  var o=['视口='+vw,
    '页面溢出='+(de.scrollWidth>vw+1?('是 '+de.scrollWidth+'>'+vw):'否'),
    '.layout='+(L?getComputedStyle(L).display:'无'),
    '清单项='+document.querySelectorAll('.checklist li').length,
    '表格='+document.querySelectorAll('table').length,
    '未裁剪溢出='+(bad.length?bad.slice(0,3).join(','):'无')];
  var p=document.createElement('pre');p.id='R';p.textContent=o.join(' | ');
  document.body.appendChild(p);
});
</script>`;

let fail = 0;
for (const rel of PAGES) {
  const src = path.join(ROOT, rel);
  const tmp = path.join(path.dirname(src), '__rendertest.html');
  fs.writeFileSync(tmp, fs.readFileSync(src, 'utf8').replace('</body>', PROBE + '</body>'));
  const lines = [];
  for (const [w, h] of SIZES) {
    const out = execFileSync(SHELL, ['--no-sandbox', '--in-process-gpu', `--window-size=${w},${h}`,
      '--virtual-time-budget=1500', '--dump-dom', 'file://' + tmp],
      { encoding: 'utf8', maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'ignore'] });
    const m = out.match(/<pre id="R">([\s\S]*?)<\/pre>/);
    const r = m ? m[1].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>') : '无报告';
    const bad = /页面溢出=是|\.layout=block|未裁剪溢出=(?!无)/.test(r);
    if (bad) fail++;
    lines.push(`      ${bad ? '✗' : '✓'} @${w}  ${r}`);
  }
  fs.rmSync(tmp, { force: true });
  console.log(`  ${rel}`);
  lines.forEach(l => console.log(l));
}
console.log(fail ? `\n✗ ${fail} 项异常` : `\n✓ ${PAGES.length} 个页面 × ${SIZES.length} 个视口，全部通过`);
process.exit(fail ? 1 : 0);
