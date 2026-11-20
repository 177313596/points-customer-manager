'use strict';
/* 验证 Electron(Chromium) 的 backdrop-filter 是否支持 url(#svg滤镜) 折射，
   以便决定“液态玻璃”用真折射还是用 模糊+高光 近似 */
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

app.setPath('userData', path.join(os.tmpdir(), 'pm-glass-probe-' + Date.now()));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
body{margin:0;font-family:Segoe UI;background:#fff}
.wrap{position:relative;height:520px;width:900px;
  background-image:repeating-linear-gradient(45deg,#0F766E 0 18px,#F6E7C1 18px 36px),repeating-linear-gradient(-45deg,rgba(0,0,0,.25) 0 6px,transparent 6px 18px);
  background-blend-mode:multiply;}
.panel{position:absolute;top:40px;width:240px;height:170px;border-radius:22px;border:1px solid rgba(255,255,255,.6);
  background:rgba(255,255,255,.28);box-shadow:0 12px 40px rgba(0,0,0,.28);
  display:grid;place-items:center;color:#06231F;font-weight:700;font-size:14px;}
.p1{left:20px}
.p2{left:300px; backdrop-filter: blur(10px);}
.p3{left:580px; backdrop-filter: url(#wave);}
</style></head><body>
<svg width="0" height="0" style="position:absolute"><defs>
<filter id="wave" x="-20%" y="-20%" width="140%" height="140%" color-interpolation-filters="sRGB">
  <feTurbulence type="fractalNoise" baseFrequency="0.008 0.012" numOctaves="2" seed="7" result="noise"/>
  <feGaussianBlur in="noise" stdDeviation="3" result="soft"/>
  <feDisplacementMap in="SourceGraphic" in2="soft" scale="60" xChannelSelector="R" yChannelSelector="G"/>
</filter>
</defs></svg>
<div class="wrap">
  <div class="panel p1">无效果</div>
  <div class="panel p2">blur(10px)</div>
  <div class="panel p3">url(#wave)</div>
</div>
</body></html>`;

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, width: 940, height: 600, webPreferences: { offscreen: true } });
  const file = path.join(os.tmpdir(), 'pm-glass-probe.html');
  fs.writeFileSync(file, html);
  await win.loadFile(file);
  await wait(900);
  const shot = await win.webContents.capturePage({ x: 0, y: 0, width: 900, height: 320 });
  fs.writeFileSync(path.join(os.tmpdir(), 'pm-glass-probe.png'), shot.toPNG());
  const computed = await win.webContents.executeJavaScript(`
    JSON.stringify({
      p2: getComputedStyle(document.querySelector('.p2')).backdropFilter,
      p3: getComputedStyle(document.querySelector('.p3')).backdropFilter,
      p3support: CSS.supports('backdrop-filter', 'url(#wave)'),
    })
  `);
  fs.writeFileSync(path.join(os.tmpdir(), 'pm-glass-probe.txt'), computed);
  app.exit(0);
});
