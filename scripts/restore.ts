import { copyFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
/* 从备份恢复：
   npm run restore -- /var/data/backups/onstage-xxxx.sqlite
   这一步只把备份放到「待恢复」位置，不会立刻覆盖正在使用的数据库。
   之后在托管平台上重启服务（Render：Manual Deploy → Restart service），启动时自动替换；
   原数据库会另存为 .before-restore-时间 文件，不会删除。 */
const file = process.argv[2];
const target = resolve(process.env.DATABASE_PATH || './data/onstage.sqlite');
if (!file || !existsSync(file)) { console.error('用法：npm run restore -- 备份文件路径（用 npm run backup -- --list 查看）'); process.exit(2); }
const db = new DatabaseSync(file, { readOnly: true });
const ok = (db.prepare('PRAGMA integrity_check').get() as any)?.integrity_check;
const hasContent = db.prepare("SELECT 1 FROM sqlite_master WHERE name='content'").get();
db.close();
if (ok !== 'ok' || !hasContent) { console.error('这个文件不是有效的上场数据库备份，已停止'); process.exit(1); }
copyFileSync(file, target + '.restore-pending');
console.log('已准备恢复：' + file);
console.log('下一步：重启服务。启动时会自动替换数据库，原数据库另存为 ' + target + '.before-restore-时间');
