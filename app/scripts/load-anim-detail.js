'use strict';
/* 细节验收：进度条轨迹（0 → 50% → 100%）、扫光在亮底上的可见度、简洁版是否真的关掉新动效、
   换页面时卡片是否重新按 0.05s 错峰入场。产出 %TEMP%\load-anim-detail-*.png */
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

app.setName('pm-load-detail');
app.setPath('userData', path.join(os.tmpdir(), 'pm-load-detail-' + Date.now()));
require(path.join(__dirname, '..', 'electron', 'main.js'));

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
function cdpShot(win, name) {
  const dbg = win.webContents.debugger;
  try { if (!dbg.isAttached()) dbg.attach('1.3'); } catch (e) { /* noop */ }
  return dbg.sendCommand('Page.captureScreenshot', { format: 'png', fromSurface: true })
    .then(({ data }) => { const p = path.join(os.tmpdir(), name); fs.writeFileSync(p, Buffer.from(data, 'base64')); return p; })
    .catch((e) => 'SHOT-ERR:' + e.message);
}

app.whenReady().then(async () => {
  await wait(1200);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) { console.log('NO-WINDOW'); app.exit(2); return; }
  win.setContentSize(1360, 860);
  const js = (code) => win.webContents.executeJavaScript(code).catch((e) => 'ERR:' + e.message);
  const until = async (expr, label, timeout = 15000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) {
      if (await win.webContents.executeJavaScript(`!!(${expr})`).catch(() => false)) return true;
      await wait(100);
    }
    console.log('timeout:', label); return false;
  };

  /* 造好账号 + 数据，然后进登录页 */
  await until(`document.querySelector('.login-card input')`, 'setup');
  await js(`
    (async () => {
      await window.api.setup('pass123', '', '管理员');
      await window.api.acceptTerms(new Date().toISOString());
      await window.api.login('管理员', 'pass123');
      const a = await window.api.customers.create({ name: '张三', class_name: '一班' });
      const b = await window.api.customers.create({ name: '李四', class_name: '二班' });
      for (const r of [a, b]) await window.api.tx.consume(r.data.id, 1234, '验收');
      await window.api.logout();
      return 'ok';
    })()
  `);
  win.reload();
  await until(`document.querySelector('.login-card input')`, 'login form');
  await wait(700);

  /* ① 进度条轨迹：登录后每 20ms 采一次，直到主界面出现 */
  await js(`
    (() => {
      const setVal = (el, v) => { const d = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value'); d.set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); };
      const ins = [...document.querySelectorAll('.login-card input')];
      setVal(ins[0], '管理员'); setVal(ins[1], 'pass123');
      [...document.querySelectorAll('.login-card button')].find((b) => b.textContent.includes('进入系统')).click();
      return 'ok';
    })()
  `);
  const t0 = Date.now();
  const track = [];
  for (let i = 0; i < 80; i += 1) {
    const s = await js(`
      (() => {
        const bar = document.querySelector('.sk-progress i');
        return JSON.stringify({
          sk: !!document.querySelector('.sk-scope'),
          bar: bar ? getComputedStyle(bar).transform : null,
          w: bar ? bar.parentElement.getBoundingClientRect().width : 0,
          nav: !!document.querySelector('.nav-item')
        });
      })()
    `);
    if (s && s.startsWith('{')) {
      const o = JSON.parse(s); o.at = Date.now() - t0; track.push(o);
      if (o.nav) break;
    }
    await wait(20);
  }
  const pct = (t) => {
    const m = /matrix\(1, 0, 0, 1, (-?\d+(\.\d+)?), 0\)/.exec(t || '');
    return (!m || !track[0] || !track[0].w) ? null : Math.round((1 + Number(m[1]) / track[0].w) * 1000) / 10;
  };
  console.log('bar-track:', JSON.stringify(track.map((x) => ({ at: x.at, p: x.sk ? pct(x.bar) : (x.nav ? 'ui' : null) }))));

  await until(`document.querySelector('.nav-item')`, 'main');
  await wait(1200);

  /* ② 换页面：卡片重新错峰入场 */
  await js(`(() => { [...document.querySelectorAll('.nav-item')].find((b) => b.textContent.includes('顾客管理')).click(); return 'ok'; })()`);
  await wait(60);
  console.log('page-switch-cards:', await js(`
    (() => {
      const cards = [...document.querySelectorAll('.card, .stat-card')];
      return JSON.stringify({ n: cards.length, reveal: document.querySelectorAll('.reveal').length, delays: cards.slice(0, 4).map((c) => getComputedStyle(c).animationDelay), i: cards.slice(0, 4).map((c) => c.style.getPropertyValue('--reveal-i')) });
    })()
  `));
  await wait(1200);

  /* ③ 简洁版：body.ui-lite 时新动效应全部失效（在主界面 + 骨架屏两处各测一次） */
  await js(`(() => { document.body.classList.add('ui-lite'); return 'ok'; })()`);
  const liteLive = await js(`
    (() => {
      const st = getComputedStyle(document.querySelector('.card'), null);
      return JSON.stringify({ cardDur: st.animationDuration });
    })()
  `);
  console.log('lite-live:', liteLive);
  await js(`(() => { document.body.classList.remove('ui-lite'); return 'ok'; })()`);

  /* ④ 扫光在亮底上的可见度：退出登录 → 骨架屏 → 把光带停在 57% 位置（正压在登录卡上） */
  await js(`(() => { [...document.querySelectorAll('.sidebar .btn-ghost')].find((x) => x.textContent.includes('退出登录')).click(); return 'ok'; })()`);
  await wait(50);
  await js(`
    (() => {
      document.body.classList.add('ui-lite');
      const st = document.createElement('style');
      st.id = 'sk-freeze';
      st.textContent = '.sk-shine::before{animation-play-state:paused!important;animation-delay:-0.86s!important}';
      document.head.appendChild(st);
      return 'ok';
    })()
  `);
  await wait(50);
  const liteSk = await js(`
    (() => {
      const sh = document.querySelector('.sk-shine');
      if (!sh) return 'none';
      const st = getComputedStyle(sh, '::before');
      return JSON.stringify({ shineDur: st.animationDuration, shineName: st.animationName, shineTransform: st.transform });
    })()
  `);
  console.log('lite-skeleton-shine:', liteSk);
  await js(`(() => { document.body.classList.remove('ui-lite'); return 'ok'; })()`);
  await wait(30);
  console.log('frozen-sweep:', await js(`
    (() => { const sh = document.querySelector('.sk-shine'); if (!sh) return 'none'; const st = getComputedStyle(sh, '::before'); return JSON.stringify({ transform: st.transform, dur: st.animationDuration }); })()
  `));
  console.log('sweep-shot:', await cdpShot(win, 'load-anim-detail-01-sweep.png'));

  await wait(900);
  console.log('login-shot:', await cdpShot(win, 'load-anim-detail-02-login.png'));

  setTimeout(() => { win.destroy(); app.exit(0); }, 200);
}).catch((e) => { console.log('ERROR', e && e.stack); app.exit(2); });
