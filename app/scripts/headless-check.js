const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const os = require('os');
const fs = require('fs');

const out = [];
const consoleErrors = [];
function log(s) { out.push(s); console.log(s); }

app.setPath('userData', path.join(os.tmpdir(), 'pm-headless-' + Date.now()));

// 声明闸门有 10 秒强制倒计时，整体预算放到 45 秒
setTimeout(() => { log('TIMEOUT-EXIT'); flush(); app.exit(1); }, 45000);

function flush() {
  try { fs.writeFileSync(path.join(os.tmpdir(), 'pm-headless-result.txt'), out.join('\n'), 'utf8'); } catch (e) { }
}

async function main() {
  await app.whenReady();

  // 造一张测试背景图，验证 file:// 背景能真正加载、且没有蒙版
  const bgFile = path.join(os.tmpdir(), 'pm-bg-test.png');
  fs.writeFileSync(bgFile, Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64'));
  const bgUrl = require('url').pathToFileURL(bgFile).href;

  // 只注册登录页需要的最小 IPC，模拟“库里已有密码、用户名是管理员”的状态
  // terms_accepted 留空 = 还没同意《使用声明》，用来验证首次使用的同意闸门
  ipcMain.handle('auth:status', () => ({
    ok: true,
    data: {
      hasPassword: true, username: '管理员', shop_name: '积分客户管理系统', version: '1.0.0',
      login_bg: bgUrl, login_bgs: [bgUrl], theme: { accent: '#0F766E' }, terms_accepted: '', login_bg_rotate: false,
    },
  }));
  ipcMain.handle('auth:accept-terms', () => ({ ok: true, data: { terms_accepted: '2026-11-08T09:00:00.000Z' } }));

  /* ---- 登录后的桩数据，用于验证工作台渲染 ---- */
  const ok = (data) => ({ ok: true, data });
  ipcMain.handle('auth:login', () => ok({ token: 'tok' }));
  // 二级操作密码：默认关闭，桩里用一个开关模拟设置页开/关
  let opRequired = false;
  ipcMain.handle('settings:get', () => ok({
    shop_name: '积分客户管理系统', operator_name: '管理员',
    points_rule: { per_amount_cents: 1000, points_per_unit: 1 },
    redeem_rule: { points: 15, balance_cents: 1000 },
    cloud_config: { enabled: false }, login_username: '管理员',
    login_bg: bgUrl, login_bgs: [bgUrl], login_bg_rotate: false, theme: { accent: '#0F766E' },
    ui_mode: 'standard', liquid_glass: true,
    op_required: opRequired,
  }));
  ipcMain.handle('settings:set-liquid-glass', () => ok({ liquid_glass: true }));
  ipcMain.handle('auth:set-op-password', () => { opRequired = true; return ok({ op_required: true }); });
  ipcMain.handle('auth:disable-op', () => { opRequired = false; return ok({ op_required: false }); });
  ipcMain.handle('stats:overview', () => ok({
    customers: 2, today_amount_cents: 0, today_tx_count: 0, today_points: 0,
    today_new_customers: 0, total_points: 35, total_balance_cents: 1250,
    redeemed_points_total: 0, pending_sync: 0, trend: [], top: [],
  }));
  ipcMain.handle('customers:list', () => ok({
    total: 1, page: 1, page_size: 20,
    rows: [{
      id: 7, name: '小明', class_name: '三年级二班', phone: '13800138000', note: '',
      points: 32, balance_cents: 1250, total_spent_cents: 25800,
      created_at: '2026-11-01 10:00:00', updated_at: '2026-11-07 17:30:12',
    }],
  }));
  ipcMain.handle('customers:classes', () => ok([]));
  ipcMain.handle('cloud:status', () => ok({ pending: 0, lastSyncAt: '', lastError: '' }));
  ipcMain.handle('app:info', () => ok({ dbPath: 'C:\\temp\\points-data.db' }));


  const win = new BrowserWindow({
    show: false,
    width: 1360,
    height: 860,
    webPreferences: {
      preload: path.join(__dirname, '..', 'electron', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  win.webContents.on('preload-error', (e, p, err) => log('preload-error ' + (err && err.message)));
  win.webContents.on('render-process-gone', (e, d) => log('render-gone ' + JSON.stringify(d)));
  win.webContents.on('console-message', (e, level, message) => {
    const msg = String(message);
    // Electron 在非打包环境必然打印的 CSP 安全提示，不计为运行时错误
    if (msg.includes('Electron Security Warning') || msg.includes('Insecure Content-Security-Policy')) return;
    if (level >= 2) consoleErrors.push(msg.slice(0, 160));
  });

  await win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  await new Promise((r) => setTimeout(r, 1500));

  const apiOk = await win.webContents.executeJavaScript('typeof window.api === "object"').catch((e) => 'err:' + e.message);
  log('api ok: ' + apiOk);

  /* ---- 使用声明闸门：先 10 秒倒计时，倒计时结束后才能勾选同意 ---- */
  const gateRes = await win.webContents.executeJavaScript(`
    (async () => {
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      const g = document.querySelector('.terms-gate');
      if (!g) return JSON.stringify({ gate: 0 });
      const sections = g.querySelectorAll('.terms-sec').length;
      const textLen = g.querySelector('.terms-body') ? g.querySelector('.terms-body').innerText.length : 0;
      const chk0 = g.querySelector('.terms-consent');
      const btn0 = g.querySelector('.terms-foot .btn');
      const lockedChk = chk0.getAttribute('aria-disabled') === 'true' && chk0.classList.contains('locked');
      const lockedBtn = btn0.getAttribute('aria-disabled') === 'true';
      const btnTextBefore = btn0.textContent.trim();
      const timerText = g.querySelector('.terms-timer') ? g.querySelector('.terms-timer').textContent.trim() : '';
      chk0.click();                        // 锁定期间点勾选行：不勾上，只出提示
      await wait(300);
      const checkedWhileLocked = document.querySelector('.terms-consent').getAttribute('aria-checked') === 'true';
      const hintWhileLocked = (document.querySelector('.terms-hint') || {}).textContent || '';

      // 等倒计时走完（最多 14 秒）
      let waited = 0;
      while (waited < 14000) {
        const c = document.querySelector('.terms-consent');
        if (c && !c.classList.contains('locked')) break;
        await wait(500);
        waited += 500;
      }
      const chk1 = document.querySelector('.terms-consent');
      const unlocked = chk1 && !chk1.classList.contains('locked');
      const timerAfter = document.querySelector('.terms-timer') ? document.querySelector('.terms-timer').textContent.trim() : '';
      chk1.click();
      await wait(350);
      const btn1 = document.querySelector('.terms-gate .terms-foot .btn');
      const disabledAfter = btn1 ? btn1.getAttribute('aria-disabled') === 'true' : null;
      const btnTextAfter = btn1 ? btn1.textContent.trim() : '';
      if (btn1) btn1.click();
      await wait(700);
      return JSON.stringify({
        gate: 1, lockedChk, lockedBtn, btnTextBefore, timerText,
        checkedWhileLocked, hintWhileLocked, unlocked, waitMs: waited, timerAfter,
        disabledAfter, btnTextAfter, sections, textLen,
        gone: !document.querySelector('.terms-gate'),
      });
    })()
  `).catch((e) => 'err:' + e.message);
  let gateObj = {};
  try { gateObj = JSON.parse(gateRes); } catch (e) { gateObj = {}; }
  log('terms gate: ' + gateRes);

  const gateChecks = {
    termsGateShown: gateObj.gate === 1,
    termsCountdownStart: /还需阅读 (\d+) 秒/.test(String(gateObj.timerText || '')),
    termsCheckboxLocked: gateObj.lockedChk === true && gateObj.checkedWhileLocked === false,
    termsLockedClickShowsHint: /还需阅读/.test(String(gateObj.hintWhileLocked || '')),
    termsAgreeLocked: gateObj.lockedBtn === true && /请阅读声明（(\d+) 秒后可同意）/.test(String(gateObj.btnTextBefore || '')),
    termsCheckboxUnlocksAfter10s: gateObj.unlocked === true && Number(gateObj.waitMs || 0) >= 7000 && Number(gateObj.waitMs || 0) <= 12000,
    termsGateEnablesAfterCheck: gateObj.disabledAfter === false,
    termsGateDismissed: gateObj.gone === true,
    termsHasSections: Number(gateObj.sections || 0) >= 6,
  };
  Object.entries(gateChecks).forEach(([k, v]) => log((v ? 'PASS ' : 'FAIL ') + k));

  const text = String(await win.webContents.executeJavaScript('document.body.innerText')).replace(/\n+/g, ' | ');
  log('body: ' + text.slice(0, 400));

  const inputs = await win.webContents.executeJavaScript('document.querySelectorAll(".login-card input").length').catch(() => -1);
  log('login inputs: ' + inputs);

  const labels = await win.webContents.executeJavaScript(
    '[...document.querySelectorAll(".login-card .field-label")].map(el=>el.textContent.trim()).join("/")'
  ).catch(() => '');

  const checks = {
    apiOk: apiOk === true,
    hasUsernameField: labels.includes('用户名'),
    hasPasswordField: labels.includes('登录密码'),
    inputCount2: inputs === 2,
    scryptLineRemoved: !text.includes('scrypt'),
    hasEnterButton: text.includes('进入系统'),
  };  Object.entries(checks).forEach(([k, v]) => log((v ? 'PASS ' : 'FAIL ') + k));
  log('labels: ' + labels);

  /* ---- 小眼睛：初始为 password，点一下变 text，再点回 password ---- */
  const eyeCount = await win.webContents.executeJavaScript(
    'document.querySelectorAll(".login-card .pw-eye").length'
  ).catch(() => 0);
  const typeBefore = await win.webContents.executeJavaScript(
    'document.querySelector(".login-card .pw-input").type'
  ).catch(() => 'none');

  await win.webContents.executeJavaScript(
    'document.querySelector(".login-card .pw-eye").click()'
  ).catch((e) => log('eye click err: ' + e.message));
  await new Promise((r) => setTimeout(r, 400));
  const typeShown = await win.webContents.executeJavaScript(
    'document.querySelector(".login-card .pw-input").type'
  ).catch(() => 'none');

  await win.webContents.executeJavaScript(
    'document.querySelector(".login-card .pw-eye").click()'
  ).catch(() => {});
  await new Promise((r) => setTimeout(r, 400));
  const typeHidden = await win.webContents.executeJavaScript(
    'document.querySelector(".login-card .pw-input").type'
  ).catch(() => 'none');

  log('eye: count=' + eyeCount + ' before=' + typeBefore + ' shown=' + typeShown + ' hidden=' + typeHidden);
  checks.eyeButtonExists = eyeCount >= 1;
  checks.eyeTogglesPassword = typeBefore === 'password' && typeShown === 'text' && typeHidden === 'password';
  log((checks.eyeButtonExists ? 'PASS ' : 'FAIL ') + 'eyeButtonExists');
  log((checks.eyeTogglesPassword ? 'PASS ' : 'FAIL ') + 'eyeTogglesPassword');

  /* ---- 背景图：铺满且无蒙版，file:// 能真正加载，且切换时有高斯模糊动画 ---- */
  const bgStyle = await win.webContents.executeJavaScript(`
    (() => {
      const layers = [...document.querySelectorAll('.login-bg-layer')];
      const top = layers.filter((l) => !l.classList.contains('under')).pop() || layers[0];
      if (!top) return 'none';
      const cs = getComputedStyle(top);
      return [cs.backgroundImage, cs.backgroundSize, cs.animationName, String(layers.length)].join('|');
    })()
  `).catch(() => '');
  log('bg style: ' + String(bgStyle).slice(0, 140));
  const bgImagePart = String(bgStyle).split('|')[0] || '';
  const bgSizePart = String(bgStyle).split('|')[1] || '';

  // 个性化配色：登录页也要按库里 theme.accent 改写 :root
  const themeRes = await win.webContents.executeJavaScript(`
    (() => {
      const cs = getComputedStyle(document.documentElement);
      return [cs.getPropertyValue('--primary').trim(), cs.getPropertyValue('--nav-1').trim()].join('|');
    })()
  `).catch(() => '');
  log('theme vars: ' + themeRes);

  const imgLoad = await win.webContents.executeJavaScript(`
    new Promise((res) => {
      const i = new Image();
      i.onload = () => res('loaded ' + i.naturalWidth + 'x' + i.naturalHeight);
      i.onerror = () => res('error');
      i.src = ${JSON.stringify(bgUrl)};
      setTimeout(() => res('timeout'), 1500);
    })
  `).catch((e) => 'err:' + e.message);
  log('bg image probe: ' + imgLoad);

  /* ---- 右下角《使用声明》入口要够醒目：字号 ≥13px、有实底背景与边框 ---- */
  const termsLink = await win.webContents.executeJavaScript(`
    (() => {
      const a = document.querySelector('.login-terms-link');
      if (!a) return JSON.stringify({ found: 0 });
      const cs = getComputedStyle(a);
      return JSON.stringify({
        found: 1,
        fontSize: parseFloat(cs.fontSize),
        color: cs.color,
        bg: cs.backgroundColor,
        border: cs.borderTopWidth,
        text: a.textContent.trim(),
      });
    })()
  `).catch((e) => 'err:' + e.message);
  let tlObj = {};
  try { tlObj = JSON.parse(termsLink); } catch (e) { tlObj = {}; }
  log('terms link: ' + termsLink);

  const bgChecksLogin = {
    bgApplied: String(bgImagePart).includes('url('),
    noVeil: !String(bgImagePart).includes('gradient'),
    bgImageLoads: String(imgLoad).startsWith('loaded'),
    bgCovers: bgSizePart === 'cover',
    bgBlurTransition: String(bgStyle).split('|')[2] === 'bgBlurIn',
    themeAppliedOnLogin: String(themeRes).split('|')[0] === '#0F766E' && String(themeRes).split('|')[1] !== '',
    termsLinkReadable: tlObj.found === 1 && Number(tlObj.fontSize) >= 13
      && String(tlObj.bg).replace(/\s/g, '') !== 'rgba(0,0,0,0)' && parseFloat(tlObj.border || '0') >= 1,
  };
  Object.entries(bgChecksLogin).forEach(([k, v]) => log((v ? 'PASS ' : 'FAIL ') + k));

  /* ---- 第二阶段：模拟登录进入工作台 ---- */
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
      return true;
    })()
  `).catch((e) => log('login-click err: ' + e.message));
  await new Promise((r) => setTimeout(r, 2000));

  const dash = String(await win.webContents.executeJavaScript('document.body.innerText')).replace(/\n+/g, ' | ');
  log('dash body: ' + dash.slice(0, 400));
  log('console errors: ' + consoleErrors.length + (consoleErrors.length ? ' -> ' + consoleErrors.join(' | ').slice(0, 200) : ''));

  const dashChecks = {
    enteredDashboard: dash.includes('积分'),
    hasPointsModule: dash.includes('积分') && dash.includes('预计得分'),
    hasBalanceModule: dash.includes('消费余额') && dash.includes('可用余额'),
    waitingCardRemoved: !dash.includes('待兑换权益'),
    noQuickConvertButton:
      (await win.webContents.executeJavaScript(`
        [...document.querySelectorAll('.quick-row .quick-btn')].filter(b => b.textContent.includes('转化积分')).length
      `).catch(() => -1)) === 0,
    quickRedeemRemoved:
      (await win.webContents.executeJavaScript(`
        [...document.querySelectorAll('.quick-row .quick-btn')].filter(b => b.textContent.includes('积分兑换')).length
      `).catch(() => -1)) === 0,
    quickHasNewCustomer:
      (await win.webContents.executeJavaScript(`
        [...document.querySelectorAll('.quick-row .quick-btn')].filter(b => b.textContent.includes('新增顾客')).length
      `).catch(() => -1)) === 1,
    topupRemoved: !dash.includes('充值余额'),
    noRuntimeError: consoleErrors.length === 0,
    appBgStackPresent: (await win.webContents.executeJavaScript(
      'document.querySelectorAll(".app-bg-stack .app-bg-layer").length'
    ).catch(() => -1)) === 1,
    appBgUsesLoginImage: String(await win.webContents.executeJavaScript(
      '(document.querySelector(".app-bg-layer") ? getComputedStyle(document.querySelector(".app-bg-layer")).backgroundImage : "")'
    ).catch(() => '')).includes('pm-bg'),
    appBgBelowContent: (await win.webContents.executeJavaScript(`
      (() => {
        const c = document.querySelector('.content');
        if (!c) return 'no-content';
        return getComputedStyle(c).position + '|' + getComputedStyle(c).zIndex;
      })()
    `).catch(() => '')).startsWith('relative'),
    brandLogoLoaded: (await win.webContents.executeJavaScript(`
      (() => {
        const im = document.querySelector('.side-brand .brand-logo');
        return im ? (im.naturalWidth > 0 ? 'ok' : 'broken') : 'missing';
      })()
    `).catch(() => 'err')) === 'ok',
    winChromePresent: (await win.webContents.executeJavaScript(
      'document.querySelectorAll(".win-controls .win-btn").length'
    ).catch(() => -1)) === 3,
    winShellRounded: (await win.webContents.executeJavaScript(`
      (() => {
        const s = document.querySelector('.shell');
        return s ? getComputedStyle(s).borderRadius : '';
      })()
    `).catch(() => '')) === '14px',
    // 界面模式：标准版保留模糊淡入；加上 ui-lite 后动画被彻底关掉
    uiModeSwitch: (await win.webContents.executeJavaScript(`
      (() => {
        const el = document.querySelector('.page-fade');
        if (!el) return 'nopage';
        const before = getComputedStyle(el).animationName;
        document.body.classList.add('ui-lite');
        const after = getComputedStyle(el).animationName;
        const mask = document.querySelector('.modal-mask');
        const blur = mask ? getComputedStyle(mask).backdropFilter : 'nomodal';
        document.body.classList.remove('ui-lite');
        return (before === 'pageBlurIn' && after === 'none' && (blur === 'none' || blur === 'nomodal')) ? 'ok' : (before + '|' + after + '|' + blur);
      })()
    `).catch(() => 'err')) === 'ok',
    // 液态玻璃：标准版默认开（body 有 ui-liquid，浮层带 url(#lg-refract) 折射滤镜）；
    // 加 ui-lite 后不再生效；摘掉 ui-liquid 后回到普通毛玻璃
    glassSwitch: (await win.webContents.executeJavaScript(`
      (() => {
        const probe = document.createElement('div');
        probe.className = 'modal';
        document.body.appendChild(probe);
        const bodyHas = document.body.classList.contains('ui-liquid');
        const on = getComputedStyle(probe).backdropFilter;
        document.body.classList.add('ui-lite');
        const lite = getComputedStyle(probe).backdropFilter;
        document.body.classList.remove('ui-lite', 'ui-liquid');
        const off = getComputedStyle(probe).backdropFilter;
        document.body.classList.add('ui-liquid');
        const hasFilterDef = !!document.querySelector('#lg-refract');
        probe.remove();
        return [bodyHas, /url\\(/.test(on) ? 'url' : on, /none/.test(lite) ? 'none' : lite, off, hasFilterDef].join('|');
      })()
    `).catch(() => 'err')) === 'true|url|none|none|true',
    // 鼠标聚光：标准版有这一层，简洁版整层不渲染，且不接收鼠标事件
    spotlightLayer: (await win.webContents.executeJavaScript(`
      (() => {
        const s = document.querySelector('.spotlight');
        if (!s) return 'missing';
        const std = getComputedStyle(s);
        document.body.classList.add('ui-lite');
        const lite = getComputedStyle(s).display;
        document.body.classList.remove('ui-lite');
        return [std.display, std.pointerEvents, lite, s.getAttribute('aria-hidden')].join('|');
      })()
    `).catch(() => 'err')) === 'block|none|none|true',
  };
  Object.entries(dashChecks).forEach(([k, v]) => log((v ? 'PASS ' : 'FAIL ') + k));

  /* ---- toast 位置：顶部居中 ---- */
  const toastInfo = await win.webContents.executeJavaScript(`
    (() => {
      const t = document.createElement('div');
      t.className = 'toast ok';
      t.textContent = '位置探针';
      document.body.appendChild(t);
      const cs = getComputedStyle(t);
      const r = cs.position + '|' + cs.top + '|' + cs.zIndex;
      t.remove();
      return r;
    })()
  `).catch(() => '');
  log('toast style: ' + toastInfo);
  const toastChecks = {
    toastAtTop: String(toastInfo).startsWith('fixed|16px'),
    toastAboveModal: Number(String(toastInfo).split('|')[2] || 0) >= 1000,
  };
  Object.entries(toastChecks).forEach(([k, v]) => log((v ? 'PASS ' : 'FAIL ') + k));

  /* ---- 消费余额模块选中顾客后出现「积分兑换」 ---- */
  const pickRes = await win.webContents.executeJavaScript(`
    (async () => {
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      const inputs = [...document.querySelectorAll('.picker-input input')];
      if (inputs.length < 2) return 'no-pickers';
      const inp = inputs[1];
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(inp, '小');
      inp.dispatchEvent(new Event('input', { bubbles: true }));
      await wait(800);
      const rows = document.querySelectorAll('.picker-pop .picker-row');
      if (!rows.length) return 'no-rows';
      rows[0].click();
      await wait(700);
      const inline = document.querySelector('.redeem-inline');
      const btn = inline ? inline.querySelector('button') : null;
      const enabled = btn ? !btn.disabled : false;
      if (btn) btn.click();
      await wait(700);
      const modalTitle = document.querySelector('.modal-head h3') ? document.querySelector('.modal-head h3').textContent.trim() : '';
      const modalText = document.querySelector('.modal') ? document.querySelector('.modal').innerText : '';
      // 兑换弹窗里的"全部（N 份）"按钮：点了要把份数直接置到最大值
      const stepper = document.querySelector('.modal .stepper');
      const maxBtn = stepper ? [...stepper.querySelectorAll('button')].find((b) => b.textContent.includes('全部')) : null;
      const timesInput = stepper ? stepper.querySelector('input') : null;
      const before = timesInput ? timesInput.value : '';
      const maxBtnText = maxBtn ? maxBtn.textContent.trim() : '';
      if (maxBtn) maxBtn.click();
      await wait(500);
      const after = timesInput ? timesInput.value : '';
      const calc = document.querySelector('.modal .calc-strip') ? document.querySelector('.modal .calc-strip').innerText : '';
      const cancel = [...document.querySelectorAll('.modal-foot .btn')].find((b) => b.textContent.includes('取消'));
      if (cancel) cancel.click();
      await wait(400);
      return 'inline=' + (inline ? 1 : 0) + ' btn=' + (btn ? btn.textContent.trim() : '')
        + ' enabled=' + enabled
        + ' txt=' + (inline ? inline.querySelector('.redeem-inline-text').textContent.trim() : '')
        + ' modal=' + modalTitle
        + ' redeemInModal=' + (modalText.includes('兑换份数') ? 1 : 0)
        + ' maxBtn=' + maxBtnText
        + ' timesBefore=' + before + ' timesAfter=' + after
        + ' calc=' + calc.replace(/\\n/g, ' / ');
    })()
  `).catch((e) => 'err:' + e.message);
  log('balance redeem: ' + pickRes);

  const redeemChecks = {
    balanceHasRedeem: String(pickRes).startsWith('inline=1'),
    balanceRedeemButton: String(pickRes).includes('btn=积分兑换'),
    balanceRedeemEnabled: String(pickRes).includes('enabled=true'),
    balanceRedeemHint: String(pickRes).includes('可兑换'),
    balanceRedeemOpensModal: String(pickRes).includes('modal=积分兑换') && String(pickRes).includes('redeemInModal=1'),
    redeemHasMaxButton: /maxBtn=全部（2 份）/.test(String(pickRes)),
    redeemMaxPicksAll: String(pickRes).includes('timesBefore=1 timesAfter=2'),
    redeemMaxUpdatesCalc: /消耗 30 分/.test(String(pickRes)),
  };
  Object.entries(redeemChecks).forEach(([k, v]) => log((v ? 'PASS ' : 'FAIL ') + k));

  /* ---- 第三阶段：手动调整必须输入操作密码 ---- */
  await win.webContents.executeJavaScript(`
    (() => {
      const nav = [...document.querySelectorAll('.sidebar a, .sidebar button, .nav-item')]
        .find(el => el.textContent.includes('顾客管理'));
      if (nav) nav.click();
      return !!nav;
    })()
  `).catch((e) => log('nav err: ' + e.message));
  await new Promise((r) => setTimeout(r, 1200));

  const custBody = String(await win.webContents.executeJavaScript('document.body.innerText')).replace(/\n+/g, ' | ');
  log('customers body: ' + custBody.slice(0, 200));

  const adjustOpen = await win.webContents.executeJavaScript(`
    (() => {
      const btn = document.querySelector('.row-actions .icon-btn[title*="手动调整"]')
        || [...document.querySelectorAll('.row-actions .icon-btn')].find(b => b.title && b.title.includes('手动调整'));
      if (!btn) return 'no-btn';
      btn.click();
      return 'clicked';
    })()
  `).catch((e) => 'err:' + e.message);
  log('adjust open: ' + adjustOpen);
  await new Promise((r) => setTimeout(r, 800));

  const modalText = String(await win.webContents.executeJavaScript(
    'document.querySelector(".modal") ? document.querySelector(".modal").innerText : "NO-MODAL"'
  )).replace(/\n+/g, ' | ');
  log('modal: ' + modalText.slice(0, 200));

  const submitDisabled = await win.webContents.executeJavaScript(`
    (() => {
      const btns = [...document.querySelectorAll('.modal-foot .btn')];
      const primary = btns.find(b => b.className.includes('btn-primary'));
      return primary ? primary.disabled : 'no-btn';
    })()
  `).catch(() => 'err');

  // 遮罩必须是 body 的直属子节点（portal），且铺满整个窗口（含左侧栏）
  const maskInfo = String(await win.webContents.executeJavaScript(`
    (() => {
      const m = document.querySelector('.modal-mask');
      if (!m) return 'no-mask';
      const r = m.getBoundingClientRect();
      const cs = getComputedStyle(m);
      return 'parentBody=' + (m.parentElement === document.body)
        + ' rect=' + Math.round(r.width) + 'x' + Math.round(r.height) + '@' + Math.round(r.left) + ',' + Math.round(r.top)
        + ' win=' + window.innerWidth + 'x' + window.innerHeight
        + ' blur=' + (cs.backdropFilter || cs.webkitBackdropFilter || 'none');
    })()
  `).catch((e) => 'err:' + e.message));
  log('modal mask: ' + maskInfo);

  const adjustChecks = {
    adjustModalOpen: modalText.includes('手动调整'),
    hasOpPasswordField: modalText.includes('操作密码'),
    noBalanceField: !modalText.includes('余额增减'),
    submitLockedWithoutPw: submitDisabled === true,
    maskPortaledToBody: maskInfo.includes('parentBody=true'),
    maskCoversWindow: (() => {
      const m = /rect=(\d+)x(\d+)@(\d+),(\d+) win=(\d+)x(\d+)/.exec(maskInfo);
      if (!m) return false;
      return m[1] === m[5] && m[2] === m[6] && m[3] === '0' && m[4] === '0';
    })(),
    maskHasBackdropBlur: /blur=blur\(/.test(maskInfo),
  };
  Object.entries(adjustChecks).forEach(([k, v]) => log((v ? 'PASS ' : 'FAIL ') + k));
  log('submit disabled: ' + submitDisabled);

  /* ---- 第四阶段：设置页有「登录页外观」导入入口 ---- */
  await win.webContents.executeJavaScript(`
    (() => {
      const cancel = [...document.querySelectorAll('.modal-foot .btn')].find(b => b.textContent.includes('取消'));
      if (cancel) cancel.click();
      const nav = [...document.querySelectorAll('.nav-item')].find(el => el.textContent.includes('设置'));
      if (nav) nav.click();
      return true;
    })()
  `).catch((e) => log('nav-set err: ' + e.message));
  await new Promise((r) => setTimeout(r, 1200));

  const setText = String(await win.webContents.executeJavaScript('document.body.innerText')).replace(/\n+/g, ' | ');
  log('settings body: ' + setText.slice(0, 260));

  const bgChecks = {
    hasSettingsNav: (await win.webContents.executeJavaScript(
      'document.querySelectorAll(".set-nav-item").length'
    ).catch(() => 0)) === 6,
    hasSixCategories: ['基础信息', '外观与背景', '积分规则', '安全设置', '云端同步', '数据与备份']
      .every((t) => setText.includes(t)),
    pageFadeAnimation: (await win.webContents.executeJavaScript(
      'getComputedStyle(document.querySelector(".set-pane")).animationName'
    ).catch(() => '')) === 'pageBlurIn',
  };

  /* ---- 外观与背景栏目：多张背景 + 个性化配色同屏 ---- */
  await win.webContents.executeJavaScript(`
    (() => {
      const b = [...document.querySelectorAll('.set-nav-item')].find(el => el.textContent.includes('外观与背景'));
      if (b) b.click();
      return !!b;
    })()
  `).catch((e) => log('nav-appearance err: ' + e.message));
  await new Promise((r) => setTimeout(r, 700));

  const apText = String(await win.webContents.executeJavaScript('document.body.innerText')).replace(/\n+/g, ' | ');
  const apStyle = await win.webContents.executeJavaScript(`
    (() => {
      const fileInput = document.querySelector('input[type=file]');
      const swatches = document.querySelectorAll('.theme-swatch').length;
      const color = document.querySelector('#theme-color-input');
      return JSON.stringify({
        thumbs: document.querySelectorAll('.bg-thumb').length,
        hasAdd: !!document.querySelector('.bg-add'),
        multiple: fileInput ? fileInput.multiple : false,
        swatches,
        colorPicker: color ? color.type : '',
        accentVars: getComputedStyle(document.documentElement).getPropertyValue('--primary').trim(),
      });
    })()
  `).catch((e) => 'err:' + e.message);
  let apObj = {};
  try { apObj = JSON.parse(apStyle); } catch (e) { apObj = {}; }
  log('appearance panel: ' + apStyle);

  Object.assign(bgChecks, {
    bgThumbListed: Number(apObj.thumbs || 0) >= 1,
    bgAddButton: apObj.hasAdd === true,
    bgFileMultiple: apObj.multiple === true,
    themePresets: Number(apObj.swatches || 0) >= 5,
    themeColorPicker: apObj.colorPicker === 'color',
    themeVarsFromSettings: apObj.accentVars === '#0F766E',
    // 液态玻璃独立开关：文案与开关同在「外观与背景」，且默认开启
    hasLiquidGlassSwitch: apText.includes('液态玻璃效果')
      && (await win.webContents.executeJavaScript(`
        (() => {
          const lines = [...document.querySelectorAll('.rule-line')];
          const line = lines.find((l) => l.textContent.includes('液态玻璃效果'));
          const sw = line ? line.querySelector('.switch') : null;
          return sw ? 'on' : 'missing';
        })()
      `).catch(() => 'err')) === 'on',
  });

  /* ---- 个性化配色：点预设色要立刻预览（改 :root 变量） ---- */
  const themePreview = await win.webContents.executeJavaScript(`
    (async () => {
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      const btns = [...document.querySelectorAll('.theme-swatch')];
      const before = getComputedStyle(document.documentElement).getPropertyValue('--primary').trim();
      if (btns.length < 2) return 'no-swatches';
      btns[1].click();
      await wait(400);
      const after = getComputedStyle(document.documentElement).getPropertyValue('--primary').trim();
      const activeLabel = document.querySelector('.theme-swatch.active') ? document.querySelector('.theme-swatch.active').textContent.trim() : '';
      return before + '|' + after + '|' + activeLabel + '|' + (after !== before);
    })()
  `).catch((e) => 'err:' + e.message);
  log('theme preview: ' + themePreview);
  bgChecks.themePreviewLive = String(themePreview).split('|')[3] === 'true';

  Object.entries(bgChecks).forEach(([k, v]) => log((v ? 'PASS ' : 'FAIL ') + k));

  /* ---- 安全设置：切换密码类型时字段标签要跟着变 ---- */
  await win.webContents.executeJavaScript(`
    (() => {
      const b = [...document.querySelectorAll('.set-nav-item')].find(el => el.textContent.includes('安全设置'));
      if (b) b.click();
      return !!b;
    })()
  `).catch((e) => log('nav-security err: ' + e.message));
  await new Promise((r) => setTimeout(r, 700));

  const pwRes = await win.webContents.executeJavaScript(`
    (async () => {
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      const out = {};
      const labels = () => [...document.querySelectorAll('.field-label')].map((l) => l.textContent.trim());
      const setVal = (el, v) => {
        const d = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        d.call(el, v);
        el.dispatchEvent(new Event('input', { bubbles: true }));
      };

      // 1) 默认关闭：修改密码里不应出现「操作密码」，页面上应有「启用」按钮
      const selAny = [...document.querySelectorAll('select.select')].find((s) => [...s.options].some((o) => o.textContent.includes('密码')));
      out.hasSel = !!selAny;
      out.onlyLoginBefore = !!selAny && ![...selAny.options].some((o) => o.textContent.trim() === '操作密码');
      out.hasEnableBtn = [...document.querySelectorAll('button')].some((b) => b.textContent.trim() === '启用');

      // 2) 点「启用」→ 弹窗填两次密码 → 确认启用
      const en = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === '启用');
      if (en) en.click();
      await wait(500);
      const modal = document.querySelector('.modal');
      out.modalOpened = !!modal;
      if (modal) {
        const ins = [...modal.querySelectorAll('input')];
        if (ins[0]) setVal(ins[0], 'op456');
        if (ins[1]) setVal(ins[1], 'op456');
        await wait(300);
        const okBtn = [...modal.querySelectorAll('.modal-foot .btn')].find((b) => b.textContent.trim() === '启用');
        out.confirmFound = !!okBtn;
        if (okBtn) okBtn.click();
      }
      await wait(1000);
      out.modalClosed = !document.querySelector('.modal');
      out.errText = (document.querySelector('.modal .err') || {}).textContent || '';

      // 3) 启用后 select 里出现「操作密码」，切换时标签联动
      const sel = [...document.querySelectorAll('select.select')].find((s) => [...s.options].some((o) => o.textContent.includes('操作密码')));
      out.hasOpOption = !!sel;
      if (sel) {
        out.beforeHasLogin = labels().includes('当前登录密码');
        sel.value = 'op';
        sel.dispatchEvent(new Event('change', { bubbles: true }));
        await wait(500);
        const afterOp = labels();
        out.opHasOp = afterOp.includes('当前操作密码');
        out.opNoLogin = !afterOp.includes('当前登录密码');
        sel.value = 'login';
        sel.dispatchEvent(new Event('change', { bubbles: true }));
        await wait(500);
        out.backHasLogin = labels().includes('当前登录密码');
      }
      out.hasPwEyes = document.querySelectorAll('.set-card .pw-eye').length;
      return JSON.stringify(out);
    })()
  `).catch((e) => 'err:' + e.message);
  let pwObj = {};
  try { pwObj = JSON.parse(pwRes); } catch (e) { pwObj = { parseError: String(pwRes) }; }
  log('pw labels: ' + pwRes);

  const pwChecks = {
    hasPasswordSelect: pwObj.hasSel === true,
    opOffByDefault: pwObj.onlyLoginBefore === true && pwObj.hasEnableBtn === true,
    opEnableModalOpens: pwObj.modalOpened === true && pwObj.confirmFound === true,
    opEnableTakesEffect: pwObj.modalClosed === true && pwObj.hasOpOption === true,
    labelBeforeLogin: pwObj.beforeHasLogin === true,
    labelSwitchesToOp: pwObj.opHasOp === true && pwObj.opNoLogin === true,
    labelSwitchesBack: pwObj.backHasLogin === true,
    pwFieldsHaveEye: Number(pwObj.hasPwEyes || 0) >= 3,
  };
  Object.entries(pwChecks).forEach(([k, v]) => log((v ? 'PASS ' : 'FAIL ') + k));

  const all = { ...gateChecks, ...checks, ...bgChecksLogin, ...dashChecks, ...toastChecks, ...redeemChecks, ...adjustChecks, ...bgChecks, ...pwChecks };
  log('RESULT ' + (Object.values(all).every(Boolean) ? 'ALL-PASS' : 'HAS-FAIL'));
  flush();
  app.exit(Object.values(all).every(Boolean) ? 0 : 3);
}

main().catch((e) => { log('ERROR: ' + (e && e.stack ? e.stack : e)); flush(); app.exit(2); });
process.on('unhandledRejection', (e) => log('UNHANDLED: ' + e));
