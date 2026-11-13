/* 回归测试：实践完成状态与成果「完成时间」同一口径；AI 评测标题与 4 个回答一致；内容里不出现与模拟内容冲突的「真实」说法。
   运行：npx tsx --test tests/completion.test.ts */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { practiceState, practiceText, workTimes } from '../src/components/output';
import type { Work } from '../src/lib/local-data';
import { contentSchema } from '../src/server/validation';
import { aiEval, ANSWERS } from '../scripts/exp-ai-eval';
import { overseasGrowth } from '../scripts/exp-overseas-growth';
import { ROLES } from '../src/lib/buddy/config';
import { dateTime } from '../src/components/ui';

const work = (createdAt: string, updatedAt = createdAt): Work => ({ id: 'w1', label: '教学模拟作品', experienceId: 'overseas-growth', experienceTitle: 't', direction: 'd', outputTitle: 'o', contentVersion: 1, createdAt, updatedAt, sections: [], before: null, revisions: [] });
const T1 = '2026-11-12T08:00:00.000Z', T2 = '2026-11-12T09:30:00.000Z';

test('实践完成：保存过成果（只有作答写完才能保存）就算完成；不看浏览过哪些步骤（这里根本不传步骤）', () => {
  assert.equal(practiceState({ done: 16, total: 16 }, work(T1), true).kind, 'done');
  assert.equal(practiceState({ done: 16, total: 16 }, null, true).kind, 'ready');
  const later = practiceState({ done: 15, total: 16 }, work(T1), true);
  assert.equal(later.kind, 'done', '保存后草稿又改空一项：成果页仍有完成时间，所以仍算已完成');
  assert.equal(later.pending, 1);
  assert.equal(practiceState(null, work(T1), true).kind, 'done', '只有成果、读不到草稿（例如体验详情页）时同样算已完成');
  assert.equal(practiceState({ done: 3, total: 16 }, null, true).kind, 'doing');
  assert.equal(practiceState({ done: 0, total: 0 }, null, true).kind, 'doing', '没有题目时不能算完成');
  assert.equal(practiceState({ done: 5, total: 5 }, null, false).kind, 'no-output', '不生成成果的体验不显示完成实践');
  assert.equal(practiceState(null, null, true).kind, 'doing');
});

test('完成时间：用第一次保存完整成果的时间；之后再保存另记「最近修改」；「我的」和成果页文字一致', () => {
  assert.equal(workTimes(work(T1)), '完成于 ' + dateTime(T1));
  assert.equal(workTimes(work(T1, T2)), '完成于 ' + dateTime(T1) + ' · 最近修改 ' + dateTime(T2));
  const done = practiceText(practiceState({ done: 16, total: 16 }, work(T1, T2), true));
  assert.ok(done.startsWith('已完成实践 · 完成于 ' + dateTime(T1)), done);
  assert.ok(!practiceText(practiceState({ done: 16, total: 16 }, null, true)).includes('已完成'), '没保存成果时不能说已完成');
  assert.equal(practiceText(practiceState({ done: 15, total: 16 }, work(T1), true)), '已完成实践 · 完成于 ' + dateTime(T1) + ' · 之后草稿里还有 1 项没写完，成果仍是上次保存的版本');
  assert.equal(practiceText(practiceState(null, work(T1, T2), true)), '已完成实践 · 完成于 ' + dateTime(T1) + ' · 最近修改 ' + dateTime(T2), '体验详情页和「我的」用同一句话');
  assert.equal(practiceText(practiceState({ done: 3, total: 16 }, null, true)), '未完成实践 · 已作答 3/16');
});

test('AI 评测：标题、简介、任务材料都是 4 个回答，样例标为人工编写', () => {
  const d = contentSchema.parse(aiEval);
  assert.equal(Object.keys(ANSWERS).length, 4);
  assert.equal(d.title, '4 个 AI 回答，哪个更适合这位用户？做一份评测标准');
  assert.ok(d.about.includes('评估 4 个候选回答') && d.about.includes('人工编写的教学样例'));
  const m2 = d.guide!.brief.materials.find(m => m.id === 'm2')!;
  assert.equal(m2.items.length, 4); assert.ok(m2.title.includes('4 个候选回答'));
  assert.ok(d.guide!.brief.situation.includes('人工编写的教学样例'));
});

test('内容和动物推荐理由里不出现与模拟内容冲突的说法', () => {
  const bad = ['真实求助', '真实岗位场景', '放进真实工作', '两个 AI 回答', '两个回答'];
  const texts = { aiEval: JSON.stringify(aiEval), overseasGrowth: JSON.stringify(overseasGrowth), buddy: JSON.stringify(ROLES) };
  for (const [k, t] of Object.entries(texts)) for (const w of bad) assert.ok(!t.includes(w), `${k} 里还有「${w}」`);
});
