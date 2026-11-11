// 同源升级 + 回滚检查（V1.7）。
// 线上 https://shangchang-app.github.io/onstage/ 和预览 /onstage-source/ 在同一个源下，localStorage 是共用的。
// 这里在本机用同一个源模拟：/onstage/ 放旧版发布包（V1.4.1），/onstage-source/ 放新版，按真实用户的顺序来回切换：
//   1. 旧版写草稿 → 2. 新版读到并写入（完整版、短版；在完整版里实际作答并点「保存成果」）→ 3. 回到旧版：旧数据还在、能继续保存、不改动新版数据
//   → 4. 再回到新版：新版写入的内容没有被旧版或二次迁移覆盖。
// V1.7 隐藏工位搭子的数据（onstage-buddy:v1）也一起检查：旧版不读不写它。
// 每一步都把 localStorage 全量存成 JSON（test-results/rollback/），出问题时可以对照、恢复。
// 用法：node tests/e2e/rollback-check.cjs <旧版目录> <新版目录（用 --base=/onstage-source 构建）>
const { chromium } = require('playwright');
const http = require('node:http'), fs = require('node:fs'), path = require('node:path');
const OLD = path.resolve(process.argv[2]), NEW = path.resolve(process.argv[3]);
const OUT = path.join('test-results', 'rollback'); fs.mkdirSync(OUT, { recursive: true });
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.txt': 'text/plain; charset=utf-8' };
const MOUNTS = [['/onstage-source', NEW], ['/onstage', OLD]];
function serve(req, res) {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const m = MOUNTS.find(([b]) => p === b || p.startsWith(b + '/')); if (!m) { res.writeHead(404); return res.end(); }
  const [base, root] = m; p = p.slice(base.length) || '/'; let file = path.join(root, p);
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) { if (!p.endsWith('/')) { res.writeHead(301, { location: base + p + '/' }); return res.end(); } file = path.join(file, 'index.html'); }
  if (!fs.existsSync(file)) { res.writeHead(404, { 'content-type': TYPES['.html'] }); return fs.createReadStream(path.join(root, '404.html')).pipe(res); }
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' }); fs.createReadStream(file).pipe(res);
}
const results = []; const ok = (c, m) => { if (!c) throw new Error(m); };
async function step(name, fn) { try { await fn(); results.push({ name, pass: true }); console.log('PASS', name); } catch (e) { results.push({ name, pass: false, error: String(e.message).slice(0, 500) }); console.log('FAIL', name, '\n   ', e.message); throw e; } }

(async () => {
  const server = http.createServer(serve).listen(0, '127.0.0.1'); await new Promise(r => server.once('listening', r));
  const ORIGIN = `http://127.0.0.1:${server.address().port}`, O = ORIGIN + '/onstage', N = ORIGIN + '/onstage-source';
  const b = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH, args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'] } : {}); // CHROME_PATH：没有 Playwright 自带浏览器时用本机 Chrome
  const c = await b.newContext({ viewport: { width: 1280, height: 860 } }); // 全新、隔离的浏览器环境
  const p = await c.newPage(); const errors = []; p.on('pageerror', e => errors.push(e.message));
  const dump = async name => { const all = await p.evaluate(() => Object.fromEntries(Object.keys(localStorage).sort().map(k => [k, localStorage.getItem(k)]))); fs.writeFileSync(path.join(OUT, name + '.json'), JSON.stringify(all, null, 2)); return all; };
  const db = all => JSON.parse(all['onstage-free:v1']);
  const saved = () => p.waitForFunction(() => /已保存/.test(document.querySelector('.work-head .save-state, .mobile-tools .save-state')?.textContent || ''), null, { timeout: 15000 });
  const toPractice = async url => { await p.goto(url, { waitUntil: 'networkidle' }); await p.click('.stepper li:nth-child(4) button'); await p.waitForSelector('#f-p1-before'); };
  const typeInto = async (sel, text) => { await p.fill(sel, text); await p.locator(sel).blur(); await saved(); };
  try {
    await step('0. 起点：全新浏览器，没有任何本地数据', async () => { await p.goto(O + '/', { waitUntil: 'networkidle' }); await p.evaluate(() => localStorage.clear()); ok((await p.evaluate(() => localStorage.length)) === 0, '本地数据不是空的'); });

    let s1;
    await step('1. 旧版 V1.4.1：在 6 步体验里写两格并保存', async () => {
      await toPractice(O + '/experiences/ops-returns/work/');
      await typeInto('#f-p1-before', '4.7%'); await typeInto('#f-p5-first', '旧版写的第一个行动');
      s1 = await dump('1-旧版写入后'); ok(!('schema' in db(s1)), '旧版不应写 schema');
    });

    let s2;
    await step('2. 新版：完整版读到旧草稿；在完整版、短版各写入；保存一份成果', async () => {
      await toPractice(N + '/experiences/ops-returns-deep/work/');
      ok(await p.inputValue('#f-p1-before') === '4.7%' && await p.inputValue('#f-p5-first') === '旧版写的第一个行动', '新版没有读到旧草稿');
      await typeInto('#f-p1-before', '4.7%（新版改过）');
      await p.goto(N + '/experiences/ops-returns/work/', { waitUntil: 'networkidle' }); await p.waitForSelector('.msg');
      await p.click('.stepper li:nth-child(3) button'); await p.waitForSelector('#f-plan-reason'); await p.fill('#f-plan-reason', '新版短版写的理由'); await p.locator('#f-plan-reason').blur(); await saved();
      // 成果：在新版完整版里实际作答并点「保存成果」（通过界面保存，不直接写本地存储）
      const NUM = { 'f-p0-rate': '3.7%', 'f-p1-before': '约 4.7%', 'f-p1-after': '约 11.1%', 'f-t-before': '5.1%', 'f-t-after': '5.1%' };
      const fill = async () => { for (const sec of await p.locator('.practice').all()) { for (const f of await sec.locator('fieldset').all()) if (await f.locator('input:checked').count() === 0) await f.locator('.choice').first().click(); for (const el of await sec.locator('input.input, textarea').all()) { const id = await el.getAttribute('id'); if (!(await el.inputValue())) await el.fill(NUM[id] || '新版界面作答：' + id); } } };
      await p.goto(N + '/experiences/ops-returns-deep/work/', { waitUntil: 'networkidle' }); await p.waitForSelector('.stepper');
      await p.click('.stepper li:nth-child(2) button'); await p.waitForTimeout(150);
      await p.click('.stepper li:nth-child(4) button'); await p.waitForSelector('.practice'); await fill(); await saved();
      await p.click('.stepper li:nth-child(5) button'); await p.waitForSelector('#chg-h');
      await p.click('.stepper li:nth-child(6) button'); await p.waitForSelector('.transfer-intro'); await fill(); await saved();
      await p.click('[data-testid="save-work"]'); await p.waitForSelector('.out-side .ok-box'); ok((await p.locator('.out-side .ok-box').innerText()).includes('已保存到本机'), '新版没有通过界面保存成果');
      // V1.7 隐藏工位搭子：在新版答两题，检查旧版回滚时不会改动或删除它的数据（onstage-buddy:v1）
      await p.goto(N + '/buddy/', { waitUntil: 'networkidle' }); await p.getByRole('button', { name: '开始' }).click(); await p.waitForSelector('.bd-opt');
      await p.locator('.bd-opt').nth(1).click(); await p.locator('.bd-nav .btn-primary').click(); await p.waitForSelector('text=2 / 8'); await p.locator('.bd-opt').nth(2).click();
      s2 = await dump('2-新版写入后');
      ok(Object.keys(JSON.parse(s2['onstage-buddy:v1']).answers).length === 2, '隐藏工位搭子的作答没有保存');
      const works = JSON.parse(s2['onstage-works:v1']).works; ok(works.length === 1 && works[0].experienceId === 'ops-returns-deep' && JSON.stringify(works[0]).includes('4.7%（新版改过）'), '界面保存的成果不对');
      const d = db(s2); ok(d.schema === 2, '新版没有标记迁移完成');
      ok(d.drafts['ops-returns-deep']?.answers['p1.before'] === '4.7%（新版改过）', '完整版草稿不对');
      ok(d.drafts['ops-returns']?.answers['p1.before'] === '4.7%', '迁移时改动了旧版原处的作答');
      ok(d.drafts['ops-returns']?.answers['plan.reason'] === '新版短版写的理由', '短版作答没有保存');
    });

    let s3;
    await step('3. 回滚到旧版：旧作答还在、可以继续编辑保存；新版写入的数据没有被改动或删除', async () => {
      await p.goto(O + '/me/', { waitUntil: 'networkidle' }); await p.waitForSelector('main h1'); ok(errors.length === 0, '旧版「我的」报错：' + errors.join(' | '));
      await toPractice(O + '/experiences/ops-returns/work/');
      ok(await p.inputValue('#f-p1-before') === '4.7%' && await p.inputValue('#f-p5-first') === '旧版写的第一个行动', '回滚后旧版看不到原来的作答');
      await typeInto('#f-p5-first', '回滚后在旧版改写的行动');
      s3 = await dump('3-回滚到旧版写入后');
      const before = db(s2), after = db(s3);
      ok(after.schema === 2, '旧版保存时丢掉了 schema 标记（会导致再升级时重复迁移）');
      ok(JSON.stringify(after.drafts['ops-returns-deep']) === JSON.stringify(before.drafts['ops-returns-deep']), '旧版改动了新版完整版的草稿');
      ok(after.drafts['ops-returns'].answers['plan.reason'] === '新版短版写的理由', '旧版删掉了新版短版的作答');
      ok(after.drafts['ops-returns'].answers['p5.first'] === '回滚后在旧版改写的行动', '旧版没有保存成功');
      ok(s3['onstage-works:v1'] === s2['onstage-works:v1'], '旧版改动了成果');
      ok(s3['onstage:migrated:v16'] === s2['onstage:migrated:v16'], '旧版改动了迁移标记');
      ok(s3['onstage-buddy:v1'] === s2['onstage-buddy:v1'], '旧版改动了隐藏工位搭子的数据');
      for (const k of Object.keys(s2)) ok(k in s3, '回滚后少了一项本地数据：' + k);
    });

    await step('4. 再升级到新版：新版写入的内容没有被旧版或二次迁移覆盖；旧版期间的改动留在原处；成果还在', async () => {
      await toPractice(N + '/experiences/ops-returns-deep/work/');
      ok(await p.inputValue('#f-p1-before') === '4.7%（新版改过）', '再升级后完整版被覆盖');
      ok(await p.inputValue('#f-p5-first') === '旧版写的第一个行动', '再升级时又迁移了一次，覆盖了完整版');
      await p.goto(N + '/experiences/ops-returns/work/', { waitUntil: 'networkidle' }); await p.waitForSelector('.stepper');
      await p.click('.stepper li:nth-child(3) button'); await p.waitForSelector('#f-plan-reason'); ok(await p.inputValue('#f-plan-reason') === '新版短版写的理由', '短版作答丢了');
      await p.goto(N + '/me/', { waitUntil: 'networkidle' }); await p.waitForSelector('#h-works'); ok((await p.locator('main').innerText()).includes('问题诊断与行动建议卡'), '成果不见了');
      await p.locator('.list-row', { hasText: '问题诊断与行动建议卡' }).locator('a:has-text("打开")').click(); await p.waitForURL('**/works/?id=*'); await p.waitForSelector('.work-card');
      ok((await p.locator('.work-card').innerText()).includes('4.7%（新版改过）'), '再升级后从「我的」打开的成果内容不对');
      const s4 = await dump('4-再升级后'); ok(db(s4).drafts['ops-returns'].answers['p5.first'] === '回滚后在旧版改写的行动', '旧版期间的改动丢了');
      ok(s4['onstage-buddy:v1'] === s2['onstage-buddy:v1'], '再升级后隐藏工位搭子的数据变了');
      await p.goto(N + '/buddy/', { waitUntil: 'networkidle' }); await p.waitForSelector('text=2 / 8'); ok(await p.locator('.bd-opt.on').count() === 1, '再升级后隐藏工位搭子没有接着上次的进度');
      ok(errors.length === 0, errors.join(' | '));
    });
  } catch { /* 第一处失败即停止，结果已记录 */ }
  await b.close(); server.close();
  fs.writeFileSync(path.join(OUT, 'rollback.json'), JSON.stringify({ at: new Date().toISOString(), old: OLD, new: NEW, results }, null, 2));
  console.log(`\n${results.filter(r => r.pass).length} passed, ${results.filter(r => !r.pass).length} failed`);
  process.exit(results.length === 5 && results.every(r => r.pass) ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
