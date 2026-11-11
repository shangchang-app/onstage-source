// 免费试玩版检查：用一个模拟 GitHub Pages 行为的静态服务器（/仓库名/ 路径、目录补斜杠、404.html）打开 dist-pages，
// 用真实 Chromium 走一遍学生会做的事。用法：npm run build:static && npm run test:pages
const { chromium } = require('playwright');
const http = require('node:http'), fs = require('node:fs'), path = require('node:path'), net = require('node:net');
const ROOT = path.resolve(process.argv[2] || 'dist-pages'), BASE = (process.env.PAGES_BASE ?? '/onstage').replace(/\/+$/, '');
const OUT = path.join('test-results', 'pages'), SHOTS = path.join(OUT, 'shots'); fs.mkdirSync(SHOTS, { recursive: true });
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.txt': 'text/plain; charset=utf-8', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2' };
function serve(req, res) {
  const u = new URL(req.url, 'http://x'); let p = decodeURIComponent(u.pathname);
  if (!p.startsWith(BASE + '/') && p !== BASE) { res.writeHead(404); return res.end('not found'); }
  p = p.slice(BASE.length) || '/';
  let file = path.join(ROOT, p);
  if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) {
    if (!p.endsWith('/')) { res.writeHead(301, { location: BASE + p + '/' + u.search }); return res.end(); }
    file = path.join(file, 'index.html');
  }
  if (!fs.existsSync(file)) { res.writeHead(404, { 'content-type': TYPES['.html'] }); return fs.createReadStream(path.join(ROOT, '404.html')).pipe(res); }
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' }); fs.createReadStream(file).pipe(res);
}
const freePort = () => new Promise(ok => { const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => ok(p)); }); });
const results = []; const ok = (c, m) => { if (!c) throw new Error(m); };
async function check(name, fn) { try { await fn(); results.push({ name, pass: true }); console.log('PASS', name); } catch (e) { results.push({ name, pass: false, error: String(e.message).slice(0, 400) }); console.log('FAIL', name, '\n   ', e.message); } }

(async () => {
  ok(fs.existsSync(path.join(ROOT, '.nojekyll')), '缺少 .nojekyll（GitHub Pages 会忽略 _next 目录）');
  const port = await freePort(); const server = http.createServer(serve).listen(port, '127.0.0.1');
  const SITE = `http://127.0.0.1:${port}${BASE}`, W = SITE + '/experiences/ops-returns/work/';
  const b = await chromium.launch();
  const ctx = async (o = {}) => { const c = await b.newContext({ viewport: { width: 1280, height: 860 }, ...o }); const p = await c.newPage(); p.errors = []; p.on('pageerror', e => p.errors.push(e.message)); p.on('console', m => { if (m.type() === 'error') p.errors.push(m.text()); }); return { c, p }; };
  const waitSaved = p => p.waitForFunction(() => /已保存/.test(document.querySelector('.work-head .save-state')?.textContent || ''), null, { timeout: 15000 });
  const practice = async p => { await p.goto(W, { waitUntil: 'networkidle' }); await p.click('.stepper li:nth-child(4) button'); await p.waitForSelector('#f-p1-before'); };

  await check('首页：内容正常，标注示例和试用版，没有登录入口和测试提示条，没有脚本错误', async () => {
    const { c, p } = await ctx(); await p.goto(SITE + '/', { waitUntil: 'networkidle' });
    const t = await p.locator('main').innerText(); ok(t.includes('商品退货率上升') && t.includes('示例'), '首页内容缺失');
    ok(await p.locator('.site-head .badge:has-text("试用版")').count() === 1 && await p.locator('.site-head a:has-text("登录")').count() === 0, '页头状态不对');
    ok(await p.locator('.dev-bar').count() === 0, '出现测试环境提示条');
    ok((await p.locator('a[href^="/experiences"]').count()) === 0, '有链接缺少仓库路径前缀');
    await p.screenshot({ path: path.join(SHOTS, 'pages-home.png') });
    ok(p.errors.length === 0, p.errors.join(' | ')); await c.close();
  });
  await check('专属链接：直接打开体验页（带或不带结尾斜杠）都能进入', async () => {
    const { c, p } = await ctx();
    for (const u of [SITE + '/experiences/ops-returns/', SITE + '/experiences/ops-returns']) { await p.goto(u, { waitUntil: 'networkidle' }); ok((await p.locator('h1').innerText()).includes('商品退货率上升'), '打不开：' + u); }
    ok(await p.locator('a:has-text("开始体验")').isVisible(), '没有开始按钮'); await c.close();
  });
  await check('点击导航走完整路径：首页 → 岗位体验 → 详情 → 开始体验 → 6 步', async () => {
    const { c, p } = await ctx(); await p.goto(SITE + '/', { waitUntil: 'networkidle' });
    await p.click('.site-head .nav a:has-text("岗位体验")'); await p.waitForURL('**/experiences/');
    await p.click('.card:has-text("商品退货率上升")'); await p.waitForURL('**/experiences/ops-returns/');
    await p.click('a:has-text("开始体验")'); await p.waitForURL('**/work/'); await p.waitForSelector('.stepper');
    for (let i = 2; i <= 6; i++) { await p.click(`.stepper li:nth-child(${i}) button`); await p.waitForTimeout(100); }
    await p.waitForSelector('[data-testid="trial-note"]'); ok((await p.locator('[data-testid="trial-note"]').innerText()).includes('7 天'), '没有说明保存范围');
    ok(await p.locator('button:has-text("完成并保存记录")').count() === 0, '试玩版不应出现完成按钮');
    await p.screenshot({ path: path.join(SHOTS, 'pages-wrap.png') });
    ok(p.errors.length === 0, p.errors.join(' | ')); await c.close();
  });
  await check('作答自动保存在本机：刷新、关掉再打开都还在；「我的」显示继续体验', async () => {
    const { c, p } = await ctx(); await practice(p); await p.fill('#f-p1-before', '约 4.7%'); await waitSaved(p);
    await p.reload({ waitUntil: 'networkidle' }); await p.waitForSelector('.stepper');
    ok(await p.locator('.stepper button[aria-current="step"] .t').innerText() === '跟着尝试', '没有回到上次的步骤');
    ok(await p.inputValue('#f-p1-before') === '约 4.7%', '刷新后作答丢失');
    const p2 = await c.newPage(); await p.close(); await p2.goto(SITE + '/me/', { waitUntil: 'networkidle' });
    ok((await p2.locator('main').innerText()).includes('商品退货率上升') && await p2.locator('a:has-text("继续体验")').count() === 1, '「我的」没有继续体验');
    await p2.screenshot({ path: path.join(SHOTS, 'pages-me.png') }); await c.close();
  });
  await check('不同访客（不同浏览器）互相看不到作答', async () => {
    const A = await ctx(), B = await ctx();
    await practice(A.p); await A.p.fill('#f-p1-before', '访客 A'); await waitSaved(A.p);
    await practice(B.p); ok(await B.p.inputValue('#f-p1-before') === '', '访客 B 看到了 A 的作答');
    await A.c.close(); await B.c.close();
  });
  await check('同一浏览器开两个页面同时改：两份都保留，可以选择', async () => {
    const { c, p } = await ctx(); const p2 = await c.newPage();
    await practice(p); await practice(p2);
    await p.fill('#f-p6-missing', '页面一'); await waitSaved(p);
    await p2.fill('#f-p6-missing', '页面二'); await p2.waitForSelector('#cf-h', { timeout: 15000 });
    await p2.click('.cf-col button:has-text("改用这份")'); await p2.waitForSelector('#cf-h', { state: 'detached' });
    await p2.click('.stepper li:nth-child(4) button'); ok(await p2.inputValue('#f-p6-missing') === '页面二', '冲突处理后内容不对');
    await c.close();
  });
  await check('简版练习可以直接看参考思路', async () => {
    const { c, p } = await ctx(); await p.goto(SITE + '/experiences/yc-quick/work/', { waitUntil: 'networkidle' });
    await p.click('#pr-t0 button:has-text("查看参考思路")'); await p.waitForSelector('#pr-t0 [role="note"]');
    await waitSaved(p); ok((await p.locator('.track').innerText()).includes('已看参考思路')); await c.close();
  });
  await check('机会库与企业页可浏览；示例投递只显示说明；合作页说明试玩版不支持提交', async () => {
    const { c, p } = await ctx(); await p.goto(SITE + '/jobs/', { waitUntil: 'networkidle' }); ok(await p.locator('.card').count() >= 3, '岗位列表为空');
    await p.goto(SITE + '/jobs/j1/', { waitUntil: 'networkidle' }); await p.click('button:has-text("前往企业官网投递")'); await p.waitForSelector('[role="dialog"]:has-text("示例信息")');
    await p.keyboard.press('Escape'); await p.goto(SITE + '/companies/yc/', { waitUntil: 'networkidle' }); ok((await p.locator('main').innerText()).includes('示例'));
    await p.goto(SITE + '/cooperate/', { waitUntil: 'networkidle' }); ok((await p.locator('main').innerText()).includes('免费试玩版，暂不支持在线提交'), '合作页没有说明');
    await p.goto(SITE + '/no-such-page/', { waitUntil: 'networkidle' }); ok((await p.locator('h1').innerText()).includes('找不到'), '404 页面不对');
    ok(p.errors.filter(e => !/404/.test(e)).length === 0, p.errors.join(' | ')); await c.close();
  });
  await check('浏览器不能保存数据时，明确提示，不假装保存成功', async () => {
    const { c, p } = await ctx(); await p.addInitScript(() => { Storage.prototype.setItem = function () { throw new DOMException('QuotaExceededError', 'QuotaExceededError'); }; });
    await p.goto(W, { waitUntil: 'networkidle' }); await p.click('.stepper li:nth-child(4) button'); await p.fill('#f-p1-before', '写一句');
    await p.waitForFunction(() => /不能保存数据/.test(document.querySelector('.work-head .save-state')?.textContent || ''), null, { timeout: 10000 });
    ok(!/已保存/.test(await p.locator('.work-head .save-state').innerText()), '显示了已保存');
    ok((await p.locator('main').innerText()).includes('不能使用本地存储'), '页面没有存储不可用的说明');
    await p.screenshot({ path: path.join(SHOTS, 'pages-storage-failed.png'), fullPage: false }); await c.close();
  });
  for (const [w, h] of [[390, 844], [320, 640]]) await check(`手机 ${w}px：无横向溢出；作答时打开材料，关闭后回到输入框`, async () => {
    const { c, p } = await ctx({ viewport: { width: w, height: h }, deviceScaleFactor: 2, hasTouch: true });
    for (const u of ['/', '/experiences/', '/experiences/ops-returns/', '/jobs/', '/me/']) { await p.goto(SITE + u, { waitUntil: 'networkidle' }); const o = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth); ok(o <= 0, `${u} 横向溢出 ${o}px`); await p.screenshot({ path: path.join(SHOTS, `pages-m${w}${u.replace(/\//g, '_')}.png`) }); }
    await practice(p); await p.click('#f-p2-when'); await p.keyboard.type('第 4 周');
    await p.click('.mobile-tools button:has-text("查看材料")'); await p.waitForSelector('[role="dialog"]:has-text("任务材料")');
    await p.screenshot({ path: path.join(SHOTS, `pages-m${w}-materials.png`) });
    await p.keyboard.press('Escape'); await p.waitForSelector('[role="dialog"]', { state: 'detached' });
    ok(await p.evaluate(() => document.activeElement?.id) === 'f-p2-when' && await p.inputValue('#f-p2-when') === '第 4 周', '焦点或内容没有保留');
    ok(p.errors.length === 0, p.errors.join(' | ')); await c.close();
  });
  await b.close(); server.close();
  fs.writeFileSync(path.join(OUT, 'pages.json'), JSON.stringify({ at: new Date().toISOString(), base: BASE, results }, null, 2));
  console.log(`\n${results.filter(r => r.pass).length} passed, ${results.filter(r => !r.pass).length} failed`);
  process.exit(results.every(r => r.pass) ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
