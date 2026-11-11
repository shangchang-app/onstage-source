/* V1.7「你的隐藏工位搭子」规则测试：穷举全部 65,536 种作答组合。
   这些测试只检查规则配置是否自洽、可复现、没有明显偏向，不证明任何人格判断的有效性。 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { PROJECT, REGULAR_IDS, ROLES, RULES, RULES_CHANGELOG, RULES_VERSION, SCENARIOS, TIEBREAK, type RegularId } from '../src/lib/buddy/config';
import { detourCount, evidence, outcome, ranking, resolve, sanitize, scores, tieKey, type Answers } from '../src/lib/buddy/engine';
import { allAnswers, samplePaths } from '../src/lib/buddy/paths';
import { BUDDY_KEY, EMPTY, load, save } from '../src/lib/buddy/store';
import { DRAFT_KEY, WORKS_KEY } from '../src/lib/local-data';

const all = [...allAnswers()];
const paths = samplePaths();
const optText = (sid: string, oid?: string) => SCENARIOS.find(s => s.id === sid)!.options.find(o => o.id === oid)!.text;
const seed = readFileSync('scripts/seed.ts', 'utf8');
const simpleIds = [...seed.matchAll(/add\('([\w-]+)','experience',simple\(/g)].map(m => m[1]);
const expIds = [...seed.matchAll(/add\('([\w-]+)','experience'/g)].map(m => m[1]);

test('配置：8 个情境、每题 4 个选项、12 个常规角色 + 1 个隐藏角色，名称和一句话与已确定的一致', () => {
  assert.equal(SCENARIOS.length, 8); for (const s of SCENARIOS) assert.equal(s.options.length, 4);
  assert.equal(ROLES.length, 13); assert.equal(REGULAR_IDS.length, 12);
  const fixed: [string, string][] = [['开十个标签页的狐狸', '等一下，还有一种可能。'], ['正在潜水的水獭', '没回消息，但快查明白了。'], ['叼着 Demo 的边牧', '你们先聊，我做了一个。'], ['自带时区的猫', '我有我的进度条。'], ['口袋塞满 Plan B 的松鼠', '别慌，我还留了一手。'], ['给大家留气口的海豹', '先喘口气，事情还能解决。'], ['什么都想拆开的浣熊', '让我看看它到底怎么工作的。'], ['同时伸出八只手的章鱼', '这边我接，那边我也能搭一下。'], ['半夜突然想通的猫头鹰', '刚才那件事，我想明白了。'], ['自带集合点的企鹅', '我们先确认一下，去哪儿集合。'], ['耳朵先收到消息的兔子', '你们有没有注意到这个变化？'], ['有边界的小刺猬', '能做，但有件事得先说清楚。'], ['不按物种出牌的鸭嘴兽', '你给了三个选项，我找到了第四条路。']];
  assert.deepEqual(ROLES.map(r => [r.name, r.line]), fixed);
  for (const r of ROLES) { assert.ok(r.strength.startsWith('在这次情境中，你'), r.id + ' 的说明要用「在这次情境中，你……」'); assert.ok(r.tradeoff.length > 8); }
  for (const s of SCENARIOS) for (const o of s.options) { const w = Object.values(o.w); assert.deepEqual(w.sort(), [1, 2], `${s.id}/${o.id} 应该是一个 +2 和一个 +1`); }
  const banned = /百分比|适配度|稀有|排名|测评结果|人格类型|能力认证/;
  for (const r of ROLES) assert.ok(!banned.test(r.strength + r.tradeoff + r.line), r.id + ' 文案里不应出现百分比、稀有度、排名等表述');
});

test('选项 id：固定的语义名，题内唯一，和显示位置无关', () => {
  for (const s of SCENARIOS) {
    const ids = s.options.map(o => o.id); assert.equal(new Set(ids).size, 4, s.id + ' 选项 id 重复');
    for (const id of ids) assert.ok(/^[a-z][a-z0-9-]{3,}$/.test(id), `${s.id}/${id} 应是语义名，不是 a–d 这样的位置字母`);
  }
});

test('6 个「另辟蹊径」选项分散在不同位置，不会都是同一个位置', () => {
  const pos = SCENARIOS.map(s => s.options.findIndex(o => o.detour)).filter(i => i >= 0);
  assert.equal(pos.length, 6); for (const s of SCENARIOS) assert.ok(s.options.filter(o => o.detour).length <= 1);
  assert.ok(new Set(pos).size >= 3, '★ 选项至少分布在 3 个不同位置，现在是 ' + pos.map(p => p + 1).join(','));
  for (let p = 0; p < 4; p++) assert.ok(pos.filter(x => x === p).length <= 2, `第 ${p + 1} 个位置的 ★ 选项超过 2 个`);
});

test('第 4 题：替代证据选项先承认并纠正口径，再找证据；不暗示换指标掩盖错误', () => {
  const o = SCENARIOS.find(s => s.id === 's4')!.options.find(x => x.detour)!;
  assert.ok(/口径用错/.test(o.text) && /改成月活/.test(o.text), '要先承认并改正口径：' + o.text);
  assert.ok(o.text.indexOf('改成月活') < o.text.indexOf('另找'), '先纠正，再找证据');
  assert.ok(!/不再依赖|绕开|换个讲法/.test(o.text), '不能暗示绕开错误');
});

test('时间线：原定周五下午汇报，周四通知提前到周五早上，周五早上出意外，下午收尾', () => {
  const m = (id: string) => SCENARIOS.find(s => s.id === id)!.message;
  assert.ok(/周五下午/.test(PROJECT) && /周五下午三点/.test(m('s1')));
  assert.ok(/周四下午/.test(m('s6')) && /提前到周五早上九点/.test(m('s6')) && !/明天/.test(m('s6')));
  assert.ok(/周五早上八点半/.test(m('s7')) && /周五下午/.test(TIEBREAK.message));
  const s6d = SCENARIOS.find(s => s.id === 's6')!.options.find(o => o.id === 'summary-first')!.text;
  assert.ok(!/周五再补/.test(s6d), '提前到周五早上后，「周五再补」说不通：' + s6d);
});

test('13 个结果都有可复现的「直接」答题路径（不需要区分题）', () => {
  for (const r of ROLES) {
    const p = paths[r.id]; assert.ok(p, r.name + ' 没有可到达的路径');
    const o = outcome(p!.a); assert.equal(o.status, 'done'); assert.equal((o as any).role, r.id);
    if (r.id !== 'platypus') assert.ok(p!.margin >= 2, r.name + ' 的示例路径领先太少');
  }
});

test('并列：第一名并列的角色全部进入区分题，不截断，也不按数组顺序替用户挑', () => {
  const seen = new Set<string>(); let maxSize = 0;
  for (const a of all) {
    const o = outcome(a); if (o.status !== 'tiebreak') continue;
    const sc = scores(a), top = Math.max(...REGULAR_IDS.map(i => sc[i]));
    assert.deepEqual([...o.candidates].sort(), REGULAR_IDS.filter(i => sc[i] === top).sort(), '候选必须是全部并列第一的角色');
    maxSize = Math.max(maxSize, o.candidates.length);
    for (const c of o.candidates) { seen.add(c); assert.equal((outcome(a, c) as any).role, c); }
  }
  assert.deepEqual([...seen].sort(), [...REGULAR_IDS].sort());
  assert.ok(maxSize > 3, '穷举里应该出现过超过 3 人并列（用来证明没有截断）');
});

test('隐藏角色：★ 选项 ≥ 4 次一定触发，≤ 3 次一定不触发；只看行为组合，与分数第一名是谁无关', () => {
  const topWhenHidden = new Set<string>();
  for (const a of all) {
    const o = outcome(a) as any, d = detourCount(a);
    if (d >= RULES.hiddenMinDetours) { assert.equal(o.role, 'platypus'); assert.equal(o.via, 'hidden'); topWhenHidden.add(ranking(a).order[0]); }
    else assert.notEqual(o.status === 'done' ? o.role : '', 'platypus');
  }
  assert.ok(topWhenHidden.size >= 8, '触发隐藏角色时的分数第一名只有 ' + topWhenHidden.size + ' 种');
  assert.ok(!('platypus' in scores({})));
});

test('同样的答案得到同样的结果；结果不靠单独一道题决定', () => {
  for (let i = 0; i < all.length; i += 97) { const a = all[i]; assert.deepEqual(outcome(a), outcome(JSON.parse(JSON.stringify(a)))); }
  for (const s of SCENARIOS) for (const o of s.options) {
    const res = new Set<string>(); for (const a of all) if (a[s.id] === o.id) { const x = outcome(a); res.add(x.status === 'done' ? x.role : 'tie'); }
    assert.ok(res.size >= 10, `${s.id}/${o.id} 固定后只剩 ${res.size} 种结果`);
  }
});

test('计分只认选项 id：打乱选项显示顺序，结果完全一样', () => {
  const shuffled = SCENARIOS.map(s => ({ ...s, options: [...s.options].reverse() }));
  const orig = SCENARIOS.map(s => s.options);
  try { shuffled.forEach((s, i) => { (SCENARIOS[i] as any).options = s.options; }); for (let i = 0; i < all.length; i += 61) assert.deepEqual(outcome(all[i]), outcome(all[i])); const after = all.filter((_, i) => i % 61 === 0).map(a => outcome(a));
    orig.forEach((o, i) => { (SCENARIOS[i] as any).options = o; }); const before = all.filter((_, i) => i % 61 === 0).map(a => outcome(a)); assert.deepEqual(after, before);
  } finally { orig.forEach((o, i) => { (SCENARIOS[i] as any).options = o; }); }
});

test('返回修改：改答案后重新计算；候选变了，旧的区分题答案作废', () => {
  let changed = 0, invalidated = 0;
  for (let i = 0; i < all.length && (changed < 50 || invalidated < 5); i += 7) {
    const a = all[i], o = outcome(a); if (o.status !== 'tiebreak') continue;
    const tb = { choice: o.candidates[0], key: tieKey(o.candidates) };
    assert.equal((resolve(a, tb) as any).role, o.candidates[0]);
    for (const s of SCENARIOS) for (const opt of s.options) {
      if (opt.id === a[s.id]) continue; const b = { ...a, [s.id]: opt.id };
      const r = resolve(b, tb), fresh = outcome(b);
      if (fresh.status === 'tiebreak' && tieKey(fresh.candidates) !== tb.key) { assert.equal(r.status, 'tiebreak', '候选变了，应该重新回答区分题'); invalidated++; }
      if (fresh.status === 'done') { assert.deepEqual(r, fresh); changed++; }
    }
  }
  assert.ok(changed >= 50 && invalidated >= 5);
});

test('结果依据准确引用用户实际选过的选项（全部组合逐一核对）', () => {
  for (const a of all) {
    const o = outcome(a); const finals = o.status === 'done' ? [{ role: o.role, via: o.via }] : o.status === 'tiebreak' ? o.candidates.map(c => ({ role: c, via: 'tiebreak' })) : [];
    for (const f of finals) {
      const ev = evidence(a, f.role, f.via); assert.ok(ev.length >= 1 && ev.length <= 2);
      for (const e of ev) {
        const s = SCENARIOS.find(x => x.stage === e.stage);
        if (s) { assert.equal(e.text, optText(s.id, a[s.id]), '依据和实际选择不一致'); if (f.role === 'platypus') assert.ok(s.options.find(x => x.id === a[s.id])!.detour); else assert.ok((s.options.find(x => x.id === a[s.id])!.w[f.role as RegularId] ?? 0) > 0); }
        else { assert.equal(e.stage, '收尾'); assert.equal(f.via, 'tiebreak'); assert.equal(e.text, ROLES.find(r => r.id === f.role)!.tiebreak); }
      }
      if (f.role !== 'platypus' && f.via !== 'tiebreak') assert.equal(ev.length, 2);
    }
  }
});

test('分布：穷举后没有角色明显偏多或偏少（只检查配置，不代表真实人群）', () => {
  const cnt: Record<string, number> = {};
  for (const a of all) { const o = outcome(a); if (o.status === 'done') cnt[o.role] = (cnt[o.role] || 0) + 1; else if (o.status === 'tiebreak') for (const c of o.candidates) cnt[c] = (cnt[c] || 0) + 1 / o.candidates.length; }
  for (const id of REGULAR_IDS) { const p = cnt[id] / all.length; assert.ok(p > 0.05 && p < 0.12, `${id} 占 ${(p * 100).toFixed(1)}%`); }
  const h = cnt.platypus / all.length; assert.ok(h > 0.01 && h < 0.06, `隐藏角色占 ${(h * 100).toFixed(1)}%`);
});

/* 模拟浏览器的 localStorage，测试题目版本处理 */
function withStorage(init: Record<string, string>, fn: (s: Map<string, string>) => void) {
  const m = new Map(Object.entries(init)); const g = globalThis as any; const prev = g.window;
  g.window = { localStorage: { getItem: (k: string) => m.has(k) ? m.get(k)! : null, setItem: (k: string, v: string) => { m.set(k, v); }, removeItem: (k: string) => { m.delete(k); } } };
  try { fn(m); } finally { g.window = prev; }
}

test('题目版本：同版本照常恢复；旧版作答不按新规则重算、存储原样保留，旧结果快照可看', () => {
  assert.ok(RULES_VERSION && RULES_CHANGELOG.some(c => c.version === RULES_VERSION));
  const a = paths.otter!.a;
  withStorage({}, m => {
    assert.ok(save({ ...EMPTY, answers: a, step: 'result' }));
    const d = JSON.parse(m.get(BUDDY_KEY)!); assert.equal(d.schema, 2); assert.equal(d.rulesVersion, RULES_VERSION);
    const r = load(); assert.equal(r.stale, null); assert.deepEqual(r.state.answers, a); assert.equal(r.state.step, 'result');
  });
  // v1 预览版格式（schema 1，选项 id 是 a–d）：不能把 a–d 当成新选项，也不能悄悄换成新结果
  const v1 = JSON.stringify({ schema: 1, answers: { s1: 'a', s2: 'b', s3: 'c' }, tie: null, step: 3 });
  withStorage({ [BUDDY_KEY]: v1 }, m => {
    const r = load(); assert.ok(r.stale); assert.equal(r.stale!.fromVersion, 'v1'); assert.equal(r.stale!.answered, 3); assert.equal(r.stale!.result, null);
    assert.deepEqual(r.state.answers, {}); assert.equal(m.get(BUDDY_KEY), v1, '载入时不能改写旧数据');
  });
  // 将来的版本变化：旧结果快照原样保留
  const snap = { rulesVersion: 'v1', role: 'otter', name: '正在潜水的水獭', line: '没回消息，但快查明白了。', via: 'clear', evidence: [{ stage: '接任务', text: '旧版的选项文字' }], at: '2026-11-11T00:00:00Z' };
  const old = JSON.stringify({ schema: 2, rulesVersion: 'v0-test', answers: { s1: 'whatever' }, result: snap, previous: [] });
  withStorage({ [BUDDY_KEY]: old }, m => {
    const r = load(); assert.ok(r.stale); assert.deepEqual(r.stale!.result, snap); assert.equal(m.get(BUDDY_KEY), old);
  });
});

test('存储：单独的 key，不和岗位体验草稿、成果共用；读到坏数据会被清理', () => {
  assert.equal(BUDDY_KEY, 'onstage-buddy:v1'); assert.notEqual(BUDDY_KEY, DRAFT_KEY); assert.notEqual(BUDDY_KEY, WORKS_KEY);
  const s1 = SCENARIOS[0];
  assert.deepEqual(sanitize({ s1: s1.options[1].id, s2: 'z', s9: s1.options[0].id, s3: 5 }), { s1: s1.options[1].id });
  assert.deepEqual(sanitize({ s1: 'a' }), {}, 'v1 的位置字母不能被当成新选项');
  assert.deepEqual(sanitize(null), {});
});

test('推荐：都是站内真实存在的体验；推荐简版练习时，另给一个完整实践', () => {
  assert.ok(simpleIds.length >= 3);
  for (const r of ROLES) {
    assert.ok(expIds.includes(r.rec.id), r.id + ' 推荐的体验 ' + r.rec.id + ' 不存在');
    if (simpleIds.includes(r.rec.id)) { assert.ok(r.rec.full, r.id + ' 推荐的是简版练习，缺少完整实践'); assert.ok(expIds.includes(r.rec.full!.id) && !simpleIds.includes(r.rec.full!.id), r.id + ' 的完整实践必须是完整版或短版'); }
  }
});

test('资源：13 个图标都在，许可文件和来源说明都在', () => {
  for (const r of ROLES) assert.ok(existsSync('public/buddy/icons/' + r.icon), '缺少图标 ' + r.icon);
  for (const f of ['NOTICE.txt', 'LICENSE-Apache-2.0.txt', 'NOTO-EMOJI-LICENSE-NOTICE.txt']) assert.ok(existsSync('public/buddy/' + f));
  const notice = readFileSync('public/buddy/NOTICE.txt', 'utf8');
  for (const r of ROLES) assert.ok(notice.includes(r.icon), 'NOTICE 里没写 ' + r.icon);
  assert.ok(/不是 Noto 官方资源/.test(notice));
  assert.ok(existsSync('src/app/icon.svg'), '缺少网站图标（没有图标时浏览器会去请求站点根目录的 /favicon.ico）');
});
