/* 「隐藏工位搭子」分享卡：在浏览器里用 canvas 画一张 1080×1920 的竖版图，不经过任何服务器。
   卡片只有：图标、角色名、一句话、on stage 品牌、探索入口（二维码 + 网址）和娱乐说明。不放用户的作答，入口链接也不带答案。
   先等字体和图标都加载好再画；任何一步失败都抛出 ShareError，界面给出明确提示和截图用的卡片视图。 */
import qrcode from 'qrcode-generator';
import { BASE_PATH, BUDDY_URL } from '../site-config';
import { DISCLAIMER, type Role } from './config';

export class ShareError extends Error { constructor(public code: 'ICON' | 'FONT' | 'CANVAS', message: string) { super(message); } }

export const iconUrl = (r: Pick<Role, 'icon'>) => `${BASE_PATH}/buddy/icons/${r.icon}`;

/** 二维码入口：配置优先；否则只在 https、非本机地址时用当前站点推导；都不满足返回 null（不画二维码） */
export function entryUrl(): string | null {
  if (BUDDY_URL) return BUDDY_URL;
  if (typeof location === 'undefined') return null;
  const local = /^(localhost|127\.|0\.0\.0\.0|\[?::1\]?$)/.test(location.hostname) || /\.(localhost|test|local)$/.test(location.hostname);
  return location.protocol === 'https:' && !local ? location.origin + BASE_PATH + '/buddy/' : null;
}

/** 识别下载受限的内置浏览器（微信、QQ、微博、钉钉、飞书等）：这些环境里 a[download] 常常没反应 */
export function downloadLimited(ua = typeof navigator === 'undefined' ? '' : navigator.userAgent) {
  return /MicroMessenger|QQ\/|MQQBrowser.*QQ|Weibo|DingTalk|Lark|Feishu|AlipayClient/i.test(ua);
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((ok, fail) => {
    const img = new Image(); img.decoding = 'async';
    img.onload = () => ok(img); img.onerror = () => fail(new ShareError('ICON', '角色图标没有加载出来'));
    img.src = src;
  });
}

const FONT = `system-ui,-apple-system,"PingFang SC","Hiragino Sans GB","Microsoft YaHei","Noto Sans SC",sans-serif`;
function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number) {
  const lines: string[] = []; let cur = '';
  for (const ch of Array.from(text)) {
    const next = cur + ch;
    if (ctx.measureText(next).width > maxW && cur) { // 标点不放在行首
      if (/[，。、！？：；）」』]/.test(ch)) { lines.push(next); cur = ''; continue; }
      lines.push(cur); cur = ch.trimStart();
    } else cur = next;
  }
  if (cur) lines.push(cur);
  return lines;
}
/** 角色名排版：先在 84→68px 之间找一行放得下的字号；放不下就用 84px 分两行，断在最靠近中间的位置（优先空格），避免末行只剩一个字。 */
export function fitName(ctx: CanvasRenderingContext2D, name: string, maxW: number) {
  for (let size = 84; size >= 68; size -= 4) { ctx.font = `800 ${size}px ${FONT}`; if (ctx.measureText(name).width <= maxW) return { size, lines: [name] }; }
  ctx.font = `800 84px ${FONT}`; const chars = Array.from(name); let best = 1, bestScore = Infinity;
  for (let i = 1; i < chars.length; i++) {
    const a = chars.slice(0, i).join('').trimEnd(), b = chars.slice(i).join('').trimStart();
    const wa = ctx.measureText(a).width, wb = ctx.measureText(b).width; if (wa > maxW || wb > maxW) continue;
    const score = Math.abs(wa - wb) - (chars[i - 1] === ' ' || chars[i] === ' ' ? 120 : 0);
    if (score < bestScore) { bestScore = score; best = i; }
  }
  return { size: 84, lines: [chars.slice(0, best).join('').trimEnd(), chars.slice(best).join('').trimStart()] };
}
function rrect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number | number[]) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); }

export const W = 1080, H = 1920;
export async function drawCard(role: Role): Promise<HTMLCanvasElement> {
  try { await document.fonts?.ready; } catch { /* 系统字体可用即可 */ }
  const icon = await loadImage(iconUrl(role));
  const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d'); if (!ctx || typeof ctx.roundRect !== 'function') throw new ShareError('CANVAS', '这个浏览器不支持生成图片');
  const ink = '#1C1C1E', mute = '#7D7A75', faint = '#A19E99';
  ctx.fillStyle = '#F6F5F2'; ctx.fillRect(0, 0, W, H);
  ctx.textBaseline = 'alphabetic'; ctx.fillStyle = ink;
  // 品牌
  ctx.font = `900 64px ${FONT}`; ctx.fillText('on stage', 80, 160);
  ctx.font = `400 34px ${FONT}`; ctx.fillStyle = mute; ctx.fillText('探索工作，也探索自己。', 80, 214);
  // 聊天区：头像 + 气泡（已确认的视觉）
  ctx.fillStyle = '#ECEAE6'; rrect(ctx, 64, 280, W - 128, 300, 48); ctx.fill();
  ctx.font = `500 30px ${FONT}`; ctx.fillStyle = faint; ctx.textAlign = 'center'; ctx.fillText('你的隐藏工位搭子发来一条消息', W / 2, 344); ctx.textAlign = 'left';
  ctx.fillStyle = '#FFFFFF'; rrect(ctx, 104, 384, 116, 116, 30); ctx.fill();
  ctx.drawImage(icon, 116, 396, 92, 92);
  // 气泡里的一句话：44→36px 之间找一行放得下的字号，放不下再换行（标点不放行首）
  const bubbleMax = W - 104 - 116 - 24 - 104 - 64; let fs = 44;
  for (; fs > 36; fs -= 2) { ctx.font = `500 ${fs}px ${FONT}`; if (ctx.measureText(role.line).width <= bubbleMax) break; }
  ctx.font = `500 ${fs}px ${FONT}`; const bl = wrap(ctx, role.line, bubbleMax), lh = Math.round(fs * 1.4);
  const bw = Math.min(bubbleMax, Math.max(...bl.map(l => ctx.measureText(l).width))) + 64, bh = bl.length * lh + 44;
  ctx.fillStyle = '#FFFFFF'; rrect(ctx, 244, 384, bw, bh, [10, 40, 40, 40]); ctx.fill();
  ctx.fillStyle = ink; bl.forEach((l, i) => ctx.fillText(l, 276, 384 + 22 + fs + i * lh));
  // 主体卡片：大图标 + 角色名（一句话已经在上面的气泡里，不再重复）
  const cardY = 640, cardH = 840;
  ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.06)'; ctx.shadowBlur = 40; ctx.shadowOffsetY = 12; ctx.fillStyle = '#FFFFFF'; rrect(ctx, 64, cardY, W - 128, cardH, 56); ctx.fill(); ctx.restore();
  ctx.drawImage(icon, 104, cardY + 56, 380, 380);
  ctx.fillStyle = ink; const nl = fitName(ctx, role.name, W - 128 - 96);
  nl.lines.forEach((l, i) => ctx.fillText(l, 112, cardY + 540 + i * nl.size * 1.24));
  ctx.fillStyle = '#EEECE8'; ctx.fillRect(112, cardY + cardH - 116, W - 224, 2);
  ctx.font = `400 30px ${FONT}`; ctx.fillStyle = faint; ctx.fillText(DISCLAIMER, 112, cardY + cardH - 58);
  // 入口：二维码 + 网址
  const url = entryUrl(), qy = 1580;
  if (url) {
    const qr = qrcode(0, 'M'); qr.addData(url); qr.make();
    const n = qr.getModuleCount(), size = 236, cell = size / (n + 8);
    ctx.fillStyle = '#FFFFFF'; rrect(ctx, 80, qy, size, size, 24); ctx.fill(); ctx.fillStyle = ink;
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) ctx.fillRect(80 + (c + 4) * cell, qy + (r + 4) * cell, Math.ceil(cell), Math.ceil(cell));
    ctx.font = `700 40px ${FONT}`; ctx.fillStyle = ink; ctx.fillText('看看你的隐藏工位搭子', 356, qy + 92);
    ctx.font = `400 26px ${FONT}`; ctx.fillStyle = mute; wrap(ctx, url.replace(/^https:\/\//, ''), W - 356 - 80).slice(0, 2).forEach((l, i) => ctx.fillText(l, 356, qy + 146 + i * 36));
  } else {
    ctx.font = `700 40px ${FONT}`; ctx.fillStyle = ink; ctx.fillText('在 on stage 看看你的隐藏工位搭子', 80, qy + 92);
  }
  return canvas;
}

export function toBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((ok, fail) => canvas.toBlob(b => b ? ok(b) : fail(new ShareError('CANVAS', '图片生成失败')), 'image/png'));
}
