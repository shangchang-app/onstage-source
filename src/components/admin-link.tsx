'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from './session';

/* 管理员一次性登录：链接只能在服务器命令行生成（npm run admin:link）。
   口令放在 # 后面，不会出现在服务器访问日志里；需要手动点按钮才会使用，避免被链接预览自动消耗。 */
export function AdminLink() {
  const { session, api, adopt, toast } = useSession(); const router = useRouter();
  const [token, setToken] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  useEffect(() => { const t = window.location.hash.slice(1); setToken(t); if (t) history.replaceState(null, '', window.location.pathname); }, []);
  async function go() {
    setBusy(true); setError('');
    try { const r = await api('auth/link', { token }); adopt(r.identity); setToken(''); toast('已以管理员身份登录（12 小时内有效）'); router.push('/admin'); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  if (!session) return <div className="wrap page" role="status">正在载入…</div>;
  return <div className="wrap page" style={{ maxWidth: 560 }}>
    <h1>管理员登录</h1>
    <p className="lede">这个页面只用于平台管理员。登录链接需要在服务器上生成，15 分钟内有效，只能使用一次。</p>
    {!token ? <p className="notice" style={{ marginTop: 16 }}>链接不完整或已经使用。请在服务器上重新运行 <code>npm run admin:link -- 手机号</code>。</p>
      : <p style={{ marginTop: 16 }}><button className="btn btn-primary" disabled={busy} onClick={go}>{busy ? '正在登录…' : '以管理员身份登录'}</button></p>}
    {error && <p className="err" role="alert" style={{ marginTop: 10 }}>{error}</p>}
  </div>;
}
