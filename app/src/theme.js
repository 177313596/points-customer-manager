/* 个性化配色：把用户选的主色换算成一套 CSS 变量，运行时写进 :root。
   - 只依赖主色一个值，其余（深色按下、浅色底、侧栏深底、按钮文字色）都由它推导
   - 不改变任何 CSS 源码，改完立即生效；刷新/重开由 settings.theme / auth:status 回填 */

export const DEFAULT_ACCENT = '#0F766E';

/* 预设色板：避开以紫/蓝为主色的方案（与整体青绿调性协调） */
export const ACCENT_PRESETS = [
  { name: '青绿', accent: '#0F766E' },
  { name: '松石', accent: '#157F86' },
  { name: '墨绿', accent: '#3A6B3F' },
  { name: '琥珀', accent: '#B4690E' },
  { name: '砖红', accent: '#A33B2B' },
  { name: '莓红', accent: '#9F2B5B' },
  { name: '石墨', accent: '#3E4B54' },
];

const HEX_RE = /^#[0-9A-Fa-f]{6}$/;

function toRgb(hex) {
  const h = String(hex || '').replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function toHex(rgb) {
  return '#' + rgb.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('').toUpperCase();
}

/* 混色：ratio = 目标色占比（0~1） */
function mix(hex, target, ratio) {
  const a = toRgb(hex);
  const b = toRgb(target);
  return toHex(a.map((v, i) => v * (1 - ratio) + b[i] * ratio));
}

/* amount < 0 变暗，> 0 变亮 */
function shade(hex, amount) {
  return mix(hex, amount < 0 ? '#000000' : '#FFFFFF', Math.abs(amount));
}

function luminance(hex) {
  const rgb = toRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
}

export function normalizeAccent(v) {
  const s = String(v || '').trim().toUpperCase();
  if (HEX_RE.test(s)) return s;
  return '';
}

export function applyTheme(theme) {
  const accent = normalizeAccent(theme && theme.accent) || DEFAULT_ACCENT;
  const root = document.documentElement;
  const set = (k, v) => root.style.setProperty(k, v);

  set('--primary', accent);
  set('--primary-dark', shade(accent, -0.22));
  set('--primary-soft', mix(accent, '#FFFFFF', 0.9));
  set('--primary-line', mix(accent, '#FFFFFF', 0.72));
  set('--on-primary', luminance(accent) > 0.62 ? '#0B2B27' : '#FFFFFF');
  // 侧栏 / 登录页品牌区的深色底，跟着主色走
  set('--nav-1', shade(accent, -0.78));
  set('--nav-2', shade(accent, -0.86));
  set('--nav-ink', mix(accent, '#FFFFFF', 0.86));
  return accent;
}
