/* 规则检查（V1.6）：只核对数字和用户选的标签。不分析自由文字，不以字数、关键词或完成次数推断能力。 */
export type NumberCheck = { kind: 'number'; expect: (number | string)[]; tol: number; unit: string; alt: { value: number; text: string }[]; explain: string };
export type ChoiceCheck = { kind: 'choices'; expect: (number | string)[]; explain: string; why: Record<string, string> };

/* 从「约 4.7%」「4.73 %」「百分之 5.1」这类写法里取出第一个数字。没有数字时返回 null。 */
export function parseNumber(text: unknown): number | null {
  if (typeof text !== 'string') return null;
  const m = text.replace(/，/g, ',').replace(/(\d),(\d{3})/g, '$1$2').match(/-?\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : null;
}

export function checkNumber(c: NumberCheck, value: unknown): { state: 'empty' | 'nonum' | 'ok' | 'alt' | 'off'; got: number | null; altText?: string } {
  if (typeof value !== 'string' || !value.trim()) return { state: 'empty', got: null };
  const got = parseNumber(value); if (got === null) return { state: 'nonum', got };
  if (c.expect.some(e => typeof e === 'number' && Math.abs(e - got) <= c.tol + 1e-9)) return { state: 'ok', got };
  const alt = c.alt.find(a => Math.abs(a.value - got) <= c.tol + 1e-9);
  return alt ? { state: 'alt', got, altText: alt.text } : { state: 'off', got };
}

export function checkChoices(c: ChoiceCheck, value: unknown) {
  const picked = Array.isArray(value) ? value.map(String) : [];
  const expect = c.expect.map(String);
  return { picked, expect, matched: picked.filter(p => expect.includes(p)), missed: expect.filter(e => !picked.includes(e)), extra: picked.filter(p => !expect.includes(p)), same: picked.length === expect.length && picked.every(p => expect.includes(p)) };
}
