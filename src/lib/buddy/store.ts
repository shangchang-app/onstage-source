/* 「隐藏工位搭子」的本机进度：单独存在 localStorage 的「onstage-buddy:v1」（键名不变；内容里的 schema / rulesVersion 管版本），
   和岗位体验草稿（onstage-free:v1）、成果（onstage-works:v1）分开，互不读写，也不进入「我的 → 导出备份」。
   注意：正式站 /onstage/ 和预览 /onstage-source/ 同源，读写的是同一份数据，所以必须靠版本号区分新旧题目。

   版本规则（RULES_VERSION，见 config.ts）：
   - 版本一致：照常恢复作答、区分题答案、所在的那一屏和结果。
   - 版本不一致（或旧格式 schema 1）：**不用新规则重算旧作答**。旧作答原样留在存储里，直到用户确认「按新题目重新开始」；
     旧结果如果有快照（schema 2 起，到达结果页时保存），就原样保留，可以继续查看；重新开始时它会移到 previous 里留着。
   - 浏览器不能存储时（隐私模式、被禁用、空间满）退回到页面内存：本次能用，刷新后从头开始，界面会明确提示。 */
import { RULES_VERSION, SCENARIOS } from './config';
import { sanitize, type Answers, type Evidence, type TieAnswer } from './engine';

export const BUDDY_KEY = 'onstage-buddy:v1';
export type Step = 'intro' | 'tiebreak' | 'result' | 'previous' | number; // number = 第几题（0 开始）；previous = 查看保留的旧结果
/** 到达结果页时保存的结果快照：之后题目改版，也按当时的样子原样显示，不重算 */
export type Snapshot = { rulesVersion: string; role: string; name: string; line: string; via: string; evidence: Evidence[]; at: string };
export type BuddyState = { answers: Answers; tie: TieAnswer | null; step: Step; result: Snapshot | null; previous: Snapshot[] };
export const EMPTY: BuddyState = { answers: {}, tie: null, step: 'intro', result: null, previous: [] };
/** 存储里是旧版本题目的进度：answered = 旧作答题数；result = 旧结果快照（旧格式没有） */
export type Stale = { fromVersion: string; answered: number; result: Snapshot | null; previous: Snapshot[] };

const validStep = (s: unknown): Step => s === 'intro' || s === 'tiebreak' || s === 'result' || s === 'previous' ? s : typeof s === 'number' && Number.isInteger(s) && s >= 0 && s < SCENARIOS.length ? s : 'intro';
const str = (v: unknown) => typeof v === 'string' ? v : '';
export function validSnapshot(v: any): Snapshot | null {
  if (!v || typeof v !== 'object' || !str(v.role) || !str(v.name) || !str(v.rulesVersion)) return null;
  const evidence = Array.isArray(v.evidence) ? v.evidence.filter((e: any) => e && str(e.stage) && str(e.text)).slice(0, 3).map((e: any) => ({ stage: e.stage, text: e.text })) : [];
  return { rulesVersion: v.rulesVersion, role: v.role, name: v.name, line: str(v.line), via: str(v.via), evidence, at: str(v.at) };
}
const snapshots = (v: unknown) => Array.isArray(v) ? v.map(validSnapshot).filter((x): x is Snapshot => !!x).slice(0, 5) : [];

export function load(): { state: BuddyState; available: boolean; stale: Stale | null } {
  let raw: string | null;
  try { raw = window.localStorage.getItem(BUDDY_KEY); } catch { return { state: EMPTY, available: false, stale: null }; }
  if (!raw) return { state: EMPTY, available: true, stale: null };
  let d: any; try { d = JSON.parse(raw); } catch { return { state: EMPTY, available: true, stale: null }; }
  if (d?.schema === 2 && d.rulesVersion === RULES_VERSION) {
    const tie = d.tie && typeof d.tie.choice === 'string' && typeof d.tie.key === 'string' ? { choice: d.tie.choice, key: d.tie.key } : null;
    return { state: { answers: sanitize(d.answers), tie, step: validStep(d.step), result: validSnapshot(d.result), previous: snapshots(d.previous) }, available: true, stale: null };
  }
  const answered = d?.answers && typeof d.answers === 'object' ? Object.keys(d.answers).length : 0;
  const stale: Stale = { fromVersion: str(d?.rulesVersion) || 'v1', answered, result: d?.schema === 2 ? validSnapshot(d.result) : null, previous: d?.schema === 2 ? snapshots(d.previous) : [] };
  if (!answered && !stale.result && !stale.previous.length) return { state: EMPTY, available: true, stale: null };
  return { state: { ...EMPTY, previous: stale.previous }, available: true, stale };
}

/** 返回 false 表示这次没存进浏览器 */
export function save(s: BuddyState): boolean {
  try { window.localStorage.setItem(BUDDY_KEY, JSON.stringify({ schema: 2, rulesVersion: RULES_VERSION, answers: s.answers, tie: s.tie, step: s.step, result: s.result, previous: s.previous, savedAt: new Date().toISOString() })); return true; } catch { return false; }
}
