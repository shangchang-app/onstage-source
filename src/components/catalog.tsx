'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useSession } from './session';
import { Modal } from './modal';
import { Demo, ErrorBox, Grid, KindBadge, Loading, SOURCE_LABEL, STEPS, StatusBadge, date, daysLeft, expKind, guestSaveNote, routes, stepsFor, useCatalog, type Item } from './ui';
import { SAMPLE_OUTPUTS, SAMPLE_PLAN, SAMPLE_REVIEW } from '@/lib/samples';

export function Home() {
  const { items, error, loading } = useCatalog();
  const exps = items.filter(i => i.kind === 'experience');
  const order = { quick: 0, deep: 1, simple: 2 } as const;
  const sorted = [...exps].sort((a, b) => order[expKind(a.data)] - order[expKind(b.data)]);
  const flagship = sorted.find(i => expKind(i.data) === 'quick');
  const full = sorted.filter(i => expKind(i.data) !== 'simple'), simple = sorted.filter(i => expKind(i.data) === 'simple');
  /* 按岗位主题分组：同一主题的短版和完整版放在一起，不当成不同岗位 */
  const themes = [...new Set(full.map(i => i.data.direction as string))].map(dir => [dir, full.filter(i => i.data.direction === dir)] as const);
  const start = flagship ? '/experiences/' + flagship.id + '/work' : '/experiences';
  return <>
    <div className="wrap hero hero-v15">
      <div>
        <span className="pill"><i aria-hidden="true" />AI · 出海 · 互联网 · 大学生免费</span>
        <h1 className="hero-h">先试着做一次工作，<br />再决定要不要走这条路。</h1>
        <p className="hero-sub">on stage 把岗位上的一个真实工作场景，做成 5–10 分钟的线上任务：收到任务、看材料、给出你的方案，马上拿到复盘。不用等实习名额，也不用先投简历。</p>
        <div className="row">
          <Link className="btn btn-primary btn-lg" href={start}>开始 8 分钟体验 →</Link>
          <Link className="btn btn-lg" href="/experiences">看看有哪些工作</Link>
        </div>
        <p className="xs muted" style={{ marginTop: 14 }}>模拟工作场景，数据是虚构的教学数据。不是实习经历、能力认证或录用保证。</p>
      </div>
      <div className="scene" aria-label="体验预览：模拟场景">
        <div className="scene-top"><span className="badge b-orange">体验预览</span><span className="xs muted">跨境电商运营 · 模拟场景</span></div>
        <div className="msg msg-sm"><div className="msg-avatar" aria-hidden="true">林</div><div className="msg-body"><div className="msg-meta"><b>林悦</b><span>运营负责人（虚构）</span><span>上午 10:12</span></div>
          <p>这三周订单涨得不错，但财务说利润反而少了快一半。下周先做什么？为什么？还缺什么信息？</p></div></div>
        <dl className="stats"><div><dt>订单</dt><dd>+42%</dd></div><div><dt>估算净利润</dt><dd>−48%</dd></div><div><dt>退货率</dt><dd>×2.3</dd></div></dl>
        <ol className="scene-flow"><li><span><b>看材料</b>利润拆解、退货原因、差评和适配表、变更记录，自己决定看哪些</span></li><li><span><b>给方案</b>组合行动、写一两句理由、说出还缺什么</span></li><li><span><b>拿复盘</b>你的选择哪里合理、漏了什么、要权衡什么、怎么验证</span></li></ol>
      </div>
    </div>
    {error ? <div className="wrap"><ErrorBox text={error} /></div> : loading ? <Loading /> : <div className="wrap">
      <section className="sec" aria-labelledby="h-exp"><div className="sec-h"><div><span className="sec-no">01</span><h2 id="h-exp">现在能完整做完的：{themes.length} 个岗位主题</h2><p>都可以随时暂停，下次在同一个浏览器里接着做。做完可以把成果保存在本机。</p></div><Link className="link-more" href="/experiences">全部岗位体验 →</Link></div>
        {themes.map(([dir, list]) => <div className="theme" key={dir}><h3 className="theme-h">{dir}<span className="small muted">{list.length > 1 ? `同一个情境，有短版和完整版两种深度（共 ${list.length} 个入口），不是 ${list.length} 个不同岗位` : '完整版'}</span></h3><Grid items={list} /></div>)}
        {simple.length > 0 && <div className="simple-list"><b className="small">简版练习</b><span className="small muted">只有任务和参考思路，没有成果页，完整版本还在制作：</span>
          <ul>{simple.map(i => <li key={i.id}><Link href={'/experiences/' + i.id}>{i.data.title}</Link> <span className="xs muted">{i.data.direction} · 约 {i.data.minutes} 分钟</span></li>)}</ul></div>}
        <p className="small muted" style={{ marginTop: 12 }}>正在规划（还不能体验）：游戏版本反馈分析。</p>
      </section>
      <section className="sec" aria-labelledby="h-get"><div className="sec-h"><div><span className="sec-no">02</span><h2 id="h-get">做完能得到什么</h2><p>一份用你自己的话写的成果。不是分数，也不是性格标签。</p></div></div>
        <div className="gets">
          <div><b>学到的方法</b><p className="small ink2">每个完整体验先看一次示范、学几个具体方法，再用另一组材料自己做，最后换一组数据练一次。</p></div>
          <div><b>分得清的反馈</b><p className="small ink2">数字和标签有规则检查；参考思路标明是参考；你写的文字不会被假装「AI 点评」。</p></div>
          <div><b>能留下来的成果</b><p className="small ink2">保存在本机，可以从「我的」重新打开、打印成 PDF、导出备份。</p></div>
        </div>
        <div className="out-previews">{SAMPLE_OUTPUTS.map(o => <figure className="out-prev" key={o.id}><figcaption><span className="badge b-demo">示例</span> <span className="xs muted">平台编写，不是真实学生作品</span></figcaption><b>{o.title}</b><span className="xs muted">{o.from}</span><dl>{o.sections.map(([h, t]) => <div key={h}><dt>{h}</dt><dd>{t}</dd></div>)}</dl></figure>)}</div>
        <SamplePlan />
      </section>
      <section className="sec" aria-labelledby="h-opp"><div className="sec-h"><div><span className="sec-no">03</span><h2 id="h-opp">实习、校招和赛事</h2></div></div>
        <div className="opp-note"><p><b>机会库里目前只有示例信息。</b>它们用来展示以后机会会怎么呈现（截止时间、来源、投递方式），不是真实岗位或赛事，所以这里不推荐投递。有经过核验的真实机会时，会单独标明来源和核验时间。</p>
          <div className="row" style={{ marginTop: 12 }}><Link className="btn" href={start}>先做一个岗位体验 →</Link><Link className="btn btn-ghost" href="/events">看看机会库（示例）</Link></div></div>
      </section>
      <div className="strip"><div><b>企业合作</b><p className="muted small">把你们的一个工作场景，做成学生能上手的短体验。看看要提供什么、最后能拿到什么。</p></div><Link className="btn" href="/cooperate">了解企业合作 →</Link></div>
    </div>}
  </>;
}

/* 平台编写的示例方案和复盘（明确标注为示例）。 */
export function SamplePlan({ withReview = true }: { withReview?: boolean }) {
  return <figure className="sample" aria-label="示例：一份学生方案和复盘">
    <figcaption><span className="badge b-demo">示例</span> <span className="small muted">平台编写的示例，不是真实学生作品</span></figcaption>
    <div className={withReview ? 'sample-grid' : ''}>
      <div><div className="eyebrow">方案 · {SAMPLE_PLAN.experience}</div>
        <h4>下周先做</h4><ol>{SAMPLE_PLAN.actions.map(a => <li key={a}>{a}</li>)}</ol>
        <h4>理由</h4><p>{SAMPLE_PLAN.reason}</p>
        <h4>还缺</h4><p>{SAMPLE_PLAN.missing.join('；')}</p></div>
      {withReview && <div className="sample-rv"><div className="eyebrow">复盘节选</div>
        <h4>合理的地方</h4><p>{SAMPLE_REVIEW.good}</p><h4>可能漏掉的</h4><p>{SAMPLE_REVIEW.gap}</p><h4>怎么验证</h4><p>{SAMPLE_REVIEW.verify}</p></div>}
    </div>
  </figure>;
}

function LibSwitch({ cur }: { cur: 'events' | 'jobs' | 'companies' }) {
  return <nav className="lib-switch" aria-label="机会库分类">
    <Link href="/events" aria-current={cur === 'events' ? 'page' : undefined}><b>赛事</b><span>黑客松 · 企业商赛</span></Link>
    <Link href="/jobs" aria-current={cur === 'jobs' ? 'page' : undefined}><b>实习与校招</b><span>企业招聘信息</span></Link>
    <Link href="/companies" aria-current={cur === 'companies' ? 'page' : undefined}><b>企业</b><span>在做什么、招哪些方向</span></Link>
  </nav>;
}

export function Catalog({ kind }: { kind: string }) {
  const { items, error, loading } = useCatalog();
  const [q, setQ] = useState(''), [type, setType] = useState(''), [status, setStatus] = useState('published'), [city, setCity] = useState(''), [direction, setDirection] = useState('');
  const source = items.filter(i => i.kind === kind);
  const typeOf = (i: Item) => kind === 'job' ? i.data.jobType : kind === 'event' ? i.data.eventType : expKind(i.data);
  const filtered = source.filter(i => (!['job', 'event'].includes(kind) || status === '' || i.status === status) && (!type || typeOf(i) === type) && (!city || i.data.city === city) && (!direction || i.data.direction === direction) && [i.data.title, i.data.direction, i.data.city, i.data.about, i.data.organizer].join(' ').toLowerCase().includes(q.toLowerCase()));
  if (kind === 'experience') { const o = { quick: 0, deep: 1, simple: 2 } as const; filtered.sort((a, b) => o[expKind(a.data)] - o[expKind(b.data)]); }
  const head: Record<string, [string, string]> = {
    job: ['实习与校招', '这里目前只有示例岗位，用来展示以后的机会会怎么呈现：不是真实招聘，不能真的投递。on stage 不收简历。'],
    event: ['黑客松与企业商赛', '这里目前只有示例赛事，用来展示格式：不是真实赛事，不能真的报名。'],
    experience: ['岗位体验', '线上岗位体验：用模拟的工作场景，提前做一次岗位上的事。自愿参加，不是实习，也不影响投递。'],
    company: ['企业', '了解企业在做什么、有哪些职业方向。以下均为示例企业，on stage 与它们没有真实合作关系。']
  };
  const types = kind === 'job' ? [['intern', '实习'], ['campus', '校招']] : kind === 'event' ? [['hack', '黑客松'], ['competition', '企业商赛']] : kind === 'experience' ? [['quick', '短版'], ['deep', '完整版'], ['simple', '简版练习']] : [];
  return <div className="wrap page">
    {(kind === 'job' || kind === 'event' || kind === 'company') && <LibSwitch cur={kind === 'job' ? 'jobs' : kind === 'company' ? 'companies' : 'events'} />}
    <div className="ph"><h1>{head[kind][0]}</h1><p className="lede">{head[kind][1]}</p></div>
    {kind === 'experience' && <div className="notice" style={{ marginBottom: 8 }}>现在有 2 个岗位主题可以完整做完：跨境电商运营、AI 产品运营。<b>短版</b>：5–10 分钟，收到任务、看材料、给方案、看复盘（跨境电商运营）。<b>完整版</b>：6 步引导，示范学方法、独立练习、迁移练习，最后保存成果，40–50 分钟。跨境电商运营的短版和完整版是同一个情境的两种深度。<b>简版练习</b>：只有任务和参考思路，完整版本还在制作中。</div>}
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
      {item.demo && <p className="warn-box" style={{ marginTop: 14 }}>示例内容：不代表真实企业、真实招聘或真实赛事，也不代表 on stage 与该企业有合作。</p>}
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
      {session?.loginAvailable === false && !session.identity.userId ? <p className="xs muted">试用期间暂未开放登录，收藏功能暂不可用。浏览和查看投递方式不用登录。on stage 不收简历，跳转不会记为「已投递」。</p> : <>
      <button className="btn btn-block" disabled={preview} onClick={favorite} aria-pressed={saved}>{saved ? '已收藏 · 点击取消' : '收藏'}</button>
      <p className="xs muted">浏览和查看投递方式不用登录；收藏需要登录。on stage 不收简历，跳转不会记为「已投递」。</p></>}
      {item.kind === 'job' && !preview && <button className="text-btn small" onClick={() => setReport(true)}>信息失效或有误？反馈给我们</button>}
    </div></aside>}
    </div>
    <Modal open={!!apply} title="即将离开 on stage" onClose={() => setApply(null)} footer={<>{apply?.url ? <><button className="btn" onClick={() => setApply(null)}>取消</button><a className="btn btn-primary" href={apply.url} target="_blank" rel="noopener noreferrer">确认前往 ↗</a></> : <button className="btn btn-primary" onClick={() => setApply(null)}>知道了</button>}</>}>
      <p>{apply?.message}</p>
      <ul className="small ink2" style={{ paddingLeft: 18, margin: 0 }}><li>投递在企业或主办方的渠道完成，on stage 不会收到你的简历。</li><li>以对方官方页面为准。正规招聘不会向你收费。</li></ul>
    </Modal>
    <Modal open={report} title="反馈岗位信息失效或有误" onClose={() => setReport(false)} footer={<><button className="btn" onClick={() => setReport(false)}>取消</button><button className="btn btn-primary" onClick={async () => { try { await api('reports/' + id, { reason }); setReport(false); setReason(''); toast('反馈已收到，平台会核验处理'); } catch (e) { toast((e as Error).message, true); } }}>提交反馈</button></>}>
      <label className="field"><span className="label">具体情况（至少 3 个字）</span><textarea className="textarea" value={reason} onChange={e => setReason(e.target.value)} maxLength={1000} /></label>
    </Modal>
  </div>;
}

function ExperienceDetail({ item, items, preview }: { item: Item; items: Item[]; preview?: boolean }) {
  const { api, session } = useSession(); const d = item.data; const [draft, setDraft] = useState<any>(undefined);
  useEffect(() => { if (!preview && session && item.status === 'published') api('drafts/' + item.id).then(setDraft).catch(() => setDraft(null)); }, [session?.identity.stamp, item.id, item.status, api, session]);
  const guided = d.format === 'guided'; const quick = expKind(d) === 'quick'; const steps = stepsFor(d);
  const deep = quick ? items.find(i => i.id === d.guideSummary?.deep) : null;
  const gs = d.guideSummary || {};
  const visited = draft?.progress?.visited?.length || 0;
  if (!preview && !['published'].includes(item.status)) return <div className="wrap page"><h1>这个岗位体验已下线</h1><p className="lede">暂时不能开始或继续。你已保存的草稿和成果仍然保留，可以在「我的」查看。</p><p style={{ marginTop: 16 }}><Link className="btn" href="/me">查看我的内容 →</Link></p></div>;
  return <div className={preview ? '' : 'wrap page'}>
    {preview ? <p className="notice" style={{ marginBottom: 14 }}>预览：体验详情页（使用尚未保存的内容）。</p> : <div className="crumb"><Link href="/experiences">岗位体验</Link> / 详情</div>}
    <div className="detail"><article>
      <div className="tags"><KindBadge item={item} /><Demo on={item.demo} /></div>
      <div className="eyebrow" style={{ marginTop: 12 }}>{d.direction}</div>
      <h1 style={{ fontSize: 'clamp(26px,3.6vw,36px)', fontWeight: 900, marginTop: 2 }}>{d.title}</h1>
      <p className="lede">{d.about}</p>
      <p className="warn-box" style={{ marginTop: 16 }}><b>开始前请知道：</b>这是线上模拟的工作场景，情境、数据和回答样例都是虚构的教学内容。做完不会得到分数或标签，也不是实习经历、能力认证或录用保证，更不是任何岗位的投递门槛。</p>
      {quick ? <section className="block" style={{ marginTop: 20 }}><h2>流程（约 {d.minutes} 分钟，不计时，可以随时暂停）</h2>
        <ol className="flow">{[['收到任务', '负责人在群里发来的一条消息'], ['看材料', '4 份短材料，自己决定看哪些、哪些是关键'], ['行动与理由', '组合下周的行动，或写自己的方案；一两句理由；还缺什么信息'], ['复盘', '根据你的选择：哪里合理、漏了什么、要权衡什么、怎么验证；再对照参考思路']].map(([a, b]) => <li key={a}><span><b>{a}</b>　{b}</span></li>)}</ol>
        {deep && <p className="small" style={{ marginTop: 12 }}>想做得更深？同一情境的 <Link href={'/experiences/' + deep.id}>{deep.data.title}</Link>（约 {deep.data.minutes} 分钟）。</p>}
      </section> : guided ? <section className="block" style={{ marginTop: 20 }}><h2>流程（约 {d.minutes} 分钟，不计时，可以随时暂停）</h2>
        <ol className="flow">{STEPS.map((s, i) => <li key={s}><span><b>{s}</b>　{['这个岗位解决什么问题，典型的一周怎么过', gs.lessons?.length ? `看一个做完的小案例（和正式任务用不同材料），学 ${gs.lessons.length} 个方法` : '看一个做完的小案例：背景、材料、思考过程、示例成果', '像接到一份工作任务：角色、情况、材料、要交什么', '分步作答，有提示、方法提醒和规则检查', '对照参考思路；看完可以回去改，改之前的版本会保留', gs.transfer ? `换一组材料做迁移练习，整理并保存你的${gs.output || '成果'}` : '说说你的感受，看看接下来学什么'][i]}</span></li>)}</ol>
      </section> : <section className="block" style={{ marginTop: 20 }}><h2>你会做的事</h2><ol>{d.tasks.map((t: any) => <li key={t.title}>{t.title}</li>)}</ol><p className="muted small" style={{ marginTop: 8 }}>简版练习：只有任务和参考思路，可以先看参考再决定要不要动手。完整引导的版本还在制作中，制作完成前不会标为完整体验。</p></section>}
      <section className="block"><h2>将体验的工作</h2><ul>{d.willDo.map((x: string) => <li key={x}>{x}</li>)}</ul></section>
      <section className="block"><h2>能学到什么</h2><ul>{d.learn.map((x: string) => <li key={x}>{x}</li>)}</ul>
        {gs.lessons?.length > 0 && <p className="small ink2" style={{ marginTop: 8 }}>方法要点：{gs.lessons.join('；')}</p>}</section>
      <section className="block"><h2>做完得到什么</h2><p>{d.deliverable || '你的文字作答和参考思路'}</p></section>
      {(() => { const cos = items.filter(i => i.kind === 'company' && i.status === 'published' && (i.data.directions || []).includes(d.direction)); return cos.length > 0 && !preview ? <section className="block"><h2>做这类工作的企业</h2><p className="small ink2">{cos.map((c, n) => <span key={c.id}>{n > 0 && '、'}<Link href={'/companies/' + c.id}>{c.data.title}</Link></span>)}{cos.some(c => c.demo) && '（示例企业）'}。了解它们在做什么、招哪些方向。</p></section> : null; })()}
      <section className="block"><h2>入门基础</h2><p>{d.level}。不需要相关经验，也不需要上传文件{quick ? '，理由写一两句就够' : '，用文字作答即可'}。</p></section>
      {gs.provenance?.length > 0 && <section className="block"><h2>内容来源与审核</h2>
        <ul className="prov">{gs.provenance.map((p: any) => <li key={p.title}><span className="src">{SOURCE_LABEL[p.kind]}</span> <b>{p.title}</b><p className="small ink2">{p.detail}</p>{p.url && <p className="xs muted">来源：<a href={p.url} target="_blank" rel="noopener noreferrer">{p.source}</a>（{p.date}）</p>}</li>)}</ul>
        <p className="small" style={{ marginTop: 8 }}>审核状态：{gs.review || '未经从业者审核'}。</p></section>}
    </article>
    <aside className="side panel"><div className="panel-b stack">
      <div><b style={{ fontSize: 34, color: 'var(--accent)' }} className="tnum">{d.minutes}</b> <span className="muted">分钟左右</span></div>
      {preview ? <button className="btn btn-primary btn-block" disabled>开始体验 →</button> : <Link className="btn btn-primary btn-block" href={'/experiences/' + item.id + '/work'}>{draft ? (draft.conflict ? '有两份草稿，去选择' : '继续体验') : quick ? '开始（约 ' + d.minutes + ' 分钟）' : '开始体验'} →</Link>}
      {draft && guided && <p className="small muted">上次看到：第 {Math.min(draft.progress?.step ?? 0, steps.length - 1) + 1} 步「{steps[Math.min(draft.progress?.step ?? 0, steps.length - 1)]}」· 已浏览 {Math.min(visited, steps.length)} / {steps.length} 步</p>}
      <p className="xs muted">{session?.loginAvailable === false && !session.identity.userId ? '不用登录就能开始，可以随时暂停。' + guestSaveNote(session.sessionDays) + (gs.output ? `做完可以把「${gs.output}」保存在这个浏览器里，并导出备份。` : '') : '不用登录就能开始，进度会保存在这台设备的浏览器会话里；登录后保存到账号，可以在其他设备继续。保存完成记录需要登录。'}</p>
      <p className="xs muted">你的作答默认只有你自己能看到，企业看不到。</p>
    </div></aside></div>
  </div>;
}
