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
    for (const k of ['先试着做一次工作', '再决定要不要走这条路', '体验预览', '做完能得到什么', '示例', '短体验', '完整体验', '简版练习', '正在规划', '两个 AI 回答', '问题诊断与行动建议卡', '评测标准与案例分析', '机会库里目前只有示例信息']) ok(t.includes(k), '首页缺少：' + k);
    ok(await p.locator('main .card:has-text("实习生")').count() === 0, '首页不应推荐示例岗位');
    ok(/版本 1\.6\.0 · 源码提交 [0-9a-f]{7}/.test(await p.locator('[data-testid="build-stamp"]').innerText()), '页脚没有版本和提交号');
    const v = await (await p.request.get(SITE + '/version.json')).json(); ok(v.version === '1.6.0' && /^[0-9a-f]{7}/.test(v.commit), 'version.json 不对');
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
    for (const k of ['没有接入 AI，不会自动分析这段文字', '先让客服把 64 单不匹配退货按车型列一张表', '车型不匹配从 6 单涨到 64 单', '合理的地方', '可能漏掉的', '要权衡的', '怎么知道有没有用', '参考复盘', '系统参考，不是标准答案', '这份工作平时是什么样', '深度版', '你的成果：行动方案']) ok(r.includes(k), '复盘缺少：' + k);
    ok(r.includes('没有打开：利润拆解'), '没指出没看的关键材料');
    ok(r.includes('没有选：暂停「brake pads」广泛匹配'), '没指出没选的核心行动');
    ok(r.includes('可能让问题更严重'), '没指出高风险行动的取舍');
    ok(r.includes('没有提到按车型拆分的数据'), '没指出缺少的关键信息');
    ok(r.includes('系统不会读你写的文字'), '写了自己的方案时，没说明系统不读文字');
    ok(!/[0-9]+ ?分(?!钟)|适合你|你是.{0,6}型/.test(r.replace(/不打分|分数|分钟|评分|分清|分摊|拆分|部分|一分钟|分别|分析|分享/g, '')), '复盘里出现了分数或标签');
    await p.waitForSelector('#out-h'); ok(await p.locator('button:has-text("完成并保存记录")').count() === 0, '试玩版不应出现完成按钮'); ok(!(await p.locator('main').innerText()).includes('暂不能保存'), '还在提示暂不能保存');
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
    ok((await p.locator('.out-panel').innerText()).includes('只保存在这台设备的这个浏览器里'), '没有说明保存范围');
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

  /* ---------- V1.6：完整体验 → 成果 ---------- */
  const NUM = { 'f-p0-rate': '3.7%', 'f-p1-before': '约 4.7%', 'f-p1-after': '约 11.1%', 'f-t-before': '5.1%', 'f-t-after': '5.1%' };
  async function fillVisible(p, tag) {
    for (const sec of await p.locator('.practice').all()) {
      for (const fs_ of await sec.locator('fieldset').all()) if (await fs_.locator('input:checked').count() === 0) await fs_.locator('.choice').first().click();
      for (const el of await sec.locator('input.input, textarea').all()) { const id = await el.getAttribute('id'); if (!(await el.inputValue())) await el.fill(NUM[id] || `${tag}：${id} 的作答`); }
    }
  }
  async function doFull(p, url, tag, stepsCount = 6) {
    await p.goto(url, { waitUntil: 'networkidle' }); await p.waitForSelector('.stepper');
    await p.click('.stepper li:nth-child(2) button'); await p.waitForTimeout(150);
    await p.click('.stepper li:nth-child(4) button'); await p.waitForSelector('.practice'); await fillVisible(p, tag); await waitSaved(p);
    await p.click('.stepper li:nth-child(5) button'); await p.waitForSelector('#chg-h'); // 第一次看参考：保留「看参考前」的版本
    await p.click('.stepper li:nth-child(6) button'); await p.waitForSelector('.transfer-intro'); await fillVisible(p, tag); await waitSaved(p);
  }
  await check('新用户：运营完整体验从开始到保存成果；成果只含自己的作答，标明教学作品、版本、时间、保存范围；可以从「我的」重新打开', async () => {
    const { c, p } = await ctx({ deviceScaleFactor: 2 });
    await p.goto(DW, { waitUntil: 'networkidle' }); await p.click('.stepper li:nth-child(2) button'); await p.waitForSelector('#lessons-h');
    ok((await p.locator('#lessons-h').locator('..').innerText()).includes('整体退货率要用合计数算'), '示范页没有方法要点'); await save(p, '21-桌面-深度版-示范与方法');
    await p.click('.stepper li:nth-child(4) button'); await p.waitForSelector('#f-p0-rate');
    await p.fill('#f-p0-rate', '6.5%'); await p.waitForSelector('[data-testid="rule-p0.rate"]'); ok((await p.locator('[data-testid="rule-p0.rate"]').innerText()).includes('平均'), '平均百分比没有对应的规则说明');
    await p.fill('#f-p0-rate', '3.7%'); await p.waitForFunction(() => /一致/.test(document.querySelector('[data-testid="rule-p0.rate"]')?.textContent || ''));
    ok((await p.locator('.lesson-tip').first().innerText()).includes('方法提醒'), '没有方法提醒');
    await fillVisible(p, '我的'); await waitSaved(p); await p.evaluate(() => scrollTo(0, 0)); await save(p, '22-桌面-深度版-跟着尝试（规则检查）', false);
    await p.click('.stepper li:nth-child(5) button'); await p.waitForSelector('#chg-h');
    ok((await p.locator('.fb-legend').innerText()).includes('个性化点评：没有提供'), '没有区分三种反馈');
    // 看完参考回去改一处，前后版本都保留
    await p.click('button:has-text("回去修改作答")'); await p.waitForSelector('#f-p3-main'); await p.fill('#f-p3-main', '看完参考后改写：车型不匹配 64 单，评论车型都是新增的'); await waitSaved(p);
    await p.click('.stepper li:nth-child(5) button'); await p.waitForSelector('.chg li'); ok((await p.locator('.chg').innerText()).includes('看完参考后改写'), '没有显示前后变化');
    await p.click('.stepper li:nth-child(6) button'); await p.waitForSelector('.transfer-intro'); ok(await p.locator('[data-testid="save-work"]').count() === 0, '迁移练习没做也能保存');
    await p.fill('#f-t-before', '10%'); ok((await p.locator('[data-testid="rule-t.before"]').innerText()).includes('不一致'), '迁移练习没有数字检查');
    await p.fill('#f-t-before', '5.1%'); await fillVisible(p, '迁移'); await p.locator('#pr-p7 button:has-text("对照参考标注")').click();
    ok((await p.locator('[data-testid="rule-t.judge"]').innerText()).includes('只比较你选的标签'), '选择题检查没有说明范围');
    await waitSaved(p); await p.locator('#out-h').scrollIntoViewIfNeeded(); await save(p, '23-桌面-深度版-迁移练习与成果预览');
    await p.click('[data-testid="save-work"]'); await p.waitForSelector('.out-side .ok-box'); ok((await p.locator('.out-side .ok-box').innerText()).includes('已保存到本机'), '没有保存成功提示');
    // 再改一处并保存：生成修改记录
    await p.click('.stepper li:nth-child(4) button'); await p.fill('#f-p6-missing', '第二版：按车型拆分的退货（找数据同事）'); await waitSaved(p);
    await p.click('.stepper li:nth-child(6) button'); await p.click('[data-testid="save-work"]'); await p.waitForSelector('.out-side .ok-box:has-text("已更新成果")');
    await p.click('.out-side a:has-text("打开成果页")'); await p.waitForURL('**/works/?id=*'); await p.waitForSelector('.work-card');
    const w = await p.locator('.work-card').innerText();
    for (const k of ['教学模拟作品', '问题诊断与行动建议卡', '任务版本：第 1 版', '完成时间：', '问题概述', '关键证据', '原因假设', '优先行动', '待验证信息', '看完参考后改写', '第二版：按车型拆分的退货', '只保存在这台设备的这个浏览器里']) ok(w.includes(k), '成果页缺少：' + k);
    ok(!w.includes('最可能是新增车型的适配数据有错。依据'), '成果里混入了参考答案');
    ok((await p.locator('#rev-h').locator('..').innerText()).includes('看参考思路之前写的版本'), '没有保留看参考前的版本');
    await save(p, '24-桌面-成果页');
    await p.click('#rev-h ~ ul button, .sec-card ul .text-btn >> nth=0'); await p.waitForSelector('.warn-box:has-text("旧版本")'); ok(!(await p.locator('.work-card').innerText()).includes('第二版'), '旧版本显示不对');
    await p.emulateMedia({ media: 'print' }); ok(await p.locator('.site-head').isHidden() && await p.locator('.crumb').isHidden() && await p.locator('.work-card').isVisible(), '打印版不对'); await p.emulateMedia({ media: 'screen' });
    // 关闭后重新打开：草稿和成果都在
    const p2 = await c.newPage(); p2.errors = []; p2.on('pageerror', e => p2.errors.push(e.message)); await p.close(); await p2.goto(SITE + '/me/', { waitUntil: 'networkidle' }); await p2.waitForSelector('#h-works');
    const me = await p2.locator('main').innerText(); ok(me.includes('问题诊断与行动建议卡') && me.includes('1 次修改记录'), '「我的」没有成果'); ok(me.includes('深度版：退货率上升'), '「我的」没有草稿');
    await save(p2, '25-桌面-我的'); ok(p2.errors.length === 0, p2.errors.join(' | ')); await c.close();
  });
  await check('第二个完整体验（AI 回答评测）：示范、标签规则检查、成果保存；和运营体验的数据互不影响', async () => {
    const { c, p } = await ctx({ deviceScaleFactor: 2 });
    await p.goto(SITE + '/experiences/ai-eval/', { waitUntil: 'networkidle' }); const d = await p.locator('main').innerText();
    for (const k of ['未经 AI 产品或评测从业者审核', '人工编写的教学样例', 'Microsoft Support', '评测标准与案例分析']) ok(d.includes(k), '详情页缺少：' + k);
    await save(p, '31-桌面-AI评测-详情');
    await doFull(p, SITE + '/experiences/ai-eval/work/', 'AI');
    await p.click('.stepper li:nth-child(4) button'); await p.waitForSelector('#pr-q4');
    await p.locator('#pr-q4 button:has-text("对照参考标注")').first().click(); const rc = await p.locator('[data-testid="rule-c.tags"]').innerText();
    ok(rc.includes('参考标注') && rc.includes('FALSE'), 'C 的参考说明不对'); await p.locator('#pr-q3').scrollIntoViewIfNeeded(); await save(p, '32-桌面-AI评测-逐个评估', false);
    await p.click('.stepper li:nth-child(6) button'); await p.waitForSelector('[data-testid="save-work"]'); await p.click('[data-testid="save-work"]'); await p.waitForSelector('.out-side .ok-box');
    await p.goto(SITE + '/me/', { waitUntil: 'networkidle' }); await p.waitForSelector('#h-works'); ok((await p.locator('main').innerText()).includes('评测标准与案例分析'), '「我的」没有 AI 成果');
    await p.goto(DW, { waitUntil: 'networkidle' }); await p.click('.stepper li:nth-child(4) button'); await p.waitForSelector('#f-p1-before'); ok(await p.inputValue('#f-p1-before') === '', '运营体验出现了 AI 体验的作答');
    ok(p.errors.length === 0, p.errors.join(' | ')); await c.close();
  });
  await check('导出备份 → 在空白浏览器导入：成果和草稿都恢复；错误文件给出原因；清除草稿不影响成果', async () => {
    const A = await ctx({ acceptDownloads: true }); await doFull(A.p, DW, '备份'); await A.p.click('[data-testid="save-work"]'); await A.p.waitForSelector('.out-side .ok-box');
    await A.p.goto(SITE + '/me/', { waitUntil: 'networkidle' }); await A.p.waitForSelector('#h-backup');
    const [dl] = await Promise.all([A.p.waitForEvent('download'), A.p.click('button:has-text("导出备份")')]); const file = path.join(OUT, 'backup.json'); await dl.saveAs(file);
    ok(JSON.parse(fs.readFileSync(file, 'utf8')).format === 'onstage-backup', '导出的不是备份文件');
    // 清除草稿：成果还在
    await A.p.click('.list-row:has-text("深度版") button:has-text("清除草稿")'); await A.p.waitForSelector('[role="alertdialog"]');
    await A.p.click('[role="alertdialog"] button:has-text("清除草稿")'); await A.p.waitForSelector('[role="alertdialog"]', { state: 'detached' });
    await A.p.waitForFunction(() => !document.querySelector('#h-cont')?.closest('section')?.textContent?.includes('深度版'));
    ok((await A.p.locator('main').innerText()).includes('问题诊断与行动建议卡'), '清除草稿后成果不见了'); await A.c.close();
    const B = await ctx(); await B.p.goto(SITE + '/me/', { waitUntil: 'networkidle' }); await B.p.waitForSelector('#h-backup');
    const bad = path.join(OUT, 'bad.json'); fs.writeFileSync(bad, '{"hello":1}'); await B.p.setInputFiles('#import-file', bad);
    await B.p.waitForSelector('.bad-box[role="alert"]'); ok((await B.p.locator('.bad-box[role="alert"]').innerText()).includes('不是上场的备份文件'), '错误文件提示不对');
    await B.p.setInputFiles('#import-file', file); await B.p.waitForSelector('.ok-box:has-text("导入完成")'); const t = await B.p.locator('main').innerText();
    ok(t.includes('新增 1 份成果') && t.includes('问题诊断与行动建议卡'), '导入后没有成果'); ok(t.includes('深度版：退货率上升'), '导入后没有草稿');
    await save(B.p, '26-桌面-我的-导入备份后'); await B.c.close();
  });
  await check('旧版草稿升级：线上 V1.4.1 浏览器里的 6 步作答，升级后出现在深度版，内容不丢', async () => {
    const { c, p } = await ctx();
    await p.addInitScript(() => { if (!localStorage.getItem('onstage-free:v1')) localStorage.setItem('onstage-free:v1', JSON.stringify({ owner: 'local:old', drafts: { 'ops-returns': { owner: 'local:old', content_id: 'ops-returns', version: 4, content_version: 1, answers: { 'p1.before': '旧版写的 4.7%', 'p5.first': '旧版写的行动' }, conflict: 0, conflict_with: null, saved_at: '2026-11-11T08:00:00.000Z', progress: { step: 3, visited: [0, 1, 2, 3], referenceViewed: false, hintsOpened: [] } } }, recoveries: [] })); });
    await p.goto(DW, { waitUntil: 'networkidle' }); await p.waitForSelector('#f-p1-before');
    ok(await p.inputValue('#f-p1-before') === '旧版写的 4.7%', '旧版作答没有迁移'); ok(await p.inputValue('#f-p5-first') === '旧版写的行动', '旧版作答没有迁移');
    await p.goto(W, { waitUntil: 'networkidle' }); await p.waitForSelector('.msg'); ok(await p.locator('textarea').count() === 0, '短体验被旧数据打乱');
    await c.close();
  });
  await check('保存成果时空间不足：给出真实错误和恢复办法，不显示保存成功', async () => {
    const { c, p } = await ctx(); await doFull(p, DW, '空间');
    await p.evaluate(() => { const o = Storage.prototype.setItem; Storage.prototype.setItem = function (k, v) { if (k === 'onstage-works:v1') throw new DOMException('full', 'QuotaExceededError'); return o.call(this, k, v); }; });
    await p.click('[data-testid="save-work"]'); await p.waitForSelector('.out-side .bad-box');
    const t = await p.locator('.out-side .bad-box').innerText(); ok(t.includes('存储空间满了') && t.includes('怎么办') && t.includes('导出备份'), '空间不足提示不对');
    ok(await p.locator('.out-side .ok-box').count() === 0, '显示了保存成功'); await save(p, '27-桌面-保存失败提示', false); await c.close();
  });
  for (const [w, h] of [[390, 844], [320, 640]]) await check(`手机 ${w}px：无横向溢出；写方案时回看材料，关闭后回到原输入框，内容和位置不丢`, async () => {
    const { c, p } = await ctx({ viewport: { width: w, height: h }, deviceScaleFactor: w === 390 ? 3 : 2, hasTouch: true, isMobile: true });
    for (const u of ['/', '/experiences/', '/experiences/ops-returns/', '/experiences/ops-returns/work/', '/experiences/ops-returns-deep/work/', '/experiences/ai-eval/', '/experiences/ai-eval/work/', '/works/?id=none', '/cooperate/', '/jobs/', '/me/']) { await p.goto(SITE + u, { waitUntil: 'networkidle' }); const o = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth); ok(o <= 0, `${u} 横向溢出 ${o}px`); }
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
  await check('手机 390px：完整体验的规则检查、成果保存、成果页、「我的」；弹窗关闭后焦点回来', async () => {
    const { c, p } = await ctx({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true });
    await doFull(p, DW, '手机');
    await p.click('.stepper li:nth-child(4) button'); await p.waitForSelector('#f-p0-rate'); await p.locator('#pr-p0').scrollIntoViewIfNeeded(); await save(p, '41-手机-规则检查', false);
    await p.click('.stepper li:nth-child(6) button'); await p.waitForSelector('[data-testid="save-work"]'); await p.click('[data-testid="save-work"]'); await p.waitForSelector('.out-side .ok-box');
    await p.locator('.out-panel').scrollIntoViewIfNeeded(); await save(p, '42-手机-成果预览与保存', false);
    for (const u of ['/me/']) { await p.goto(SITE + u, { waitUntil: 'networkidle' }); }
    await p.waitForSelector('#h-works'); await save(p, '44-手机-我的');
    const btn = p.locator('.list-row:has-text("深度版") button:has-text("清除草稿")'); await btn.click(); await p.waitForSelector('[role="alertdialog"]');
    ok(await p.evaluate(() => !!document.activeElement?.closest('[role="alertdialog"]')), '焦点没有进入弹窗');
    await p.keyboard.press('Escape'); await p.waitForSelector('[role="alertdialog"]', { state: 'detached' });
    ok((await p.evaluate(() => document.activeElement?.textContent || '')).includes('清除草稿'), '弹窗关闭后焦点没有回到按钮');
    await p.click('.list-row a:has-text("打开")'); await p.waitForSelector('.work-card');
    const o = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth); ok(o <= 0, '成果页横向溢出 ' + o);
    await save(p, '43-手机-成果页'); ok(p.errors.length === 0, p.errors.join(' | ')); await c.close();
  });
  await b.close(); server.close();
  fs.writeFileSync(path.join(OUT, 'pages.json'), JSON.stringify({ at: new Date().toISOString(), base: BASE, results }, null, 2));
  console.log(`\n${results.filter(r => r.pass).length} passed, ${results.filter(r => !r.pass).length} failed`);
  process.exit(results.every(r => r.pass) ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
