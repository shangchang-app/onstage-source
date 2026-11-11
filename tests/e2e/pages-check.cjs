// 免费试玩版检查（V1.5）：用一个模拟 GitHub Pages 行为的静态服务器（/仓库名/ 路径、目录补斜杠、404.html）打开 dist-pages，
// 用真实 Chromium 走一遍学生会做的事。用法：npm run build:static && npm run test:pages
const { chromium } = require('playwright');
const http = require('node:http'), fs = require('node:fs'), path = require('node:path'), net = require('node:net');
const ROOT = path.resolve(process.argv[2] || 'dist-pages'), BASE = (process.env.PAGES_BASE ?? '/onstage').replace(/\/+$/, '');
const OUT = path.join('test-results', 'pages'), SHOTS = path.join(OUT, 'shots'), DELIVER = path.join(OUT, 'screens'); fs.mkdirSync(SHOTS, { recursive: true }); fs.mkdirSync(DELIVER, { recursive: true });
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
  const SITE = `http://127.0.0.1:${port}${BASE}`, W = SITE + '/experiences/ops-returns/work/', DW = SITE + '/experiences/ops-returns-deep/work/';
  const b = await chromium.launch();
  const ctx = async (o = {}) => { const c = await b.newContext({ viewport: { width: 1280, height: 860 }, ...o }); const p = await c.newPage(); p.errors = []; p.on('pageerror', e => p.errors.push(e.message)); p.on('console', m => { if (m.type() === 'error') p.errors.push(m.text()); }); return { c, p }; };
  const waitSaved = p => p.waitForFunction(() => /已保存/.test(document.querySelector('.work-head .save-state')?.textContent || ''), null, { timeout: 15000 });
  const practice = async p => { await p.goto(DW, { waitUntil: 'networkidle' }); await p.click('.stepper li:nth-child(4) button'); await p.waitForSelector('#f-p1-before'); };


  const save = (p, name, full = true) => p.screenshot({ path: path.join(DELIVER, name + '.png'), fullPage: full });
  const saveState = p => p.locator('.work-head .save-state').innerText();
  const toPlan = async p => { await p.goto(W, { waitUntil: 'networkidle' }); await p.click('.stepper li:nth-child(3) button'); await p.waitForSelector('#f-plan-reason'); };

  await check('首页：一句话说清楚、能看到场景预览和成果示例、有开始入口；标注示例；没有登录入口', async () => {
    const { c, p } = await ctx({ deviceScaleFactor: 2 }); await p.goto(SITE + '/', { waitUntil: 'networkidle' });
    const t = await p.locator('main').innerText();
    for (const k of ['先试着做一次工作', '再决定要不要走这条路', '体验预览', '做完能得到什么', '示例', '短体验', '深度版', '简版练习', '正在规划']) ok(t.includes(k), '首页缺少：' + k);
    ok(await p.locator('a:has-text("开始 8 分钟体验")').count() === 1, '没有开始入口');
    ok(await p.locator('.site-head .badge:has-text("试用版")').count() === 1 && await p.locator('.site-head a:has-text("登录")').count() === 0, '页头状态不对');
    ok(await p.locator('.dev-bar').count() === 0, '出现测试环境提示条');
    ok((await p.locator('a[href^="/experiences"]').count()) === 0, '有链接缺少仓库路径前缀');
    await save(p, '01-桌面-首页'); ok(p.errors.length === 0, p.errors.join(' | ')); await c.close();
  });

  await check('专属链接和深链接刷新：详情页、作答页（带或不带结尾斜杠）都能直接打开', async () => {
    const { c, p } = await ctx({ deviceScaleFactor: 2 });
    for (const u of [SITE + '/experiences/ops-returns/', SITE + '/experiences/ops-returns']) { await p.goto(u, { waitUntil: 'networkidle' }); ok((await p.locator('h1').innerText()).includes('利润却少了一半'), '打不开：' + u); }
    ok(await p.locator('a:has-text("开始（约 8 分钟）")').isVisible(), '没有开始按钮'); await save(p, '02-桌面-体验详情', false);
    for (const u of [W, W.slice(0, -1)]) { await p.goto(u, { waitUntil: 'networkidle' }); await p.waitForSelector('.msg'); await p.reload({ waitUntil: 'networkidle' }); await p.waitForSelector('.msg'); }
    const res = await p.request.get(SITE + '/_next/static/does-not-exist.js'); ok(res.status() === 404, '静态资源路径异常');
    ok(p.errors.length === 0, p.errors.join(' | ')); await c.close();
  });

  await check('旗舰短体验完整流程：收到任务 → 看材料 → 行动与理由 → 复盘（反馈对应实际操作）', async () => {
    const { c, p } = await ctx({ deviceScaleFactor: 2 }); const t0 = Date.now();
    await p.goto(SITE + '/', { waitUntil: 'networkidle' }); await p.click('a:has-text("开始 8 分钟体验")'); await p.waitForURL('**/ops-returns/work/');
    await p.waitForSelector('.msg'); ok(await p.locator('textarea').count() === 0, '第一屏不应该出现长表单'); await save(p, '03-桌面-第1步-收到任务');
    await p.click('button:has-text("开始：去后台看看")'); await p.waitForSelector('.matc');
    ok(await p.evaluate(() => document.activeElement?.id) === 'q-h', '换步骤后焦点没有到标题');
    await p.click('.matc:has-text("退货原因") .matc-h button'); await p.click('.matc:has-text("退货原因") button:has-text("标为关键")');
    await p.click('.matc:has-text("差评和适配表") .matc-h button'); await p.click('.matc:has-text("第 4 周改了什么") .matc-h button');
    ok(await p.locator('.matc:has-text("退货原因") button[aria-pressed="true"]').count() === 1, '标为关键没有生效');
    ok((await p.locator('.quick-foot').innerText()).includes('已看 3/4'), '已看数量不对');
    await save(p, '04-桌面-第2步-看材料');
    await p.click('button:has-text("写下周的行动")'); await p.waitForSelector('#f-plan-reason');
    ok(await p.locator('button:has-text("提交方案，看复盘")').isDisabled(), '没写方案时就能提交');
    await p.locator('.choice:has-text("按原厂目录核对")').click(); await p.locator('.choice:has-text("加大广告预算")').click();
    await p.fill('#f-plan-own', '先让客服把 64 单不匹配退货按车型列一张表');
    await p.fill('#f-plan-reason', '车型不匹配从 6 单涨到 64 单，差评车型都是新加的。');
    await p.locator('.choice:has-text("退回实物的检查结果")').click();
    ok(await p.locator('.quick-side .matc').count() === 4, '桌面端没有材料对照栏');
    await waitSaved(p); await save(p, '05-桌面-第3步-行动与理由');
    await p.click('button:has-text("提交方案，看复盘")'); await p.waitForSelector('#rv-ref');
    const r = await p.locator('main').innerText();
    for (const k of ['没有接入 AI，不会自动分析这段文字', '先让客服把 64 单不匹配退货按车型列一张表', '车型不匹配从 6 单涨到 64 单', '合理的地方', '可能漏掉的', '要权衡的', '怎么知道有没有用', '参考复盘', '系统参考，不是标准答案', '这份工作平时是什么样', '深度版']) ok(r.includes(k), '复盘缺少：' + k);
    ok(r.includes('没有打开：利润拆解'), '没指出没看的关键材料');
    ok(r.includes('没有选：暂停「brake pads」广泛匹配'), '没指出没选的核心行动');
    ok(r.includes('可能让问题更严重'), '没指出高风险行动的取舍');
    ok(r.includes('没有提到按车型拆分的数据'), '没指出缺少的关键信息');
    ok(r.includes('系统不会读你写的文字'), '写了自己的方案时，没说明系统不读文字');
    ok(!/[0-9]+ ?分(?!钟)|适合你|你是.{0,6}型/.test(r.replace(/不打分|分数|分钟|评分|分清|分摊|拆分|部分|一分钟|分别|分析|分享/g, '')), '复盘里出现了分数或标签');
    await p.waitForSelector('[data-testid="trial-note"]'); ok(await p.locator('button:has-text("完成并保存记录")').count() === 0, '试玩版不应出现完成按钮');
    await save(p, '06-桌面-第4步-复盘'); console.log('    完整流程用时（自动操作）', Math.round((Date.now() - t0) / 1000), '秒');
    // 返回修改：内容还在，改完复盘跟着变
    await p.click('button:has-text("改一改方案")'); await p.waitForSelector('#f-plan-reason'); ok(await p.inputValue('#f-plan-reason') === '车型不匹配从 6 单涨到 64 单，差评车型都是新加的。', '返回修改时内容丢失');
    await p.locator('.choice:has-text("暂停「brake pads」")').click(); await p.click('button:has-text("提交方案，看复盘")'); await p.waitForSelector('#rv-ref');
    ok(!(await p.locator('main').innerText()).includes('没有选：暂停「brake pads」广泛匹配'), '修改后复盘没有更新');
    // 打印版：只保留内容
    await p.emulateMedia({ media: 'print' }); ok(await p.locator('.site-head').isHidden() && await p.locator('.next-card').isHidden(), '打印时没有隐藏导航'); await p.emulateMedia({ media: 'screen' });
    ok(p.errors.length === 0, p.errors.join(' | ')); await c.close();
  });

  await check('只写自己的方案也能完成；复盘明确说明没有自动评估自由文字', async () => {
    const { c, p } = await ctx(); await toPlan(p);
    await p.fill('#f-plan-own', '先暂停所有新增车型的广告'); ok(await p.locator('button:has-text("提交方案，看复盘")').isDisabled(), '没写理由就能提交');
    await p.fill('#f-plan-reason', '新增车型退货最多'); await p.click('button:has-text("提交方案，看复盘")'); await p.waitForSelector('#rv-ref');
    ok((await p.locator('main').innerText()).includes('下面没有对你的方案做自动评估'), '没有说明'); await c.close();
  });

  await check('刷新恢复：回到上次步骤，作答、已看材料、关键标记都在', async () => {
    const { c, p } = await ctx(); await p.goto(W, { waitUntil: 'networkidle' }); await p.click('button:has-text("开始：去后台看看")');
    await p.click('.matc:has-text("利润拆解") .matc-h button'); await p.click('.matc:has-text("利润拆解") button:has-text("标为关键")');
    await p.click('button:has-text("写下周的行动")'); await p.fill('#f-plan-reason', '广告花得太多'); await waitSaved(p);
    await p.reload({ waitUntil: 'networkidle' }); await p.waitForSelector('#f-plan-reason');
    ok(await p.inputValue('#f-plan-reason') === '广告花得太多', '刷新后理由丢失');
    ok((await p.locator('main').innerText()).includes('你标为关键的材料：利润拆解'), '关键标记丢失');
    await p.click('.stepper li:nth-child(2) button'); await p.waitForSelector('.matc'); ok((await p.locator('.quick-foot').innerText()).includes('已看 1/4'), '已看记录丢失');
    await c.close();
  });

  await check('数据隔离：不同体验的作答互不影响；不同访客互相看不到', async () => {
    const A = await ctx(), B = await ctx(); await toPlan(A.p); await A.p.fill('#f-plan-reason', '访客 A 的理由'); await waitSaved(A.p);
    await practice(A.p); ok(await A.p.inputValue('#f-p1-before') === '', '深度版出现了短体验的作答');
    await A.p.fill('#f-p1-before', '深度版作答'); await waitSaved(A.p); await toPlan(A.p); ok(await A.p.inputValue('#f-plan-reason') === '访客 A 的理由', '短体验作答被覆盖');
    await toPlan(B.p); ok(await B.p.inputValue('#f-plan-reason') === '', '访客 B 看到了 A 的作答');
    await A.c.close(); await B.c.close();
  });

  await check('键盘操作：材料可以用键盘展开和标记，焦点可见，选项有标签', async () => {
    const { c, p } = await ctx(); await p.goto(W, { waitUntil: 'networkidle' }); await p.click('button:has-text("开始：去后台看看")'); await p.waitForSelector('.matc');
    const first = p.locator('.matc .matc-h button').first(); await first.focus(); await p.keyboard.press('Enter');
    ok(await first.getAttribute('aria-expanded') === 'true', 'Enter 没有展开材料');
    const outline = await p.evaluate(() => getComputedStyle(document.activeElement).outlineStyle); ok(outline !== 'none', '焦点不可见');
    const keep = p.locator('.matc').first().locator('button:has-text("标为关键")'); await keep.focus(); await p.keyboard.press('Space');
    ok(await p.locator('.matc').first().locator('button[aria-pressed="true"]').count() === 1, '空格没有标为关键');
    await p.click('button:has-text("写下周的行动")'); await p.waitForSelector('#f-plan-reason');
    const unlabeled = await p.evaluate(() => [...document.querySelectorAll('main input, main textarea')].filter(el => !el.closest('label') && !(el.id && document.querySelector(`label[for="${el.id}"]`))).length);
    ok(unlabeled === 0, unlabeled + ' 个输入框没有标签'); await c.close();
  });

  await check('减少动效：系统设置减少动效时，过渡动画被关闭', async () => {
    const { c, p } = await ctx({ reducedMotion: 'reduce' }); await p.goto(SITE + '/', { waitUntil: 'networkidle' });
    const d = await p.evaluate(() => getComputedStyle(document.querySelector('.btn')).transitionDuration); ok(d.split(',').every(x => parseFloat(x) < 0.01), '仍有过渡动画：' + d); await c.close();
  });

  await check('同一浏览器开两个页面同时改（深度版）：两份都保留，可以选择', async () => {
    const { c, p } = await ctx(); const p2 = await c.newPage();
    await practice(p); await practice(p2);
    await p.fill('#f-p6-missing', '页面一'); await waitSaved(p);
    await p2.fill('#f-p6-missing', '页面二'); await p2.waitForSelector('#cf-h', { timeout: 15000 });
    await p2.click('.cf-col button:has-text("改用这份")'); await p2.waitForSelector('#cf-h', { state: 'detached' });
    await p2.click('.stepper li:nth-child(4) button'); ok(await p2.inputValue('#f-p6-missing') === '页面二', '冲突处理后内容不对');
    await c.close();
  });
  await check('深度版 6 步与简版练习照常可用', async () => {
    const { c, p } = await ctx(); await practice(p); for (let i = 5; i <= 6; i++) { await p.click(`.stepper li:nth-child(${i}) button`); await p.waitForTimeout(100); }
    ok((await p.locator('[data-testid="trial-note"]').innerText()).includes('7 天'), '没有说明保存范围');
    await p.goto(SITE + '/experiences/yc-quick/work/', { waitUntil: 'networkidle' });
    await p.click('#pr-t0 button:has-text("查看参考思路")'); await p.waitForSelector('#pr-t0 [role="note"]');
    await waitSaved(p); ok((await p.locator('.track').innerText()).includes('已看参考思路')); await c.close();
  });
  await check('企业合作页：流程、素材清单、样例都标明示例；没有接收服务时不做假提交', async () => {
    const { c, p } = await ctx({ deviceScaleFactor: 2 }); await p.goto(SITE + '/cooperate/', { waitUntil: 'networkidle' }); const t = await p.locator('main').innerText();
    for (const k of ['合作怎么进行', '企业需要提供', '一个体验长什么样', '学生最后交出的东西', '匿名汇总报告', '以下数字全部是虚构的', '目前上场还没有合作企业', '企业看不到任何学生的个人作答或草稿']) ok(t.includes(k), '缺少：' + k);
    ok(await p.locator('[data-testid="coop-pending"]').count() === 1 && await p.locator('main form').count() === 0 && !t.includes('已收到你的合作意向') && await p.locator('main button:has-text("提交")').count() === 0, '静态版不应出现提交表单');
    ok(!/TiMi|天美|月之暗面|Kimi|MiniMax/.test(t), '出现了未合作企业的名字');
    await save(p, '07-桌面-企业合作'); ok(p.errors.length === 0, p.errors.join(' | ')); await c.close();
  });
  await check('机会库、企业页、404 照常', async () => {
    const { c, p } = await ctx(); await p.goto(SITE + '/jobs/', { waitUntil: 'networkidle' }); ok(await p.locator('.card').count() >= 3, '岗位列表为空');
    await p.goto(SITE + '/jobs/j1/', { waitUntil: 'networkidle' }); await p.click('button:has-text("前往企业官网投递")'); await p.waitForSelector('[role="dialog"]:has-text("示例信息")');
    await p.keyboard.press('Escape'); await p.waitForSelector('[role="dialog"]', { state: 'detached' });
    ok((await p.evaluate(() => document.activeElement?.textContent || '')).includes('前往企业官网投递'), '弹窗关闭后焦点没有回到按钮');
    await p.goto(SITE + '/companies/yc/', { waitUntil: 'networkidle' }); ok((await p.locator('main').innerText()).includes('示例'));
    await p.goto(SITE + '/no-such-page/', { waitUntil: 'networkidle' }); ok((await p.locator('h1').innerText()).includes('找不到'), '404 页面不对');
    await c.close();
  });
  await check('浏览器不能保存数据时，明确提示，不假装保存成功', async () => {
    const { c, p } = await ctx(); await p.addInitScript(() => { Storage.prototype.setItem = function () { throw new DOMException('QuotaExceededError', 'QuotaExceededError'); }; });
    await toPlan(p); await p.fill('#f-plan-reason', '写一句');
    await p.waitForFunction(() => /不能保存数据/.test(document.querySelector('.work-head .save-state')?.textContent || ''), null, { timeout: 10000 });
    ok(!/已保存/.test(await saveState(p)), '显示了已保存');
    ok((await p.locator('main').innerText()).includes('不能使用本地存储'), '页面没有存储不可用的说明');
    await p.screenshot({ path: path.join(SHOTS, 'pages-storage-failed.png') }); await c.close();
  });
  for (const [w, h] of [[390, 844], [320, 640]]) await check(`手机 ${w}px：无横向溢出；写方案时回看材料，关闭后回到原输入框，内容和位置不丢`, async () => {
    const { c, p } = await ctx({ viewport: { width: w, height: h }, deviceScaleFactor: w === 390 ? 3 : 2, hasTouch: true, isMobile: true });
    for (const u of ['/', '/experiences/', '/experiences/ops-returns/', '/experiences/ops-returns/work/', '/cooperate/', '/jobs/', '/me/']) { await p.goto(SITE + u, { waitUntil: 'networkidle' }); const o = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth); ok(o <= 0, `${u} 横向溢出 ${o}px`); }
    if (w === 390) { await p.goto(SITE + '/', { waitUntil: 'networkidle' }); await save(p, '11-手机-首页'); }
    await p.goto(W, { waitUntil: 'networkidle' }); await p.waitForSelector('.msg'); if (w === 390) await save(p, '12-手机-第1步-收到任务', false);
    await p.click('button:has-text("开始：去后台看看")'); await p.click('.matc:has-text("差评和适配表") .matc-h button'); if (w === 390) await save(p, '13-手机-第2步-看材料', false);
    await p.click('button:has-text("写下周的行动")'); await p.waitForSelector('#f-plan-reason');
    await p.locator('.choice:has-text("按原厂目录核对")').tap(); await p.tap('#f-plan-reason'); await p.keyboard.type('车型不匹配涨得最多');
    const y0 = await p.evaluate(() => scrollY);
    await p.click('.mobile-tools button:has-text("回看材料")'); await p.waitForSelector('[role="dialog"]:has-text("后台材料")');
    await p.click('[role="dialog"] .matc:has-text("退货原因") .matc-h button'); if (w === 390) await save(p, '14-手机-回看材料抽屉', false);
    await p.keyboard.press('Escape'); await p.waitForSelector('[role="dialog"]', { state: 'detached' });
    ok(await p.evaluate(() => document.activeElement?.id) === 'f-plan-reason' && await p.inputValue('#f-plan-reason') === '车型不匹配涨得最多', '焦点或内容没有保留');
    ok(Math.abs(await p.evaluate(() => scrollY) - y0) < 80, '关闭材料后页面位置变了');
    if (w === 390) { await waitSaved(p); await p.evaluate(() => scrollTo(0, 0)); await save(p, '15-手机-第3步-行动与理由'); await p.click('button:has-text("提交方案，看复盘")'); await p.waitForSelector('#rv-ref'); await save(p, '16-手机-第4步-复盘'); await p.goto(SITE + '/cooperate/', { waitUntil: 'networkidle' }); await save(p, '17-手机-企业合作'); }
    ok(p.errors.length === 0, p.errors.join(' | ')); await c.close();
  });
  await b.close(); server.close();
  fs.writeFileSync(path.join(OUT, 'pages.json'), JSON.stringify({ at: new Date().toISOString(), base: BASE, results }, null, 2));
  console.log(`\n${results.filter(r => r.pass).length} passed, ${results.filter(r => !r.pass).length} failed`);
  process.exit(results.every(r => r.pass) ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
