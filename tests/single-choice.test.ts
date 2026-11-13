/* 单选题回归测试（出海增长独立复验）：单选互斥的判断规则、旧草稿里的非法数据、完成与保存校验、真正多选题保持原行为。
   运行：npx tsx --test tests/single-choice.test.ts */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { contentSchema, checkGuide, requiredStatus, choiceIssue, fieldDone, missingLabel, Problem, type Answers } from '../src/server/validation';
import { required } from '../src/components/work';
import { overseasGrowth } from '../scripts/exp-overseas-growth';
import { aiEval } from '../scripts/exp-ai-eval';
import { Store } from '../src/server/db';
import { Auth } from '../src/server/auth';
import { Service } from '../src/server/service';
import { seed } from '../scripts/seed';

const data = contentSchema.parse(overseasGrowth);
const fields = data.guide!.practice.flatMap(p => p.fields);
const F = (id: string) => fields.find(f => f.id === id)!;
/* 一份完整、合法的作答：单选题各选一项，多选题选多项。 */
const full = (): Answers => {
  const a: Answers = {};
  for (const f of fields) a[f.id] = f.kind === 'choices' ? (f.single ? [f.options[1]] : [f.options[0], f.options[2]]) : '我自己的写法';
  return a;
};
const SEG = 'g1.segment', CHG = 'g7.change';

test('出海增长：「选一类 / 选一项」两题是单选；标注「可多选」的两题仍是多选', () => {
  assert.equal(F(SEG).single, true); assert.equal(F(CHG).single, true);
  for (const id of ['g2.facts', 'g5.method']) assert.equal(F(id).single, false, id + ' 应保持多选');
  for (const f of fields.filter(f => f.kind === 'choices')) assert.equal(f.single, /（选一[类项]）/.test(f.label), `「${f.label}」的单选设置和题目说明不一致`);
  checkGuide(data);
});

/* 全站选择题按题意区分单选和多选（不按参考标注有几项自动判断）。 */
const SINGLE: Record<string, string[]> = { 'overseas-growth': ['g1.segment', 'g7.change'], 'ai-eval': ['q7.shift'], 'ops-returns-deep': ['t.judge'] };
const allGuided = () => { const s = new Store(join(mkdtempSync(join(tmpdir(), 'single-all-')), 'x.sqlite')); seed(s);
  const rows = s.all<{ id: string; data: string }>("SELECT id, data FROM content WHERE kind = 'experience'"); s.db.close();
  return rows.map(r => ({ id: r.id, data: contentSchema.parse(JSON.parse(r.data)) })).filter(r => r.data.format === 'guided' && r.data.guide); };

test('全站选择题：按题意只有 4 题是单选（选一类 / 选一项 / 变化最大 / 你的判断），其余保持多选', () => {
  const found: Record<string, string[]> = {}; let multi = 0;
  for (const { id, data: d } of allGuided()) {
    checkGuide(d);
    for (const f of d.guide!.practice.flatMap(p => p.fields).filter(f => f.kind === 'choices')) {
      if (f.single) (found[id] ||= []).push(f.id); else multi++;
      if (/可多选|可以选多项|可以多选/.test(f.label)) assert.equal(f.single, false, `${id} ${f.id} 题目写着可多选`);
    }
  }
  assert.deepEqual(found, SINGLE); assert.ok(multi >= 10, '多选题数量不对：' + multi);
});

test('不按参考标注数量自动改单选：AI 评测回答 A、C 的参考标注只有一项，题目允许多选，仍是多选', () => {
  const ai = contentSchema.parse(aiEval); const fs = ai.guide!.practice.flatMap(p => p.fields);
  for (const id of ['a.tags', 'c.tags']) { const f = fs.find(x => x.id === id)!; assert.equal(f.check?.expect.length, 1); assert.equal(f.single, false, id); }
  const pr = (id: string) => ai.guide!.practice.find(p => p.id === id)!.prompt;
  assert.match(pr('q3'), /可以多选/); assert.match(pr('q4'), /^同样/, '回答 C、D 沿用「可以多选」');
});

test('新改为单选的两题：旧草稿多选、失效选项都列在「还差」里；页面和服务端规则一致；草稿不被改动', () => {
  for (const { id, data: d } of allGuided().filter(r => r.id === 'ai-eval' || r.id === 'ops-returns-deep')) {
    const fs = d.guide!.practice.flatMap(p => p.fields); const fid = SINGLE[id][0]; const f = fs.find(x => x.id === fid)!;
    const okA: Answers = {}; for (const x of fs) okA[x.id] = x.kind === 'choices' ? (x.single ? [x.options[0]] : [x.options[0], x.options[1]]) : '我自己的写法';
    assert.equal(requiredStatus(d, okA).missing.length, 0, id + ' 合法作答应全部完成');
    const legacy = { ...okA, [fid]: [f.options[0], f.options[1]] }; const before = JSON.stringify(legacy);
    assert.deepEqual(requiredStatus(d, legacy).missing, [`${f.label}：选了 2 项，只能选一项，请重新确认`], id);
    assert.deepEqual(required(d, legacy).missing.map((m: { label: string; field?: string }) => [m.label, m.field]), [[`${f.label}：选了 2 项，只能选一项，请重新确认`, fid]], id + ' 页面规则');
    assert.deepEqual(requiredStatus(d, { ...okA, [fid]: ['已删掉的旧选项'] }).missing, [`${f.label}：之前的选择已不在选项里，请重新选择`], id);
    assert.equal(JSON.stringify(legacy), before, '校验不能改动作答');
  }
});

test('单选判断：恰好一项且在选项里才算完成；多项、文字、失效选项、空都不算', () => {
  const f = F(SEG);
  assert.equal(choiceIssue(f, [f.options[0]]), null);
  assert.deepEqual(choiceIssue(f, [f.options[0], f.options[3]]), { kind: 'multi', picked: [f.options[0], f.options[3]] });
  assert.deepEqual(choiceIssue(f, f.options[0]), { kind: 'unknown', picked: [f.options[0]] }, '旧格式（文字）不替用户换算成选项');
  assert.deepEqual(choiceIssue(f, ['已经删掉的旧选项']), { kind: 'unknown', picked: ['已经删掉的旧选项'] });
  assert.deepEqual(choiceIssue(f, []), { kind: 'empty' }); assert.deepEqual(choiceIssue(f, undefined), { kind: 'empty' });
  for (const v of [[f.options[0], f.options[1]], f.options[0], ['已经删掉的旧选项'], []]) assert.equal(fieldDone(f, v), false, JSON.stringify(v));
});

test('多选题保持原行为：选多项算完成；选项不在题目里仍不算完成，说明文字不变', () => {
  const f = F('g2.facts');
  assert.equal(choiceIssue(f, [f.options[0], f.options[2], f.options[4]]), null);
  assert.equal(fieldDone(f, f.options.slice(0, 5)), true);
  assert.equal(fieldDone(f, ['不存在的选项']), false);
  assert.equal(missingLabel(f, ['不存在的选项']), f.label, '多选题的「还差」文字沿用原来的题目');
});

test('完成校验（服务端规则）：旧多选、非法旧数据都列在「还差」里并说明原因，合法作答全部完成', () => {
  const ok = full(); const st = requiredStatus(data, ok);
  assert.equal(st.missing.length, 0, st.missing.join('、')); assert.equal(st.done, st.total);
  const legacy = { ...ok, [SEG]: [F(SEG).options[0], F(SEG).options[3]], [CHG]: ['已经删掉的旧选项'] };
  const before = JSON.stringify(legacy);
  const m = requiredStatus(data, legacy).missing;
  assert.deepEqual(m, ['先服务哪类用户（选一类）：选了 2 项，只能选一项，请重新确认', '方案需要怎样调整（选一项）：之前的选择已不在选项里，请重新选择']);
  assert.equal(JSON.stringify(legacy), before, '校验不能改动作答');
  assert.deepEqual(requiredStatus(data, { ...ok, [SEG]: F(SEG).options[0] }).missing, ['先服务哪类用户（选一类）：之前的选择已不在选项里，请重新选择']);
});

test('页面上的「还差」和保存入口用的规则与服务端一致，并能定位到这道题', () => {
  const legacy = { ...full(), [SEG]: [F(SEG).options[0], F(SEG).options[1]] };
  const st = required(data, legacy);
  assert.deepEqual(st.missing, [{ label: '先服务哪类用户（选一类）：选了 2 项，只能选一项，请重新确认', practice: 'g1', field: SEG }]);
  assert.equal(required(data, full()).missing.length, 0);
  for (const a of [full(), legacy, { ...full(), [CHG]: '不需要调整' }]) assert.deepEqual(required(data, a).missing.map((x: { label: string }) => x.label), requiredStatus(data, a).missing, '页面和服务端的「还差」不一致');
});

test('发布前检查：非选择题不能设为单选；单选题的参考标注只能有一项', () => {
  const bad1 = contentSchema.parse(JSON.parse(JSON.stringify(overseasGrowth)));
  bad1.guide!.practice[0].fields[1].single = true;
  assert.throws(() => checkGuide(bad1), (e: unknown) => e instanceof Problem && /不能设为单选/.test(e.message));
  const bad2 = contentSchema.parse(JSON.parse(JSON.stringify(overseasGrowth)));
  const g1 = bad2.guide!.practice[0].fields[0];
  g1.check = { kind: 'choices', expect: [g1.options[0], g1.options[1]], tol: 0, unit: '', alt: [], explain: '', why: {} };
  assert.throws(() => checkGuide(bad2), (e: unknown) => e instanceof Problem && /只能有一项/.test(e.message));
});

test('完成记录（服务端提交）：旧草稿单选题有多项时拒绝完成，草稿原样保存；重新选一项后可以完成', async () => {
  const base = join(mkdtempSync(join(tmpdir(), 'single-')), 'seed.sqlite'); { const s = new Store(base); seed(s); s.db.close(); }
  const path = join(mkdtempSync(join(tmpdir(), 'single-')), 'db.sqlite'); copyFileSync(base, path);
  const store = new Store(path); store.migrate(); const auth = new Auth(store, { send: async () => {} }); const svc = new Service(store);
  const g = auth.issue(); const { code } = await auth.send('13800009901', g.identity.owner) as { code: string }; const u = auth.verify('13800009901', code, g.identity, g.token).identity;
  const legacy = { ...full(), [SEG]: [F(SEG).options[0], F(SEG).options[3]] };
  const d = svc.saveDraft(u, 'overseas-growth', { version: 0, contentVersion: 1, answers: legacy })!;
  assert.deepEqual(svc.draft(u, 'overseas-growth')!.answers[SEG], legacy[SEG], '保存草稿时不能静默丢掉或替用户选');
  assert.throws(() => svc.submit(u, 'overseas-growth', { version: d.version, contentVersion: 1 }), (e: unknown) => e instanceof Problem && e.code === 'INCOMPLETE' && e.message.includes('只能选一项'));
  const d2 = svc.saveDraft(u, 'overseas-growth', { version: d.version, contentVersion: 1, answers: { ...legacy, [SEG]: [F(SEG).options[3]] } })!;
  assert.equal(svc.submit(u, 'overseas-growth', { version: d2.version, contentVersion: 1 }).duplicate, false);
  store.db.close();
});
