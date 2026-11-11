import { readdirSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { Store } from '../src/server/db';
/* 在线备份（网站运行中也可以执行，不影响访问）：
   npm run backup            生成一份备份到数据库所在磁盘的 backups/ 目录
   npm run backup -- --list  列出已有备份
   不会自动删除旧备份。 */
const store = new Store();
const dir = process.env.BACKUP_DIR || resolve(dirname(resolve(store.path)), 'backups');
if (process.argv.includes('--list')) {
  try { for (const f of readdirSync(dir).filter(f => f.endsWith('.sqlite')).sort()) console.log(`${resolve(dir, f)}  ${(statSync(resolve(dir, f)).size / 1024).toFixed(0)} KB`); }
  catch { console.log('还没有备份'); }
} else {
  store.migrate();
  console.log('备份完成：' + store.backup('manual', dir));
}
store.db.close();
