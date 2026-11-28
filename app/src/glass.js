/* ============ 卡片玻璃交互 ============
   做三件事（都只改 CSS 变量，不进 React 状态，避免每帧重渲染）：
   1) 光斑位置：把指针在卡片内的坐标写进 --mx / --my（px），CSS 用径向渐变画柔光
   2) 3D 倾斜：按指针偏离卡片中心的归一化距离算 rotateX / rotateY，上限 4°，
      写进 --tx / --ty；指针移出后把两者归零，由 CSS transition 平滑弹回
   3) 边框提亮：::after 用同一组坐标画一圈只有边框受影响的亮光（CSS mask 裁成 1px 环）

   性能：pointermove 只记录坐标 + 排一次 rAF，同一帧内合并；
   简洁版（body.ui-lite）与 prefers-reduced-motion 直接不接管，只保留静态材质。 */

const TILT_MAX = 4;                       // 最大倾斜角（度）
const TARGETS = '.card, .stat-card, .login-card, .sidebar, .set-nav';
/* 倾斜只在工作台里生效：其它页面 / 登录卡 / 菜单 / 设置二级栏目只保留光斑与边框提亮，
   悬停时卡片本身不跟着指针转（v1.2.0 起） */
const TILT_SCOPE = '.dash';

let installed = false;

export function initGlassCards() {
  if (installed || typeof window === 'undefined') return;
  installed = true;

  const timers = new WeakMap();           // 每张卡各自的"回弹窗口"，避免多卡串台
  let hot = null;                         // 当前被点亮的卡
  let raf = 0;
  let lastEv = null;

  const isLite = () => document.body.classList.contains('ui-lite');
  const noMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const release = (el) => {
    if (!el) return;
    el.classList.remove('is-hot');
    el.classList.add('is-cool');
    // 归零：角度、坐标都回到中心，transition 会把它缓慢带回去
    el.style.setProperty('--tx', '0');
    el.style.setProperty('--ty', '0');
    el.style.setProperty('--mx', '50%');
    el.style.setProperty('--my', '50%');
    clearTimeout(timers.get(el));
    /* 只摘掉 is-cool，保留 .glass-surface：保留着 transform 的过渡链，
       下次移回来时角度是从 0 平滑长起来的；若连类一起摘掉，重新进入会瞬间跳 4°。 */
    timers.set(el, setTimeout(() => el.classList.remove('is-cool'), 760));
  };

  const apply = () => {
    raf = 0;
    const ev = lastEv;
    if (!ev) return;
    if (isLite()) { if (hot) { release(hot); hot = null; } return; }

    const target = ev.target instanceof Element ? ev.target.closest(TARGETS) : null;
    if (target !== hot) {
      if (hot) release(hot);
      hot = target;
      if (hot) {
        clearTimeout(timers.get(hot));
        timers.delete(hot);
        hot.classList.add('glass-surface');
        hot.classList.remove('is-cool');
        hot.classList.add('is-hot');
      }
      if (!hot) return;
    }

    const r = hot.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const x = Math.min(Math.max(ev.clientX - r.left, 0), r.width);
    const y = Math.min(Math.max(ev.clientY - r.top, 0), r.height);
    hot.style.setProperty('--mx', x.toFixed(1) + 'px');
    hot.style.setProperty('--my', y.toFixed(1) + 'px');

    if (noMotion() || !hot.closest(TILT_SCOPE)) {
      // 非工作台：角度钉在 0，只走光斑；避免卡片跟着指针转
      hot.style.setProperty('--tx', '0');
      hot.style.setProperty('--ty', '0');
      return;
    }
    const nx = (x / r.width - 0.5) * 2;   // -1（最左）… 1（最右）
    const ny = (y / r.height - 0.5) * 2;
    // 指针那一侧朝观察者抬起来：右下角 → 底部与右侧靠近
    hot.style.setProperty('--tx', (ny * TILT_MAX).toFixed(2));
    hot.style.setProperty('--ty', (-nx * TILT_MAX).toFixed(2));
  };

  const onMove = (e) => {
    if (e.pointerType === 'touch') return;
    lastEv = e;
    if (!raf) raf = requestAnimationFrame(apply);
  };

  const onLeave = () => {
    lastEv = null;
    if (hot) { release(hot); hot = null; }
  };

  window.addEventListener('pointermove', onMove, { passive: true });
  window.addEventListener('pointerdown', onMove, { passive: true });
  document.addEventListener('pointerleave', onLeave, { passive: true });
  window.addEventListener('blur', onLeave);
  // 滚动时坐标会失真，直接熄灯（顺带避免倾斜中的卡片内容跟着滚动错位）
  window.addEventListener('scroll', onLeave, { capture: true, passive: true });
  window.addEventListener('resize', onLeave);
  // 切到简洁版时立刻收掉所有动效
  const onLiteChange = () => { if (isLite()) onLeave(); };
  new MutationObserver(onLiteChange).observe(document.body, { attributes: true, attributeFilter: ['class'] });
}
