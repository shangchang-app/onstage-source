/* 给浏览器测试用：输出 13 个结果的示例路径、一组区分题路径、隐藏角色触发 / 不触发的路径（JSON）。 */
import { ROLES, RULES_VERSION, SCENARIOS } from '../src/lib/buddy/config';
import { detourCount, outcome } from '../src/lib/buddy/engine';
import { allAnswers, samplePaths } from '../src/lib/buddy/paths';
const p = samplePaths();
const text = (a: Record<string, string | undefined>) => SCENARIOS.map(s => s.options.find(o => o.id === a[s.id])!.text);
let tie: any = null, nearHidden: any = null, bigTie: any = null, maxTie: any = null;
for (const a of allAnswers()) {
  const o = outcome(a);
  if (!tie && o.status === 'tiebreak' && o.candidates.length === 3) tie = { answers: text(a), candidates: o.candidates.map(c => ({ id: c, name: ROLES.find(r => r.id === c)!.name, text: ROLES.find(r => r.id === c)!.tiebreak })) };
  if (!nearHidden && detourCount(a) === 3 && o.status === 'done') nearHidden = { answers: text(a), role: ROLES.find(r => r.id === o.role)!.name };
  if (!bigTie && o.status === 'tiebreak' && o.candidates.length >= 5) bigTie = { answers: text(a), candidates: o.candidates.map(c => ({ id: c, name: ROLES.find(r => r.id === c)!.name, text: ROLES.find(r => r.id === c)!.tiebreak })) };
  if (o.status === 'tiebreak' && (!maxTie || o.candidates.length > maxTie.candidates.length)) maxTie = { answers: text(a), candidates: o.candidates.map(c => ({ id: c, name: ROLES.find(r => r.id === c)!.name, text: ROLES.find(r => r.id === c)!.tiebreak })) };
}
console.log(JSON.stringify({
  roles: ROLES.map(r => ({ id: r.id, name: r.name, line: r.line, rec: r.rec.id, full: r.rec.full?.id || null, answers: text(p[r.id]!.a) })),
  allOptions: Object.fromEntries(SCENARIOS.map(s => [s.id, s.options.map(o => o.text)])), tie, nearHidden, bigTie, maxTie, rulesVersion: RULES_VERSION,
}));
