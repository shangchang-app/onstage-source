#!/usr/bin/env node
/* 检查「隐藏工位搭子」分享卡二维码指向的页面。分两种，结论分开写，互不代替：

   本地（合并前，PR 测试里跑）：  node scripts/check-qr-target.mjs --local dist-pages
     读取打包进二维码的网址（dist-pages/buddy-entry.json），检查它是 https、不是本机地址、不带参数；
     再在本机按 GitHub Pages 的规则（同样的路径前缀）提供 dist-pages，真的请求这个网址的路径，要求 200 且是隐藏工位搭子页面，
     页面引用的脚本和样式也都能取到。证明的是「这个构建部署到那个网址后，路径是对的」，不证明网址现在已经能打开。

   线上（部署成功之后才跑）：     node scripts/check-qr-target.mjs <网址> --commit abc1234 --retries 10
     真正请求线上网址，要求 200、是隐藏工位搭子页面，并核对同站 version.json 的提交号。
     这里只检查服务器/电脑能否打开；手机扫码、微信内打开、中国大陆移动网络访问 github.io 仍需真机确认。

   没给网址也没给 --local 时，按线上方式检查 buddy-entry.json 里的网址。 */
import { createServer } from 'node:http';
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';

const args = process.argv.slice(2);
const opt = k => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
const sleep = s => new Promise(r => setTimeout(r, s * 1000));
const fail = m => { console.error('[qr] ' + m); process.exit(1); };
const entryOf = dir => { try { return JSON.parse(readFileSync(join(dir, 'buddy-entry.json'), 'utf8')).url; } catch { return null; } };

const localDir = opt('--local');
if (localDir) {
  const ROOT = resolve(localDir), url = entryOf(ROOT);
  if (!url) fail(`${ROOT}/buddy-entry.json 不存在：没有用 build:static 打包，或者打包脚本没写入二维码网址`);
  const u = new URL(url);
  if (u.protocol !== 'https:') fail('二维码网址不是 https：' + url);
  if (/^(localhost|127\.|0\.0\.0\.0|\[?::1\]?)/.test(u.hostname) || /\.(localhost|test|local)$/.test(u.hostname)) fail('二维码网址指向本机或测试域名：' + url);
  if (u.search || u.hash) fail('二维码网址不应带参数（不能带作答）：' + url);
  const v = JSON.parse(readFileSync(join(ROOT, 'version.json'), 'utf8'));
  const base = v.base === '/' ? '' : v.base;
  if (!u.pathname.startsWith(base + '/')) fail(`二维码网址的路径 ${u.pathname} 不在这个构建的路径前缀 ${base}/ 下`);
  const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };
  const server = createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (!p.startsWith(base + '/')) { res.writeHead(404); return res.end(); }
    p = p.slice(base.length) || '/'; let f = join(ROOT, p);
    if (!f.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
    if (existsSync(f) && statSync(f).isDirectory()) { if (!p.endsWith('/')) { res.writeHead(301, { location: base + p + '/' }); return res.end(); } f = join(f, 'index.html'); }
    if (!existsSync(f)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': TYPES[extname(f)] || 'application/octet-stream' }); createReadStream(f).pipe(res);
  }).listen(0, '127.0.0.1');
  await new Promise(r => server.once('listening', r));
  const origin = `http://127.0.0.1:${server.address().port}`;
  try {
    const r = await fetch(origin + u.pathname); if (r.status !== 200) fail(`本地按二维码路径 ${u.pathname} 打开得到 HTTP ${r.status}`);
    const html = await r.text(); if (!html.includes('你的隐藏工位搭子')) fail('本地按二维码路径打开的不是隐藏工位搭子页面');
    const refs = [...new Set([...html.matchAll(/(?:src|href)="(\/[^"]+\.(?:js|css))"/g)].map(m => m[1]))];
    for (const ref of refs) { const x = await fetch(origin + ref); if (x.status !== 200) fail(`页面引用的 ${ref} 取不到（HTTP ${x.status}）`); }
    console.log(`[qr] 本地检查通过：二维码网址 ${url}（https、非本机、无参数）；按 GitHub Pages 路径 ${u.pathname} 在本机打开是隐藏工位搭子页面，${refs.length} 个脚本/样式都能取到；构建提交 ${v.commit}。`);
    console.log('[qr] 注意：这一步没有访问线上网址。线上能否打开、是不是这个提交，要等部署成功后由线上检查确认。');
  } finally { server.close(); }
  process.exit(0);
}

let url = args.find(a => /^https?:\/\//.test(a)) || entryOf('dist-pages');
if (!url) fail('没有给网址，也找不到 dist-pages/buddy-entry.json');
const commit = opt('--commit'), retries = Number(opt('--retries') || 1), wait = Number(opt('--wait') || 15);
async function once() {
  const r = await fetch(url, { redirect: 'follow', cache: 'no-store' });
  if (r.status !== 200) throw new Error(`HTTP ${r.status}`);
  const html = await r.text();
  if (!html.includes('你的隐藏工位搭子')) throw new Error('页面打开了，但不是隐藏工位搭子模块');
  if (commit) {
    const v = await (await fetch(new URL('../version.json', r.url), { cache: 'no-store' })).json();
    if (!String(v.commit).startsWith(commit)) throw new Error(`站点部署的是提交 ${v.commit}，不是 ${commit}`);
    const stamp = html.match(/源码提交\s*(?:<!-- -->)?\s*([0-9a-f]{7}[\w-]*)/);
    if (stamp && !stamp[1].startsWith(commit)) throw new Error(`页面页脚的提交号是 ${stamp[1]}，不是 ${commit}`);
  }
}
for (let i = 1; i <= retries; i++) {
  try { await once(); console.log(`[qr] 线上检查通过：${url} 可以打开${commit ? '，version.json 和页脚都是提交 ' + commit : ''}。`); process.exit(0); }
  catch (e) { console.log(`[qr] 第 ${i}/${retries} 次：${url} 打不开或版本不对（${e.message}）`); if (i < retries) await sleep(wait); }
}
fail('二维码指向的页面现在打不开或不是这个版本，不要发布或分享这个版本的分享卡。');
