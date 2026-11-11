'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useSession } from './session';
import { SamplePlan } from './catalog';
import { COOP_URL } from '@/lib/site-config';

/* 匿名汇总报告样例：数字全部虚构，只用来说明报告的格式。 */
const REPORT = {
  actions: [['修正适配信息', 72], ['调整广告', 58], ['加醒目提示', 31], ['结束促销', 24], ['检查质量', 12], ['加大广告预算', 6]],
  materials: [['利润拆解', 81], ['退货原因', 88], ['差评和适配表', 76], ['变更记录', 54]],
  likes: [['读买家评论找线索', 47], ['看数据、算账', 39], ['分析广告投放', 28]]
} as const;

export function Cooperate() {
  const { api, session } = useSession();
  const [f, setF] = useState({ company: '', contactName: '', contact: '', roles: '', note: '', consent: false });
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [done, setDone] = useState<any>(null);
  const set = (k: string, v: any) => setF(x => ({ ...x, [k]: v }));
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setError(''); setBusy(true);
    try { setDone(await api('cooperation', f)); } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  }
  const bars = (list: readonly (readonly [string, number])[]) => <ul className="bars">{list.map(([k, v]) => <li key={k}><span>{k}</span><span className="bar" aria-hidden="true"><i style={{ width: v + '%' }} /></span><span className="tnum small">{v}%</span></li>)}</ul>;
  return <div className="wrap page" style={{ maxWidth: 980 }}>
    <div className="ph"><div className="eyebrow">企业合作</div><h1>把你们的一个工作场景，做成学生能上手的短体验</h1>
      <p className="lede">学生用 5–10 分钟做一次你们岗位上的真实决策，拿到具体的复盘；你们拿到匿名的汇总反馈，了解学生怎么看这份工作。下面的流程、素材清单和样例，说明合作要提供什么、最后能得到什么。</p>
      <p className="small muted" style={{ marginTop: 8 }}>目前 on stage 还没有合作企业。页面上的样例都由平台编写，使用模拟数据，标有「示例」。</p></div>

    <section className="sec-card" aria-labelledby="co-flow"><h2 id="co-flow">合作怎么进行</h2>
      <ol className="co-steps">
        <li><span className="co-who">企业</span><b>提供场景</b>一个可以公开或脱敏的岗位场景，和几份材料。</li>
        <li><span className="co-who">on stage</span><b>制作体验</b>写任务消息、整理材料、设计行动选项和复盘规则。</li>
        <li><span className="co-who">企业</span><b>审核业务内容</b>确认业务逻辑和参考思路，没确认不上线、不署名。</li>
        <li><span className="co-who">学生 · on stage</span><b>参与与汇总</b>学生自愿参与；平台只汇总匿名数据。</li>
        <li><span className="co-who">双方</span><b>决定下一步</b>看反馈再决定是否办活动、商赛或招聘合作。</li>
      </ol></section>

    <div className="two">
      <section className="sec-card" aria-labelledby="co-need"><h2 id="co-need">企业需要提供</h2>
        <ul>
          <li>岗位名称，以及这个岗位一周大致在做什么。</li>
          <li>一个真实发生过、可以公开或脱敏的工作问题：背景、当时要做的决定。</li>
          <li>3–5 份材料：脱敏后的数据表、截图、评论或流程记录（数字可以等比例改动）。</li>
          <li>你们认为合理的做法、常见误区，以及做决定时要权衡的东西。</li>
          <li>一位业务同事审核内容，大约 1–2 小时。</li>
        </ul></section>
      <section className="sec-card" aria-labelledby="co-no"><h2 id="co-no">不需要、也不会要</h2>
        <ul>
          <li>客户隐私、真实交易明细、未公开的商业机密。</li>
          <li>让学生免费完成真实工作交付。体验只是模拟。</li>
          <li>学生名单或简历。on stage 不做人才库，不给学生排名。</li>
        </ul></section>
    </div>

    <section className="sec-card" aria-labelledby="co-content"><h2 id="co-content">一个体验长什么样 <span className="badge b-demo">示例</span></h2>
      <p className="small ink2">以平台制作的「订单涨了，利润却少了一半：下周先做什么？」为例（模拟数据，没有企业参与）：</p>
      <div className="table-wrap" style={{ marginTop: 10 }}><table className="table"><tbody>
        <tr><th scope="row">任务消息</th><td style={{ whiteSpace: 'normal' }}>运营负责人在群里问：订单涨了四成，利润却少了快一半，下周先做什么？</td></tr>
        <tr><th scope="row">材料（4 份）</th><td style={{ whiteSpace: 'normal' }}>利润拆解、退货原因前后对比、差评和适配表、第 4 周变更记录。学生自己决定看哪些。</td></tr>
        <tr><th scope="row">学生要做的</th><td style={{ whiteSpace: 'normal' }}>组合行动或写自己的方案；一两句理由；还缺什么信息。</td></tr>
        <tr><th scope="row">复盘规则</th><td style={{ whiteSpace: 'normal' }}>每个行动的合理之处、取舍和验证方式；没看的关键材料、没提的关键信息会被指出来。由企业审核。</td></tr>
        <tr><th scope="row">参考思路</th><td style={{ whiteSpace: 'normal' }}>业务上的参考判断，以及参考思路里也不确定的地方。</td></tr>
      </tbody></table></div>
      <p style={{ marginTop: 12 }}><Link href="/experiences/ops-returns">自己做一遍（约 8 分钟）→</Link></p>
    </section>

    <section className="sec-card" aria-labelledby="co-out"><h2 id="co-out">学生最后交出的东西 <span className="badge b-demo">示例</span></h2>
      <p className="small ink2">学生的方案默认只保存在学生自己那里，<b>企业看不到任何学生的个人作答或草稿</b>。下面是平台编写的示例：</p>
      <SamplePlan />
    </section>

    <section className="sec-card" aria-labelledby="co-report"><h2 id="co-report">企业能拿到的匿名汇总报告 <span className="badge b-demo">示例</span></h2>
      <p className="small ink2">报告只有汇总比例，没有姓名、联系方式或任何个人作答。人数太少时不出报告，避免认出具体的人。</p>
      <div className="report" style={{ marginTop: 12 }}>
        <p className="warn-box" style={{ marginBottom: 12 }}><b>以下数字全部是虚构的</b>，只用来说明报告格式，不代表任何真实学生或真实统计。</p>
        <div className="two">
          <div><h3 className="small">学生选择的行动（可多选）</h3>{bars(REPORT.actions)}</div>
          <div><h3 className="small">打开过各份材料的比例</h3>{bars(REPORT.materials)}</div>
        </div>
        <div className="two" style={{ marginTop: 14 }}>
          <div><h3 className="small">最常被漏掉的</h3><ul className="small"><li>没打开「利润拆解」，只盯着退款</li><li>没提「按车型拆分的数据」</li></ul></div>
          <div><h3 className="small">学生说比较喜欢的工作部分</h3>{bars(REPORT.likes)}</div>
        </div>
        <p className="xs muted" style={{ marginTop: 12 }}>报告不包含：分数、排名、性格判断、「适不适合」的结论。</p>
        <p className="xs muted">生成这样的报告需要正式版（有服务器），并且要在学生同意后才统计。现在的试玩版不收集任何学生数据，作答只保存在学生自己的浏览器里。</p>
      </div>
    </section>

    <section className="sec-card" aria-labelledby="co-rules"><h2 id="co-rules">我们会做和不会做的</h2>
      <ul>
        <li>学生的作答默认只有本人可见。<b>企业不能查看学生的私人草稿或作答</b>，也没有学生排名或人才库检索。</li>
        <li>体验是学生自愿参加的模拟场景，不是投递门槛。</li>
        <li>我们<b>不承诺</b>参与人数、候选人数量或招聘结果。</li>
        <li>没有取得授权前，不会把任何企业写成合作伙伴，也不会使用企业 Logo。</li>
      </ul></section>

    {session?.staticTrial ? <section className="sec-card" aria-labelledby="co-form"><h2 id="co-form">留下合作意向</h2>
      {COOP_URL ? <><p className="small ink2">合作意向通过外部问卷收集。点击后会离开 on stage，在问卷页面填写和提交。</p><p style={{ marginTop: 10 }}><a className="btn btn-primary" href={COOP_URL} target="_blank" rel="noopener noreferrer">填写合作意向问卷 ↗</a></p></>
        : <p className="notice" data-testid="coop-pending"><b>在线提交暂未开通（待配置）。</b>这个试玩版没有接收表单的服务器，所以这里不放提交按钮，避免你以为已经提交成功。开通后会在这里提供提交入口。</p>}
    </section> : done ? <section className="sec-card" role="status"><h2>已收到你的合作意向</h2>
      <p>状态：<span className="badge b-blue">待联系</span>　编号 {String(done.id).slice(0, 8)}</p>
      <p className="small ink2" style={{ marginTop: 8 }}>平台会通过你留下的联系方式沟通。提交意向不代表合作已经成立，也不会自动在网站上展示企业名称。</p></section>
      : <form className="sec-card" onSubmit={submit} noValidate><h2>留下合作意向</h2>
        <div className="fields">
          <label className="field"><span className="label">企业名称</span><input className="input" required maxLength={100} value={f.company} onChange={e => set('company', e.target.value)} /></label>
          <label className="field"><span className="label">联系人</span><input className="input" required maxLength={50} value={f.contactName} onChange={e => set('contactName', e.target.value)} /></label>
          <label className="field"><span className="label">手机号或工作邮箱</span><input className="input" required maxLength={100} value={f.contact} onChange={e => set('contact', e.target.value)} /></label>
          <label className="field"><span className="label">想介绍的岗位或工作场景</span><textarea className="textarea" rows={3} required maxLength={1000} value={f.roles} onChange={e => set('roles', e.target.value)} placeholder="例如：跨境电商运营，日常要看店铺数据、处理差评" /></label>
          <label className="field"><span className="label">其他说明（选填）</span><textarea className="textarea" rows={2} maxLength={2000} value={f.note} onChange={e => set('note', e.target.value)} /></label>
          <label className="choice"><input type="checkbox" checked={f.consent} onChange={e => set('consent', e.target.checked)} /><span>我同意 on stage 为合作沟通使用以上联系方式，不用于其他用途。</span></label>
        </div>
        {error && <p className="err" role="alert" style={{ marginTop: 10 }}>{error}</p>}
        <button className="btn btn-primary" style={{ marginTop: 14 }} disabled={busy}>{busy ? '正在提交…' : '提交合作意向'}</button>
      </form>}
  </div>;
}
