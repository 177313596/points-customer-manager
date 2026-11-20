'use strict';
/* 截图：设置页「视觉效果 -> 液态玻璃效果」开关（开 / 简洁版强制关闭）
   产出：%TEMP%\pm-liquid-settings-on.png、%TEMP%\pm-liquid-settings-lite.png */
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

const TMP = path.join(os.tmpdir(), 'pm-liquid-shot-' + Date.now());
app.setName('pm-liquid-shot');
app.setPath('userData', TMP);
require(path.join(__dirname, '..', 'electron', 'main.js'));

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const shot = async (win, name) => {
  await wait(1200); // 丢掉首帧，避免截到 splash 残影
  const img = await win.webContents.capturePage();
  const p = path.join(os.tmpdir(), name);
  fs.writeFileSync(p, img.toPNG());
  return p;
};

async function login(win) {
  await win.webContents.executeJavaScript(`
    (() => {
      const setVal = (el, v) => {
        const d = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
        d.set.call(el, v);
        el.dispatchEvent(new Event('input', { bubbles: true }));
      };
      const inputs = [...document.querySelectorAll('.login-card input')];
      setVal(inputs[0], '管理员');
      setVal(inputs[1], 'pass123');
      const btn = [...document.querySelectorAll('.login-card button')].find(b => b.textContent.includes('进入系统'));
      btn.click();
    })()
  `).catch(() => { });
  await wait(2400);
}

async function openAppearance(win) {
  await win.webContents.executeJavaScript(`
    (() => {
      const nav = [...document.querySelectorAll('.nav-item')].find(n => n.textContent.includes('设置'));
      if (nav) nav.click();
    })()
  `);
  await wait(1200);
  await win.webContents.executeJavaScript(`
    (() => {
      const t = [...document.querySelectorAll('.set-nav-item')].find(n => n.textContent.includes('外观'));
      if (t) t.click();
    })()
  `);
  await wait(900);
  await win.webContents.executeJavaScript(`
    (() => {
      const pane = document.querySelector('.set-pane');
      const sec = [...document.querySelectorAll('section, .section, .set-section')]
        .find(s => s.textContent.includes('液态玻璃效果'));
      if (sec && sec.scrollIntoView) sec.scrollIntoView({ block: 'center' });
      else if (pane) pane.scrollTop = pane.scrollHeight;
      return !!(sec || pane);
    })()
  `);
  await wait(600);
}

app.whenReady().then(async () => {
  await wait(1500);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) { console.log('NO-WINDOW'); app.exit(2); return; }
  win.setContentSize(1360, 860);

  await win.webContents.executeJavaScript(`
    (async () => {
      await window.api.setup('pass123', 'op456', '管理员');
      await window.api.acceptTerms(new Date().toISOString());
      return true;
    })()
  `).catch(() => { });
  win.reload();
  await wait(2200);
  await login(win);
  await openAppearance(win);

  const onInfo = await win.webContents.executeJavaScript(`
    JSON.stringify({
      liquid: window.api ? true : false,      bodyClass: document.body.className,
      switchOn: !!document.querySelector('.rule-line .switch.on')
    })
  `).catch(() => '');
  const onShot = await shot(win, 'pm-liquid-settings-on.png');

  /* 关掉液态玻璃：开关切换 -> body 去掉 ui-liquid -> 再截一张 */
  const clicked = await win.webContents.executeJavaScript(`
    (() => {
      const line = [...document.querySelectorAll('.rule-line')].find(l => l.textContent.includes('液态玻璃效果'));
      const sw = line ? line.querySelector('.switch') : null;
      if (!sw) return 'noswitch';
      sw.click();
      return 'clicked|' + sw.className;
    })()
  `).catch((e) => 'err:' + e.message);
  console.log('click:', clicked);
  await wait(900);
  const offInfo = await win.webContents.executeJavaScript(`
    JSON.stringify({
      bodyClass: document.body.className,
      modalFilter: (() => {
        const p = document.createElement('div'); p.className = 'modal';
        document.body.appendChild(p);
        const v = getComputedStyle(p).backdropFilter;
        p.remove(); return v;
      })()
    })
  `).catch(() => '');
  const offShot = await shot(win, 'pm-liquid-settings-off.png');

  console.log('on:', onInfo, '->', onShot);
  console.log('off:', offInfo, '->', offShot);

  win.destroy();
  app.exit(0);
}).catch((e) => { console.log('ERROR', e && e.stack); app.exit(2); });
