/* 「隐藏工位搭子」规则检查：穷举全部 4^8 = 65,536 种作答组合，统计结果分布、区分题出现率和并列人数、隐藏角色触发率，
   并为 13 个结果各找一条可复现的答题路径。只检查规则配置的分布，不证明任何人格判断的有效性。
   用法：npx tsx scripts/buddy-rules.ts [输出 markdown 路径] */
import { writeFileSync } from 'node:fs';
import { REGULAR_IDS, ROLES, RULES, RULES_CHANGELOG, RULES_VERSION, SCENARIOS, roleById, type RegularId, type RoleId } from '../src/lib/buddy/config';
import { detourCount, outcome, scores, type Answers } from '../src/lib/buddy/engine';
import { allAnswers, samplePaths } from '../src/lib/buddy/paths';
export { allAnswers };

/* 旧规则（v1 预览版）的截断：并列超过 3 个时，按 分数↓ → +2 次数↓ → 配置顺序 只留前 3 个。这里重现它，只用来统计影响。 */
function oldCap3(a: Answers, tied: RegularId[]) {
  const prim = (id: RegularId) => SCENARIOS.filter(s => (s.options.find(o => o.id === a[s.id])?.w[id] ?? 0) >= 2).length;
  return [...tied].sort((x, y) => prim(y) - prim(x) || REGULAR_IDS.indexOf(x) - REGULAR_IDS.indexOf(y)).slice(0, 3);
}

export function analyse() {
  const total = Math.pow(4, SCENARIOS.length);
  const direct: Record<string, number> = {}, viaTie: Record<string, number> = {}, tieOffered: Record<string, number> = {}, tieSize: Record<number, number> = {};
  const oldCut: Record<string, number> = {}, oldTied: Record<string, number> = {};
  let ties = 0, hidden = 0, over3 = 0;
  for (const a of allAnswers()) {
    const o = outcome(a);
    if (o.status === 'done') { direct[o.role] = (direct[o.role] || 0) + 1; if (o.via === 'hidden') hidden++; }
    else if (o.status === 'tiebreak') {
      ties++; tieSize[o.candidates.length] = (tieSize[o.candidates.length] || 0) + 1;
      // 假设区分题里每个候选被选中的机会相同，用来估算最终分布
      for (const c of o.candidates) { viaTie[c] = (viaTie[c] || 0) + 1 / o.candidates.length; tieOffered[c] = (tieOffered[c] || 0) + 1; }
      if (o.candidates.length > 3) { over3++; const keep = oldCap3(a, o.candidates); for (const c of o.candidates) { oldTied[c] = (oldTied[c] || 0) + 1; if (!keep.includes(c)) oldCut[c] = (oldCut[c] || 0) + 1; } }
    }
  }
  const final = Object.fromEntries(ROLES.map(r => [r.id, ((direct[r.id] || 0) + (viaTie[r.id] || 0)) / total]));
  return { total, direct, viaTie, tieOffered, tieSize, ties, hidden, over3, oldCut, oldTied, final, clearPath: samplePaths() };
}

const pct = (x: number) => (x * 100).toFixed(1) + '%';
const pos = (sid: string, oid?: string) => SCENARIOS.find(s => s.id === sid)!.options.findIndex(o => o.id === oid) + 1;
export const pathText = (a: Answers) => SCENARIOS.map(s => `${s.id.toUpperCase()}·${pos(s.id, a[s.id])}`).join(' ');
const pathIds = (a: Answers) => SCENARIOS.map(s => a[s.id]).join(' / ');

if (process.argv[1]?.endsWith('buddy-rules.ts')) {
  const r = analyse();
  const L: string[] = [];
  L.push('# 隐藏工位搭子 · 规则表（自动生成）', '', `**题目与规则版本：${RULES_VERSION}**。由 \`npm run buddy:rules\` 根据 \`src/lib/buddy/config.ts\` 生成。只检查规则配置的分布，**不证明人格判断有效**；这是娱乐产品设计，没有心理测量效度。`, '');
  L.push('## 版本记录', '', '| 版本 | 日期 | 说明 |', '|---|---|---|', ...RULES_CHANGELOG.map(c => `| ${c.version} | ${c.date} | ${c.note} |`), '');
  L.push('## 选项 → 角色加分', '', '「位置」是页面上的第几个选项；计分、存储和依据只认「选项 id」，不认位置。每个选项给一个角色 +2、另一个角色 +1。标 ★ 的是「另辟蹊径」选项（计入隐藏角色触发次数）。', '');
  for (const s of SCENARIOS) {
    L.push(`### ${s.id.toUpperCase()} ${s.stage}`, '', `> ${s.from}：${s.message}　${s.ask}`, '', '| 位置 | 选项 id | 内容 | +2 | +1 |', '|---|---|---|---|---|');
    s.options.forEach((o, i) => { const e = Object.entries(o.w).sort((x, y) => y[1]! - x[1]!); L.push(`| ${i + 1}${o.detour ? ' ★' : ''} | \`${o.id}\` | ${o.text} | ${roleById(e[0][0] as RoleId).name} | ${e[1] ? roleById(e[1][0] as RoleId).name : '—'} |`); });
    L.push('');
  }
  const dpos = SCENARIOS.map(s => s.options.findIndex(o => o.detour) + 1).filter(x => x > 0);
  L.push(`★ 选项的位置（第 2–7 题）：${dpos.join('、')}。`, '');
  L.push('## 每个角色在哪些选项里拿到 +2', '', '| 角色 | +2 选项 | +1 选项 |', '|---|---|---|');
  for (const id of REGULAR_IDS) {
    const p: string[] = [], q: string[] = [];
    for (const s of SCENARIOS) for (const o of s.options) { if (o.w[id] === 2) p.push(`${s.id.toUpperCase()} \`${o.id}\``); else if (o.w[id] === 1) q.push(`${s.id.toUpperCase()} \`${o.id}\``); }
    L.push(`| ${roleById(id).name} | ${p.join('、')} | ${q.join('、')} |`);
  }
  L.push('', '## 判定顺序', '',
    '1. 8 题全部作答后才计算。',
    `2. **隐藏角色**：★ 选项选了 ≥ ${RULES.hiddenMinDetours} 次（共 6 个情境有 ★ 选项）→ 不按物种出牌的鸭嘴兽。只看这个行为组合，与分数高低无关。`,
    '3. 否则累加 12 个常规角色的分数。第一名唯一 → 直接得到第一名。',
    '4. 第一名并列 → 追加 1 道区分题，**并列的角色全部列出**（不截断），选哪个结果就是哪个。区分题选项的排列位置按角色配置顺序，只影响显示位置，不影响谁能进入区分题。',
    '5. 返回修改答案后重新计算；候选变了，之前的区分题答案作废，需要重新回答。', '');
  L.push('## 穷举结果（全部 65,536 种作答组合，每种组合算一次）', '',
    `- 需要追加区分题的组合：${r.ties.toLocaleString()}（${pct(r.ties / r.total)}）`,
    `- 触发隐藏角色的组合：${r.hidden.toLocaleString()}（${pct(r.hidden / r.total)}）`, '',
    '区分题里的并列人数：', '', '| 并列人数 | 组合数 | 占全部组合 |', '|---|---|---|',
    ...Object.entries(r.tieSize).sort((a, b) => +a[0] - +b[0]).map(([k, v]) => `| ${k} | ${v.toLocaleString()} | ${pct(v / r.total)} |`), '',
    '「最终占比」假设区分题里每个候选被选中的机会相同。真实用户不会随机作答，所以这只说明**配置有没有明显偏向某个角色**，不代表真实人群分布。', '',
    '| 角色 | 直接得到 | 进入区分题候选 | 估算最终占比 |', '|---|---|---|---|');
  for (const role of ROLES) L.push(`| ${role.name} | ${(r.direct[role.id] || 0).toLocaleString()} | ${(r.tieOffered[role.id] || 0).toLocaleString()} | ${pct(r.final[role.id])} |`);
  L.push('', '## 旧规则「最多 3 个候选」的截断影响（已改掉）', '',
    `v1 预览版在并列超过 3 个时，按 +2 次数、再按角色在配置里的顺序，只留前 3 个进区分题。按当前题目穷举：并列超过 3 个的组合有 **${r.over3.toLocaleString()}** 种（${pct(r.over3 / r.total)}），这些组合里被截掉、连选的机会都没有的角色如下。排在配置后面的角色被截得明显更多，说明那条规则实际上把数组顺序当成了优先级。现在并列的全部列出，这一列都应为 0。`, '',
    '| 角色 | 在超过 3 人并列里出现 | 旧规则下被截掉 |', '|---|---|---|',
    ...REGULAR_IDS.map(id => `| ${roleById(id).name} | ${(r.oldTied[id] || 0).toLocaleString()} | ${(r.oldCut[id] || 0).toLocaleString()} |`));
  L.push('', '## 13 个结果的可复现答题路径', '', '「S1·2」表示第 1 题选页面上的第 2 个选项；后面是对应的选项 id。都是不需要区分题的「直接」路径。', '', '| 角色 | 路径（位置） | 选项 id | 说明 |', '|---|---|---|---|');
  for (const role of ROLES) {
    const c = r.clearPath[role.id];
    L.push(c ? `| ${role.name} | ${pathText(c.a)} | ${pathIds(c.a)} | ${role.id === 'platypus' ? `★ 选项 ${detourCount(c.a)} 次` : `领先第二名 ${c.margin} 分`} |` : `| ${role.name} | — | — | **不可达** |`);
  }
  const md = L.join('\n') + '\n';
  const out = process.argv[2];
  if (out) writeFileSync(out, md); else console.log(md);
  console.log(`[buddy ${RULES_VERSION}] ties ${pct(r.ties / r.total)} · >3 tied ${r.over3} · hidden ${pct(r.hidden / r.total)} · ` + ROLES.map(x => x.id + ' ' + pct(r.final[x.id])).join(' · '));
  console.log('[buddy] old cap-3 cut: ' + REGULAR_IDS.map(id => id + ' ' + (r.oldCut[id] || 0)).join(' · '));
  void scores;
}
