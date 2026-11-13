// 分享卡「分享给好友」回归检查（试玩版静态网站）。
// 用法：npm run build:static && node tests/e2e/share-check.cjs dist-pages
// 系统分享面板和剪贴板在自动化浏览器里用替身模拟：只能验证页面交给系统的内容、按钮和提示，
// 不能代替 iPhone / 安卓真机和微信内置浏览器的实际分享测试。截图在 test-results/share/screens。
const { chromium } = require('playwright');
const http = require('node:http'), fs = require('node:fs'), path = require('node:path'), net = require('node:net');
const ROOT = path.resolve(process.argv[2] || 'dist-pages'), BASE = (process.env.PAGES_BASE ?? '/onstage').replace(/\/+$/, '');
const EXPECT_URL = process.env.BUDDY_URL || `https://shangchang-app.github.io${BASE}/buddy/`;
const OUT = path.join('test-results', 'share'), SHOTS = path.join(OUT, 'screens'); fs.mkdirSync(SHOTS, { recursive: true });
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.txt': 'text/plain; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2' };
function serve(req, res) {
  const u = new URL(req.url, 'http://x'); let p = decodeURIComponent(u.pathname);
  if (!p.startsWith(BASE + '/') && p !== BASE) { res.writeHead(404); return res.end('not found'); }
  p = p.slice(BASE.length) || '/'; let file = path.join(ROOT, p);
  if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) { if (!p.endsWith('/')) { res.writeHead(301, { location: BASE + p + '/' + u.search }); return res.end(); } file = path.join(file, 'index.html'); }
  if (!fs.existsSync(file)) { res.writeHead(404, { 'content-type': TYPES['.html'] }); return fs.createReadStream(path.join(ROOT, '404.html')).pipe(res); }
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' }); fs.createReadStream(file).pipe(res);
}
const freePort = () => new Promise(ok => { const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => ok(p)); }); });
const results = []; const ok = (c, m) => { if (!c) throw new Error(m); };
async function check(name, fn) { try { await fn(); results.push({ name, pass: true }); console.log('PASS', name); } catch (e) { results.push({ name, pass: false, error: String(e.message).slice(0, 400) }); console.log('FAIL', name, '\n   ', e.message); } }

const WECHAT_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.50(0x1800322d) NetType/WIFI Language/zh_CN';
/* 系统分享面板的替身，记录页面每次交给系统的内容。mode：
   file（能带图片）| link（只能分享链接）| abort（用户取消）| deny（带图片、只分享链接都打不开）
   filefail（带图片打不开，只分享链接能打开）| filefail-abort（带图片打不开，只分享链接时用户取消） */
const shareStub = mode => `(() => {
  window.__shared = [];
  const mode = ${JSON.stringify(mode)};
  navigator.canShare = d => mode === 'link' ? !(d && d.files && d.files.length) : true;
  navigator.share = async d => {
    const files = await Promise.all((d.files || []).map(async f => ({ name: f.name, type: f.type, size: f.size, head: Array.from(new Uint8Array(await f.slice(0, 8).arrayBuffer())) })));
    window.__shared.push({ title: d.title, text: d.text, url: d.url, files });
    const withFile = files.length > 0;
    if (mode === 'abort') throw new DOMException('cancel', 'AbortError');
    if (mode === 'deny' || (withFile && mode.startsWith('filefail'))) throw new DOMException('denied', 'NotAllowedError');
    if (!withFile && mode === 'filefail-abort') throw new DOMException('cancel', 'AbortError');
  };
})()`;
const sharedCount = p => p.evaluate(() => window.__shared.length);
const noShare = `(() => { delete Navigator.prototype.share; delete Navigator.prototype.canShare; })()`;

(async () => {
  const port = await freePort(); const server = http.createServer(serve).listen(port, '127.0.0.1');
  const SITE = `http://127.0.0.1:${port}${BASE}`;
  const b = await chromium.launch();
  const mobile = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
  const ctx = async (o = {}, init) => { const c = await b.newContext({ viewport: { width: 1280, height: 860 }, ...o }); if (init) await c.addInitScript(init); const p = await c.newPage(); p.errors = []; p.on('pageerror', e => p.errors.push(e.message)); p.on('console', m => { if (m.type() === 'error') p.errors.push(m.text()); }); return { c, p }; };
  /* 做完 8 题（并列时加题），每题选第二个选项；返回结果角色名和用户选过的选项文字（检查分享内容里没有作答）。 */
  const finish = async p => {
    await p.goto(SITE + '/buddy/', { waitUntil: 'networkidle' }); await p.getByRole('button', { name: '开始' }).click();
    const picked = [];
    for (let i = 0; i < 12 && !(await p.locator('.bd-result h1').count()); i++) {
      const opts = p.locator('.bd-opt'); await opts.first().waitFor(); const o = opts.nth(Math.min(1, (await opts.count()) - 1));
      picked.push((await o.innerText()).trim()); await o.click(); await p.locator('.bd-nav .btn-primary').click(); await p.waitForTimeout(250);
    }
    await p.locator('.bd-result h1').waitFor();
    return { name: (await p.locator('.bd-result h1').innerText()).trim(), picked };
  };
  const openShare = async p => { await p.locator('.bd-actions').getByRole('button', { name: '分享给好友' }).click(); await p.waitForSelector('.modal .bd-share-img'); const m = p.locator('.modal'); await m.locator('img').evaluate(i => i.complete || new Promise(r => i.onload = r)); return m; };
  const noAnswers = (text, picked) => picked.every(t => !text.includes(t));

  await check('手机浏览器能分享图片：「分享给好友」打开系统分享，带上分享卡图片（PNG）、一句话和探索链接；不带作答；提示不说「成功」', async () => {
    const { c, p } = await ctx(mobile, shareStub('file')); const { name, picked } = await finish(p);
    const m = await openShare(p); ok((await m.locator('h2, .modal-h').first().innerText()).includes('分享给好友'), '弹窗标题不对');
    const box = await m.getByTestId('share-system').boundingBox();
    ok(box && box.y >= 0 && box.y + box.height <= 844, '手机上打开弹窗后看不到「分享给好友」按钮（要滚动才能看到）：' + JSON.stringify(box));
    await p.screenshot({ path: path.join(SHOTS, 'h01-手机-分享弹窗.png') });
    await m.getByTestId('share-system').click(); await p.waitForFunction(() => window.__shared.length === 1);
    const s = (await p.evaluate(() => window.__shared))[0];
    ok(s.files.length === 1 && /^on-stage-buddy-[a-z]+\.png$/.test(s.files[0].name) && s.files[0].type === 'image/png' && s.files[0].size > 20000, '没有带上分享卡图片：' + JSON.stringify(s.files));
    ok(JSON.stringify(s.files[0].head) === JSON.stringify([137, 80, 78, 71, 13, 10, 26, 10]), '图片不是 PNG');
    ok(s.text.includes(name) && s.text.includes(EXPECT_URL) && s.title === '我的隐藏工位搭子', '分享文字不对：' + s.text);
    ok(noAnswers(s.text + s.title, picked), '分享文字里带了作答');
    const t = await m.innerText(); ok(t.includes('已把分享卡交给你选的 App') && !/成功/.test(t), '分享后的提示不对：' + t.replace(/\s+/g, ' ').slice(-120));
    await p.screenshot({ path: path.join(SHOTS, 'h02-手机-交给系统分享后.png') });
    ok(p.errors.length === 0, p.errors.join(' | ')); await c.close();
  });

  await check('浏览器只能分享链接（不能带图片）：改为分享探索链接，并提示想发图片可以先下载', async () => {
    const { c, p } = await ctx(mobile, shareStub('link')); await finish(p); const m = await openShare(p);
    await m.getByTestId('share-system').click(); await p.waitForFunction(() => window.__shared.length === 1);
    const s = (await p.evaluate(() => window.__shared))[0];
    ok(s.files.length === 0 && s.url === EXPECT_URL && !/[?#]/.test(s.url), '没有改为分享链接，或链接带了参数：' + JSON.stringify(s));
    ok((await m.innerText()).includes('已改为分享探索链接'), '没有说明改为分享链接');
    ok(await m.getByTestId('share-link-only').count() === 0, '已经分享了链接，不应再显示「仅分享链接」');
    ok(p.errors.length === 0, p.errors.join(' | ')); await c.close();
  });

  await check('用户在系统分享面板里取消：不报错、不说已分享、不自动重试，也不弹出「仅分享链接」', async () => {
    const { c, p } = await ctx(mobile, shareStub('abort')); await finish(p); const m = await openShare(p);
    await m.getByTestId('share-system').click(); await p.waitForFunction(() => window.__shared.length === 1); await p.waitForTimeout(600);
    const t = await m.innerText(); ok(!t.includes('已把') && !t.includes('没有打开') && !/成功/.test(t) && (await m.locator('.bd-note.bad').count()) === 0, '取消后不应有提示：' + t.replace(/\s+/g, ' ').slice(-120));
    ok(await sharedCount(p) === 1, '取消后不应自动再调一次系统分享');
    ok(await m.getByTestId('share-link-only').count() === 0, '用户取消不是失败，不应显示「仅分享链接」');
    ok(p.errors.length === 0, p.errors.join(' | ')); await c.close();
  });

  await check('带图片分享打不开：不自动重试；显示独立的「仅分享链接」按钮和复制链接、下载图片；再点仍打不开时明确说没有打开', async () => {
    const { c, p } = await ctx(mobile, shareStub('deny')); await finish(p); const m = await openShare(p);
    await m.getByTestId('share-system').click(); await p.waitForFunction(() => window.__shared.length === 1); await p.waitForTimeout(600);
    ok(await sharedCount(p) === 1, '带图片分享失败后不应自动改为分享链接（要等用户再点）');
    let t = await m.innerText(); ok(t.includes('带图片的分享没有打开') && t.includes('仅分享链接') && t.includes('复制链接') && !/成功/.test(t), '失败提示不对：' + t.replace(/\s+/g, ' ').slice(-160));
    const lo = m.getByTestId('share-link-only'); await lo.waitFor();
    const box = await lo.boundingBox(); ok(box && box.y + box.height <= 844, '手机上看不到「仅分享链接」按钮：' + JSON.stringify(box));
    await p.waitForTimeout(400); const nb = await m.getByTestId('share-msg').boundingBox(), lb = await lo.boundingBox();
    ok(nb && nb.y >= 0 && nb.y + nb.height <= 844 && lb.y >= 0 && lb.y + lb.height <= 844, '手机上失败提示和「仅分享链接」应同时看得到：' + JSON.stringify({ nb, lb }));
    ok(await m.getByRole('button', { name: '复制链接' }).count() === 1 && await m.getByRole('button', { name: '下载图片' }).count() === 1, '缺少替代办法的按钮');
    await p.screenshot({ path: path.join(SHOTS, 'h05-手机-图片分享失败.png') });
    await lo.click(); await p.waitForFunction(() => window.__shared.length === 2); await p.waitForTimeout(300);
    const s2 = (await p.evaluate(() => window.__shared))[1]; ok(s2.files.length === 0 && s2.url === EXPECT_URL, '「仅分享链接」应只交给系统探索链接：' + JSON.stringify(s2));
    t = await m.innerText(); ok(t.includes('仅分享链接也没有打开') && !/成功/.test(t), '再次失败的提示不对：' + t.replace(/\s+/g, ' ').slice(-160));
    ok(p.errors.length === 0, p.errors.join(' | ')); await c.close();
  });

  await check('带图片分享打不开、用户再点「仅分享链接」：只交给系统不带参数的探索链接（不带图片和作答），提示交给了 App，不说成功', async () => {
    const { c, p } = await ctx(mobile, shareStub('filefail')); const { name, picked } = await finish(p); const m = await openShare(p);
    await m.getByTestId('share-system').click(); await p.waitForFunction(() => window.__shared.length === 1);
    await m.getByTestId('share-link-only').click(); await p.waitForFunction(() => window.__shared.length === 2); await p.waitForTimeout(300);
    const s = (await p.evaluate(() => window.__shared))[1];
    ok(s.files.length === 0 && s.url === EXPECT_URL && !/[?#]/.test(s.url) && s.text.includes(name) && noAnswers(s.text + s.title, picked), '仅分享链接的内容不对：' + JSON.stringify(s));
    const t = await m.innerText(); ok(t.includes('已把探索链接交给你选的 App') && !/成功/.test(t), '提示不对：' + t.replace(/\s+/g, ' ').slice(-160));
    ok(await m.getByTestId('share-link-only').count() === 0, '链接已交出后不应再显示「仅分享链接」');
    ok(p.errors.length === 0, p.errors.join(' | ')); await c.close();
  });

  await check('「仅分享链接」时用户取消：不提示、不说成功、不自动再试，按钮保留可以再点', async () => {
    const { c, p } = await ctx(mobile, shareStub('filefail-abort')); await finish(p); const m = await openShare(p);
    await m.getByTestId('share-system').click(); await p.waitForFunction(() => window.__shared.length === 1);
    await m.getByTestId('share-link-only').click(); await p.waitForFunction(() => window.__shared.length === 2); await p.waitForTimeout(600);
    ok(await sharedCount(p) === 2, '取消后不应自动再调系统分享');
    const t = await m.innerText(); ok(!t.includes('已把') && !t.includes('没有打开') && !/成功/.test(t) && (await m.locator('.bd-note.bad').count()) === 0, '取消后不应有提示：' + t.replace(/\s+/g, ' ').slice(-160));
    ok(await m.getByTestId('share-link-only').count() === 1, '取消后「仅分享链接」应保留');
    ok(p.errors.length === 0, p.errors.join(' | ')); await c.close();
  });

  await check('电脑浏览器没有系统分享：不显示「分享给好友」按钮；复制链接把一句话和探索链接放进剪贴板；下载图片仍可用', async () => {
    const { c, p } = await ctx({ permissions: ['clipboard-read', 'clipboard-write'] }, noShare); const { name, picked } = await finish(p); const m = await openShare(p);
    ok(await m.getByTestId('share-system').count() === 0, '不支持系统分享时不应显示「分享给好友」');
    ok((await m.innerText()).includes('调不起系统分享面板'), '没有说明怎么分享');
    await m.getByRole('button', { name: '复制链接' }).click(); await p.waitForTimeout(300);
    const clip = await p.evaluate(() => navigator.clipboard.readText());
    ok(clip.includes(name) && clip.trim().endsWith(EXPECT_URL) && noAnswers(clip, picked), '复制的内容不对：' + clip);
    ok((await m.innerText()).includes('已复制一句话和探索链接'), '复制后没有提示');
    const [dl] = await Promise.all([p.waitForEvent('download'), m.getByRole('button', { name: '下载图片' }).click()]); ok(/^on-stage-buddy-[a-z]+\.png$/.test(dl.suggestedFilename()), '下载文件名不对');
    await m.screenshot({ path: path.join(SHOTS, 'h03-桌面-复制链接.png') });
    ok(p.errors.length === 0, p.errors.join(' | ')); await c.close();
  });

  await check('剪贴板不能用：显示要分享的文字，让用户手动复制，不假装复制成功', async () => {
    const { c, p } = await ctx({}, noShare + ';navigator.clipboard.writeText = () => Promise.reject(new Error("blocked"));'); await finish(p); const m = await openShare(p);
    await m.getByRole('button', { name: '复制链接' }).click(); const ta = m.getByTestId('share-manual'); await ta.waitFor();
    ok((await ta.inputValue()).includes(EXPECT_URL), '手动复制的文字里没有链接');
    const t = await m.innerText(); ok(t.includes('手动复制') && !t.includes('已复制'), '剪贴板失败时提示不对');
    ok(p.errors.length === 0, p.errors.join(' | ')); await c.close();
  });

  await check('微信内置浏览器（模拟 UA）：长按提示在图片上方、390px 第一屏可见，用条件式说法（不承诺一定有「发送给朋友」）；不显示下载和「分享给好友」；图片可长按（data: 图片）；保留复制链接和截图', async () => {
    const { c, p } = await ctx({ ...mobile, userAgent: WECHAT_UA }, shareStub('file')); await finish(p); const m = await openShare(p);
    ok(await m.getByRole('button', { name: '下载图片' }).count() === 0 && await m.getByTestId('share-system').count() === 0, '微信里不应显示下载或系统分享按钮');
    const hint = m.getByTestId('share-inapp'), t = await hint.innerText();
    ok(t.includes('长按下面的图片') && t.includes('如果菜单里有「发送给朋友」') && t.includes('保存图片') && t.includes('···') && t.includes('复制链接') && t.includes('截图'), '微信里的分享提示不对：' + t);
    ok(!/可以选「发送给朋友」|一定/.test(t), '不应承诺所有微信版本都有「发送给朋友」：' + t);
    const hb = await hint.boundingBox(), ib = await m.locator('.bd-share-img').boundingBox();
    ok(hb && ib && hb.y + hb.height <= ib.y + 1, '长按提示应在图片上方：' + JSON.stringify({ hb, ib }));
    ok(hb.y >= 0 && hb.y + hb.height <= 844, '390px 打开弹窗第一屏看不到长按提示：' + JSON.stringify(hb));
    ok((await m.locator('.bd-share-img').getAttribute('src')).startsWith('data:image/png'), '微信里图片应是 data: 图片，长按才能发送或保存');
    ok(await m.getByRole('button', { name: '复制链接' }).count() === 1, '微信里应能复制链接');
    ok(!/成功/.test(await m.innerText()), '不应显示成功');
    await p.screenshot({ path: path.join(SHOTS, 'h04-手机-微信内置浏览器.png') });
    ok(p.errors.length === 0, p.errors.join(' | ')); await c.close();
  });

  await b.close(); server.close();
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2));
  const passed = results.filter(r => r.pass).length; console.log(`\n${passed}/${results.length} 通过`);
  process.exit(passed === results.length ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
