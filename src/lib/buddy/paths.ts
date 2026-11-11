/* 穷举全部 4^8 种作答（只用于规则检查、测试和开发验收页，不在正式答题流程里运行）。 */
import { SCENARIOS, type RoleId } from './config';
import { outcome, ranking, type Answers } from './engine';

export function* allAnswers(): Generator<Answers> {
  const n = SCENARIOS.length, ids = SCENARIOS.map(s => s.options.map(o => o.id)), idx = new Array(n).fill(0);
  for (;;) {
    yield Object.fromEntries(SCENARIOS.map((s, i) => [s.id, ids[i][idx[i]]]));
    let k = n - 1; while (k >= 0 && ++idx[k] === ids[k].length) { idx[k] = 0; k--; }
    if (k < 0) return;
  }
}

/** 每个结果的示例路径：不需要区分题、且领先第二名最多的第一组作答（隐藏角色取第一组触发的作答）。结果固定，可复现。 */
export function samplePaths() {
  const best: Partial<Record<RoleId, { a: Answers; margin: number }>> = {};
  for (const a of allAnswers()) {
    const o = outcome(a); if (o.status !== 'done') continue;
    if (o.via === 'hidden') { if (!best.platypus) best.platypus = { a, margin: 0 }; continue; }
    const { sc, order } = ranking(a), m = sc[order[0]] - sc[order[1]];
    if (!best[o.role] || m > best[o.role]!.margin) best[o.role] = { a, margin: m };
  }
  return best;
}
