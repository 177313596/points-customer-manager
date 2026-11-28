import React from 'react';

/* 骨架屏：先按真实内容的布局摆灰色占位块，再在整个骨架上盖一层半透明光，
   从左往右匀速平移扫过（1.5s 一轮，只动 transform，交给合成层走）。
   进度条只跟着"真实完成的事件"走，不自己跑假进度。 */

export function ProgressBar({ value = 0, tone = '' }) {
  const p = Math.max(0, Math.min(1, Number(value) || 0));
  return (
    <div className={'sk-progress' + (tone ? ' ' + tone : '')} aria-hidden="true">
      <i style={{ transform: `translate3d(${(p - 1) * 100}%,0,0)` }} />
    </div>
  );
}

export function Shimmer() {
  return <div className="sk-shine" aria-hidden="true" />;
}

/* 占位块：宽度 / 高度用 inline style 传，颜色由 class 决定 */
function Bar({ w = '100%', h = 12, dark = false, style }) {
  return (
    <span
      className={'sk' + (dark ? ' sk-on-dark' : '')}
      style={{ width: typeof w === 'number' ? w + 'px' : w, height: h, ...(style || {}) }}
    />
  );
}

/* —— 登录 / 初始化：品牌栏 + 登录卡 —— */
export function LoginSkeleton({ progress = 0 }) {
  return (
    <div className="login-wrap sk-scope">
      <aside className="login-brand">
        <span className="sk sk-logo" />
        <Bar w="64%" h={27} dark style={{ marginTop: 26 }} />
        <Bar w="46%" h={12} dark style={{ marginTop: 12 }} />
        <div className="sk-list">
          {[72, 58, 64, 52].map((w, i) => (
            <div className="sk-row" key={i}>
              <span className="sk sk-dot sk-on-dark" />
              <Bar w={w + '%'} h={11} dark />
            </div>
          ))}
        </div>
        <Bar w="72%" h={10} dark style={{ marginTop: 'auto' }} />
      </aside>

      <main className="login-main">
        <div className="login-card sk-card">
          <Bar w={74} h={20} style={{ borderRadius: 999 }} />
          <Bar w="56%" h={22} style={{ marginTop: 14 }} />
          <Bar w="84%" h={11} style={{ marginTop: 10 }} />
          <Bar w="24%" h={10} style={{ marginTop: 22 }} />
          <Bar w="100%" h={40} style={{ marginTop: 6, borderRadius: 10 }} />
          <Bar w="24%" h={10} style={{ marginTop: 14 }} />
          <Bar w="100%" h={40} style={{ marginTop: 6, borderRadius: 10 }} />
          <Bar w="100%" h={40} style={{ marginTop: 18, borderRadius: 10 }} />
          <div className="sk-progress-wrap"><ProgressBar value={progress} /></div>
        </div>
      </main>

      <Shimmer />
    </div>
  );
}

/* —— 主界面：菜单卡 + 顶栏 + 工作台的统计卡 / 快捷行 / 两块内容卡 —— */
export function MainSkeleton({ progress = 0 }) {
  return (
    <div className="shell sk-scope">
      <aside className="sidebar">
        <div className="side-brand">
          <span className="sk sk-logo sm sk-on-dark" />
          <div className="sk-col">
            <Bar w={88} h={13} dark />
            <Bar w={52} h={10} dark style={{ marginTop: 6 }} />
          </div>
        </div>

        <nav className="side-nav">
          {[0, 1, 2, 3, 4].map((i) => (
            <span key={i} className="sk sk-nav sk-on-dark" />
          ))}
        </nav>

        <div className="side-foot">
          <div className="side-stat">
            <Bar w={62} h={10} dark />
            <Bar w={26} h={12} dark />
          </div>
          <div className="side-stat">
            <Bar w={70} h={10} dark />
            <Bar w={30} h={12} dark />
          </div>
          <Bar w="100%" h={34} dark style={{ marginTop: 4, borderRadius: 9 }} />
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div className="sk-col">
            <Bar w={112} h={19} />
            <Bar w={198} h={12} style={{ marginTop: 8 }} />
          </div>
          <div className="topbar-right">
            <Bar w={106} h={28} style={{ borderRadius: 999 }} />
            <Bar w={128} h={28} style={{ borderRadius: 999 }} />
          </div>
        </header>

        <div className="content">
          <div className="sk-progress-wrap"><ProgressBar value={progress} /></div>

          <div className="dash">
            <section className="stats">
              {[0, 1, 2].map((i) => (
                <div className="stat-card sk-box" key={i}>
                  <div className="sk-row">
                    <Bar w={26} h={26} style={{ borderRadius: 8 }} />
                    <Bar w={74} h={11} />
                  </div>
                  <Bar w="48%" h={24} style={{ marginTop: 12 }} />
                  <Bar w="64%" h={10} style={{ marginTop: 9 }} />
                </div>
              ))}
            </section>

            <section className="quick-row">
              <Bar w={112} h={36} style={{ borderRadius: 10 }} />
              <span className="quick-spacer" />
              <Bar w={98} h={36} style={{ borderRadius: 10 }} />
              <Bar w={96} h={36} style={{ borderRadius: 10 }} />
              <Bar w={76} h={36} style={{ borderRadius: 10 }} />
              <Bar w={98} h={36} style={{ borderRadius: 10 }} />
            </section>

            <div className="dash-grid">
              {[0, 1].map((i) => (
                <div className="sk-box sk-box-card" key={i}>
                  <div className="sk-box-head">
                    <Bar w={54} h={15} />
                    <Bar w={142} h={10} />
                  </div>
                  <div className="sk-box-body">
                    <Bar w="100%" h={38} style={{ borderRadius: 10 }} />
                    <Bar w="100%" h={38} style={{ borderRadius: 10 }} />
                    <Bar w="100%" h={46} style={{ borderRadius: 10 }} />
                  </div>
                </div>
              ))}
            </div>

            {/* 近 7 日消费：右边一根高柱、左边几根短柱 */}
            <div className="sk-box sk-box-card">
              <div className="sk-box-head">
                <Bar w={82} h={15} />
                <Bar w={64} h={10} />
              </div>
              <div className="sk-bars">
                {[8, 8, 8, 8, 8, 8, 150].map((h, i) => (
                  <div className="sk-bar-col" key={i}>
                    <Bar w={12} h={h} style={{ borderRadius: 4 }} />
                    <Bar w={30} h={9} style={{ marginTop: 8 }} />
                  </div>
                ))}
              </div>
            </div>

            {/* 积分榜：标题 + 三行 */}
            <div className="sk-box sk-box-card">
              <div className="sk-box-head">
                <Bar w={62} h={15} />
                <Bar w={76} h={10} />
              </div>
              <div className="sk-rows">
                {[0, 1, 2].map((i) => (
                  <div className="sk-row" key={i} style={{ justifyContent: 'space-between' }}>
                    <div className="sk-row" style={{ gap: 12 }}>
                      <span className="sk sk-dot" />
                      <Bar w={54} h={12} />
                      <Bar w={40} h={10} />
                    </div>
                    <div className="sk-row" style={{ gap: 20 }}>
                      <Bar w={36} h={10} />
                      <Bar w={46} h={10} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </main>

      <Shimmer />
    </div>
  );
}
