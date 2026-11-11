/* 服务端规则测试：账号与数据隔离、草稿合并与冲突、只浏览不生成记录、版本与历史记录、权限、招聘发布规则。
   每个测试使用独立的临时数据库，并运行真实的迁移和演示数据脚本。 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, copyFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../src/server/db';
import { Auth, authConfig, type Identity } from '../src/server/auth';
import { Service } from '../src/server/service';
import { Problem } from '../src/server/validation';
import { seed } from '../scripts/seed';

const base = join(mkdtempSync(join(tmpdir(), 'onstage-')), 'seed.sqlite');
{ const s = new Store(base); seed(s); s.db.close(); }
function fresh() {
  const path = join(mkdtempSync(join(tmpdir(), 'onstage-')), 'db.sqlite'); copyFileSync(base, path);
  const store = new Store(path); store.migrate();
  const auth = new Auth(store, { send: async () => {} }); const svc = new Service(store);
  return { store, auth, svc };
}
type Env = ReturnType<typeof fresh>;
function guest(env: Env) { const s = env.auth.issue(); return { token: s.token, id: s.identity }; }
async function login(env: Env, phone: string, from?: { token: string; id: Identity }) {
  const g = from || guest(env);
  const { code } = await env.auth.send(phone, g.id.owner) as { code: string };
  const s = env.auth.verify(phone, code, g.id, g.token);
  return { token: s.token, id: s.identity, merge: s.merge };
}
const code = (fn: () => unknown) => { try { fn(); return 'OK'; } catch (e) { return e instanceof Problem ? e.code : (e as Error).message; } };
const fullAnswers = { 'p1.before': '约 4.7%', 'p1.after': '约 11.1%', 'p1.other': '访问量涨了约 7 成，转化率从 3.7% 降到 3.0%', 'p2.when': '第 4 周；同周扩了适配车型、开了广泛匹配广告、降价', 'p3.main': '车型不匹配占 58%，评论提到凯美瑞、雅阁装不上', 'p4.causes': ['新增车型的适配数据有错', '广泛匹配广告带来了不精准的买家'], 'p4.why': '降价解释不了车型不匹配', 'p5.first': '新增 75 款车型先标为待核对', 'p5.second': '暂停广泛匹配广告', 'p6.missing': '按车型拆分的退货率，找数据同事要' };
const G = 'ops-returns-deep';

test('只浏览不作答：不会生成完成记录', async () => {
  const env = fresh(); const g = guest(env);
  env.svc.saveDraft(g.id, G, { version: 0, contentVersion: 1, answers: {}, progress: { step: 4, visited: [0, 1, 2, 3, 4], referenceViewed: true } });
  assert.equal(code(() => env.svc.submit(g.id, G, { version: 1, contentVersion: 1 })), 'LOGIN_REQUIRED');
  const u = await login(env, '13800000001', g);
  const d = env.svc.draft(u.id, G)!;
  assert.equal(d.progress.referenceViewed, true, '浏览进度随登录带入账号');
  assert.equal(code(() => env.svc.submit(u.id, G, { version: d.version, contentVersion: 1 })), 'INCOMPLETE');
  assert.equal(env.store.get('SELECT count(*) n FROM submissions').n, 0);
});

test('完整作答后提交：生成绑定账号和版本的记录；重复提交不产生第二条', async () => {
  const env = fresh(); const u = await login(env, '13800000002');
  const d = env.svc.saveDraft(u.id, G, { version: 0, contentVersion: 1, answers: { ...fullAnswers, 'p4.causes': ['不存在的选项'] } })!;
  assert.equal(code(() => env.svc.submit(u.id, G, { version: d.version, contentVersion: 1 })), 'INCOMPLETE', '选项必须来自题目');
  const d2 = env.svc.saveDraft(u.id, G, { version: d.version, contentVersion: 1, answers: fullAnswers })!;
  const r = env.svc.submit(u.id, G, { version: d2.version, contentVersion: 1, reflection: { understand: 'yes', likes: ['读数据'], next: ['jobs'] } });
  assert.equal(r.duplicate, false);
  const rec = env.svc.record(u.id, r.id);
  assert.equal(rec.owner, u.id.userId); assert.equal(rec.content_version, 1); assert.equal(rec.snapshot.data.title, '深度版：退货率上升，写一页给主管的说明');
  assert.equal(rec.reflection.understand, 'yes');
  assert.equal(env.svc.draft(u.id, G), null, '提交后草稿移除');
  assert.equal(env.svc.submit(u.id, G, { version: 1, contentVersion: 1 }).duplicate, true);
  assert.equal(env.store.get('SELECT count(*) n FROM submissions').n, 1);
});

test('游客草稿合并：账号空草稿直接并入；内容相同不算冲突；内容不同进入冲突并保留两份；账号已完成则放入恢复区', async () => {
  const env = fresh();
  // 账号 A 有一个空草稿（只浏览过）
  const a = await login(env, '13800000003');
  env.svc.saveDraft(a.id, G, { version: 0, contentVersion: 1, answers: {}, progress: { step: 1, visited: [0, 1] } });
  const g1 = guest(env); env.svc.saveDraft(g1.id, G, { version: 0, contentVersion: 1, answers: { 'p1.before': '游客作答' } });
  const a2 = await login(env, '13800000003', g1);
  assert.deepEqual(a2.merge, { moved: 1, conflicts: [], archived: 0 });
  assert.equal(env.svc.draft(a2.id, G)!.answers['p1.before'], '游客作答');
  // 相同内容：不冲突
  const g2 = guest(env); env.svc.saveDraft(g2.id, G, { version: 0, contentVersion: 1, answers: { 'p1.before': ' 游客作答 ' } });
  const a3 = await login(env, '13800000003', g2);
  assert.equal(a3.merge.conflicts.length, 0);
  // 不同内容：冲突，两份都在
  const g3 = guest(env); env.svc.saveDraft(g3.id, G, { version: 0, contentVersion: 1, answers: { 'p1.before': '另一份游客作答' } });
  const a4 = await login(env, '13800000003', g3);
  assert.deepEqual(a4.merge.conflicts, [G]);
  const d = env.svc.draft(a4.id, G)!;
  assert.equal(d.conflict, 1); assert.equal(d.answers['p1.before'], '游客作答'); assert.equal(d.conflictWith.answers['p1.before'], '另一份游客作答');
  assert.equal(code(() => env.svc.saveDraft(a4.id, G, { version: d.version, contentVersion: 1, answers: {} })), 'DRAFT_CONFLICT', '冲突处理前不能继续写');
  // 选择游客那份：当前草稿进入恢复区
  const after = env.svc.resolveDraft(a4.id, G, { version: env.svc.draft(a4.id, G)!.version, recoveryId: env.svc.draft(a4.id, G)!.conflictWith.id })!;
  assert.equal(after.answers['p1.before'], '另一份游客作答'); assert.equal(after.conflict, 0);
  assert.ok(env.svc.mine(a4.id).recoveries.some((r: any) => r.answers['p1.before'] === '游客作答'));
  // 账号已完成：游客作答不提交，进入恢复区
  const done = env.svc.saveDraft(a4.id, G, { version: after.version, contentVersion: 1, answers: fullAnswers })!;
  env.svc.submit(a4.id, G, { version: done.version, contentVersion: 1 });
  const g4 = guest(env); env.svc.saveDraft(g4.id, G, { version: 0, contentVersion: 1, answers: { 'p1.before': '已完成后游客又写的' } });
  const a5 = await login(env, '13800000003', g4);
  assert.equal(a5.merge.archived, 1);
  assert.equal(env.store.get('SELECT count(*) n FROM submissions WHERE owner=?', a5.id.userId!).n, 1);
});

test('同一账号两个页面同时修改：两份都保留并标记冲突', async () => {
  const env = fresh(); const u = await login(env, '13800000004');
  const d = env.svc.saveDraft(u.id, G, { version: 0, contentVersion: 1, answers: { 'p1.before': '页面一' } })!;
  env.svc.saveDraft(u.id, G, { version: d.version, contentVersion: 1, answers: { 'p1.before': '页面一 再改' } });
  assert.equal(code(() => env.svc.saveDraft(u.id, G, { version: d.version, contentVersion: 1, answers: { 'p1.before': '页面二（旧版本号）' } })), 'DRAFT_CONFLICT');
  const now = env.svc.draft(u.id, G)!;
  assert.equal(now.answers['p1.before'], '页面一 再改'); assert.equal(now.conflictWith.answers['p1.before'], '页面二（旧版本号）');
});

test('另一个页面只翻了步骤或草稿还没有作答：合并进度，不误报冲突', async () => {
  const env = fresh(); const u = await login(env, '13800000014');
  const a = env.svc.saveDraft(u.id, G, { version: 0, contentVersion: 1, answers: {}, progress: { step: 1, visited: [0, 1] } })!;
  // 页面二仍拿着旧版本号，只翻了步骤：不冲突，进度合并，版本号不变
  const b = env.svc.saveDraft(u.id, G, { version: 0, contentVersion: 1, answers: {}, progress: { step: 3, visited: [3] } })!;
  assert.equal(b.version, a.version); assert.equal(b.conflict, 0); assert.deepEqual(b.progress.visited, [0, 1, 3]);
  // 服务器草稿还没有作答：旧版本号的页面写入作答也被接受
  const c = env.svc.saveDraft(u.id, G, { version: 0, contentVersion: 1, answers: { 'p1.before': '页面二' } })!;
  assert.equal(c.answers['p1.before'], '页面二'); assert.equal(c.conflict, 0);
  // 有作答以后，旧版本号写入不同内容仍然是冲突
  assert.equal(code(() => env.svc.saveDraft(u.id, G, { version: a.version, contentVersion: 1, answers: { 'p1.before': '页面一' } })), 'DRAFT_CONFLICT');
});

test('账号隔离：其他学生和企业成员都读不到别人的作答；后台只有管理员能进，且不含学生作答', async () => {
  const env = fresh(); const a = await login(env, '13800000005'); const b = await login(env, '13800000006');
  const d = env.svc.saveDraft(a.id, G, { version: 0, contentVersion: 1, answers: fullAnswers })!;
  const r = env.svc.submit(a.id, G, { version: d.version, contentVersion: 1 });
  assert.equal(code(() => env.svc.record(b.id, r.id)), 'NOT_FOUND');
  assert.equal(env.svc.draft(b.id, G), null);
  assert.equal(env.svc.mine(b.id).records.length, 0);
  // 企业成员（预留角色，本轮不开放企业端）
  const e = await login(env, '13800000007');
  env.store.run('INSERT INTO enterprise_members VALUES (?,?,?,?)', e.id.userId!, 'yc', 1, new Date().toISOString());
  const e2 = env.auth.read(e.token)!; assert.equal(e2.enterprise, true);
  assert.equal(code(() => env.svc.record(e2, r.id)), 'NOT_FOUND');
  assert.equal(code(() => env.svc.adminData(e2)), 'FORBIDDEN');
  assert.equal(code(() => env.svc.adminData(a.id)), 'FORBIDDEN');
  env.store.run("UPDATE users SET role='admin' WHERE id=?", b.id.userId!);
  const admin = env.auth.read(b.token)!;
  const data = JSON.stringify(env.svc.adminData(admin));
  assert.ok(!data.includes('凯美瑞、雅阁装不上'), '后台数据里没有学生作答');
});

test('多标签页身份变化：旧页面的会话戳失效，写入被暂停', async () => {
  const env = fresh(); const g = guest(env);
  const stamp = g.id.stamp;
  const u = await login(env, '13800000008', g);
  assert.equal(code(() => env.auth.guard(g.token, stamp)), 'SESSION_EXPIRED', '旧会话已注销');
  assert.equal(code(() => env.auth.guard(u.token, stamp)), 'IDENTITY_CHANGED', '新会话 + 旧页面的戳 → 暂停');
  assert.equal(code(() => env.auth.guard(u.token, u.id.stamp)), 'OK');
});

test('内容更新：发布新版本不改变历史记录；旧版草稿可以继续完成；已发布版本不可修改', async () => {
  const env = fresh(); const admin = await login(env, '13800000009');
  env.store.run("UPDATE users SET role='admin' WHERE id=?", admin.id.userId!); const ad = env.auth.read(admin.token)!;
  const done = await login(env, '13800000010');
  const d = env.svc.saveDraft(done.id, G, { version: 0, contentVersion: 1, answers: fullAnswers })!;
  const rec = env.svc.submit(done.id, G, { version: d.version, contentVersion: 1 });
  const midway = await login(env, '13800000011');
  const md = env.svc.saveDraft(midway.id, G, { version: 0, contentVersion: 1, answers: { 'p1.before': '做到一半' } })!;
  // 管理员：新建 v2 → 修改 → 送审 → 通过 → 发布
  assert.equal(env.svc.createVersion(ad, G).version, 2);
  const v2 = env.svc.versions(ad, G).versions.find((v: any) => v.version === 2)!;
  const data = { ...v2.data, title: '商品退货率上升，先查什么？（第 2 版）' };
  env.svc.updateVersion(ad, G, 2, { data, sourceNote: '平台整理，数据虚构', changeNote: '标题更新', rev: v2.rev });
  assert.equal(code(() => env.svc.publishVersion(ad, G, 2)), 'STATE', '未审核不能发布');
  env.svc.reviewVersion(ad, G, 2, { action: 'submit' });
  assert.equal(code(() => env.svc.updateVersion(ad, G, 2, { data, sourceNote: 'x', changeNote: 'x', rev: v2.rev + 1 })), 'LOCKED');
  env.svc.reviewVersion(ad, G, 2, { action: 'approve', note: '已核对' });
  env.svc.publishVersion(ad, G, 2);
  assert.equal(env.svc.content(G).version, 2);
  assert.equal(env.svc.record(done.id, rec.id).snapshot.data.title, '深度版：退货率上升，写一页给主管的说明', '历史记录仍是第 1 版');
  assert.throws(() => env.store.run("UPDATE experience_versions SET data='{}' WHERE experience_id=? AND version=1", G), /immutable/);
  // 做到一半的学生：继续使用第 1 版
  const gd = env.svc.guide(midway.id, G) as any; assert.equal(gd.version, 1); assert.equal(gd.outdated, true);
  const md2 = env.svc.saveDraft(midway.id, G, { version: md.version, contentVersion: 1, answers: fullAnswers })!;
  assert.equal(env.svc.submit(midway.id, G, { version: md2.version, contentVersion: 1 }).duplicate, false);
  // 新学生：拿到第 2 版
  const fresh2 = guest(env); assert.equal((env.svc.guide(fresh2.id, G) as any).version, 2);
  assert.equal(code(() => env.svc.saveDraft(fresh2.id, G, { version: 0, contentVersion: 1, answers: {} })), 'CONTENT_CHANGED');
});

test('体验下线：不能保存或提交，历史记录仍可查看；企业共创需要确认才能发布', async () => {
  const env = fresh(); const admin = await login(env, '13800000012');
  env.store.run("UPDATE users SET role='admin' WHERE id=?", admin.id.userId!); const ad = env.auth.read(admin.token)!;
  const u = await login(env, '13800000013');
  const d = env.svc.saveDraft(u.id, G, { version: 0, contentVersion: 1, answers: fullAnswers })!;
  const rec = env.svc.submit(u.id, G, { version: d.version, contentVersion: 1 });
  const other = await login(env, '13800000014');
  const od = env.svc.saveDraft(other.id, G, { version: 0, contentVersion: 1, answers: { 'p1.before': '草稿' } })!;
  env.svc.transition(ad, G, { action: 'offline', version: 1 });
  assert.equal(code(() => env.svc.saveDraft(other.id, G, { version: od.version, contentVersion: 1, answers: {} })), 'UNAVAILABLE');
  assert.equal(code(() => env.svc.submit(other.id, G, { version: od.version, contentVersion: 1 })), 'UNAVAILABLE');
  assert.equal((env.svc.guide(other.id, G) as any).unavailable, true);
  assert.equal(env.svc.record(u.id, rec.id).current.status, 'offline');
  assert.ok(env.svc.draft(other.id, G), '草稿保留');
  // 企业共创：没有企业确认不能发布
  env.svc.createVersion(ad, 'yc-quick');
  const v = env.svc.versions(ad, 'yc-quick').versions[0];
  assert.equal(code(() => env.svc.updateVersion(ad, 'yc-quick', v.version, { data: { ...v.data, sourceType: 'cocreate' }, sourceNote: '企业提供岗位背景（演示）', changeNote: '改为企业共创', rev: v.rev, companyId: null })), 'OK');
  env.svc.reviewVersion(ad, 'yc-quick', v.version, { action: 'submit' });
  assert.equal(code(() => env.svc.reviewVersion(ad, 'yc-quick', v.version, { action: 'cocreate', note: '演示：企业运营负责人邮件确认' })), 'COCREATE', '没有关联企业也能记录共创确认');
  env.svc.reviewVersion(ad, 'yc-quick', v.version, { action: 'return', note: '请关联企业' });
  env.svc.updateVersion(ad, 'yc-quick', v.version, { data: { ...v.data, sourceType: 'cocreate' }, sourceNote: '企业提供岗位背景（演示）', changeNote: '改为企业共创', rev: v.rev + 1, companyId: 'yc' });
  env.svc.reviewVersion(ad, 'yc-quick', v.version, { action: 'submit' }); env.svc.reviewVersion(ad, 'yc-quick', v.version, { action: 'approve' });
  assert.equal(code(() => env.svc.publishVersion(ad, 'yc-quick', v.version)), 'COCREATE');
  env.svc.reviewVersion(ad, 'yc-quick', v.version, { action: 'cocreate', note: '演示：企业运营负责人邮件确认 2026-11-10' });
  assert.equal(code(() => env.svc.publishVersion(ad, 'yc-quick', v.version)), 'OK');
});

test('后台新建内容默认是草稿，不公开；两位管理员同时编辑不会静默覆盖', async () => {
  const env = fresh(); const admin = await login(env, '13800000033');
  env.store.run("UPDATE users SET role='admin' WHERE id=?", admin.id.userId!); const ad = env.auth.read(admin.token)!;
  const co = env.svc.edit(ad, { kind: 'company', companyId: null, version: 0, demo: false, data: { title: '新企业', authorized: false } });
  assert.equal(co.state, 'draft'); assert.equal(env.svc.publicContent(co.id).data.title, '这项内容暂不可用');
  assert.equal(code(() => env.svc.transition(ad, co.id, { action: 'publish', version: 1 })), 'AUTHORIZATION', '没有授权记录也能发布企业');
  const job = env.svc.edit(ad, { kind: 'job', companyId: 'yc', version: 0, demo: true, data: { title: '新岗位' } });
  assert.equal(job.state, 'draft'); assert.ok(!env.svc.list('job').some((x: any) => x.id === job.id));
  // 同时编辑：A、B 都基于第 1 版，A 先保存，B 再保存被拒绝
  env.svc.edit(ad, { id: job.id, kind: 'job', companyId: 'yc', version: 1, demo: true, data: { ...job.data, salary: 'A 改的' } });
  assert.equal(code(() => env.svc.edit(ad, { id: job.id, kind: 'job', companyId: 'yc', version: 1, demo: true, data: { ...job.data, salary: 'B 改的' } })), 'VERSION_CONFLICT');
  assert.equal(env.svc.content(job.id).data.salary, 'A 改的');
  // 新建体验：内容和第 1 版都是草稿；版本草稿同时编辑同样被拒绝
  const yq = env.svc.content('yc-quick').data;
  const exp = env.svc.edit(ad, { kind: 'experience', companyId: null, version: 0, demo: false, data: { ...yq, title: '新体验' } });
  assert.equal(exp.state, 'draft'); assert.equal((env.svc.guide(guest(env).id, exp.id) as any).unavailable, true);
  const v1 = env.svc.versions(ad, exp.id).versions[0]; assert.equal(v1.state, 'draft');
  env.svc.updateVersion(ad, exp.id, 1, { data: { ...yq, title: '新体验 A' }, sourceNote: '平台整理', changeNote: '', rev: v1.rev, companyId: null });
  assert.equal(code(() => env.svc.updateVersion(ad, exp.id, 1, { data: { ...yq, title: '新体验 B' }, sourceNote: '平台整理', changeNote: '', rev: v1.rev, companyId: null })), 'VERSION_CONFLICT');
  assert.equal(code(() => env.svc.updateVersion(ad, exp.id, 1, { data: { ...yq, format: 'guided' }, sourceNote: '平台整理', changeNote: '', rev: v1.rev + 1, companyId: null })), 'FORMAT');
  // 送审、通过、发布后才公开
  env.svc.reviewVersion(ad, exp.id, 1, { action: 'submit' }); env.svc.reviewVersion(ad, exp.id, 1, { action: 'approve' }); env.svc.publishVersion(ad, exp.id, 1);
  assert.equal(env.svc.content(exp.id).status, 'published'); assert.equal(env.svc.content(exp.id).data.title, '新体验 A');
  // 非管理员不能使用任何后台写接口
  const stu = await login(env, '13800000034');
  assert.equal(code(() => env.svc.edit(stu.id, { kind: 'company', companyId: null, version: 0, demo: false, data: { title: 'x' } })), 'FORBIDDEN');
  assert.equal(code(() => env.svc.updateVersion(stu.id, exp.id, 1, {})), 'FORBIDDEN');
});

test('招聘规则沿用：编辑后需要企业重新确认才能发布；示例岗位投递只给演示提示', async () => {
  const env = fresh(); const admin = await login(env, '13800000015');
  env.store.run("UPDATE users SET role='admin' WHERE id=?", admin.id.userId!); const ad = env.auth.read(admin.token)!;
  const j = env.svc.content('j1');
  env.svc.edit(ad, { id: 'j1', kind: 'job', companyId: 'yc', version: j.version, demo: true, data: { ...j.data, salary: '¥220/天' } });
  assert.equal(env.svc.content('j1').status, 'pending');
  assert.equal(code(() => env.svc.transition(ad, 'j1', { action: 'publish', version: 2 })), 'UNCONFIRMED');
  env.svc.transition(ad, 'j1', { action: 'confirm', version: 2, note: '模拟企业确认（演示）' });
  env.svc.transition(ad, 'j1', { action: 'publish', version: 2 });
  assert.equal(env.svc.content('j1').status, 'published');
  const g = guest(env); const a = env.svc.apply(g.id, 'j1') as any;
  assert.equal(a.demo, true); assert.ok(!a.url);
  assert.equal(code(() => env.svc.apply(g.id, 'j4')), 'UNAVAILABLE', '已截止岗位没有投递入口');
});

test('简版练习：可以直接看参考思路；只看参考不生成完成记录，浏览 / 作答 / 完成分别记录', async () => {
  const env = fresh(); const u = await login(env, '13800000032');
  const g = env.svc.guide(u.id, 'yc-quick') as any;
  assert.ok(g.data.tasks.every((t: any) => t.reference && t.reference.length > 0), '简版练习没有返回参考思路');
  assert.equal((env.svc.publicContent('yc-quick') as any).data.tasks[0].reference, undefined, '公开列表不应直接带参考');
  const d = env.svc.saveDraft(u.id, 'yc-quick', { version: 0, contentVersion: 1, answers: {}, progress: { step: 0, visited: [0], referenceViewed: true } })!;
  assert.equal(d.progress.referenceViewed, true);
  assert.equal(code(() => env.svc.submit(u.id, 'yc-quick', { version: d.version, contentVersion: 1 })), 'INCOMPLETE');
  const m = env.svc.mine(u.id); assert.equal(m.records.length, 0);
  const row = m.drafts.find((x: any) => x.contentId === 'yc-quick')!;
  assert.equal(row.progress.referenceViewed, true); assert.equal(row.answered!.done, 0);
});

/* ---------- V1.4.1：公开状态优先级（授权 / 下架 / 待确认 优先于 已截止） ---------- */
function patchData(env: Env, id: string, patch: Record<string, unknown>) {
  const row = env.store.get('SELECT data FROM content WHERE id=?', id); env.store.run('UPDATE content SET data=? WHERE id=?', JSON.stringify({ ...JSON.parse(row.data), ...patch }), id);
}
const past = () => new Date(Date.now() - 86400000).toISOString();
const combos: [string, (env: Env) => void, string][] = [
  ['企业撤销授权 × 岗位已截止', env => patchData(env, 'yc', { authorized: false }), 'offline'],
  ['企业下架 × 岗位已截止', env => env.store.run("UPDATE content SET state='offline' WHERE id='yc'"), 'offline'],
  ['岗位待确认 × 已截止', env => env.store.run("UPDATE content SET confirmed_version=NULL WHERE id='j1'"), 'pending'],
  ['岗位下架 × 已截止', env => env.store.run("UPDATE content SET state='offline' WHERE id='j1'"), 'offline'],
  ['岗位草稿 × 已截止', env => env.store.run("UPDATE content SET state='draft' WHERE id='j1'"), 'draft']
];
for (const [name, apply, expected] of combos) {
  test('禁止公开优先于已截止：' + name, async () => {
    const env = fresh(); const u = await login(env, '13800000030'); const g = guest(env);
    env.svc.favorite(u.id, 'j1', true);                       // 先收藏，模拟旧链接 / 收藏夹
    patchData(env, 'j1', { deadline: past() }); apply(env);
    const c = env.svc.content('j1'); assert.equal(c.status, expected);
    const pub = env.svc.publicContent('j1') as any;
    assert.equal(pub.status, expected);
    assert.deepEqual(Object.keys(pub.data), ['title']); assert.equal(pub.data.title, '这项内容暂不可用');
    for (const k of ['duties', 'requirements', 'salary', 'applyUrl', 'source', 'deadline']) assert.equal(pub.data[k], undefined, '泄露字段 ' + k);
    assert.equal(pub.companyId, undefined);
    assert.ok(!env.svc.list('job').some((x: any) => x.id === 'j1'), '列表仍显示');
    assert.ok(!env.svc.list().some((x: any) => x.id === 'j1'), '全部列表仍显示');
    assert.equal(code(() => env.svc.apply(g.id, 'j1')), 'UNAVAILABLE', '投递入口没有关闭');
    assert.equal(code(() => env.svc.favorite(g.id, 'j1', true)), 'LOGIN_REQUIRED');
    assert.equal(code(() => env.svc.favorite(u.id, 'j1', true)), 'UNAVAILABLE', '还能新增收藏');
    const fav = env.svc.mine(u.id).favorites.find((f: any) => f.id === 'j1') as any;
    assert.equal(fav.data.title, '这项内容暂不可用'); assert.equal(fav.data.duties, undefined);
    // 关联推荐：企业详情页和体验详情页都从公开列表取岗位
    assert.ok(!env.svc.list('job').filter((x: any) => x.companyId === 'yc').some((x: any) => x.id === 'j1'));
  });
}
test('正常发布且授权有效 × 已截止：可以查看详情，但投递入口关闭', async () => {
  const env = fresh(); const g = guest(env);
  patchData(env, 'j1', { deadline: past() });
  const pub = env.svc.publicContent('j1') as any;
  assert.equal(pub.status, 'expired'); assert.ok(pub.data.duties && pub.data.requirements, '已截止的公开岗位应保留详情');
  assert.equal(pub.confirmation, undefined); assert.equal(pub.data.authorizationNote, undefined);
  assert.ok(env.svc.list('job').some((x: any) => x.id === 'j1' && x.status === 'expired'));
  assert.equal(code(() => env.svc.apply(g.id, 'j1')), 'UNAVAILABLE');
});
test('企业撤销授权后，学生自己的历史完成记录仍可查看', async () => {
  const env = fresh(); const u = await login(env, '13800000031');
  const c = env.svc.content('yc-quick'); assert.equal(c.companyId, 'yc');
  const answers = Object.fromEntries(c.data.tasks.map((t, i) => [String(i), t.options ? t.options[0] + '：理由写清楚了' : '理由写清楚了']));
  const d = env.svc.saveDraft(u.id, 'yc-quick', { version: 0, contentVersion: c.version, answers })!;
  const r = env.svc.submit(u.id, 'yc-quick', { version: d.version, contentVersion: c.version });
  patchData(env, 'yc', { authorized: false });
  assert.equal(env.svc.content('yc-quick').status, 'offline');
  assert.equal((env.svc.publicContent('yc-quick') as any).data.title, '这项内容暂不可用');
  const rec = env.svc.record(u.id, r.id) as any; assert.equal(rec.snapshot.data.title, c.data.title); assert.ok(rec.answers['0']);
});

test('生产环境禁止模拟验证码；演示数据脚本在生产环境拒绝运行', () => {
  assert.throws(() => authConfig({ NODE_ENV: 'production', SMS_PROVIDER: 'mock' } as any), (e: any) => e.code === 'AUTH_CONFIG');
  assert.throws(() => authConfig({ NODE_ENV: 'production', SMS_PROVIDER: 'http', SMS_GATEWAY_URL: 'https://sms.example', SMS_GATEWAY_TOKEN: 't', AUTH_SECRET: 'short' } as any), (e: any) => e.code === 'AUTH_CONFIG');
  assert.equal(authConfig({ NODE_ENV: 'production', SMS_PROVIDER: 'http', SMS_GATEWAY_URL: 'https://sms.example', SMS_GATEWAY_TOKEN: 't', AUTH_SECRET: 'x'.repeat(32) } as any), 'http');
  const path = join(mkdtempSync(join(tmpdir(), 'onstage-')), 'prod.sqlite');
  const prev = process.env.NODE_ENV; (process.env as any).NODE_ENV = 'production';
  try { const s = new Store(path); assert.throws(() => seed(s), /生产环境禁止/); assert.equal(s.get("SELECT count(*) n FROM sqlite_master WHERE name='content'")?.n ?? 0, 0, '生产环境下 seed 不应建表或写入数据'); s.db.close(); }
  finally { (process.env as any).NODE_ENV = prev; }
});

test('企业合作意向：必须同意联系方式用途；只有管理员能改状态', async () => {
  const env = fresh(); const g = guest(env);
  assert.throws(() => env.svc.cooperation(g.id, { company: '示例公司', contactName: '王', contact: 'hr@example.com', roles: '跨境运营岗位' }));
  const r = env.svc.cooperation(g.id, { company: '示例公司', contactName: '王', contact: 'hr@example.com', roles: '跨境运营岗位', consent: true });
  assert.equal(r.state, 'new');
  assert.equal(code(() => env.svc.updateIntent(g.id, r.id, { state: 'contacted' })), 'LOGIN_REQUIRED');
});

test('数据库升级：已有 V1.3 数据库运行 003 迁移后，既有体验获得第 1 版记录', () => {
  const path = join(mkdtempSync(join(tmpdir(), 'onstage-')), 'old.sqlite');
  const old = new Store(path);
  old.db.exec('CREATE TABLE migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)');
  for (const f of ['001_initial.sql', '002_portfolio.sql']) { old.db.exec(readFileSync('migrations/' + f, 'utf8')); old.run('INSERT INTO migrations VALUES (?,?)', f, 'x'); }
  old.run('INSERT INTO content VALUES (?,?,?,?,?,?,?,?,?,?)', 'old-exp', 'experience', null, 'published', 3, null, '', 1, JSON.stringify({ title: '旧体验' }), 'x');
  old.migrate();
  const v = old.get('SELECT * FROM experience_versions WHERE experience_id=?', 'old-exp');
  assert.equal(v.version, 3); assert.equal(v.state, 'published');
});
