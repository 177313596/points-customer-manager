export const api = window.api;

export function fmtMoney(cents) {
  const v = Number(cents || 0) / 100;
  return '¥' + v.toFixed(2);
}

export function yuanStr(cents) {
  return (Number(cents || 0) / 100).toFixed(2);
}

export function parseMoneyToCents(input) {
  if (input === null || input === undefined) return 0;
  const s = String(input).replace(/[¥￥,，\s元]/g, '');
  const n = parseFloat(s);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

/**
 * 金额输入框的实时净化：只允许数字和一个小数点，小数最多 2 位，整数最多 6 位。
 * 用法：onChange={(e) => setAmount(sanitizeMoneyInput(e.target.value))}
 */
export function sanitizeMoneyInput(raw) {
  let s = String(raw == null ? '' : raw).replace(/[^\d.]/g, '');
  const dot = s.indexOf('.');
  if (dot !== -1) {
    // 只保留第一个小数点
    s = s.slice(0, dot + 1) + s.slice(dot + 1).replace(/\./g, '');
  }
  const [intPart, decPart] = s.split('.');
  let int = (intPart || '').slice(0, 6).replace(/^0+(?=\d)/, '');
  if (decPart === undefined) return int;
  return int + '.' + decPart.slice(0, 2);
}

export function todayStr(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function dateOffset(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return todayStr(d);
}

export function relativeTime(iso) {
  if (!iso) return '从未';
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return iso;
  const diff = Date.now() - t;
  if (diff < 60000) return '刚刚';
  if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`;
  return `${Math.floor(diff / 86400000)} 天前`;
}

export function typeClass(type) {
  return ({
    consume: 'tag-consume',
    spend: 'tag-spend',
    topup: 'tag-topup',
    redeem: 'tag-redeem',
    adjust: 'tag-adjust',
    init: 'tag-adjust',
  })[type] || 'tag-adjust';
}
