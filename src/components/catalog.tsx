'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useSession } from './session';
import { Modal } from './modal';
import { Card, Demo, ErrorBox, Grid, KindBadge, Loading, STEPS, StatusBadge, date, daysLeft, guestSaveNote, routes, useCatalog, type Item } from './ui';

export function Home() {
  const { items, error, loading } = useCatalog();
  const exps = items.filter(i => i.kind === 'experience').sort((a, b) => (a.data.format === 'guided' ? 0 : 1) - (b.data.format === 'guided' ? 0 : 1));
  const featured = exps.find(i => i.data.format === 'guided');
  const jobs = items.filter(i => i.kind === 'job' && i.status === 'published').slice(0, 3);
  const events = items.filter(i => i.kind === 'event' && i.status === 'published').slice(0, 3);
  return <>
    <div className="wrap hero">
      <div>
        <span className="pill"><i aria-hidden="true" />AI · 出海 · 互联网 · 大学生免费</span>
        <h1>找到机会，<br />提前<span className="mark">上场</span>。</h1>
        <p className="promise">不用等到实习，先体验一次真实岗位场景。</p>
        <p className="hero-sub">利用课余时间，在线做一次模拟的岗位任务：认识岗位、看示范、动手试、对照参考思路。不用离校，也不用先拿到实习名额。</p>
        <div className="row">
          <Link className="btn btn-primary btn-lg" href={featured ? '/experiences/' + featured.id : '/experiences'}>试试示范体验 →</Link>
          <Link className="btn btn-lg" href="/events">找实习和赛事</Link>
        </div>
      </div>
      <div className="feature" aria-label="示范体验">
        <div className="tags"><span className="badge b-orange">线上岗位体验</span><span className="badge b-blue">平台制作</span><span className="badge b-demo">示例数据</span></div>
        <div className="eyebrow" style={{ marginTop: 12 }}>{featured?.data.direction || '跨境电商运营'}</div>
        <h2>{featured?.data.title || '商品退货率上升，先查什么？'}</h2>
        <p className="muted small">约 {featured?.data.minutes || 45} 分钟 · 零基础可做 · 可以随时暂停</p>
        <ol className="flow">{['认识岗位：这份工作每周在做什么', '看一次示范：一个做完的小案例', '接到模拟任务：数据、评论和变更记录', '跟着尝试：分步提示、术语解释', '对照参考思路：不打分，只自查', '总结与下一步：相关岗位和机会'].map(s => { const [a, b] = s.split('：'); return <li key={a}><span><b>{a}</b>　{b}</span></li>; })}</ol>
        <p className="xs muted" style={{ marginTop: 12 }}>模拟工作场景，不是实习经历、能力认证或录用保证。</p>
      </div>
    </div>
    {error ? <div className="wrap"><ErrorBox text={error} /></div> : loading ? <Loading /> : <div className="wrap">
      <section className="sec"><div className="sec-h"><div><span className="sec-no">01</span><h2>岗位体验</h2><p>一次一个岗位，用 10–60 分钟走进它的日常。</p></div><Link className="link-more" href="/experiences">全部岗位体验 →</Link></div><Grid items={exps.slice(0, 3)} /></section>
      <section className="sec"><div className="sec-h"><div><span className="sec-no">02</span><h2>实习与校招</h2><p>体验不是投递门槛。看清职责和要求，再决定下一步。</p></div><Link className="link-more" href="/jobs">全部岗位 →</Link></div><Grid items={jobs} all={items} /></section>
      <section className="sec"><div className="sec-h"><div><span className="sec-no">03</span><h2>黑客松与企业商赛</h2><p>和队友一起，把想法做成能展示的方案。</p></div><Link className="link-more" href="/events">全部赛事 →</Link></div><Grid items={events} /></section>
      <div className="strip"><div><b>企业合作</b><p className="muted small">把岗位日常制作成学生可以参与的线上体验，帮助更多学生了解企业和工作，为招聘做准备。</p></div><Link className="btn" href="/cooperate">了解企业合作 →</Link></div>
    </div>}
  </>;
}

function LibSwitch({ cur }: { cur: 'events' | 'jobs' }) {
  return <nav className="lib-switch" aria-label="机会库分类">
    <Link href="/events" aria-current={cur === 'events' ? 'page' : undefined}><b>赛事</b><span>黑客松 · 企业商赛</span></Link>
    <Link href="/jobs" aria-current={cur === 'jobs' ? 'page' : undefined}><b>实习与校招</b><span>企业招聘信息</span></Link>
  </nav>;
}

export function Catalog({ kind }: { kind: string }) {
  const { items, error, loading } = useCatalog();
  const [q, setQ] = useState(''), [type, setType] = useState(''), [status, setStatus] = useState('published'), [city, setCity] = useState(''), [direction, setDirection] = useState('');
  const source = items.filter(i => i.kind === kind);
  const typeOf = (i: Item) => kind === 'job' ? i.data.jobType : kind === 'event' ? i.data.eventType : i.data.format;
  const filtered = source.filter(i => (!['job', 'event'].includes(kind) || status === '' || i.status === status) && (!type || typeOf(i) === type) && (!city || i.data.city === city) && (!direction || i.data.direction === direction) && [i.data.title, i.data.direction, i.data.city, i.data.about, i.data.organizer].join(' ').toLowerCase().includes(q.toLowerCase()));
  if (kind === 'experience') filtered.sort((a, b) => (a.data.format === 'guided' ? 0 : 1) - (b.data.format === 'guided' ? 0 : 1));
  const head: Record<string, [string, string]> = {
    job: ['实习与校招', '企业提供、平台审核后发布。投递在企业官网或招聘邮箱完成，上场不收简历。以下均为示例岗位。'],
    event: ['黑客松与企业商赛', '每项都附来源和截止时间，报名在主办方页面完成。以下均为示例信息。'],
    experience: ['岗位体验', '线上岗位体验：用模拟的工作场景，提前做一次岗位上的事。自愿参加，不是实习，也不影响投递。'],
    company: ['企业', '了解企业在做什么、有哪些职业方向。以下均为示例企业，上场与它们没有真实合作关系。']
  };
  const types = kind === 'job' ? [['intern', '实习'], ['campus', '校招']] : kind === 'event' ? [['hack', '黑客松'], ['competition', '企业商赛']] : kind === 'experience' ? [['guided', '完整引导'], ['simple', '简版练习']] : [];
  return <div className="wrap page">
    {(kind === 'job' || kind === 'event') && <LibSwitch cur={kind === 'job' ? 'jobs' : 'events'} />}
    <div className="ph"><h1>{head[kind][0]}</h1><p className="lede">{head[kind][1]}</p></div>
    {kind === 'experience' && <div className="notice" style={{ marginBottom: 8 }}><b>完整引导</b>：6 步流程，30–60 分钟，可以暂停后继续。<b>简版练习</b>：只有任务和参考思路，完整引导版本还在制作中。</div>}
    <div className="filters">
      <label>搜索<input className="input" type="search" placeholder="名称、方向、城市" value={q} onChange={e => setQ(e.target.value)} /></label>
      {types.length > 0 && <label>类型<select className="select" value={type} onChange={e => setType(e.target.value)}><option value="">全部类型</option>{types.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>}
      {['job', 'event'].includes(kind) && <><label>状态<select className="select" value={status} onChange={e => setStatus(e.target.value)}><option value="published">{kind === 'job' ? '可投递' : '可报名'}</option><option value="expired">已截止</option><option value="">全部</option></select></label>
        <label>城市 / 远程<select className="select" value={city} onChange={e => setCity(e.target.value)}><option value="">全部地点</option>{[...new Set(source.map(i => i.data.city))].map(c => <option key={c}>{c}</option>)}</select></label></>}
      {['job', 'experience'].includes(kind) && <label>职业方向<select className="select" value={direction} onChange={e => setDirection(e.target.value)}><option value="">全部方向</option>{[...new Set(source.map(i => i.data.direction))].map(c => <option key={c}>{c}</option>)}</select></label>}
    </div>
    <p className="muted small" aria-live="polite" style={{ marginBottom: 14 }}>共 {filtered.length} 项</p>
    {error ? <ErrorBox text={error} /> : loading ? <Loading /> : <Grid items={filtered} all={items} />}
  </div>;
}

export function Detail({ id }: { id: string }) {
  const { items } = useCatalog();
  const [item, setItem] = useState<Item | null>(null), [error, setError] = useState('');
  useEffect(() => { fetch('/api/content/' + id, { cache: 'no-store' }).then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d.error); setItem(d); }).catch(e => setError(e.message)); }, [id]);
  if (error) return <div className="wrap page"><ErrorBox text={error} /></div>;
  if (!item) return <Loading />;
  return <DetailView item={item} items={items} />;
}

/* 详情页内容。preview=true 用于后台预览：显示尚未发布的内容，所有按钮不可操作。 */
export function DetailView({ item, items, preview }: { item: Item; items: Item[]; preview?: boolean }) {
  const { api, session, toast } = useSession(); const id = item.id;
  const [saved, setSaved] = useState(false);
  const [apply, setApply] = useState<any>(null), [report, setReport] = useState(false), [reason, setReason] = useState('');
  useEffect(() => { if (!preview && session?.identity.userId) api('mine').then(d => setSaved(d.favorites.some((i: Item) => i.id === id))).catch(() => {}); }, [session?.identity.stamp, id, api, session?.identity.userId, preview]);
  async function favorite() {
    if (!session?.identity.userId) { window.location.href = '/login?next=' + encodeURIComponent(location.pathname); return; }
    try { const r = await api('favorites/' + id, { on: !saved }); setSaved(r.saved); toast(r.saved ? '已收藏，可在「我的」查看' : '已取消收藏'); } catch (e) { toast((e as Error).message, true); }
  }
  if (item.kind === 'experience') return <ExperienceDetail item={item} items={items} preview={preview} />;
  const d = item.data; const co = items.find(i => i.id === item.companyId);
  if (!preview && !['published', 'expired'].includes(item.status)) return <div className="wrap page"><h1>这项内容{({ offline: '已下架', pending: '正在等待企业重新确认' } as any)[item.status] || '暂不可用'}</h1><p className="lede">当前不能报名或投递。你的收藏、草稿和完成记录仍然保留。</p><p style={{ marginTop: 16 }}><Link className="btn" href="/me">查看我的内容 →</Link></p></div>;
  const relExps = items.filter(i => i.kind === 'experience' && (d.related?.includes(i.id) || (item.kind === 'company' && i.companyId === id)));
  return <div className={preview ? '' : 'wrap page'}>
    {preview ? <p className="notice" style={{ marginBottom: 14 }}>预览：这是学生将看到的样子（使用表单里尚未保存的内容）。按钮在预览中不可用。</p> : <div className="crumb"><Link href={'/' + routes[item.kind]}>{({ job: '实习与校招', event: '赛事', company: '企业' } as any)[item.kind]}</Link> / 详情</div>}
    <div className="detail"><article>
      <div className="tags"><KindBadge item={item} /><StatusBadge item={item} /><Demo on={item.demo} /></div>
      <h1 style={{ fontSize: 'clamp(26px,3.6vw,36px)', fontWeight: 900, marginTop: 10 }}>{d.title}</h1>
      {co && <p className="ink2" style={{ marginTop: 6 }}><Link href={'/companies/' + co.id}>{co.data.title}</Link> · {d.direction}</p>}
      {item.demo && <p className="warn-box" style={{ marginTop: 14 }}>示例内容：不代表真实企业、真实招聘或真实赛事，也不代表上场与该企业有合作。</p>}
      {item.kind === 'job' && <>
        <div className="panel" style={{ marginTop: 18 }}><div className="panel-b"><dl className="kv">
          <dt>招聘类型</dt><dd>{d.jobType === 'intern' ? '实习' : '校招'}</dd><dt>工作地点</dt><dd>{d.city}</dd><dt>薪资</dt><dd>{d.salary || '企业未提供'}</dd>
          {d.jobType === 'intern' ? <><dt>每周到岗</dt><dd>{d.days || '以企业要求为准'}</dd><dt>实习时长</dt><dd>{d.duration || '以企业要求为准'}</dd></> : <><dt>面向届别</dt><dd>{d.graduation || '以企业要求为准'}</dd></>}
          <dt>投递截止</dt><dd>{date(d.deadline)}</dd><dt>信息来源</dt><dd>{d.source}</dd><dt>最近更新</dt><dd>{date(item.updatedAt)}</dd>
        </dl></div></div>
        <section className="block" style={{ marginTop: 18 }}><h2>岗位职责</h2><p className="pre">{d.duties}</p></section>
        <section className="block"><h2>任职要求</h2><p className="pre">{d.requirements}</p></section>
        {co && <section className="block"><h2>关于{co.data.title}</h2><p>{co.data.about}</p></section>}
      </>}
      {item.kind === 'event' && <>
        <div className="panel" style={{ marginTop: 18 }}><div className="panel-b"><dl className="kv"><dt>主办方</dt><dd>{d.organizer}</dd><dt>地点</dt><dd>{d.city}</dd><dt>报名截止</dt><dd>{date(d.deadline)}</dd><dt>参赛要求</dt><dd>{d.eligibility}</dd><dt>奖励</dt><dd>{d.prize}</dd><dt>信息来源</dt><dd>{d.source}</dd></dl></div></div>
        <section className="block" style={{ marginTop: 18 }}><h2>关于这次机会</h2><p>{d.about}</p></section>
      </>}
      {item.kind === 'company' && <>
        <section className="block" style={{ marginTop: 18 }}><h2>关于企业</h2><p>{d.about}</p><p className="muted" style={{ marginTop: 6 }}>{d.industry} · {d.size}</p></section>
        <section className="block"><h2>业务与职业方向</h2><div className="tags">{d.directions.map((x: string) => <span className="tag" key={x}>{x}</span>)}</div></section>
        <section className="block"><h2>在招岗位</h2><Grid items={items.filter(i => i.kind === 'job' && i.companyId === id && i.status === 'published')} all={items} /></section>
        <section className="block"><h2>合作说明</h2><p>{d.cooperation}</p></section>
      </>}
      {relExps.length > 0 && <section className="block"><h2>相关岗位体验</h2><p className="muted" style={{ marginBottom: 12 }}>岗位体验自愿参加，不是报名或投递的前提，也不代表面试或录用承诺。</p><Grid items={relExps} /></section>}
    </article>
    {item.kind !== 'company' && <aside className="side panel"><div className="panel-b stack">
      {item.status === 'published' ? <><div><b style={{ fontSize: 34, color: 'var(--accent)' }} className="tnum">{daysLeft(d.deadline)}</b> <span className="muted">天后截止</span></div>
        <button className="btn btn-primary btn-block" disabled={preview} onClick={async () => { try { setApply(await api('apply/' + id, {})); } catch (e) { toast((e as Error).message, true); } }}>{item.kind === 'job' ? '前往企业官网投递 ↗' : '去主办方页面报名 ↗'}</button></>
        : <><div className="warn-box">已过截止时间（{date(d.deadline)}），投递和报名入口已关闭。</div><button className="btn btn-block" disabled>入口已关闭</button></>}
      {session?.loginAvailable === false && !session.identity.userId ? <p className="xs muted">试用期间暂未开放登录，收藏功能暂不可用。浏览和查看投递方式不用登录。上场不收简历，跳转不会记为「已投递」。</p> : <>
      <button className="btn btn-block" disabled={preview} onClick={favorite} aria-pressed={saved}>{saved ? '已收藏 · 点击取消' : '收藏'}</button>
      <p className="xs muted">浏览和查看投递方式不用登录；收藏需要登录。上场不收简历，跳转不会记为「已投递」。</p></>}
      {item.kind === 'job' && !preview && <button className="text-btn small" onClick={() => setReport(true)}>信息失效或有误？反馈给我们</button>}
    </div></aside>}
    </div>
    <Modal open={!!apply} title="即将离开上场" onClose={() => setApply(null)} footer={<>{apply?.url ? <><button className="btn" onClick={() => setApply(null)}>取消</button><a className="btn btn-primary" href={apply.url} target="_blank" rel="noopener noreferrer">确认前往 ↗</a></> : <button className="btn btn-primary" onClick={() => setApply(null)}>知道了</button>}</>}>
      <p>{apply?.message}</p>
      <ul className="small ink2" style={{ paddingLeft: 18, margin: 0 }}><li>投递在企业或主办方的渠道完成，上场不会收到你的简历。</li><li>以对方官方页面为准。正规招聘不会向你收费。</li></ul>
    </Modal>
    <Modal open={report} title="反馈岗位信息失效或有误" onClose={() => setReport(false)} footer={<><button className="btn" onClick={() => setReport(false)}>取消</button><button className="btn btn-primary" onClick={async () => { try { await api('reports/' + id, { reason }); setReport(false); setReason(''); toast('反馈已收到，平台会核验处理'); } catch (e) { toast((e as Error).message, true); } }}>提交反馈</button></>}>
      <label className="field"><span className="label">具体情况（至少 3 个字）</span><textarea className="textarea" value={reason} onChange={e => setReason(e.target.value)} maxLength={1000} /></label>
    </Modal>
  </div>;
}

function ExperienceDetail({ item, items, preview }: { item: Item; items: Item[]; preview?: boolean }) {
  const { api, session } = useSession(); const d = item.data; const [draft, setDraft] = useState<any>(undefined);
  useEffect(() => { if (!preview && session && item.status === 'published') api('drafts/' + item.id).then(setDraft).catch(() => setDraft(null)); }, [session?.identity.stamp, item.id, item.status, api, session]);
  const guided = d.format === 'guided';
  const relJobs = items.filter(i => i.kind === 'job' && i.status === 'published' && (d.guideSummary?.relatedJobs || []).includes(i.id));
  const visited = draft?.progress?.visited?.length || 0;
  if (!preview && !['published'].includes(item.status)) return <div className="wrap page"><h1>这个岗位体验已下线</h1><p className="lede">暂时不能开始或继续。你已保存的草稿和完成记录仍然保留，可以在「我的」查看。</p><p style={{ marginTop: 16 }}><Link className="btn" href="/me">查看我的内容 →</Link></p></div>;
  return <div className={preview ? '' : 'wrap page'}>
    {preview ? <p className="notice" style={{ marginBottom: 14 }}>预览：体验详情页（使用尚未保存的内容）。</p> : <div className="crumb"><Link href="/experiences">岗位体验</Link> / 详情</div>}
    <div className="detail"><article>
      <div className="tags"><KindBadge item={item} /><Demo on={item.demo} /></div>
      <div className="eyebrow" style={{ marginTop: 12 }}>{d.direction}</div>
      <h1 style={{ fontSize: 'clamp(26px,3.6vw,36px)', fontWeight: 900, marginTop: 2 }}>{d.title}</h1>
      <p className="lede">{d.about}</p>
      <p className="warn-box" style={{ marginTop: 16 }}><b>开始前请知道：</b>这是线上模拟的工作场景，店铺、数据和材料都是虚构的。完成后得到的「体验完成记录」只表示你完成了这次模拟体验，不是实习经历、能力认证或录用保证，也不是任何岗位的投递门槛。</p>
      {guided ? <section className="block" style={{ marginTop: 20 }}><h2>流程（约 {d.minutes} 分钟，不计时，可以随时暂停）</h2>
        <ol className="flow">{STEPS.map((s, i) => <li key={s}><span><b>{s}</b>　{['这个岗位解决什么问题，典型的一周怎么过', '看一个做完的小案例：背景、材料、思考过程、示例成果', '像接到一份工作任务：角色、情况、材料、要交什么', '分步作答，有提示、术语解释和答题框架', '参考成果、其他合理做法、常见误区和自查清单', '说说你的感受，看看相关的企业、岗位和机会'][i]}</span></li>)}</ol>
      </section> : <section className="block" style={{ marginTop: 20 }}><h2>你会做的事</h2><ol>{d.tasks.map((t: any) => <li key={t.title}>{t.title}</li>)}</ol><p className="muted small" style={{ marginTop: 8 }}>简版练习：只有任务和参考思路，可以先看参考再决定要不要动手。完整引导的版本还在制作中，制作完成前不会标为完整体验。</p></section>}
      <section className="block"><h2>将体验的工作</h2><ul>{d.willDo.map((x: string) => <li key={x}>{x}</li>)}</ul></section>
      <section className="block"><h2>能学到什么</h2><ul>{d.learn.map((x: string) => <li key={x}>{x}</li>)}</ul></section>
      <section className="block"><h2>入门基础</h2><p>{d.level}。不需要相关经验，也不需要上传文件，用文字作答即可。</p></section>
      {relJobs.length > 0 && <section className="block"><h2>相关招聘</h2><p className="muted" style={{ marginBottom: 12 }}>做不做这个体验，都不影响投递。</p><Grid items={relJobs} all={items} /></section>}
    </article>
    <aside className="side panel"><div className="panel-b stack">
      <div><b style={{ fontSize: 34, color: 'var(--accent)' }} className="tnum">{d.minutes}</b> <span className="muted">分钟左右</span></div>
      {preview ? <button className="btn btn-primary btn-block" disabled>开始体验 →</button> : <Link className="btn btn-primary btn-block" href={'/experiences/' + item.id + '/work'}>{draft ? (draft.conflict ? '有两份草稿，去选择' : '继续体验') : '开始体验'} →</Link>}
      {draft && guided && <p className="small muted">上次看到：第 {(draft.progress?.step ?? 0) + 1} 步「{STEPS[draft.progress?.step ?? 0]}」· 已浏览 {visited} / 6 步</p>}
      <p className="xs muted">{session?.loginAvailable === false && !session.identity.userId ? '不用登录就能开始。' + guestSaveNote(session.sessionDays) + '试用期间暂不能保存完成记录。' : '不用登录就能开始，进度会保存在这台设备的浏览器会话里；登录后保存到账号，可以在其他设备继续。保存完成记录需要登录。'}</p>
      <p className="xs muted">你的作答默认只有你自己能看到，企业看不到。</p>
    </div></aside></div>
  </div>;
}
