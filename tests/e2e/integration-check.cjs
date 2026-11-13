// 整合检查：在同一个静态构建包上，走通「动物探索 → 推荐体验 → 作答 → 保存成果 → 我的重新打开」，
// 并检查两处公共体验细节：点「还差」定位并聚焦对应的输入框或选项组；材料提示按内容描述。
// 用法：npm run build:static && node tests/e2e/integration-check.cjs dist-pages
const { chromium } = require('playwright');
const http = require('node:http'), fs = require('node:fs'), path = require('node:path'), net = require('node:net'), { spawnSync } = require('node:child_process');
const ROOT = path.resolve(process.argv[2] || 'dist-pages'), BASE = (process.env.PAGES_BASE ?? '/onstage').replace(/\/+$/, '');
const OUT = path.join('test-results', 'integration'), SHOTS = path.join(OUT, 'screens'); fs.mkdirSync(SHOTS, { recursive: true });
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
const tsx = require.resolve('tsx/cli');
const P = JSON.parse(spawnSync(process.execPath, [tsx, 'scripts/buddy-paths.ts'], { encoding: 'utf8', env: { ...process.env, NODE_NO_WARNINGS: '1' } }).stdout);

(async () => {
  const port = await freePort(); const server = http.createServer(serve).listen(port, '127.0.0.1');
  const SITE = `http://127.0.0.1:${port}${BASE}`;
  const b = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH, args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'] } : {});
  const ctx = async (o = {}) => { const c = await b.newContext({ viewport: { width: 1280, height: 860 }, ...o }); const p = await c.newPage(); p.errors = []; p.on('pageerror', e => p.errors.push(e.message)); p.on('console', m => { if (m.type() === 'error') p.errors.push(m.text()); }); return { c, p }; };
  const waitSaved = p => p.waitForFunction(() => /已保存/.test(document.querySelector('.work-head .save-state')?.textContent || ''), null, { timeout: 15000 });
  const step = async (p, n) => { await p.click(`.stepper li:nth-child(${n}) button`); await p.waitForTimeout(150); };
  // 通用填写：每个选项组选第一个，每个文字框写自己的话（只为走通流程，不代表参考答案）
  const fillAll = async p => {
    for (const fs_ of await p.locator('.practice fieldset').all()) { if (!(await fs_.locator('input:checked').count())) await fs_.locator('.choice').first().click(); }
    for (const el of await p.locator('.practice textarea, .practice input.input').all()) { if (!(await el.inputValue())) await el.fill('整合测试里我自己写的作答'); }
  };

  await check('完整路径：动物探索 → 推荐的完整实践 → 作答 → 保存成果 → 「我的」重新打开（手机 390px）', async () => {
    const { c, p } = await ctx({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    const role = P.roles.find(r => r.full) ; ok(role, '找不到会同时推荐完整实践的结果');
    await p.goto(SITE + '/', { waitUntil: 'networkidle' }); await p.click('main .fun a:has-text("看看是谁")'); await p.waitForURL('**/buddy/');
    await p.getByRole('button', { name: '开始' }).click(); await p.waitForSelector('.bd-opts');
    for (let i = 0; i < role.answers.length; i++) { await p.locator('.bd-opt', { hasText: role.answers[i] }).click(); await p.locator('.bd-nav .btn-primary').click(); if (i < role.answers.length - 1) await p.waitForSelector(`.bd-progress >> text=${i + 2} / 8`); }
    await p.waitForSelector('.bd-result h1'); ok((await p.locator('.bd-result h1').innerText()).includes(role.name), '结果不是预期的角色');
    await p.waitForSelector('.bd-rec-card'); await p.screenshot({ path: path.join(SHOTS, 'i01-手机-动物结果与推荐.png'), fullPage: true });
    const full = p.locator('.bd-rec-card[data-kind="deep"], .bd-rec-card[data-kind="quick"]').first(); ok(await full.count() === 1, '推荐里没有完整实践');
    const href = await full.getAttribute('href'); ok(href === BASE + '/experiences/' + role.full + '/', '推荐的完整实践不对：' + href);
    await full.click(); await p.waitForURL('**/experiences/' + role.full + '/');
    await p.click(`a[href="${BASE}/experiences/${role.full}/work"], a[href="${BASE}/experiences/${role.full}/work/"]`); await p.waitForSelector('.stepper');
    await step(p, 4); await p.waitForSelector('.practice'); await fillAll(p); await waitSaved(p);
    await step(p, 5); await step(p, 6); await p.waitForSelector('.transfer-intro'); await fillAll(p); await waitSaved(p);
    await p.click('[data-testid="save-work"]'); await p.waitForSelector('.out-side .ok-box');
    await p.goto(SITE + '/me/', { waitUntil: 'networkidle' }); await p.waitForSelector('#h-works');
    await p.click('.list-row a:has-text("打开")'); await p.waitForSelector('.work-card');
    const w = await p.locator('.work-card').innerText(); ok(w.includes('整合测试里我自己写的作答'), '「我的」重新打开的成果里没有作答');
    await p.screenshot({ path: path.join(SHOTS, 'i02-手机-我的重新打开成果.png'), fullPage: true });
    // 动物结果和岗位成果互不影响
    const s = await p.evaluate(() => ({ buddy: localStorage.getItem('onstage-buddy:v1'), works: JSON.parse(localStorage.getItem('onstage-works:v1') || '{}') }));
    ok(s.buddy && JSON.parse(s.buddy).schema === 2, '动物探索的进度被改动了'); ok((s.works.works || []).length === 1, '成果数量不对');
    ok(p.errors.length === 0, p.errors.join(' | ')); await c.close();
  });

  for (const [eid, fieldDom, kind] of [['overseas-growth', 'f-g6-missing', 'textarea'], ['overseas-growth', 'f-g1-segment', 'fieldset'], ['ops-returns-deep', null, 'any']]) {
    await check(`点「还差」：定位并聚焦对应的${kind === 'fieldset' ? '选项组（第一个选项）' : '输入框'}（${eid}）`, async () => {
      const { c, p } = await ctx();
      await p.goto(SITE + `/experiences/${eid}/work/`, { waitUntil: 'networkidle' }); await step(p, 6); await p.waitForSelector('#out-h');
      const items = p.locator('.out-side .notice li button');
      const n = await items.count(); ok(n > 0, '没有「还差」列表');
      let target = fieldDom, btn;
      if (!target) { btn = items.nth(n - 1); } else {
        btn = null;
        for (let i = 0; i < n; i++) { const t = (await items.nth(i).innerText()).trim(); if ((target === 'f-g6-missing' && t === '还缺什么信息') || (target === 'f-g1-segment' && t.startsWith('先服务哪类用户'))) { btn = items.nth(i); break; } }
        ok(btn, '「还差」里找不到对应项');
      }
      await btn.click(); await p.waitForTimeout(500);
      const r = await p.evaluate(() => { const a = document.activeElement; const fs = a?.closest('fieldset'); return { id: a?.id, tag: a?.tagName, type: a?.getAttribute('type'), fs: fs?.id, first: !!fs && a === fs.querySelector('input'), inView: a ? (() => { const b = a.getBoundingClientRect(); return b.top >= 0 && b.bottom <= innerHeight; })() : false }; });
      if (kind === 'textarea') ok(r.id === target && r.inView, '没有聚焦到对应的输入框：' + JSON.stringify(r));
      else if (kind === 'fieldset') ok(r.fs === target && ['checkbox', 'radio'].includes(r.type) && r.first && r.inView, '没有聚焦到选项组的第一个选项：' + JSON.stringify(r)); // 选人群已改为单选（radio）
      else ok(/^f-/.test(r.id || '') || /^f-/.test(r.fs || ''), '没有聚焦到任何作答项：' + JSON.stringify(r));
      // 完成区（第 6 步下方）的「还差」列表也是同样行为（只有不提供成果页的体验才有，这里检查有就测）
      ok(p.errors.length === 0, p.errors.join(' | ')); await c.close();
    });
  }

  await check('材料提示按内容描述：有真实来源的体验说「包含教学模拟材料，真实来源已单独标注」；不再笼统说「都是虚构的」', async () => {
    const { c, p } = await ctx({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    for (const eid of ['overseas-growth', 'ai-eval', 'ops-returns-deep']) {
      await p.goto(SITE + `/experiences/${eid}/work/`, { waitUntil: 'networkidle' }); await step(p, 4); await p.waitForSelector('.practice');
      await p.locator('button:has-text("查看材料")').first().click(); await p.waitForSelector('.modal.sheet');
      const t = await p.locator('.modal.sheet').innerText();
      ok(t.includes('本体验包含教学模拟材料，真实来源已单独标注。'), eid + ' 抽屉提示不对：' + t.slice(0, 120));
      ok(!t.includes('数据和评论都是虚构的'), eid + ' 还有笼统的「都是虚构的」');
      if (eid === 'overseas-growth') await p.screenshot({ path: path.join(SHOTS, 'i03-手机-材料抽屉提示.png') });
      await p.keyboard.press('Escape');
      await step(p, 3); ok((await p.locator('main').innerText()).includes('本体验包含教学模拟材料，真实来源已单独标注。'), eid + ' 任务页材料说明不对');
    }
    ok(p.errors.length === 0, p.errors.join(' | ')); await c.close();
  });

  await b.close(); server.close();
  const pass = results.filter(r => r.pass).length;
  fs.writeFileSync(path.join(OUT, 'integration.json'), JSON.stringify({ at: new Date().toISOString(), base: BASE, results }, null, 2));
  console.log(`\n${pass} passed, ${results.length - pass} failed`);
  process.exit(pass === results.length ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
