import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { api, fmtMoney, relativeTime } from './utils';
import { Icon, Modal, GlassDefs, NavPill, RollNumber } from './ui';
import Login from './components/Login';
import Dashboard from './components/Dashboard';
import Customers from './components/Customers';
import Records from './components/Records';
import DataIO from './components/DataIO';
import SettingsPage from './components/SettingsPage';
import { MainSkeleton } from './skeleton';
import { applyTheme } from './theme';
import brandLogo from './assets/brand-logo.png';

const PAGES = [
  { key: 'dashboard', label: '工作台', icon: 'grid', desc: '今日经营概览与快捷操作' },
  { key: 'customers', label: '顾客管理', icon: 'users', desc: '姓名 / 班级检索，积分与余额管理' },
  { key: 'records', label: '消费记录', icon: 'receipt', desc: '每笔记录精确到秒，可筛选与导出' },
  { key: 'io', label: '导入导出', icon: 'upload', desc: 'Excel / CSV 批量进出，账目可迁移' },
  { key: 'settings', label: '设置', icon: 'settings', desc: '积分规则、云端同步、密码与备份' },
];

export default function App() {
  const [authed, setAuthed] = useState(false);
  const [settings, setSettings] = useState(null);
  const [overview, setOverview] = useState(null);
  const [page, setPage] = useState('dashboard');
  const [settingsTab, setSettingsTab] = useState(''); // 从登录页「去设置操作密码」跳进来时用
  const [bump, setBump] = useState(0);
  const [toast, setToast] = useState(null);
  const [opOpen, setOpOpen] = useState(false);
  const [opPw, setOpPw] = useState('');
  const [opErr, setOpErr] = useState('');
  const [elevatedUntil, setElevatedUntil] = useState(0);
  const [nowTs, setNowTs] = useState(Date.now());
  const [syncState, setSyncState] = useState({ at: '', error: '' });
  /* 进入主界面的加载：entryReady = 首屏数据齐了（settings + stats），dataDone 是真实完成的步数。
     骨架屏只在这段用；之后的刷新不会再回到骨架。 */
  const [entryReady, setEntryReady] = useState(false);
  const [dataDone, setDataDone] = useState(0);
  const [rollDone, setRollDone] = useState(false); // 数字只滚一次：进主界面滚完就置位
  const DATA_STEPS = 2;
  /* 注册完成后延迟到主界面才弹出的「可设置二级密码」提醒 */
  const [opPrompt, setOpPrompt] = useState(false);
  const [opPromptOpen, setOpPromptOpen] = useState(false);
  const navRef = useRef(null);
  const opResolver = useRef(null);
  const toastTimer = useRef(null);
  const [appBgIdx, setAppBgIdx] = useState(0);

  // 界面模式：standard（标准版）/ lite（简洁版）。简洁版不加载背景图、不做模糊与动画
  const uiMode = (settings && settings.ui_mode) === 'lite' ? 'lite' : 'standard';
  const lite = uiMode === 'lite';

  // 登录后的主界面背景：沿用登录页的那组背景图（没有就保持原来的浅色底）；简洁版直接不加载
  const appBgs = useMemo(() => {
    if (!settings || lite) return [];
    if (Array.isArray(settings.login_bgs) && settings.login_bgs.length) return settings.login_bgs;
    return settings.login_bg ? [settings.login_bg] : [];
  }, [settings, lite]);
  const appBgKey = appBgs.join('|');
  const appBgRotate = !lite && !!(settings && settings.login_bg_rotate);

  // 简洁版给 body 打标记，CSS 里统一关掉动画 / 模糊 / 毛玻璃
  useEffect(() => {
    document.body.classList.toggle('ui-lite', lite);
    return () => document.body.classList.remove('ui-lite');
  }, [lite]);

  /* 液态玻璃：与界面模式正交的独立开关。简洁版强制关闭，避免折射的 GPU 开销；
     其余情况看 settings.liquid_glass（默认开启，可在设置里手动关掉只留普通毛玻璃） */
  const liquidOn = !lite && !(settings && settings.liquid_glass === false);
  useEffect(() => {
    document.body.classList.toggle('ui-liquid', liquidOn);
    return () => document.body.classList.remove('ui-liquid');
  }, [liquidOn]);

  useEffect(() => { setAppBgIdx(0); }, [appBgKey]);

  // 自动切换默认关闭；设置里打开后主界面同样每 8 秒换一张
  useEffect(() => {
    if (!appBgRotate || appBgs.length < 2) return;
    const t = setInterval(() => setAppBgIdx((i) => (i + 1) % appBgs.length), 8000);
    return () => clearInterval(t);
  }, [appBgRotate, appBgKey]);

  const notify = useCallback((msg, type = 'ok') => {
    setToast({ msg, type });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3200);
  }, []);

  /* 首屏数据：settings 与 stats 两个真实请求，每完成一个就把进度条往前挪一格。
     进度只来自这两个请求真正 resolve 的时刻，不做任何假推进。 */
  const loadAll = useCallback(async () => {
    setDataDone(0);
    const jobs = [
      api.settings.get().then((s) => { if (s && s.ok) setSettings(s.data); }),
      api.stats().then((o) => { if (o && o.ok) setOverview(o.data); }),
    ];
    await Promise.all(jobs.map((p) => p
      .catch(() => { })
      .then(() => setDataDone((n) => n + 1))));
  }, []);

  // 个性化配色：settings.theme 一变就写进 :root
  useEffect(() => {
    if (!settings) return;
    applyTheme(settings.theme);
  }, [settings && settings.theme && settings.theme.accent]);

  /* 登录成功 → 主界面：先摆骨架屏，等两个真实请求都回来，再留一点时间让填充条真的走到位
     （至少露 520ms；数据回来得晚也至少留 320ms 把最后一次位移放完），然后切真实界面。 */
  useEffect(() => {
    if (!authed) { setEntryReady(false); setDataDone(0); return; }
    let alive = true;
    const t0 = performance.now();
    (async () => {
      await loadAll();
      const elapsed = performance.now() - t0;
      const rest = Math.max(520 - elapsed, 320);
      await new Promise((r) => setTimeout(r, rest));
      if (alive) setEntryReady(true);
    })();
    return () => { alive = false; };
  }, [authed, loadAll]);

  const refresh = useCallback(() => {
    loadAll();
    setBump((x) => x + 1);
  }, [loadAll]);

  const askOp = useCallback(() => new Promise((resolve) => {
    opResolver.current = resolve;
    setOpPw('');
    setOpErr('');
    setOpOpen(true);
  }), []);

  const call = useCallback(async (fn) => {
    let r = await fn();
    if (r.ok) return r;
    if (r.code === 'NEED_OP') {
      const ok = await askOp();
      if (!ok) return r;
      r = await fn();
    }
    if (!r.ok && r.code === 'UNAUTH') {
      setAuthed(false);
      notify('登录状态已失效，请重新登录', 'warn');
    }
    return r;
  }, [askOp, notify]);

  async function submitOp(e) {
    e.preventDefault();
    const r = await api.verifyOp(opPw);
    if (!r.ok) { setOpErr(r.error); return; }
    setElevatedUntil(r.data.expires_at || r.data.elevatedUntil || 0);
    setOpOpen(false);
    if (opResolver.current) { opResolver.current(true); opResolver.current = null; }
    notify('操作授权已开启，5 分钟内有操作即持续有效');
  }

  /* 谁在用软件：鼠标 / 键盘 / 滚轮 / 触摸都算一次“操作”，用来给操作授权续期。
     节流 5 秒，避免频繁 IPC；没有操作时授权到点自然失效。 */
  useEffect(() => {
    if (!authed) return;
    let last = 0;
    const ping = () => {
      const now = Date.now();
      if (now - last < 5000) return;
      last = now;
      api.activity().then((r) => {
        if (!r || !r.ok || !r.data) return;
        setElevatedUntil(r.data.op_verified ? (r.data.expires_at || 0) : 0);
      });
    };
    const evs = ['mousedown', 'keydown', 'wheel', 'touchstart', 'pointerdown'];
    evs.forEach((e) => window.addEventListener(e, ping, { passive: true }));
    return () => evs.forEach((e) => window.removeEventListener(e, ping));
  }, [authed]);

  function closeOp() {
    setOpOpen(false);
    if (opResolver.current) { opResolver.current(false); opResolver.current = null; }
  }

  useEffect(() => {
    api.onCloudSync((d) => { setSyncState({ at: d.at, error: '' }); refresh(); });
    api.onCloudError((d) => setSyncState((s) => ({ ...s, error: d.message })));
  }, [refresh]);

  useEffect(() => {
    if (!authed) return;
    const t = setInterval(() => setNowTs(Date.now()), 1000);
    return () => clearInterval(t);
  }, [authed]);

  /* 卡片入场：进主界面 / 换页面时，把当前页的卡片按 DOM 顺序编号（--reveal-i），
     CSS 用编号算出 0.05s 的错峰延迟，每张卡从 blur(14px) + 透明回到正常，700ms。
     用 layout effect 是为了在首次绘制之前就把类名挂上，否则会先看到一帧"已经清晰"的卡片。 */
  useLayoutEffect(() => {
    if (!entryReady) return;
    const root = document.querySelector('.content');
    if (!root) return;
    const cards = Array.from(root.querySelectorAll('.card, .stat-card'));
    cards.forEach((el, i) => {
      el.style.setProperty('--reveal-i', String(Math.min(i, 14)));
      el.classList.add('reveal');
    });
  }, [page, entryReady]);

  /* 注册完成时的那次「可设置二级密码」提醒，等主界面入场动画（卡片 700ms + 错峰）走完再弹 */
  useEffect(() => {
    if (!opPrompt || !entryReady) return;
    const t = setTimeout(() => setOpPromptOpen(true), 1100);
    return () => clearTimeout(t);
  }, [opPrompt, entryReady]);

  /* 数字滚动只在"这次进入主界面"发生一次：滚完（900ms + 余量）后置位，
     之后在工作台/其它页面之间来回切不再重滚 */
  useEffect(() => {
    if (!entryReady) { setRollDone(false); return; }
    const t = setTimeout(() => setRollDone(true), 1200);
    return () => clearTimeout(t);
  }, [entryReady]);

  function closeOpPrompt(goSettings) {
    setOpPromptOpen(false);
    setOpPrompt(false);
    if (goSettings) { setSettingsTab('security'); setPage('settings'); }
  }

  if (!authed) return <><Login onAuthed={(opts = {}) => {
    setAuthed(true);
    if (opts.page) { setPage(opts.page); setSettingsTab(opts.tab || ''); }
    if (opts.opPrompt) setOpPrompt(true);
  }} /><GlassDefs /><WinChrome /></>;

  // 进入主界面的加载阶段：骨架按工作台的真实布局摆，填充条只随真实请求推进
  if (!entryReady) {
    return <><MainSkeleton progress={Math.min(1, dataDone / DATA_STEPS)} /><GlassDefs /><WinChrome /></>;
  }

  const meta = PAGES.find((p) => p.key === page);
  const elevatedLeft = Math.max(0, Math.floor((elevatedUntil - nowTs) / 1000));
  const cloudOn = settings?.cloud_config?.enabled;
  const opRequired = !!(settings && settings.op_required);

  return (
    <>
    <div className="shell">
      {/* 背景图铺满整个外壳（含左侧菜单下方的间隙），菜单玻璃才能透过它 */}
      {appBgs.length ? (
        <div className="app-bg-stack" aria-hidden="true">
          <div
            key={appBgs[appBgIdx]}
            className="app-bg-layer"
            style={{ backgroundImage: `url("${appBgs[appBgIdx]}")` }}
          />
        </div>
      ) : null}
      <aside className="sidebar">
        <div className="side-brand">
          <img className="brand-logo" src={brandLogo} alt="积分客户管理系统" draggable={false} />
          <div>
            <strong>{settings?.shop_name || '积分客户管理'}</strong>
            <span>后台管理</span>
          </div>
        </div>

        <nav className="side-nav" ref={navRef}>
          <NavPill hostRef={navRef} activeKey={page} />
          {PAGES.map((p) => (
            <button key={p.key} className={'nav-item' + (page === p.key ? ' active' : '')} onClick={() => {
              if (p.key === 'settings') setSettingsTab('');
              setPage(p.key);
            }}>
              <Icon name={p.icon} size={17} />
              <span>{p.label}</span>
              {p.key === 'dashboard' && overview?.pending_sync > 0 ? <em className="dot-badge">{overview.pending_sync}</em> : null}
            </button>
          ))}
        </nav>

        <div className="side-foot">
          <div className="side-stat">
            <span>会员总数</span>
            <strong>{overview ? <RollNumber value={overview.customers || 0} /> : '—'}</strong>
          </div>
          <div className="side-stat">
            <span>待兑换积分</span>
            <strong>{overview ? <RollNumber value={overview.total_points || 0} /> : '—'}</strong>
          </div>
          <button className="btn btn-ghost btn-block" onClick={async () => { await api.logout(); setAuthed(false); }}>
            <Icon name="exit" size={15} />退出登录
          </button>
        </div>
      </aside>

      <main className={'main' + (appBgs.length ? ' has-app-bg' : '')}>
        <header className="topbar">
          <div>
            <h2>{meta.label}</h2>
            <p>{meta.desc}</p>
          </div>
          <div className="topbar-right">
            <button
              className={'chip' + (cloudOn ? ' chip-on' : '')}
              onClick={() => setPage('settings')}
              title={cloudOn ? `云同步已启用 · ${syncState.at ? relativeTime(syncState.at) : '待推送'}` : '云同步未启用'}
            >
              <Icon name="cloud" size={14} />
              {cloudOn ? '云同步已开启' : '本地模式'}
              {overview?.pending_sync > 0 ? <b>{overview.pending_sync}</b> : null}
            </button>
            {elevatedLeft > 0 ? (
              <span className="chip chip-accent"><Icon name="shield" size={14} />操作授权 {Math.floor(elevatedLeft / 60)}:{String(elevatedLeft % 60).padStart(2, '0')}</span>
            ) : !opRequired ? (
              <button className="chip" onClick={() => { setSettingsTab('security'); setPage('settings'); }} title="二级操作密码默认关闭，可在设置里开启">
                <Icon name="lock" size={14} />未启用操作密码
              </button>
            ) : (
              <button className="chip" onClick={async () => { const ok = await askOp(); if (ok) notify('操作授权已开启'); }}>
                <Icon name="lock" size={14} />未开启操作授权
              </button>
            )}
          </div>
        </header>

        {/* key={page}：切换页面时整块重挂载，触发高斯模糊淡入过渡 */}
        <div className="content">
          <div className="page-fade" key={page}>
            {page === 'dashboard' ? (
              <Dashboard settings={settings} overview={overview} call={call} refresh={refresh} notify={notify} bump={bump} rollNumbers={!rollDone} />
            ) : null}
            {page === 'customers' ? (
              <Customers settings={settings} call={call} refresh={refresh} notify={notify} bump={bump} />
            ) : null}
            {page === 'records' ? (
              <Records call={call} notify={notify} bump={bump} />
            ) : null}
            {page === 'io' ? (
              <DataIO call={call} refresh={refresh} notify={notify} />
            ) : null}
            {page === 'settings' ? (
              <SettingsPage settings={settings} call={call} refresh={refresh} notify={notify} elevatedUntil={elevatedUntil} initialTab={settingsTab} />
            ) : null}
          </div>
        </div>
      </main>

      {/* 注册完成后的提醒（此时已经进主界面）：二级操作密码默认关闭，可随时去设置里开启 */}
      <Modal
        open={opPromptOpen}
        title="初始化完成"
        subtitle="二级操作密码（可选 · 默认关闭）"
        onClose={() => closeOpPrompt(false)}
        footer={(
          <>
            <button className="btn btn-ghost" onClick={() => closeOpPrompt(false)} type="button">稍后再说</button>
            <button className="btn btn-primary" onClick={() => closeOpPrompt(true)} type="button">现在去设置</button>
          </>
        )}
      >
        <p className="io-note" style={{ marginTop: 0 }}>系统已创建完成，现在只用登录密码即可进入。</p>
        <p className="io-note">
          如需给消费、兑换、导入、修改设置等敏感操作再加一道验证，可前往「设置 → 安全设置」开启二级操作密码。
          开启后每次登录只需验证一次；之后连续 5 分钟内有操作就一直免验证，超过 5 分钟没操作才会重新要求输入（手动调整积分每次都需输入）。
        </p>
      </Modal>

      <Modal
        open={opOpen}
        title="需要操作授权"
        subtitle="该操作会改动积分或余额，请输入操作密码"
        onClose={closeOp}
        footer={(
          <>
            <button className="btn btn-ghost" onClick={closeOp} type="button">取消</button>
            <button className="btn btn-primary" onClick={submitOp} type="button">验证并继续</button>
          </>
        )}
      >
        <form onSubmit={submitOp}>
          <input
            className="input input-lg"
            type="password"
            value={opPw}
            autoFocus
            onChange={(e) => setOpPw(e.target.value)}
            placeholder="操作密码"
          />
          {opErr ? <div className="err"><Icon name="alert" size={14} />{opErr}</div> : null}
          <p className="field-hint">登录后验证一次即可；之后只要连续 5 分钟内有操作就一直有效，超过 5 分钟没动才需要重输。</p>
        </form>
      </Modal>

      {toast ? <div className={'toast ' + (toast.type || 'ok')}>{toast.msg}</div> : null}
    </div>
    <GlassDefs />
    <WinChrome />
    </>
  );
}

/* 无边框窗口的自绘窗口条：顶部可拖动区域 + 右上角 最小化 / 最大化 / 关闭 */
function WinChrome() {
  const [max, setMax] = useState(false);

  useEffect(() => {
    let alive = true;
    api.app.state().then((r) => { if (alive && r && r.ok) setMax(!!r.data.maximized); }).catch(() => { });
    if (api.onWinState) api.onWinState((d) => setMax(!!d.maximized));
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    document.body.classList.toggle('win-max', max);
    return () => { };
  }, [max]);

  return (
    <>
      <div
        className="win-drag"
        onDoubleClick={() => api.app.maximize()}
        title="拖动可移动窗口，双击可最大化/还原"
      />
      <div className="win-controls">
        <button className="win-btn" type="button" title="最小化" aria-label="最小化" onClick={() => api.app.minimize()}>
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><rect x="1" y="4.5" width="8" height="1" rx=".5" fill="currentColor" /></svg>
        </button>
        <button className="win-btn" type="button" title={max ? '还原' : '最大化'} aria-label={max ? '还原' : '最大化'} onClick={() => api.app.maximize()}>
          {max ? (
            <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
              <rect x=".6" y="2.6" width="6.4" height="6.4" rx="1.1" fill="none" stroke="currentColor" strokeWidth="1" />
              <path d="M2.9 2.1V1.7A1 1 0 0 1 3.9.7h4.4A1 1 0 0 1 9.3 1.7v4.4A1 1 0 0 1 8.3 7.1h-.5" fill="none" stroke="currentColor" strokeWidth="1" />
            </svg>
          ) : (
            <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><rect x=".8" y=".8" width="8.4" height="8.4" rx="1.4" fill="none" stroke="currentColor" strokeWidth="1" /></svg>
          )}
        </button>
        <button className="win-btn close" type="button" title="关闭" aria-label="关闭" onClick={() => api.app.close()}>
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
            <path d="M1.4 1.4l7.2 7.2M8.6 1.4L1.4 8.6" stroke="currentColor" strokeWidth="1.1" fill="none" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </>
  );
}

