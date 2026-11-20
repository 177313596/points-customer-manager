'use strict';
/* 液态玻璃视觉验证：给登录页塞一张斜条纹背景，分别截 开 / 关 液态玻璃 的使用声明卡，
   看玻璃后面的条纹是否被折射弯折。 */
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

app.setPath('userData', path.join(os.tmpdir(), 'pm-glass-shot-' + Date.now()));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/* 生成一张斜条纹测试图（模拟真实背景图的高频细节） */
function makeStripePng(target) {
  const { execFileSync } = require('child_process');
  const ps = `
Add-Type -AssemblyName System.Drawing
$bmp = New-Object System.Drawing.Bitmap 900,600
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.Clear([System.Drawing.Color]::FromArgb(246,240,228))
$pen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(24,110,102)), 26
for ($i=-400; $i -lt 1000; $i+=70) { $g.DrawLine($pen, $i, 0, $i+600, 600) }
$pen2 = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(170,120,250,210)), 22
for ($i=-400; $i -lt 1000; $i+=70) { $g.DrawLine($pen2, $i+24, 0, $i+624, 600) }
$bmp.Save('${target.replace(/\\/g, '\\\\')}', [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose(); $bmp.Dispose()
`;
  execFileSync('pwsh', ['-NoProfile', '-NonInteractive', '-Command', ps], { stdio: 'ignore' });
}

app.whenReady().then(async () => {
  const bgFile = path.join(os.tmpdir(), 'pm-glass-stripes.png');
  makeStripePng(bgFile);
  const bgUrl = 'file:///' + bgFile.replace(/\\/g, '/');

  const ok = (data) => ({ ok: true, data });
  let liquid = true;
  const status = () => ok({
    hasPassword: true, username: '管理员', shop_name: '积分客户管理系统', version: '1.1.2',
    login_bg: bgUrl, login_bgs: [bgUrl], theme: { accent: '#0F766E' }, terms_accepted: '', login_bg_rotate: false,
    ui_mode: 'standard', liquid_glass: liquid, op_required: false,
  });
  ipcMain.handle('auth:status', status);
  ipcMain.handle('settings:get', status);
  ipcMain.handle('settings:set-liquid-glass', (_e, p) => { liquid = !!(p && p.on); return ok({ liquid_glass: liquid }); });

  const win = new BrowserWindow({
    show: false, width: 1360, height: 860,
    webPreferences: { preload: path.join(__dirname, '..', 'electron', 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: false },
  });
  try { await win.loadFile(path.join(__dirname, '..', 'dist', 'index.html')); } catch (e) {}
  win.webContents.focus();
  await wait(1600);

  const flags = () => win.webContents.executeJavaScript(
    "JSON.stringify({liquid:document.body.classList.contains('ui-liquid'),lite:document.body.classList.contains('ui-lite'),filter:getComputedStyle(document.querySelector('.terms-card')||document.body).backdropFilter})"
  );
  fs.writeFileSync(path.join(os.tmpdir(), 'pm-glass-flags.txt'), await flags());

  const shot = async (tag) => {
    await win.webContents.capturePage();           // 先丢一帧，等合成器把新样式刷上去
    await wait(1200);
    const r = await win.webContents.executeJavaScript(`(() => { const el=document.querySelector('.terms-card'); if(!el) return null; const b=el.getBoundingClientRect(); return JSON.stringify([Math.round(b.left),Math.round(b.top),Math.round(b.width),Math.round(b.height)]); })()`);
    if (!r) return;
    const [x, y, w, h] = JSON.parse(r);
    const img = await win.webContents.capturePage({ x, y, width: w, height: h });
    fs.writeFileSync(path.join(os.tmpdir(), 'pm-glass-' + tag + '.png'), img.toPNG());
  };

  await shot('on');

  // 关掉液态玻璃再截一张
  await win.webContents.executeJavaScript("document.body.classList.remove('ui-liquid')");
  await wait(300);
  await shot('off');
  fs.writeFileSync(path.join(os.tmpdir(), 'pm-glass-flags2.txt'), await flags());
  app.exit(0);
});
