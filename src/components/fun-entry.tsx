'use client';
import Link from 'next/link';
import { FUN_URL } from '@/lib/site-config';

/* 首页趣味入口「你的隐藏工位搭子」。动物模块还没做完：没有配置入口地址（FUN_URL）时，
   只展示预告，不显示按钮，避免普通用户点到不能用的功能。动物形象用已确认的 emoji，保持原色，不重画。 */
export function FunEntry() {
  return <section className="fun" aria-labelledby="fun-h">
    <div className="fun-top">
      <h2 id="fun-h"><span className="nb">你的隐藏工位搭子，</span><span className="nb">藏不住了。</span></h2>
      <span className="fun-chip">趣味探索</span>
    </div>
    <div className="fun-chat" aria-hidden="true">
      <div className="fun-row"><span className="fun-ava">🦦</span><p className="fun-bubble">没回消息，但快查明白了。</p></div>
      <div className="fun-more"><span className="fun-minis"><span className="fun-mini">🐧</span><span className="fun-mini">🦫</span><span className="fun-mini">🐈</span></span><span>还有几只正在输入…</span></div>
    </div>
    <div className="fun-foot">
      <p>情境娱乐探索，非专业人格或职业测评。</p>
      {FUN_URL ? <Link className="btn btn-primary" href={FUN_URL}>看看是谁</Link> : <span className="fun-soon" data-testid="fun-soon">还在制作中，做好后在这里打开</span>}
    </div>
  </section>;
}
