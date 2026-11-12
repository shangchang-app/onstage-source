/* 出海增长体验（overseas-growth）的内容自查：结构合法、数字前后一致、示范与练习不同、来源可核验、开放题不设唯一答案。
   运行：npx tsx --test tests/overseas-growth.test.ts */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { contentSchema, checkGuide, requiredStatus, type Answers } from '../src/server/validation';
import { checkNumber } from '../src/lib/rule-check';
import { overseasGrowth, FUNNEL, rate } from '../scripts/exp-overseas-growth';
import { Store } from '../src/server/db';
import { seed } from '../scripts/seed';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const data = contentSchema.parse(overseasGrowth);
const g = data.guide!;
const fields = g.practice.flatMap(p => p.fields);
const all = JSON.stringify(overseasGrowth);

test('结构：通过发布前检查，6 步引导，有迁移练习和成果结构', () => {
  checkGuide(data);
  assert.equal(data.format, 'guided');
  assert.ok(g.practice.some(p => p.when === 'transfer'), '缺少迁移练习');
  assert.equal(g.output?.title, '用户假设与验证方案');
  // 每个必填字段都进了成果，用户自己写的内容不会丢
  const inOutput = new Set(g.output!.sections.flatMap(s => s.fields));
  for (const f of fields) assert.ok(inOutput.has(f.id), `字段 ${f.id} 没有进成果`);
  // 字段编号带本体验前缀，不和其他体验混用
  for (const f of fields) assert.match(f.id, /^g\d\./);
});

test('学生需要完成的 6 件事都有对应题目', () => {
  const labels = fields.map(f => f.label).join('|');
  for (const k of ['先服务哪类用户', '事实', '假设', '验证办法', '继续', '还缺什么信息']) assert.ok(labels.includes(k), '缺少：' + k);
});

test('数字一致：落地页表格、规则检查、参考思路里的比例都由同一份数据算出', () => {
  assert.deepEqual(FUNNEL.map(rate), [15, 19, 5, 40]);
  const table = g.brief.materials.find(m => m.id === 'm2')!;
  FUNNEL.forEach((r, i) => assert.deepEqual(table.rows[i], [r.seg, String(r.visits), String(r.emails), String(r.talk), r.from]));
  const f = fields.find(x => x.id === 'g3.rate')!;
  assert.equal(f.check?.kind, 'number');
  const c = f.check as Parameters<typeof checkNumber>[0];
  assert.equal(checkNumber(c, '19.0').state, 'ok');
  assert.equal(checkNumber(c, '19%').state, 'ok');
  assert.equal(checkNumber(c, '23.7').state, 'alt', '常见算错（愿聊 ÷ 留邮箱）要有说明');
  assert.equal(checkNumber(c, '40').state, 'off');
  const ref = g.reference.output.map(o => o.text).join('\n') + g.reference.alternatives.join('\n') + g.reference.pitfalls.join('\n');
  for (const s of ['19.0%', '40.0%', '5.0%', '310', '35 次', '420']) assert.ok(ref.includes(s), '参考思路里缺少或写错了：' + s);
  const talkMax = Math.max(...FUNNEL.map(r => r.talk));
  assert.equal(FUNNEL[1].talk, talkMax, '参考说留学生愿意聊的人最多，要和数据一致');
});

test('事实/推测题：参考标注都在选项里，且每条「事实」都能在材料里找到出处', () => {
  const f = fields.find(x => x.id === 'g2.facts')!;
  const mats = JSON.stringify(g.brief.materials);
  for (const e of f.check!.expect as string[]) assert.ok(f.options.includes(e));
  assert.ok(mats.includes('59'), '59 个邮箱');
  assert.ok(mats.includes('收摊后我在本子上写个总数'));
  assert.ok(mats.includes('只有简体中文和英文'));
  assert.ok(mats.includes('马来语是马来西亚的国语和官方语言'));
  // 推测项不在参考事实里
  for (const s of ['中国留学生愿意每月付费使用记账 App', '华人大学生记账的痛点不强']) assert.ok(!(f.check!.expect as string[]).includes(s));
});

test('比较口径：人群定义和是否重叠、文案和来源、统计口径、小样本、信号强度、参考结合约束', () => {
  const note = g.brief.materials.find(m => m.id === 'm2')!.note;
  for (const k of ['华人大学生＝', '中国留学生＝', '两类人互不包含', '没有去重', '同一版中英双语文案', '按打开次数计', '样本都很小', '不等于会用，更不等于会付钱']) assert.ok(note.includes(k), '材料 2 缺少：' + k);
  assert.ok(g.lessons.find(l => l.id === 'G5')!.point.includes('强度不同的信号'));
  assert.ok(g.reference.output[1].text.includes('结合本任务的约束') && g.reference.output[1].text.includes('6 周'));
});

test('开放题不设唯一答案：选人群、验证办法、迁移题都没有规则检查', () => {
  for (const id of ['g1.segment', 'g5.method', 'g7.change']) assert.equal(fields.find(f => f.id === id)!.check, undefined, id);
  assert.ok(g.reference.output[0].text.includes('不是评分依据'));
  assert.ok(g.reference.alternatives.length >= 3, '要展示多种合理方案');
});

test('示范和练习用不同的产品、市场和材料', () => {
  assert.ok(g.demo.title.includes('日本') && g.brief.role.includes('小账本'));
  const demoText = JSON.stringify(g.demo.materials), practiceText = JSON.stringify(g.brief.materials);
  assert.ok(!demoText.includes('小账本') && !demoText.includes('马来西亚'));
  assert.ok(!practiceText.includes('喂食器'));
});

test('来源：真实信息有网址和查阅日期，模拟信息有标注，不冒充行业基准或审核', () => {
  for (const p of g.provenance.filter(x => x.kind === 'public')) { assert.match(p.url, /^https:\/\//); assert.match(p.date, /2026-11-11/); }
  assert.ok(g.provenance.some(p => p.kind === 'sim'));
  for (const m of [...g.brief.materials, ...g.demo.materials].filter(m => m.id !== 'm4')) assert.ok(/模拟/.test(m.note), `材料「${m.title}」缺少模拟标注`);
  assert.equal(g.review, '未经出海增长从业者审核');
  assert.ok(!/cocreate|共创|专家审核|真实客户/.test(JSON.stringify(g.provenance)));
  assert.ok(all.includes('不是行业基准') || all.includes('不能当成行业基准'));
  assert.ok(data.about.includes('设计估计'), '时长要说明是设计估计');
});

test('完成状态：只看必填项有没有写，不看和参考是否一致', () => {
  const answers: Answers = {};
  for (const f of fields) answers[f.id] = f.kind === 'choices' ? [f.options[f.options.length - 1]] : '我自己的写法，和参考不一样';
  const st = requiredStatus(data, answers);
  assert.equal(st.missing.length, 0, st.missing.join('、'));
  delete answers['g6.missing'];
  assert.deepEqual(requiredStatus(data, answers).missing, ['还缺什么信息']);
});

test('注册：演示数据里能找到这个体验，已发布', () => {
  const store = new Store(join(mkdtempSync(join(tmpdir(), 'growth-')), 't.sqlite')); seed(store);
  const row = store.get<{ state: string; data: string }>('SELECT state, data FROM content WHERE id = ?', 'overseas-growth');
  assert.equal(row?.state, 'published');
  assert.equal(JSON.parse(row!.data).title, '一款产品进入新市场，先验证什么？');
  store.db.close();
});
