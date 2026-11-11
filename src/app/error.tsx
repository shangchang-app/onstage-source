'use client';
export default function Error({ reset }: { error: Error; reset: () => void }) {
  return <div className="wrap page" role="alert"><h1>页面出错了</h1><p className="lede">你已保存的草稿不会丢失。可以重试，或者回到首页。</p><p className="row" style={{ marginTop: 16 }}><button className="btn btn-primary" onClick={reset}>重试</button><a className="btn" href="/">回到首页</a></p></div>;
}
