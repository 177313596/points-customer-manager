'use strict';
/* 验证：卡片磨砂玻璃 + 光标光斑 + 边框局部提亮 + ≤4° 3D 倾斜（v1.1.7）
   1) 菜单卡片化：圆角 / 外边距 / 深色玻璃 / 毛玻璃
   2) 鼠标移进卡片：读 --mx/--my/--tx/--ty、::before 与 ::after 的真实 opacity、transform 矩阵
   3) 鼠标移出：确认角度平滑归零
   产出：%TEMP%\cards-glass-*.png */
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

app.setName('pm-cards-glass');
app.setPath('userData', path.join(os.tmpdir(), 'pm-cards-' + Date.now()));
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

  const until = async (expr, label, timeout = 9000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) {
      const ok = await win.webContents.executeJavaScript(`!!(${expr})`).catch(() => false);
      if (ok) return true;
      await wait(250);
    }
    console.log('timeout waiting for ' + label);
    return false;
  };

  await win.webContents.executeJavaScript(`
    (async () => { await window.api.setup('pass123','','管理员'); await window.api.acceptTerms(new Date().toISOString()); return true; })()
  `).catch(() => { });
  win.reload();
  await until(`document.querySelector('.login-card input')`, 'login card');

  const loginGlass = await win.webContents.executeJavaScript(`
    (() => {
      const cs = getComputedStyle(document.querySelector('.login-card'));
      return JSON.stringify({ radius: cs.borderRadius, border: cs.borderTopColor, blur: (cs.backdropFilter || cs.webkitBackdropFilter || '').slice(0, 28), bg: (cs.backgroundImage || '').slice(0, 44) });
    })()
  `).catch((e) => 'err ' + e.message);
  console.log('登录卡: ' + loginGlass);

  const logged = await win.webContents.executeJavaScript(`
    (() => {
      const setVal = (el, v) => { const d = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value'); d.set.call(el,v); el.dispatchEvent(new Event('input',{bubbles:true})); };
      const ins = [...document.querySelectorAll('.login-card input')];
      if (!ins.length) return 'no-login';
      setVal(ins[0], '管理员'); setVal(ins[1], 'pass123');
      [...document.querySelectorAll('.login-card button')].find(b => b.textContent.includes('进入系统')).click();
      return 'ok';
    })()
  `).catch((e) => 'err ' + e.message);
  console.log('login:', logged);
  await until(`document.querySelector('.nav-pill')`, 'nav pill', 12000);
  await wait(900);

  const side = await win.webContents.executeJavaScript(`
    (() => {
      const el = document.querySelector('.sidebar');
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return JSON.stringify({
        rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)],
        radius: cs.borderRadius, margin: cs.margin,
        border: cs.borderTopWidth + ' ' + cs.borderTopColor,
        blur: (cs.backdropFilter || cs.webkitBackdropFilter || 'none').slice(0, 28),
        bg: (cs.backgroundImage || '').slice(0, 40),
        shadow: cs.boxShadow.slice(0, 54),
      });
    })()
  `).catch((e) => 'err ' + e.message);
  console.log('菜单卡: ' + side);
  console.log('shot idle:', await shot(win, 'cards-glass-01-idle.png'));

  const cardRect = await win.webContents.executeJavaScript(`
    (() => {
      const c = [...document.querySelectorAll('.card')][0];
      const r = c.getBoundingClientRect();
      window.__t = c;
      return JSON.stringify([Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)]);
    })()
  `);
  const [cl, ct, cw, ch] = JSON.parse(cardRect);
  const hx = Math.round(cl + cw * 0.72), hy = Math.round(ct + ch * 0.72);
  console.log('第一张卡:', cardRect, '→ 悬停点', hx, hy);
  win.webContents.sendInputEvent({ type: 'mouseMove', x: hx, y: hy });
  await wait(60);
  win.webContents.sendInputEvent({ type: 'mouseMove', x: hx + 3, y: hy + 2 });
  await wait(450);

  const hover = await win.webContents.executeJavaScript(`
    (() => {
      const el = window.__t || [...document.querySelectorAll('.card')][0];
      const cs = getComputedStyle(el);
      const before = getComputedStyle(el, '::before');
      const after = getComputedStyle(el, '::after');
      return JSON.stringify({
        cls: el.className,
        mx: el.style.getPropertyValue('--mx'), my: el.style.getPropertyValue('--my'),
        tx: el.style.getPropertyValue('--tx'), ty: el.style.getPropertyValue('--ty'),
        beforeOpacity: before.opacity, afterOpacity: after.opacity,
        transform: cs.transform.slice(0, 76),
        glowBg: (before.backgroundImage || '').slice(0, 58),
      });
    })()
  `).catch((e) => 'err ' + e.message);
  console.log('卡片悬停: ' + hover);
  console.log('shot card-hover:', await shot(win, 'cards-glass-02-card-hover.png'));

  win.webContents.sendInputEvent({ type: 'mouseMove', x: 122, y: 420 });
  await wait(120);
  win.webContents.sendInputEvent({ type: 'mouseMove', x: 128, y: 432 });
  await wait(450);
  const sideHover = await win.webContents.executeJavaScript(`
    (() => {
      const el = document.querySelector('.sidebar');
      return JSON.stringify({
        cls: el.className, mx: el.style.getPropertyValue('--mx'), my: el.style.getPropertyValue('--my'),
        tx: el.style.getPropertyValue('--tx'), ty: el.style.getPropertyValue('--ty'),
        beforeOpacity: getComputedStyle(el, '::before').opacity,
        afterOpacity: getComputedStyle(el, '::after').opacity,
      });
    })()
  `).catch((e) => 'err ' + e.message);
  console.log('菜单悬停: ' + sideHover);
  console.log('shot sidebar-hover:', await shot(win, 'cards-glass-03-sidebar-hover.png'));

  win.webContents.sendInputEvent({ type: 'mouseMove', x: 1010, y: 845 });
  await wait(950);
  const cooled = await win.webContents.executeJavaScript(`
    (() => {
      const el = document.querySelector('.sidebar');
      const card = [...document.querySelectorAll('.card')][0];
      const r = (x) => (x ? x.style.getPropertyValue('--tx') + '/' + x.style.getPropertyValue('--ty') : 'none');
      return JSON.stringify({ sideTx: r(el), cardTx: r(card), sideCls: el.className, cardCls: card.className });
    })()
  `).catch((e) => 'err ' + e.message);
  console.log('移出后: ' + cooled);
  console.log('shot cooled:', await shot(win, 'cards-glass-04-cooled.png'));

  await win.webContents.executeJavaScript(`document.body.classList.add('ui-lite')`).catch(() => { });
  await wait(520);
  const lite = await win.webContents.executeJavaScript(`
    (() => {
      const c = [...document.querySelectorAll('.card')][0];
      const cs = getComputedStyle(c);
      return JSON.stringify({ blur: (cs.backdropFilter || cs.webkitBackdropFilter || 'none'), transform: cs.transform, afterOpacity: getComputedStyle(c, '::after').opacity, bg: (cs.backgroundImage || '').slice(0, 40) });
    })()
  `).catch((e) => 'err ' + e.message);
  console.log('简洁版: ' + lite);
  await win.webContents.executeJavaScript(`document.body.classList.remove('ui-lite')`).catch(() => { });

  setTimeout(() => { win.destroy(); app.exit(0); }, 200);
}).catch((e) => { console.log('ERROR', e && e.stack); app.exit(2); });
