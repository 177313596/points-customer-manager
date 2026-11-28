'use strict';
/* 验证：倾斜幅度上限、主色统计卡的光斑、简洁版降级观感 */
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

app.setName('pm-tilt-extremes');
app.setPath('userData', path.join(os.tmpdir(), 'pm-tilt-' + Date.now()));
require(path.join(__dirname, '..', 'electron', 'main.js'));

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const shot = (win, name) => win.webContents.capturePage().then((img) => {
  const p = path.join(os.tmpdir(), name);
  fs.writeFileSync(p, img.toPNG());
  return p;
});

app.whenReady().then(async () => {
  await wait(1500);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) { console.log('NO-WINDOW'); app.exit(2); return; }
  win.setContentSize(1360, 860);
  const until = async (expr, label, timeout = 12000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) {
      const ok = await win.webContents.executeJavaScript(`!!(${expr})`).catch(() => false);
      if (ok) return true;
      await wait(250);
    }
    console.log('timeout ' + label); return false;
  };

  await win.webContents.executeJavaScript(`
    (async () => { await window.api.setup('pass123','','管理员'); await window.api.acceptTerms(new Date().toISOString()); return true; })()
  `).catch(() => { });
  win.reload();
  await until(`document.querySelector('.login-card input')`, 'login card');
  await win.webContents.executeJavaScript(`
    (() => {
      const setVal = (el, v) => { const d = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value'); d.set.call(el,v); el.dispatchEvent(new Event('input',{bubbles:true})); };
      const ins = [...document.querySelectorAll('.login-card input')];
      setVal(ins[0], '管理员'); setVal(ins[1], 'pass123');
      [...document.querySelectorAll('.login-card button')].find(b => b.textContent.includes('进入系统')).click();
    })()
  `);
  await until(`document.querySelector('.nav-pill')`, 'nav pill');
  await wait(800);

  const rect = JSON.parse(await win.webContents.executeJavaScript(`
    (() => { const c = [...document.querySelectorAll('.card')][0]; const r = c.getBoundingClientRect(); return JSON.stringify([r.left, r.top, r.width, r.height]); })()
  `));
  const [L, T, W, H] = rect;
  const vars = () => win.webContents.executeJavaScript(`
    (() => { const c = [...document.querySelectorAll('.card')][0]; return c.style.getPropertyValue('--tx') + '/' + c.style.getPropertyValue('--ty'); })()
  `);

  // 右边缘 → 绕 Y 轴到上限
  win.webContents.sendInputEvent({ type: 'mouseMove', x: Math.round(L + W - 3), y: Math.round(T + H / 2) });
  await wait(420);
  console.log('右边缘 tilt(--tx/--ty):', await vars());

  // 下边缘 → 绕 X 轴到上限
  win.webContents.sendInputEvent({ type: 'mouseMove', x: Math.round(L + W / 2), y: Math.round(T + H - 4) });
  await wait(420);
  console.log('下边缘 tilt(--tx/--ty):', await vars());

  // 左上角 → 两个轴都到负上限
  win.webContents.sendInputEvent({ type: 'mouseMove', x: Math.round(L + 4), y: Math.round(T + 4) });
  await wait(420);
  console.log('左上角 tilt(--tx/--ty):', await vars());

  // 主色统计卡：白色光斑在深青底上应有的强度
  const prim = JSON.parse(await win.webContents.executeJavaScript(`
    (() => { const el = document.querySelector('.stat-card.primary'); const r = el.getBoundingClientRect(); window.__p = el; return JSON.stringify([Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)]); })()
  `));
  win.webContents.sendInputEvent({ type: 'mouseMove', x: prim[0] + Math.round(prim[2] * 0.62), y: prim[1] + Math.round(prim[3] * 0.5) });
  await wait(80);
  win.webContents.sendInputEvent({ type: 'mouseMove', x: prim[0] + Math.round(prim[2] * 0.62) + 2, y: prim[1] + Math.round(prim[3] * 0.5) + 2 });
  await wait(480);
  const primInfo = await win.webContents.executeJavaScript(`
    (() => {
      const el = window.__p;
      return JSON.stringify({ cls: el.className, before: getComputedStyle(el, '::before').opacity, after: getComputedStyle(el, '::after').opacity, mx: el.style.getPropertyValue('--mx'), tx: el.style.getPropertyValue('--tx') });
    })()
  `).catch((e) => 'err ' + e.message);
  console.log('主色统计卡: ' + primInfo);
  console.log('shot primary:', await shot(win, 'tilt-01-primary.png'));

  // 简洁版：实体卡、无光斑、无倾斜
  await win.webContents.executeJavaScript(`document.body.classList.add('ui-lite')`).catch(() => { });
  await wait(600);
  console.log('shot lite:', await shot(win, 'tilt-02-lite.png'));
  await win.webContents.executeJavaScript(`document.body.classList.remove('ui-lite')`).catch(() => { });

  setTimeout(() => { win.destroy(); app.exit(0); }, 200);
}).catch((e) => { console.log('ERROR', e && e.stack); app.exit(2); });
