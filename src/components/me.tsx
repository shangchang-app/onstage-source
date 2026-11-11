'use client';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from './session';
import { Modal } from './modal';
import { AnswerList, ErrorBox, Grid, Loading, dateTime, guestSaveNote, stepsFor } from './ui';
import { MyWorks } from './output';
import { LocalError, discardDraft } from '@/lib/local-data';

export function Me() {
  const { session, api, toast, adopt } = useSession(); const router = useRouter();
  const [data, setData] = useState<any>(null), [error, setError] = useState(''), [view, setView] = useState<any>(null), [drop, setDrop] = useState<any>(null);
  const load = useCallback(() => api('mine').then(d => { setData(d); setError(''); }).catch(e => setError(e.message)), [api]);
  useEffect(() => { if (session) void load(); }, [session?.identity.stamp, load, session]);
  if (!session) return <Loading />;
  if (error) return <div className="wrap page"><ErrorBox text={error} retry={load} /></div>;
  if (!data) return <Loading />;
  const user = session.identity.userId;
  const cont = data.drafts.filter((d: any) => d.content.status === 'published');
  const off = data.drafts.filter((d: any) => d.content.status !== 'published');
  async function restore(id: string, contentId: string) { try { await api('recoveries/' + id + '/restore', {}); toast('已恢复为草稿'); router.push('/experiences/' + contentId + '/work'); } catch (e) { toast((e as Error).message, true); } }
  async function remove(id: string) { try { await api('recoveries/' + id + '/delete', {}); setView(null); toast('已删除这份作答'); void load(); } catch (e) { toast((e as Error).message, true); } }
  async function logout() { try { const r = await api('auth/logout', {}); adopt(r.identity); toast('已退出登录'); router.push('/'); } catch (e) { toast((e as Error).message, true); } }

  return <div className="wrap page">
    <div className="ph"><h1>我的</h1><p className="lede">{user ? <>当前账号 {session.identity.phone}。</> : <>你还没有登录：草稿只保存在这个浏览器里。</>}这里的内容只有你自己能看到，不会展示给企业，也没有排名。</p></div>
    {!user && (session.loginAvailable === false
      ? <div className="notice" style={{ marginBottom: 20 }}>{session.staticTrial ? '试用期间没有账号和服务器：草稿和成果都只保存在这个浏览器里，不能跨设备同步，也没有公开分享链接。' : '试用期间暂未开放登录：收藏、完成记录和跨设备继续暂不可用。成果保存在这个浏览器里。'}{guestSaveNote(session.sessionDays)}草稿和成果分开保存，清除草稿不会删除成果。建议定期导出备份。</div>
      : <div className="notice" style={{ marginBottom: 20 }}>登录后可以收藏、跨设备继续体验、保存完成记录。<Link href="/login?next=/me">去登录 →</Link></div>)}

    <section className="sec" aria-labelledby="h-cont"><div className="sec-h"><div><h2 id="h-cont">继续体验</h2><p>从上次停下的地方继续。</p></div></div>
      {cont.length ? <div className="stack">{cont.map((d: any) => <div className="list-row" key={d.contentId}>
        <div style={{ minWidth: 0 }}><b>{d.content.data.title}</b>
          <div className="small muted">{d.content.data.format === 'guided' ? (() => { const st = stepsFor(d.content.data), i = Math.min(d.progress?.step ?? 0, st.length - 1); return <>停在第 {i + 1} 步「{st[i]}」 · 已浏览 {Math.min(d.progress?.visited?.length || 0, st.length)}/{st.length} 步 · </>; })() : null}{d.progress?.referenceViewed ? '已看参考思路 · ' : ''}已作答 {d.answered?.done ?? 0}/{d.answered?.total ?? 0} · 未完成实践 · 保存于 {dateTime(d.savedAt)}</div>
          {d.conflict && <span className="badge b-warn" style={{ marginTop: 4 }}>有两份作答，需要选择</span>}
          {d.outdated && <span className="badge b-gray" style={{ marginTop: 4 }}>体验已更新，你在做旧版本，可以继续做完</span>}
        </div>
        <div className="row">{session.staticTrial && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setDrop(d)}>清除草稿</button>}<Link className="btn btn-primary" href={'/experiences/' + d.contentId + '/work'}>继续体验 →</Link></div>
      </div>)}</div> : <div className="empty">还没有进行中的体验。<Link href="/experiences">去看看岗位体验 →</Link></div>}
      {off.length > 0 && <div className="stack" style={{ marginTop: 12 }}>{off.map((d: any) => <div className="list-row" key={d.contentId}><div><b>{d.content.data.title === '这项内容暂不可用' ? '已下线的体验' : d.content.data.title}</b><div className="small muted">体验已下线，草稿保留但暂时不能继续 · 保存于 {dateTime(d.savedAt)}</div></div></div>)}</div>}
    </section>

    <MyWorks />

    {user && <section className="sec" aria-labelledby="h-rec"><div className="sec-h"><div><h2 id="h-rec">体验完成记录</h2><p>只表示完成了模拟体验，不代表实习或职业资格。</p></div></div>
      {data.records.length ? <div className="stack">{data.records.map((r: any) => <div className="list-row" key={r.id}><div><b>{r.title}</b><div className="small muted">{r.direction} · 第 {r.contentVersion} 版 · 完成于 {dateTime(r.createdAt)}</div></div><Link className="btn" href={'/records/' + r.id}>查看</Link></div>)}</div> : <div className="empty">还没有完成记录。完成一次岗位体验并保存后会出现在这里。</div>}
    </section>}

    {user && <section className="sec" aria-labelledby="h-fav"><div className="sec-h"><div><h2 id="h-fav">收藏</h2></div></div>
      {data.favorites.length ? <Grid items={data.favorites.filter((f: any) => f.data.title !== '这项内容暂不可用')} /> : <div className="empty">还没有收藏。</div>}
      {data.favorites.some((f: any) => f.data.title === '这项内容暂不可用') && <p className="small muted" style={{ marginTop: 8 }}>有 {data.favorites.filter((f: any) => f.data.title === '这项内容暂不可用').length} 项收藏已下架或暂不可用。</p>}
    </section>}

    {data.recoveries.length > 0 && <section className="sec" aria-labelledby="h-recv"><div className="sec-h"><div><h2 id="h-recv">可恢复的作答</h2><p>冲突、合并或页面失效时保留下来的作答。不会自动删除。</p></div></div>
      <div className="stack">{data.recoveries.map((r: any) => <div className="list-row" key={r.id}><div><b>{r.title}</b><div className="small muted">{r.reason} · 第 {r.content_version} 版 · {dateTime(r.created_at)}</div></div><button className="btn" onClick={() => setView(r)}>查看</button></div>)}</div>
    </section>}

    {user && <p style={{ marginTop: 32 }}><button className="btn" onClick={logout}>退出登录</button></p>}

    <Modal open={!!drop} title="清除这份草稿？" role="alertdialog" onClose={() => setDrop(null)} footer={<><button className="btn" onClick={() => setDrop(null)}>取消</button><button className="btn btn-primary btn-danger" onClick={() => { try { discardDraft(drop.contentId); setDrop(null); toast('已清除草稿，已保存的成果没有变化'); void load(); } catch (e) { setDrop(null); toast(e instanceof LocalError ? e.message + ' ' + e.recovery : (e as Error).message, true); } }}>清除草稿</button></>}>
      <p>{drop?.content.data.title}：清除后，这个体验从头开始。<b>已保存的成果不会被删除。</b>如果还没保存成果，建议先回去保存，或者先导出备份。</p>
    </Modal>
    <Modal open={!!view} title={view ? '可恢复的作答：' + view.title : ''} onClose={() => setView(null)} footer={view && <><button className="btn btn-danger" onClick={() => remove(view.id)}>删除这份</button><button className="btn btn-primary" onClick={() => restore(view.id, view.content_id)}>恢复为草稿</button></>}>
      {view && <><p className="small muted">{view.reason} · 保存于 {dateTime(view.created_at)}</p><RecoveryBody r={view} /></>}
    </Modal>
  </div>;
}
function RecoveryBody({ r }: { r: any }) {
  const [g, setG] = useState<any>(null); const { api } = useSession();
  useEffect(() => { api('experiences/' + r.content_id + '/guide').then(setG).catch(() => setG({ unavailable: true })); }, [r.content_id, api]);
  if (!g) return <p role="status">正在载入…</p>;
  if (g.unavailable) return <pre className="mine">{Object.values(r.answers).map(v => Array.isArray(v) ? v.join('、') : v).join('\n\n')}</pre>;
  return <><AnswerList data={g.data} answers={r.answers} />{g.version !== r.content_version && <p className="hint" style={{ marginTop: 8 }}>这份作答对应第 {r.content_version} 版，当前是第 {g.version} 版，题目可能不完全一样。</p>}</>;
}

export function Record({ id }: { id: string }) {
  const { session, api } = useSession(); const [r, setR] = useState<any>(null), [error, setError] = useState('');
  useEffect(() => { if (session?.identity.userId) api('records/' + id).then(setR).catch(e => setError(e.message)); }, [session?.identity.stamp, id, api, session?.identity.userId]);
  if (!session) return <Loading />;
  if (!session.identity.userId) return <div className="wrap page"><h1>请先登录</h1><p className="lede">完成记录只有本人登录后才能查看。</p><p style={{ marginTop: 16 }}><Link className="btn btn-primary" href={'/login?next=/records/' + id}>登录</Link></p></div>;
  if (error) return <div className="wrap page"><ErrorBox text={error} /></div>;
  if (!r) return <Loading />;
  const d = r.snapshot.data, g = d.guide, ref = r.reflection || {};
  const understand: Record<string, string> = { yes: '多了不少', some: '多了一点', no: '还是不太清楚' };
  const next: Record<string, string> = { jobs: '相关的实习和校招', experiences: '其他岗位体验', company: '做这类工作的企业', none: '暂时不想了解更多' };
  return <div className="wrap page" style={{ maxWidth: 860 }}>
    <div className="crumb"><Link href="/me">我的</Link> / 体验完成记录</div>
    <div className="tags"><span className="badge b-green">已完成模拟体验</span>{r.snapshot.demo && <span className="badge b-demo">示例数据</span>}</div>
    <h1 style={{ marginTop: 10 }}>{d.title}</h1>
    <p className="lede">{d.direction} · 第 {r.content_version} 版 · 完成于 {dateTime(r.created_at)}</p>
    <p className="warn-box" style={{ marginTop: 16 }}>这份记录只表示你完成了一次线上模拟体验，<b>不代表实习经历或职业资格</b>，也不是能力认证。记录只有你自己能看到，不会发给企业。</p>
    {r.current.version !== r.content_version && <p className="notice" style={{ marginTop: 12 }}>这个体验后来更新到了第 {r.current.version} 版。这份记录保存的是你完成时的第 {r.content_version} 版内容，不会随更新改变。</p>}
    {r.current.status !== 'published' && <p className="notice" style={{ marginTop: 12 }}>这个体验目前已下线，记录仍然保留。</p>}
    <section className="sec-card"><h2>你的作答</h2><AnswerList data={d} answers={r.answers} /></section>
    {g ? <section className="sec-card"><h2>参考思路</h2>{g.reference.output.map((o: any) => <div className="ref-sec" key={o.heading}><h3>{o.heading}</h3><p className="pre">{o.text}</p></div>)}
      <h3>其他合理的做法</h3><ul>{g.reference.alternatives.map((t: string) => <li key={t}>{t}</li>)}</ul></section>
      : <section className="sec-card"><h2>参考答案</h2>{d.tasks.map((t: any) => <div className="ref-sec" key={t.title}><h3>{t.title}</h3><p className="pre">{t.reference}</p></div>)}<p className="hint">参考答案只是一种思路，不是唯一标准。</p></section>}
    <section className="sec-card"><h2>你的感受</h2><dl>
      <dt className="label">了解程度</dt><dd>{understand[ref.understand] || <span className="muted">（没有填写）</span>}</dd>
      <dt className="label" style={{ marginTop: 8 }}>感兴趣的部分</dt><dd>{ref.likes?.length ? ref.likes.join('、') : <span className="muted">（没有填写）</span>}</dd>
      {ref.dislikeParts?.length > 0 && <><dt className="label" style={{ marginTop: 8 }}>不太喜欢的部分</dt><dd>{ref.dislikeParts.join('、')}</dd></>}
      <dt className="label" style={{ marginTop: 8 }}>不喜欢或觉得难的地方</dt><dd className="pre">{ref.dislikes || <span className="muted">（没有填写）</span>}</dd>
      <dt className="label" style={{ marginTop: 8 }}>接下来想了解</dt><dd>{ref.next?.length ? ref.next.map((x: string) => next[x]).join('、') : <span className="muted">（没有填写）</span>}</dd>
    </dl></section>
    <p className="row" style={{ marginTop: 24 }}><Link className="btn" href="/me">回到我的</Link><Link className="btn" href="/experiences">看看其他岗位体验</Link><Link className="btn" href="/jobs">看看实习与校招</Link></p>
  </div>;
}
