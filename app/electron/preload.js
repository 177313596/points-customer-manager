'use strict';

const { contextBridge, ipcRenderer } = require('electron');

let token = '';

function call(channel, payload = {}) {
  return ipcRenderer.invoke(channel, { ...payload, __token: token }).catch((err) => ({
    ok: false,
    error: '与主进程通信失败：' + (err && err.message ? err.message : String(err)),
  }));
}

function authCall(channel, payload = {}) {
  return call(channel, payload).then((res) => {
    if (res && res.ok && res.data && res.data.token) token = res.data.token;
    return res;
  });
}

const api = {
  /* 认证 */
  status: () => call('auth:status'),
  setup: (loginPw, opPw, username) => authCall('auth:setup', { loginPw, opPw, username }),
  login: (username, password) => authCall('auth:login', { username, password }),
  logout: () => { const r = call('auth:logout'); token = ''; return r; },
  verifyOp: (password) => call('auth:verify-op', { password }),
  setOpPassword: (password) => call('auth:set-op-password', { password }),
  disableOp: (password) => call('auth:disable-op', { password }),
  changePassword: (kind, oldPassword, newPassword) => call('auth:change-password', { kind, oldPassword, newPassword }),
  activity: () => call('auth:activity'),
  setUsername: (username) => call('auth:set-username', { username }),
  acceptTerms: (when) => call('auth:accept-terms', { when }),

  /* 顾客 */
  customers: {
    list: (filters) => call('customers:list', { filters }),
    get: (id) => call('customers:get', { id }),
    create: (data) => call('customers:create', { data }),
    update: (id, data) => call('customers:update', { id, data }),
    remove: (id) => call('customers:delete', { id }),
    classes: () => call('customers:classes'),
  },

  /* 交易 */
  tx: {
    list: (filters) => call('tx:list', { filters }),
    consume: (customer_id, amount_cents, note) => call('tx:consume', { customer_id, amount_cents, note }),
    spend: (customer_id, amount_cents, note) => call('tx:spend', { customer_id, amount_cents, note }),
    redeem: (customer_id, times, note) => call('tx:redeem', { customer_id, times, note }),
    adjust: (customer_id, points_delta, note, opPassword) =>
      call('tx:adjust', { customer_id, points_delta, note, op_password: opPassword }),
    previewPoints: (amountCents) => call('tx:preview-points', { amountCents }),
  },

  stats: () => call('stats:overview'),

  /* 设置 */
  settings: {
    get: () => call('settings:get'),
    save: (patch) => call('settings:save', { patch }),
    setLoginBg: (dataUrl) => call('settings:set-login-bg', { dataUrl }),
    addLoginBg: (dataUrl) => call('settings:add-login-bg', { dataUrl }),
    removeLoginBg: (url) => call('settings:remove-login-bg', { url }),
    clearLoginBg: () => call('settings:clear-login-bg'),
    setUiMode: (mode) => call('settings:set-ui-mode', { mode }),
    setLiquidGlass: (on) => call('settings:set-liquid-glass', { on }),
    clearData: () => call('settings:clear-data'),
  },

  /* 导入导出 */
  io: {
    importCustomers: () => call('io:import-customers'),
    importTransactions: (autoCreate) => call('io:import-transactions', { autoCreate }),
    exportData: (kind, filters) => call('io:export', { kind, filters }),
    template: (kind) => call('io:template', { kind }),
  },

  /* 云端 */
  cloud: {
    sync: () => call('cloud:sync'),
    status: () => call('cloud:status'),
    test: (config) => call('cloud:test', { config }),
  },

  /* 应用 */
  app: {
    info: () => call('app:info'),
    openDataDir: () => call('app:open-data-dir'),
    backup: () => call('app:backup'),
    restore: () => call('app:restore'),
    minimize: () => call('win:minimize'),
    maximize: () => call('win:maximize'),
    state: () => call('win:state'),
    close: () => call('win:close'),
  },

  /* 事件 */
  onCloudSync: (cb) => ipcRenderer.on('cloud:synced', (_e, d) => cb(d)),
  onCloudError: (cb) => ipcRenderer.on('cloud:error', (_e, d) => cb(d)),
  onWinState: (cb) => ipcRenderer.on('win:state-changed', (_e, d) => cb(d)),
};

contextBridge.exposeInMainWorld('api', api);
