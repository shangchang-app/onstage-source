'use client';
/* V1.5 短体验（5–10 分钟）：收到任务 → 看材料 → 行动与理由 → 复盘。
   复盘只根据用户的操作生成：打开了哪些材料、标为关键的材料、选择的行动和信息。
   用户自己写的方案和理由原样展示，不做自动分析（没有接入 AI），也不打分、不贴标签。 */
import Link from 'next/link';
import { useState, type ReactNode, type RefObject } from 'react';
import { Modal } from './modal';
import { Grid, QUICK_STEPS, SOURCE_LABEL, Terms } from './ui';
import { TONE, pickReview, quickReview } from '@/lib/quick-review';
import { choiceIssue } from '@/server/validation';
import { FeedbackBox } from './feedback';

type Answers = Record<string, string | string[]>;
const arr = (v: unknown): string[] => Array.isArray(v) ? v as string[] : [];
const str = (v: unknown) => typeof v === 'string' ? v : '';
type Progress = { step: number; visited: number[]; referenceViewed: boolean; hintsOpened: string[] };
type Reflection = { understand: '' | 'yes' | 'some' | 'no'; likes: string[]; dislikes: string; next: string[]; dislikeParts?: string[] };

export function QuickWork({ id, version, data, g, answers, set, readonly, progress, go, openHint, heading, reflection, setRefl, finish, relatedExps, relatedJobs, items, lastField, saveLabel }: {
  id: string; version: number; data: any; g: any; answers: Answers; set: (k: string, v: string | string[]) => void; readonly: boolean; progress: Progress; go: (s: number) => void; openHint: (k: string) => void;
  heading: RefObject<HTMLHeadingElement | null>; reflection: Reflection; setRefl: (r: Reflection) => void; finish: ReactNode; relatedExps: any[]; relatedJobs: any[]; items: any[]; lastField: RefObject<HTMLElement | null>; saveLabel: ReactNode;
}) {
  const q = g.quick; const step = progress.step > 3 ? 0 : progress.step; // V1.4 旧版 6 步草稿的步骤号超出范围时，从第 1 步开始
  const pick = q.mode === 'pick'; const names: string[] = q.stepNames || QUICK_STEPS;
  const opened = progress.hintsOpened.filter(h => h.startsWith('open:')).map(h => h.slice(5));
  const kept = arr(answers['ev.keep']);
  const [sheet, setSheet] = useState(false);
  const toggleKeep = (mid: string) => set('ev.keep', kept.includes(mid) ? kept.filter(x => x !== mid) : [...kept, mid]);
  const plan = g.practice[0];
  const field = (fid: string) => plan.fields.find((f: any) => f.id === fid);
  const ready = (arr(answers['plan.actions']).length > 0 || str(answers['plan.own']).trim().length >= 2) && str(answers['plan.reason']).trim().length >= 2;
  const mats = <Materials q={q} opened={opened} kept={kept} onOpen={m => openHint('open:' + m)} onKeep={toggleKeep} readonly={readonly} />;

  return <div className={'quick quick-s' + step}>
    {step >= 1 && step <= 2 && <div className="mobile-tools quick-tools"><div className="wrap row" style={{ justifyContent: 'space-between', flexWrap: 'nowrap', width: '100%' }}>
      <span className="save-state">{saveLabel}</span>
      {step === 2 && <button type="button" className="btn btn-sm" onClick={() => setSheet(true)} aria-haspopup="dialog">回看材料</button>}
    </div></div>}
    <Modal open={sheet} title="后台材料" variant="sheet" onClose={() => setSheet(false)} returnFocus={() => lastField.current}>
      <p className="hint">看完点「关闭」或按 Esc，会回到你刚才写的位置，已写的内容不会丢。</p>
      {mats}
    </Modal>

    <div className="wrap quick-wrap">
      {step === 0 && <section aria-labelledby="q-h">
        <div className="eyebrow">{data.direction} · 约 {data.minutes} 分钟 · 模拟工作场景</div>
        <h1 id="q-h" tabIndex={-1} ref={heading} className="quick-h1">{data.title}</h1>
        <article className="msg" aria-label="任务消息">
          <div className="msg-avatar" aria-hidden="true">{q.brief.from.slice(0, 1)}</div>
          <div className="msg-body">
            <div className="msg-meta"><b>{q.brief.from}</b><span>{q.brief.fromRole}</span><span>{q.brief.time}</span></div>
            <p className="pre">{q.brief.message}</p>
          </div>
        </article>
        {q.brief.stats.length > 0 && <dl className="stats">{q.brief.stats.map((s: any) => <div key={s.label}><dt>{s.label}</dt><dd className="tnum">{s.value}</dd><span className="xs muted">{s.note}</span></div>)}</dl>}
        <p className="small ink2" style={{ marginTop: 14 }}>{q.brief.role}{q.ask ? <b>{q.ask}</b> : <>你要交给她的是：<b>下周先做什么、为什么、还缺什么信息</b>。</>}不计时，可以随时离开，下次接着做。</p>
        <div className="row" style={{ marginTop: 18 }}>
          <button type="button" className="btn btn-primary btn-lg" onClick={() => go(1)}>{progress.visited.includes(1) ? '继续' : pick ? '开始：去看材料' : '开始：去后台看看'} →</button>
          <span className="xs muted">{q.simNote || '店铺、数据、评论都是虚构的教学数据，不是真实商业任务。'}</span>
        </div>
        <Provenance q={q} />
      </section>}

      {step === 1 && <section aria-labelledby="q-h">
        <div className="eyebrow">第 2 步 / 共 4 步 · {names[1]}</div>
        <h1 id="q-h" tabIndex={-1} ref={heading} className="quick-h1">{q.matIntro || `后台里有 ${q.materials.length} 份材料`}</h1>
        <p className="intro">按你的想法打开看，不用全看。觉得能支撑你判断的，点「标为关键」。</p>
        <details className="howto"><summary>不知道从哪下手？看一个 1 分钟的示范思路</summary>
          <p className="small ink2">{g.demo.background}</p>
          <ol className="thinking">{g.demo.thinking.map((t: any) => <li key={t.step}><b>{t.step}</b><p style={{ margin: '4px 0 0' }}>{t.text}</p></li>)}</ol>
        </details>
        {mats}
        <div className="quick-foot">
          <span className="small muted" aria-live="polite">已看 {opened.filter(o => q.materials.some((m: any) => m.id === o)).length}/{q.materials.length} · 标为关键 {kept.length}</span>
          <div className="row"><button type="button" className="btn" onClick={() => go(0)}>← 任务</button><button type="button" className="btn btn-primary" onClick={() => go(2)}>{pick ? names[2] : '写下周的行动'} →</button></div>
        </div>
      </section>}

      {step === 2 && pick && <div className="quick-grid">
        <PickStep q={q} plan={plan} answers={answers} set={set} readonly={readonly} hints={progress.hintsOpened} openHint={openHint} heading={heading} go={go} kept={kept} names={names} lastField={lastField} glossary={g.glossary} />
        <aside className="quick-side" aria-label="材料对照"><div className="small muted" style={{ marginBottom: 6 }}>边看边选：</div>{mats}</aside>
      </div>}

      {step === 2 && !pick && <div className="quick-grid">
        <section aria-labelledby="q-h" onFocus={e => { const t = e.target as HTMLElement; if (t.matches('input,textarea,select')) lastField.current = t; }}>
          <div className="eyebrow">第 3 步 / 共 4 步 · 行动与理由</div>
          <h1 id="q-h" tabIndex={-1} ref={heading} className="quick-h1">下周你先做什么？</h1>
          <p className="intro">可以从建议里组合几项，也可以写自己的方案。理由写一两句就够了。</p>
          {kept.length > 0 && <p className="small ink2" style={{ marginTop: 8 }}>你标为关键的材料：{kept.map(k => q.materials.find((m: any) => m.id === k)?.title).filter(Boolean).join('、')}</p>}
          <fieldset className="field qf" disabled={readonly}><legend className="label">{field('plan.actions').label}</legend>
            <div className="choice-list">{field('plan.actions').options.map((o: string) => { const v = arr(answers['plan.actions']); return <label className="choice" key={o}><input type="checkbox" checked={v.includes(o)} onChange={e => set('plan.actions', e.target.checked ? [...v, o] : v.filter(x => x !== o))} /><span>{o}</span></label>; })}</div>
          </fieldset>
          <Text f={field('plan.own')} answers={answers} set={set} readonly={readonly} rows={2} />
          <Text f={field('plan.reason')} answers={answers} set={set} readonly={readonly} rows={3} />
          <fieldset className="field qf" disabled={readonly}><legend className="label">{field('plan.missing').label}</legend>
            <div className="choice-list">{field('plan.missing').options.map((o: string) => { const v = arr(answers['plan.missing']); return <label className="choice" key={o}><input type="checkbox" checked={v.includes(o)} onChange={e => set('plan.missing', e.target.checked ? [...v, o] : v.filter(x => x !== o))} /><span>{o}</span></label>; })}</div>
          </fieldset>
          <Text f={field('plan.missingOwn')} answers={answers} set={set} readonly={readonly} />
          <details className="howto"><summary>需要一点提示？</summary>
            <ul className="small">{plan.hints.map((h: string) => <li key={h}>{h}</li>)}</ul>
            {plan.framework && <div className="framework pre">参考句式：{plan.framework}</div>}
            <Terms names={plan.terms} glossary={g.glossary} />
          </details>
          {!ready && <p className="hint" role="note" style={{ marginTop: 14 }}>至少选一项行动（或写自己的方案），再写一两句理由，就可以看复盘。</p>}
          <div className="quick-foot">
            <button type="button" className="btn" onClick={() => go(1)}>← 回看材料</button>
            <button type="button" className="btn btn-primary" disabled={!ready} onClick={() => go(3)}>提交方案，看复盘 →</button>
          </div>
        </section>
        <aside className="quick-side" aria-label="材料对照"><div className="small muted" style={{ marginBottom: 6 }}>边看边写：</div>{mats}</aside>
      </div>}

      {step === 3 && (pick
        ? <PickReview id={id} version={version} q={q} g={g} data={data} answers={answers} opened={opened} hints={progress.hintsOpened} heading={heading} go={go} reflection={reflection} setRefl={setRefl} finish={finish} relatedExps={relatedExps} items={items} names={names} />
        : <Review id={id} version={version} q={q} g={g} data={data} answers={answers} opened={opened} heading={heading} go={go} reflection={reflection} setRefl={setRefl} finish={finish} relatedExps={relatedExps} relatedJobs={relatedJobs} items={items} />)}
    </div>
  </div>;
}

function Text({ f, answers, set, readonly, rows }: { f: any; answers: Answers; set: (k: string, v: string) => void; readonly: boolean; rows?: number }) {
  const fid = 'f-' + f.id.replace(/\./g, '-');
  return <label className="field qf" htmlFor={fid}><span className="label">{f.label}</span>
    {rows ? <textarea id={fid} className="textarea" rows={rows} style={{ minHeight: 0 }} readOnly={readonly} placeholder={f.placeholder} value={str(answers[f.id])} maxLength={2000} onChange={e => set(f.id, e.target.value)} />
      : <input id={fid} className="input" readOnly={readonly} placeholder={f.placeholder} value={str(answers[f.id])} maxLength={300} onChange={e => set(f.id, e.target.value)} />}</label>;
}

/* 材料：可以展开 / 收起，展开即记为「看过」，可以标为关键。 */
function Materials({ q, opened, kept, onOpen, onKeep, readonly }: { q: any; opened: string[]; kept: string[]; onOpen: (id: string) => void; onKeep: (id: string) => void; readonly: boolean }) {
  const [open, setOpen] = useState<string[]>([]);
  return <div className="mats">{q.materials.map((m: any) => {
    const isOpen = open.includes(m.id), seen = opened.includes(m.id), isKept = kept.includes(m.id);
    return <section className={'matc' + (isKept ? ' kept' : '')} key={m.id} aria-labelledby={'mh-' + m.id}>
      <h3 className="matc-h" id={'mh-' + m.id}><button type="button" aria-expanded={isOpen} aria-controls={'mb-' + m.id} onClick={() => { setOpen(o => isOpen ? o.filter(x => x !== m.id) : [...o, m.id]); if (!seen) onOpen(m.id); }}>
        <span className="matc-t"><b>{m.title}</b><span className="small muted">{m.teaser}</span></span>
        <span className="matc-s">{isKept ? <span className="badge b-orange">关键</span> : seen ? <span className="badge b-gray">已看</span> : null}<span aria-hidden="true" className="chev">{isOpen ? '−' : '+'}</span></span>
      </button></h3>
      {isOpen && <div className="matc-b" id={'mb-' + m.id}>
        {m.kind === 'table' && <div className="table-wrap" tabIndex={0} role="region" aria-label={m.title}><table className="table"><thead><tr>{m.columns.map((c: string) => <th key={c} scope="col">{c}</th>)}</tr></thead><tbody>{m.rows.map((r: string[], i: number) => <tr key={i}>{r.map((c, j) => j === 0 ? <th key={j} scope="row">{c}</th> : <td key={j} className="tnum">{c}</td>)}</tr>)}</tbody></table></div>}
        {m.items.map((it: any) => <blockquote className="quote" key={it.text}><span className="xs muted">{it.meta}</span><br />“{it.text}”<br /><span className="small">（{it.zh}）</span></blockquote>)}
        {m.points.length > 0 && <ul className="small points">{m.points.map((p: string) => <li key={p}>{p}</li>)}</ul>}
        {m.note && <p className="hint" style={{ marginTop: 6 }}>{m.note}</p>}
        <div className="row between" style={{ marginTop: 10 }}>
          <span className="src">{SOURCE_LABEL[m.source]}</span>
          <button type="button" className={'btn btn-sm' + (isKept ? ' btn-on' : '')} aria-pressed={isKept} disabled={readonly} onClick={() => onKeep(m.id)}>{isKept ? '已标为关键 · 取消' : '标为关键'}</button>
        </div>
      </div>}
    </section>;
  })}</div>;
}

function Provenance({ q }: { q: any }) {
  return <details className="howto" style={{ marginTop: 24 }}><summary>这些数据从哪来？</summary>
    <ul className="prov">{q.provenance.map((p: any) => <li key={p.title}><span className="src">{SOURCE_LABEL[p.kind]}</span> <b>{p.title}</b><p className="small ink2">{p.detail}</p>{p.url && <p className="xs muted">来源：<a href={p.url} target="_blank" rel="noopener noreferrer">{p.source}</a>（{p.date}）</p>}</li>)}</ul>
  </details>;
}

function Review({ id, version, q, g, data, answers, opened, heading, go, reflection, setRefl, finish, relatedExps, relatedJobs, items }: { id: string; version: number; q: any; g: any; data: any; answers: Answers; opened: string[]; heading: RefObject<HTMLHeadingElement | null>; go: (s: number) => void; reflection: Reflection; setRefl: (r: Reflection) => void; finish: ReactNode; relatedExps: any[]; relatedJobs: any[]; items: any[] }) {
  const r = quickReview(q, answers, opened);
  const reason = str(answers['plan.reason']).trim();
  const ready = (r.actions.length > 0 || r.own.length >= 2) && reason.length >= 2;
  const [checks, setChecks] = useState<number[]>([]);
  const deep = items.find(i => i.id === q.deep);
  const toggle = (list: string[], v: string, on: boolean) => on ? [...list, v] : list.filter(x => x !== v);
  const dp = reflection.dislikeParts || [];
  return <section aria-labelledby="q-h">
    <div className="eyebrow">第 4 步 / 共 4 步 · 复盘</div>
    <h1 id="q-h" tabIndex={-1} ref={heading} className="quick-h1">复盘：你的方案和参考思路</h1>
    {!ready && <p className="warn-box" style={{ marginTop: 14 }}>你还没写完方案：至少选一项行动（或写自己的方案），再写一两句理由。<button className="text-btn" onClick={() => go(2)}>回去写</button></p>}
    <p className="notice" style={{ marginTop: 14 }}><b>这份复盘怎么来的：</b>根据你的操作生成——打开了哪些材料、选了哪些行动和信息。你自己写的方案和理由原样放在下面，<b>系统没有接入 AI，不会自动分析这段文字</b>。不打分，也不评价你适不适合这个岗位。</p>

    <div className="rv-grid">
      <section className="sec-card rv-mine" aria-labelledby="rv-mine"><h2 id="rv-mine">你的方案 <span className="badge b-gray">你写的</span></h2>
        <h3>下周先做</h3>{r.actions.length ? <ul>{r.actions.map(a => <li key={a}>{a}</li>)}</ul> : <p className="muted small">没有选建议里的行动</p>}
        {r.own && <><h3>你自己的方案（原文）</h3><p className="mine">{r.own}</p></>}
        <h3>理由（原文）</h3>{reason ? <p className="mine">{reason}</p> : <p className="muted small">还没写</p>}
        <h3>还缺的信息</h3>{r.missing.length || r.missingOwn ? <ul>{r.missing.map(m => <li key={m}>{m}</li>)}{r.missingOwn && <li>{r.missingOwn}（原文）</li>}</ul> : <p className="muted small">没有写</p>}
        <p className="xs muted" style={{ marginTop: 10 }}>看过 {opened.filter(o => q.materials.some((m: any) => m.id === o)).length}/{q.materials.length} 份材料，标为关键 {r.kept.length} 份。</p>
        <button type="button" className="btn btn-sm" style={{ marginTop: 10 }} onClick={() => go(2)}>改一改方案</button>
      </section>

      <div className="rv-fb">
        {r.noAction && <p className="notice">{r.noAction}</p>}
        {r.good.length > 0 && <section className="sec-card" aria-labelledby="rv-good"><h2 id="rv-good">合理的地方</h2><ul className="fb">{r.good.map(x => <li key={x.title}><span className={'badge ' + TONE[x.tone][1]}>{TONE[x.tone][0]}</span> <b>{x.title}</b><p>{x.text}</p></li>)}</ul></section>}
        {r.gaps.length > 0 && <section className="sec-card" aria-labelledby="rv-gap"><h2 id="rv-gap">可能漏掉的</h2><ul className="fb">{r.gaps.map(x => <li key={x.title}><b>{x.title}</b><p>{x.text}</p></li>)}</ul></section>}
        {(r.trade.length > 0 || r.many) && <section className="sec-card" aria-labelledby="rv-trade"><h2 id="rv-trade">要权衡的</h2>{r.many && <p className="warn-box" style={{ marginBottom: 10 }}>{r.many}</p>}<ul className="fb">{r.trade.map(x => <li key={x.title}><span className={'badge ' + TONE[x.tone][1]}>{TONE[x.tone][0]}</span> <b>{x.title}</b><p>{x.text}</p></li>)}</ul></section>}
        {r.verify.length > 0 && <section className="sec-card" aria-labelledby="rv-ver"><h2 id="rv-ver">怎么知道有没有用</h2><ul className="fb">{r.verify.map(x => <li key={x.title}><b>{x.title}</b><p>{x.text}</p></li>)}</ul></section>}
      </div>
    </div>

    <section className="sec-card ref-card" aria-labelledby="rv-ref"><h2 id="rv-ref">参考复盘 <span className="badge b-blue">系统参考，不是标准答案</span></h2>
      <div className="ref-sec"><h3>发生了什么</h3><p className="pre">{q.reference.summary}</p></div>
      <div className="ref-sec"><h3>原因判断</h3><p className="pre">{q.reference.cause}</p></div>
      <div className="ref-sec"><h3>下周先做</h3><p className="pre">{q.reference.actions}</p></div>
      <div className="ref-sec"><h3>怎么验证</h3><p className="pre">{q.reference.verify}</p></div>
      {q.reference.uncertain.length > 0 && <div className="ref-sec"><h3>参考思路里也不确定的地方</h3><ul>{q.reference.uncertain.map((u: string) => <li key={u}>{u}</li>)}</ul></div>}
      <div className="ref-sec"><h3>对照你自己写的理由，检查一下</h3><p className="hint">只给你自己看，不保存。</p>
        <ul className="checklist">{g.reference.checklist.map((t: string, i: number) => <li key={t}><label className="choice"><input type="checkbox" checked={checks.includes(i)} onChange={e => setChecks(e.target.checked ? [...checks, i] : checks.filter(x => x !== i))} /><span>{t}</span></label></li>)}</ul></div>
    </section>

    <section className="sec-card" aria-labelledby="rv-role"><h2 id="rv-role">这份工作平时是什么样</h2>
      <p>{g.role.problem}</p>
      <ul className="week">{g.role.week.map((w: any) => <li key={w.when}><b>{w.when}</b><span>{w.what}</span></li>)}</ul>
      <p className="hint" style={{ marginTop: 8 }}>{g.role.caveat}</p>
      <h3>这次做的事里，你更喜欢哪些？不太喜欢哪些？（选填，只给你自己看）</h3>
      <div className="likes">
        <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}><legend className="label">比较喜欢</legend><div className="choice-list">{q.parts.map((p: string) => <label className="choice" key={p}><input type="checkbox" checked={reflection.likes.includes(p)} onChange={e => setRefl({ ...reflection, likes: toggle(reflection.likes, p, e.target.checked), dislikeParts: dp.filter(x => x !== p || !e.target.checked) })} /><span>{p}</span></label>)}</div></fieldset>
        <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}><legend className="label">不太喜欢</legend><div className="choice-list">{q.parts.map((p: string) => <label className="choice" key={p}><input type="checkbox" checked={dp.includes(p)} onChange={e => setRefl({ ...reflection, dislikeParts: toggle(dp, p, e.target.checked), likes: reflection.likes.filter(x => x !== p || !e.target.checked) })} /><span>{p}</span></label>)}</div></fieldset>
      </div>
      <p className="hint" style={{ marginTop: 10 }}>这些选择不会变成标签，也不会发给任何企业。一次 8 分钟的体验说明不了你适不适合这个岗位，只是帮你多知道一点它每天在做什么。</p>
    </section>

    <section className="sec-card next-card" aria-labelledby="rv-next"><h2 id="rv-next">想再往深走一步？</h2>
      {deep && <Link className="deep-link" href={'/experiences/' + deep.id}><span><b>{deep.data.title}</b><span className="small muted">{q.deepWhy || `同一个情境，约 ${deep.data.minutes} 分钟：学 5 个分析方法，自己算数据、写可验证的假设，再换一组数据练一次，最后保存一张问题诊断与行动建议卡。`}</span></span><span className="go">去看看 →</span></Link>}
      {relatedExps.filter(e => e.id !== q.deep).length > 0 && <><h3>其他岗位体验</h3><Grid items={relatedExps.filter(e => e.id !== q.deep)} /></>}
      <div className="row" style={{ marginTop: 14 }}><button type="button" className="btn btn-sm" onClick={() => window.print()}>打印 / 存为 PDF</button><button type="button" className="btn btn-sm" onClick={() => go(0)}>回到任务开头</button></div>
    </section>
    {finish}
    <FeedbackBox experienceId={id} experienceTitle={data.title} contentVersion={version} />
    <p className="xs muted" style={{ marginTop: 16 }}>{data.title} · 模拟工作场景，数据为虚构的教学数据。</p>
  </section>;
}

/* ---------- V1.8「选一项」短实践 ----------
   第 3 步：选一项 → 写一句理由 → 点「看这个选择的反馈」立刻看到为什么、有什么取舍 → 写一句后续（修改建议 / 验证办法）。
   反馈只根据你选了哪一项（平台事先写好的说明），不分析你写的文字；可以改选再看，第一次看的是哪一项会写进复盘。 */
const short = (label: string) => label.split('：')[0];
function PickStep({ q, plan, answers, set, readonly, hints, openHint, heading, go, kept, names, lastField, glossary }: { q: any; plan: any; answers: Answers; set: (k: string, v: string | string[]) => void; readonly: boolean; hints: string[]; openHint: (k: string) => void; heading: RefObject<HTMLHeadingElement | null>; go: (s: number) => void; kept: string[]; names: string[]; lastField: RefObject<HTMLElement | null>; glossary: any[] }) {
  const f = plan.fields.find((x: any) => x.id === 'plan.actions'), fr = plan.fields.find((x: any) => x.id === 'plan.reason'), ff = plan.fields.find((x: any) => x.id === 'plan.follow');
  const issue = choiceIssue(f, answers['plan.actions']); const legacy = issue && issue.kind !== 'empty' ? issue : null;
  const picked = arr(answers['plan.actions']); const cur = !legacy && picked.length === 1 ? picked[0] : '';
  const reason = str(answers['plan.reason']).trim(), follow = str(answers['plan.follow']).trim();
  const canFb = !!cur && reason.length >= 2, shown = !!cur && hints.includes('fb:' + cur), v = cur ? q.actions[cur] : null;
  const ready = !!cur && reason.length >= 2 && follow.length >= 2;
  return <section aria-labelledby="q-h" onFocus={e => { const t = e.target as HTMLElement; if (t.matches('input,textarea,select')) lastField.current = t; }}>
    <div className="eyebrow">第 3 步 / 共 4 步 · {names[2]}</div>
    <h1 id="q-h" tabIndex={-1} ref={heading} className="quick-h1">{q.actTitle || '你的选择'}</h1>
    {q.actIntro && <p className="intro">{q.actIntro}</p>}
    {kept.length > 0 && <p className="small ink2" style={{ marginTop: 8 }}>你标为关键的材料：{kept.map(k => q.materials.find((m: any) => m.id === k)?.title).filter(Boolean).join('、')}</p>}
    <fieldset id="f-plan-actions" className="field qf" disabled={readonly}><legend className="label">{f.label}</legend>
      {legacy && <p className="warn-box" role="alert" data-testid="legacy-plan.actions" style={{ margin: '0 0 10px' }}><b>请重新确认这一题。</b>{legacy.kind === 'multi' ? `之前的作答里选了 ${legacy.picked.length} 项：${legacy.picked.join('、')}。这一题只能选一项，请在下面重新选择。` : `之前的选择「${legacy.picked.join('、')}」已不在选项里，请重新选择。`}</p>}
      <div className="choice-list">{f.options.map((o: string) => <label className="choice" key={o}><input type="radio" name="pick" value={o} checked={cur === o} onChange={() => set('plan.actions', [o])} /><span>{o}</span></label>)}</div>
    </fieldset>
    <Text f={fr} answers={answers} set={set} readonly={readonly} rows={2} />
    <div className="row pick-fb-row">
      <button type="button" className="btn" disabled={!canFb || readonly} onClick={() => openHint('fb:' + cur)} data-testid="pick-show-feedback">{shown ? '已显示这个选择的反馈' : '看这个选择的反馈'}</button>
      <span className="xs muted">{!cur ? '先选一项。' : reason.length < 2 ? '再写一句理由，就能看反馈。' : '反馈只看你选了哪一项，不会分析你写的理由。'}</span>
    </div>
    <div aria-live="polite">{shown && v && <div className="pick-fb" data-testid="pick-feedback">
      <p className="pick-fb-h"><span className={'badge ' + TONE[v.tone][1]}>{TONE[v.tone][0]}</span> <b>你选的：{cur}</b></p>
      {v.good && <p><b>为什么：</b>{v.good}</p>}
      {v.tradeoff && <p><b>要权衡的：</b>{v.tradeoff}</p>}
      <p className="xs muted">这段反馈是平台事先为这个选项写好的说明，不是 AI 点评，也不是分数。{v.tone !== 'strong' ? '可以改选再看；复盘里会记下你第一次看的是哪一项。' : ''}</p>
    </div>}</div>
    <Text f={ff} answers={answers} set={set} readonly={readonly} rows={3} />
    <details className="howto"><summary>需要一点提示？</summary>
      <ul className="small">{plan.hints.map((h: string) => <li key={h}>{h}</li>)}</ul>
      {plan.framework && <div className="framework pre">参考句式：{plan.framework}</div>}
      <Terms names={plan.terms} glossary={glossary} />
    </details>
    {!ready && <p className="hint" role="note" style={{ marginTop: 14 }}>选一项、写一句理由，再写「{short(ff.label)}」，就可以看复盘。</p>}
    <div className="quick-foot">
      <button type="button" className="btn" onClick={() => go(1)}>← 回看材料</button>
      <button type="button" className="btn btn-primary" disabled={!ready} onClick={() => go(3)}>提交，看复盘 →</button>
    </div>
  </section>;
}

function PickReview({ id, version, q, g, data, answers, opened, hints, heading, go, reflection, setRefl, finish, relatedExps, items, names }: { id: string; version: number; q: any; g: any; data: any; answers: Answers; opened: string[]; hints: string[]; heading: RefObject<HTMLHeadingElement | null>; go: (s: number) => void; reflection: Reflection; setRefl: (r: Reflection) => void; finish: ReactNode; relatedExps: any[]; items: any[]; names: string[] }) {
  const r = pickReview(q, answers, opened, hints);
  const fields = g.practice[0].fields, fa = fields.find((x: any) => x.id === 'plan.actions'), ff = fields.find((x: any) => x.id === 'plan.follow');
  const heads: string[] = q.refHeadings || ['发生了什么', '原因判断', '下周先做', '怎么验证'];
  const ready = !!r.choice && r.reason.length >= 2 && r.follow.length >= 2;
  const [checks, setChecks] = useState<number[]>([]);
  const deep = items.find(i => i.id === q.deep);
  const toggle = (list: string[], v: string, on: boolean) => on ? [...list, v] : list.filter(x => x !== v);
  const dp = reflection.dislikeParts || [];
  return <section aria-labelledby="q-h">
    <div className="eyebrow">第 4 步 / 共 4 步 · {names[3]}</div>
    <h1 id="q-h" tabIndex={-1} ref={heading} className="quick-h1">复盘：你的判断和参考思路</h1>
    {!ready && <p className="warn-box" style={{ marginTop: 14 }}>还没写完：选一项、写一句理由，再写「{short(ff.label)}」。<button className="text-btn" onClick={() => go(2)}>回去写</button></p>}
    <p className="notice" style={{ marginTop: 14 }}><b>这份复盘怎么来的：</b>根据你的操作生成——选了哪一项、先看了哪一项的反馈、打开了哪些材料。你写的理由和「{short(ff.label)}」原样放在下面，<b>系统没有接入 AI，不会分析这些文字</b>。不打分，也不评价你适不适合这个方向。</p>

    <div className="rv-grid">
      <section className="sec-card rv-mine" aria-labelledby="rv-mine"><h2 id="rv-mine">你的判断 <span className="badge b-gray">你写的</span></h2>
        <h3>{short(fa.label).replace(/（.*?）$/, '')}</h3>{r.choice ? <p className="mine">{r.choice}</p> : <p className="muted small">还没选</p>}
        {r.first && <p className="small ink2" data-testid="pick-first">你最先看反馈的是「{r.first}」，后来改成了现在这一项。</p>}
        <h3>理由（原文）</h3>{r.reason ? <p className="mine">{r.reason}</p> : <p className="muted small">还没写</p>}
        <h3>{short(ff.label)}（原文）</h3>{r.follow ? <p className="mine">{r.follow}</p> : <p className="muted small">还没写</p>}
        <p className="xs muted" style={{ marginTop: 10 }}>看过 {opened.filter(o => q.materials.some((m: any) => m.id === o)).length}/{q.materials.length} 份材料。</p>
        <button type="button" className="btn btn-sm" style={{ marginTop: 10 }} onClick={() => go(2)}>改一改</button>
      </section>
      <div className="rv-fb">
        {r.verdict && <section className="sec-card" aria-labelledby="rv-v"><h2 id="rv-v">关于你选的这一项</h2>
          <p><span className={'badge ' + TONE[r.verdict.tone][1]}>{TONE[r.verdict.tone][0]}</span></p>
          {r.verdict.good && <p><b>为什么：</b>{r.verdict.good}</p>}{r.verdict.tradeoff && <p><b>要权衡的：</b>{r.verdict.tradeoff}</p>}{r.verdict.verify && <p><b>怎么确认：</b>{r.verdict.verify}</p>}
          {r.verdict.tone !== 'strong' && r.best.length > 0 && <p className="small ink2">参考思路里最先处理的是「{r.best.join('」「')}」，原因见「其他选项为什么」和参考复盘。你有不同看法也可以，关键是理由能对上材料。</p>}
        </section>}
        {r.gaps.length > 0 && <section className="sec-card" aria-labelledby="rv-gap"><h2 id="rv-gap">可能漏看的材料</h2><ul className="fb">{r.gaps.map((x: any) => <li key={x.title}><b>{x.title}</b><p>{x.text}</p></li>)}</ul></section>}
        <details className="sec-card howto" open={!!r.verdict && r.verdict.tone !== 'strong'}><summary><b>其他选项为什么（{r.others.length} 项）</b></summary>
          <ul className="fb">{r.others.map((x: any) => <li key={x.option}><span className={'badge ' + TONE[x.tone][1]}>{TONE[x.tone][0]}</span> <b>{x.option}</b>{x.text && <p>{x.text}</p>}{x.tradeoff && <p className="small ink2">要权衡的：{x.tradeoff}</p>}</li>)}</ul>
        </details>
      </div>
    </div>

    <section className="sec-card ref-card" aria-labelledby="rv-ref"><h2 id="rv-ref">参考复盘 <span className="badge b-blue">系统参考，不是标准答案</span></h2>
      {[q.reference.summary, q.reference.cause, q.reference.actions, q.reference.verify].map((t: string, i: number) => <div className="ref-sec" key={heads[i]}><h3>{heads[i]}</h3><p className="pre">{t}</p></div>)}
      {q.reference.uncertain.length > 0 && <div className="ref-sec"><h3>参考思路里也不确定的地方</h3><ul>{q.reference.uncertain.map((u: string) => <li key={u}>{u}</li>)}</ul></div>}
      <div className="ref-sec"><h3>对照你自己写的，检查一下</h3><p className="hint">只给你自己看，不保存。</p>
        <ul className="checklist">{g.reference.checklist.map((t: string, i: number) => <li key={t}><label className="choice"><input type="checkbox" checked={checks.includes(i)} onChange={e => setChecks(e.target.checked ? [...checks, i] : checks.filter(x => x !== i))} /><span>{t}</span></label></li>)}</ul></div>
    </section>

    {finish}
    <FeedbackBox experienceId={id} experienceTitle={data.title} contentVersion={version} />

    <section className="sec-card next-card" aria-labelledby="rv-next"><h2 id="rv-next">想学得更完整？</h2>
      {deep ? <Link className="deep-link" href={'/experiences/' + deep.id} data-testid="next-full"><span><span className="badge b-orange">完整实践 · 约 {deep.data.minutes} 分钟</span><b>{deep.data.title}</b><span className="small ink2">{q.deepWhy}</span>{deep.data.learn?.length > 0 && <span className="small muted">会进一步学：{deep.data.learn.join('；')}</span>}</span><span className="go">去看看 →</span></Link>
        : <p className="small"><Link href="/experiences">看看其他岗位体验 →</Link></p>}
      {relatedExps.filter(e => e.id !== q.deep).length > 0 && <><h3>其他岗位体验</h3><Grid items={relatedExps.filter(e => e.id !== q.deep)} /></>}
    </section>

    <section className="sec-card" aria-labelledby="rv-role"><h2 id="rv-role">这份工作平时是什么样</h2>
      <p>{g.role.problem}</p>
      <p className="hint" style={{ marginTop: 8 }}>{g.role.caveat}</p>
      {q.parts.length > 0 && <><h3>这次做的事里，你更喜欢哪些？不太喜欢哪些？（选填，只给你自己看）</h3>
        <div className="likes">
          <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}><legend className="label">比较喜欢</legend><div className="choice-list">{q.parts.map((p: string) => <label className="choice" key={p}><input type="checkbox" checked={reflection.likes.includes(p)} onChange={e => setRefl({ ...reflection, likes: toggle(reflection.likes, p, e.target.checked), dislikeParts: dp.filter(x => x !== p || !e.target.checked) })} /><span>{p}</span></label>)}</div></fieldset>
          <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}><legend className="label">不太喜欢</legend><div className="choice-list">{q.parts.map((p: string) => <label className="choice" key={p}><input type="checkbox" checked={dp.includes(p)} onChange={e => setRefl({ ...reflection, dislikeParts: toggle(dp, p, e.target.checked), likes: reflection.likes.filter(x => x !== p || !e.target.checked) })} /><span>{p}</span></label>)}</div></fieldset>
        </div></>}
      <p className="hint" style={{ marginTop: 10 }}>这些选择不会变成标签，也不会发给任何企业。几分钟的短实践说明不了你适不适合这个方向，只是帮你多知道一点它每天在做什么。</p>
    </section>
    <div className="row" style={{ marginTop: 14 }}><button type="button" className="btn btn-sm" onClick={() => window.print()}>打印 / 存为 PDF</button><button type="button" className="btn btn-sm" onClick={() => go(0)}>回到任务开头</button></div>
    <p className="xs muted" style={{ marginTop: 16 }}>{data.title} · {q.simNote || '模拟工作场景，数据为教学模拟数据。'}</p>
  </section>;
}
