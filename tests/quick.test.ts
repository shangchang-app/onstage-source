/* V1.5 短体验：内容校验、完成条件、复盘规则、模拟数据的计算一致性。 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkGuide, contentSchema, requiredStatus, QUICK_ACTION_LABEL } from '../src/server/validation';
import { quickReview } from '../src/lib/quick-review';
import { quickData, quickPractice } from '../scripts/case-ops-returns';
import { Store } from '../src/server/db';
import { seed } from '../scripts/seed';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const store = new Store(join(mkdtempSync(join(tmpdir(), 'onstage-quick-')), 't.sqlite')); seed(store);
const data = contentSchema.parse(JSON.parse(store.get<{ data: string }>('SELECT data FROM content WHERE id=?', 'ops-returns')!.data));
const q = data.guide!.quick!;
const actions = Object.keys(quickData.actions);
const core = actions.filter(a => (quickData.actions as any)[a].tone === 'core');
const num = (s: string) => Number(s.replace(/[^0-9.−-]/g, '').replace('−', '-'));

test('短体验内容通过发布前检查；动作选项都有反馈', () => {
  assert.doesNotThrow(() => checkGuide(data));
  assert.deepEqual(quickPractice[0].fields.find(f => f.id === 'plan.actions')!.options, actions);
  const broken = structuredClone(data); broken.guide!.practice[0].fields[0].options.push('一个没有反馈的选项');
  assert.throws(() => checkGuide(broken), /每个选项都要有反馈/);
});

test('完成条件：理由必填；行动可以选建议，也可以只写自己的方案', () => {
  assert.ok(requiredStatus(data, {}).missing.includes(QUICK_ACTION_LABEL));
  assert.deepEqual(requiredStatus(data, { 'plan.own': '先下线新增车型', 'plan.reason': '车型不匹配涨得最多' }).missing, []);
  assert.deepEqual(requiredStatus(data, { 'plan.actions': [actions[0]], 'plan.reason': '理由' }).missing, []);
  assert.ok(requiredStatus(data, { 'plan.actions': ['不存在的行动'], 'plan.reason': '理由' }).missing.includes(QUICK_ACTION_LABEL));
  assert.equal(requiredStatus(data, { 'plan.actions': [actions[0]] }).missing.length, 1, '缺理由');
});

test('复盘规则：根据操作指出遗漏、取舍和验证方式', () => {
  const none = quickReview(q, { 'plan.actions': [actions.find(a => (quickData.actions as any)[a].tone === 'risky')!], 'plan.reason': 'x' }, []);
  for (const c of core) assert.ok(none.gaps.some(g => g.title.includes(c)), '没选的核心行动应被指出：' + c);
  for (const m of q.materials.filter(m => m.key)) assert.ok(none.gaps.some(g => g.title.includes(m.title)), '没看的关键材料应被指出：' + m.title);
  assert.ok(none.trade.some(t => t.tone === 'risky'), '高风险行动应出现在取舍里');
  assert.ok(none.gaps.some(g => g.title === '还缺的信息'));

  const good = quickReview(q, { 'plan.actions': core, 'plan.missing': [Object.keys(quickData.missing)[0]], 'plan.reason': 'x' }, q.materials.map(m => m.id));
  assert.equal(good.gaps.length, 0, '核心行动都选了、材料都看了、关键信息提了，就没有遗漏');
  assert.equal(good.verify.length, core.length); assert.ok(good.good.length >= core.length + 1);

  const many = quickReview(q, { 'plan.actions': actions.slice(0, 5), 'plan.reason': 'x' }, []);
  assert.match(many.many, /5 个行动/);
  const own = quickReview(q, { 'plan.own': '我的方案', 'plan.reason': 'x' }, []);
  assert.ok(own.noAction && own.gaps.every(g => !g.title.startsWith('没有选') || g.text.includes('系统不会读你写的文字')), '只写自己方案时，提示系统不读文字');
});

test('复盘不读取自由文字：理由写什么，规则反馈都一样', () => {
  const base = { 'plan.actions': [actions[0]], 'plan.missing': [] as string[] };
  const a = quickReview(q, { ...base, 'plan.reason': '因为车型不匹配从 6 单涨到 64 单' }, ['m-reason']);
  const b = quickReview(q, { ...base, 'plan.reason': '随便写的' }, ['m-reason']);
  assert.deepEqual({ ...a }, { ...b });
});

test('模拟数据的计算前后一致', () => {
  const profit = quickData.materials.find(m => m.id === 'm-profit')!.rows;
  const row = (k: string) => profit.find(r => r[0].startsWith(k))!;
  for (const col of [1, 2]) assert.equal(num(row('订单毛利合计')[col]) - num(row('退货损失')[col]) - num(row('广告花费')[col]), num(row('估算净利润')[col]));
  assert.equal(Math.round(697 * 13.00), num(row('订单毛利合计')[1]));
  assert.equal(Math.round(991 * 9.48), num(row('订单毛利合计')[2]));
  assert.equal(Math.round(33 * (13 + 8)), num(row('退货损失')[1]));
  assert.equal(Math.round(110 * (9.48 + 8)), num(row('退货损失')[2]));
  for (const [p, m] of [[39.99, 13.00], [35.99, 9.48]]) assert.equal(Math.round((p - Math.round(p * 0.12 * 100) / 100 - 6.5 - 15.69) * 100) / 100, m);
  const reasons = quickData.materials.find(m => m.id === 'm-reason')!.rows;
  assert.equal(reasons.reduce((s, r) => s + num(r[1]), 0), 33); assert.equal(reasons.reduce((s, r) => s + num(r[2]), 0), 110);
  for (const r of reasons) { const [a, b] = r[3].split('→').map(x => num(x)); assert.equal(a, Math.round(num(r[1]) / 697 * 1000) / 10, r[0]); assert.equal(b, Math.round(num(r[2]) / 991 * 1000) / 10, r[0]); }
  assert.equal(Math.round(33 / 697 * 1000) / 10, 4.7); assert.equal(Math.round(110 / 991 * 1000) / 10, 11.1);
  assert.equal(Math.round((991 / 697 - 1) * 100), 42); assert.equal(Math.round((3682 / 7028 - 1) * 100), -48);
  assert.equal(52 + 5 + 7, 64);
});
