'use client';
import Link from 'next/link';
import { FUN_URL } from '@/lib/site-config';
import { roleById, DISCLAIMER } from '@/lib/buddy/config';
import { Icon } from './buddy';

/* 首页趣味入口「你的隐藏工位搭子」。V1.7 起模块已经做好，按钮默认打开站内 /buddy/（NEXT_PUBLIC_FUN_URL 可以改成别的站内地址）。
   动物形象用随站点部署的图标（11 个 Noto Emoji + 自制边牧、鸭嘴兽），不依赖系统 emoji 字体，手机和电脑看到的一样。
   「正在输入」只放常规角色，不出现隐藏角色。 */
const TYPING = ['penguin', 'fox', 'cat'] as const;
export function FunEntry() {
  const otter = roleById('otter');
  return <section className="fun" aria-labelledby="fun-h">
    <div className="fun-top">
      <h2 id="fun-h"><span className="nb">你的隐藏工位搭子，</span><span className="nb">藏不住了。</span></h2>
      <span className="fun-chip">趣味探索</span>
    </div>
    <div className="fun-chat" aria-hidden="true">
      <div className="fun-row"><span className="fun-ava"><Icon role={otter} size={36} /></span><p className="fun-bubble">{otter.line}</p></div>
      <div className="fun-more"><span className="fun-minis">{TYPING.map(id => <span className="fun-mini" key={id}><Icon role={roleById(id)} size={22} /></span>)}</span><span>还有几只正在输入…</span></div>
    </div>
    <div className="fun-foot">
      <p>{DISCLAIMER}</p>
      <Link className="btn btn-primary" href={FUN_URL || '/buddy/'}>看看是谁</Link>
    </div>
  </section>;
}
