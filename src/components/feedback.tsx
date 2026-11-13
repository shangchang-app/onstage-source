'use client';
/* V1.8 轻量反馈：复盘页上的「有帮助 / 没看懂 / 太简单 / 太难」和选填原因。
   现在还没有接入服务器：只保存在这台设备的浏览器里，可以在「我的」导出。界面不说「已发送」「已提交给平台」。 */
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { LocalError, RATINGS, exportFeedback, getFeedback, readFeedback, saveFeedback, type Feedback, type Rating } from '@/lib/local-data';
import { dateTime } from './ui';

export const FEEDBACK_SCOPE = '现在还没有接入服务器：反馈只保存在这台设备的浏览器里，不会自动发送给平台。想让我们看到，可以在「我的 → 我的反馈」导出文件发给我们。';
const label = (r: string) => RATINGS.find(x => x[0] === r)?.[1] || r;

export function FeedbackBox({ experienceId, experienceTitle, contentVersion }: { experienceId: string; experienceTitle: string; contentVersion: number }) {
  const [saved, setSaved] = useState<Feedback | null>(null), [rating, setRating] = useState<Rating | ''>(''), [reason, setReason] = useState(''), [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null);
  useEffect(() => { try { const f = getFeedback(experienceId, contentVersion); setSaved(f); if (f) { setRating(f.rating); setReason(f.reason); } } catch { /* 存储不可用：保存时再提示 */ } }, [experienceId, contentVersion]);
  const dirty = !saved || saved.rating !== rating || saved.reason !== reason.trim();
  function save() {
    if (!rating) { setMsg({ text: '先选一项。', bad: true }); return; }
    try { const f = saveFeedback({ experienceId, experienceTitle, contentVersion, rating, reason }); setSaved(f); setReason(f.reason); setMsg({ text: `已保存在这台设备上（${dateTime(f.updatedAt)}）。没有发送给平台。` }); }
    catch (e) { setMsg({ text: e instanceof LocalError ? e.message + ' ' + e.recovery : '没能保存：' + String((e as Error)?.message || e), bad: true }); }
  }
  return <section className="sec-card fb-box" aria-labelledby="fb-h" data-testid="feedback-box">
    <h2 id="fb-h">这次短实践怎么样？</h2>
    <p className="small ink2">选一项就行，原因选填。用来帮我们改内容，不会变成你的标签。</p>
    <p className="notice small" role="note" data-testid="feedback-scope">{FEEDBACK_SCOPE}</p>
    <fieldset className="field" style={{ border: 0, padding: 0, margin: '10px 0 0' }}><legend className="label">你的感受</legend>
      <div className="choice-list fb-ratings">{RATINGS.map(([v, l]) => <label className="choice" key={v}><input type="radio" name={'fb-' + experienceId} value={v} checked={rating === v} onChange={() => { setRating(v); setMsg(null); }} /><span>{l}</span></label>)}</div></fieldset>
    <label className="field" htmlFor={'fb-reason-' + experienceId}><span className="label">原因（选填）</span>
      <textarea id={'fb-reason-' + experienceId} className="textarea" rows={2} maxLength={500} placeholder="例如：第 2 份材料看不懂；反馈说得太笼统" value={reason} onChange={e => { setReason(e.target.value); setMsg(null); }} /></label>
    <div className="row" style={{ marginTop: 10 }}>
      <button type="button" className="btn" onClick={save} disabled={!rating || !dirty} data-testid="feedback-save">{saved ? (dirty ? '保存修改（只存本机）' : '已保存在本机') : '保存反馈（只存本机）'}</button>
      <Link className="small" href="/me#h-feedback">在「我的」查看和导出</Link>
    </div>
    {msg && <p className={msg.bad ? 'bad-box' : 'ok-box'} role={msg.bad ? 'alert' : 'status'} style={{ marginTop: 10 }}>{msg.text}</p>}
  </section>;
}

/* 「我的」里的反馈列表和导出。 */
export function MyFeedback() {
  const [items, setItems] = useState<Feedback[] | null>(null), [err, setErr] = useState(''), [msg, setMsg] = useState('');
  useEffect(() => { try { setItems(readFeedback()); } catch (e) { setErr(e instanceof LocalError ? e.message : String(e)); setItems([]); } }, []);
  function download() {
    setMsg(''); setErr('');
    try {
      const data = exportFeedback(); const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const el = document.createElement('a'); el.href = URL.createObjectURL(blob); el.download = 'onstage-feedback-' + new Date().toISOString().slice(0, 10) + '.json'; document.body.appendChild(el); el.click(); el.remove(); setTimeout(() => URL.revokeObjectURL(el.href), 1000);
      setMsg(`已导出 ${data.items.length} 条反馈。文件在你的设备上，还没有发给任何人。`);
    } catch (e) { setErr(e instanceof LocalError ? e.message + ' ' + e.recovery : String(e)); }
  }
  return <section className="sec" aria-labelledby="h-feedback"><div className="sec-h"><div><h2 id="h-feedback">我的反馈</h2><p>短实践复盘页上留的反馈。{FEEDBACK_SCOPE}</p></div></div>
    {items === null ? <p role="status">正在载入…</p> : items.length ? <div className="stack">{items.map(f => <div className="list-row" key={f.id} data-testid="feedback-row"><div style={{ minWidth: 0 }}><b>{label(f.rating)}</b><div className="small muted">{f.experienceTitle} · 第 {f.contentVersion} 版 · {dateTime(f.updatedAt)} · 只在本机，未发送</div>{f.reason && <p className="small pre" style={{ marginTop: 4 }}>{f.reason}</p>}</div></div>)}</div>
      : <div className="empty">还没有反馈。做完短实践，可以在复盘页留一条。</div>}
    <div className="row" style={{ marginTop: 10 }}><button type="button" className="btn" onClick={download} disabled={!items?.length} data-testid="feedback-export">导出反馈</button><span className="xs muted">导出的文件也包含在「备份」里。</span></div>
    {msg && <p className="ok-box" role="status" style={{ marginTop: 10 }}>{msg}</p>}
    {err && <p className="bad-box" role="alert" style={{ marginTop: 10 }}>{err}</p>}
  </section>;
}
