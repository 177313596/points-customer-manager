'use strict';
/* 有背景图时的观感：磨砂玻璃要能"透出"背景的模糊色块
   顺带截：登录页 / 工作台（悬停） / 顾客管理（大表格卡） / 设置页。
   临时 userData，不碰真实数据。产出 %TEMP%\cards-page-*.png */
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execFileSync } = require('child_process');

app.setName('pm-cards-pages');
app.setPath('userData', path.join(os.tmpdir(), 'pm-cards-pages-' + Date.now()));
require(path.join(__dirname, '..', 'electron', 'main.js'));

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const shot = (win, name) => win.webContents.capturePage().then((img) => {
  const p = path.join(os.tmpdir(), name);
  fs.writeFileSync(p, img.toPNG());
  return p;
});

/* 一张"照片感"的测试背景：斜向大色块 + 圆形光斑，用来检验磨砂是否真的把背景糊开 */
function makeBg(target) {
  const ps = `
Add-Type -AssemblyName System.Drawing
$bmp = New-Object System.Drawing.Bitmap 1200,800
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = 'AntiAlias'
$g.Clear([System.Drawing.Color]::FromArgb(30,58,72))
$c1 = New-Object System.Drawing.Drawing2D.LinearGradientBrush ([System.Drawing.Point]::new(0,0)),([System.Drawing.Point]::new(1200,800)),([System.Drawing.Color]::FromArgb(38,92,120)),([System.Drawing.Color]::FromArgb(120,196,176))
$g.FillRectangle($c1,0,0,1200,800)
$solid = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(90,250,205,150))
$g.FillEllipse($solid, 760, -120, 620, 620)
$solid2 = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(70,150,220,255))
$g.FillEllipse($solid2, -180, 480, 560, 560)
$solid3 = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(60,255,255,255))
$g.FillEllipse($solid3, 240, 120, 340, 340)
$bmp.Save('${target.replace(/\\/g, '\\\\')}', [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose(); $bmp.Dispose(); $c1.Dispose();
`;
  execFileSync('pwsh', ['-NoProfile', '-NonInteractive', '-Command', ps], { stdio: 'ignore' });
}

app.whenReady().then(async () => {
  await wait(1500);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) { console.log('NO-WINDOW'); app.exit(2); return; }
  win.setContentSize(1360, 860);

  const bgFile = path.join(os.tmpdir(), 'pm-cards-bg.png');
  makeBg(bgFile);
  const bgData = 'data:image/png;base64,' + fs.readFileSync(bgFile).toString('base64');

  const until = async (expr, label, timeout = 12000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) {
      const ok = await win.webContents.executeJavaScript(`!!(${expr})`).catch(() => false);
      if (ok) return true;
      await wait(250);
    }
    console.log('timeout waiting for ' + label);
    return false;
  };

  const done = await win.webContents.executeJavaScript(`
    (async () => {
      const api = window.api;
      await api.setup('pass123', '', '管理员');
      await api.acceptTerms(new Date().toISOString());
      await api.login('管理员', 'pass123');
      const b = await api.settings.addLoginBg(${JSON.stringify(bgData)});
      await api.logout();
      return JSON.stringify({ bg: b.ok });
    })()
  `).catch((e) => 'ERR:' + e.message);
  console.log('seed:', done);
  win.reload();
  await until(`document.querySelector('.login-card input')`, 'login card');
  await wait(1400);
  console.log('shot login:', await shot(win, 'cards-page-01-login.png'));

  const logged = await win.webContents.executeJavaScript(`
    (() => {
      const setVal = (el, v) => { const d = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value'); d.set.call(el,v); el.dispatchEvent(new Event('input',{bubbles:true})); };
      const ins = [...document.querySelectorAll('.login-card input')];
      setVal(ins[0], '管理员'); setVal(ins[1], 'pass123');
      [...document.querySelectorAll('.login-card button')].find(b => b.textContent.includes('进入系统')).click();
      return 'ok';
    })()
  `).catch((e) => 'err ' + e.message);
  console.log('login:', logged);
  await until(`document.querySelector('.nav-pill')`, 'nav pill');
  await wait(1000);

  /* 工作台：悬停到"积分"卡片右下 */
  const r1 = JSON.parse(await win.webContents.executeJavaScript(`
    (() => { const c = [...document.querySelectorAll('.card')][0]; const r = c.getBoundingClientRect(); return JSON.stringify([Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)]); })()
  `));
  const hx = Math.round(r1[0] + r1[2] * 0.7), hy = Math.round(r1[1] + r1[3] * 0.66);
  win.webContents.sendInputEvent({ type: 'mouseMove', x: hx, y: hy });
  await wait(80);
  win.webContents.sendInputEvent({ type: 'mouseMove', x: hx + 4, y: hy + 3 });
  await wait(500);
  console.log('shot dash:', await shot(win, 'cards-page-02-dash-hover.png'));

  /* 顾客管理：大表格卡 */
  await win.webContents.executeJavaScript(`
    (() => { [...document.querySelectorAll('.nav-item')].find(b => b.textContent.includes('顾客管理')).click(); return 'ok'; })()
  `);
  await wait(900);
  const r2 = JSON.parse(await win.webContents.executeJavaScript(`
    (() => { const c = document.querySelector('.card'); const r = c.getBoundingClientRect(); return JSON.stringify([Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)]); })()
  `));
  win.webContents.sendInputEvent({ type: 'mouseMove', x: Math.round(r2[0] + r2[2] * 0.55), y: Math.round(r2[1] + 40) });
  await wait(500);
  console.log('shot customers:', await shot(win, 'cards-page-03-customers.png'));

  /* 设置页：二级栏目卡 + 表单卡 */
  await win.webContents.executeJavaScript(`
    (() => { [...document.querySelectorAll('.nav-item')].find(b => b.textContent.includes('设置')).click(); return 'ok'; })()
  `);
  await wait(1000);
  const set = await win.webContents.executeJavaScript(`
    (() => {
      const n = document.querySelector('.set-nav');
      if (!n) return 'missing';
      const r = n.getBoundingClientRect();
      const cs = getComputedStyle(n);
      return JSON.stringify({ rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)], blur: (cs.backdropFilter || '').slice(0, 26) });
    })()
  `).catch((e) => 'err ' + e.message);
  console.log('set-nav:', set);
  win.webContents.sendInputEvent({ type: 'mouseMove', x: 430, y: 320 });
  await wait(500);
  console.log('shot settings:', await shot(win, 'cards-page-04-settings.png'));

  setTimeout(() => { win.destroy(); app.exit(0); }, 200);
}).catch((e) => { console.log('ERROR', e && e.stack); app.exit(2); });
