// V1.7「你的隐藏工位搭子」静态版浏览器测试：在模拟 GitHub Pages 子路径（PAGES_BASE，默认 /onstage）的静态服务器上，
// 用真实 Chromium 走学生会做的事。用法：npm run build:static && node tests/e2e/buddy-check.cjs dist-pages
// 没有 Playwright 自带浏览器时，可用 CHROME_PATH=/path/to/chrome 指定本机 Chrome。
// 这是浏览器自动化测试，不能代替 iPhone / 安卓真机和微信内置浏览器测试。
const { chromium } = require('playwright');
const http = require('node:http'), fs = require('node:fs'), path = require('node:path'), net = require('node:net'), { spawnSync } = require('node:child_process');
const ROOT = path.resolve(process.argv[2] || 'dist-pages'), BASE = (process.env.PAGES_BASE ?? '/onstage').replace(/\/+$/, '');
const OUT = path.join('test-results', 'buddy'), SHOTS = path.join(OUT, 'screens'), CARDS = path.join(OUT, 'cards');
for (const d of [SHOTS, CARDS]) fs.mkdirSync(d, { recursive: true });
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.txt': 'text/plain; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2' };
const bad = [];
function serve(req, res) {
  const u = new URL(req.url, 'http://x'); let p = decodeURIComponent(u.pathname);
  if (!p.startsWith(BASE + '/') && p !== BASE) { bad.push(p); res.writeHead(404); return res.end('not found'); }
  p = p.slice(BASE.length) || '/'; let file = path.join(ROOT, p);
  if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) { if (!p.endsWith('/')) { res.writeHead(301, { location: BASE + p + '/' + u.search }); return res.end(); } file = path.join(file, 'index.html'); }
  if (!fs.existsSync(file)) { bad.push(p); res.writeHead(404, { 'content-type': TYPES['.html'] }); return fs.createReadStream(path.join(ROOT, '404.html')).pipe(res); }
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' }); fs.createReadStream(file).pipe(res);
}
const freePort = () => new Promise(ok => { const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => ok(p)); }); });
const results = []; const ok = (c, m) => { if (!c) throw new Error(m); };
async function check(name, fn) { const t = Date.now(); try { await fn(); results.push({ name, pass: true, ms: Date.now() - t }); console.log('PASS', name); } catch (e) { results.push({ name, pass: false, error: String(e.message).slice(0, 600) }); console.log('FAIL', name, '\n   ', e.message); } }

const tsx = require.resolve('tsx/cli');
const P = JSON.parse(spawnSync(process.execPath, [tsx, 'scripts/buddy-paths.ts'], { encoding: 'utf8', env: { ...process.env, NODE_NO_WARNINGS: '1' } }).stdout);
const version = JSON.parse(fs.readFileSync(path.join(ROOT, 'version.json'), 'utf8'));
const EXPECT_QR = process.env.BUDDY_URL || `https://shangchang-app.github.io${BASE}/buddy/`;
const DRAFT = JSON.stringify({ owner: 'local:keep', drafts: { 'ops-returns': { content_id: 'ops-returns', answers: { plan: { reason: '保留这段草稿' } } } }, recoveries: [], schema: 2 });
const WORKS = JSON.stringify({ schema: 1, works: [{ id: 'w-keep', title: '保留这份成果' }] });

(async () => {
  const port = await freePort(); const server = http.createServer(serve).listen(port, '127.0.0.1');
  const SITE = `http://127.0.0.1:${port}${BASE}`, BUDDY = SITE + '/buddy/';
  const b = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH, args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'] } : {});
  const mobile = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
  // 页面错误、控制台错误、失败的请求全部记下（不过滤任何一类）；只有「图标加载失败」那一项会主动拦截图标，并单独核对
  const ctx = async (o = {}) => { const c = await b.newContext({ viewport: { width: 1280, height: 860 }, acceptDownloads: true, ...o }); const p = await c.newPage(); p.errors = []; p.bad = [];
    p.on('pageerror', e => p.errors.push(e.message)); p.on('console', m => { if (m.type() === 'error') p.errors.push(m.text() + ' @ ' + (m.location()?.url || '')); });
    p.on('requestfailed', r => { const f = r.failure()?.errorText || ''; if (f === 'net::ERR_ABORTED' && r.resourceType() === 'fetch') return; /* 页面跳转时浏览器取消了还没回来的预取请求，不是资源坏了 */ p.bad.push('失败 ' + f + ' ' + r.url()); }); p.on('response', r => { if (r.status() >= 400) p.bad.push(r.status() + ' ' + r.url()); }); return { c, p }; };
  const clean = p => { ok(p.errors.length === 0 && p.bad.length === 0, '页面有报错或失败的请求：' + [...p.errors, ...p.bad].join(' | ')); };
  const shot = (p, name, full = true) => p.screenshot({ path: path.join(SHOTS, name + '.png'), fullPage: full });
  const start = async p => { await p.goto(BUDDY, { waitUntil: 'networkidle' }); await p.getByRole('button', { name: '开始' }).click(); await p.waitForSelector('.bd-opts'); };
  const answer = async (p, text) => { await p.locator('.bd-opt', { hasText: text }).click(); };
  const next = p => p.locator('.bd-nav .btn-primary').click();
  const runPath = async (p, answers) => { for (let i = 0; i < answers.length; i++) { await answer(p, answers[i]); await next(p); if (i < answers.length - 1) await p.waitForSelector(`.bd-progress >> text=${i + 2} / 8`); } };
  const resultName = async p => { await p.waitForSelector('.bd-result h1'); return (await p.locator('.bd-result h1').innerText()).trim(); };

  await check('首页（390px）：品牌和副标题 → 趣味入口 → 岗位实践；入口用随站部署的图标、按钮去 /buddy/；没有旧文案；首页不暴露隐藏角色；没有任何失败请求', async () => {
    const { c, p } = await ctx(mobile); await p.goto(SITE + '/', { waitUntil: 'networkidle' });
    const brand = await p.locator('.home-top').boundingBox(), card = p.locator('.fun'), exp = await p.locator('#h-exp').boundingBox();
    await card.waitFor(); const fb = await card.boundingBox();
    ok((await p.locator('.home-wm').innerText()).trim() === 'on stage' && (await p.locator('.home-sub').innerText()).trim() === '探索工作，也探索自己。', '品牌或副标题不对');
    ok(brand && fb && exp && fb.y > brand.y && exp.y > fb.y + fb.height - 1, '顺序应是 品牌 → 趣味入口 → 岗位实践');
    const nb = await card.locator('h2 .nb').allInnerTexts(); ok(nb.join('|') === '你的隐藏工位搭子，|藏不住了。', '入口标题不对：' + nb.join('|'));
    const t = await card.innerText();
    for (const k of ['没回消息，但快查明白了。', '还有几只正在输入…', '看看是谁', '情境娱乐探索，非专业人格或职业测评。']) ok(t.includes(k), '入口缺少：' + k);
    ok((await card.locator('a:has-text("看看是谁")').getAttribute('href')) === BASE + '/buddy/', '按钮链接不对');
    const imgs = await card.locator('img').evaluateAll(l => l.map(i => i.complete && i.naturalWidth > 0)); ok(imgs.length === 4 && imgs.every(Boolean), '入口图标没加载出来（应是随站部署的图片，不是系统 emoji）');
    ok(!/[\u{1F300}-\u{1FAFF}]/u.test(t), '入口里还有系统 emoji 字符');
    const body = await p.locator('body').innerText();
    for (const old of ['今天，哪只动物替你上场', '找到机会，提前上场', '还在制作中']) ok(!body.includes(old), '还有旧文案：' + old);
    ok(!body.includes('鸭嘴兽') && await p.locator('img[src*="platypus"]').count() === 0, '首页不应暴露隐藏角色');
    ok(await p.locator('main a.card[href$="/experiences/ops-returns/"]').count() === 1, '缺少直接进入岗位体验的入口');
    const tabs = await p.locator('.tabbar a').allInnerTexts(); ok(tabs.map(x => x.trim()).join('/') === '首页/机会/体验/我的', '底部导航不是四栏：' + tabs.join('/'));
    const fs12 = await card.locator('.fun-foot p').evaluate(e => parseFloat(getComputedStyle(e).fontSize)); ok(fs12 >= 13, '底部说明字号太小：' + fs12);
    const over = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth); ok(over <= 0, '390px 下页面横向溢出 ' + over + 'px');
    ok(await p.locator('link[rel="icon"]').count() >= 1, '没有网站图标链接（浏览器会去请求根目录 /favicon.ico）');
    await card.screenshot({ path: path.join(SHOTS, '01-首页入口-390.png') }); await shot(p, '01-首页-390', false);
    clean(p); await c.close();
  });

  await check('说明页：写明趣味情境探索、不是专业测评、不用登录；能开始', async () => {
    const { c, p } = await ctx(mobile); await p.goto(BUDDY, { waitUntil: 'networkidle' });
    const t = await p.locator('.bd-panel').innerText();
    for (const k of ['这是趣味情境探索，不是专业人格或职业测评。', '不用登录', '不用于企业筛选、能力评分，也不算岗位实践完成记录']) ok(t.includes(k), '说明页缺少：' + k);
    await shot(p, '02-说明页-390'); await p.getByRole('button', { name: '开始' }).click(); await p.waitForSelector('.bd-opts');
    ok(await p.locator('.bd-nav .btn-primary').isDisabled(), '没选就能下一题'); await shot(p, '03-第1题-390');
    await c.close();
  });

  for (const r of P.roles) await check(`可到达路径：${r.name}（示例路径直接得到，依据引用实际选择，推荐体验真实存在）`, async () => {
    const { c, p } = await ctx(mobile); await start(p); await runPath(p, r.answers);
    ok(await resultName(p) === r.name, '结果是 ' + await resultName(p));
    ok((await p.locator('.bd-result .bd-bub').first().innerText()).trim() === r.line, '一句话不对');
    const ev = await p.locator('.bd-ev li b').allInnerTexts(); ok(ev.length === 2, '依据应有 2 条，实际 ' + ev.length);
    for (const e of ev) ok(r.answers.includes(e.replace(/^「|」$/g, '')), '依据不是用户选过的：' + e);
    const t = await p.locator('.bd-result').innerText();
    for (const k of ['在这次情境中，你', '可能的取舍', '分享给好友', '重新探索', '也看看其他方向']) ok(t.includes(k), '结果页缺少：' + k);
    ok(!/%|稀有|排名/.test(t), '结果页出现了百分比/稀有度/排名');
    const rec = p.locator('.bd-rec-card'); await rec.first().waitFor(); const hrefs = await rec.evaluateAll(l => l.map(a => a.getAttribute('href'))), kinds = await rec.evaluateAll(l => l.map(a => a.dataset.kind));
    ok(hrefs[0] === `${BASE}/experiences/${r.rec}/`, '推荐链接不对：' + hrefs[0]);
    const labels = await p.locator('.bd-rec-kind').allInnerTexts();
    ok(labels.every((l, i) => l.startsWith({ simple: '简版练习', quick: '短实践', deep: '完整实践' }[kinds[i]])), '推荐没有标明短实践 / 完整实践：' + labels.join(' | '));
    // V1.8：第一入口是短实践，第二入口是完整实践；都标明时间和能学到什么
    ok(kinds.join() === 'quick,deep' && hrefs[1] === `${BASE}/experiences/${r.full}/`, '推荐应是「短实践 → 完整实践」：' + kinds.join() + ' ' + hrefs.join());
    const recText = await rec.allInnerTexts(); ok(recText.every(x => /约 \d+ 分钟/.test(x) && x.includes('能学到')), '推荐卡没有写时间或能学到什么');
    for (const h of hrefs) ok((await p.request.get(`http://127.0.0.1:${port}${h}`)).status() === 200, '推荐体验打不开：' + h);
    await shot(p, `10-结果-${r.id}-390`);
    // 分享卡：下载真实 PNG，检查尺寸、二维码内容
    await p.locator('.bd-actions').getByRole('button', { name: '分享给好友' }).click(); await p.waitForSelector('.bd-share-img');
    const [dl] = await Promise.all([p.waitForEvent('download'), p.getByRole('button', { name: '下载图片' }).click()]);
    const file = path.join(CARDS, `${String(P.roles.indexOf(r) + 1).padStart(2, '0')}-${r.id}.png`); await dl.saveAs(file);
    ok(dl.suggestedFilename() === `on-stage-buddy-${r.id}.png`, '文件名：' + dl.suggestedFilename());
    ok((await p.locator('.modal [role="status"]').last().innerText()).includes('如果没有看到文件'), '下载后的提示不应假装成功');
    const qr = await p.evaluate(async src => {
      const img = new Image(); img.src = src; await img.decode();
      const cv = document.createElement('canvas'); cv.width = img.naturalWidth; cv.height = img.naturalHeight; const g = cv.getContext('2d'); g.drawImage(img, 0, 0);
      const d = g.getImageData(0, 1500, 420, 420); return { w: img.naturalWidth, h: img.naturalHeight, code: window.jsQR ? window.jsQR(d.data, d.width, d.height)?.data : 'NO_JSQR' };
    }, await p.locator('.bd-share-img').getAttribute('src').then(async s => { await p.addScriptTag({ path: require.resolve('jsqr/dist/jsQR.js') }); return s; }));
    ok(qr.w === 1080 && qr.h === 1920, '分享卡尺寸 ' + qr.w + '×' + qr.h);
    ok(qr.code === EXPECT_QR, '二维码内容：' + qr.code);
    ok(!/localhost|127\.0\.0\.1|[?#]/.test(qr.code), '二维码不能指向本机或带参数');
    ok(!p.url().includes('?') && !p.url().includes('#'), '网址里不应带答案：' + p.url());
    const saved = JSON.parse(await p.evaluate(() => localStorage.getItem('onstage-buddy:v1')));
    ok(saved.schema === 2 && saved.rulesVersion === P.rulesVersion && saved.result?.role === r.id, '结果快照没有保存或版本不对');
    clean(p); await c.close();
  });

  await check('区分题：并列时追加 1 题，只列并列的角色（不显示动物名）；选谁就是谁；依据包含区分题答案', async () => {
    const { c, p } = await ctx(mobile); await start(p); await runPath(p, P.tie.answers);
    await p.waitForSelector('text=加一题'); const opts = await p.locator('.bd-opt').allInnerTexts();
    ok(opts.length === P.tie.candidates.length, '区分题选项数 ' + opts.length);
    for (const cnd of P.tie.candidates) { ok(opts.some(o => o.includes(cnd.text)), '缺少区分题选项'); ok(!opts.some(o => o.includes(cnd.name)), '区分题不应显示动物名'); }
    await shot(p, '04-区分题-390');
    const pickc = P.tie.candidates[1]; await answer(p, pickc.text); await next(p);
    ok(await resultName(p) === pickc.name, '区分题后结果不对');
    ok((await p.locator('.bd-ev').innerText()).includes(pickc.text), '依据里没有区分题答案');
    await c.close();
  });

  await check('区分题（5 人并列）：并列的全部列出，不截断', async () => {
    const { c, p } = await ctx(mobile); await start(p); await runPath(p, P.bigTie.answers);
    await p.waitForSelector('text=加一题'); const opts = await p.locator('.bd-opt').allInnerTexts();
    ok(opts.length === P.bigTie.candidates.length && opts.length >= 5, `应列出全部 ${P.bigTie.candidates.length} 个，实际 ${opts.length}`);
    ok((await p.locator('.bd-progress').innerText()).includes(`有 ${opts.length} 只并列`), '没写并列人数');
    const last = P.bigTie.candidates[P.bigTie.candidates.length - 1]; await answer(p, last.text); await next(p);
    ok(await resultName(p) === last.name, '选最后一个也必须能得到它'); await shot(p, '04b-区分题5人-结果-390'); clean(p); await c.close();
  });

  await check('区分题（7 人并列，穷举里的最多人数）：手机 390px 能滚动看到全部选项和按钮，长文字不溢出；键盘逐个选择；未选时不能确认，选中后确认得到所选角色', async () => {
    const { c, p } = await ctx({ ...mobile, viewport: { width: 390, height: 664 } }); await start(p); await runPath(p, P.maxTie.answers);
    await p.waitForSelector('text=加一题'); const opts = p.locator('.bd-opt'); const n = await opts.count();
    ok(n === 7 && n === P.maxTie.candidates.length, '应列出 7 个，实际 ' + n);
    ok((await p.locator('.bd-progress').innerText()).includes('有 7 只并列'), '没写并列人数');
    // 长文字：每个选项都在视口宽度内，没有横向溢出；文字完整可见（不截断）
    const boxes = await opts.evaluateAll(l => l.map(e => { const r = e.getBoundingClientRect(), t = e.querySelector('span'); return { left: r.left, right: r.right, h: r.height, clipped: t.scrollWidth > t.clientWidth + 1 }; }));
    ok(boxes.every(b => b.left >= 0 && b.right <= 390 && !b.clipped && b.h >= 44), '选项超出屏幕、被截断或点击区域太小：' + JSON.stringify(boxes));
    ok(await p.evaluate(() => document.documentElement.scrollWidth - innerWidth) <= 0, '横向溢出');
    const confirm = p.locator('.bd-nav .btn-primary');
    ok(await confirm.isDisabled(), '没选就能确认');
    // 确认按钮在首屏外（选项多），滚动后能看到并且不被底部导航挡住
    await confirm.scrollIntoViewIfNeeded();
    const cb = await confirm.boundingBox(), tb = await p.locator('.tabbar').boundingBox();
    ok(cb && tb && cb.y + cb.height <= tb.y + 1, '确认按钮被底部导航挡住');
    await shot(p, '04c-区分题7人-390');
    // 键盘：Tab 进入单选组，方向键逐个经过 7 个选项，每次只有一个选中
    await p.evaluate(() => scrollTo(0, 0)); await p.locator('.bd-opts h1').focus(); await p.keyboard.press('Tab');
    const seen = [];
    // 没选中时 Tab 落在第一个选项上但不会自动选中：先按空格选中第一个，再用方向键往下
    for (let i = 0; i < 7; i++) { await p.keyboard.press(i ? 'ArrowDown' : 'Space'); seen.push(await p.locator('.bd-opt.on').innerText()); ok(await p.locator('.bd-opt.on').count() === 1, '同时选中了多个'); }
    ok(new Set(seen).size === 7, '方向键没有逐个经过 7 个选项：' + seen.length);
    ok(await p.locator('.bd-opt.on').evaluate(e => getComputedStyle(e).outlineStyle !== 'none'), '键盘焦点不可见');
    await p.keyboard.press('ArrowDown'); ok((await p.locator('.bd-opt.on').innerText()) === seen[0], '方向键没有循环回第一个');
    // 选第 6 个，用键盘确认
    for (let i = 0; i < 5; i++) await p.keyboard.press('ArrowDown');
    const chosen = P.maxTie.candidates.find(x => x.text === (seen[5]));
    ok(chosen, '找不到第 6 个选项对应的角色'); ok(!(await confirm.isDisabled()), '选中后确认按钮仍不可用');
    await p.keyboard.press('Tab'); await p.keyboard.press('Tab'); ok(await p.evaluate(() => document.activeElement?.textContent) === '看看是谁', 'Tab 没有到达确认按钮');
    await p.keyboard.press('Enter'); ok(await resultName(p) === chosen.name, '键盘确认后的结果不是所选角色');
    ok((await p.locator('.bd-ev').innerText()).includes(chosen.text), '依据里没有区分题答案');
    clean(p); await c.close();
  });

  await check('端到端：动物探索 → 结果 → 分享卡 → 点推荐的完整实践（第二入口）→ 实际作答并点「保存成果」→ 从「我的」重新打开', async () => {
    const otter = P.roles.find(r => r.id === 'raccoon'); // 第一入口是同一情境的短实践，第二入口是完整实践 ops-returns-deep
    const { c, p } = await ctx({ deviceScaleFactor: 1 });
    await start(p); await runPath(p, otter.answers); ok(await resultName(p) === otter.name, '结果不对');
    await p.locator('.bd-actions').getByRole('button', { name: '分享给好友' }).click(); await p.waitForSelector('.bd-share-img');
    const [dl] = await Promise.all([p.waitForEvent('download'), p.getByRole('button', { name: '下载图片' }).click()]); ok(dl.suggestedFilename() === 'on-stage-buddy-raccoon.png', '分享卡没下载');
    await p.getByRole('button', { name: '关闭' }).click();
    ok((await p.locator('.bd-rec-card').first().getAttribute('data-kind')) === 'quick', '第一入口应是短实践');
    const rec = p.locator('.bd-rec-card').nth(1); ok((await rec.getAttribute('data-kind')) === 'deep' && (await rec.innerText()).includes('完整实践'), '第二入口应是完整实践');
    await rec.click(); await p.waitForURL('**/experiences/ops-returns-deep/'); await p.waitForSelector('main h1');
    await p.locator('main a.btn-primary[href$="/experiences/ops-returns-deep/work"], main a.btn-primary[href$="/experiences/ops-returns-deep/work/"]').first().click();
    await p.waitForSelector('.stepper');
    const waitSaved = () => p.waitForFunction(() => /已保存/.test(document.querySelector('.work-head .save-state')?.textContent || ''), null, { timeout: 15000 });
    const NUM = { 'f-p0-rate': '3.7%', 'f-p1-before': '约 4.7%', 'f-p1-after': '约 11.1%', 'f-t-before': '5.1%', 'f-t-after': '5.1%' };
    const fill = async tag => { for (const sec of await p.locator('.practice').all()) { for (const f of await sec.locator('fieldset').all()) if (await f.locator('input:checked').count() === 0) await f.locator('.choice').first().click(); for (const el of await sec.locator('input.input, textarea').all()) { const id = await el.getAttribute('id'); if (!(await el.inputValue())) await el.fill(NUM[id] || `${tag}：${id}`); } } };
    await p.click('.stepper li:nth-child(2) button'); await p.waitForTimeout(150);
    await p.click('.stepper li:nth-child(4) button'); await p.waitForSelector('.practice'); await fill('从水獭结果过来'); await waitSaved();
    await p.click('.stepper li:nth-child(5) button'); await p.waitForSelector('#chg-h');
    await p.click('.stepper li:nth-child(6) button'); await p.waitForSelector('.transfer-intro'); await fill('从水獭结果过来'); await waitSaved();
    await p.click('[data-testid="save-work"]'); await p.waitForSelector('.out-side .ok-box'); ok((await p.locator('.out-side .ok-box').innerText()).includes('已保存到本机'), '没有保存成功');
    await shot(p, '40-端到端-保存成果', false);
    // 关闭页面，换一个新页面从「我的」打开
    const p2 = await c.newPage(); p2.errors = []; p2.bad = []; p2.on('pageerror', e => p2.errors.push(e.message)); await p.close();
    await p2.goto(SITE + '/me/', { waitUntil: 'networkidle' }); await p2.waitForSelector('#h-works');
    const row = p2.locator('.list-row', { hasText: '问题诊断与行动建议卡' }); ok(await row.count() === 1, '「我的」里没有这份成果');
    await row.locator('a:has-text("打开")').click(); await p2.waitForURL('**/works/?id=*'); await p2.waitForSelector('.work-card');
    const w = await p2.locator('.work-card').innerText(); ok(w.includes('从水獭结果过来') && w.includes('教学模拟作品'), '重新打开的成果内容不对');
    ok(!/水獭|隐藏工位搭子/.test(w.replace(/从水獭结果过来[^\n]*/g, '')), '成果里不应混入趣味探索的结果');
    const st = await p2.evaluate(() => ({ buddy: JSON.parse(localStorage.getItem('onstage-buddy:v1')), works: JSON.parse(localStorage.getItem('onstage-works:v1')) }));
    ok(st.buddy.result?.role === 'raccoon' && st.works.works.length === 1, '两份数据应各自独立保存');
    await shot(p2, '41-端到端-从我的打开成果'); ok(p2.errors.length === 0, p2.errors.join(' | ')); await c.close();
  });

  await check('隐藏角色：★ 选项 4 次触发鸭嘴兽；3 次不触发', async () => {
    const plat = P.roles.find(r => r.id === 'platypus');
    { const { c, p } = await ctx(mobile); await start(p); await runPath(p, plat.answers); ok(await resultName(p) === plat.name, '没触发'); ok((await p.locator('.bd-result').innerText()).includes('次选了跳出原有方向的做法'), '缺少触发说明'); await c.close(); }
    { const { c, p } = await ctx(mobile); await start(p); await runPath(p, P.nearHidden.answers); const n = await resultName(p).catch(async () => { await answer(p, (await p.locator('.bd-opt').first().innerText())); await next(p); return resultName(p); }); ok(n !== plat.name, '3 次不应触发'); await c.close(); }
  });

  await check('返回修改：结果页返回改答案，结果重新计算；前面的作答保留', async () => {
    const otter = P.roles.find(r => r.id === 'otter'), cat = P.roles.find(r => r.id === 'cat');
    const { c, p } = await ctx(mobile); await start(p); await runPath(p, otter.answers); ok(await resultName(p) === otter.name, '起点不对');
    await p.getByRole('button', { name: '返回修改' }).click(); await p.waitForSelector('text=8 / 8');
    for (let i = 7; i > 0; i--) { await p.getByRole('button', { name: '上一题' }).click(); await p.waitForSelector(`text=${i} / 8`); }
    ok(await p.locator('.bd-opt.on').innerText() === otter.answers[0], '返回后第 1 题的选择丢了');
    for (let i = 0; i < 8; i++) { await answer(p, cat.answers[i]); await next(p); if (i < 7) await p.waitForSelector(`text=${i + 2} / 8`); }
    ok(await resultName(p) === cat.name, '改答案后没有重新计算'); await c.close();
  });

  await check('刷新恢复与重新开始：刷新后从第 4 题继续；重新开始先确认是否替换；不影响岗位体验草稿和成果', async () => {
    const { c, p } = await ctx(mobile);
    await p.goto(SITE + '/', { waitUntil: 'networkidle' });
    await p.evaluate(([d, w]) => { localStorage.setItem('onstage-free:v1', d); localStorage.setItem('onstage-works:v1', w); }, [DRAFT, WORKS]);
    await start(p); const a = P.roles[0].answers; for (let i = 0; i < 3; i++) { await answer(p, a[i]); await next(p); }
    await p.waitForSelector('text=4 / 8'); await p.reload({ waitUntil: 'networkidle' });
    await p.waitForSelector('text=4 / 8'); ok(await p.locator('text=已接着上次的进度继续').count() === 1, '缺少恢复提示');
    await p.getByRole('button', { name: '上一题' }).click(); ok(await p.locator('.bd-opt.on').innerText() === a[2], '刷新后作答丢了');
    await p.goto(BUDDY, { waitUntil: 'networkidle' }); // 回到说明页再看
    const s = JSON.parse(await p.evaluate(() => localStorage.getItem('onstage-buddy:v1'))); ok(Object.keys(s.answers).length === 3, '存储里的作答数不对');
    await p.evaluate(() => { const s = JSON.parse(localStorage.getItem('onstage-buddy:v1')); s.step = 'intro'; localStorage.setItem('onstage-buddy:v1', JSON.stringify(s)); }); await p.reload({ waitUntil: 'networkidle' });
    ok(await p.getByRole('button', { name: /继续上次（已答 3\/8）/ }).count() === 1, '说明页没有「继续」');
    await p.getByRole('button', { name: '重新开始' }).click(); const dlg = p.getByRole('alertdialog'); await dlg.waitFor();
    ok((await dlg.innerText()).includes('替换'), '重新开始没有说明会替换进度'); await shot(p, '05-重新开始确认-390', false);
    await dlg.getByRole('button', { name: '先不了' }).click(); ok(JSON.parse(await p.evaluate(() => localStorage.getItem('onstage-buddy:v1'))).answers.s1, '取消后不应清掉进度');
    await p.getByRole('button', { name: '重新开始' }).click(); await p.getByRole('button', { name: '替换，重新开始' }).click(); await p.waitForSelector('text=1 / 8');
    ok(await p.locator('.bd-opt.on').count() === 0, '重新开始后还有旧选择');
    ok(await p.evaluate(() => localStorage.getItem('onstage-free:v1')) === DRAFT, '岗位体验草稿被改动了');
    ok(await p.evaluate(() => localStorage.getItem('onstage-works:v1')) === WORKS, '成果被改动了');
    await c.close();
  });

  await check('题目版本：旧版（v1）作答不会被换算成新结果，存储原样保留到用户确认；确认后按新题目重来', async () => {
    const { c, p } = await ctx(mobile); await p.goto(SITE + '/', { waitUntil: 'networkidle' });
    const v1 = JSON.stringify({ schema: 1, answers: { s1: 'a', s2: 'b', s3: 'd', s4: 'c' }, tie: null, step: 4 });
    await p.evaluate(v => localStorage.setItem('onstage-buddy:v1', v), v1); await p.goto(BUDDY, { waitUntil: 'networkidle' });
    const note = await p.locator('[data-testid="stale-note"]').innerText(); ok(note.includes('题目已经更新过') && note.includes('4 题') && note.includes('不会被换算成新结果'), '没有旧版提示：' + note);
    ok(await p.getByRole('button', { name: /继续上次/ }).count() === 0, '旧版作答不应能「继续」');
    ok(await p.evaluate(() => localStorage.getItem('onstage-buddy:v1')) === v1, '用户确认前不应改写旧数据'); await shot(p, '08-旧版进度提示-390');
    await p.getByRole('button', { name: '按新题目重新开始' }).click(); await p.getByRole('alertdialog').getByRole('button', { name: '替换，重新开始' }).click(); await p.waitForSelector('text=1 / 8');
    const d = JSON.parse(await p.evaluate(() => localStorage.getItem('onstage-buddy:v1'))); ok(d.schema === 2 && d.rulesVersion === P.rulesVersion && Object.keys(d.answers).length === 0, '重新开始后的存储不对');
    clean(p); await c.close();
  });

  await check('题目版本：将来改版后，上次的结果快照原样保留、可以查看，不用新规则重算', async () => {
    const otter = P.roles.find(r => r.id === 'otter');
    const { c, p } = await ctx(mobile); await start(p); await runPath(p, otter.answers); await resultName(p);
    const ev = await p.locator('.bd-ev li b').allInnerTexts();
    await p.evaluate(() => { const d = JSON.parse(localStorage.getItem('onstage-buddy:v1')); d.rulesVersion = 'v0-test'; d.result.rulesVersion = 'v0-test'; localStorage.setItem('onstage-buddy:v1', JSON.stringify(d)); });
    await p.reload({ waitUntil: 'networkidle' }); await p.goto(BUDDY, { waitUntil: 'networkidle' });
    ok((await p.locator('[data-testid="stale-note"]').innerText()).includes('上次的结果「' + otter.name + '」'), '没有提到保留的旧结果');
    await p.getByRole('button', { name: '查看上次的结果' }).click(); const prev = p.locator('[data-testid="previous-result"]'); await prev.waitFor();
    ok((await prev.locator('h1').innerText()).trim() === otter.name, '旧结果名称变了');
    ok(JSON.stringify(await prev.locator('.bd-ev li b').allInnerTexts()) === JSON.stringify(ev), '旧结果的依据变了');
    ok((await prev.innerText()).includes('没有用新题目重新计算') && (await prev.innerText()).includes('旧版题目 v0-test'), '缺少原样保留说明或版本'); await shot(p, '09-保留的旧结果-390');
    await p.getByRole('button', { name: '返回' }).click(); await p.getByRole('button', { name: '按新题目重新开始' }).click(); await p.getByRole('alertdialog').getByRole('button', { name: '替换，重新开始' }).click(); await p.waitForSelector('text=1 / 8');
    const d = JSON.parse(await p.evaluate(() => localStorage.getItem('onstage-buddy:v1'))); ok(d.previous?.[0]?.name === otter.name && d.previous[0].rulesVersion === 'v0-test', '重新开始后旧结果没有保留在 previous 里');
    clean(p); await c.close();
  });

  await check('键盘：方向键选选项、Tab 到下一题、回车翻页；换题后焦点在题目上；选项有可见焦点', async () => {
    const { c, p } = await ctx(); await p.goto(BUDDY, { waitUntil: 'networkidle' });
    await p.getByRole('button', { name: '开始' }).focus(); await p.keyboard.press('Enter'); await p.waitForSelector('.bd-opts');
    ok(await p.evaluate(() => document.activeElement?.tagName) === 'H1', '换屏后焦点不在标题');
    await p.keyboard.press('Tab'); await p.keyboard.press('ArrowDown');
    ok(await p.locator('.bd-opt.on').count() === 1, '方向键没有选中选项');
    const outline = await p.locator('.bd-opt.on').evaluate(e => getComputedStyle(e).outlineStyle); ok(outline !== 'none', '选项没有可见焦点');
    await p.keyboard.press('Tab'); await p.keyboard.press('Tab'); await p.keyboard.press('Enter'); await p.waitForSelector('text=2 / 8');
    ok(await p.evaluate(() => document.activeElement?.tagName) === 'H1', '下一题后焦点不在标题'); await c.close();
  });

  await check('减少动效：系统设置减少动效时，进度条和按钮没有过渡动画', async () => {
    const { c, p } = await ctx({ ...mobile, reducedMotion: 'reduce' }); await start(p);
    const tr = await p.locator('.bd-bar i').evaluate(e => getComputedStyle(e).transitionDuration); ok(parseFloat(tr) < 0.01, '仍有动画：' + tr); await c.close();
  });

  await check('微信内置浏览器（模拟 UA）：不显示下载按钮，提示长按图片发送给朋友或保存；不显示假成功', async () => {
    const { c, p } = await ctx({ ...mobile, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.50(0x1800322f) NetType/WIFI Language/zh_CN' });
    await start(p); await runPath(p, P.roles[1].answers); await resultName(p);
    await p.locator('.bd-actions').getByRole('button', { name: '分享给好友' }).click(); await p.waitForSelector('.bd-share-img');
    ok(await p.getByRole('button', { name: '下载图片' }).count() === 0, '微信里不应显示下载按钮');
    const t = await p.locator('.modal').innerText(); ok(t.includes('长按下面的图片') && t.includes('如果菜单里有「发送给朋友」') && t.includes('保存图片'), '缺少长按发送 / 保存提示'); ok(!/成功/.test(t), '不应显示成功');
    await shot(p, '06-微信UA-分享卡-390', false); await c.close();
  });

  await check('图标加载失败：页面用占位块，分享卡给出明确错误和截图用卡片视图', async () => {
    const { c, p } = await ctx(mobile); await p.route('**/buddy/icons/**', r => r.abort());
    await start(p); await runPath(p, P.roles[2].answers); await resultName(p);
    // 被拦截的图标请求是异步失败的：结果标题出现时，图片的 error 事件可能还没触发，所以等占位块出现（最多 5 秒），不立刻计数
    ok(await p.locator('.bd-icon-miss').first().waitFor({ timeout: 5000 }).then(() => true, () => false), '没有占位块');
    await p.locator('.bd-actions').getByRole('button', { name: '分享给好友' }).click(); await p.waitForSelector('.modal [role="alert"]');
    ok((await p.locator('.modal [role="alert"]').innerText()).includes('角色图标没有加载出来'), '错误提示不明确');
    ok(await p.locator('[data-testid="shot-card"]').count() === 1, '没有截图视图'); ok(await p.getByRole('button', { name: '下载图片' }).count() === 0, '失败时不应有下载按钮');
    await shot(p, '07-图标失败-截图视图-390', false);
    ok(p.bad.length > 0 && p.bad.every(x => /\/buddy\/icons\//.test(x)), '除了被拦截的图标，不应有别的失败请求：' + p.bad.join(' | '));
    ok(p.errors.every(e => /\/buddy\/icons\/|ERR_FAILED|Failed to load resource/.test(e) && /icons/.test(e)), '除了图标加载失败，不应有别的报错：' + p.errors.join(' | ')); await c.close();
  });

  await check('存储不可用：明确提示刷新后会从头开始，仍能做完拿到结果', async () => {
    const { c, p } = await ctx(mobile);
    await p.addInitScript(() => { const thrower = () => { throw new DOMException('denied', 'SecurityError'); }; Object.defineProperty(window, 'localStorage', { configurable: true, get: thrower }); });
    await p.goto(BUDDY, { waitUntil: 'networkidle' });
    ok((await p.locator('.bd-panel').innerText()).includes('刷新页面后会从头开始'), '没有存储不可用提示');
    await p.getByRole('button', { name: '开始' }).click(); await runPath(p, P.roles[3].answers); ok(await resultName(p) === P.roles[3].name, '存储不可用时拿不到结果');
    await c.close();
  });

  await check('桌面布局：说明页、题目、结果页（1280px）', async () => {
    const { c, p } = await ctx(); await p.goto(SITE + '/', { waitUntil: 'networkidle' }); await shot(p, '20-首页-桌面', false);
    await start(p); await shot(p, '21-题目-桌面', false); await runPath(p, P.roles[1].answers); await resultName(p); await shot(p, '22-结果-桌面');
    const over = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth); ok(over <= 0, '桌面横向溢出'); await c.close();
  });

  await check('GitHub Pages 子路径：资源都在 ' + BASE + ' 下；/buddy 自动补斜杠；许可文件可访问；验收页不被收录', async () => {
    const { c, p } = await ctx(mobile); const r = await p.goto(SITE + '/buddy', { waitUntil: 'networkidle' }); ok(r.status() === 200 && p.url().endsWith('/buddy/'), '没有补斜杠');
    for (const f of ['NOTICE.txt', 'LICENSE-Apache-2.0.txt', 'NOTO-EMOJI-LICENSE-NOTICE.txt', 'icons/collie.svg']) ok((await p.request.get(SITE + '/buddy/' + f)).status() === 200, f + ' 打不开');
    await p.goto(SITE + '/buddy/gallery/', { waitUntil: 'networkidle' }); await p.waitForSelector('.bd-gcard');
    ok(await p.locator('.bd-gcard').count() === 13, '验收页不是 13 张'); ok(/noindex/.test(await p.locator('meta[name="robots"]').getAttribute('content')), '验收页没有 noindex');
    await shot(p, '30-验收页-390');
    ok(bad.length === 0, '有请求不在子路径下或 404（整个测试期间）：' + [...new Set(bad)].join(', '));
    ok((await p.locator('[data-testid="build-stamp"]').innerText()).includes(version.commit), '页脚提交号和 version.json 不一致');
    await c.close();
  });

  await b.close(); server.close();
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify({ base: BASE, version, ranAt: new Date().toISOString(), browser: process.env.CHROME_PATH ? 'Chrome (' + process.env.CHROME_PATH + ')' : 'Playwright Chromium', results }, null, 2));
  const fail = results.filter(r => !r.pass).length; console.log(`\n${results.length - fail}/${results.length} 通过`); process.exit(fail ? 1 : 0);
})();
