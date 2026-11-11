'use client';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useSession } from './session';

const safeNext = (v: string | null) => v && v.startsWith('/') && !v.startsWith('//') ? v : '/me';

export function Login() {
  const { session, api, adopt, toast } = useSession(); const router = useRouter(); const params = useSearchParams();
  const next = safeNext(params.get('next'));
  const [phone, setPhone] = useState(''), [code, setCode] = useState(''), [devCode, setDevCode] = useState(''), [sent, setSent] = useState(false);
  const [wait, setWait] = useState(0), [busy, setBusy] = useState(false), [error, setError] = useState(''), [merge, setMerge] = useState<any>(null);
  useEffect(() => { if (wait <= 0) return; const t = setTimeout(() => setWait(w => w - 1), 1000); return () => clearTimeout(t); }, [wait]);

  async function send() {
    setError(''); setBusy(true);
    try { const r = await api('auth/code', { phone }); setSent(true); setWait(60); setDevCode(r.code || ''); toast(r.mock ? '测试环境：验证码已显示在页面上' : '验证码已发送'); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function login(e: React.FormEvent) {
    e.preventDefault(); setError(''); setBusy(true);
    try {
      const r = await api('auth/login', { phone, code }); adopt(r.identity);
      if (r.merge && (r.merge.conflicts.length || r.merge.archived || r.merge.moved)) setMerge(r.merge);
      else { toast('已登录'); router.push(next); }
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function logout() {
    try { const r = await api('auth/logout', {}); adopt(r.identity); toast('已退出登录'); router.push('/'); } catch (e) { toast((e as Error).message, true); }
  }

  if (!session) return <div className="wrap page" role="status">正在载入…</div>;
  if (merge) return <div className="wrap page" style={{ maxWidth: 640 }}>
    <h1>已登录</h1>
    <div className="panel" style={{ marginTop: 16 }}><div className="panel-b stack">
      <p>登录前你在这台设备上写的作答，已按下面的规则并入账号：</p>
      <ul style={{ margin: 0, paddingLeft: 18 }}>
        {merge.moved > 0 && <li>{merge.moved} 份草稿已并入账号（账号里没有、或内容相同）。</li>}
        {merge.conflicts.length > 0 && <li><b>{merge.conflicts.length} 份和账号里的草稿不一样。</b>两份都保留了，打开体验时请选择继续哪一份。</li>}
        {merge.archived > 0 && <li>{merge.archived} 份对应你已经完成过的版本，放进了「我的 → 可恢复的作答」，只能查看。</li>}
      </ul>
      <p className="small muted">不会自动覆盖账号里已有的内容。</p>
      <div className="row"><Link className="btn btn-primary" href={next}>继续 →</Link><Link className="btn" href="/me">去「我的」查看</Link></div>
    </div></div>
  </div>;
  if (session.identity.userId) return <div className="wrap page" style={{ maxWidth: 560 }}>
    <h1>你已登录</h1><p className="lede">当前账号：{session.identity.phone}</p>
    <div className="row" style={{ marginTop: 16 }}><Link className="btn btn-primary" href={next}>继续</Link><button className="btn" onClick={logout}>退出登录</button></div>
  </div>;
  return <div className="wrap page" style={{ maxWidth: 560 }}>
    <h1>登录 on stage</h1>
    <p className="lede">用手机号登录。登录后可以收藏机会、跨设备继续岗位体验、保存体验完成记录。</p>
    {!session.loginAvailable && <p className="bad-box" style={{ marginTop: 16 }} role="alert">登录服务暂不可用：试用期间暂未开放登录。浏览内容和岗位体验仍可使用，作答会自动保存在这个浏览器里。</p>}
    {session.mock && <p className="warn-box" style={{ marginTop: 16 }}><b>本地开发 / 测试环境</b>：不会真的发短信，验证码由模拟服务随机生成并显示在下面。正式环境不会显示验证码，也没有固定验证码。</p>}
    <form className="panel" style={{ marginTop: 16 }} onSubmit={login}><div className="panel-b stack">
      <label className="field"><span className="label">手机号</span><input className="input" inputMode="numeric" autoComplete="tel" maxLength={11} value={phone} onChange={e => setPhone(e.target.value.replace(/\D/g, ''))} placeholder="11 位手机号" /></label>
      <div className="field"><label className="label" htmlFor="code">验证码</label>
        <div className="row" style={{ flexWrap: 'nowrap' }}><input id="code" className="input" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))} placeholder="6 位数字" style={{ flex: 1, minWidth: 0 }} />
          <button type="button" className="btn" disabled={busy || wait > 0 || phone.length !== 11 || !session.loginAvailable} onClick={send}>{wait > 0 ? wait + ' 秒后重发' : sent ? '重新获取' : '获取验证码'}</button></div>
        {devCode && <p className="hint" data-testid="dev-code">测试验证码：<b className="tnum">{devCode}</b>（仅开发 / 测试环境显示）</p>}
      </div>
      {error && <p className="err" role="alert">{error}</p>}
      <button className="btn btn-primary btn-block" disabled={busy || code.length !== 6 || phone.length !== 11}>登录</button>
      <div className="small ink2">
        <b>登录前写的岗位体验作答会怎样？</b>
        <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
          <li>账号里没有这个体验的草稿：直接并入账号。</li>
          <li>两份内容相同：保留账号里的。</li>
          <li>两份内容不同：两份都保留，由你选择继续哪一份，不会自动覆盖。</li>
          <li>账号已完成同一版本：这份放进「可恢复的作答」，只能查看。</li>
        </ul>
      </div>
      <p className="xs muted">on stage 只用手机号识别你的账号，不收集简历。你的岗位体验作答只有你自己能看到。</p>
    </div></form>
  </div>;
}
