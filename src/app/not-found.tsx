import Link from 'next/link';
export default function NotFound() { return <div className="wrap page"><h1>找不到这个页面</h1><p className="lede">链接可能已失效，或者内容已下架。</p><p style={{ marginTop: 16 }}><Link className="btn" href="/">回到首页</Link></p></div>; }
