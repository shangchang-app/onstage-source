import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

if (existsSync('.env.local')) process.loadEnvFile('.env.local');
export const now = () => new Date().toISOString();
import { seed as seedDemo } from '../../scripts/seed';
export class Store {
  db: DatabaseSync;
  constructor(public path = process.env.DATABASE_PATH || './data/onstage.sqlite') {
    if (path !== ':memory:') { mkdirSync(dirname(resolve(path)), { recursive: true }); applyPendingRestore(path); }
    this.db = new DatabaseSync(path);
    this.db.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;');
  }
  // Only trusted, static SQL is passed here. All user values use parameters.
  get<T = any>(sql: string, ...values: SQLInputValue[]): T | undefined { return this.db.prepare(sql).get(...values) as T | undefined; }
  all<T = any>(sql: string, ...values: SQLInputValue[]): T[] { return this.db.prepare(sql).all(...values) as T[]; }
  run(sql: string, ...values: SQLInputValue[]) { return this.db.prepare(sql).run(...values); }
  private depth = 0;
  transaction<T>(fn: () => T): T {
    // Nested calls join the outer transaction instead of failing with "cannot start a transaction within a transaction".
    if (this.depth > 0) { this.depth++; try { return fn(); } finally { this.depth--; } }
    this.db.exec('BEGIN IMMEDIATE'); this.depth = 1;
    try { const result = fn(); this.db.exec('COMMIT'); return result; }
    catch (e) { this.db.exec('ROLLBACK'); throw e; }
    finally { this.depth = 0; }
  }
  migrate(directory = resolve('migrations')) {
    this.db.exec('CREATE TABLE IF NOT EXISTS migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)');
    const files = readdirSync(directory).filter(n => n.endsWith('.sql')).sort();
    const pending = files.filter(n => !this.get('SELECT name FROM migrations WHERE name=?', n));
    // 已有数据的数据库在升级表结构前，先自动备份一份（重新部署带来新迁移时）。
    if (pending.length && this.path !== ':memory:' && this.get("SELECT 1 FROM sqlite_master WHERE name='content'")) this.backup('before-migration');
    for (const name of files) {
      if (!this.get('SELECT name FROM migrations WHERE name=?', name)) this.transaction(() => {
        this.db.exec(readFileSync(resolve(directory, name), 'utf8'));
        this.run('INSERT INTO migrations VALUES (?,?)', name, now());
      });
    }
  }
  /** 在线一致性备份（VACUUM INTO，不影响正在运行的网站）。返回备份文件路径。 */
  backup(label = 'manual', dir = process.env.BACKUP_DIR || resolve(dirname(resolve(this.path)), 'backups')) {
    mkdirSync(dir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '-');
    const file = resolve(dir, `onstage-${stamp}-${label}.sqlite`);
    this.db.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
    const check = new DatabaseSync(file, { readOnly: true }); const ok = (check.prepare('PRAGMA integrity_check').get() as any)?.integrity_check; check.close();
    if (ok !== 'ok') throw new Error('备份文件完整性检查失败：' + file);
    return file;
  }
  audit(actor: string, action: string, id: string, details = '') {
    this.run('INSERT INTO audit(actor,action,content_id,details,created_at) VALUES (?,?,?,?,?)', actor, action, id, details, now());
  }
}
/* 恢复备份：npm run restore 只是把备份放到「待恢复」位置；下次服务启动、还没打开数据库时才替换，
   避免在网站运行中覆盖正在使用的数据库文件。被替换的数据库保留为 .before-restore-时间 文件，不删除。 */
export function applyPendingRestore(path: string) {
  const pending = path + '.restore-pending';
  if (!existsSync(pending)) return false;
  let ok = '';
  try { const check = new DatabaseSync(pending, { readOnly: true }); try { ok = (check.prepare('PRAGMA integrity_check').get() as any)?.integrity_check; } finally { check.close(); } } catch { ok = ''; }
  if (ok !== 'ok') { renameSync(pending, pending + '.invalid'); console.error('待恢复的备份损坏，已跳过：' + pending); return false; }
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '');
  if (existsSync(path)) {
    // 先把当前数据库（含 WAL 中未合并的内容）完整保存下来
    const cur = new DatabaseSync(path); cur.exec('PRAGMA wal_checkpoint(TRUNCATE)'); cur.close();
    copyFileSync(path, `${path}.before-restore-${stamp}`);
  }
  for (const ext of ['-wal', '-shm']) if (existsSync(path + ext)) rmSync(path + ext);
  renameSync(pending, path);
  console.log(`已从备份恢复数据库；原数据库保存在 ${path}.before-restore-${stamp}`);
  return true;
}
const globalDb = globalThis as unknown as { onstageStore?: Store };
export function database() {
  if (!globalDb.onstageStore) {
    const store = new Store(); store.migrate();
    console.log('数据库：' + resolve(store.path));
    // 试用版可以选择在空数据库里放入演示内容（全部标为「示例」）。只在数据库里还没有任何内容时执行，不会覆盖已有数据。
    if (process.env.DEMO_CONTENT === 'seed-if-empty' && !store.get('SELECT 1 FROM content LIMIT 1')) {
      seedDemo(store, { allowProduction: true }); console.log('空数据库：已写入演示内容（全部标为示例）');
    }
    globalDb.onstageStore = store;
  }
  return globalDb.onstageStore;
}
