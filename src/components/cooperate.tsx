'use client';
import { useState } from 'react';
import { useSession } from './session';

export function Cooperate() {
  const { api, session } = useSession();
  const [f, setF] = useState({ company: '', contactName: '', contact: '', roles: '', note: '', consent: false });
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [done, setDone] = useState<any>(null);
  const set = (k: string, v: any) => setF(x => ({ ...x, [k]: v }));
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setError(''); setBusy(true);
    try { setDone(await api('cooperation', f)); } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  }
  return <div className="wrap page" style={{ maxWidth: 880 }}>
    <div className="ph"><div className="eyebrow">企业合作</div><h1>把岗位日常，做成学生能参与的线上体验</h1>
      <p className="lede">把岗位日常制作成学生可以参与的线上体验，帮助更多学生了解企业和工作，为招聘做准备。</p></div>
    <section className="sec-card"><h2>合作怎么进行</h2>
      <ol className="flow">
        <li><span><b>企业提供</b>　岗位背景、典型工作和脱敏后的场景材料。不需要提供真实客户数据或商业机密。</span></li>
        <li><span><b>平台协助制作</b>　上场把材料整理成 30–60 分钟的引导式体验：认识岗位、示范、模拟任务、提示、参考思路。</span></li>
        <li><span><b>企业确认后发布</b>　企业确认内容准确后，体验才会标注「企业共创」并上线。没有确认的内容不会使用企业背书。</span></li>
      </ol></section>
    <section className="sec-card"><h2>我们会做和不会做的</h2>
      <ul>
        <li>学生的作答默认只有本人可见。<b>企业端不能查看学生的个人作答</b>，也不提供学生排名或人才库检索。</li>
        <li>体验是学生自愿参加的模拟场景，不是投递门槛，也不让学生免费完成真实商业交付。</li>
        <li>我们<b>不承诺</b>报名人数、候选人数量、招聘结果或自动筛选效果。</li>
        <li>岗位信息仍按招聘专区的流程发布：企业授权、逐版确认、到期自动截止，学生可以反馈失效信息。</li>
      </ul></section>
    {session?.staticTrial ? <section className="sec-card"><h2>留下合作意向</h2><p className="notice">这是免费试玩版，暂不支持在线提交合作意向。正式版上线后开放。</p></section> : done ? <section className="sec-card" role="status"><h2>已收到你的合作意向</h2>
      <p>状态：<span className="badge b-blue">待联系</span>　编号 {String(done.id).slice(0, 8)}</p>
      <p className="small ink2" style={{ marginTop: 8 }}>平台会通过你留下的联系方式沟通。提交意向不代表合作已经成立，也不会自动在网站上展示企业名称。</p></section>
      : <form className="sec-card" onSubmit={submit} noValidate><h2>留下合作意向</h2>
        <div className="fields">
          <label className="field"><span className="label">企业名称</span><input className="input" required maxLength={100} value={f.company} onChange={e => set('company', e.target.value)} /></label>
          <label className="field"><span className="label">联系人</span><input className="input" required maxLength={50} value={f.contactName} onChange={e => set('contactName', e.target.value)} /></label>
          <label className="field"><span className="label">手机号或工作邮箱</span><input className="input" required maxLength={100} value={f.contact} onChange={e => set('contact', e.target.value)} /></label>
          <label className="field"><span className="label">想介绍的岗位或工作场景</span><textarea className="textarea" rows={3} required maxLength={1000} value={f.roles} onChange={e => set('roles', e.target.value)} placeholder="例如：跨境电商运营，日常要看店铺数据、处理差评" /></label>
          <label className="field"><span className="label">其他说明（选填）</span><textarea className="textarea" rows={2} maxLength={2000} value={f.note} onChange={e => set('note', e.target.value)} /></label>
          <label className="choice"><input type="checkbox" checked={f.consent} onChange={e => set('consent', e.target.checked)} /><span>我同意上场为合作沟通使用以上联系方式，不用于其他用途。</span></label>
        </div>
        {error && <p className="err" role="alert" style={{ marginTop: 10 }}>{error}</p>}
        <button className="btn btn-primary" style={{ marginTop: 14 }} disabled={busy}>{busy ? '正在提交…' : '提交合作意向'}</button>
      </form>}
  </div>;
}
