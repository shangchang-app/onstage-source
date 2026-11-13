'use client';
/* 「你的隐藏工位搭子」趣味情境探索（V1.7）。规则在 src/lib/buddy/engine.ts，题目和文案在 src/lib/buddy/config.ts，
   本机进度与题目版本在 src/lib/buddy/store.ts。不登录、不上传：进度只存在这个浏览器里，和岗位体验的草稿、成果分开。
   首页入口在 fun-entry.tsx。样式沿用全站黑白视觉的令牌（globals.css 里的 bd- 部分）。 */
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Modal } from './modal';
import { expKind, useCatalog, type Item } from './ui';
import { DISCLAIMER, PROJECT, ROLES, RULES_VERSION, SCENARIOS, TIEBREAK, USE_LIMIT, roleById, type Role, type RoleId } from '@/lib/buddy/config';
import { answeredCount, evidence, outcome, resolve, tieKey } from '@/lib/buddy/engine';
import { EMPTY, load, save, type BuddyState, type Snapshot, type Stale } from '@/lib/buddy/store';
import { samplePaths } from '@/lib/buddy/paths';
import { canSystemShare, copyShareMessage, downloadLimited, drawCard, entryUrl, iconUrl, inWeChat, shareLinkOnly, shareMessage, systemShare, toBlob, ShareError, SystemShareError } from '@/lib/buddy/share';

const TOTAL = SCENARIOS.length;
const findRole = (id: string) => ROLES.find(r => r.id === id) || null;

export function Icon({ role, size, alt = '' }: { role: Pick<Role, 'icon'>; size: number; alt?: string }) {
  const [bad, setBad] = useState(false);
  return bad ? <span className="bd-icon-miss" style={{ width: size, height: size }} role={alt ? 'img' : undefined} aria-label={alt || undefined}>{alt ? alt.slice(-1) : ''}</span>
    : <img className="bd-icon" src={iconUrl(role)} width={size} height={size} alt={alt} onError={() => setBad(true)} draggable={false} />;
}

const snapOf = (role: Role, via: string, answers: BuddyState['answers']): Snapshot => ({ rulesVersion: RULES_VERSION, role: role.id, name: role.name, line: role.line, via, evidence: evidence(answers, role.id, via), at: new Date().toISOString() });
const sameSnap = (a: Snapshot | null, b: Snapshot) => !!a && a.rulesVersion === b.rulesVersion && a.role === b.role && a.via === b.via && JSON.stringify(a.evidence) === JSON.stringify(b.evidence);

export function BuddyApp() {
  const [st, setSt] = useState<BuddyState>(EMPTY), [ready, setReady] = useState(false), [stored, setStored] = useState(true), [restored, setRestored] = useState(false);
  const [stale, setStale] = useState<Stale | null>(null), [confirm, setConfirm] = useState(false), [viewing, setViewing] = useState<Snapshot | null>(null);
  const head = useRef<HTMLHeadingElement>(null), first = useRef(true);

  useEffect(() => { const r = load(); setSt(r.state); setStored(r.available); setStale(r.stale); setRestored(r.available && !r.stale && answeredCount(r.state.answers) > 0); setReady(true); }, []);
  const update = useCallback((next: BuddyState) => { setSt(next); setRestored(false); if (stored && !save(next)) setStored(false); }, [stored]);
  // 每次换一屏，焦点移到这一屏的标题，读屏和键盘用户知道内容变了（首次载入不抢焦点）
  useEffect(() => { if (!ready) return; if (first.current) { first.current = false; return; } head.current?.focus(); window.scrollTo({ top: 0 }); }, [st.step, viewing, ready]);

  const res = useMemo(() => resolve(st.answers, st.tie), [st.answers, st.tie]);
  // 到达结果页时保存一份结果快照：以后题目改版，也按这次的样子原样显示，不重算
  useEffect(() => {
    if (st.step !== 'result' || res.status !== 'done') return;
    const snap = snapOf(roleById(res.role), res.via, st.answers);
    if (!sameSnap(st.result, snap)) update({ ...st, result: snap });
  }, [st, res, update]);

  const n = answeredCount(st.answers);
  const go = (step: BuddyState['step']) => update({ ...st, step });
  const pick = (sid: string, oid: string) => update({ ...st, answers: { ...st.answers, [sid]: oid }, result: null });
  const afterLast = () => { const r = resolve(st.answers, st.tie); go(r.status === 'tiebreak' ? 'tiebreak' : r.status === 'done' ? 'result' : st.step); };
  /* 重新开始：替换当前作答；当前（或旧版）结果移到 previous 里保留 */
  const restart = () => {
    const keep = [st.result, stale?.result].filter((x): x is Snapshot => !!x);
    const next: BuddyState = { ...EMPTY, step: 0, previous: [...keep, ...st.previous].slice(0, 5) };
    setSt(next); setStale(null); setViewing(null); setConfirm(false); setRestored(false);
    if (stored && !save(next)) setStored(false);
  };

  if (!ready) return <div className="wrap bd-page"><p className="muted">正在载入…</p></div>;
  const storageNote = !stored && <p className="bd-note" role="status">这个浏览器现在不能保存进度（可能是无痕模式或存储被关闭）。可以照常做完，但刷新页面后会从头开始。</p>;

  let body: React.ReactNode;
  if (viewing) {
    body = <PreviousResult snap={viewing} head={head} onBack={() => setViewing(null)} />;
  } else if (st.step === 'intro') {
    const firstOpen = SCENARIOS.findIndex(s => !st.answers[s.id]);
    const last = st.previous[0];
    body = <div className="bd-panel">
      <p className="bd-kicker">on stage · 趣味情境探索</p>
      <h1 ref={head} tabIndex={-1}>你的隐藏工位搭子，藏不住了。</h1>
      <p className="bd-lead">跟着一个虚构的小项目走 8 个情境，每次选一个你最可能的做法。没有标准答案，每个选项都有它的道理和代价。大约 3–5 分钟，结果并列时会多问 1 题。</p>
      <div className="bd-chat"><div className="bd-msg"><span className="bd-ava bd-ava-txt" aria-hidden="true">周</span><p className="bd-bub">{PROJECT}</p></div></div>
      <ul className="bd-facts">
        <li><b>这是趣味情境探索，不是专业人格或职业测评。</b>结果只说明你在这几个虚构情境里的选择，不代表你是什么样的人。</li>
        <li>不用登录。作答只存在这个浏览器里，不会上传，也不会出现在分享卡上。</li>
        <li>{USE_LIMIT}</li>
      </ul>
      {stale && <div className="bd-note" role="status" data-testid="stale-note">
        <b>题目已经更新过。</b>{stale.answered > 0 && <>你上次的 {stale.answered} 题作答来自旧版题目（{stale.fromVersion}），选项变了，没法接着做，也不会被换算成新结果。</>}
        {stale.result ? <>上次的结果「{stale.result.name}」按当时的题目得出，原样保留，可以继续查看。</> : null}想按新题目再做一次，可以重新开始。
      </div>}
      <div className="bd-actions">
        {stale ? <>
          {stale.result && <button className="btn" onClick={() => setViewing(stale.result)}>查看上次的结果</button>}
          <button className="btn btn-primary" onClick={() => setConfirm(true)}>按新题目重新开始</button>
        </> : n > 0 ? <>
          <button className="btn btn-primary" onClick={() => go(res.status === 'done' ? 'result' : res.status === 'tiebreak' ? 'tiebreak' : Math.max(0, firstOpen))}>{res.status === 'incomplete' ? `继续上次（已答 ${n}/${TOTAL}）` : '查看上次的结果'}</button>
          <button className="btn" onClick={() => setConfirm(true)}>重新开始</button>
        </> : <button className="btn btn-primary" onClick={() => update({ ...st, step: 0 })}>开始</button>}
      </div>
      {!stale && last && <p className="small muted" style={{ marginTop: 12 }}>之前保留的结果：<button className="bd-link" onClick={() => setViewing(last)}>{last.name}</button>（{last.rulesVersion === RULES_VERSION ? '当前题目' : '旧版题目 ' + last.rulesVersion}）</p>}
      {storageNote}
    </div>;
  } else if (typeof st.step === 'number') {
    const i = st.step, s = SCENARIOS[i], cur = st.answers[s.id], last = i === TOTAL - 1;
    body = <div className="bd-panel">
      <div className="bd-progress"><span>{i + 1} / {TOTAL} · {s.stage}</span><span className="bd-bar" aria-hidden="true"><i style={{ width: `${((i + 1) / TOTAL) * 100}%` }} /></span></div>
      {restored && i > 0 && <p className="bd-note" role="status">已接着上次的进度继续。</p>}
      <div className="bd-chat"><div className="bd-msg"><span className="bd-ava bd-ava-txt" aria-hidden="true">{s.from === '你自己' ? '我' : s.from.slice(-1)}</span><div><span className="bd-from">{s.from}</span><p className="bd-bub">{s.message}</p></div></div></div>
      <fieldset className="bd-opts">
        <legend><h1 ref={head} tabIndex={-1}>{s.ask}</h1></legend>
        {s.options.map(o => <label key={o.id} className={'bd-opt' + (cur === o.id ? ' on' : '')}>
          <input type="radio" name={'q-' + s.id} value={o.id} checked={cur === o.id} onChange={() => pick(s.id, o.id)} />
          <span>{o.text}</span></label>)}
      </fieldset>
      <div className="bd-nav">
        <button className="btn" onClick={() => go(i === 0 ? 'intro' : i - 1)}>{i === 0 ? '返回说明' : '上一题'}</button>
        <button className="btn btn-primary" disabled={!cur} onClick={() => (last ? afterLast() : go(i + 1))}>{last ? '看看是谁' : '下一题'}</button>
      </div>
      {!cur && <p className="bd-hint">选一个最接近你的做法，就能继续。</p>}
      {storageNote}
    </div>;
  } else if (st.step === 'tiebreak') {
    const pre = outcome(st.answers);
    if (pre.status !== 'tiebreak') body = <Redirect to={pre.status === 'done' ? 'result' : Math.max(0, SCENARIOS.findIndex(s => !st.answers[s.id]))} go={go} />;
    else {
      const key = tieKey(pre.candidates), cur = st.tie?.key === key ? st.tie.choice : '';
      body = <div className="bd-panel">
        <div className="bd-progress"><span>加一题 · 有 {pre.candidates.length} 只并列</span><span className="bd-bar" aria-hidden="true"><i style={{ width: '100%' }} /></span></div>
        <div className="bd-chat"><div className="bd-msg"><span className="bd-ava bd-ava-txt" aria-hidden="true">我</span><div><span className="bd-from">{TIEBREAK.from}</span><p className="bd-bub">{TIEBREAK.message}</p></div></div></div>
        <fieldset className="bd-opts">
          <legend><h1 ref={head} tabIndex={-1}>{TIEBREAK.ask}</h1></legend>
          {pre.candidates.map(id => <label key={id} className={'bd-opt' + (cur === id ? ' on' : '')}>
            <input type="radio" name="q-tiebreak" value={id} checked={cur === id} onChange={() => update({ ...st, tie: { choice: id, key }, result: null })} />
            <span>{roleById(id).tiebreak}</span></label>)}
        </fieldset>
        <div className="bd-nav"><button className="btn" onClick={() => go(TOTAL - 1)}>上一题</button><button className="btn btn-primary" disabled={!cur} onClick={() => go('result')}>看看是谁</button></div>
        {storageNote}
      </div>;
    }
  } else {
    if (res.status !== 'done') body = <Redirect to={res.status === 'tiebreak' ? 'tiebreak' : Math.max(0, SCENARIOS.findIndex(s => !st.answers[s.id]))} go={go} />;
    else body = <Result role={roleById(res.role)} via={res.via} answers={st.answers} head={head} onRestart={() => setConfirm(true)} onEdit={() => go(TOTAL - 1)} storageNote={storageNote} />;
  }

  const keepNote = (st.result || stale?.result) ? `之前的结果「${(st.result || stale?.result)!.name}」会保留在「之前的结果」里。` : '';
  return <div className="wrap bd-page">
    {body}
    <Modal open={confirm} title={stale ? '按新题目重新开始？' : '重新开始？'} role="alertdialog" onClose={() => setConfirm(false)}
      footer={<><button className="btn" onClick={() => setConfirm(false)}>先不了</button><button className="btn btn-primary" onClick={restart}>替换，重新开始</button></>}>
      <p>{stale ? `重新开始会清掉旧版题目的 ${stale.answered} 题作答，换成新题目。` : `重新开始会清掉这次的 ${n} 题作答，用新的作答替换。`}{keepNote}岗位体验的草稿和成果不受影响。</p>
    </Modal>
  </div>;
}

function Redirect({ to, go }: { to: BuddyState['step']; go: (s: BuddyState['step']) => void }) {
  useEffect(() => { go(to); }); // 状态和这一屏对不上（例如返回改了答案）时，回到正确的一屏
  return <p className="muted">正在跳转…</p>;
}

function Evidence({ list }: { list: { stage: string; text: string }[] }) {
  return <ul className="bd-ev">{list.map(e => <li key={e.stage + e.text}><span>在「{e.stage}」时，你选了</span><b>「{e.text}」</b></li>)}</ul>;
}

function Result({ role, via, answers, head, onRestart, onEdit, storageNote }: { role: Role; via: string; answers: Record<string, string | undefined>; head: React.RefObject<HTMLHeadingElement | null>; onRestart: () => void; onEdit: () => void; storageNote: React.ReactNode }) {
  const ev = evidence(answers, role.id, via);
  const [share, setShare] = useState(false);
  return <div className="bd-result">
    <div className="bd-panel">
      <p className="bd-kicker">在这次情境中，你的隐藏工位搭子是</p>
      <div className="bd-hero"><Icon role={role} size={112} alt={role.name} /><h1 ref={head} tabIndex={-1}>{role.name}</h1></div>
      <div className="bd-chat"><div className="bd-msg"><span className="bd-ava"><Icon role={role} size={26} /></span><p className="bd-bub">{role.line}</p></div></div>
      <h2 className="bd-h2">这次的依据</h2>
      <Evidence list={ev} />
      {via === 'hidden' && <p className="bd-hint">8 个情境里，你有 {SCENARIOS.filter(s => s.options.find(o => o.id === answers[s.id])?.detour).length} 次选了跳出原有方向的做法。</p>}
      <dl className="bd-two"><div><dt>表现出来的长处</dt><dd>{role.strength}</dd></div><div><dt>可能的取舍</dt><dd>{role.tradeoff}</dd></div></dl>
      <div className="bd-actions"><button className="btn btn-primary" onClick={() => setShare(true)}>分享给好友</button><button className="btn" onClick={onEdit}>返回修改</button><button className="btn" onClick={onRestart}>重新探索</button></div>
      <p className="bd-fine">{DISCLAIMER}{USE_LIMIT}</p>
      {storageNote}
    </div>
    <Recommend role={role} />
    <ShareModal role={role} open={share} onClose={() => setShare(false)} />
  </div>;
}

/* 保留下来的结果（同版本或旧版本），按保存时的样子原样显示，不重算 */
function PreviousResult({ snap, head, onBack }: { snap: Snapshot; head: React.RefObject<HTMLHeadingElement | null>; onBack: () => void }) {
  const role = findRole(snap.role); const [share, setShare] = useState(false);
  return <div className="bd-result">
    <div className="bd-panel" data-testid="previous-result">
      <p className="bd-kicker">之前保留的结果 · {snap.rulesVersion === RULES_VERSION ? '当前题目' : '旧版题目 ' + snap.rulesVersion}{snap.at ? ' · ' + new Date(snap.at).toLocaleDateString('zh-CN') : ''}</p>
      <div className="bd-hero">{role && <Icon role={role} size={96} alt={snap.name} />}<h1 ref={head} tabIndex={-1}>{snap.name}</h1></div>
      {snap.line && <p className="bd-bub solo">{snap.line}</p>}
      {snap.evidence.length > 0 && <><h2 className="bd-h2">当时的依据</h2><Evidence list={snap.evidence} /></>}
      <p className="bd-note">这是按当时的题目得出的结果，原样保留，没有用新题目重新计算。</p>
      <div className="bd-actions">{role && <button className="btn btn-primary" onClick={() => setShare(true)}>分享给好友</button>}<button className="btn" onClick={onBack}>返回</button></div>
      <p className="bd-fine">{DISCLAIMER}{USE_LIMIT}</p>
    </div>
    {role && <ShareModal role={role} open={share} onClose={() => setShare(false)} />}
  </div>;
}

/* 推荐：明确标出「简版练习」还是「完整实践」。推荐的是简版练习时，再给一个完整实践。体验不存在或没发布时，只给体验列表，不做假入口。 */
const KIND_LABEL = { simple: ['简版练习', '只有任务和参考思路，没有复盘，也不生成成果'], quick: ['完整实践 · 短版', '收到任务、看材料、给方案、看复盘'], deep: ['完整实践 · 完整版', '示范、独立练习、迁移练习，最后保存成果'] } as const;
function RecCard({ item, why }: { item: Item; why: string }) {
  const k = expKind(item.data), [label, desc] = KIND_LABEL[k];
  return <Link className={'bd-rec-card ' + k} href={'/experiences/' + item.id + '/'} data-kind={k}>
    <span className="bd-rec-kind">{label}<em>约 {item.data.minutes} 分钟 · {item.data.direction}</em></span>
    <b>{item.data.title}</b><span className="small ink2">{why}</span><span className="xs muted">{desc}</span>
  </Link>;
}
function Recommend({ role }: { role: Role }) {
  const { items, loading, error } = useCatalog();
  const find = (id?: string) => items.find(i => i.kind === 'experience' && i.id === id && i.status === 'published');
  const main = find(role.rec.id), full = role.rec.full && main && expKind(main.data) === 'simple' ? find(role.rec.full.id) : undefined;
  return <section className="bd-panel bd-rec" aria-labelledby="bd-rec-h">
    <h2 className="bd-h2" id="bd-rec-h">想在模拟工作场景里试试这种做法？</h2>
    {loading ? <p className="muted small">正在找相关的岗位体验…</p> : main ? <div className="bd-rec-list">
      <RecCard item={main} why={role.rec.why} />
      {full && <RecCard item={full} why={role.rec.full!.why} />}
    </div> : <p className="small ink2">{error ? '岗位体验暂时没加载出来。' : '这个方向的体验还在制作。'}<Link href="/experiences/">看看现在能做的岗位体验 →</Link></p>}
    <p className="small" style={{ marginTop: 12 }}><Link href="/experiences/">也看看其他方向 →</Link> <span className="muted">结果只是这次的选择，不限定你适合什么工作。</span></p>
  </section>;
}

/* 分享卡：分享给好友（系统分享面板，优先带图片）、复制链接、下载图片；微信等 App 内置浏览器里在图片上方提示长按图片发送或保存。
   分享内容只有角色、一句话和入口链接，不带作答。不显示假的「分享成功」：系统分享面板关掉以后，只说交给了哪里。
   每次点击只调一次系统分享：带图片分享失败后，显示「仅分享链接」，由用户再点一次；用户取消不重试、不提示。 */
function ShareModal({ role, open, onClose }: { role: Role; open: boolean; onClose: () => void }) {
  const [state, setState] = useState<'idle' | 'busy' | 'ok' | 'fail'>('idle'), [url, setUrl] = useState(''), [blob, setBlob] = useState<Blob | null>(null), [err, setErr] = useState(''), [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null), [manual, setManual] = useState(false), [linkRetry, setLinkRetry] = useState(false);
  const limited = useMemo(() => downloadLimited(), []), wechat = useMemo(() => inWeChat(), []), sys = useMemo(() => canSystemShare(), []);
  const link = useMemo(() => (open ? entryUrl() : null), [open]);
  const note = useRef<HTMLParagraphElement>(null);
  useEffect(() => { if (msg) note.current?.scrollIntoView?.({ block: 'nearest' }); }, [msg]); // 手机上提示在按钮下面，出现时滚到能看见
  const file = `on-stage-buddy-${role.id}.png`; // 用英文文件名：部分浏览器遇到中文文件名会退回成「download」
  useEffect(() => {
    if (!open) return; let alive = true, made = '';
    setState('busy'); setMsg(null); setErr(''); setManual(false); setLinkRetry(false);
    // 微信等内置浏览器里用 data: 图片，长按才有「发送给朋友 / 保存图片」；其他浏览器用 blob: 地址
    drawCard(role).then(async c => { const b = await toBlob(c); return { b, src: limited ? c.toDataURL('image/png') : (made = URL.createObjectURL(b)) }; })
      .then(({ b, src }) => { if (alive) { setBlob(b); setUrl(src); setState('ok'); } })
      .catch(e => { if (alive) { setErr(e instanceof ShareError ? e.message : '图片生成失败'); setState('fail'); } });
    return () => { alive = false; if (made) URL.revokeObjectURL(made); setUrl(''); setBlob(null); };
  }, [open, role, limited]);
  const download = () => { const a = document.createElement('a'); a.href = url; a.download = file; document.body.appendChild(a); a.click(); a.remove(); setMsg({ text: '已经交给浏览器下载。如果没有看到文件，可以长按上面的图片保存，或者直接截图。' }); };
  const copy = async () => { setManual(false); if (await copyShareMessage(role)) setMsg({ text: '已复制一句话和探索链接，可以粘贴到微信、QQ 等聊天里发给好友。链接里不带你的答案。' }); else { setManual(true); setMsg({ text: '这个浏览器不能自动复制，请长按下面的文字手动复制。', bad: true }); } };
  const share = async () => {
    if (!blob) return; setMsg(null); setLinkRetry(false);
    try {
      const r = await systemShare(role, blob, file);
      if (r === 'file') setMsg({ text: '已把分享卡交给你选的 App，发出去之前可以在那个 App 里确认。' });
      else if (r === 'link') setMsg({ text: '这个浏览器分享不了图片，已改为分享探索链接。想发图片可以先下载，再从相册发送。' });
      else if (r === 'unsupported') { setMsg({ text: '这个浏览器调不起分享面板，可以复制链接发给好友，或者下载图片后从相册发送。', bad: true }); }
    } catch (e) {
      // 带图片的分享没成功：不自动重试，给出「仅分享链接」按钮，由用户再点一次
      if (e instanceof SystemShareError && e.mode === 'file' && link) { setLinkRetry(true); setMsg({ text: '带图片的分享没有打开。可以点「仅分享链接」再试一次，或者复制链接发给好友，也可以下载图片后从相册发送。', bad: true }); }
      else setMsg({ text: '系统分享没有打开，可以复制链接发给好友，或者下载图片后从相册发送。', bad: true });
    }
  };
  const shareLink = async () => {
    setMsg(null);
    try {
      const r = await shareLinkOnly(role);
      if (r === 'link') { setLinkRetry(false); setMsg({ text: '已把探索链接交给你选的 App，发出去之前可以在那个 App 里确认。' }); }
      else if (r === 'unsupported') setMsg({ text: '这个浏览器调不起分享面板，可以复制链接发给好友。', bad: true });
    } catch { setMsg({ text: '仅分享链接也没有打开，可以复制链接发给好友，或者下载图片后从相册发送。', bad: true }); }
  };
  return <Modal open={open} title="分享给好友" onClose={onClose} wide
    footer={<button className="btn" onClick={onClose}>关闭</button>}>
    {state === 'busy' && <p className="muted" role="status">正在生成图片…</p>}
    {state === 'ok' && <>
      {/* 内置浏览器的长按提示放在图片上方：手机上打开弹窗第一屏就能看到。不同微信版本的长按菜单不一样，用条件式说法 */}
      {limited && <p className="bd-note bd-note-top" role="status" data-testid="share-inapp">{wechat
          ? <>在微信里：<b>长按下面的图片</b>，如果菜单里有「发送给朋友」，可以直接发给好友；没有的话选「保存图片」，再从相册发送。也可以点右上角「···」分享这个页面，或者复制链接、直接截图。</>
          : <>这个 App 里的浏览器可能不支持直接下载和分享：可以<b>长按下面的图片</b>保存后发送，或者用右上角菜单分享这个页面，也可以复制链接、直接截图。</>}</p>}
      <img className={'bd-share-img' + (limited ? ' compact' : '')} src={url} alt={`分享卡：${role.name}——${role.line}`} />
      {/* 操作紧跟在图片下面：手机上弹窗比屏幕高，放在底部要滚到最后才看得到 */}
      <div className="bd-share-actions">
        {sys && <button className="btn btn-primary" onClick={share} data-testid="share-system">分享给好友</button>}
        {linkRetry && <button className="btn" onClick={shareLink} data-testid="share-link-only">仅分享链接</button>}
        {link && <button className="btn" onClick={copy}>复制链接</button>}
        {!limited && <button className="btn" onClick={download}>下载图片</button>}
      </div>
      {msg && <p ref={note} className={'bd-note' + (msg.bad ? ' bad' : '')} role="status" data-testid="share-msg">{msg.text}</p>}
      {manual && <textarea className="textarea" readOnly rows={3} value={shareMessage(role)} aria-label="要分享的文字和链接" onFocus={e => e.currentTarget.select()} data-testid="share-manual" />}
      {!limited && !sys && <p className="small muted">这个浏览器调不起系统分享面板：可以复制链接发给好友，或者下载图片后从相册发送。</p>}
      <p className="small muted">卡片和分享内容里只有角色、一句话、入口和说明，不包含你的作答。{link ? '二维码和链接打开的是探索首页，不带你的答案。' : '当前网址是本机或测试地址，卡片上没有放二维码，也没有可分享的链接。'}</p>
    </>}
    {state === 'fail' && <>
      <p className="bd-note bad" role="alert">{err}，没能生成图片。可以直接截图下面这张卡片。</p>
      <ShotCard role={role} />
    </>}
  </Modal>;
}

/* 截图用的卡片视图（图片生成失败时显示）：和分享卡内容一致，不含作答。 */
export function ShotCard({ role }: { role: Role }) {
  const url = entryUrl();
  return <div className="bd-shot" data-testid="shot-card">
    <b className="bd-shot-brand">on stage</b><span className="bd-shot-sub">探索工作，也探索自己。</span>
    <div className="bd-shot-main"><Icon role={role} size={96} alt={role.name} /><b>{role.name}</b><p>{role.line}</p><small>{DISCLAIMER}</small></div>
    <span className="bd-shot-url">{url ? url.replace(/^https:\/\//, '') : '在 on stage 看看你的隐藏工位搭子'}</span>
  </div>;
}

/* 开发验收页：展示全部 13 个结果（含隐藏角色）、示例依据和分享卡。不在导航和首页出现，robots 禁止收录。 */
export function BuddyGallery() {
  const [open, setOpen] = useState<Role | null>(null);
  const paths = useMemo(() => samplePaths(), []);
  return <div className="wrap bd-page bd-gallery">
    <div className="bd-panel">
      <p className="bd-kicker">开发验收页 · 不对外展示 · 题目版本 {RULES_VERSION}</p>
      <h1>隐藏工位搭子 · 全部 13 个结果</h1>
      <p className="small ink2">下面每张卡的「依据」用的是规则表里该角色的<b>示例答题路径</b>（标为示例），不是任何用户的真实选择。</p>
    </div>
    <div className="bd-grid">{ROLES.map(r => <GalleryCard key={r.id} role={r} a={paths[r.id]?.a} onShare={() => setOpen(r)} />)}</div>
    <p className="small muted" style={{ marginTop: 16 }}>动物图标：11 个来自 Noto Emoji（Apache License 2.0，见 /buddy/NOTICE.txt）；边牧和鸭嘴兽为 on stage 自制，不是 Noto 官方资源。</p>
    {open && <ShareModal role={open} open onClose={() => setOpen(null)} />}
  </div>;
}
function GalleryCard({ role, a, onShare }: { role: Role; a?: Record<string, string | undefined>; onShare: () => void }) {
  const o = a ? outcome(a) : null;
  const ev = a && o?.status === 'done' ? evidence(a, role.id, o.via) : [];
  const pos = (sid: string, oid?: string) => { const s = SCENARIOS.find(x => x.id === sid)!; return s.id.toUpperCase() + '·' + (s.options.findIndex(x => x.id === oid) + 1); };
  return <article className="bd-panel bd-gcard" data-role={role.id}>
    <div className="bd-hero sm"><Icon role={role} size={72} alt={role.name} /><h2>{role.name}</h2></div>
    <p className="bd-bub solo">{role.line}</p>
    <p className="xs muted"><span className="badge b-demo">示例</span> 依据（示例路径 {a ? SCENARIOS.map(x => pos(x.id, a[x.id])).join(' ') : '—'}，数字是第几个选项）</p>
    <Evidence list={ev} />
    <dl className="bd-two"><div><dt>长处</dt><dd>{role.strength}</dd></div><div><dt>取舍</dt><dd>{role.tradeoff}</dd></div></dl>
    <p className="xs muted">推荐：{role.rec.id}{role.rec.full ? ' + 完整实践 ' + role.rec.full.id : ''}</p>
    <button className="btn btn-sm" onClick={onShare}>看分享卡</button>
  </article>;
}
