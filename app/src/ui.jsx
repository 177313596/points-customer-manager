import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const PATHS = {
  grid: (<><rect x="3" y="3" width="7.5" height="7.5" rx="1.6" /><rect x="13.5" y="3" width="7.5" height="7.5" rx="1.6" /><rect x="3" y="13.5" width="7.5" height="7.5" rx="1.6" /><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.6" /></>),
  users: (<><circle cx="9.5" cy="8" r="3.3" /><path d="M3 20.2c0-3.6 2.9-6.1 6.5-6.1s6.5 2.5 6.5 6.1" /><circle cx="17.2" cy="9.2" r="2.4" /><path d="M16 14.4c3 .4 5 2.4 5 5.6" /></>),
  receipt: (<><path d="M6 3h12v18l-2.4-1.7-1.8 1.7-2-1.7-2 1.7L8.4 21.3 6 23z" /><path d="M9.2 8.3h5.6M9.2 12h5.6M9.2 15.7h3.4" /><path d="M6 3v20" /></>),
  upload: (<><path d="M12 16.5V4.2" /><path d="M7.2 9l4.8-4.8L16.8 9" /><path d="M4.2 16.5v2.4a2.2 2.2 0 0 0 2.2 2.2h11.2a2.2 2.2 0 0 0 2.2-2.2v-2.4" /></>),
  download: (<><path d="M12 4v12.3" /><path d="M7.2 11.5 12 16.3l4.8-4.8" /><path d="M4.2 16.5v2.4a2.2 2.2 0 0 0 2.2 2.2h11.2a2.2 2.2 0 0 0 2.2-2.2v-2.4" /></>),
  settings: (<><path d="M4 7h9M17 7h3M4 12h3M11 12h9M4 17h9M17 17h3" /><circle cx="15" cy="7" r="2.2" /><circle cx="9" cy="12" r="2.2" /><circle cx="15" cy="17" r="2.2" /></>),
  lock: (<><rect x="4.5" y="10.5" width="15" height="10" rx="2.2" /><path d="M8 10.5V7.6a4 4 0 0 1 8 0v2.9" /><circle cx="12" cy="15.5" r="1.4" /></>),
  search: (<><circle cx="10.8" cy="10.8" r="6.4" /><path d="M15.6 15.6 20.5 20.5" /></>),
  plus: (<><path d="M12 5.5v13M5.5 12h13" /></>),
  x: (<><path d="M6.5 6.5l11 11M17.5 6.5l-11 11" /></>),
  check: (<><path d="M4.8 12.6l4.8 4.8 9.6-9.8" /></>),
  alert: (<><path d="M12 4.2 21 19.6H3z" /><path d="M12 10v4.2" /><circle cx="12" cy="17" r=".9" fill="currentColor" /></>),
  cloud: (<><path d="M7.4 18.5A4.3 4.3 0 0 1 7 10a5.3 5.3 0 0 1 10.3 1 3.6 3.6 0 0 1-.6 7.5z" /></>),
  gift: (<><rect x="4" y="9.8" width="16" height="11" rx="1.6" /><path d="M2.8 9.8h18.4" /><path d="M12 9.8v11" /><path d="M12 9.8c-1.2-3.4-4.8-4-5.4-1.8-.4 1.5 2.4 1.8 5.4 1.8" /><path d="M12 9.8c1.2-3.4 4.8-4 5.4-1.8.4 1.5-2.4 1.8-5.4 1.8" /></>),
  wallet: (<><rect x="3.2" y="6.2" width="17.6" height="13.2" rx="2.4" /><path d="M3.2 10.4h17.6" /><circle cx="16.6" cy="14.9" r="1.2" /></>),
  chart: (<><path d="M4 20V5" /><path d="M4 20h16" /><rect x="7.2" y="12.6" width="2.8" height="5" rx=".8" /><rect x="12" y="9" width="2.8" height="8.6" rx=".8" /><rect x="16.8" y="5.6" width="2.8" height="12" rx=".8" /></>),
  refresh: (<><path d="M19.5 12a7.6 7.6 0 1 1-2.6-5.7" /><path d="M19.6 4.4v4.2h-4.2" /></>),
  edit: (<><path d="M4.4 19.6l.9-4.2L16 4.7a2 2 0 0 1 2.8 0l.5.5a2 2 0 0 1 0 2.8L8.6 18.7z" /><path d="M14.6 6.1l3.3 3.3" /></>),
  trash: (<><path d="M4.6 7h14.8" /><path d="M9.4 7V4.8h5.2V7" /><path d="M6.6 7l.9 12.2a1.6 1.6 0 0 0 1.6 1.5h6a1.6 1.6 0 0 0 1.6-1.5L18 7" /></>),
  chevronLeft: (<><path d="M14.5 5.5 8 12l6.5 6.5" /></>),
  chevronRight: (<><path d="M9.5 5.5 16 12l-6.5 6.5" /></>),
  database: (<><ellipse cx="12" cy="6" rx="8" ry="3" /><path d="M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6" /><path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" /></>),
  shield: (<><path d="M12 3l7.2 2.7v5.4c0 4.4-3 7.5-7.2 9.3-4.2-1.8-7.2-4.9-7.2-9.3V5.7z" /><path d="M8.9 12.2l2.2 2.2 4-4.3" /></>),
  arrowRight: (<><path d="M4.5 12h14" /><path d="M13.6 6.8 19 12l-5.4 5.2" /></>),
  clock: (<><circle cx="12" cy="12" r="8.2" /><path d="M12 7.4V12l3.2 2" /></>),
  spark: (<><path d="M12 3.4l1.9 5 5 1.9-5 1.9-1.9 5-1.9-5-5-1.9 5-1.9z" /></>),
  exit: (<><path d="M9.4 4.5H5.6a1.6 1.6 0 0 0-1.6 1.6v11.8a1.6 1.6 0 0 0 1.6 1.6h3.8" /><path d="M14 8l4 4-4 4" /><path d="M18 12H8.6" /></>),
  image: (<><rect x="3.2" y="4.6" width="17.6" height="14.8" rx="2.2" /><circle cx="8.6" cy="9.6" r="1.6" /><path d="M4.4 17.4 9.8 12l4.2 4.2 2.6-2.6 3.4 3.6" /></>),
  eye: (<><path d="M2.2 12c2.4-4 5.6-6 9.8-6s7.4 2 9.8 6c-2.4 4-5.6 6-9.8 6s-7.4-2-9.8-6z" /><circle cx="12" cy="12" r="2.7" /></>),
  eyeOff: (<><path d="M3.4 3.4l17.2 17.2" /><path d="M2.2 12c2.4-4 5.6-6 9.8-6 1.3 0 2.5.2 3.6.6" /><path d="M21.8 12c-2.4 4-5.6 6-9.8 6-1.3 0-2.5-.2-3.6-.6" /><circle cx="12" cy="12" r="2.7" /></>),
};

export function Icon({ name, size = 18, stroke = 1.7, className = '' }) {
  const p = PATHS[name];
  if (!p) return null;
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24"
         fill="none" stroke="currentColor" strokeWidth={stroke}
         strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {p}
    </svg>
  );
}

/** 液态玻璃折射滤镜定义。CSS 里用 backdrop-filter: url(#lg-refract) 引用，
 *  由 feTurbulence + feDisplacementMap 把背景“掰弯”，做出真实透镜感而不是单纯模糊。
 *  只挂一次即可（svg 宽高为 0，不占布局）。 */
export function GlassDefs() {
  return (
    <svg width="0" height="0" aria-hidden="true" style={{ position: 'absolute', pointerEvents: 'none' }}>
      <defs>
        <filter id="lg-refract" x="-12%" y="-12%" width="124%" height="124%" colorInterpolationFilters="sRGB">
          <feTurbulence type="fractalNoise" baseFrequency="0.0055 0.0085" numOctaves="2" seed="11" result="noise" />
          <feGaussianBlur in="noise" stdDeviation="7" result="soft" />
          <feDisplacementMap in="SourceGraphic" in2="soft" scale="24" xChannelSelector="R" yChannelSelector="G" />
        </filter>
        <filter id="lg-refract-strong" x="-14%" y="-14%" width="128%" height="128%" colorInterpolationFilters="sRGB">
          <feTurbulence type="fractalNoise" baseFrequency="0.004 0.006" numOctaves="3" seed="5" result="noise" />
          <feGaussianBlur in="noise" stdDeviation="10" result="soft" />
          <feDisplacementMap in="SourceGraphic" in2="soft" scale="38" xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </defs>
    </svg>
  );
}

/** 鼠标聚光：跟着指针缓慢滑动的柔光，铺在背景层之上、内容卡片之下（标准版专属，简洁版由 CSS 关掉）
    只改 transform，走 rAF + 缓动，指针静止 2.5 秒后淡出，避免一直亮着抢注意力 */
export function Spotlight() {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    let tx = window.innerWidth * 0.62;
    let ty = window.innerHeight * 0.45;
    let cx = tx;
    let cy = ty;
    let raf = 0;
    let idleTimer = 0;

    const step = () => {
      const dx = tx - cx;
      const dy = ty - cy;
      if (Math.abs(dx) < 0.4 && Math.abs(dy) < 0.4) {
        cx = tx; cy = ty;
        el.style.transform = `translate3d(${Math.round(cx)}px, ${Math.round(cy)}px, 0)`;
        raf = 0;
        return;
      }
      cx += dx * 0.13;
      cy += dy * 0.13;
      el.style.transform = `translate3d(${Math.round(cx)}px, ${Math.round(cy)}px, 0)`;
      raf = requestAnimationFrame(step);
    };
    const kick = () => { if (!raf) raf = requestAnimationFrame(step); };

    const onMove = (e) => {
      const host = el.parentElement;
      const r = host ? host.getBoundingClientRect() : { left: 0, top: 0 };
      tx = e.clientX - r.left;
      ty = e.clientY - r.top;
      el.classList.add('on');
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => el.classList.remove('on'), 4500);
      kick();
    };
    const onLeave = () => { el.classList.remove('on'); };

    el.style.transform = `translate3d(${Math.round(cx)}px, ${Math.round(cy)}px, 0)`;
    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerdown', onMove, { passive: true });
    document.addEventListener('pointerleave', onLeave, { passive: true });
    return () => {
      if (raf) cancelAnimationFrame(raf);
      clearTimeout(idleTimer);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerdown', onMove);
      document.removeEventListener('pointerleave', onLeave);
    };
  }, []);
  return <div ref={ref} className="spotlight" aria-hidden="true" />;
}

/** 带“小眼睛”的密码输入框：点击右侧图标可切换显示/隐藏 */
export function PasswordInput({
  value, onChange, placeholder, className = 'input input-lg',
  autoFocus = false, onKeyDown, name, disabled,
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="pw-wrap">
      <input
        className={className + ' pw-input'}
        type={show ? 'text' : 'password'}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        autoFocus={autoFocus}
        onKeyDown={onKeyDown}
        name={name}
        disabled={disabled}
        autoComplete="off"
        spellCheck={false}
      />
      <button
        type="button"
        className="pw-eye"
        onClick={() => setShow((s) => !s)}
        title={show ? '隐藏密码' : '显示密码'}
        aria-label={show ? '隐藏密码' : '显示密码'}
        tabIndex={-1}
      >
        <Icon name={show ? 'eyeOff' : 'eye'} size={17} />
      </button>
    </div>
  );
}

export function Modal({ open, title, subtitle, onClose, children, footer, width = 480 }) {  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose && onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (open && ref.current) {
      const first = ref.current.querySelector('input, textarea, select');
      if (first) setTimeout(() => first.focus(), 60);
    }
  }, [open]);

  if (!open) return null;
  // 弹窗挂到 body 上（portal）：页面容器 .page-fade 带 transform/filter 动画，
  // 会把 position:fixed 的参照系变成它自己，导致遮罩只糊住内容区、盖不住侧栏。
  return createPortal((
    <div className="modal-mask" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose && onClose(); }}>
      <div className="modal" style={{ width }} ref={ref}>
        <div className="modal-head">
          <div>
            <h3>{title}</h3>
            {subtitle ? <p className="modal-sub">{subtitle}</p> : null}
          </div>
          <button className="icon-btn" onClick={onClose} title="关闭"><Icon name="x" size={16} /></button>
        </div>
        <div className="modal-body">{children}</div>
        {footer ? <div className="modal-foot">{footer}</div> : null}
      </div>
    </div>
  ), document.body);
}

export function Field({ label, hint, children, horizontal }) {
  return (
    <div className={'field' + (horizontal ? ' field-h' : '')}>
      {label ? <label className="field-label">{label}</label> : null}
      <div className="field-ctl">
        {children}
        {hint ? <p className="field-hint">{hint}</p> : null}
      </div>
    </div>
  );
}

export function Empty({ icon = 'database', title, desc, action }) {
  return (
    <div className="empty">
      <div className="empty-ic"><Icon name={icon} size={26} stroke={1.5} /></div>
      <h4>{title}</h4>
      {desc ? <p>{desc}</p> : null}
      {action}
    </div>
  );
}

export function Switch({ checked, onChange, label, disabled = false }) {
  return (
    <button
      type="button"
      className={'switch' + (checked ? ' on' : '') + (disabled ? ' disabled' : '')}
      disabled={disabled}
      onClick={() => { if (!disabled) onChange(!checked); }}
    >
      <span className="switch-dot" />
      {label ? <span className="switch-label">{label}</span> : null}
    </button>
  );
}
