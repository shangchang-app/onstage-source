'use client';
/* V1.6 成果：根据用户自己的作答整理成果，保存在本机，可以从「我的」重新打开、打印、导出和导入备份。
   成果里只有用户自己写的内容，不混入参考答案；明确标注「教学模拟作品」、任务版本、完成时间和保存范围。 */
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { Modal } from './modal';
import { LocalError, buildSections, deleteWork, exportBackup, getWork, hasBefore, importBackup, readWorks, requestPersist, sameSections, saveWork, type Work, type WorkSection } from '@/lib/local-data';
import { dateTime } from './ui';
import { choiceIssue } from '@/server/validation';

export const SAVE_SCOPE = '只保存在这台设备的这个浏览器里：没有上传，不会公开，也不会发给任何企业。换设备、换浏览器、清除浏览器数据或用无痕模式都看不到。建议在「我的」里导出备份。';
export const DRAFT_VS_WORK = '草稿和成果分开保存：清除草稿不会删除已保存的成果。部分浏览器（例如 iPhone 上的 Safari）会清理 7 天没有访问的网站数据，草稿和成果都可能受影响，所以请导出备份。';

/* 只打印成果卡（体验页上打印时不带其他内容）。 */
export function printCard() { const h = document.documentElement; h.classList.add('printing-work'); const done = () => { h.classList.remove('printing-work'); window.removeEventListener('afterprint', done); }; window.addEventListener('afterprint', done); window.print(); setTimeout(done, 1000); }

const errText = (e: unknown) => e instanceof LocalError ? { text: e.message, recovery: e.recovery } : { text: '保存时出了问题：' + String((e as Error)?.message || e), recovery: '内容还在页面上。请稍后重试，或者先用「打印 / 存为 PDF」留一份。' };

/* 实践完成的统一口径（「我的」、体验详情页、作答页、成果页共用，判定条件只有一个）：
   - 实践完成 = 这个体验当前版本保存过成果。成果只有在必填作答全部写完后才能保存，所以保存过成果就说明作答写完了。
     只看作答和成果，不看有没有浏览示范、参考等步骤（跳过示范、只写作答并保存，也算完成）。
   - 完成时间 = 第一次保存成果的时间，也就是成果页上的「完成时间」。之后再保存记为「最近修改」，旧版本在「修改记录」里。
   - 保存后草稿又被改空了几项：仍算已完成（成果页仍是上次保存的版本），另外提示草稿里还有几项没写完。 */
export type PracticeState = { kind: 'done' | 'ready' | 'doing' | 'no-output'; work: Work | null; done: number; total: number; pending: number };
export function practiceState(answered: { done: number; total: number } | null | undefined, work: Work | null, hasOutput: boolean): PracticeState {
  const done = answered?.done ?? 0, total = answered?.total ?? 0, complete = total > 0 && done >= total;
  if (!hasOutput) return { kind: 'no-output', work: null, done, total, pending: 0 };
  return { kind: work ? 'done' : complete ? 'ready' : 'doing', work, done, total, pending: work && answered && !complete ? total - done : 0 };
}
export const workTimes = (w: Work) => '完成于 ' + dateTime(w.createdAt) + (w.updatedAt !== w.createdAt ? ' · 最近修改 ' + dateTime(w.updatedAt) : '');
export function practiceText(s: PracticeState) {
  switch (s.kind) {
    case 'done': return '已完成实践 · ' + workTimes(s.work!) + (s.pending ? ` · 之后草稿里还有 ${s.pending} 项没写完，成果仍是上次保存的版本` : '');
    case 'ready': return `作答都写好了（${s.done}/${s.total}）· 还没保存成果，保存后才算完成实践`;
    case 'no-output': return `已作答 ${s.done}/${s.total} · 这个体验不生成成果`;
    default: return `未完成实践 · 已作答 ${s.done}/${s.total}`;
  }
}
/* 这个体验当前版本已保存的成果（本机）。读不到本地存储时当作没有。 */
export function savedWorkFor(experienceId: string, contentVersion: number): Work | null {
  try { return readWorks().find(w => w.experienceId === experienceId && w.contentVersion === contentVersion) || null; } catch { return null; }
}

export function WorkCard({ title, experienceTitle, contentVersion, completedAt, updatedAt, versionAt, sections, preview }: { title: string; experienceTitle: string; contentVersion: number; completedAt?: string; updatedAt?: string; versionAt?: string; sections: WorkSection[]; preview?: boolean }) {
  const time = !completedAt ? '完成时间：保存成果时记录' : '完成时间：' + dateTime(completedAt) + (versionAt ? ' · 这一版保存于 ' + dateTime(versionAt) : updatedAt && updatedAt !== completedAt ? ' · 最近修改：' + dateTime(updatedAt) : '');
  return <article className="work-card" aria-label={title}>
    <header className="wc-head">
      <div className="tags"><span className="badge b-demo">教学模拟作品</span>{preview && <span className="badge b-gray">预览 · 尚未保存</span>}</div>
      <h2>{title}</h2>
      <p className="small ink2" data-testid="work-time">来自岗位体验「{experienceTitle}」· 任务版本：第 {contentVersion} 版 · {time}</p>
    </header>
    {sections.map(s => <section className="wc-sec" key={s.heading}><h3>{s.heading}</h3>
      {s.items.length ? s.items.map((it, i) => <div className="wc-item" key={i}><div className="xs muted">{it.label}</div><p className="pre">{it.text}</p></div>) : <p className="small muted">（这一部分还没有写）</p>}
    </section>)}
    <footer className="wc-foot xs muted">内容全部来自作者自己的作答，没有加入系统参考答案。这是线上模拟体验里的练习作品，数据为虚构的教学数据，不是实习经历、能力认证或录用依据。保存范围：{SAVE_SCOPE}</footer>
  </article>;
}

/* 体验页里的成果区：预览、返回修改、保存到本机。 */
export function OutputPanel({ id, data, g, version, answers, status, onEdit }: { id: string; data: any; g: any; version: number; answers: Record<string, any>; status: { missing: { label: string; practice: string; field?: string }[] }; onEdit: (practiceId: string, fieldId?: string) => void }) {
  const sections = buildSections(g, answers);
  const before = hasBefore(answers) ? buildSections(g, answers, 'pre.') : null;
  const [saved, setSaved] = useState<Work | null>(null), [msg, setMsg] = useState<{ text: string; recovery?: string; bad?: boolean } | null>(null), [persist, setPersist] = useState('');
  useEffect(() => { try { setSaved(readWorks().find(w => w.experienceId === id && w.contentVersion === version) || null); } catch (e) { setMsg({ ...errText(e), bad: true }); } }, [id, version]);
  const fieldPractice = (fid: string) => g.practice.find((p: any) => p.fields.some((f: any) => f.id === fid))?.id;
  const ready = status.missing.length === 0;
  const unchanged = saved && sameSections(saved.sections, sections);
  async function save() {
    setMsg(null);
    /* 保存入口再查一次：必填项要写完，单选题只能选一项（旧草稿里的多选要先重新确认）。 */
    const singles = g.practice.flatMap((p: any) => p.fields).filter((f: any) => f.kind === 'choices' && f.single && f.required !== false && choiceIssue(f, answers[f.id]));
    if (status.missing.length || singles.length) { setMsg({ text: '还不能保存：' + (singles.length ? singles.map((f: any) => '「' + f.label + '」需要只选一项').join('、') : '还有 ' + status.missing.length + ' 项没写完') + '。', bad: true }); return; }
    try {
      const r = saveWork({ experienceId: id, experienceTitle: data.title, direction: data.direction, outputTitle: g.output.title, contentVersion: version, sections, before: before && !sameSections(before, sections) ? before : null });
      setSaved(r.work);
      setMsg({ text: r.created ? '已保存到本机。可以在「我的 → 我的成果」重新打开。' : r.changed ? '已更新成果，上一版保留在「修改记录」里。' : '已经是最新内容，不需要重复保存。' });
      const p = await requestPersist(); setPersist(p === 'granted' ? '浏览器已同意长期保留本站数据（仍然建议导出备份）。' : p === 'denied' ? '浏览器没有同意长期保留本站数据，长时间不访问可能被清理，请导出备份。' : '这个浏览器不支持「长期保留」设置，请导出备份。');
    } catch (e) { setMsg({ ...errText(e), bad: true }); }
  }
  const changedBefore = before && !sameSections(before, sections);
  return <section className="sec-card out-panel" aria-labelledby="out-h">
    <h2 id="out-h">你的成果：{g.output.title}</h2>
    <p className="small ink2">下面的内容全部来自你自己的作答，没有加入参考答案。想改哪部分，点那一部分的「返回修改」。</p>
    <div className="out-grid">
      <div>
        <WorkCard title={g.output.title} experienceTitle={data.title} contentVersion={version} completedAt={saved?.createdAt} updatedAt={saved && unchanged ? saved.updatedAt : undefined} sections={sections} preview={!saved || !unchanged} />
        <div className="row out-edit">{g.output.sections.map((s: any) => <button key={s.heading} type="button" className="btn btn-sm" onClick={() => onEdit(fieldPractice(s.fields[0]))}>返回修改：{s.heading}</button>)}</div>
      </div>
      <aside className="out-side">
        {!ready ? <div className="notice" role="note"><b>还差 {status.missing.length} 项没写，写完才能保存成果：</b><ul>{status.missing.map(m => <li key={m.label}><button type="button" className="text-btn" onClick={() => onEdit(m.practice, m.field)}>{m.label}</button></li>)}</ul></div>
          : <button type="button" className="btn btn-primary btn-block" onClick={save} data-testid="save-work">{saved ? (unchanged ? '已保存 · 再保存一次' : '保存修改后的成果') : '保存成果到本机'}</button>}
        {msg && <p className={msg.bad ? 'bad-box' : 'ok-box'} role={msg.bad ? 'alert' : 'status'} style={{ marginTop: 10 }}>{msg.text}{msg.recovery && <><br /><span style={{ fontWeight: 400 }}>怎么办：{msg.recovery}</span></>}</p>}
        {persist && <p className="xs muted" style={{ marginTop: 6 }}>{persist}</p>}
        {saved && <div className="row" style={{ marginTop: 10 }}><Link className="btn btn-sm" href={'/works/?id=' + saved.id}>打开成果页</Link><button type="button" className="btn btn-sm" onClick={printCard}>打印 / 存为 PDF</button></div>}
        <p className="xs muted" style={{ marginTop: 12 }}><b>保存范围：</b>{SAVE_SCOPE}</p>
        <p className="xs muted" style={{ marginTop: 6 }}>{DRAFT_VS_WORK}</p>
        {changedBefore && <details className="howto"><summary>看参考之前的版本</summary><p className="xs muted">你在看参考思路之前写的内容。保存成果时会一起保留，方便对比自己改了什么。</p>{before!.map(s => <div key={s.heading}><b className="small">{s.heading}</b>{s.items.map((it, i) => <p className="small pre" key={i}><span className="muted">{it.label}：</span>{it.text}</p>)}</div>)}</details>}
      </aside>
    </div>
  </section>;
}

/* 成果页：/works/?id=… */
export function WorkPage() {
  const [work, setWork] = useState<Work | null | undefined>(undefined), [err, setErr] = useState<{ text: string; recovery?: string } | null>(null), [rev, setRev] = useState(-1), [ask, setAsk] = useState(false), [gone, setGone] = useState(false);
  useEffect(() => { const id = new URLSearchParams(window.location.search).get('id') || ''; try { setWork(getWork(id)); } catch (e) { setErr(errText(e)); setWork(null); } }, []);
  if (work === undefined) return <div className="wrap page" role="status">正在载入…</div>;
  if (gone) return <div className="wrap page"><h1>已删除这份成果</h1><p className="lede">草稿没有受影响。</p><p style={{ marginTop: 16 }}><Link className="btn" href="/me">回到我的</Link></p></div>;
  if (!work) return <div className="wrap page"><h1>找不到这份成果</h1><p className="lede">{err ? err.text : '成果只保存在当初保存它的那个浏览器里。如果换了设备、换了浏览器，或者清除过浏览器数据，这里就看不到。'}</p>{err?.recovery && <p className="small" style={{ marginTop: 8 }}>怎么办：{err.recovery}</p>}<p className="small ink2" style={{ marginTop: 8 }}>如果你之前导出过备份，可以在「我的」里导入。</p><p style={{ marginTop: 16 }}><Link className="btn" href="/me">去我的</Link></p></div>;
  const shown = rev < 0 ? work.sections : work.revisions[rev].sections;
  return <div className="wrap page" style={{ maxWidth: 860 }}>
    <div className="crumb print-hide"><Link href="/me">我的</Link> / 我的成果</div>
    {rev >= 0 && <p className="warn-box print-hide" style={{ marginBottom: 12 }}>你在看 {dateTime(work.revisions[rev].at)} 的旧版本。<button className="text-btn" onClick={() => setRev(-1)}>回到最新版本</button></p>}
    <WorkCard title={work.outputTitle} experienceTitle={work.experienceTitle} contentVersion={work.contentVersion} completedAt={work.createdAt} updatedAt={rev < 0 ? work.updatedAt : undefined} versionAt={rev < 0 ? undefined : work.revisions[rev].at} sections={shown} />
    <div className="row print-hide" style={{ marginTop: 16 }}>
      <button type="button" className="btn btn-primary" onClick={() => window.print()}>打印 / 存为 PDF</button>
      <Link className="btn" href={'/experiences/' + work.experienceId + '/work'}>回到体验继续修改</Link>
      <button type="button" className="btn btn-danger" onClick={() => setAsk(true)}>删除这份成果</button>
    </div>
    <p className="xs muted print-hide" style={{ marginTop: 8 }}>完成时间是第一次保存完整成果的时间（{dateTime(work.createdAt)}）；之后每次保存都记为最近修改（{dateTime(work.updatedAt)}），旧版本在下面的「修改记录」里。</p>
    {(work.revisions.length > 0 || work.before) && <section className="sec-card print-hide" aria-labelledby="rev-h"><h2 id="rev-h">修改记录</h2>
      {work.before && <details className="howto"><summary>看参考思路之前写的版本</summary>{work.before.map(s => <div key={s.heading}><b className="small">{s.heading}</b>{s.items.map((it, i) => <p className="small pre" key={i}><span className="muted">{it.label}：</span>{it.text}</p>)}</div>)}</details>}
      {work.revisions.length > 0 && <ul className="small" style={{ marginTop: 10 }}>{work.revisions.map((r, i) => <li key={r.at + i}><button type="button" className="text-btn" onClick={() => { setRev(i); window.scrollTo(0, 0); }}>{dateTime(r.at)} 保存的版本</button></li>)}</ul>}
    </section>}
    <Modal open={ask} title="删除这份成果？" role="alertdialog" onClose={() => setAsk(false)} footer={<><button className="btn" onClick={() => setAsk(false)}>取消</button><button className="btn btn-primary btn-danger" onClick={() => { try { deleteWork(work.id); setAsk(false); setGone(true); } catch (e) { setErr(errText(e)); setAsk(false); } }}>删除</button></>}>
      <p>删除后不能恢复（除非你导出过备份）。草稿不受影响。</p>
    </Modal>
    {err && <p className="bad-box" role="alert" style={{ marginTop: 12 }}>{err.text} {err.recovery}</p>}
  </div>;
}

/* 「我的」里的成果列表与备份。 */
export function MyWorks() {
  const [works, setWorks] = useState<Work[] | null>(null), [err, setErr] = useState<{ text: string; recovery?: string } | null>(null), [msg, setMsg] = useState('');
  const file = useRef<HTMLInputElement>(null);
  const reload = () => { try { setWorks(readWorks()); setErr(null); } catch (e) { setErr(errText(e)); setWorks([]); } };
  useEffect(reload, []);
  function download() {
    setMsg(''); setErr(null);
    try {
      const data = exportBackup(); const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'onstage-backup-' + new Date().toISOString().slice(0, 10) + '.json'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      setMsg(`已导出备份：${data.works.length} 份成果、${data.drafts.length} 份草稿、${data.feedback.length} 条反馈。请把文件保存好。`);
    } catch (e) { setErr(errText(e)); }
  }
  async function upload(f: File) {
    setMsg(''); setErr(null);
    try {
      const r = importBackup(await f.text());
      setMsg(`导入完成：新增 ${r.added} 份成果，更新 ${r.updated} 份，保留现有较新的 ${r.kept} 份；新增 ${r.draftsAdded} 份草稿${r.draftsSkipped ? `，${r.draftsSkipped} 份草稿因为这里已有同一体验的草稿而跳过` : ''}${r.feedbackAdded ? `；导入或更新 ${r.feedbackAdded} 条反馈` : ''}${r.skippedBad ? `；${r.skippedBad} 条格式不对，没有导入` : ''}。`);
      reload();
    } catch (e) { setErr(errText(e)); } finally { if (file.current) file.current.value = ''; }
  }
  return <>
    <section className="sec" aria-labelledby="h-works"><div className="sec-h"><div><h2 id="h-works">我的成果</h2><p>做完岗位体验后保存的作品。只在这个浏览器里。</p></div></div>
      {works === null ? <p role="status">正在载入…</p> : works.length ? <div className="stack">{works.map(w => <div className="list-row" key={w.id}><div style={{ minWidth: 0 }}><b>{w.outputTitle}</b><div className="small muted">{w.experienceTitle} · 第 {w.contentVersion} 版 · {workTimes(w)}{w.revisions.length ? ` · ${w.revisions.length} 次修改记录` : ''}</div></div><Link className="btn" href={'/works/?id=' + w.id}>打开</Link></div>)}</div>
        : <div className="empty">还没有保存的成果。做完一个完整的岗位体验，在最后一步点「保存成果到本机」。</div>}
    </section>
    <section className="sec" aria-labelledby="h-backup"><div className="sec-h"><div><h2 id="h-backup">备份</h2><p>把成果、草稿和反馈导出成一个文件，换浏览器或清理数据前先导出；之后可以再导入。</p></div></div>
      <div className="row"><button type="button" className="btn" onClick={download}>导出备份</button>
        <button type="button" className="btn" onClick={() => file.current?.click()}>导入备份</button><input id="import-file" ref={file} hidden type="file" accept="application/json,.json" aria-label="选择备份文件" onChange={e => { const f = e.target.files?.[0]; if (f) void upload(f); }} /></div>
      <p className="xs muted" style={{ marginTop: 8 }}>导入不会删除现有内容：同一份成果保留较新的版本（旧的放进修改记录）；同一个体验已有草稿时，不会覆盖。{DRAFT_VS_WORK}</p>
      {msg && <p className="ok-box" role="status" style={{ marginTop: 10 }}>{msg}</p>}
      {err && <p className="bad-box" role="alert" style={{ marginTop: 10 }}>{err.text}{err.recovery && <><br /><span style={{ fontWeight: 400 }}>怎么办：{err.recovery}</span></>}</p>}
    </section>
  </>;
}
