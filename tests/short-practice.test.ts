/* V1.8 短实践回归测试：两个「选一项」短实践的内容和校验、完成规则、复盘生成、轻量反馈（本机 + 导出 + 备份）、动物结果两级推荐。
   运行：npx tsx --test tests/short-practice.test.ts */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { contentSchema, checkGuide, requiredStatus, Problem, type Answers } from '../src/server/validation';
import { required } from '../src/components/work';
import { pickReview, quickReview } from '../src/lib/quick-review';
import { aiCheck } from '../scripts/exp-ai-check';
import { growthCheck } from '../scripts/exp-growth-check';
import { ROLES } from '../src/lib/buddy/config';
import { Store } from '../src/server/db';
import { Service } from '../src/server/service';
import { seed } from '../scripts/seed';

/* 内存里的 localStorage（本机数据函数在 Node 里也能测） */
const mem = new Map<string, string>();
(globalThis as any).localStorage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => { mem.set(k, String(v)); }, removeItem: (k: string) => { mem.delete(k); }, key: (i: number) => [...mem.keys()][i] ?? null, get length() { return mem.size; } };
const L = await import('../src/lib/local-data');

const SHORTS = [['ai-answer-check', contentSchema.parse(aiCheck)], ['growth-feedback', contentSchema.parse(growthCheck)]] as const;
const fieldsOf = (d: any) => d.guide.practice.flatMap((p: any) => p.fields);
const filled = (d: any, choice?: string): Answers => ({ 'plan.actions': [choice || fieldsOf(d)[0].options[0]], 'plan.reason': '我的理由', 'plan.follow': '我的后续' });
const db = () => { const s = new Store(join(mkdtempSync(join(tmpdir(), 'short-')), 'x.sqlite')); seed(s); return s; };

test('两个短实践：内容校验通过；5–8 分钟、零基础；选一项是单选、每个选项都有「为什么 / 取舍」反馈；数据全部标注教学模拟', () => {
  for (const [id, d] of SHORTS) {
    checkGuide(d); const q = d.guide!.quick!;
    assert.equal(q.mode, 'pick', id); assert.ok(d.minutes >= 5 && d.minutes <= 8, id + ' 时长'); assert.match(d.level, /零基础/);
    const f = fieldsOf(d); assert.deepEqual(f.map((x: any) => x.id), ['plan.actions', 'plan.reason', 'plan.follow']);
    assert.equal(f[0].single, true); assert.ok(f[0].options.length >= 3);
    for (const o of f[0].options) { assert.ok(q.actions[o]?.good, `${id}「${o}」缺少「为什么」`); assert.ok(q.actions[o].tone !== 'strong' ? q.actions[o].tradeoff : true, `${id}「${o}」缺少取舍`); }
    assert.equal(Object.values(q.actions).filter((v: any) => v.tone === 'strong').length, 1, id + ' 应只有一个「依据最充分」');
    assert.ok(q.materials.length >= 3 && q.materials.every((m: any) => m.source === 'sim'), id + ' 材料应全部是教学模拟');
    assert.ok(q.provenance.every((p: any) => p.kind === 'sim'));
    assert.match(q.simNote, /教学模拟/); assert.match(d.guide!.notInternship, /教学模拟/);
    assert.equal(q.stepNames?.length, 4); assert.equal(q.flow?.length, 4); assert.equal(q.refHeadings?.length, 4);
    assert.ok(q.deep && q.deepWhy.length > 20, id + ' 要写清完整版会学什么');
    const all = JSON.stringify(d); assert.doesNotMatch(all, /AI 点评|得分|正确率|你适合|你不适合|擅长/, id + ' 不应出现评分或适合度的说法');
  }
});

test('「选一项」模式的发布检查：选一项必须是单选，必须有 plan.follow 文字字段', () => {
  const [, base] = SHORTS[0];
  const noSingle = structuredClone(base); fieldsOf(noSingle)[0].single = false;
  assert.throws(() => checkGuide(noSingle), (e: unknown) => e instanceof Problem && /必须是单选/.test(e.message));
  const noFollow = structuredClone(base); noFollow.guide!.practice[0].fields = fieldsOf(base).filter((f: any) => f.id !== 'plan.follow');
  noFollow.guide!.output!.sections = noFollow.guide!.output!.sections.filter(s => !s.fields.includes('plan.follow'));
  assert.throws(() => checkGuide(noFollow), (e: unknown) => e instanceof Problem && /plan\.follow/.test(e.message));
});

test('完成规则：「选一项」只看三项作答本身（不重复计数）；多选的旧作答算没写完；页面和服务端一致；原短版规则不变', () => {
  for (const [id, d] of SHORTS) {
    const empty = requiredStatus(d, {}); assert.equal(empty.total, 3, id); assert.equal(empty.missing.length, 3);
    const ok = filled(d); assert.deepEqual(requiredStatus(d, ok), { total: 3, done: 3, missing: [] });
    const multi = { ...ok, 'plan.actions': fieldsOf(d)[0].options.slice(0, 2) }; assert.equal(requiredStatus(d, multi).done, 2);
    assert.match(requiredStatus(d, multi).missing[0], /只能选一项/);
    for (const a of [{}, ok, multi, { ...ok, 'plan.follow': ' ' }]) { const s = requiredStatus(d, a), c = required(d, a); assert.equal(c.total, s.total); assert.deepEqual(c.missing.map((m: any) => m.label), s.missing, id); }
  }
  const store = db(); const ops = contentSchema.parse(JSON.parse(store.all<{ data: string }>("SELECT data FROM content WHERE id='ops-returns'")[0].data)); store.db.close();
  const st = requiredStatus(ops, {}); assert.equal(st.total, fieldsOf(ops).filter((f: any) => f.required).length + 1, '原短版仍多一条「选一项行动或写自己的方案」');
});

test('即时反馈与复盘（纯函数）：只看选了哪一项、先看了哪一项的反馈、打开了哪些材料；理由和后续原样带出，不分析', () => {
  const [, d] = SHORTS[0]; const q = d.guide!.quick!; const [o1, o2, o3] = fieldsOf(d)[0].options;
  const r = pickReview(q, { ...filled(d, o2), 'plan.reason': '规则第 3 条' }, ['m-policy'], ['open:m-policy', 'fb:' + o3, 'fb:' + o2]);
  assert.equal(r.choice, o2); assert.equal(r.verdict.tone, 'strong'); assert.equal(r.first, o3, '应记下第一次看反馈的选项');
  assert.deepEqual(r.best, [o2]); assert.equal(r.reason, '规则第 3 条'); assert.equal(r.follow, '我的后续');
  assert.equal(r.others.length, 3); assert.ok(!r.others.some(x => x.option === o2));
  assert.deepEqual(r.gaps.map((g: { title: string }) => g.title), ['没有打开：这位用户的订单'], '没打开的关键材料要提醒');
  const same = pickReview(q, filled(d, o1), [], ['fb:' + o1]); assert.equal(same.first, '', '第一次看的就是现在这项时不重复提示');
  const multi = pickReview(q, { 'plan.actions': [o1, o2] }, [], []); assert.equal(multi.choice, ''); assert.equal(multi.multi, true);
  const unknown = pickReview(q, { 'plan.actions': ['不存在的选项'] }, [], ['fb:不存在的选项']); assert.equal(unknown.choice, ''); assert.deepEqual(unknown.seen, []);
  const t1 = pickReview(q, { ...filled(d, o2), 'plan.reason': 'AAA' }, [], []), t2 = pickReview(q, { ...filled(d, o2), 'plan.reason': '完全不同的理由' }, [], []);
  assert.deepEqual({ ...t1, reason: '' }, { ...t2, reason: '' }, '反馈和复盘不应随用户写的文字变化');
  // 原短版的复盘函数不受影响
  const store = db(); const ops = contentSchema.parse(JSON.parse(store.all<{ data: string }>("SELECT data FROM content WHERE id='ops-returns'")[0].data)); store.db.close();
  const a = Object.keys(ops.guide!.quick!.actions)[0]; assert.ok(quickReview(ops.guide!.quick, { 'plan.actions': [a], 'plan.reason': 'x' }, []).actions.includes(a));
});

test('轻量反馈：只存本机（标明未发送），同一体验同一版本再保存是修改；可以单独导出，也进备份；旧备份没有反馈也能导入', () => {
  mem.clear();
  assert.throws(() => L.saveFeedback({ experienceId: 'ai-answer-check', experienceTitle: 'x', contentVersion: 1, rating: 'bad' as any, reason: '' }), L.LocalError);
  const f1 = L.saveFeedback({ experienceId: 'ai-answer-check', experienceTitle: 'AI 短实践', contentVersion: 1, rating: 'hard', reason: '  材料多  ' });
  assert.equal(f1.sent, false); assert.equal(f1.reason, '材料多');
  const f2 = L.saveFeedback({ experienceId: 'ai-answer-check', experienceTitle: 'AI 短实践', contentVersion: 1, rating: 'helpful', reason: 'x'.repeat(600) });
  assert.equal(f2.id, f1.id); assert.equal(L.readFeedback().length, 1); assert.equal(f2.rating, 'helpful'); assert.equal(f2.reason.length, 500);
  L.saveFeedback({ experienceId: 'growth-feedback', experienceTitle: '出海短实践', contentVersion: 1, rating: 'easy', reason: '' });
  const ex = L.exportFeedback(); assert.equal(ex.items.length, 2); assert.match(ex.note, /没有发送给平台/);
  const bk = L.exportBackup(); assert.equal(bk.feedback.length, 2); assert.equal(bk.version, 1, '备份格式版本不变');
  // 换一个浏览器：导入新备份
  mem.clear(); const r = L.importBackup(JSON.stringify(bk)); assert.equal(r.feedbackAdded, 2); assert.equal(L.readFeedback().length, 2);
  assert.equal(L.importBackup(JSON.stringify(bk)).feedbackAdded, 0, '重复导入不重复');
  // 旧版备份（V1.8 以前，没有 feedback 字段）
  mem.clear(); const old = { format: 'onstage-backup', version: 1, exportedAt: '2026-11-01T00:00:00.000Z', works: [{ id: 'w1', label: '教学模拟作品', experienceId: 'ops-returns', experienceTitle: '旧', direction: '', outputTitle: '行动方案', contentVersion: 1, createdAt: '2026-11-01T00:00:00.000Z', updatedAt: '2026-11-01T00:00:00.000Z', sections: [], before: null, revisions: [] }], drafts: [] };
  const ro = L.importBackup(JSON.stringify(old)); assert.equal(ro.added, 1); assert.equal(ro.feedbackAdded, 0); assert.deepEqual(L.readFeedback(), []);
  // 坏数据不导入、不影响别的
  const bad = { ...old, works: [], feedback: [{ id: 'x', experienceId: 'a', contentVersion: 1, rating: '很好', reason: '', updatedAt: 'x' }] };
  assert.throws(() => L.importBackup(JSON.stringify(bad)), L.LocalError);
});

test('动物结果两级推荐：13 个结果第一入口都是短实践、第二入口是对应的完整实践；短实践做完推荐的完整版和第二入口一致；推荐语不谈能力和适合度', () => {
  const store = db(); const svc = new Service(store); const pub = (id: string) => svc.publicContent(id) as any;
  for (const r of ROLES) {
    const a = pub(r.rec.id), f = pub(r.rec.full.id);
    assert.equal(a.status, 'published', r.id); assert.ok(a.data.guideSummary?.quick, `${r.id} 的第一入口应是短实践`); assert.ok(a.data.minutes <= 10);
    assert.ok(f.data.guideSummary && !f.data.guideSummary.quick, `${r.id} 的第二入口应是完整实践`);
    assert.equal(a.data.guideSummary.deep, r.rec.full.id, `${r.id}：短实践做完推荐的完整版应和第二入口一致`);
    assert.doesNotMatch(r.rec.why + r.rec.full.why, /适合|擅长|能力|天生|注定|不适合/, r.id);
  }
  const used = new Set(ROLES.map(r => r.rec.id)); for (const id of ['ai-answer-check', 'growth-feedback', 'ops-returns']) assert.ok(used.has(id), id + ' 应被推荐');
  const s = pub('ai-answer-check').data.guideSummary; assert.deepEqual(s.steps, ['收到任务', '看对话和规则', '选一句并说明', '复盘']); assert.equal(s.flow.length, 4); assert.equal(s.quickMode, 'pick'); assert.ok(s.deepWhy);
  assert.deepEqual(pub('ops-returns').data.guideSummary.steps, ['收到任务', '看材料', '行动与理由', '复盘'], '原短版步骤名不变');
  store.db.close();
});
