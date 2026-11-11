/* 短体验的复盘规则：只根据操作（打开的材料、选择的行动和信息）生成，不读取用户自由填写的文字。 */
type Answers = Record<string, string | string[]>;
export const TONE: Record<string, [string, string]> = {
  core: ['直接针对主要原因', 'b-green'], support: ['有帮助', 'b-blue'], tradeoff: ['需要权衡', 'b-warn'], weak: ['证据不足', 'b-gray'],
  risky: ['可能让问题更严重', 'b-red'], key: ['最能检验判断', 'b-green'], later: ['可以放在后面', 'b-gray']
};
const arr = (v: unknown): string[] => Array.isArray(v) ? v as string[] : [];
const str = (v: unknown) => typeof v === 'string' ? v : '';

/* 根据操作生成复盘（纯函数，便于测试）。 */
export function quickReview(q: any, answers: Answers, opened: string[]) {
  const actions = arr(answers['plan.actions']).filter(a => q.actions[a]);
  const missing = arr(answers['plan.missing']).filter(m => q.missing[m]);
  const own = str(answers['plan.own']).trim(), missingOwn = str(answers['plan.missingOwn']).trim();
  const kept = arr(answers['ev.keep']);
  const good: { tone: string; title: string; text: string }[] = [], gaps: { title: string; text: string }[] = [], trade: { tone: string; title: string; text: string }[] = [], verify: { title: string; text: string }[] = [];
  for (const a of actions) {
    const v = q.actions[a];
    if (v.good && ['core', 'support', 'tradeoff', 'weak'].includes(v.tone)) good.push({ tone: v.tone, title: a, text: v.good });
    if (v.tradeoff) trade.push({ tone: v.tone, title: a, text: v.tradeoff });
    if (v.verify) verify.push({ title: a, text: v.verify });
  }
  for (const m of missing) { const v = q.missing[m]; if (['key', 'support'].includes(v.tone)) good.push({ tone: v.tone, title: '想要：' + m, text: v.text }); }
  for (const [a, v] of Object.entries<any>(q.actions)) if (v.tone === 'core' && !actions.includes(a) && v.missed) gaps.push({ title: '没有选：' + a, text: v.missed + (own ? '（如果你自己的方案里已经包含这一点，可以忽略这条。系统不会读你写的文字。）' : '') });
  for (const m of q.materials) if (m.key && !opened.includes(m.id) && m.missed) gaps.push({ title: '没有打开：' + m.title, text: m.missed });
  const keyInfo = Object.entries<any>(q.missing).filter(([, v]) => v.tone === 'key');
  if (keyInfo.length && !keyInfo.some(([k]) => missing.includes(k))) { const first = keyInfo.find(([, v]) => v.missed); if (first) gaps.push({ title: '还缺的信息', text: first[1].missed + (missingOwn ? '（你在「其他信息」里写了内容，系统不会读，请自己对照一下。）' : '') }); }
  for (const m of missing) { const v = q.missing[m]; if (v.tone === 'later') trade.push({ tone: 'later', title: '想要：' + m, text: v.text }); }
  const many = actions.length >= q.manyActions ? q.manyText.replace('{n}', String(actions.length)) : '';
  return { actions, missing, own, missingOwn, kept, good, gaps, trade, verify, many, noAction: !actions.length && own ? q.noActionText : '' };
}

