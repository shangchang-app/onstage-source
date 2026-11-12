// 回归检查：「我的」实践完成状态与成果页「完成时间」同一口径；跳过示范也能完成；AI 评测标题与 4 个回答一致；全站不再出现与模拟内容冲突的「真实」说法。
// 用法：npm run build:static && node tests/e2e/completion-check.cjs dist-pages
// 每项检查都用全新、隔离的浏览器环境；截图在 test-results/completion/screens。
const { chromium } = require('playwright');
const http = require('node:http'), fs = require('node:fs'), path = require('node:path'), net = require('node:net');
const ROOT = path.resolve(process.argv[2] || 'dist-pages'), BASE = (process.env.PAGES_BASE ?? '/onstage').replace(/\/+$/, '');
const OUT = path.join('test-results', 'completion'), SHOTS = path.join(OUT, 'screens'); fs.mkdirSync(SHOTS, { recursive: true });
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.txt': 'text/plain; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2' };
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
const FORBIDDEN = ['真实求助', '真实岗位场景', '放进真实工作', '两个 AI 回答', '两个回答'];

(async () => {
  const port = await freePort(); const server = http.createServer(serve).listen(port, '127.0.0.1');
  const SITE = `http://127.0.0.1:${port}${BASE}`, GW = SITE + '/experiences/overseas-growth/work/';
  const b = await chromium.launch();
  const mobile = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
  const ctx = async (o = {}) => { const c = await b.newContext({ viewport: { width: 1280, height: 860 }, ...o }); const p = await c.newPage(); p.errors = []; p.on('pageerror', e => p.errors.push(e.message)); p.on('console', m => { if (m.type() === 'error') p.errors.push(m.text()); }); return { c, p }; };
  const step = async (p, n) => { await p.click(`.stepper li:nth-child(${n}) button`); await p.waitForTimeout(200); };
  const waitSaved = p => p.waitForFunction(() => /已保存/.test(document.querySelector('.work-head .save-state')?.textContent || ''), null, { timeout: 15000 });
  /* 跳过第 2 步示范和第 3 步任务，直接在第 4、6 步写完所有必填项（每个选择题选第一个选项）。 */
  const fillAll = async p => {
    for (const n of [4, 6]) {
      await step(p, n);
      for (const el of await p.locator('main .practice textarea, main .practice input.input').all()) if (!(await el.inputValue())) await el.fill((await el.getAttribute('id')) === 'f-g3-rate' ? '19.0' : '跳过示范直接写的作答');
      for (const fs of await p.locator('main .practice fieldset').all()) if (!(await fs.locator('input:checked').count())) await fs.locator('input').first().click();
    }
    await waitSaved(p);
  };
  const meRow = async p => { await p.goto(SITE + '/me/', { waitUntil: 'networkidle' }); const r = p.locator('[data-testid="draft-overseas-growth"]'); await r.waitFor(); return r; };
  const workTime = async p => (await p.locator('[data-testid=work-time]').innerText()).trim();

  await check('跳过示范：只写完作答并保存成果，「我的」显示已完成实践，完成时间和成果页一致', async () => {
    const { c, p } = await ctx(mobile); await p.goto(GW, { waitUntil: 'networkidle' });
    await fillAll(p);
    const visited = await p.evaluate(() => JSON.parse(localStorage.getItem('onstage-free:v1')).drafts['overseas-growth'].progress.visited);
    ok(!visited.includes(1), '测试前提：第 2 步示范应该没看过：' + JSON.stringify(visited));
    let row = await meRow(p); let t = (await row.innerText()).replace(/\s+/g, ' ');
    ok(t.includes('作答都写好了') && t.includes('保存后才算完成实践') && !t.includes('已完成实践'), '写完未保存时状态不对：' + t);
    await p.goto(GW, { waitUntil: 'networkidle' }); await step(p, 6);
    await p.locator('[data-testid=save-work]').click(); await p.waitForSelector('.out-side .ok-box');
    const work = await p.evaluate(() => JSON.parse(localStorage.getItem('onstage-works:v1')).works[0]);
    row = await meRow(p); t = (await row.innerText()).replace(/\s+/g, ' ');
    ok(t.includes('已完成实践') && !t.includes('未完成实践'), '保存成果后「我的」仍不是已完成：' + t);
    const m = t.match(/完成于 (\d{4}\/\d{1,2}\/\d{1,2} \d{1,2}:\d{2}(?::\d{2})?)/); ok(m, '「我的」没有完成时间：' + t);
    await row.screenshot({ path: path.join(SHOTS, 'c01-手机-我的-跳过示范已完成.png') });
    await p.goto(SITE + '/works/?id=' + work.id, { waitUntil: 'networkidle' });
    const wt = await workTime(p); ok(wt.includes('完成时间：' + m[1]), `成果页完成时间和「我的」不一致：我的 ${m[1]}；成果页 ${wt}`);
    await p.locator('.work-card header').screenshot({ path: path.join(SHOTS, 'c02-手机-成果页完成时间.png') });
    ok(p.errors.length === 0, p.errors.join(' | ')); await c.close();
  });

  await check('保存后改动：草稿少写一项时显示「成果已保存、还有 1 项没写完」；补完再保存，完成时间不变，另记最近修改', async () => {
    const { c, p } = await ctx(); await p.goto(GW, { waitUntil: 'networkidle' });
    await fillAll(p); await step(p, 6); await p.locator('[data-testid=save-work]').click(); await p.waitForSelector('.out-side .ok-box');
    const first = await p.evaluate(() => JSON.parse(localStorage.getItem('onstage-works:v1')).works[0]);
    await step(p, 4); await p.fill('#f-g6-missing', ''); await waitSaved(p);
    let t = (await (await meRow(p)).innerText()).replace(/\s+/g, ' ');
    ok(t.includes('成果已保存') && t.includes('还有 1 项没写完') && !t.includes('已完成实践 ·'), '保存后又删掉一项时状态不对：' + t);
    await p.waitForTimeout(1100);
    await p.goto(GW, { waitUntil: 'networkidle' }); await step(p, 4); await p.fill('#f-g6-missing', '补上：能接受的价格'); await waitSaved(p);
    await step(p, 6); await p.locator('[data-testid=save-work]').click(); await p.waitForSelector('.out-side .ok-box');
    const w = await p.evaluate(() => JSON.parse(localStorage.getItem('onstage-works:v1')).works[0]);
    ok(w.createdAt === first.createdAt && w.updatedAt !== first.updatedAt && w.revisions.length === 1, '再次保存后时间记录不对：' + JSON.stringify([first.createdAt, w.createdAt, w.updatedAt]));
    t = (await (await meRow(p)).innerText()).replace(/\s+/g, ' ');
    ok(t.includes('已完成实践') && t.includes('最近修改'), '「我的」没有区分完成时间和最近修改：' + t);
    await p.goto(SITE + '/works/?id=' + w.id, { waitUntil: 'networkidle' });
    const wt = await workTime(p); ok(wt.includes('完成时间：') && wt.includes('最近修改：'), '成果页没有区分完成时间和最近修改：' + wt);
    await p.locator('#rev-h').scrollIntoViewIfNeeded(); await p.locator('.sec-card ul button').first().click(); await p.waitForTimeout(300);
    const old = await workTime(p); ok(old.includes('完成时间：') && old.includes('这一版保存于'), '看旧版本时时间说明不对：' + old);
    const mine = await p.goto(SITE + '/me/', { waitUntil: 'networkidle' }).then(() => p.locator('#h-works').locator('xpath=ancestor::section[1]').innerText());
    ok(mine.includes('完成于') && !mine.includes('最近保存'), '「我的成果」列表时间说法不一致：' + mine.replace(/\s+/g, ' ').slice(0, 200));
    ok(p.errors.length === 0, p.errors.join(' | ')); await c.close();
  });

  await check('不生成成果的简版练习：「我的」不显示「完成实践」，说明这个体验不生成成果', async () => {
    const { c, p } = await ctx(); await p.goto(SITE + '/experiences/yc-quick/work/', { waitUntil: 'networkidle' });
    const area = p.locator('main textarea').first(); await area.fill('先看差评内容和订单信息。'); await p.waitForTimeout(1500);
    await p.goto(SITE + '/me/', { waitUntil: 'networkidle' }); const r = p.locator('[data-testid="draft-yc-quick"]'); await r.waitFor();
    const t = (await r.innerText()).replace(/\s+/g, ' '); ok(t.includes('这个体验不生成成果') && !t.includes('完成实践'), '简版练习的状态不对：' + t);
    ok(p.errors.length === 0, p.errors.join(' | ')); await c.close();
  });

  await check('AI 评测：标题、简介和任务都是 4 个回答；不再说「真实求助」，样例标为人工编写', async () => {
    const { c, p } = await ctx(mobile);
    await p.goto(SITE + '/experiences/ai-eval/', { waitUntil: 'networkidle' });
    const h1 = (await p.locator('main h1').innerText()).trim(); ok(h1 === '4 个 AI 回答，哪个更适合这位用户？做一份评测标准', '标题不对：' + h1);
    const d = await p.locator('main').innerText(); ok(d.includes('评估 4 个候选回答') && d.includes('人工编写的教学样例') && !d.includes('真实求助'), '详情页简介不对');
    await p.locator('main h1').screenshot({ path: path.join(SHOTS, 'c03-手机-AI评测标题.png') });
    await p.goto(SITE + '/experiences/ai-eval/work/', { waitUntil: 'networkidle' }); await step(p, 3);
    const brief = await p.locator('main').innerText();
    for (const k of ['回答 A：', '回答 B：', '回答 C：', '回答 D：', '材料 2：4 个候选回答', '求助场景（人工编写的教学样例）']) ok(brief.includes(k), '任务页缺少：' + k);
    ok(!brief.includes('回答 E：') && !brief.includes('真实求助'), '任务页回答数量或说法不对');
    await p.goto(SITE + '/experiences/', { waitUntil: 'networkidle' }); ok((await p.locator('main').innerText()).includes('4 个 AI 回答，哪个更适合这位用户？'), '体验列表里的标题没更新');
    ok(p.errors.length === 0, p.errors.join(' | ')); await c.close();
  });

  await check('全站检查：页面文字和网页描述里没有「真实求助」「真实岗位场景」「放进真实工作」「两个 AI 回答」等与模拟内容冲突的说法', async () => {
    const { c, p } = await ctx(); const bad = [];
    const pages = ['/', '/experiences/', '/experiences/ai-eval/', '/experiences/ai-eval/work/', '/experiences/overseas-growth/', '/experiences/ops-returns/', '/experiences/ops-returns-deep/', '/events/', '/companies/', '/cooperate/', '/me/', '/buddy/'];
    for (const u of pages) {
      await p.goto(SITE + u, { waitUntil: 'networkidle' });
      const t = await p.evaluate(() => document.body.innerText + '\n' + (document.querySelector('meta[name=description]')?.getAttribute('content') || ''));
      for (const k of FORBIDDEN) if (t.includes(k)) bad.push(u + '：' + k);
    }
    // 动物探索的推荐理由在结果页才出现：直接检查打包后的推荐文案
    const js = fs.readdirSync(path.join(ROOT, '_next', 'static', 'chunks'), { recursive: true }).filter(f => String(f).endsWith('.js')).map(f => fs.readFileSync(path.join(ROOT, '_next', 'static', 'chunks', String(f)), 'utf8')).join('\n');
    for (const k of FORBIDDEN) if (js.includes(k)) bad.push('脚本：' + k);
    ok(bad.length === 0, '还有冲突的说法：' + bad.join('；'));
    ok(p.errors.length === 0, p.errors.join(' | ')); await c.close();
  });

  await b.close(); server.close();
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2));
  const passed = results.filter(r => r.pass).length; console.log(`\n${passed}/${results.length} 通过`);
  process.exit(passed === results.length ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
