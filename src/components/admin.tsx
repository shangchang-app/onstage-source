'use client';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ApiError, useSession } from './session';
import { Modal } from './modal';
import { DetailView } from './catalog';
import { BriefStep, DemoStep, PracticeStep, ReferenceStep, RoleStep } from './work';
import { ErrorBox, Loading, STEPS, dateTime, type Item } from './ui';
import { GUIDED_TEMPLATE, SIMPLE_TEMPLATE, readablePath } from './admin-templates';

const VSTATE: Record<string, [string, string]> = { draft: ['b-gray', '草稿'], in_review: ['b-warn', '审核中'], returned: ['b-bad', '已退回'], approved: ['b-blue', '审核通过 · 待发布'], published: ['b-green', '已发布'], superseded: ['b-gray', '已被替代（只读）'] };
const CSTATE: Record<string, string> = { draft: '草稿（未公开）', pending: '待确认 / 待重新发布（未公开）', published: '已发布', offline: '已下架 / 未公开', expired: '已截止' };
const ISTATE: Record<string, string> = { new: '待联系', contacted: '已联系', declined: '暂不合作', partnered: '已合作' };
const KIND: Record<string, string> = { experience: '岗位体验', job: '招聘', event: '赛事', company: '企业' };
type Act = (path: string, body: unknown, ok: string) => Promise<boolean>;

/* ---------- 表单字段定义 ---------- */
type F = { k: string; label: string; type: 'text' | 'textarea' | 'number' | 'select' | 'checkbox' | 'date' | 'lines' | 'company' | 'exps'; req?: boolean; opts?: [string, string][]; hint?: string };
const FIELDS: Record<string, F[]> = {
  company: [
    { k: 'title', label: '企业名称', type: 'text', req: true }, { k: 'industry', label: '行业', type: 'text' }, { k: 'size', label: '规模', type: 'text' },
    { k: 'about', label: '企业介绍', type: 'textarea' }, { k: 'directions', label: '业务与职业方向（每行一个）', type: 'lines' },
    { k: 'officialDomain', label: '官网域名', type: 'text', hint: '例如 example.com。真实岗位的投递链接必须属于这个域名。' },
    { k: 'cooperation', label: '合作说明（公开显示）', type: 'textarea', hint: '没有真实合作时，写明「与上场没有合作关系」。' },
    { k: 'authorized', label: '已取得企业的展示授权', type: 'checkbox', req: true },
    { k: 'authorizationNote', label: '授权依据（谁、何时、以什么方式授权；不公开）', type: 'textarea', req: true }
  ],
  job: [
    { k: 'companyId', label: '所属企业', type: 'company', req: true }, { k: 'title', label: '岗位名称', type: 'text', req: true },
    { k: 'jobType', label: '招聘类型', type: 'select', opts: [['intern', '实习'], ['campus', '校招']] }, { k: 'direction', label: '职业方向', type: 'text', req: true },
    { k: 'city', label: '城市 / 远程', type: 'text', req: true }, { k: 'salary', label: '薪资', type: 'text', req: true, hint: '企业没有公开时写「薪资面议」。' },
    { k: 'days', label: '每周到岗（实习）', type: 'text' }, { k: 'duration', label: '实习时长', type: 'text' }, { k: 'graduation', label: '面向届别（校招）', type: 'text' },
    { k: 'duties', label: '岗位职责', type: 'textarea', req: true }, { k: 'requirements', label: '任职要求', type: 'textarea', req: true },
    { k: 'deadline', label: '投递截止日期', type: 'date', req: true }, { k: 'source', label: '信息来源', type: 'text', req: true },
    { k: 'applyUrl', label: '投递方式（企业官网 https 链接，或 mailto: 招聘邮箱）', type: 'text', req: true }, { k: 'related', label: '相关岗位体验', type: 'exps' }
  ],
  event: [
    { k: 'title', label: '赛事名称', type: 'text', req: true }, { k: 'eventType', label: '类型', type: 'select', opts: [['hack', '黑客松'], ['competition', '企业商赛']] },
    { k: 'organizer', label: '主办方', type: 'text', req: true }, { k: 'city', label: '地点 / 线上', type: 'text', req: true }, { k: 'eligibility', label: '参赛要求', type: 'textarea', req: true },
    { k: 'prize', label: '奖励', type: 'text' }, { k: 'about', label: '赛事介绍', type: 'textarea' }, { k: 'deadline', label: '报名截止日期', type: 'date', req: true },
    { k: 'source', label: '信息来源', type: 'text', req: true }, { k: 'applyUrl', label: '报名地址（https）', type: 'text', req: true }
  ],
  experience: [
    { k: 'title', label: '体验标题', type: 'text', req: true }, { k: 'direction', label: '职业方向', type: 'text', req: true },
    { k: 'minutes', label: '预计时长（分钟）', type: 'number', req: true }, { k: 'level', label: '入门程度', type: 'text' },
    { k: 'sourceType', label: '内容来源', type: 'select', opts: [['platform', '平台制作'], ['cocreate', '企业共创（需要企业确认后才能发布）']] },
    { k: 'companyId', label: '关联企业（企业共创必填）', type: 'company' },
    { k: 'about', label: '简介', type: 'textarea' }, { k: 'willDo', label: '将体验的工作（每行一条）', type: 'lines', req: true }, { k: 'learn', label: '能学到什么（每行一条）', type: 'lines', req: true }
  ]
};
const toDate = (v: string) => { if (!v) return ''; const d = new Date(v); return Number.isNaN(d.getTime()) ? '' : new Date(d.getTime() + 8 * 3600000).toISOString().slice(0, 10); };
const fromDate = (v: string) => v ? v + 'T23:59:59+08:00' : '';
const lines = (v: unknown) => Array.isArray(v) ? v.join('\n') : '';
const toLines = (v: string) => v.split('\n').map(x => x.trim()).filter(Boolean);

/* 字段值 → 表单状态；表单状态 → 数据 */
function formFrom(kind: string, data: any, companyId: string | null) {
  const f: Record<string, any> = {};
  for (const d of FIELDS[kind]) f[d.k] = d.k === 'companyId' ? (companyId || '') : d.type === 'lines' ? lines(data?.[d.k]) : d.type === 'date' ? toDate(data?.[d.k]) : d.type === 'checkbox' ? !!data?.[d.k] : d.type === 'exps' ? (data?.[d.k] || []) : d.type === 'number' ? String(data?.[d.k] ?? '') : (data?.[d.k] ?? '');
  return f;
}
function dataFrom(kind: string, form: Record<string, any>, base: any) {
  const out: any = { ...(base || {}) };
  for (const d of FIELDS[kind]) {
    if (d.k === 'companyId') continue;
    const v = form[d.k];
    out[d.k] = d.type === 'lines' ? toLines(v) : d.type === 'date' ? fromDate(v) : d.type === 'number' ? Number(v) : v;
  }
  return out;
}

/* 未保存修改保护：离开页面提示；在后台内切换时弹窗确认。 */
function useDirtyGuard(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
}

function Errors({ err }: { err: ApiError | { message: string; detail?: any } | null }) {
  if (!err) return null;
  const fields: { path: string; message: string }[] = Array.isArray(err.detail) ? err.detail : [];
  return <div className="bad-box" role="alert" style={{ marginTop: 12 }}><b>没有保存：</b>{err.message}
    {fields.length > 0 && <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>{fields.slice(0, 12).map((f, i) => <li key={i}>{readablePath(f.path) || '内容'}：{f.message}</li>)}</ul>}</div>;
}

function FieldInput({ d, value, set, companies, exps, invalid }: { d: F; value: any; set: (v: any) => void; companies: Item[]; exps: Item[]; invalid?: boolean }) {
  const id = 'af-' + d.k;
  const label = <span className="label">{d.label}{d.req && <span className="err" aria-hidden="true"> *</span>}</span>;
  const common = { id, 'aria-invalid': invalid || undefined, 'aria-describedby': d.hint ? id + '-h' : undefined };
  const hint = d.hint && <span className="hint" id={id + '-h'}>{d.hint}</span>;
  if (d.type === 'checkbox') return <label className="choice"><input type="checkbox" {...common} checked={!!value} onChange={e => set(e.target.checked)} /><span>{d.label}{d.req && <span className="err"> *</span>}</span></label>;
  if (d.type === 'exps') return <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}><legend className="label">{d.label}</legend><div className="choice-list">{exps.map(x => <label className="choice" key={x.id}><input type="checkbox" checked={value.includes(x.id)} onChange={e => set(e.target.checked ? [...value, x.id] : value.filter((v: string) => v !== x.id))} /><span>{x.data.title}</span></label>)}</div></fieldset>;
  return <label className="field" htmlFor={id}>{label}
    {d.type === 'textarea' || d.type === 'lines' ? <textarea className="textarea" rows={d.type === 'lines' ? 3 : 4} {...common} value={value} onChange={e => set(e.target.value)} />
      : d.type === 'select' ? <select className="select" {...common} value={value} onChange={e => set(e.target.value)}>{d.opts!.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
      : d.type === 'company' ? <select className="select" {...common} value={value} onChange={e => set(e.target.value)}><option value="">（不关联）</option>{companies.map(c => <option key={c.id} value={c.id}>{c.data.title}{c.demo ? '（示例）' : ''}{c.status !== 'published' ? ' · 未公开' : ''}</option>)}</select>
      : <input className="input" type={d.type === 'date' ? 'date' : d.type === 'number' ? 'number' : 'text'} {...common} value={value} onChange={e => set(e.target.value)} />}
    {hint}</label>;
}

export function Admin() {
  const { session, api, toast } = useSession();
  const [data, setData] = useState<any>(null), [error, setError] = useState(''), [tab, setTab] = useState('exp');
  const [editing, setEditing] = useState<{ kind: string; item: Item | null } | null>(null);
  const [dirty, setDirty] = useState(false), [leave, setLeave] = useState<null | (() => void)>(null);
  const load = useCallback(() => api('admin').then(d => { setData(d); setError(''); }).catch(e => setError(e.message)), [api]);
  useEffect(() => { if (session?.identity.role === 'admin') void load(); }, [session?.identity.stamp, load, session?.identity.role]);
  useDirtyGuard(dirty);
  const guard = (fn: () => void) => dirty ? setLeave(() => fn) : fn();
  if (!session) return <Loading />;
  if (session.identity.role !== 'admin') return <div className="wrap page"><h1>没有访问权限</h1><p className="lede">内部后台只对平台管理员开放。</p></div>;
  if (error) return <div className="wrap page"><ErrorBox text={error} retry={load} /></div>;
  if (!data) return <Loading />;
  const act: Act = async (path, body, ok) => { try { await api(path, body); toast(ok); await load(); return true; } catch (e) { toast((e as Error).message, true); return false; } };
  const all: Item[] = data.content;
  const byKind = (k: string) => all.filter(c => c.kind === k);
  const tabs: [string, string][] = [['exp', '岗位体验'], ['company', '企业'], ['job', '招聘'], ['event', '赛事'], ['intents', `合作意向（${data.intents.filter((i: any) => i.state === 'new').length}）`], ['reports', `反馈（${data.reports.filter((r: any) => r.state === 'open').length}）`], ['audit', '操作记录']];
  const kindOfTab: Record<string, string> = { exp: 'experience', company: 'company', job: 'job', event: 'event' };
  return <div className="wrap page">
    <div className="ph"><h1>内部后台</h1><p className="lede">仅平台管理员可见。后台不提供任何学生的草稿或作答，只显示匿名的数量汇总。新建和修改的内容都先保存为草稿或待确认，不会直接公开。</p></div>
    <div className="admin-tabs" role="tablist">{tabs.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} onClick={() => guard(() => { setEditing(null); setDirty(false); setTab(k); })}>{l}</button>)}</div>

    {editing ? <ContentEditor key={(editing.item?.id || 'new') + editing.kind} kind={editing.kind} item={editing.item} all={all} setDirty={setDirty}
      onCancel={() => guard(() => { setEditing(null); setDirty(false); })}
      onSaved={async msg => { setDirty(false); setEditing(null); toast(msg); await load(); }} />
      : <>
        {kindOfTab[tab] && <div className="row" style={{ marginTop: 16, justifyContent: 'space-between' }}>
          <p className="small muted" style={{ margin: 0 }}>{tab === 'exp' ? '新建体验先填写基本信息和内容模板，保存后在「管理版本」里审核、发布。' : '保存后都是草稿或待确认；发布前会按规则检查授权、确认、截止日期和投递地址。'}</p>
          <button className="btn btn-primary" onClick={() => setEditing({ kind: kindOfTab[tab], item: null })}>新建{KIND[kindOfTab[tab]]}</button></div>}
        {tab === 'exp' && <div className="stack" style={{ marginTop: 16 }}>
          <p className="notice">体验内容按版本管理：草稿 → 提交审核 → 审核通过 → 发布。已发布的版本不能修改，修改要新建版本；新版本发布后，旧版本变为「已被替代」，已有完成记录仍对应原版本，正在做旧版本的学生可以做完。「企业共创」必须关联企业并记录企业的实际确认后才能发布。</p>
          {byKind('experience').map(c => <ExperienceRow key={c.id} c={c} all={all} act={act} setDirty={setDirty} guard={guard} />)}
        </div>}
        {['company', 'job', 'event'].includes(tab) && <ContentList items={byKind(tab)} all={all} act={act} onEdit={item => setEditing({ kind: tab, item })} />}
        {tab === 'intents' && <div className="stack" style={{ marginTop: 16 }}>{data.intents.length ? data.intents.map((i: any) => <Intent key={i.id} i={i} act={act} />) : <div className="empty">还没有合作意向。</div>}</div>}
        {tab === 'reports' && <div className="stack" style={{ marginTop: 16 }}>{data.reports.length ? data.reports.map((r: any) => <Report key={r.id} r={r} title={all.find(c => c.id === r.content_id)?.data.title} act={act} />) : <div className="empty">还没有反馈。</div>}</div>}
        {tab === 'audit' && <div className="table-wrap" style={{ marginTop: 16 }} tabIndex={0} role="region" aria-label="操作记录"><table className="table"><thead><tr><th>时间</th><th>操作</th><th>对象</th><th>说明</th></tr></thead>
          <tbody>{data.audit.map((a: any) => <tr key={a.id}><td>{dateTime(a.created_at)}</td><td>{a.action}</td><td>{a.content_id}</td><td style={{ maxWidth: 420, overflow: 'hidden', textOverflow: 'ellipsis' }}>{String(a.details || '').slice(0, 160)}</td></tr>)}</tbody></table></div>}
      </>}

    <Modal open={!!leave} title="有未保存的修改" role="alertdialog" onClose={() => setLeave(null)} footer={<><button className="btn" onClick={() => setLeave(null)}>继续编辑</button><button className="btn btn-primary" onClick={() => { const fn = leave; setLeave(null); setDirty(false); fn?.(); }}>放弃修改</button></>}>
      <p>离开后，这次没有保存的修改会丢失。</p>
    </Modal>
  </div>;
}

/* ---------- 企业 / 招聘 / 赛事 列表 ---------- */
function ContentList({ items, all, act, onEdit }: { items: Item[]; all: Item[]; act: Act; onEdit: (i: Item) => void }) {
  const [note, setNote] = useState<Record<string, string>>({}), [preview, setPreview] = useState<Item | null>(null);
  return <div className="stack" style={{ marginTop: 16 }}>
    {items[0]?.kind === 'job' && <p className="notice">招聘规则：每次修改都会让岗位回到「待企业确认」；必须记录企业对当前版本的确认才能发布；过了截止时间自动显示「已截止」；企业撤销授权或下架时，岗位一并停止展示（即使已截止也不再公开）。</p>}
    {items[0]?.kind === 'company' && <p className="notice">企业必须登记展示授权和依据才能发布。修改后需要重新发布；企业停止展示期间，它的岗位和体验都不会公开。</p>}
    {items.length === 0 && <div className="empty">还没有内容。</div>}
    {items.map(c => { const co = all.find(x => x.id === c.companyId); const base = 'admin/content/' + c.id + '/transition';
      return <div className="list-row" key={c.id} style={{ alignItems: 'flex-start' }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="row"><b>{c.data.title}</b>{c.demo && <span className="badge b-demo">示例</span>}<span className={'badge ' + (c.status === 'published' ? 'b-green' : 'b-gray')}>{CSTATE[c.status] || c.status}</span></div>
          <div className="small muted">{co ? co.data.title + ' · ' : ''}第 {c.version} 版{c.kind === 'job' ? ' · ' + (c.confirmedVersion === c.version ? '企业已确认当前版本' : '当前版本未确认') : ''}{c.kind === 'company' ? ' · ' + (c.data.authorized ? '已登记授权' : '未授权') : ''}{c.data.deadline ? ' · 截止 ' + dateTime(c.data.deadline) : ''} · 更新于 {dateTime(c.updatedAt)}</div>
          {c.kind === 'job' && (c as any).confirmation && <div className="small ink2">确认依据：{(c as any).confirmation}</div>}
          {c.kind === 'job' && c.confirmedVersion !== c.version && <input className="input" style={{ marginTop: 8 }} aria-label="企业确认依据" placeholder="企业确认依据（确认人职务、方式、日期）" value={note[c.id] || ''} onChange={e => setNote({ ...note, [c.id]: e.target.value })} />}
        </div>
        <div className="row">
          <button className="btn btn-sm" onClick={() => onEdit(c)}>编辑</button>
          <button className="btn btn-sm" onClick={() => setPreview(c)}>预览</button>
          {c.kind === 'job' && c.confirmedVersion !== c.version && <button className="btn btn-sm" onClick={() => act(base, { action: 'confirm', version: c.version, note: note[c.id] || '' }, '已记录企业确认')}>记录确认</button>}
          {(c as any).state !== 'published' && <button className="btn btn-sm btn-primary" onClick={() => act(base, { action: 'publish', version: c.version }, '已发布')}>发布</button>}
          {(c as any).state === 'published' && <button className="btn btn-sm" onClick={() => act(base, { action: 'offline', version: c.version }, '已下架')}>下架</button>}
          {['published', 'expired'].includes(c.status) && <Link className="btn btn-sm" href={'/' + ({ job: 'jobs', event: 'events', company: 'companies' } as any)[c.kind] + '/' + c.id}>学生端</Link>}
        </div>
      </div>; })}
    <Modal wide open={!!preview} title={preview ? '预览：' + preview.data.title : ''} onClose={() => setPreview(null)} footer={<button className="btn" onClick={() => setPreview(null)}>关闭</button>}>
      {preview && <DetailView item={{ ...preview, status: preview.status === 'expired' ? 'expired' : 'published' }} items={all} preview />}
    </Modal>
  </div>;
}

/* ---------- 新建 / 编辑：企业、招聘、赛事；新建岗位体验 ---------- */
function ContentEditor({ kind, item, all, setDirty, onCancel, onSaved }: { kind: string; item: Item | null; all: Item[]; setDirty: (d: boolean) => void; onCancel: () => void; onSaved: (msg: string) => void }) {
  const { api } = useSession();
  const init = useMemo(() => ({ ...formFrom(kind, item?.data, item?.companyId ?? null), ...(kind === 'job' && !item ? { jobType: 'intern' } : {}), ...(kind === 'event' && !item ? { eventType: 'hack' } : {}), ...(kind === 'experience' && !item ? { minutes: '30', level: '入门 · 零基础可做', sourceType: 'platform' } : {}) }), [kind, item]);
  const [form, setForm] = useState<Record<string, any>>(init), [demo, setDemo] = useState(item ? item.demo : false), [format, setFormat] = useState('guided');
  const [json, setJson] = useState(() => JSON.stringify(GUIDED_TEMPLATE, null, 2));
  const [err, setErr] = useState<any>(null), [busy, setBusy] = useState(false), [preview, setPreview] = useState<Item | null>(null), [conflict, setConflict] = useState(false);
  const initial = useRef(JSON.stringify([init, item ? item.demo : false, 'guided', JSON.stringify(GUIDED_TEMPLATE, null, 2)]));
  const dirty = JSON.stringify([form, demo, format, json]) !== initial.current;
  useEffect(() => { setDirty(dirty); }, [dirty, setDirty]);
  const companies = all.filter(c => c.kind === 'company'), exps = all.filter(c => c.kind === 'experience');
  const fieldErr = new Set<string>(Array.isArray(err?.detail) ? err.detail.map((f: any) => String(f.path).split('.')[1]) : []);
  function build() {
    let data = dataFrom(kind, form, item?.data);
    if (kind === 'experience') {
      const parsed = JSON.parse(json); // 由调用方捕获格式错误
      data = { ...data, format, ...(format === 'guided' ? { guide: parsed } : { scene: parsed.scene ?? '', tasks: parsed.tasks ?? [] }) };
    }
    return data;
  }
  async function save() {
    setErr(null); let data;
    try { data = build(); } catch (e) { setErr({ message: '章节内容不是有效的 JSON：' + (e as Error).message }); return; }
    setBusy(true);
    try {
      const r = await api('admin/content', { ...(item ? { id: item.id } : {}), kind, companyId: form.companyId || null, version: item?.version || 0, demo, data });
      onSaved(item ? `已保存为第 ${r.version} 版。保存不等于核验：内容已回到「待确认 / 待重新发布」，按规则确认并发布后才会公开。` : kind === 'experience' ? '已新建体验草稿（第 1 版）。在「管理版本」里填写来源、提交审核后才能发布。' : '已新建草稿，尚未公开。');
    } catch (e) { const a = e as ApiError; setErr(a); if (a.code === 'VERSION_CONFLICT') setConflict(true); window.scrollTo({ top: 0 }); }
    finally { setBusy(false); }
  }
  function openPreview() {
    setErr(null);
    try { const data = build(); setPreview({ id: item?.id || 'preview', kind, status: 'published', version: item?.version || 1, demo, companyId: form.companyId || null, data: { directions: [], tasks: [], willDo: [], learn: [], ...data }, updatedAt: new Date().toISOString() }); }
    catch (e) { setErr({ message: '章节内容不是有效的 JSON：' + (e as Error).message }); }
  }
  const missing = FIELDS[kind].filter(d => d.req && (d.type === 'checkbox' ? !form[d.k] : !String(form[d.k] ?? '').trim())).map(d => d.label);
  return <section className="sec-card" aria-labelledby="ed-h" style={{ marginTop: 16 }}>
    <div className="row" style={{ justifyContent: 'space-between' }}><h2 id="ed-h" style={{ margin: 0 }}>{item ? '编辑' : '新建'}{KIND[kind]}{item ? '：' + item.data.title : ''}</h2>{dirty && <span className="badge b-warn">有未保存的修改</span>}</div>
    <p className="small ink2" style={{ marginTop: 6 }}>{item ? '保存后会生成新版本，并回到「待确认 / 待重新发布」，学生端暂时看不到这项内容，直到重新确认并发布。' : '新建内容保存为草稿，不会直接公开。'}带 <span className="err">*</span> 的是发布前必须填写的。</p>
    <Errors err={err} />
    {conflict && <div className="warn-box" style={{ marginTop: 8 }}>其他管理员已修改这项内容。你的修改还在下面，没有被覆盖。可以先复制你的修改，再<button className="text-btn" onClick={onCancel}>返回列表</button>载入最新内容后重新编辑。</div>}
    <div className="fields" style={{ marginTop: 14 }}>
      {kind === 'experience' && !item && <label className="field" htmlFor="af-format"><span className="label">体验形式</span><select id="af-format" className="select" value={format} onChange={e => { setFormat(e.target.value); setJson(JSON.stringify(e.target.value === 'guided' ? GUIDED_TEMPLATE : SIMPLE_TEMPLATE, null, 2)); }}><option value="guided">完整引导（6 步）</option><option value="simple">简版练习（任务 + 参考思路）</option></select></label>}
      {FIELDS[kind].map(d => <FieldInput key={d.k} d={d} value={form[d.k]} set={v => setForm(f => ({ ...f, [d.k]: v }))} companies={companies} exps={exps} invalid={fieldErr.has(d.k)} />)}
      <label className="choice"><input type="checkbox" checked={demo} onChange={e => setDemo(e.target.checked)} /><span>这是示例 / 演示内容（学生端会显著标注「示例」）</span></label>
      {kind === 'experience' && <JsonField value={json} set={setJson} format={format} />}
    </div>
    {missing.length > 0 && <p className="hint" style={{ marginTop: 10 }}>还没填写（可以先存草稿，发布前需要补齐）：{missing.join('、')}</p>}
    <div className="row" style={{ marginTop: 16 }}>
      <button className="btn btn-primary" disabled={busy} onClick={save}>{busy ? '正在保存…' : item ? '保存修改' : '保存为草稿'}</button>
      <button className="btn" onClick={openPreview}>预览</button>
      <button className="btn" onClick={onCancel}>取消</button>
    </div>
    <Modal wide open={!!preview} title="预览（未保存的内容）" onClose={() => setPreview(null)} footer={<button className="btn" onClick={() => setPreview(null)}>关闭预览</button>}>
      {preview && (kind === 'experience' ? <ExperiencePreview item={preview} all={all} /> : <DetailView item={preview} items={all} preview />)}
    </Modal>
  </section>;
}

function JsonField({ value, set, format, readonly }: { value: string; set: (v: string) => void; format: string; readonly?: boolean }) {
  const [check, setCheck] = useState('');
  const [ask, setAsk] = useState(false);
  function validate() {
    try { const v = JSON.parse(value); setCheck(format === 'guided' ? (v.practice?.length ? `格式正确：${v.practice.length} 个作答小步。字段要求以保存时的服务端校验为准。` : '缺少 practice（作答小步）') : (Array.isArray(v.tasks) ? `格式正确：${v.tasks.length} 个任务。` : '缺少 tasks（任务）')); }
    catch (e) { setCheck('不是有效的 JSON：' + (e as Error).message); }
  }
  return <div className="field">
    <label className="label" htmlFor="af-json">{format === 'guided' ? '章节内容（JSON：认识岗位、示范、模拟任务、作答小步、参考思路、术语）' : '任务内容（JSON：情境和任务）'}</label>
    <textarea id="af-json" className="textarea json" rows={18} spellCheck={false} readOnly={readonly} value={value} onChange={e => { set(e.target.value); setCheck(''); }} />
    {!readonly && <div className="row"><button type="button" className="btn btn-sm" onClick={validate}>检查格式</button><button type="button" className="btn btn-sm" onClick={() => setAsk(true)}>换成空白模板</button>{check && <span className="small" role="status">{check}</span>}</div>}
    <span className="hint">所有标「（请填写）」的地方都要替换。数据请使用虚构或已脱敏的内容；不要编造真实从业者的姓名、头像或经历。</span>
    <Modal open={ask} title="换成空白模板？" role="alertdialog" onClose={() => setAsk(false)} footer={<><button className="btn" onClick={() => setAsk(false)}>取消</button><button className="btn btn-primary" onClick={() => { set(JSON.stringify(format === 'guided' ? GUIDED_TEMPLATE : SIMPLE_TEMPLATE, null, 2)); setAsk(false); }}>换成模板</button></>}><p>当前的章节内容会被模板替换。</p></Modal>
  </div>;
}

/* 体验预览：详情页 + 各步骤（作答不保存）。 */
function ExperiencePreview({ item, all }: { item: Item; all: Item[] }) {
  const [step, setStep] = useState(0), [answers, setAnswers] = useState<Record<string, any>>({}), [opened, setOpened] = useState<string[]>([]), [checks, setChecks] = useState<number[]>([]);
  const d = item.data, g = d.guide;
  const status = { done: 0, total: 1 };
  return <div>
    <DetailView item={item} items={all} preview />
    <h3 style={{ marginTop: 24 }}>作答页预览（作答不会保存）</h3>
    {g ? <>
      <div className="row" style={{ marginTop: 8 }}>{STEPS.slice(0, 5).map((s, i) => <button key={s} className={'btn btn-sm' + (step === i ? ' btn-primary' : '')} onClick={() => setStep(i)}>{i + 1}. {s}</button>)}</div>
      <div style={{ marginTop: 12 }}>
        {step === 0 && <RoleStep g={g} data={d} />}{step === 1 && <DemoStep g={g} />}{step === 2 && <BriefStep g={g} />}
        {step === 3 && <PracticeStep g={g} answers={answers} set={(k, v) => setAnswers(a => ({ ...a, [k]: v }))} readonly={false} opened={opened} openHint={k => setOpened(o => [...o, k])} openMats={() => setStep(2)} />}
        {step === 4 && <ReferenceStep g={g} data={d} answers={answers} status={status} checks={checks} setChecks={setChecks} go={setStep} />}
      </div></> : <div className="stack" style={{ marginTop: 8 }}>{d.scene && <p className="pre">{d.scene}</p>}{(d.tasks || []).map((t: any, i: number) => <div className="practice" key={i}><h4>{i + 1}. {t.title}</h4><p className="pre">{t.prompt}</p>{t.options && <ul>{t.options.map((o: string) => <li key={o}>{o}</li>)}</ul>}<div className="framework pre"><b>参考思路：</b>{t.reference}</div></div>)}</div>}
  </div>;
}

/* ---------- 岗位体验：版本管理 ---------- */
function ExperienceRow({ c, all, act, setDirty, guard }: { c: Item; all: Item[]; act: Act; setDirty: (d: boolean) => void; guard: (fn: () => void) => void }) {
  const [open, setOpen] = useState(false);
  return <div className="panel"><div className="panel-b">
    <div className="row" style={{ justifyContent: 'space-between' }}>
      <div style={{ minWidth: 0 }}><b>{c.data.title}</b>{c.demo && <span className="badge b-demo" style={{ marginLeft: 6 }}>示例</span>}<div className="small muted">{c.id} · {c.data.format === 'guided' ? '完整引导' : '简版练习'} · {c.data.sourceType === 'cocreate' ? '企业共创' : '平台制作'} · {(c as any).state === 'draft' ? '尚未发布过' : '线上第 ' + c.version + ' 版'} · {CSTATE[c.status] || c.status}</div></div>
      <div className="row">
        {(c as any).state === 'published' ? <button className="btn btn-sm" onClick={() => act('admin/content/' + c.id + '/transition', { action: 'offline', version: c.version }, '已下线：学生的草稿和记录保留')}>下线</button>
          : (c as any).state !== 'draft' && <button className="btn btn-sm" onClick={() => act('admin/content/' + c.id + '/transition', { action: 'publish', version: c.version }, '已重新上线')}>上线</button>}
        <button className="btn btn-sm btn-primary" aria-expanded={open} onClick={() => guard(() => { setDirty(false); setOpen(!open); })}>{open ? '收起版本' : '管理版本'}</button>
      </div>
    </div>
    {open && <Versions c={c} all={all} act={act} setDirty={setDirty} />}
  </div></div>;
}

function Versions({ c, all, act, setDirty }: { c: Item; all: Item[]; act: Act; setDirty: (d: boolean) => void }) {
  const { api, toast } = useSession(); const id = c.id;
  const [v, setV] = useState<any>(null), [edit, setEdit] = useState<any>(null), [note, setNote] = useState<Record<string, string>>({}), [preview, setPreview] = useState<Item | null>(null);
  const load = useCallback(() => api('admin/experiences/' + id + '/versions').then(setV).catch(e => toast(e.message, true)), [api, id, toast]);
  useEffect(() => { void load(); }, [load]);
  if (!v) return <p role="status" className="small">正在载入版本…</p>;
  const run = async (p: string, b: unknown, ok: string) => { if (await act(p, b, ok)) await load(); };
  const open = v.versions.some((x: any) => ['draft', 'in_review', 'returned', 'approved'].includes(x.state));
  const co = (cid: string | null) => all.find(x => x.id === cid)?.data.title;
  if (edit) return <VersionEditor x={edit} c={c} all={all} setDirty={setDirty} onClose={() => { setDirty(false); setEdit(null); }} onSaved={() => { setDirty(false); setEdit(null); void load(); }} />;
  return <div style={{ marginTop: 14 }}>
    <p className="small muted">匿名汇总：进行中的草稿 {v.stats.drafts} 份 · 完成记录 {v.stats.completions} 份。这里看不到任何学生的作答内容。</p>
    {!open && <button className="btn btn-sm" style={{ marginTop: 8 }} onClick={() => run('admin/experiences/' + id + '/versions', {}, '已从最新版本复制出新草稿')}>新建版本（复制最新版本）</button>}
    <div className="stack" style={{ marginTop: 12 }}>{v.versions.map((x: any) => {
      const [cl, l] = VSTATE[x.state] || ['b-gray', x.state]; const base = `admin/experiences/${id}/versions/${x.version}`; const k = x.version + '';
      return <div key={x.version} className="list-row" style={{ alignItems: 'flex-start' }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="row"><b>第 {x.version} 版</b><span className={'badge ' + cl}>{l}</span><span className="badge b-blue">{x.data.sourceType === 'cocreate' ? '企业共创' : '平台制作'}</span><span className="small muted">完成记录 {x.completions} 份</span></div>
          <div className="small ink2" style={{ marginTop: 4 }}>{x.data.title}{x.company_id ? ' · 关联企业：' + (co(x.company_id) || x.company_id) : ''}</div>
          <div className="small ink2">来源说明：{x.source_note || <span className="err">未填写（提交审核前必须填写）</span>}</div>
          {x.change_note && <div className="small ink2">改动说明：{x.change_note}</div>}
          {x.review_note && <div className="small ink2">审核意见：{x.review_note}</div>}
          {x.data.sourceType === 'cocreate' && <div className="small ink2">企业确认：{x.cocreate_confirmation || <span className="err">尚未记录，不能发布</span>}</div>}
          <div className="xs muted">创建 {dateTime(x.created_at)}{x.published_at ? ' · 发布 ' + dateTime(x.published_at) : ''}</div>
          {['in_review', 'approved'].includes(x.state) && <input className="input" style={{ marginTop: 8 }} aria-label="审核意见" placeholder={x.data.sourceType === 'cocreate' ? '审核意见 / 退回原因 / 企业确认记录（确认人职务、方式、日期）' : '审核意见 / 退回原因'} value={note[k] || ''} onChange={e => setNote({ ...note, [k]: e.target.value })} />}
        </div>
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          {['draft', 'returned'].includes(x.state) && <button className="btn btn-sm" onClick={() => setEdit(x)}>编辑内容</button>}
          <button className="btn btn-sm" onClick={() => setPreview({ id, kind: 'experience', status: 'published', version: x.version, demo: c.demo, companyId: x.company_id, data: x.data, updatedAt: x.created_at })}>预览</button>
          {x.state === 'draft' && <button className="btn btn-sm btn-primary" onClick={() => run(base + '/review', { action: 'submit' }, '已提交审核')}>提交审核</button>}
          {x.state === 'in_review' && <><button className="btn btn-sm" onClick={() => run(base + '/review', { action: 'return', note: note[k] || '' }, '已退回')}>退回</button><button className="btn btn-sm btn-primary" onClick={() => run(base + '/review', { action: 'approve', note: note[k] || '' }, '审核通过')}>审核通过</button></>}
          {['in_review', 'approved'].includes(x.state) && x.data.sourceType === 'cocreate' && <button className="btn btn-sm" onClick={() => run(base + '/review', { action: 'cocreate', note: note[k] || '' }, '已记录企业确认')}>记录企业确认</button>}
          {x.state === 'approved' && <button className="btn btn-sm btn-primary" onClick={() => run(base + '/publish', {}, '已发布第 ' + x.version + ' 版')}>发布</button>}
        </div>
      </div>;
    })}</div>
    <Modal wide open={!!preview} title={preview ? `预览第 ${preview.version} 版` : ''} onClose={() => setPreview(null)} footer={<button className="btn" onClick={() => setPreview(null)}>关闭</button>}>
      {preview && <ExperiencePreview item={preview} all={all} />}
    </Modal>
  </div>;
}

function VersionEditor({ x, c, all, setDirty, onClose, onSaved }: { x: any; c: Item; all: Item[]; setDirty: (d: boolean) => void; onClose: () => void; onSaved: () => void }) {
  const { api, toast } = useSession();
  const guided = x.data.format === 'guided';
  const init = useMemo(() => ({ form: formFrom('experience', x.data, x.company_id), json: JSON.stringify(guided ? x.data.guide : { scene: x.data.scene, tasks: x.data.tasks }, null, 2), source: x.source_note || '', change: x.change_note || '' }), [x, guided]);
  const [form, setForm] = useState(init.form), [json, setJson] = useState(init.json), [source, setSource] = useState(init.source), [change, setChange] = useState(init.change);
  const [err, setErr] = useState<any>(null), [busy, setBusy] = useState(false), [preview, setPreview] = useState<Item | null>(null), [ask, setAsk] = useState(false);
  const dirty = JSON.stringify([form, json, source, change]) !== JSON.stringify([init.form, init.json, init.source, init.change]);
  useEffect(() => { setDirty(dirty); }, [dirty, setDirty]);
  useDirtyGuard(dirty);
  const companies = all.filter(i => i.kind === 'company');
  function build() { const parsed = JSON.parse(json); const base = dataFrom('experience', form, x.data); return guided ? { ...base, guide: parsed } : { ...base, scene: parsed.scene ?? '', tasks: parsed.tasks ?? [] }; }
  async function save() {
    setErr(null); let data; try { data = build(); } catch (e) { setErr({ message: '章节内容不是有效的 JSON：' + (e as Error).message }); return; }
    setBusy(true);
    try { await api(`admin/experiences/${c.id}/versions/${x.version}`, { data, sourceNote: source, changeNote: change, rev: x.rev ?? 0, companyId: form.companyId || null }); toast('已保存第 ' + x.version + ' 版草稿（未发布）'); onSaved(); }
    catch (e) { setErr(e); window.scrollTo({ top: 0 }); } finally { setBusy(false); }
  }
  return <section style={{ marginTop: 14 }} aria-labelledby="ve-h">
    <div className="row" style={{ justifyContent: 'space-between' }}><h3 id="ve-h" style={{ margin: 0 }}>编辑第 {x.version} 版（{guided ? '完整引导' : '简版练习'}）</h3>{dirty && <span className="badge b-warn">有未保存的修改</span>}</div>
    <p className="small ink2">保存只更新这个版本的草稿，线上内容不变。修改会清空已记录的企业共创确认；提交审核前必须写明内容来源。</p>
    <Errors err={err} />
    {err?.code === 'VERSION_CONFLICT' && <p className="warn-box">其他管理员已经修改了这个版本。你的修改还在页面上，没有覆盖对方。请先复制你的修改，再关闭编辑、重新载入。</p>}
    <div className="fields" style={{ marginTop: 12 }}>
      <label className="field"><span className="label">内容来源说明 <span className="err">*</span></span><input className="input" value={source} onChange={e => setSource(e.target.value)} placeholder="例：平台根据公开资料整理；店铺、数据、评论均为虚构" /></label>
      <label className="field"><span className="label">本版改动说明</span><input className="input" value={change} onChange={e => setChange(e.target.value)} /></label>
      {FIELDS.experience.map(d => <FieldInput key={d.k} d={d} value={form[d.k]} set={v => setForm(f => ({ ...f, [d.k]: v }))} companies={companies} exps={[]} />)}
      <JsonField value={json} set={setJson} format={guided ? 'guided' : 'simple'} />
    </div>
    <div className="row" style={{ marginTop: 14 }}>
      <button className="btn btn-primary" disabled={busy} onClick={save}>{busy ? '正在保存…' : '保存草稿'}</button>
      <button className="btn" onClick={() => { try { setPreview({ id: c.id, kind: 'experience', status: 'published', version: x.version, demo: c.demo, companyId: form.companyId || null, data: build(), updatedAt: new Date().toISOString() }); setErr(null); } catch (e) { setErr({ message: '章节内容不是有效的 JSON：' + (e as Error).message }); } }}>预览</button>
      <button className="btn" onClick={() => dirty ? setAsk(true) : onClose()}>取消</button>
    </div>
    <Modal wide open={!!preview} title="预览（未保存的内容）" onClose={() => setPreview(null)} footer={<button className="btn" onClick={() => setPreview(null)}>关闭预览</button>}>{preview && <ExperiencePreview item={preview} all={all} />}</Modal>
    <Modal open={ask} title="有未保存的修改" role="alertdialog" onClose={() => setAsk(false)} footer={<><button className="btn" onClick={() => setAsk(false)}>继续编辑</button><button className="btn btn-primary" onClick={() => { setAsk(false); onClose(); }}>放弃修改</button></>}><p>离开后，这次没有保存的修改会丢失。</p></Modal>
  </section>;
}

function Intent({ i, act }: { i: any; act: Act }) {
  const [s, setS] = useState(i.state), [n, setN] = useState(i.admin_note || '');
  return <div className="panel"><div className="panel-b stack">
    <div className="row"><b>{i.company}</b><span className="badge b-blue">{ISTATE[i.state]}</span><span className="xs muted">{dateTime(i.created_at)}</span></div>
    <div className="small">联系人：{i.contact_name} · {i.contact}</div>
    <div className="small ink2 pre">岗位 / 场景：{i.roles}{i.note ? '\n说明：' + i.note : ''}</div>
    <div className="row"><select className="select" value={s} onChange={e => setS(e.target.value)} aria-label="处理状态">{Object.entries(ISTATE).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
      <input className="input" style={{ flex: 1, minWidth: 160 }} placeholder="内部备注" aria-label="内部备注" value={n} onChange={e => setN(e.target.value)} />
      <button className="btn btn-sm" onClick={() => act('admin/intents/' + i.id, { state: s, adminNote: n }, '已更新')}>保存</button></div>
    <p className="xs muted">「已合作」只是内部跟进状态，不会在网站上展示企业名称或背书。</p>
  </div></div>;
}
function Report({ r, title, act }: { r: any; title?: string; act: Act }) {
  const [n, setN] = useState('');
  return <div className="panel"><div className="panel-b stack">
    <div className="row"><b>{title || r.content_id}</b><span className={'badge ' + (r.state === 'open' ? 'b-warn' : 'b-green')}>{r.state === 'open' ? '待处理' : '已处理'}</span><span className="xs muted">{dateTime(r.created_at)}</span></div>
    <div className="small ink2">{r.reason}</div>
    {r.state === 'open' ? <div className="row"><input className="input" style={{ flex: 1, minWidth: 160 }} aria-label="处理结果" placeholder="处理结果（至少 3 个字）" value={n} onChange={e => setN(e.target.value)} /><button className="btn btn-sm" onClick={() => act('admin/reports/' + r.id, { resolution: n }, '已处理')}>标记已处理</button></div>
      : <div className="small muted">处理结果：{r.resolution}</div>}
  </div></div>;
}
