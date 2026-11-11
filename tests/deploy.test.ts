/* 部署准备版测试：网站地址与生产配置、访客会话续期与隔离、管理员一次性登录、例行清理、备份与恢复、升级前自动备份、健康检查与来源校验。
   每个测试使用独立的临时数据库。 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, copyFileSync, existsSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NextRequest } from 'next/server';
import { Store } from '../src/server/db';
import { Auth } from '../src/server/auth';
import { Service } from '../src/server/service';
import { productionProblems, publicOrigins, sessionDays } from '../src/server/config';
import { Problem } from '../src/server/validation';
import { seed } from '../scripts/seed';

const dir = () => mkdtempSync(join(tmpdir(), 'onstage-deploy-'));
const base = join(dir(), 'seed.sqlite');
{ const s = new Store(base); seed(s); s.db.close(); }
function fresh() {
  const path = join(dir(), 'db.sqlite'); copyFileSync(base, path);
  const store = new Store(path); store.migrate();
  return { path, store, auth: new Auth(store, { send: async () => {} }), svc: new Service(store) };
}
const code = (fn: () => unknown) => { try { fn(); return 'OK'; } catch (e) { return e instanceof Problem ? e.code : (e as Error).message; } };
const env = (o: Record<string, string>) => ({ ...o } as unknown as NodeJS.ProcessEnv);

test('网站地址：支持多个地址、平台自动地址；生产环境要求 https 和持久化数据库路径', () => {
  assert.deepEqual(publicOrigins(env({ NODE_ENV: 'development' })), ['http://127.0.0.1:3000']);
  assert.deepEqual(publicOrigins(env({ APP_ORIGIN: 'https://try.example.com/, https://a.onrender.com' })), ['https://try.example.com', 'https://a.onrender.com']);
  assert.deepEqual(publicOrigins(env({ NODE_ENV: 'production', RENDER_EXTERNAL_URL: 'https://onstage-trial.onrender.com' })), ['https://onstage-trial.onrender.com']);
  assert.deepEqual(publicOrigins(env({ NODE_ENV: 'production', APP_ORIGIN: 'https://try.example.com', RENDER_EXTERNAL_URL: 'https://x.onrender.com' })), ['https://try.example.com', 'https://x.onrender.com'], '绑定新域名后旧地址仍可用');
  assert.deepEqual(publicOrigins(env({ NODE_ENV: 'production', RAILWAY_PUBLIC_DOMAIN: 'x.up.railway.app' })), ['https://x.up.railway.app']);
  assert.ok(productionProblems(env({ NODE_ENV: 'production' })).length >= 2, '生产环境缺少地址和数据库路径时必须报错');
  assert.ok(productionProblems(env({ NODE_ENV: 'production', APP_ORIGIN: 'http://try.example.com', DATABASE_PATH: '/var/data/a.sqlite' })).some(p => p.includes('https')));
  assert.ok(productionProblems(env({ NODE_ENV: 'production', APP_ORIGIN: 'https://try.example.com', DATABASE_PATH: './data/a.sqlite' })).some(p => p.includes('绝对路径')));
  assert.deepEqual(productionProblems(env({ NODE_ENV: 'production', RENDER_EXTERNAL_URL: 'https://x.onrender.com', DATABASE_PATH: '/var/data/onstage.sqlite' })), []);
  assert.deepEqual(productionProblems(env({ NODE_ENV: 'production', APP_ORIGIN: 'http://127.0.0.1:3100', DATABASE_PATH: '/tmp/a.sqlite' })), [], '本机验收允许 http://127.0.0.1');
  assert.deepEqual(productionProblems(env({ NODE_ENV: 'development' })), []);
  assert.equal(sessionDays(env({})), 30); assert.equal(sessionDays(env({ SESSION_DAYS: '0' })), 30); assert.equal(sessionDays(env({ SESSION_DAYS: '14' })), 14);
});

test('访客会话：默认 30 天，访问时自动续期；过期后不能再用；管理员链接会话不续期', () => {
  const e = fresh(); const g = e.auth.issue();
  const exp = () => e.store.get<{ expires_at: number }>('SELECT expires_at FROM sessions WHERE owner=?', g.identity.owner)!.expires_at;
  assert.ok(Math.abs(exp() - (Date.now() + 30 * 86400000)) < 5000);
  assert.equal(e.auth.renew(g.token), false, '刚创建的会话不需要续期');
  e.store.run('UPDATE sessions SET expires_at=? WHERE owner=?', Date.now() + 3 * 86400000, g.identity.owner);
  assert.equal(e.auth.renew(g.token), true); assert.ok(exp() > Date.now() + 29 * 86400000, '续期到完整有效期');
  e.store.run('UPDATE sessions SET expires_at=? WHERE owner=?', Date.now() - 1000, g.identity.owner);
  assert.equal(e.auth.renew(g.token), false, '已过期的会话不能续期'); assert.equal(e.auth.read(g.token), null);
});

test('访客之间互相隔离：草稿、恢复副本、我的页面各自独立；访客不能提交完成记录、不能收藏、不能访问后台', () => {
  const e = fresh(); const a = e.auth.issue().identity, b = e.auth.issue().identity;
  e.svc.saveDraft(a, 'ops-returns', { version: 0, contentVersion: 1, answers: { 'p1.before': '访客 A 的作答' } });
  assert.equal(e.svc.draft(b, 'ops-returns'), null, '访客 B 看到了 A 的草稿');
  assert.ok(!JSON.stringify(e.svc.mine(b)).includes('访客 A'), '访客 B 的「我的」包含 A 的内容');
  assert.equal(e.svc.draft(a, 'ops-returns')!.answers['p1.before'], '访客 A 的作答');
  assert.equal(code(() => e.svc.submit(a, 'ops-returns', { version: 1, contentVersion: 1 })), 'LOGIN_REQUIRED');
  assert.equal(code(() => e.svc.favorite(a, 'j2', true)), 'LOGIN_REQUIRED');
  assert.ok(['LOGIN_REQUIRED', 'FORBIDDEN'].includes(code(() => e.svc.adminData(a))), '访客能读取后台数据');
  assert.ok(['LOGIN_REQUIRED', 'FORBIDDEN'].includes(code(() => e.svc.edit(a, { kind: 'company', companyId: null, version: 0, demo: false, data: { title: 'x' } }))), '访客能修改内容');
});

test('管理员一次性登录链接：只能用一次、15 分钟过期、取消权限后失效、不合并浏览器里的访客草稿', () => {
  const e = fresh();
  const g = e.auth.issue(); e.svc.saveDraft(g.identity, 'ops-returns', { version: 0, contentVersion: 1, answers: { 'p1.before': '这台电脑上别人写的' } });
  const token = e.auth.createAdminLink('13900000001');
  const s = e.auth.useAdminLink(token, g.identity, g.token);
  assert.equal(s.identity.role, 'admin'); assert.ok(e.svc.adminData(s.identity));
  assert.equal(e.auth.read(g.token), null, '原访客会话应失效');
  assert.equal(e.svc.draft(s.identity, 'ops-returns'), null, '管理员账号不应带入访客草稿');
  const row = e.store.get<{ expires_at: number; renewable: number }>('SELECT expires_at,renewable FROM sessions WHERE owner=?', s.identity.owner)!;
  assert.equal(row.renewable, 0); assert.ok(row.expires_at <= Date.now() + 12 * 3600000 + 5000, '管理员会话 12 小时');
  assert.equal(e.auth.renew(s.token), false);
  const g2 = e.auth.issue();
  assert.equal(code(() => e.auth.useAdminLink(token, g2.identity, g2.token)), 'LINK_INVALID', '链接被用了第二次');
  const t2 = e.auth.createAdminLink('13900000001'); e.store.run('UPDATE login_links SET expires_at=?', Date.now() - 1);
  assert.equal(code(() => e.auth.useAdminLink(t2, g2.identity, g2.token)), 'LINK_INVALID', '过期链接仍可用');
  const t3 = e.auth.createAdminLink('13900000001'); e.store.run("UPDATE users SET role='student' WHERE phone='13900000001'");
  assert.equal(code(() => e.auth.useAdminLink(t3, g2.identity, g2.token)), 'FORBIDDEN', '取消管理员后链接仍可用');
  assert.equal(code(() => e.auth.useAdminLink('x'.repeat(43), g2.identity, g2.token)), 'LINK_INVALID', '伪造链接');
  assert.ok(!e.store.all('SELECT token_hash FROM login_links').some((r: any) => [token, t2, t3].includes(r.token_hash)), '数据库只保存哈希');
});

test('例行清理：只清理没人能再打开的过期访客草稿，账号数据和近期访客数据都保留', async () => {
  const e = fresh(); const old = new Date(Date.now() - 40 * 86400000).toISOString();
  const dead = e.auth.issue().identity, alive = e.auth.issue().identity;
  for (const who of [dead, alive]) e.svc.saveDraft(who, 'ops-returns', { version: 0, contentVersion: 1, answers: { 'p1.before': who.owner } });
  e.store.run('UPDATE drafts SET saved_at=?', old);
  e.store.run('UPDATE sessions SET expires_at=? WHERE owner=?', Date.now() - 1, dead.owner);
  const g = e.auth.issue(); const { code: c } = await e.auth.send('13800000077', g.identity.owner) as any; const u = e.auth.verify('13800000077', c, g.identity, g.token).identity;
  e.svc.saveDraft(u, 'yc-quick', { version: 0, contentVersion: 1, answers: { '0': '账号作答' } }); e.store.run('UPDATE drafts SET saved_at=? WHERE owner=?', old, u.owner);
  e.store.run('DELETE FROM sessions WHERE owner=?', u.owner); // 账号会话也过期了
  e.auth.maintenance(true);
  assert.equal(e.store.get('SELECT 1 FROM drafts WHERE owner=?', dead.owner), undefined, '过期访客的旧草稿应清理');
  assert.ok(e.store.get('SELECT 1 FROM drafts WHERE owner=?', alive.owner), '仍有会话的访客草稿被误删');
  assert.ok(e.store.get('SELECT 1 FROM drafts WHERE owner=?', u.owner), '账号草稿被误删');
  assert.equal(e.store.get('SELECT 1 FROM sessions WHERE owner=?', dead.owner), undefined);
});

test('在线备份与恢复：恢复只在下次启动时进行，原数据库另存，不会被删除；损坏的备份被跳过', () => {
  const e = fresh(); const g = e.auth.issue().identity;
  e.svc.saveDraft(g, 'ops-returns', { version: 0, contentVersion: 1, answers: { 'p1.before': '备份时的内容' } });
  const file = e.store.backup('test');
  assert.ok(existsSync(file) && file.includes(join('backups', 'onstage-')));
  e.svc.saveDraft(g, 'ops-returns', { version: 1, contentVersion: 1, answers: { 'p1.before': '备份之后改的' } });
  e.store.db.close();
  copyFileSync(file, e.path + '.restore-pending');
  const s2 = new Store(e.path); s2.migrate();
  assert.equal(JSON.parse(s2.get<{ answers: string }>('SELECT answers FROM drafts WHERE owner=?', g.owner)!.answers)['p1.before'], '备份时的内容');
  const kept = readdirSync(join(e.path, '..')).filter(f => f.includes('.before-restore-'));
  assert.equal(kept.length, 1, '原数据库没有另存');
  const old = new Store(join(e.path, '..', kept[0])); assert.equal(JSON.parse(old.get<{ answers: string }>('SELECT answers FROM drafts WHERE owner=?', g.owner)!.answers)['p1.before'], '备份之后改的', '另存的原数据库应包含恢复前的最新内容'); old.db.close();
  s2.db.close();
  // 损坏的待恢复文件
  copyFileSync(join(e.path, '..', kept[0]), e.path + '.restore-pending');
  writeFileSync(e.path + '.restore-pending', 'not a database');
  let threw = false; let s3: Store | undefined;
  try { s3 = new Store(e.path); } catch { threw = true; }
  assert.ok(!threw && existsSync(e.path + '.restore-pending.invalid'), '损坏的备份应被跳过并改名');
  assert.equal(JSON.parse(s3!.get<{ answers: string }>('SELECT answers FROM drafts WHERE owner=?', g.owner)!.answers)['p1.before'], '备份时的内容', '数据库不应被损坏的备份替换');
  s3!.db.close();
});

test('重新部署带来新迁移时，先自动备份已有数据库', () => {
  const d = dir(); const migrations = join(d, 'migrations'); mkdirSync(migrations);
  for (const f of readdirSync('migrations').filter(f => f < '005')) copyFileSync(join('migrations', f), join(migrations, f));
  const path = join(d, 'db.sqlite'); const s = new Store(path); s.migrate(migrations); seed(s); s.db.close();
  copyFileSync(join('migrations', '005_deploy.sql'), join(migrations, '005_deploy.sql'));
  const s2 = new Store(path); s2.migrate(migrations); s2.db.close();
  const backups = readdirSync(join(d, 'backups')); assert.equal(backups.filter(f => f.includes('before-migration')).length, 1);
  const s3 = new Store(path); s3.migrate(migrations); s3.db.close();
  assert.equal(readdirSync(join(d, 'backups')).length, 1, '没有新迁移时不应重复备份');
});

test('接口：健康检查不创建会话；生产配置不完整时拒绝服务；写入只接受配置里的网站地址', async () => {
  const d = dir(); const keep = { ...process.env };
  const { handle } = await import('../src/server/http');
  const g = globalThis as any;
  try {
    Object.assign(process.env, { DATABASE_PATH: join(d, 'h.sqlite'), APP_ORIGIN: 'https://try.example.com,https://x.onrender.com' }); delete g.onstageStore;
    let r = await handle(new NextRequest('http://localhost/api/health'), ['health']);
    assert.equal(r.status, 200); assert.equal(r.headers.get('set-cookie'), null, '健康检查不应创建会话');
    r = await handle(new NextRequest('http://localhost/api/session'), ['session']);
    const cookie = r.headers.get('set-cookie')!.split(';')[0]; const stamp = (await r.json()).identity.stamp;
    const post = (origin: string) => handle(new NextRequest('http://localhost/api/drafts/ops-returns', { method: 'POST', headers: { origin, cookie, 'x-session': stamp, 'content-type': 'application/json' }, body: JSON.stringify({ version: 0, contentVersion: 1, answers: {} }) }), ['drafts', 'ops-returns']);
    assert.equal((await post('https://evil.example.com')).status, 403);
    // 空数据库里没有体验：返回「不可用」而不是来源错误，说明来源校验已通过
    for (const o of ['https://try.example.com', 'https://x.onrender.com']) assert.notEqual((await post(o)).status, 403, o + ' 应被接受');
    // 生产环境缺少 DATABASE_PATH
    (process.env as any).NODE_ENV = 'production'; delete process.env.DATABASE_PATH;
    r = await handle(new NextRequest('http://localhost/api/health'), ['health']); assert.equal(r.status, 503);
    r = await handle(new NextRequest('http://localhost/api/session'), ['session']); assert.equal(r.status, 503);
    assert.ok(!JSON.stringify(await r.json()).includes('DATABASE_PATH'), '对外的错误信息不应暴露配置细节');
  } finally { process.env = keep; delete g.onstageStore; }
});
