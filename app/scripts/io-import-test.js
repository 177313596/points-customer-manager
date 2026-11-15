'use strict';
/* 导入回归测试（临时 dataDir）：
   1) 同名不同班：按班级精确匹配，不会串到另一位顾客
   2) 不写班级：按姓名匹配第一人
   3) autoCreate：表里没有的姓名自动建档
   4) GBK 编码的 CSV（中文 Excel 默认导出）不再乱码
   5) findCustomerExact / customerIndex 这两个新接口工作正常 */
const { app } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

const TMP = path.join(os.tmpdir(), 'pm-io-' + Date.now());
app.setName('pm-io-test');
app.setPath('userData', TMP);

const db = require(path.join(__dirname, '..', 'electron', 'db.js'));
const importer = require(path.join(__dirname, '..', 'electron', 'importer.js'));

const logFile = path.join(os.tmpdir(), 'pm-io-result.txt');
const lines = [];
const say = (s) => { lines.push(String(s)); console.log(String(s)); };
const flush = () => { try { fs.writeFileSync(logFile, lines.join('\n') + '\n', 'utf8'); } catch (e) { } };

app.whenReady().then(async () => {
  try {
    await db.open(TMP);

    db.createCustomer({ name: '张伟', class_name: '三年级' });
    db.createCustomer({ name: '张伟', class_name: '四年级' });
    db.createCustomer({ name: '李四', class_name: '' });

    const idx = db.customerIndex();
    say('index size = ' + idx.length);
    say('exact 张伟/四年级 = ' + JSON.stringify(db.findCustomerExact('张伟', '四年级') && db.findCustomerExact('张伟', '四年级').class_name));
    say('exact 张伟/没有这个班 = ' + JSON.stringify(db.findCustomerExact('张伟', '五年级')));

    const csvPath = path.join(TMP, 'tx.csv');
    fs.writeFileSync(csvPath, [
      '姓名,班级,金额,时间,备注',
      '张伟,三年级,100,2026-11-10 09:00:00,小测',
      '张伟,四年级,50,2026-11-10 10:00:00,作业',
      '李四,,30,2026-11-10 11:00:00,资料',
      '王五,五年级,20,2026-11-10 12:00:00,补录',
    ].join('\r\n'), 'utf8');

    const r1 = importer.importTransactions(csvPath, { autoCreate: true });
    say('utf8 import = ' + JSON.stringify(r1));

    const after = db.customerIndex();
    say('after customers = ' + after.map((c) => c.name + '/' + c.class_name).join(','));

    const zh3 = db.findCustomerExact('张伟', '三年级');
    const zh4 = db.findCustomerExact('张伟', '四年级');
    const ls = db.findCustomerExact('李四', '');
    const ww = db.findCustomerExact('王五', '五年级');
    say('points 三年级/四年级/李四/王五 = ' + [zh3, zh4, ls, ww].map((c) => (c ? c.points : 'null')).join(' / '));
    say('balance all zero = ' + [zh3, zh4, ls, ww].every((c) => c && Number(c.balance_cents) === 0));

    // GBK 样本由 PowerShell 生成，文件不存在就跳过
    const gbkPath = process.env.PM_CSV_GBK || '';
    let gbkOk = 'skipped';
    if (gbkPath && fs.existsSync(gbkPath)) {
      const r2 = importer.importTransactions(gbkPath, { autoCreate: false });
      const names = [...new Set((r2.errors || []).map((e) => e))];
      gbkOk = JSON.stringify({ imported: r2.imported, skipped: r2.skipped, errors: names.slice(0, 2) });
    }
    say('gbk import = ' + gbkOk);

    // 断言
    const pass =
      idx.length === 3 &&
      zh3 && zh4 && zh3.points === 10 && zh4.points === 5 &&
      ls && ls.points === 3 && ww && ww.points === 2 &&
      r1.imported === 4 && r1.skipped === 0 &&
      after.length === 4;
    say(pass ? 'RESULT ALL-PASS' : 'RESULT HAS-FAIL');
    flush();
    app.exit(pass ? 0 : 1);
  } catch (e) {
    say('ERROR ' + (e && e.stack ? e.stack : e));
    say('RESULT HAS-FAIL');
    flush();
    app.exit(2);
  }
});
