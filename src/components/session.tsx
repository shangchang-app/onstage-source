'use client';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Modal } from './modal';
import { installStaticApi } from '../lib/static-api';

/* 免费试玩版（纯静态托管）：页面加载时立刻接管 /api/* 请求，必须早于任何组件发起请求。 */
if (typeof window !== 'undefined' && process.env.NEXT_PUBLIC_STATIC === '1') installStaticApi();

export type Identity = { owner: string; userId: string | null; stamp: string; role: string; phone?: string };
type Session = { identity: Identity; mock: boolean; loginAvailable: boolean; sessionDays?: number; staticTrial?: boolean };
export class ApiError extends Error { constructor(message: string, public code: string, public status: number, public detail?: unknown) { super(message); } }
type Ctx = {
  session: Session | null; blocked: boolean;
  api: (path: string, body?: unknown) => Promise<any>;
  toast: (text: string, bad?: boolean) => void;
  adopt: (identity: Identity) => void;
};
const SessionContext = createContext<Ctx>(null!);
export const useSession = () => useContext(SessionContext);

const NAV: [string, string, string][] = [
  ['/', '首页', 'M3 10.5 12 4l9 6.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z'],
  ['/events', '机会库', 'M5 21V4h12l-2.5 4L17 12H5'],
  ['/experiences', '岗位体验', 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM10 8.5 15.5 12 10 15.5z'],
  ['/companies', '企业', 'M3 21h18M5 21V6l7-3v18M12 9h7v12'],
  ['/me', '我的', 'M12 4a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM4 21c1.6-4 4.6-6 8-6s6.4 2 8 6']
];
function current(path: string, href: string) {
  if (href === '/') return path === '/';
  if (href === '/events') return path.startsWith('/events') || path.startsWith('/jobs');
  if (href === '/me') return path.startsWith('/me') || path.startsWith('/records') || path.startsWith('/login');
  return path.startsWith(href);
}

export function Provider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [blocked, setBlocked] = useState(false), [collapsed, setCollapsed] = useState(false);
  const [toastMsg, setToast] = useState<{ text: string; bad?: boolean } | null>(null);
  const identity = useRef<Identity | null>(null);
  const channel = useRef<BroadcastChannel | null>(null);
  const path = usePathname() || '/';

  const pending = useRef<Promise<void> | null>(null);
  /* 同一时间只发一个会话核对请求：第一次访问还没有 cookie 时，并发请求会各自领到不同的游客会话，被误判为身份变化。 */
  const check = useCallback(() => {
    if (!pending.current) pending.current = checkOnce().finally(() => { pending.current = null; });
    return pending.current;
  }, []);
  const checkOnce = async () => {
    try {
      const r = await fetch('/api/session', { cache: 'no-store' }); if (!r.ok) throw new Error();
      const s: Session = await r.json();
      // 本页载入后，如果另一个标签页切换了账号，这里的会话戳会变化：暂停所有写入，不静默换账号。
      if (identity.current && identity.current.stamp !== s.identity.stamp) { setBlocked(true); return; }
      identity.current = s.identity; setSession(s);
    } catch { /* 网络暂时不可用：保持当前身份，写入失败时会提示 */ }
  };
  useEffect(() => {
    void check();
    const timer = setInterval(check, 15000);
    const focus = () => void check();
    window.addEventListener('focus', focus);
    document.addEventListener('visibilitychange', focus);
    if ('BroadcastChannel' in window) { channel.current = new BroadcastChannel('onstage-session'); channel.current.onmessage = focus; }
    return () => { clearInterval(timer); window.removeEventListener('focus', focus); document.removeEventListener('visibilitychange', focus); channel.current?.close(); };
  }, [check]);
  useEffect(() => { if (!toastMsg) return; const t = setTimeout(() => setToast(null), 4200); return () => clearTimeout(t); }, [toastMsg]);

  const toast = useCallback((text: string, bad?: boolean) => setToast({ text, bad }), []);
  /* 本页自己登录或退出后：采用新身份，并通知其他标签页重新核对身份。 */
  const adopt = useCallback((id: Identity) => {
    identity.current = id; setSession(s => s ? { ...s, identity: id } : s);
    channel.current?.postMessage('identity-changed');
    try { localStorage.setItem('onstage:identity-changed', String(Date.now())); } catch { /* ignore */ }
  }, []);
  useEffect(() => {
    const onStorage = (e: StorageEvent) => { if (e.key === 'onstage:identity-changed') void check(); };
    window.addEventListener('storage', onStorage); return () => window.removeEventListener('storage', onStorage);
  }, [check]);

  const api = useCallback(async (p: string, body?: unknown) => {
    if (blocked) throw new ApiError('登录身份已变化，写入已暂停。请重新载入页面后继续', 'IDENTITY_CHANGED', 409);
    if (!identity.current) { await check(); if (!identity.current) throw new ApiError('暂时无法连接服务，请检查网络后重试', 'NETWORK', 0); }
    let r: Response;
    try {
      r = await fetch('/api/' + p, { method: body === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json', 'x-session': identity.current!.stamp }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), cache: 'no-store' });
    } catch { throw new ApiError('网络连接失败，内容没有发出。请检查网络后重试', 'NETWORK', 0); }
    let data: any = null; try { data = await r.json(); } catch { /* 非 JSON 响应 */ }
    if (!r.ok) {
      if (data && ['IDENTITY_CHANGED', 'SESSION_EXPIRED'].includes(data.code)) setBlocked(true);
      throw new ApiError(data?.error || '服务暂时不可用，请稍后重试', data?.code || 'SERVER', r.status, data?.fields ?? data?.detail);
    }
    return data;
  }, [blocked, check]);

  const user = session?.identity.userId;
  return <SessionContext.Provider value={{ session, blocked, api, toast, adopt }}>
    <div className="shell">
      <a className="skip" href="#main">跳到主要内容</a>
      {session?.mock && <div className="dev-bar" role="note">本地开发 / 测试环境：手机验证码由模拟服务生成并显示在页面上。正式环境不会这样。</div>}
      {blocked && collapsed && <div className="blocked-bar" role="alert">登录身份已变化，保存和提交已暂停。<button onClick={() => window.location.reload()}>重新载入</button></div>}
      <header className="site-head"><div className="wrap head-in">
        <Link className="brand" href="/" aria-label="on stage 首页"><span className="wm">on stage</span></Link>
        <nav className="nav" aria-label="主导航">{NAV.map(([h, l]) => <Link key={h} href={h} aria-current={current(path, h) ? 'page' : undefined}>{l}</Link>)}</nav>
        {user ? <Link className="user-chip" href="/me">{session?.identity.phone || '管理员'}</Link> : session?.loginAvailable === false ? <span className="badge b-gray" title="试用期间暂未开放登录">试用版</span> : session ? <Link className="btn btn-sm" href={'/login?next=' + encodeURIComponent(path)}>登录</Link> : null}
      </div></header>
      <main id="main" tabIndex={-1}>{children}</main>
      <footer className="foot"><div className="wrap">
        <div className="brand"><span className="wm">on stage</span></div>
        <p>探索工作，也探索自己。面向大学生的 AI、出海及互联网职业机会与实践平台。</p>
        <p>岗位体验是线上模拟的工作场景，自愿参加：不是实习经历、能力认证或录用保证，也不是投递门槛。on stage 不收集简历。</p>
        <p><Link href="/cooperate">企业合作</Link>{session?.identity.role === 'admin' && <> · <Link href="/admin">内部后台</Link></>}</p>
        {process.env.NEXT_PUBLIC_VERSION && <p className="xs" data-testid="build-stamp">版本 {process.env.NEXT_PUBLIC_VERSION} · 源码提交 {process.env.NEXT_PUBLIC_COMMIT || '未记录'}</p>}
      </div></footer>
      <nav className="tabbar" aria-label="底部导航">{NAV.map(([h, l, d]) => <Link key={h} href={h} aria-current={current(path, h) ? 'page' : undefined}><span className="ti" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg></span><span>{l}</span></Link>)}</nav>
      <div aria-live="polite" role="status">{toastMsg && <div className={'toast' + (toastMsg.bad ? ' bad' : '')}>{toastMsg.text}</div>}</div>
      <Modal open={blocked && !collapsed} title="登录身份已变化" role="alertdialog" onClose={() => setCollapsed(true)}
        footer={<><button className="btn" onClick={() => setCollapsed(true)}>先收起，复制内容</button><button className="btn btn-primary" onClick={() => window.location.reload()}>重新载入并核对身份</button></>}>
        <p>另一个页面登录或退出了账号。为了不把作答写进错误的账号，这个页面的保存和提交已经暂停。</p>
        <p className="muted small">未保存的内容仍在这个页面上，可以先复制。重新载入后，请确认当前账号再继续。</p>
      </Modal>
    </div>
  </SessionContext.Provider>;
}
