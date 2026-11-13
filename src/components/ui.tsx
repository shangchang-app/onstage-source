'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';

export type Item = { id: string; kind: string; status: string; version: number; demo: boolean; companyId: string | null; data: any; updatedAt: string; state?: string; confirmedVersion?: number | null; confirmation?: string };
export const routes: Record<string, string> = { job: 'jobs', event: 'events', experience: 'experiences', company: 'companies' };
export const date = (v?: string) => v ? new Date(v).toLocaleDateString('zh-CN', { timeZone: 'Asia/Shanghai' }) : '—';
export const dateTime = (v?: string) => v ? new Date(v).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false }) : '—';
export const daysLeft = (v: string) => Math.ceil((Date.parse(v) - Date.now()) / 86400000);
/* 没有开放登录时（试用版未配置短信），访客的保存范围说明。 */
export const guestSaveNote = (days = 30) => `你的作答会自动保存在这个浏览器里：用同一个浏览器 ${days} 天内回来可以继续。换手机或电脑、换浏览器、清除浏览器数据或使用无痕模式，都看不到之前的作答。`;
export const STEPS = ['认识岗位', '看一次示范', '接到模拟任务', '跟着尝试', '对照参考思路', '总结与下一步'];
export const QUICK_STEPS = ['收到任务', '看材料', '行动与理由', '复盘'];
/* 体验是哪一种：短体验（V1.5，4 步）、深度版（6 步引导）、简版练习。data 可以是完整内容，也可以是列表里的摘要。 */
export const expKind = (d: any): 'quick' | 'deep' | 'simple' => d.format !== 'guided' ? 'simple' : (d.guide?.quick || d.guideSummary?.quick) ? 'quick' : 'deep';
export const stepsFor = (d: any) => expKind(d) === 'quick' ? QUICK_STEPS : STEPS;
export const SOURCE_LABEL: Record<string, string> = { sim: '模拟教学数据', adapted: '根据公开资料改编', public: '公开资料', cocreate: '企业授权共创' };
/* 体验里有没有真实来源（公开资料或据公开资料改编）。有的话，提示文字不能笼统说「全部虚构」。 */
export const hasRealSources = (provenance: any[] | undefined) => (provenance || []).some((p: any) => p.kind === 'public' || p.kind === 'adapted');

export function useCatalog() {
  const [items, setItems] = useState<Item[]>([]), [error, setError] = useState(''), [loading, setLoading] = useState(true);
  useEffect(() => {
    fetch('/api/content', { cache: 'no-store' }).then(async r => { if (!r.ok) throw new Error('内容加载失败，请检查网络后重试'); setItems(await r.json()); })
      .catch(e => setError(e.message === 'Failed to fetch' ? '网络连接失败，请检查网络后重试' : e.message)).finally(() => setLoading(false));
  }, []);
  return { items, error, loading };
}

export function StatusBadge({ item }: { item: Item }) {
  if (item.kind === 'experience') return null;
  const s = item.status, soon = s === 'published' && item.data.deadline && daysLeft(item.data.deadline) <= 3;
  if (s === 'published') return soon ? <span className="badge b-warn">即将截止</span> : <span className="badge b-green">{item.kind === 'job' ? '投递中' : item.kind === 'event' ? '报名中' : '展示中'}</span>;
  return <span className="badge b-gray">{({ expired: '已截止', offline: '已下架', pending: '待确认', draft: '草稿' } as any)[s] || '暂不可用'}</span>;
}
export function KindBadge({ item }: { item: Item }) {
  const d = item.data;
  if (item.kind === 'job') return <span className="badge b-blue">{d.jobType === 'intern' ? '实习' : '校招'}</span>;
  if (item.kind === 'event') return <span className="badge b-orange">{d.eventType === 'hack' ? '黑客松' : '企业商赛'}</span>;
  if (item.kind === 'experience') { const k = expKind(d); return <>
    <span className={'badge ' + (k === 'quick' ? 'b-line' : k === 'deep' ? 'b-orange' : 'b-gray')}>{k === 'quick' ? '短版 · 约 ' + d.minutes + ' 分钟' : k === 'deep' ? '完整版' : '简版练习'}</span>
    <span className="badge b-gray">{d.sourceType === 'cocreate' ? (item.demo ? '企业共创（演示）' : '企业共创') : '平台制作'}</span>
  </>; }
  return <span className="badge b-gray">企业</span>;
}
export const Demo = ({ on }: { on: boolean }) => on ? <span className="badge b-demo">示例</span> : null;

export function Card({ item, company }: { item: Item; company?: Item }) {
  const d = item.data;
  if (item.kind === 'experience') { const k = expKind(d); return <Link className={'card' + (k === 'quick' ? ' card-feature' : '')} href={'/experiences/' + item.id}>
    <div className="tags"><KindBadge item={item} /><Demo on={item.demo} /></div>
    <div><div className="eyebrow">{d.direction}</div><h3>{d.title}</h3></div>
    <dl className="facts"><div><dt>时长</dt><dd>约 {d.minutes} 分钟，可以暂停</dd></div><div><dt>基础</dt><dd>{String(d.level || '').split(' · ').pop()}</dd></div>{d.learn?.[0] && k !== 'simple' && <div><dt>学到</dt><dd>{d.learn[0]}</dd></div>}<div><dt>成果</dt><dd>{d.deliverable || '文字作答 + 参考思路'}</dd></div></dl>
    <div className="card-foot"><span className="muted">{k === 'quick' ? '收到任务 → 看材料 → 行动与理由 → 复盘' : k === 'deep' ? '6 步：认识岗位 → 示范学方法 → 任务 → 尝试 → 参考 → 迁移练习与成果' : '只有任务和参考思路'}</span><span className="go">{k === 'simple' ? '看看 →' : '开始 →'}</span></div>
  </Link>; }
  if (item.kind === 'company') return <Link className="card" href={'/companies/' + item.id}>
    <div className="tags"><KindBadge item={item} /><Demo on={item.demo} /></div>
    <h3>{d.title}</h3><div className="card-meta">{d.industry} · {d.size}</div>
    <div className="tags">{d.directions.map((x: string) => <span className="tag" key={x}>{x}</span>)}</div>
    <div className="card-foot"><span className="muted">业务与职业方向</span><span className="go">企业主页 →</span></div>
  </Link>;
  return <Link className="card" href={'/' + routes[item.kind] + '/' + item.id}>
    <div className="tags"><KindBadge item={item} /><StatusBadge item={item} /><Demo on={item.demo} /></div>
    <h3>{d.title}</h3>
    <div className="card-meta">{item.kind === 'job' ? <>{company?.data.title || ''} · {d.direction}</> : d.organizer}</div>
    <div className="card-desc">{d.city}{item.kind === 'job' ? ' · ' + (d.salary || '薪资未公开') : ''}</div>
    <div className="card-foot"><span><span className="muted">截止</span> <b className="tnum">{date(d.deadline)}</b></span>{item.status === 'published' && <span className="muted">还剩 {daysLeft(d.deadline)} 天</span>}</div>
  </Link>;
}
export function Grid({ items, all }: { items: Item[]; all?: Item[] }) {
  return items.length ? <div className="grid">{items.map(i => <Card key={i.id} item={i} company={all?.find(c => c.id === i.companyId)} />)}</div> : <div className="empty">暂时没有符合条件的内容。</div>;
}
export const Loading = () => <div className="wrap page" role="status">正在载入…</div>;
export function ErrorBox({ text, retry }: { text: string; retry?: () => void }) {
  return <div className="empty" role="alert"><p>{text}</p><p style={{ marginTop: 12 }}><button className="btn" onClick={retry || (() => window.location.reload())}>重新加载</button></p></div>;
}

/* 任务材料：表格 / 文字 / 评论摘录 / 列表 */
export function Material({ m }: { m: any }) {
  return <div className="mat">
    <h3>{m.title}</h3>
    {m.kind === 'table' && <div className="table-wrap" tabIndex={0} role="region" aria-label={m.title}><table className="table"><thead><tr>{m.columns.map((c: string) => <th key={c} scope="col">{c}</th>)}</tr></thead><tbody>{m.rows.map((r: string[], i: number) => <tr key={i}>{r.map((c, j) => <td key={j} className="tnum">{c}</td>)}</tr>)}</tbody></table></div>}
    {m.kind === 'text' && <p className="pre">{m.text}</p>}
    {m.kind === 'quotes' && m.items.map((q: string) => <blockquote className="quote" key={q}>{q}</blockquote>)}
    {m.kind === 'list' && <ul>{m.items.map((q: string) => <li key={q}>{q}</li>)}</ul>}
    {m.note && <p className="hint" style={{ marginTop: 6 }}>{m.note}</p>}
  </div>;
}
/* 术语：点开看解释 */
export function Terms({ names, glossary }: { names: string[]; glossary: { term: string; def: string }[] }) {
  const [open, setOpen] = useState<string | null>(null);
  const list = names.map(n => glossary.find(g => g.term === n)).filter(Boolean) as { term: string; def: string }[];
  if (!list.length) return null;
  return <div><div className="terms" aria-label="术语">{list.map(t => <button type="button" key={t.term} className="term" aria-expanded={open === t.term} onClick={() => setOpen(open === t.term ? null : t.term)}>术语：{t.term}</button>)}</div>
    {open && <div className="term-def" role="note"><b>{open}</b>：{list.find(t => t.term === open)!.def}</div>}</div>;
}

/* 把作答按题目标签展示（用于参考对照、冲突选择、完成记录） */
export function answerRows(data: any, answers: Record<string, any>) {
  if (data.format === 'guided' && data.guide) return data.guide.practice.flatMap((p: any) => p.fields.map((f: any) => ({ label: f.label, text: Array.isArray(answers[f.id]) ? answers[f.id].join('、') : (answers[f.id] || '') })));
  return data.tasks.map((t: any, i: number) => ({ label: t.title, text: answers[String(i)] || '' }));
}
export function AnswerList({ data, answers, compact }: { data: any; answers: Record<string, any>; compact?: boolean }) {
  const rows = answerRows(data, answers); const shown = compact ? rows.filter((r: any) => r.text?.trim()) : rows; const empty = rows.length - shown.length;
  return <dl>{shown.map((r: any, i: number) => <div key={i} style={{ marginTop: 8 }}><dt>{r.label}</dt><dd className="pre">{r.text?.trim() ? r.text : <span className="muted">（未作答）</span>}</dd></div>)}
    {compact && empty > 0 && <div style={{ marginTop: 8 }} className="small muted">{shown.length ? `其余 ${empty} 项未作答` : `${empty} 项都还没有作答`}</div>}</dl>;
}
