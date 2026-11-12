'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ApiError, useSession } from './session';
import { Modal } from './modal';
import { AnswerList, ErrorBox, Grid, Loading, Material, QUICK_STEPS, STEPS, Terms, dateTime, guestSaveNote, hasRealSources, useCatalog } from './ui';
import { QuickWork } from './quick';
import { OutputPanel } from './output';
import { checkChoices, checkNumber } from '@/lib/rule-check';
import { choiceIssue, fieldDone, missingLabel } from '@/server/validation';

type Answers = Record<string, string | string[]>;
type Progress = { step: number; visited: number[]; referenceViewed: boolean; hintsOpened: string[] };
type Reflection = { understand: '' | 'yes' | 'some' | 'no'; likes: string[]; dislikes: string; next: string[]; dislikeParts?: string[] };
type Save = { kind: 'idle' | 'saving' | 'saved' | 'retry' | 'local' | 'conflict' | 'gone' | 'offline' | 'blocked' | 'error'; text?: string };
const EMPTY_P: Progress = { step: 0, visited: [], referenceViewed: false, hintsOpened: [] };
const EMPTY_R: Reflection = { understand: '', likes: [], dislikes: '', next: [] };
const RETRYABLE = (e: unknown) => e instanceof ApiError && (e.code === 'NETWORK' || e.status >= 500 || e.status === 429);

/* 材料说明按内容写：有真实来源的体验不能笼统说「都是虚构的」。真实来源（含据公开资料改编的内容）在详情页的「资料来源」里单独标注。 */
export function materialNote(data: any) {
  return hasRealSources(data?.guide?.provenance) ? '本体验包含教学模拟材料，真实来源已单独标注。' : '本体验的材料是教学模拟的，只用于这次体验。';
}

/* 与服务端 requiredStatus 相同的规则：只用于显示，提交时以服务端为准。 */
export function required(data: any, answers: Answers) {
  if (data.format === 'guided' && data.guide) {
    const fields = data.guide.practice.flatMap((p: any) => p.fields.map((f: any) => ({ ...f, practice: p.id }))).filter((f: any) => f.required !== false);
    const missing: { label: string; practice: string; field?: string }[] = fields.filter((f: any) => !fieldDone(f, answers[f.id])).map((f: any) => ({ label: missingLabel(f, answers[f.id]), practice: f.practice, field: f.id }));
    let total = fields.length;
    if (data.guide.quick) { // 与服务端 QUICK_ACTION_LABEL 规则一致：选一项建议行动，或写自己的方案
      total++; const a = answers['plan.actions'], own = answers['plan.own'];
      const okA = Array.isArray(a) && a.length > 0 && a.every(x => data.guide.quick.actions[x]);
      if (!okA && !(typeof own === 'string' && own.trim().length >= 2)) missing.push({ label: '下周先做什么（选一项建议，或写自己的方案）', practice: 'plan' });
    }
    return { total, done: total - missing.length, missing };
  }
  const missing = data.tasks.map((t: any, i: number) => { const s = typeof answers[String(i)] === 'string' ? answers[String(i)] as string : ''; const good = !t.options ? s.trim().length >= 2 : t.options.some((o: string) => s.startsWith(o + '：') && s.slice(o.length + 1).trim().length >= 2); return good ? null : { label: t.title, practice: 't' + i }; }).filter(Boolean);
  return { total: data.tasks.length, done: data.tasks.length - missing.length, missing };
}
const filledField = (v: unknown) => Array.isArray(v) ? v.length > 0 : typeof v === 'string' && v.trim().length > 0;
const same = (a: Answers, b: Answers) => { const n = (x: Answers) => JSON.stringify(Object.keys(x).sort().filter(k => filledField(x[k])).map(k => [k, Array.isArray(x[k]) ? [...x[k] as string[]].sort() : String(x[k]).trim()])); return n(a) === n(b); };

/* 本机备份：网络失败或页面意外关闭时保留作答。localStorage 不可用时自动关闭，并提示。 */
function useBackup(key: string | null) {
  const [ok, setOk] = useState(true);
  const read = useCallback(() => { if (!key) return null; try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : null; } catch { setOk(false); return null; } }, [key]);
  const write = useCallback((v: unknown) => { if (!key) return; try { localStorage.setItem(key, JSON.stringify(v)); setOk(true); } catch { setOk(false); } }, [key]);
  const clear = useCallback(() => { if (!key) return; try { localStorage.removeItem(key); } catch { /* ignore */ } }, [key]);
  return { ok, read, write, clear };
}

export function Work({ id }: { id: string }) {
  const { api, session, blocked, toast } = useSession(); const router = useRouter();
  const { items } = useCatalog();
  const [guide, setGuide] = useState<any>(null), [loadError, setLoadError] = useState('');
  const [answers, setAnswers] = useState<Answers>({}), [progress, setProgress] = useState<Progress>(EMPTY_P), [reflection, setReflection] = useState<Reflection>(EMPTY_R);
  const [save, setSave] = useState<Save>({ kind: 'idle' }), [savedAt, setSavedAt] = useState('');
  const [conflict, setConflict] = useState<any>(null), [pendingBackup, setPendingBackup] = useState<any>(null);
  const [done, setDone] = useState<any>(null), [submitting, setSubmitting] = useState(false), [submitError, setSubmitError] = useState<any>(null);
  const [checks, setChecks] = useState<number[]>([]), [mats, setMats] = useState(false);
  const lastField = useRef<HTMLElement | null>(null);
  const rev = useRef(0), dirty = useRef(false), inflight = useRef(false), timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined), attempt = useRef(0), frozen = useRef(false);
  const latest = useRef({ answers, progress, reflection }); latest.current = { answers, progress, reflection };
  const heading = useRef<HTMLHeadingElement>(null), [focusTick, setFocusTick] = useState(0), focusField = useRef<string | null>(null);
  const owner = session?.identity.owner;
  const backup = useBackup(owner && guide && !guide.unavailable ? `onstage:backup:${owner}:${id}` : null);
  const loaded = useRef('');

  /* 载入：体验内容（对应你的草稿版本）+ 草稿 + 是否已完成。身份变化后重新载入。 */
  const load = useCallback(async () => {
    try {
      const g = await api('experiences/' + id + '/guide'); setGuide(g);
      if (g.unavailable) { frozen.current = true; setSave({ kind: 'offline' }); return; }
      const d = await api('drafts/' + id);
      rev.current = d?.version || 0; dirty.current = false;
      const a = d?.answers || {}; setAnswers(a);
      const p = { ...EMPTY_P, ...(d?.progress || {}) }; setProgress(p); setSavedAt(d?.saved_at || '');
      if (d?.conflict) { frozen.current = true; setConflict(d); setSave({ kind: 'conflict' }); } else { frozen.current = false; setConflict(null); setSave({ kind: d ? 'saved' : 'idle' }); }
      if (session?.identity.userId) { const m = await api('mine'); setDone(m.records.find((r: any) => r.contentId === id && r.contentVersion === g.version) || null); }
      // 本机有没同步到服务器的作答，而且和服务器上的不一样：让用户决定是否恢复。
      try {
        const b = localStorage.getItem(`onstage:backup:${session!.identity.owner}:${id}`); const bk = b ? JSON.parse(b) : null;
        if (bk && !bk.synced && bk.contentVersion === g.version && !same(bk.answers || {}, a) && Object.values(bk.answers || {}).some(filledField)) setPendingBackup(bk);
      } catch { /* 存储不可用 */ }
      // 「感受」单独存一份：登录前写的感受，登录后跟随作答一起并入账号（与草稿合并规则一致：只从游客带到账号）。
      try {
        const rk = localStorage.getItem('onstage:reflection:' + id); const rv = rk ? JSON.parse(rk) : null;
        const me = session!.identity;
        if (rv && (rv.owner === me.owner || (String(rv.owner).startsWith('guest:') && me.userId))) {
          setReflection({ ...EMPTY_R, ...rv.reflection }); latest.current.reflection = { ...EMPTY_R, ...rv.reflection };
          if (rv.owner !== me.owner) localStorage.setItem('onstage:reflection:' + id, JSON.stringify({ owner: me.owner, reflection: rv.reflection }));
        } else setReflection(EMPTY_R);
      } catch { /* 存储不可用 */ }
      setLoadError('');
    } catch (e) { if (!(e instanceof ApiError && e.code === 'IDENTITY_CHANGED')) setLoadError((e as Error).message); }
  }, [api, id, session]);
  useEffect(() => { if (!session) return; if (loaded.current === session.identity.stamp) return; loaded.current = session.identity.stamp; void load(); }, [session, load]);
  useEffect(() => { if (blocked) { frozen.current = true; clearTimeout(timer.current); setSave({ kind: 'blocked' }); } }, [blocked]);

  const persistLocal = useCallback((synced: boolean) => {
    if (!guide || guide.unavailable) return;
    backup.write({ ...latest.current, contentVersion: guide.version, rev: rev.current, synced, at: new Date().toISOString() });
  }, [backup, guide]);

  /* 保存：一次只发一个请求；期间的新改动等这次结束后再发。网络/服务错误时指数退避重试，内容先留在本机。 */
  const flush = useCallback(async (): Promise<boolean> => {
    if (!guide || guide.unavailable || frozen.current) return false;
    if (inflight.current) return false;
    if (!dirty.current) return true;
    inflight.current = true; dirty.current = false; setSave({ kind: 'saving' });
    const snap = latest.current;
    try {
      const d = await api('drafts/' + id, { version: rev.current, contentVersion: guide.version, answers: snap.answers, progress: snap.progress });
      rev.current = d.version; setSavedAt(d.saved_at); attempt.current = 0;
      if (!dirty.current) { persistLocal(true); setSave({ kind: 'saved' }); }
      return !dirty.current;
    } catch (e) {
      const err = e as ApiError;
      if (err.code === 'STORAGE') { dirty.current = true; setSave({ kind: 'error', text: err.message }); }
      else if (RETRYABLE(err)) {
        dirty.current = true; persistLocal(false); attempt.current++;
        const wait = Math.min(30000, 2000 * 2 ** (attempt.current - 1));
        setSave({ kind: 'retry', text: `${err.code === 'NETWORK' ? '网络中断' : '服务暂时不可用'}：作答已暂存在这台设备，${Math.round(wait / 1000)} 秒后自动重试` });
        clearTimeout(timer.current); timer.current = setTimeout(() => void flush(), wait);
      } else if (err.code === 'DRAFT_CONFLICT') { frozen.current = true; persistLocal(false); const d = await api('drafts/' + id).catch(() => null); if (d) { rev.current = d.version; setConflict(d); } setSave({ kind: 'conflict' }); }
      else if (err.code === 'DRAFT_GONE') { frozen.current = true; persistLocal(false); setSave({ kind: 'gone' }); }
      else if (err.code === 'UNAVAILABLE' || err.code === 'CONTENT_CHANGED') { frozen.current = true; persistLocal(false); setSave({ kind: 'offline', text: err.message }); }
      else if (['IDENTITY_CHANGED', 'SESSION_EXPIRED'].includes(err.code)) { frozen.current = true; persistLocal(false); setSave({ kind: 'blocked' }); }
      else { dirty.current = true; persistLocal(false); setSave({ kind: 'error', text: err.message }); }
      return false;
    } finally {
      inflight.current = false;
      if (dirty.current && !frozen.current && attempt.current === 0) { clearTimeout(timer.current); timer.current = setTimeout(() => void flush(), 700); }
    }
  }, [api, guide, id, persistLocal]);

  const touch = useCallback(() => {
    if (frozen.current) return;
    dirty.current = true; persistLocal(false);
    if (attempt.current > 0) return; // 正在退避重试，等重试时一并发出
    setSave(s => s.kind === 'saving' ? s : { kind: 'local' });
    clearTimeout(timer.current); timer.current = setTimeout(() => void flush(), 700);
  }, [flush, persistLocal]);
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (dirty.current || inflight.current) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn);
  }, []);

  const readonly = !guide || guide.unavailable || ['conflict', 'gone', 'offline', 'blocked'].includes(save.kind);
  const setAnswer = (k: string, v: string | string[]) => { if (readonly) return; setAnswers(a => { const n = { ...a, [k]: v }; latest.current.answers = n; return n; }); touch(); };
  /* 第一次去看参考思路时，把当时的作答留一份「看参考前的版本」（pre.*），之后修改也能对比。 */
  const snapshotPre = () => {
    const gq = guide?.data?.guide; if (!gq?.output) return;
    setAnswers(a => {
      if (Object.keys(a).some(k => k.startsWith('pre.'))) return a;
      const filled = gq.practice.flatMap((p: any) => p.fields.map((f: any) => f.id)).filter((f: string) => filledField(a[f]));
      if (!filled.length) return a;
      const n: Answers = { ...a }; for (const f of filled) n['pre.' + f] = a[f]; latest.current.answers = n; return n;
    });
  };
  const go = (step: number) => {
    if (!readonly && step === (guide?.data?.guide?.quick ? 3 : 4)) snapshotPre();
    setProgress(p => { const n = { ...p, step, visited: [...new Set([...p.visited, p.step, step])].sort(), referenceViewed: p.referenceViewed || step === (guide?.data?.guide?.quick ? 3 : 4) }; latest.current.progress = n; return n; });
    if (!readonly) touch();
    window.scrollTo({ top: 0, behavior: 'auto' }); setFocusTick(t => t + 1);
  };
  /* 换步骤后，等新步骤渲染完成再把焦点移到标题（不用定时器，避免在慢设备上焦点落到已移除的旧标题）。 */
  useEffect(() => {
    if (!focusTick) return;
    const fid = focusField.current; focusField.current = null;
    const el = fid ? document.getElementById('f-' + fid.replace(/\./g, '-')) : null;
    // 从「还差」跳过来时：定位并聚焦那一项（选项组聚焦第一个选项）；否则聚焦步骤标题
    const target = el ? (el.tagName === 'FIELDSET' ? el.querySelector<HTMLElement>('input') : el) : null;
    if (target) { el!.scrollIntoView({ block: 'center' }); target.focus({ preventScroll: true }); } else heading.current?.focus();
  }, [focusTick]);
  // 打开页面时把当前步骤记为已浏览（不产生保存，等用户有操作再保存）。
  useEffect(() => { setProgress(p => p.visited.includes(p.step) ? p : { ...p, visited: [...p.visited, p.step].sort() }); }, [progress.step]);
  const viewRef = () => { setProgress(p => { if (p.referenceViewed) return p; const n = { ...p, referenceViewed: true, visited: [...new Set([...p.visited, 0])] }; latest.current.progress = n; return n; }); if (!readonly) touch(); };
  const openHint = (key: string) => { setProgress(p => { const n = { ...p, hintsOpened: [...new Set([...p.hintsOpened, key])] }; latest.current.progress = n; return n; }); if (!readonly) touch(); };
  const setRefl = (r: Reflection) => { setReflection(r); latest.current.reflection = r; try { localStorage.setItem('onstage:reflection:' + id, JSON.stringify({ owner, reflection: r })); } catch { /* 存储不可用时只保留在本页 */ } };

  async function resolve(recoveryId: string | null) {
    try {
      const d = await api('drafts/' + id + '/resolve', { version: conflict.version, recoveryId });
      rev.current = d.version; frozen.current = false; dirty.current = false; setConflict(null); setAnswers(d.answers); setSavedAt(d.saved_at); setSave({ kind: 'saved' }); persistLocal(true);
      toast(recoveryId ? '已改用另一份作答；原来的草稿放进了「我的 → 可恢复的作答」' : '已继续使用当前草稿；另一份仍在「我的 → 可恢复的作答」');
    } catch (e) { toast((e as Error).message, true); if ((e as ApiError).code === 'DRAFT_CONFLICT') void load(); }
  }
  function useBackupNow() { const b = pendingBackup; setPendingBackup(null); setAnswers(b.answers); latest.current.answers = b.answers; if (b.progress) { const p = { ...EMPTY_P, ...b.progress }; setProgress(p); latest.current.progress = p; } touch(); toast('已恢复这台设备上暂存的作答，正在保存'); }
  function dropBackup() { setPendingBackup(null); persistLocal(true); }

  async function submit() {
    setSubmitError(null);
    if (!session?.identity.userId) return;
    setSubmitting(true);
    try {
      clearTimeout(timer.current); attempt.current = 0;
      if (dirty.current || inflight.current) { let tries = 0; while ((dirty.current || inflight.current) && tries++ < 20) { if (!inflight.current) { const ok = await flush(); if (!ok && (frozen.current || attempt.current > 0)) break; } else await new Promise(r => setTimeout(r, 150)); } }
      if (dirty.current || frozen.current) throw new ApiError('作答还没有保存成功，暂时不能完成。请等保存成功后再试', 'UNSAVED', 0);
      const r = await api('experiences/' + id + '/submit', { version: rev.current, contentVersion: guide.version, reflection: latest.current.reflection });
      backup.clear(); try { localStorage.removeItem('onstage:reflection:' + id); } catch { /* ignore */ }
      toast(r.duplicate ? '你已经完成过这个版本，打开原来的完成记录' : '已保存体验完成记录');
      router.push('/records/' + r.id);
    } catch (e) {
      const err = e as ApiError; setSubmitError({ text: err.message, missing: err.code === 'INCOMPLETE' });
      if (err.code === 'DRAFT_CONFLICT') void load();
    } finally { setSubmitting(false); }
  }

  if (loadError) return <div className="wrap page"><ErrorBox text={loadError} retry={() => { setLoadError(''); void load(); }} /></div>;
  if (!guide) return <Loading />;
  if (guide.unavailable) return <div className="wrap page"><h1>这个岗位体验已下线</h1><p className="lede">暂时不能继续保存或完成。你之前保存的草稿和完成记录都还在，可以在「我的」查看。</p><p style={{ marginTop: 16 }}><Link className="btn" href="/me">查看我的内容 →</Link></p></div>;

  const data = guide.data; const g = data.guide; const guided = data.format === 'guided' && g; const quick = !!(guided && g.quick);
  const steps = quick ? QUICK_STEPS : STEPS;
  const status = required(data, answers);
  const step = guided ? progress.step : 0;
  const user = session?.identity.userId;
  const saveView: Record<Save['kind'], [string, string]> = {
    idle: ['', '还没有作答'], saving: ['', '正在保存…'], saved: ['ok', savedAt ? '已保存 · ' + dateTime(savedAt).slice(-8, -3) : '已保存'], local: ['', '有改动，即将保存'],
    retry: ['warn', save.text || '保存失败，正在重试'], error: ['bad', save.text || '保存失败'], conflict: ['warn', '有两份草稿，请先选择'], gone: ['bad', '草稿已在其他页面完成或处理'],
    offline: ['bad', save.text || '体验已下线，不能保存'], blocked: ['bad', '登录身份变化，保存已暂停']
  };
  const [cls, label] = saveView[save.kind];
  const stepState = (i: number) => {
    if (quick) { const seen = progress.visited.includes(i) || i === step; if (i === 2) return status.done === status.total ? ['done', '已写好'] : status.done > 0 ? ['part', '写了一部分'] : [seen ? 'part' : '', seen ? '未写完' : '未开始']; if (i === 1) { const n = progress.hintsOpened.filter(h => h.startsWith('open:')).length; return n ? ['done', '已看 ' + n + ' 份'] : [seen ? 'part' : '', seen ? '还没打开' : '未看']; } return seen ? ['done', '已看'] : ['', '未看']; }
    const seen = progress.visited.includes(i) || i === step;
    if (i === 3) return status.done === status.total ? ['done', '已作答 ' + status.done + '/' + status.total] : status.done > 0 ? ['part', '已作答 ' + status.done + '/' + status.total] : [seen ? 'part' : '', seen ? '已浏览 · 未作答' : '未开始'];
    return progress.visited.includes(i) || i === step ? ['done', '已浏览'] : ['', '未看'];
  };
  /* 第 6 步（迁移练习）的材料抽屉：先放这一题自己的新材料（条件变化、补充数据），再放原任务材料（提示里会提到）。 */
  const transferMats: any[] = guided ? g.practice.filter((p: any) => p.when === 'transfer' && p.material).map((p: any) => ({ id: 'tr-' + p.id, title: p.title + '：这一题的新材料', kind: 'text', text: p.material })) : [];
  const matList: any[] = quick ? [] : guided ? (step >= 2 && step <= 4 ? g.brief.materials : step === 5 && transferMats.length ? [...transferMats, ...g.brief.materials.map((m: any) => ({ ...m, title: '原任务' + m.title }))] : []) : (data.scene ? [{ id: 'scene', title: '情境', kind: 'text', text: data.scene }] : []);
  const relatedJobs = items.filter(i => i.kind === 'job' && i.status === 'published' && (g?.related.jobs || []).includes(i.id));
  const relatedExps = items.filter(i => i.kind === 'experience' && (g?.related.experiences || []).includes(i.id));

  const finishBlock = <section className="sec-card" aria-labelledby="finish-h">
            <h2 id="finish-h">完成并保存记录</h2>
            <p className="small ink2">完成记录只表示你完成了这次模拟体验，<b>不代表实习经历或职业资格</b>，也不会发给任何企业。</p>
            <p className="small" style={{ marginTop: 8 }}>作答进度：{status.done} / {status.total} 项{status.done === status.total ? ' · 都写好了' : ''}</p>
            {status.missing.length > 0 && <div className="notice" style={{ marginTop: 10 }}><b>还差这些没写：</b><ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>{status.missing.map((m: any) => <li key={m.label}>{guided ? <button className="text-btn" onClick={() => quick ? go(2) : editAt(m.practice, m.field)}>{m.label}</button> : m.label}</li>)}</ul><p className="xs muted" style={{ marginTop: 6 }}>只看内容、不作答，不会生成完成记录。每项至少写两个字即可，没有标准答案。</p></div>}
            {!user && session?.loginAvailable === false ? <div className="notice" style={{ marginTop: 12 }} data-testid="trial-note"><b>{guided ? '这个体验没有成果页。' : '简版练习只有任务和参考思路，不生成成果。'}</b>你的作答会自动保存在这个浏览器里。{guestSaveNote(session.sessionDays)}</div>
              : !user ? <div className="notice" style={{ marginTop: 12 }}>保存完成记录需要登录。登录后，你在这台设备上写的作答会合并到账号里（规则见登录页）。<div style={{ marginTop: 10 }}><Link className="btn btn-primary" href={'/login?next=' + encodeURIComponent('/experiences/' + id + '/work')}>登录后保存记录</Link></div></div>
              : <div className="row" style={{ marginTop: 12 }}><button className="btn btn-primary" disabled={submitting || readonly || status.missing.length > 0} onClick={submit}>{submitting ? '正在保存…' : '完成并保存记录'}</button>{done && <span className="small muted">已完成过，再点只会打开原记录</span>}</div>}
            {submitError && <p className="err" role="alert" style={{ marginTop: 8 }}>{submitError.text}</p>}
          </section>;
  const editAt = (practiceId: string, fieldId?: string) => {
    if (quick) return go(2);
    focusField.current = fieldId || null;
    const p = g.practice.find((x: any) => x.id === practiceId); go(p?.when === 'transfer' ? 5 : 3);
    if (!fieldId) setTimeout(() => document.getElementById('pr-' + practiceId)?.scrollIntoView({ block: 'start' }), 60);
  };
  const outputBlock = guided && g.output ? <OutputPanel id={id} data={data} g={g} version={guide.version} answers={answers} status={status} onEdit={editAt} /> : null;
  const finishArea = <>{outputBlock}{session?.staticTrial && outputBlock ? null : finishBlock}</>;

  return <>
    <div className="work-head">
      <div className="wrap">
        <div className="work-head-in">
          <div className="work-title"><Link href={'/experiences/' + id} className="muted small" style={{ fontWeight: 600 }}>← 详情</Link>　{data.title}</div>
          <div className="row" style={{ gap: 12 }}>
            {guide.demo && <span className="badge b-demo">示例数据</span>}
            <span className={'save-state ' + cls} role="status" aria-live="polite">{label}</span>
            {save.kind === 'retry' && <button className="btn btn-sm" onClick={() => { attempt.current = 0; clearTimeout(timer.current); void flush(); }}>立即重试</button>}
            {save.kind === 'error' && <button className="btn btn-sm" onClick={() => { dirty.current = true; void flush(); }}>重试保存</button>}
          </div>
        </div>
        {guided && <ol className={'stepper' + (quick ? ' stepper-4' : '')} aria-label="体验步骤">{steps.map((s, i) => { const [c, t] = stepState(i); return <li key={s}><button type="button" aria-current={step === i ? 'step' : undefined} onClick={() => go(i)}><span className="n">第 {i + 1} 步</span><span className="t">{s}</span><span className={'s ' + c}>{t}</span></button></li>; })}</ol>}
      </div>
    </div>
    {matList.length > 0 && <div className="mobile-tools"><div className="wrap row" style={{ justifyContent: 'space-between', flexWrap: 'nowrap', width: '100%' }}>
      <span className={'save-state ' + cls}>{guided ? `第 ${step + 1} 步 · ` : ''}{label}</span>
      <button type="button" className="btn btn-sm" onClick={() => setMats(true)} aria-haspopup="dialog">查看材料（{matList.length}）</button>
    </div></div>}
    <Modal open={mats} title={guided ? '任务材料' : '情境材料'} variant="sheet" onClose={() => setMats(false)} returnFocus={() => lastField.current}>
      <p className="hint">{materialNote(data)}看完点「关闭」或按 Esc，会回到你刚才作答的位置，已写的内容不会丢。</p>
      {matList.map((m: any) => <Material key={m.id} m={m} />)}
    </Modal>
    <div className="wrap">
      {!backup.ok && <p className="warn-box" style={{ marginTop: 16 }} role="alert">这个浏览器不能使用本地存储（可能是隐私模式或空间已满）。作答仍会保存到服务器，但网络中断时无法在本机暂存，请注意保存状态。</p>}
      {guide.outdated && <p className="notice" style={{ marginTop: 16 }}>这个体验已经更新到第 {guide.latest} 版。你正在做的是你开始时的第 {guide.version} 版，可以继续做完；完成记录会对应第 {guide.version} 版。</p>}
      {done && <p className="ok-box" style={{ marginTop: 16 }}>你已经完成过这个版本。<Link href={'/records/' + done.id}>查看完成记录</Link>。再做一次只用于练习，不会生成新的记录。</p>}
      {save.kind === 'gone' && <p className="bad-box" style={{ marginTop: 16 }} role="alert">这份草稿已经在另一个页面完成或被处理。刚才这里的作答没有丢，已放进 <Link href="/me">「我的 → 可恢复的作答」</Link>。</p>}
      {save.kind === 'offline' && <p className="bad-box" style={{ marginTop: 16 }} role="alert">{save.text || '体验已下线'}。这页上的内容已在本机暂存，原来保存的草稿也还在。</p>}
      {pendingBackup && <div className="warn-box" style={{ marginTop: 16 }} role="alert"><b>这台设备上有一份没保存到服务器的作答</b>（{dateTime(pendingBackup.at)}），和服务器上的草稿不一样。
        <div className="row" style={{ marginTop: 10 }}><button className="btn btn-sm btn-primary" onClick={useBackupNow}>用本机这份继续</button><button className="btn btn-sm" onClick={dropBackup}>保留服务器上的草稿</button></div></div>}
      {conflict && <ConflictChooser conflict={conflict} data={data} onPick={resolve} />}

      {quick ? null : <div className="work">
        <div className="work-main" onFocus={e => { const t = e.target as HTMLElement; if (t.matches('input,textarea,select')) lastField.current = t; }}>
          {!guided ? <SimpleTasks data={data} answers={answers} set={setAnswer} readonly={readonly} heading={heading} refViewed={progress.referenceViewed} onViewRef={viewRef} status={status} done={!!done} openMats={matList.length ? () => setMats(true) : undefined} /> : <>
            <div className="eyebrow">第 {step + 1} 步 / 共 6 步 · {STEPS[step]}</div>
            <h1 tabIndex={-1} ref={heading}>{[g.role ? '这个岗位在做什么' : '', g.demo.title, '你的模拟任务', '跟着尝试', '对照参考思路', '总结与下一步'][step] || STEPS[step]}</h1>
            {step === 0 && <RoleStep g={g} data={data} />}
            {step === 1 && <DemoStep g={g} />}
            {step === 2 && <BriefStep g={g} />}
            {step === 3 && <PracticeStep g={g} answers={answers} set={setAnswer} readonly={readonly} opened={progress.hintsOpened} openHint={openHint} openMats={() => setMats(true)} />}
            {step === 4 && <ReferenceStep g={g} data={data} answers={answers} status={status} checks={checks} setChecks={setChecks} go={go} />}
            {step === 5 && <>{g.practice.some((p: any) => p.when === 'transfer') && <PracticeStep when="transfer" g={g} answers={answers} set={setAnswer} readonly={readonly} opened={progress.hintsOpened} openHint={openHint} openMats={() => setMats(true)} />}<WrapStep data={data} reflection={reflection} setRefl={setRefl} relatedExps={relatedExps} items={items} />{finishArea}<ContinueLearning relatedExps={relatedExps} /></>}
          </>}

          {!guided && finishArea}

          {guided && <nav className="nav-steps" aria-label="上一步和下一步">
            {step > 0 ? <button className="btn" onClick={() => go(step - 1)}>← 上一步：{STEPS[step - 1]}</button> : <span />}
            {step < 5 && <button className="btn btn-primary" onClick={() => go(step + 1)}>下一步：{STEPS[step + 1]} →</button>}
          </nav>}
        </div>

        <aside className="work-side" aria-label="体验信息">
          <div className="panel"><div className="panel-b stack">
            <div className="small"><b>约 {data.minutes} 分钟</b> · 不计时，随时可以暂停</div>
            <div className="small ink2">{user ? '作答自动保存到你的账号，可以在其他设备继续。' : session?.loginAvailable === false ? guestSaveNote(session.sessionDays) : '还没登录：作答自动保存在这个浏览器的会话里。登录后会合并到账号。'}</div>
            <div className="small ink2">作答只有你自己能看到，企业看不到。</div>
            <p className="xs muted">模拟工作场景：{materialNote(data)}不是真实商业任务，也不是实习。</p>
          </div></div>
          {guided && step >= 2 && step <= 4 && <details className="panel side-mats" open={step === 3}><summary className="panel-b" style={{ cursor: 'pointer', fontWeight: 700 }}>任务材料（{g.brief.materials.length} 份）</summary><div className="panel-b" style={{ paddingTop: 0 }}>{g.brief.materials.map((m: any) => <Material key={m.id} m={m} />)}</div></details>}
          {guided && <div className="panel"><div className="panel-b"><b className="small">术语表</b><Terms names={g.glossary.map((t: any) => t.term)} glossary={g.glossary} /></div></div>}
        </aside>
      </div>}
    </div>
    {quick && <QuickWork id={id} data={data} g={g} answers={answers} set={setAnswer} readonly={readonly} progress={progress} go={go} openHint={openHint} heading={heading}
      reflection={reflection} setRefl={setRefl} finish={finishArea} relatedExps={relatedExps} relatedJobs={relatedJobs} items={items} lastField={lastField}
      saveLabel={<span className={'save-state ' + cls} role="status">第 {step + 1} 步 · {label}</span>} />}
  </>;
}

export function RoleStep({ g, data }: { g: any; data: any }) {
  return <>
    <p className="intro">{data.direction} · 先花 5 分钟了解这个岗位，再动手。</p>
    <p className="warn-box" style={{ marginTop: 14 }}>{g.notInternship}</p>
    <section className="sec-card"><h2>这个岗位解决什么问题</h2><p>{g.role.problem}</p></section>
    <section className="sec-card"><h2>典型的一周</h2><ul className="week">{g.role.week.map((w: any) => <li key={w.when}><b>{w.when}</b><span>{w.what}</span></li>)}</ul></section>
    <section className="sec-card"><h2>常用材料、工具和产出</h2>
      <h3>常接触的工具和材料</h3><div className="tags">{g.role.tools.map((t: string) => <span className="tag" key={t}>{t}</span>)}</div>
      <h3>常见产出</h3><ul>{g.role.deliverables.map((t: string) => <li key={t}>{t}</li>)}</ul></section>
    <section className="sec-card"><h2>难点和需要权衡的地方</h2><ul>{g.role.hard.map((t: string) => <li key={t}>{t}</li>)}</ul></section>
    <section className="sec-card"><h2>如果你对这些感兴趣，可能会喜欢</h2><ul>{g.role.interests.map((t: string) => <li key={t}>{t}</li>)}</ul><p className="hint" style={{ marginTop: 10 }}>{g.role.caveat}</p></section>
  </>;
}
export function DemoStep({ g }: { g: any }) {
  const d = g.demo;
  return <>
    <p className="intro">先看一个已经做完的小案例，熟悉思路。这里不需要作答。</p>
    <section className="sec-card"><h2>背景</h2><p className="pre">{d.background}</p></section>
    <section className="sec-card"><h2>原始材料</h2>{d.materials.map((m: any) => <Material key={m.id} m={m} />)}</section>
    <section className="sec-card"><h2>思考过程</h2><ol className="thinking">{d.thinking.map((t: any) => <li key={t.step}><b>{t.step}</b><p style={{ margin: '4px 0 0' }}>{t.text}</p></li>)}</ol>
      <Terms names={d.glossary.map((t: any) => t.term)} glossary={d.glossary} /></section>
    <section className="sec-card"><h2>示例成果</h2><div className="output">{d.output}</div><p className="hint" style={{ marginTop: 8 }}>这是一种合理的写法，不是唯一标准。</p></section>
    {g.lessons?.length > 0 && <section className="sec-card lessons" aria-labelledby="lessons-h"><h2 id="lessons-h">这次要学的 {g.lessons.length} 个方法</h2>
      <p className="small ink2">后面的任务用的是另一组材料，不能照抄示范。每一步都会提醒你用到哪个方法。</p>
      <ol>{g.lessons.map((l: any) => <li key={l.id}><b>{l.title}</b><p className="small">{l.point}</p>{l.example && <p className="small muted">例子：{l.example}</p>}</li>)}</ol></section>}
  </>;
}
export function BriefStep({ g }: { g: any }) {
  const b = g.brief;
  return <>
    <p className="intro"><span className="badge b-orange">模拟工作场景</span>　像真正接到一份工作任务一样，先把情况看清楚。</p>
    <section className="sec-card"><h2>你的角色</h2><p>{b.role}</p></section>
    <section className="sec-card"><h2>现在的情况</h2><p className="pre">{b.situation}</p></section>
    <section className="sec-card"><h2>材料</h2><p className="hint">{materialNote({ guide: g })}</p>{b.materials.map((m: any) => <Material key={m.id} m={m} />)}</section>
    <section className="sec-card"><h2>要交什么</h2><ul>{b.deliverable.map((t: string) => <li key={t}>{t}</li>)}</ul>
      {b.constraints.length > 0 && <><h3>限制条件</h3><ul>{b.constraints.map((t: string) => <li key={t}>{t}</li>)}</ul></>}
      {b.help.length > 0 && <><h3>可以用的帮助</h3><ul>{b.help.map((t: string) => <li key={t}>{t}</li>)}</ul></>}</section>
  </>;
}
export function PracticeStep({ g, answers, set, readonly, opened, openHint, openMats, when = 'practice' }: { g: any; answers: Answers; set: (k: string, v: string | string[]) => void; readonly: boolean; opened: string[]; openHint: (k: string) => void; openMats: () => void; when?: 'practice' | 'transfer' }) {
  const [frames, setFrames] = useState<string[]>([]);
  const list = g.practice.filter((p: any) => (p.when || 'practice') === when);
  const lessons: any[] = g.lessons || [];
  return <>
    {when === 'practice' ? <p className="intro">分 {list.length} 小步作答。每步都有提示和答题框架，卡住了就看提示。只需要文字，不用上传文件；写几句即可，没有标准答案。带「规则检查」的格子只核对数字或你选的标签。</p>
      : <section className="sec-card transfer-intro"><h2>迁移练习：换一组材料，再用一次刚学的方法</h2><p className="small ink2">这组材料和示范、正式任务都不一样。做完才算完成这个体验。数字和标签会做规则检查，你写的文字不会被自动评价。</p></section>}
    {list.map((p: any, idx: number) => {
      const shown = p.hints.filter((_: string, i: number) => opened.includes(p.id + ':' + i)).length;
      const filled = p.fields.filter((f: any) => f.kind === 'choices' && f.single ? !choiceIssue(f, answers[f.id]) : filledField(answers[f.id])).length;
      return <section className="practice" key={p.id} id={'pr-' + p.id} aria-labelledby={'h-' + p.id}>
        <div className="practice-h"><h2 id={'h-' + p.id}>{idx + 1}. {p.title}</h2><span className="row" style={{ gap: 6 }}><button type="button" className="btn btn-sm only-narrow" onClick={openMats}>查看材料</button><span className={'badge ' + (filled === p.fields.length ? 'b-green' : filled ? 'b-warn' : 'b-gray')}>{filled === p.fields.length ? '已作答' : filled ? '写了一部分' : '未作答'}</span></span></div>
        {p.material && <div className="task-mat pre" role="note"><span className="xs muted">这一题的材料</span>{'\n'}{p.material}</div>}
        <p className="prompt pre">{p.prompt}</p>
        {p.lessons?.length > 0 && lessons.length > 0 && <details className="lesson-tip"><summary>方法提醒：{p.lessons.map((l: string) => lessons.find(x => x.id === l)?.title).filter(Boolean).join('、')}</summary><ul>{p.lessons.map((l: string) => { const x = lessons.find(y => y.id === l); return x ? <li key={l}><b>{x.title}</b>：{x.point}</li> : null; })}</ul></details>}
        <Terms names={p.terms} glossary={g.glossary} />
        <div className="hints">
          {p.hints.slice(0, shown).map((h: string, i: number) => <div className="hint-item" key={i}><b>提示 {i + 1}：</b>{h}</div>)}
          <div className="row" style={{ marginTop: 8 }}>
            {shown < p.hints.length && <button type="button" className="btn btn-sm" onClick={() => openHint(p.id + ':' + shown)}>{shown ? '再看一条提示' : '看提示'}（{shown}/{p.hints.length}）</button>}
            {p.framework && <button type="button" className="btn btn-sm" aria-expanded={frames.includes(p.id)} onClick={() => setFrames(f => f.includes(p.id) ? f.filter(x => x !== p.id) : [...f, p.id])}>答题框架</button>}
          </div>
          {frames.includes(p.id) && <div className="framework pre">{p.framework}</div>}
        </div>
        <div className="fields">{p.fields.map((f: any) => <Field key={f.id} f={f} value={answers[f.id]} set={set} readonly={readonly} opened={opened} openHint={openHint} />)}</div>
      </section>;
    })}
  </>;
}
function Field({ f, value, set, readonly, opened = [], openHint }: { f: any; value: any; set: (k: string, v: string | string[]) => void; readonly: boolean; opened?: string[]; openHint?: (k: string) => void }) {
  const id = 'f-' + f.id.replace(/\./g, '-');
  return <div className="field-wrap"><FieldInput f={f} id={id} value={value} set={set} readonly={readonly} />{f.check && <RuleCheck f={f} value={value} shown={opened.includes('chk:' + f.id)} show={() => openHint?.('chk:' + f.id)} />}</div>;
}
/* 规则检查：只核对数字或选择的标签，不评价自由文字。 */
function RuleCheck({ f, value, shown, show }: { f: any; value: any; shown: boolean; show: () => void }) {
  const [how, setHow] = useState(false);
  const c = f.check;
  if (c.kind === 'number') {
    const r = checkNumber(c, value);
    if (r.state === 'empty') return null;
    return <div className={'rule ' + (r.state === 'ok' ? 'rule-ok' : 'rule-off')} role="status" data-testid={'rule-' + f.id}>
      <span className="rule-tag">规则检查 · 只核对数字</span>
      {r.state === 'ok' ? <span>✓ 和按方法算出的结果一致。</span> : r.state === 'nonum' ? <span>没有找到数字。这一格请写一个数字，例如百分比。</span> : r.state === 'alt' ? <span>和按方法算出的结果不一致。{r.altText}</span> : <span>你写的 {r.got}{c.unit} 和按方法算出的结果不一致，可以再算一次。</span>}
      {r.state !== 'ok' && c.explain && <button type="button" className="text-btn" aria-expanded={how} onClick={() => setHow(!how)} style={{ marginLeft: 8 }}>{how ? '收起算法' : '看算法'}</button>}
      {(r.state === 'ok' || how) && c.explain && <p className="small" style={{ marginTop: 4 }}>{c.explain}</p>}
    </div>;
  }
  const picked = Array.isArray(value) ? value : [];
  if (!shown) return <div className="rule"><button type="button" className="btn btn-sm" disabled={!picked.length} onClick={show}>对照参考标注</button> <span className="xs muted">{picked.length ? '只比较你选的标签，不评价你写的理由。' : '先选完再对照。'}</span></div>;
  const r = checkChoices(c, value);
  return <div className="rule rule-cmp" role="status" data-testid={'rule-' + f.id}>
    <span className="rule-tag">规则检查 · 只比较你选的标签和参考标注</span>
    <p className="small">{r.same ? '✓ 和参考标注一致。' : `一致 ${r.matched.length} 个；参考标注里有、你没选 ${r.missed.length} 个；你选了、参考标注没有 ${r.extra.length} 个。`}</p>
    {r.missed.length > 0 && <><b className="xs">参考标注里有、你没选：</b><ul className="small">{r.missed.map(m => <li key={m}>{m}{c.why[m] ? '：' + c.why[m] : ''}</li>)}</ul></>}
    {r.extra.length > 0 && <><b className="xs">你选了、参考标注没有：</b><ul className="small">{r.extra.map(m => <li key={m}>{m}{c.why[m] ? '：' + c.why[m] : ''}</li>)}</ul></>}
    {c.explain && <p className="small" style={{ marginTop: 4 }}><b>参考说明：</b>{c.explain}</p>}
    <p className="xs muted">参考标注由平台编写，可能有争议。你不同意时，可以在下面的文字里写出理由；看完也可以改选。</p>
  </div>;
}
function FieldInput({ f, id, value, set, readonly }: { f: any; id: string; value: any; set: (k: string, v: string | string[]) => void; readonly: boolean }) {
  if (f.kind === 'choices' && f.single) {
    /* 单选题。旧草稿里如果选了多项、或选项已不在题目里：不替用户选，也不静默删掉，提示重新确认；
       重新选之前原来的作答留在草稿里（不能保存成果、不能完成）。 */
    const issue = choiceIssue(f, value); const legacy = issue && issue.kind !== 'empty' ? issue : null;
    const cur = !legacy && Array.isArray(value) ? value[0] : '';
    return <fieldset id={id} className="field" style={{ border: 0, padding: 0, margin: 0 }}><legend className="label">{f.label}{!f.label.includes('选') && <span className="muted">（单选）</span>}</legend>
      {legacy && <p className="warn-box" role="alert" data-testid={'legacy-' + f.id} style={{ margin: '0 0 10px' }}><b>请重新确认这一题。</b>{legacy.kind === 'multi' ? `你之前的作答里这一题选了 ${legacy.picked.length} 项：${legacy.picked.join('、')}。这一题只能选一项，请在下面重新选择。` : `你之前的选择「${legacy.picked.join('、')}」已不在选项里，请在下面重新选择。`}重新选择之前，原来的作答还保留在草稿里，但不能保存成果。</p>}
      <div className="choice-list">{f.options.map((o: string) => <label className="choice" key={o}><input type="radio" name={id} value={o} disabled={readonly} checked={cur === o} onChange={() => set(f.id, [o])} /><span>{o}</span></label>)}</div></fieldset>;
  }
  if (f.kind === 'choices') {
    const v: string[] = Array.isArray(value) ? value : [];
    return <fieldset id={id} className="field" style={{ border: 0, padding: 0, margin: 0 }}><legend className="label">{f.label}{!f.label.includes('选') && <span className="muted">（可多选）</span>}</legend>
      <div className="choice-list">{f.options.map((o: string) => <label className="choice" key={o}><input type="checkbox" disabled={readonly} checked={v.includes(o)} onChange={e => set(f.id, e.target.checked ? [...v, o] : v.filter(x => x !== o))} /><span>{o}</span></label>)}</div></fieldset>;
  }
  return <label className="field" htmlFor={id}><span className="label">{f.label}{f.required === false && <span className="muted">（选填）</span>}</span>
    {f.kind === 'textarea' ? <textarea id={id} className="textarea" rows={4} readOnly={readonly} placeholder={f.placeholder} value={typeof value === 'string' ? value : ''} onChange={e => set(f.id, e.target.value)} maxLength={20000} />
      : <input id={id} className="input" readOnly={readonly} placeholder={f.placeholder} value={typeof value === 'string' ? value : ''} onChange={e => set(f.id, e.target.value)} maxLength={2000} />}</label>;
}
/* 看参考前后的变化：只列出改过的地方，两个版本都保留。 */
function Changes({ g, answers, go }: { g: any; answers: Answers; go: (s: number) => void }) {
  const has = Object.keys(answers).some(k => k.startsWith('pre.'));
  if (!has) return null;
  const show = (v: unknown) => Array.isArray(v) ? v.join('、') : typeof v === 'string' ? v.trim() : '';
  const changed = g.practice.flatMap((p: any) => p.fields.map((f: any) => ({ f, before: show(answers['pre.' + f.id]), now: show(answers[f.id]) }))).filter((x: any) => x.before !== x.now);
  return <section className="sec-card" aria-labelledby="chg-h"><h2 id="chg-h">看完参考后，你可以回去改</h2>
    <p className="small ink2">你第一次打开这一步时写的内容已经留了一份「看参考前的版本」。回去修改不会覆盖它，保存成果时两个版本都会保留。</p>
    {changed.length ? <ul className="chg">{changed.map((x: any) => <li key={x.f.id}><b className="small">{x.f.label}</b><div className="chg-row"><div><span className="xs muted">看参考前</span><p className="small pre">{x.before || '（空）'}</p></div><div><span className="xs muted">现在</span><p className="small pre">{x.now || '（空）'}</p></div></div></li>)}</ul> : <p className="small muted">还没有改动。</p>}
    <button type="button" className="btn btn-sm" style={{ marginTop: 8 }} onClick={() => go(3)}>回去修改作答</button>
  </section>;
}
export function ReferenceStep({ g, data, answers, status, checks, setChecks, go }: { g: any; data: any; answers: Answers; status: any; checks: number[]; setChecks: (c: number[]) => void; go: (s: number) => void }) {
  const r = g.reference;
  return <>
    <p className="intro">这是一份参考思路，不是唯一答案。对照看看你想到了哪些、漏了哪些。这里不打分，也不会根据关键词判断你适不适合这个岗位。</p>
    <div className="fb-legend" role="note"><b>这个体验里有三种反馈，分开看：</b>
      <ul><li><b>规则检查</b>：只核对数字和你选的标签，是机械比对。</li><li><b>参考思路</b>（本页）：平台编写的一种合理做法，不是标准答案。</li><li><b>个性化点评</b>：没有提供。系统没有分析你写的文字，也不会根据字数或关键词评价你。</li></ul></div>
    <Changes g={g} answers={answers} go={go} />
    {status.done < status.total && <p className="notice" style={{ marginTop: 14 }}>你还有 {status.total - status.done} 项没写。可以先看参考，但<b>只看不写不会生成完成记录</b>。<button className="text-btn" onClick={() => go(3)}>回去作答</button></p>}
    <section className="sec-card"><h2>参考成果</h2>{r.output.map((o: any) => <div key={o.heading} className="ref-sec"><h3>{o.heading}</h3><p className="pre">{o.text}</p></div>)}</section>
    <section className="sec-card"><h2>为什么这样想</h2><ul>{r.why.map((t: string) => <li key={t}>{t}</li>)}</ul></section>
    <section className="sec-card"><h2>其他合理的做法</h2><ul>{r.alternatives.map((t: string) => <li key={t}>{t}</li>)}</ul></section>
    <section className="sec-card"><h2>常见误区</h2><ul>{r.pitfalls.map((t: string) => <li key={t}>{t}</li>)}</ul></section>
    <section className="sec-card"><h2>真实工作中还需要的信息</h2><ul>{r.missing.map((t: string) => <li key={t}>{t}</li>)}</ul></section>
    <section className="sec-card"><h2>自查清单</h2><p className="hint" style={{ marginBottom: 8 }}>只给你自己看，不保存、不打分。</p>
      <ul className="checklist">{r.checklist.map((t: string, i: number) => <li key={t}><label className="choice"><input type="checkbox" checked={checks.includes(i)} onChange={e => setChecks(e.target.checked ? [...checks, i] : checks.filter(x => x !== i))} /><span>{t}</span></label></li>)}</ul></section>
    <section className="sec-card"><h2>你的作答</h2><AnswerList data={data} answers={answers} /></section>
  </>;
}
function WrapStep({ data, reflection, setRefl, relatedExps, items }: { data: any; reflection: Reflection; setRefl: (r: Reflection) => void; relatedExps: any[]; items: any[] }) {
  const toggle = (arr: string[], v: string, on: boolean) => on ? [...arr, v] : arr.filter(x => x !== v);
  return <>
    <p className="intro">花一分钟想想这次体验。这些回答只给你自己看，不会发给企业，也不会变成标签。</p>
    <section className="sec-card"><h2>说说你的感受</h2>
      <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}><legend className="label">做完以后，对这个岗位的了解多了吗？</legend>
        <div className="choice-list">{([['yes', '多了不少'], ['some', '多了一点'], ['no', '还是不太清楚']] as const).map(([v, l]) => <label className="choice" key={v}><input type="radio" name="understand" checked={reflection.understand === v} onChange={() => setRefl({ ...reflection, understand: v })} /><span>{l}</span></label>)}</div></fieldset>
      <fieldset className="field" style={{ border: 0, padding: 0, margin: '14px 0 0' }}><legend className="label">哪些部分让你感兴趣？（可多选）</legend>
        <div className="choice-list">{data.willDo.map((w: string) => <label className="choice" key={w}><input type="checkbox" checked={reflection.likes.includes(w)} onChange={e => setRefl({ ...reflection, likes: toggle(reflection.likes, w, e.target.checked) })} /><span>{w}</span></label>)}</div></fieldset>
      <label className="field" style={{ marginTop: 14 }}><span className="label">有没有不喜欢、或者觉得难的地方？（选填）</span><textarea className="textarea" rows={3} value={reflection.dislikes} maxLength={2000} onChange={e => setRefl({ ...reflection, dislikes: e.target.value })} /></label>
      <fieldset className="field" style={{ border: 0, padding: 0, margin: '14px 0 0' }}><legend className="label">接下来想了解什么？（可多选）</legend>
        <div className="choice-list">{([['jobs', '相关的实习和校招'], ['experiences', '其他岗位体验'], ['company', '做这类工作的企业'], ['none', '暂时不想了解更多']] as const).map(([v, l]) => <label className="choice" key={v}><input type="checkbox" checked={reflection.next.includes(v)} onChange={e => setRefl({ ...reflection, next: toggle(reflection.next, v, e.target.checked) })} /><span>{l}</span></label>)}</div></fieldset>
      <p className="hint" style={{ marginTop: 10 }}>感受会保存在这台设备上，完成时一起写进你的完成记录。</p>
    </section>
  </>;
}
function ContinueLearning({ relatedExps }: { relatedExps: any[] }) {
  return <>
    <section className="sec-card"><h2>继续学习</h2>
      {relatedExps.length > 0 ? <><p className="hint">换一个岗位或换一种难度，再用一次学到的方法。</p><Grid items={relatedExps} /></> : <p><Link href="/experiences">看看其他岗位体验 →</Link></p>}
      <p className="small muted" style={{ marginTop: 12 }}>机会库里目前只有示例信息（用来展示格式），还没有经过核验的真实岗位或赛事，所以这里不推荐投递。</p>
    </section>
  </>;
}
function SimpleTasks({ data, answers, set, readonly, heading, refViewed, onViewRef, status, done, openMats }: { data: any; answers: Answers; set: (k: string, v: string) => void; readonly: boolean; heading: React.RefObject<HTMLHeadingElement | null>; refViewed: boolean; onViewRef: () => void; status: any; done: boolean; openMats?: () => void }) {
  const [shown, setShown] = useState<number[]>([]);
  const reveal = (i: number) => { setShown(s => s.includes(i) ? s.filter(x => x !== i) : [...s, i]); onViewRef(); };
  return <>
    <div className="eyebrow">{data.direction} · 简版练习</div>
    <h1 tabIndex={-1} ref={heading}>{data.title}</h1>
    <p className="intro">简版练习只有任务和参考思路，完整引导版还在制作中。可以先自己想，也可以直接看参考思路；只看参考不会生成完成记录。</p>
    <p className="warn-box" style={{ marginTop: 14 }}>模拟工作场景：情境和数据是虚构的，不是实习，也不是真实商业任务。</p>
    <ul className="track" aria-label="进度">
      <li className="on">已浏览</li>
      <li className={refViewed ? 'on' : ''}>{refViewed ? '已看参考思路' : '未看参考思路'}</li>
      <li className={status.done === status.total ? 'on' : status.done ? 'part' : ''}>已作答 {status.done}/{status.total}</li>
      <li className={done ? 'on' : ''}>{done ? '已完成实践' : '未完成实践'}</li>
    </ul>
    {data.scene && <section className="sec-card"><h2>情境</h2><p className="pre">{data.scene}</p></section>}
    {data.tasks.map((t: any, i: number) => {
      const v = typeof answers[String(i)] === 'string' ? answers[String(i)] as string : '';
      const opt = t.options?.find((o: string) => v.startsWith(o + '：')) || '';
      const reason = opt ? v.slice(opt.length + 1) : v;
      return <section className="practice" key={i} id={'pr-t' + i}><div className="practice-h"><h2>{i + 1}. {t.title}</h2>{openMats && <button type="button" className="btn btn-sm only-narrow" onClick={openMats}>查看情境</button>}</div><p className="prompt pre">{t.prompt}</p>
        <div className="fields">
          {t.options && <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}><legend className="label">选择一项</legend><div className="choice-list">{t.options.map((o: string) => <label className="choice" key={o}><input type="radio" name={'t' + i} disabled={readonly} checked={opt === o} onChange={() => set(String(i), o + '：' + reason)} /><span>{o}</span></label>)}</div></fieldset>}
          <label className="field"><span className="label">{t.options ? '理由' : '你的作答'}</span><textarea className="textarea" rows={4} readOnly={readonly} value={reason} onChange={e => set(String(i), opt ? opt + '：' + e.target.value : e.target.value)} /></label>
          {t.options && !opt && reason && <p className="hint">还没选一项：完成时需要先选一项。</p>}
        </div>
        <div className="hints">
          <button type="button" className="btn btn-sm" aria-expanded={shown.includes(i)} onClick={() => reveal(i)}>{shown.includes(i) ? '收起参考思路' : '查看参考思路'}</button>
          {shown.includes(i) && <div className="framework pre" role="note"><b>参考思路（不是唯一答案）：</b>{'\n'}{t.reference}</div>}
        </div></section>;
    })}
  </>;
}

/* 冲突选择：两份都完整显示，选一份继续，另一份保留在「可恢复的作答」。 */
function ConflictChooser({ conflict, data, onPick }: { conflict: any; data: any; onPick: (rid: string | null) => void }) {
  const other = conflict.conflictWith;
  return <section className="sec-card" style={{ borderColor: 'var(--warn)' }} aria-labelledby="cf-h" role="region">
    <h2 id="cf-h">有两份作答，请选择继续哪一份</h2>
    <p className="small ink2">可能是你在两个页面同时修改，或者登录前在这台设备上写过。两份都没有丢：没选中的那份会放进「我的 → 可恢复的作答」，以后还能查看或恢复。选择之前，保存已暂停。</p>
    <div className="cf-grid">
      <div className="cf-col"><b>账号里的草稿</b><span className="xs muted">保存于 {dateTime(conflict.saved_at)}</span><AnswerList compact data={data} answers={conflict.answers} /><button className="btn btn-primary" onClick={() => onPick(null)}>继续用这份</button></div>
      {other ? <div className="cf-col"><b>{other.reason || '另一份作答'}</b><span className="xs muted">保存于 {dateTime(other.created_at)}</span><AnswerList compact data={data} answers={other.answers} /><button className="btn" onClick={() => onPick(other.id)}>改用这份</button></div>
        : <div className="cf-col"><b>另一份作答</b><p className="small muted">另一份已经被处理或删除。</p><button className="btn" onClick={() => onPick(null)}>继续用账号里的草稿</button></div>}
    </div>
  </section>;
}
