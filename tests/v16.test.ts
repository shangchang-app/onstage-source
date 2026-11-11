/* V1.6：成果本机保存、备份导入导出、旧版草稿迁移、规则检查、两个完整体验的内容检查。 */
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { checkGuide, contentSchema, requiredStatus } from '../src/server/validation';
import { checkChoices, checkNumber, parseNumber } from '../src/lib/rule-check';
import * as L from '../src/lib/local-data';
import { Store } from '../src/server/db';
import { seed } from '../scripts/seed';

/* 测试用的 localStorage：可以模拟「存储不可用」和「空间已满」。 */
class Mem { m = new Map<string, string>(); mode: 'ok' | 'quota' | 'off' = 'ok';
  get length() { return this.m.size; } key(i: number) { return [...this.m.keys()][i] ?? null; }
  getItem(k: string) { if (this.mode === 'off') throw new Error('SecurityError'); return this.m.has(k) ? this.m.get(k)! : null; }
  setItem(k: string, v: string) { if (this.mode === 'off') throw new Error('SecurityError'); if (this.mode === 'quota') throw new DOMException('full', 'QuotaExceededError'); this.m.set(k, String(v)); }
  removeItem(k: string) { this.m.delete(k); } clear() { this.m.clear(); } }
const mem = new Mem(); (globalThis as any).localStorage = mem;
beforeEach(() => { mem.clear(); mem.mode = 'ok'; });

const store = new Store(join(mkdtempSync(join(tmpdir(), 'onstage-v16-')), 't.sqlite')); seed(store);
const content = (id: string) => contentSchema.parse(JSON.parse(store.get<{ data: string }>('SELECT data FROM content WHERE id=?', id)!.data));
const deep = content('ops-returns-deep'), ai = content('ai-eval'), quick = content('ops-returns');
const fieldsOf = (d: any) => d.guide.practice.flatMap((p: any) => p.fields);

test('两个完整体验通过发布前检查：成果结构引用的字段、规则检查的参考值都存在', () => {
  for (const d of [deep, ai, quick]) assert.doesNotThrow(() => checkGuide(d));
  for (const d of [deep, ai]) {
    assert.equal(d.guide!.practice.filter(p => p.when === 'transfer').length, 1, '应该有一个迁移练习');
    assert.ok(d.guide!.lessons.length >= 5, '至少 5 个方法要点'); assert.ok(d.guide!.output, '应该有成果结构');
    assert.ok(d.guide!.review.includes('未经'), '没有从业者审核时要写明');
    for (const p of d.guide!.provenance) if (p.url) assert.match(p.url, /^https:\/\//);
  }
  const bad = structuredClone(ai); bad.guide!.output!.sections[0].fields.push('不存在');
  assert.throws(() => checkGuide(bad), /不存在的字段/);
  const bad2 = structuredClone(ai); (fieldsOf(bad2).find((f: any) => f.id === 'c.tags').check as any).expect = ['不是选项'];
  assert.throws(() => checkGuide(bad2), /参考标注不在选项里/);
});

test('示范、正式任务和迁移练习用的是不同材料', () => {
  for (const d of [deep, ai]) {
    const g = d.guide!; const demo = JSON.stringify(g.demo.materials), brief = JSON.stringify(g.brief.materials), tr = g.practice.find(p => p.when === 'transfer')!.material;
    assert.ok(tr.length > 20); assert.ok(!brief.includes(tr.slice(0, 15)) && !demo.includes(tr.slice(0, 15)));
  }
  assert.ok(JSON.stringify(deep.guide!.demo).includes('手机壳') && !JSON.stringify(deep.guide!.demo).includes('刹车片'));
  assert.ok(JSON.stringify(ai.guide!.demo).includes('天空') && !JSON.stringify(ai.guide!.demo).includes('VLOOKUP'));
});

test('规则检查：只核对数字和标签', () => {
  assert.equal(parseNumber('约 4.7%'), 4.7); assert.equal(parseNumber('百分之 11.10'), 11.1); assert.equal(parseNumber('1,000 单'), 1000); assert.equal(parseNumber('没有数字'), null);
  const f = fieldsOf(deep).find((x: any) => x.id === 'p0.rate').check;
  assert.equal(checkNumber(f, '3.7%').state, 'ok'); assert.equal(checkNumber(f, '6.5%').state, 'alt'); assert.equal(checkNumber(f, '10%').state, 'off'); assert.equal(checkNumber(f, '不会').state, 'nonum'); assert.equal(checkNumber(f, '').state, 'empty');
  for (const [id, v] of [['p1.before', '4.73%'], ['p1.after', '11.1'], ['t.before', '5.1%'], ['t.after', '5.11%']]) assert.equal(checkNumber(fieldsOf(deep).find((x: any) => x.id === id).check, v).state, 'ok', id);
  const c = fieldsOf(ai).find((x: any) => x.id === 'd.tags').check;
  const r = checkChoices(c, ['不适合用户的环境', '事实错误']); assert.deepEqual(r.matched, ['不适合用户的环境']); assert.deepEqual(r.extra, ['事实错误']); assert.equal(r.missed.length, 2); assert.equal(r.same, false);
  assert.ok(c.why['事实错误'], '多选的标签要有说明');
});

test('模拟数据计算正确（热身、正式任务、迁移练习）', () => {
  assert.equal(Math.round((10 + 27) / (100 + 900) * 1000) / 10, 3.7); assert.equal((10 / 100 * 100 + 27 / 900 * 100) / 2, 6.5);
  assert.equal(Math.round(33 / 697 * 1000) / 10, 4.7); assert.equal(Math.round(110 / 991 * 1000) / 10, 11.1);
  assert.equal(Math.round(51 / 1000 * 1000) / 10, 5.1); assert.equal(Math.round(92 / 1800 * 1000) / 10, 5.1);
  for (const [o, r] of [[400, 20], [600, 31], [800, 40], [1000, 52]]) assert.ok(r / o >= 0.05 && r / o <= 0.052);
});

test('成果只包含用户自己的作答，不混入参考答案；看参考前的版本单独保留', () => {
  const g = deep.guide!; const answers: Record<string, any> = { 'p1.before': '4.7%', 'p3.main': '车型不匹配最多', 'pre.p3.main': '质量问题', 'p4.causes': ['新增车型的适配数据有错'] };
  const now = L.buildSections(g, answers), before = L.buildSections(g, answers, 'pre.');
  const text = JSON.stringify(now);
  assert.ok(text.includes('车型不匹配最多') && !text.includes('质量问题')); assert.ok(JSON.stringify(before).includes('质量问题'));
  for (const o of g.reference.output) assert.ok(!text.includes(o.text.slice(0, 20)), '成果里出现了参考答案');
  assert.deepEqual(now.map(s => s.heading), g.output!.sections.map(s => s.heading));
});

test('保存成果：第一次新建，再次保存保留修改记录；内容不变不重复记录', () => {
  const base = { experienceId: 'ai-eval', experienceTitle: 'AI', direction: 'AI 产品运营', outputTitle: '评测标准与案例分析', contentVersion: 1, before: null };
  const a = L.saveWork({ ...base, sections: [{ heading: '评测标准', items: [{ label: '标准', text: '准确' }] }] });
  assert.ok(a.created); assert.equal(a.work.label, '教学模拟作品');
  const b = L.saveWork({ ...base, sections: [{ heading: '评测标准', items: [{ label: '标准', text: '准确、完成任务' }] }] });
  assert.ok(!b.created && b.changed); assert.equal(b.work.revisions.length, 1); assert.equal(b.work.revisions[0].sections[0].items[0].text, '准确');
  const c = L.saveWork({ ...base, sections: b.work.sections }); assert.equal(c.changed, false); assert.equal(L.readWorks()[0].revisions.length, 1);
  assert.equal(L.readWorks().length, 1);
});

test('清除草稿不会删除成果', () => {
  mem.setItem(L.DRAFT_KEY, JSON.stringify({ owner: 'local:x', schema: 2, drafts: { 'ai-eval': { content_id: 'ai-eval', content_version: 1, answers: { 'q1.goal': 'x' } } }, recoveries: [] }));
  L.saveWork({ experienceId: 'ai-eval', experienceTitle: 'AI', direction: '', outputTitle: 'T', contentVersion: 1, before: null, sections: [] });
  L.discardDraft('ai-eval');
  assert.equal(JSON.parse(mem.getItem(L.DRAFT_KEY)!).drafts['ai-eval'], undefined); assert.equal(L.readWorks().length, 1);
});

test('存储不可用、空间已满时给出真实错误和恢复办法', () => {
  const input = { experienceId: 'x', experienceTitle: 'x', direction: '', outputTitle: 'T', contentVersion: 1, before: null, sections: [] };
  mem.mode = 'quota'; assert.throws(() => L.saveWork(input), (e: any) => e.code === 'QUOTA' && e.recovery.includes('导出备份'));
  mem.mode = 'off'; assert.throws(() => L.saveWork(input), (e: any) => e.code === 'UNAVAILABLE' && e.recovery.length > 0);
});

test('导出、导入备份：往返一致；不覆盖较新的内容；错误文件给出原因且不改动现有数据', () => {
  L.saveWork({ experienceId: 'ai-eval', experienceTitle: 'AI', direction: '', outputTitle: 'T', contentVersion: 1, before: null, sections: [{ heading: 'h', items: [{ label: 'l', text: '旧' }] }] });
  mem.setItem(L.DRAFT_KEY, JSON.stringify({ owner: 'local:a', schema: 2, drafts: { 'ops-returns': { content_id: 'ops-returns', content_version: 1, answers: { 'plan.reason': '理由' }, progress: { step: 2 } } }, recoveries: [] }));
  const backup = JSON.stringify(L.exportBackup()); assert.equal(JSON.parse(backup).format, 'onstage-backup');
  mem.clear();
  const r = L.importBackup(backup); assert.equal(r.added, 1); assert.equal(r.draftsAdded, 1);
  assert.equal(L.readWorks()[0].sections[0].items[0].text, '旧'); assert.equal(JSON.parse(mem.getItem(L.DRAFT_KEY)!).drafts['ops-returns'].answers['plan.reason'], '理由');
  // 本机有更新的版本：导入旧备份不覆盖
  L.saveWork({ experienceId: 'ai-eval', experienceTitle: 'AI', direction: '', outputTitle: 'T', contentVersion: 1, before: null, sections: [{ heading: 'h', items: [{ label: 'l', text: '新' }] }] });
  const r2 = L.importBackup(backup); assert.equal(r2.kept, 1); assert.equal(r2.draftsSkipped, 1); assert.equal(L.readWorks()[0].sections[0].items[0].text, '新');
  const snapshot = mem.getItem(L.WORKS_KEY);
  for (const [bad, code] of [['not json', 'IMPORT_FORMAT'], [JSON.stringify({ format: 'other' }), 'IMPORT_FORMAT'], [JSON.stringify({ format: 'onstage-backup', version: 9 }), 'IMPORT_VERSION'], [JSON.stringify({ format: 'onstage-backup', version: 1, works: [{ id: 1 }], drafts: [] }), 'IMPORT_EMPTY'], ['x'.repeat(6 * 1024 * 1024), 'IMPORT_TOO_LARGE']] as const)
    assert.throws(() => L.importBackup(bad), (e: any) => e.code === code && e.recovery.length > 0, code);
  assert.equal(mem.getItem(L.WORKS_KEY), snapshot, '导入失败不应改动现有成果');
});

test('旧版草稿升级：线上 V1.4.1 的 6 步作答复制到完整版，原处保留（可回滚）；短体验草稿不受影响；只迁移一次', () => {
  const db: any = { owner: 'local:a', drafts: { 'ops-returns': { content_id: 'ops-returns', content_version: 1, version: 3, answers: { 'p1.before': '约 4.7%', 'p5.first': '先核对车型' }, progress: { step: 3, visited: [0, 1, 2, 3] }, conflict: 0, conflict_with: null, saved_at: 't' }, 'yc-quick': { content_id: 'yc-quick', content_version: 1, answers: { '0': 'x' } } }, recoveries: [{ id: 'r1', content_id: 'ops-returns', answers: { 'p2.when': '第 4 周' } }] };
  assert.equal(L.migrateDraftDb(db), true);
  assert.equal(db.drafts['ops-returns-deep'].answers['p1.before'], '约 4.7%'); assert.equal(db.drafts['ops-returns-deep'].progress.step, 3);
  assert.equal(db.drafts['ops-returns'].answers['p1.before'], '约 4.7%', '原处的旧作答应保留，便于回滚'); assert.equal(db.drafts['ops-returns'].progress.step, 0);
  assert.ok(db.recoveries.some((r: any) => r.content_id === 'ops-returns-deep' && r.answers['p2.when'])); assert.ok(db.recoveries.some((r: any) => r.content_id === 'ops-returns'));
  db.drafts['ops-returns-deep'].answers['p1.before'] = '改过'; assert.equal(db.drafts['ops-returns'].answers['p1.before'], '约 4.7%', '复制后两份互不影响');
  assert.ok(db.drafts['yc-quick']); assert.equal(db.schema, 2);
  assert.equal(L.migrateDraftDb(db), false, '不应重复迁移');
  const both: any = { owner: 'o', drafts: { 'ops-returns': { content_id: 'ops-returns', content_version: 1, answers: { 'p1.before': '旧' } }, 'ops-returns-deep': { content_id: 'ops-returns-deep', content_version: 1, answers: { 'p1.before': '新' } } }, recoveries: [] };
  L.migrateDraftDb(both); assert.equal(both.drafts['ops-returns-deep'].answers['p1.before'], '新'); assert.equal(both.recoveries[0].answers['p1.before'], '旧', '两份都有时，旧的放进可恢复的作答');
  const q: any = { owner: 'o', drafts: { 'ops-returns': { content_id: 'ops-returns', content_version: 1, answers: { 'plan.reason': '短体验' } } }, recoveries: [] };
  L.migrateDraftDb(q); assert.equal(q.drafts['ops-returns'].answers['plan.reason'], '短体验'); assert.equal(q.drafts['ops-returns-deep'], undefined);
  mem.setItem('onstage:backup:local:a:ops-returns', JSON.stringify({ answers: { 'p3.main': '暂存' } }));
  mem.setItem('onstage:reflection:ops-returns', JSON.stringify({ owner: 'local:a', reflection: { understand: 'yes', likes: ['读一份 6 周的运营数据'] } }));
  L.migrateLocalKeys();
  assert.ok(mem.getItem('onstage:backup:local:a:ops-returns-deep')); assert.ok(mem.getItem('onstage:backup:local:a:ops-returns'), '原暂存保留');
  assert.ok(mem.getItem('onstage:reflection:ops-returns-deep')); assert.ok(mem.getItem('onstage:reflection:ops-returns'));
});

test('保存条件只看必填项是否写了，不看是否和参考一致（数字算错、标签不同、排序不同都可以保存）', () => {
  const fields = fieldsOf(ai).filter((f: any) => f.required);
  const ans: Record<string, any> = {}; for (const f of fields) ans[f.id] = f.kind === 'choices' ? [f.options[f.options.length - 1]] : '和参考不同的看法';
  ans['q5.rank'] = 'C > B > A > D'; ans['c.tags'] = ['没发现明显问题']; ans['q7.shift'] = ['语气友好'];
  assert.deepEqual(requiredStatus(ai, ans).missing, []);
  const dfields = fieldsOf(deep).filter((f: any) => f.required); const d: Record<string, any> = {};
  for (const f of dfields) d[f.id] = f.kind === 'choices' ? [f.options[0]] : '99%';
  assert.deepEqual(requiredStatus(deep, d).missing, [], '数字算错也能保存');
  assert.ok(requiredStatus(ai, { ...ans, 'q5.rank': '' }).missing.length === 1, '必填项没写会提醒');
});

test('完成条件包含迁移练习：只看不做不能保存成果', () => {
  const fields = fieldsOf(deep).filter((f: any) => f.required);
  const all: Record<string, any> = {}; for (const f of fields) all[f.id] = f.kind === 'choices' ? [f.options[0]] : '写了内容';
  assert.deepEqual(requiredStatus(deep, all).missing, []);
  const noTransfer = { ...all }; delete noTransfer['t.hypo']; assert.ok(requiredStatus(deep, noTransfer).missing.length === 1);
});
