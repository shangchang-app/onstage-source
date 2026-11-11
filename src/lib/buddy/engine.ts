/* 「隐藏工位搭子」结果规则：纯函数，没有随机数、时间或网络，同样的输入一定得到同样的输出。
   规则（按顺序）：
   1. 8 题必须全部作答，才计算结果。
   2. 隐藏角色：选了「另辟蹊径」选项 ≥ RULES.hiddenMinDetours 次 → 鸭嘴兽。只看这个行为组合，不看分数。
   3. 否则把 8 个选项的分数加到 12 个常规角色上。第一名比第二名高出 closeMargin 以上 → 直接是第一名。
   4. 否则「结果接近」：与第一名相差不超过 closeMargin 的角色**全部**进入区分题（不截断，最多可能 7 个），
      按角色配置顺序排列（只影响显示位置）。作答过区分题、且候选没变 → 结果是所选角色；否则需要（重新）作答区分题。
   没有任何「按数组顺序挑一个」的兜底：并列时一定由用户自己在区分题里选。 */
import { REGULAR_IDS, ROLES, RULES, SCENARIOS, type RegularId, type RoleId } from './config';

export type Answers = Partial<Record<string, string>>; // { s1: 'a', ... }
export type Scores = Record<RegularId, number>;
export type Outcome =
  | { status: 'incomplete'; answered: number }
  | { status: 'tiebreak'; candidates: RegularId[]; scores: Scores }
  | { status: 'done'; role: RoleId; via: 'hidden' | 'clear' | 'tiebreak'; scores: Scores; candidates?: RegularId[] };

const opt = (sid: string, oid?: string) => SCENARIOS.find(s => s.id === sid)?.options.find(o => o.id === oid);

export function answeredCount(a: Answers) { return SCENARIOS.filter(s => !!opt(s.id, a[s.id])).length; }
export function detourCount(a: Answers) { return SCENARIOS.filter(s => opt(s.id, a[s.id])?.detour).length; }

export function scores(a: Answers): Scores {
  const sc = Object.fromEntries(REGULAR_IDS.map(id => [id, 0])) as Scores;
  for (const s of SCENARIOS) { const o = opt(s.id, a[s.id]); if (o) for (const [k, v] of Object.entries(o.w)) sc[k as RegularId] += v!; }
  return sc;
}

/** 结果接近时的候选（全部并列角色，按配置顺序）；不接近时返回 [第一名]。order 只用于统计「第二名差多少分」。 */
export function ranking(a: Answers) {
  const sc = scores(a);
  const order = [...REGULAR_IDS].sort((x, y) => sc[y] - sc[x]);
  const top = sc[order[0]], second = sc[order[1]];
  const close = top - second <= RULES.closeMargin;
  const candidates = close ? REGULAR_IDS.filter(id => top - sc[id] <= RULES.closeMargin) : [order[0]];
  return { sc, order, close, candidates };
}

export function outcome(a: Answers, tiebreak?: string): Outcome {
  const n = answeredCount(a);
  if (n < SCENARIOS.length) return { status: 'incomplete', answered: n };
  const { sc, close, candidates } = ranking(a);
  if (detourCount(a) >= RULES.hiddenMinDetours) return { status: 'done', role: 'platypus', via: 'hidden', scores: sc };
  if (!close) return { status: 'done', role: candidates[0], via: 'clear', scores: sc };
  if (tiebreak && candidates.includes(tiebreak as RegularId)) return { status: 'done', role: tiebreak as RegularId, via: 'tiebreak', scores: sc, candidates };
  return { status: 'tiebreak', candidates, scores: sc };
}

export type Evidence = { stage: string; text: string };
/** 结果依据：只引用用户这次真正选过的选项（原文）。常规角色：给这个角色加分最多的两个选项（同分按情境顺序）；
    经区分题得到的结果，第二条换成区分题的答案。隐藏角色：前两次「另辟蹊径」的选择。 */
export function evidence(a: Answers, role: RoleId, via?: string): Evidence[] {
  const picked = SCENARIOS.map(s => ({ s, o: opt(s.id, a[s.id]) })).filter(x => x.o) as { s: (typeof SCENARIOS)[number]; o: NonNullable<ReturnType<typeof opt>> }[];
  if (role === 'platypus') return picked.filter(x => x.o.detour).slice(0, 2).map(x => ({ stage: x.s.stage, text: x.o.text }));
  const list = picked.filter(x => (x.o.w[role as RegularId] ?? 0) > 0).sort((x, y) => (y.o.w[role as RegularId]! - x.o.w[role as RegularId]!) || SCENARIOS.indexOf(x.s) - SCENARIOS.indexOf(y.s)).map(x => ({ stage: x.s.stage, text: x.o.text }));
  if (via === 'tiebreak') { const t = ROLES.find(r => r.id === role)?.tiebreak; return [...list.slice(0, 1), ...(t ? [{ stage: '收尾', text: t }] : [])]; }
  return list.slice(0, 2);
}

/** 清理存储里读到的作答：只保留合法的题号和选项 */
export function sanitize(a: unknown): Answers {
  const out: Answers = {};
  if (a && typeof a === 'object') for (const s of SCENARIOS) { const v = (a as any)[s.id]; if (typeof v === 'string' && opt(s.id, v)) out[s.id] = v; }
  return out;
}

/** 区分题答案连同当时的候选一起保存（key = 候选按顺序拼接）。返回修改作答后候选变了，旧答案就作废，需要重新回答。 */
export type TieAnswer = { choice: string; key: string };
export const tieKey = (c: readonly string[]) => c.join(',');
export function resolve(a: Answers, tb?: TieAnswer | null): Outcome {
  const pre = outcome(a);
  if (pre.status !== 'tiebreak') return pre;
  return tb && tb.key === tieKey(pre.candidates) ? outcome(a, tb.choice) : pre;
}
