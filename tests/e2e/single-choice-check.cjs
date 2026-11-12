// 回归检查（出海增长独立复验发现的问题）：单选互斥、旧草稿里的非法数据、保存入口校验、手机迁移练习材料抽屉、详情页来源提示。
// 用法：npm run build:static && node tests/e2e/single-choice-check.cjs dist-pages
// 每项检查都用全新、隔离的浏览器环境；截图在 test-results/single/screens。
const { chromium } = require('playwright');
const http = require('node:http'), fs = require('node:fs'), path = require('node:path'), net = require('node:net');
const ROOT = path.resolve(process.argv[2] || 'dist-pages'), BASE = (process.env.PAGES_BASE ?? '/onstage').replace(/\/+$/, '');
const OUT = path.join('test-results', 'single'), SHOTS = path.join(OUT, 'screens'); fs.mkdirSync(SHOTS, { recursive: true });
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

const TEXT = { // 其余必填项都写好，只留单选题的问题
  'g1.why': '材料 2 里留学生渠道 59 个邮箱，受访者 3、4 说合租 AA 很麻烦。', 'g2.guess': '留学生愿意为合租 AA 持续记账。', 'g3.rate': '19.0', 'g3.compare': '来源和人数都不同，只能看方向。',
  'g4.scene': '每月交房租和 AA 水电费的时候。', 'g4.hyp': '如果留学生真的为 AA 发愁，问上个月怎么算，大多数人能说出具体麻烦。', 'g4.evidence': '受访者 3：每个月和室友对账要吵一次。',
  'g5.plan': '约 10 位留学生访谈，再请 8 位做两周人工代记账。', 'g6.signal': '第 2、4 周还在主动发小票的人数。', 'g6.decide': '8 人里至少 4 人坚持到第 4 周就继续。', 'g6.missing': '能接受的价格。', 'g7.why': '我的验证靠访谈和人工代记账，不依赖新版本。'
};
const MULTI = { 'g2.facts': ['中国留学生渠道两周留下了 59 个邮箱', '小账本目前只支持简体中文和英文界面'], 'g5.method': ['深度访谈：问过去的具体经历', '人工代记账：团队人工帮用户记两周'] };
const draftWith = extra => JSON.stringify({ owner: 'local:legacy', drafts: { 'overseas-growth': { owner: 'local:legacy', content_id: 'overseas-growth', version: 1, content_version: 1, answers: { ...TEXT, ...MULTI, ...extra }, conflict: 0, conflict_with: null, saved_at: '2026-11-10T08:00:00.000Z', progress: { step: 3, visited: [0, 1, 2, 3, 4, 5], referenceViewed: true, hintsOpened: [] } } }, recoveries: [], schema: 2 });
const OLD_WORK = { id: 'w-legacy-growth', label: '教学模拟作品', experienceId: 'overseas-growth', experienceTitle: '一款产品进入新市场，先验证什么？', direction: '出海增长', outputTitle: '用户假设与验证方案', contentVersion: 1, createdAt: '2026-11-10T08:00:00.000Z', updatedAt: '2026-11-10T08:00:00.000Z',
  sections: [{ heading: '优先用户与理由', items: [{ label: '先服务哪类用户（选一类）', text: '中国留学生、夜市摊主' }, { label: '理由', text: '旧成果：当时选了两类' }] }], before: null, revisions: [] };
const WORKS = JSON.stringify({ schema: 1, works: [OLD_WORK] });

(async () => {
  const port = await freePort(); const server = http.createServer(serve).listen(port, '127.0.0.1');
  const SITE = `http://127.0.0.1:${port}${BASE}`, GW = SITE + '/experiences/overseas-growth/work/';
  const b = await chromium.launch();
  const mobile = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
  const ctx = async (o = {}) => { const c = await b.newContext({ viewport: { width: 1280, height: 860 }, ...o }); const p = await c.newPage(); p.errors = []; p.on('pageerror', e => p.errors.push(e.message)); p.on('console', m => { if (m.type() === 'error') p.errors.push(m.text()); }); return { c, p }; };
  const step = async (p, n) => { await p.click(`.stepper li:nth-child(${n}) button`); await p.waitForTimeout(200); };
  const draft = async p => (JSON.parse(await p.evaluate(() => localStorage.getItem('onstage-free:v1') || '{}')).drafts || {})['overseas-growth']?.answers || {};
  const seed = async (p, d, w = WORKS) => { await p.goto(SITE + '/', { waitUntil: 'networkidle' }); await p.evaluate(([d, w]) => { localStorage.setItem('onstage-free:v1', d); localStorage.setItem('onstage-works:v1', w); }, [d, w]); };
  const shot = (p, loc, name) => loc.screenshot({ path: path.join(SHOTS, name + '.png') });

  await check('单选互斥：两道「选一类 / 选一项」是单选，点第二个会替换第一个，草稿里只存一项；键盘方向键也只保留一项', async () => {
    const { c, p } = await ctx(mobile); await p.goto(GW, { waitUntil: 'networkidle' });
    await step(p, 4); const seg = p.locator('#f-g1-segment input');
    ok(await seg.count() === 4 && (await seg.evaluateAll(l => l.map(i => i.type))).every(t => t === 'radio'), '选人群不是单选控件');
    await seg.nth(1).click(); await seg.nth(3).click(); await p.waitForTimeout(400);
    ok(await p.locator('#f-g1-segment input:checked').count() === 1, '选人群可以同时选中两项');
    ok(await seg.nth(3).isChecked(), '第二次点的选项没有选中');
    await seg.nth(3).focus(); await p.keyboard.press('ArrowUp'); await p.waitForTimeout(400);
    ok(await p.locator('#f-g1-segment input:checked').count() === 1 && await seg.nth(2).isChecked(), '方向键切换后不是只选中一项');
    const want1 = await seg.nth(2).getAttribute('value');
    await shot(p, p.locator('#f-g1-segment'), 's01-手机-选人群单选');
    await step(p, 6); const ch = p.locator('#f-g7-change input');
    ok((await ch.evaluateAll(l => l.map(i => i.type))).every(t => t === 'radio'), '迁移练习不是单选控件');
    await ch.nth(0).click(); await ch.nth(3).click(); await p.waitForTimeout(1200);
    ok(await p.locator('#f-g7-change input:checked').count() === 1, '迁移练习可以同时选中两项');
    await shot(p, p.locator('#f-g7-change'), 's02-手机-迁移练习单选');
    const a = await draft(p);
    ok(JSON.stringify(a['g1.segment']) === JSON.stringify([want1]) && JSON.stringify(a['g7.change']) === JSON.stringify(['优先用户和验证办法都要调整']), '草稿里存的不是唯一一项：' + JSON.stringify([a['g1.segment'], a['g7.change']]));
    ok(p.errors.length === 0, p.errors.join(' | ')); await c.close();
  });

  await check('真正的多选题保持原行为：出海增长「可多选」两题、AI 评测的多选题仍是复选框，可以选多项并保存', async () => {
    const { c, p } = await ctx(); await p.goto(GW, { waitUntil: 'networkidle' }); await step(p, 4);
    for (const id of ['f-g2-facts', 'f-g5-method']) ok((await p.locator(`#${id} input`).evaluateAll(l => l.map(i => i.type))).every(t => t === 'checkbox'), id + ' 不再是多选');
    const facts = p.locator('#f-g2-facts input'); await facts.nth(0).click(); await facts.nth(2).click(); await facts.nth(4).click();
    const m = p.locator('#f-g5-method input'); await m.nth(0).click(); await m.nth(1).click(); await p.waitForTimeout(1200);
    ok(await p.locator('#f-g2-facts input:checked').count() === 3 && await p.locator('#f-g5-method input:checked').count() === 2, '多选题不能选多项了');
    const a = await draft(p); ok(a['g2.facts']?.length === 3 && a['g5.method']?.length === 2, '多选题草稿没有保存多项');
    ok(await p.locator('#f-g2-facts legend').innerText().then(t => t.includes('可多选')), '多选题的说明变了');
    await p.goto(SITE + '/experiences/ai-eval/work/', { waitUntil: 'networkidle' }); await step(p, 4);
    const types = await p.locator('#f-q2-criteria input').evaluateAll(l => l.map(i => i.type));
    ok(types.length >= 2 && types.every(t => t === 'checkbox'), 'AI 评测的多选题被改成了单选');
    ok(p.errors.length === 0, p.errors.join(' | ')); await c.close();
  });

  await check('旧草稿里单选题有多项：提示重新确认，不替用户选、不静默删掉；不能保存成果；重新选择后才可以保存；已保存的成果原样保留', async () => {
    const { c, p } = await ctx(mobile);
    const legacy = draftWith({ 'g1.segment': ['中国留学生', '夜市摊主'], 'g7.change': ['不需要调整', '只调整验证办法'] });
    await seed(p, legacy); await p.goto(GW, { waitUntil: 'networkidle' }); await step(p, 4);
    const warn = p.locator('[data-testid="legacy-g1.segment"]'); await warn.waitFor();
    const wt = await warn.innerText(); ok(wt.includes('选了 2 项') && wt.includes('中国留学生') && wt.includes('夜市摊主') && wt.includes('请在下面重新选择'), '旧多选提示不清楚：' + wt);
    ok(await p.locator('#f-g1-segment input:checked').count() === 0, '旧多选时不应替用户选中任何一项');
    await shot(p, p.locator('#f-g1-segment'), 's03-手机-旧草稿多选提示');
    await p.waitForTimeout(1500);
    let a = await draft(p); ok(JSON.stringify(a['g1.segment']) === JSON.stringify(['中国留学生', '夜市摊主']), '用户确认前旧作答被改动了：' + JSON.stringify(a['g1.segment']));
    ok(await p.evaluate(() => localStorage.getItem('onstage-works:v1')) === WORKS, '打开体验后已保存的成果被改动了');
    await step(p, 6);
    const side = p.locator('.out-side'); await side.scrollIntoViewIfNeeded(); const st = await side.innerText();
    ok(await p.locator('[data-testid=save-work]').count() === 0, '单选题有多项时不应出现保存按钮');
    ok(st.includes('先服务哪类用户（选一类）：选了 2 项，只能选一项，请重新确认') && st.includes('方案需要怎样调整（选一项）：选了 2 项'), '保存区没有列出需要重新确认的题：' + st);
    await shot(p, side, 's04-手机-保存入口拦住旧多选');
    await side.getByRole('button', { name: /先服务哪类用户/ }).click(); await p.waitForTimeout(500);
    ok(await p.evaluate(() => document.activeElement?.closest('fieldset')?.id) === 'f-g1-segment', '点「还差」没有定位到这道单选题');
    await p.locator('#f-g1-segment input').nth(1).click(); await p.waitForTimeout(400);
    ok(await warn.count() === 0, '重新选择后提示没有消失');
    await step(p, 6); ok(await p.locator('[data-testid=save-work]').count() === 0, '迁移练习还没确认时就能保存');
    await p.locator('#f-g7-change input').nth(1).click(); await p.waitForTimeout(1200);
    a = await draft(p); ok(JSON.stringify(a['g1.segment']) === JSON.stringify(['中国留学生']) && JSON.stringify(a['g7.change']) === JSON.stringify(['只调整验证办法']), '重新选择后草稿不对：' + JSON.stringify([a['g1.segment'], a['g7.change']]));
    ok(JSON.stringify(a['g2.facts']) === JSON.stringify(MULTI['g2.facts']) && JSON.stringify(a['g5.method']) === JSON.stringify(MULTI['g5.method']), '旧草稿里的多选题作答被改动了');
    ok(await p.locator('[data-testid=save-work]').count() === 1, '都确认后还是不能保存');
    ok(await p.evaluate(() => localStorage.getItem('onstage-works:v1')) === WORKS, '用户没点保存，已保存的成果就被改动了');
    await p.goto(SITE + '/works/?id=w-legacy-growth', { waitUntil: 'networkidle' });
    const wtxt = await p.locator('main').innerText(); ok(wtxt.includes('中国留学生、夜市摊主') && wtxt.includes('旧成果：当时选了两类'), '已保存成果的原内容没有保留');
    ok(p.errors.length === 0, p.errors.join(' | ')); await c.close();
  });

  await check('非法旧数据：单选题存成了文字、或选项已不在题目里，提示重新选择，不预选，不能保存', async () => {
    const { c, p } = await ctx();
    await seed(p, draftWith({ 'g1.segment': '中国留学生', 'g7.change': ['已经删掉的旧选项'] }));
    await p.goto(GW, { waitUntil: 'networkidle' }); await step(p, 4);
    const w1 = await p.locator('[data-testid="legacy-g1.segment"]').innerText(); ok(w1.includes('已不在选项里'), '文字格式的旧作答没有提示：' + w1);
    ok(await p.locator('#f-g1-segment input:checked').count() === 0, '不应替用户预选');
    await step(p, 6);
    const w7 = await p.locator('[data-testid="legacy-g7.change"]').innerText(); ok(w7.includes('已经删掉的旧选项') && w7.includes('已不在选项里'), '失效选项没有提示：' + w7);
    ok(await p.locator('[data-testid=save-work]').count() === 0, '非法旧数据时不应能保存');
    const st = await p.locator('.out-side').innerText(); ok(st.includes('之前的选择已不在选项里，请重新选择'), '保存区没有说明原因');
    const a = await draft(p); ok(a['g1.segment'] === '中国留学生' && a['g7.change'][0] === '已经删掉的旧选项', '确认前旧数据被改动了');
    ok(p.errors.length === 0, p.errors.join(' | ')); await c.close();
  });

  await check('手机 390px：第 6 步迁移练习点「查看材料」，抽屉里有这一题的条件变化和设备比例；关闭后焦点、位置和作答都保留', async () => {
    const { c, p } = await ctx(mobile); await p.goto(GW, { waitUntil: 'networkidle' }); await step(p, 6);
    await p.fill('#f-g7-why', '写到一半：验证办法不依赖 App');
    const inView = () => p.evaluate(() => { const r = document.getElementById('f-g7-why').getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; });
    // 1. 用题目标题旁的「查看材料」（作答框可能已滚到屏幕外）：关闭后焦点和位置回到刚才作答的输入框
    await p.locator('#f-g7-why').focus();
    const btn = p.locator('#pr-g7 .practice-h button', { hasText: '查看材料' }); await btn.scrollIntoViewIfNeeded();
    await btn.click(); const dlg = p.locator('[role=dialog]').last(); await dlg.waitFor();
    const t = await dlg.innerText();
    for (const k of ['迁移练习：换一个关键条件：这一题的新材料', 'iOS 版这次更新审核没有通过', '接下来 4 周只能在安卓上提供新功能', '华人大学生：安卓 35%，iOS 65%', '中国留学生：安卓 25%，iOS 75%', '夜市摊主：安卓 85%，iOS 15%', '原任务材料 1']) ok(t.includes(k), '抽屉里缺少：' + k);
    ok(t.indexOf('iOS 版这次更新') < t.indexOf('原任务材料 1'), '这一题的新材料应该放在最前面');
    await p.screenshot({ path: path.join(SHOTS, 's05-手机-迁移练习材料抽屉.png') });
    await dlg.getByRole('button', { name: '关闭' }).click(); await p.waitForTimeout(400);
    ok(await p.evaluate(() => document.activeElement?.id) === 'f-g7-why', '关闭后焦点没有回到刚才的输入框');
    ok(await inView(), '关闭后刚才作答的输入框不在屏幕内');
    ok(await p.inputValue('#f-g7-why') === '写到一半：验证办法不依赖 App', '关闭后作答丢了');
    // 2. 作答框在屏幕内时，用底部「查看材料」打开再按 Esc：页面位置不变，焦点回到输入框
    await p.locator('#f-g7-why').focus(); ok(await inView(), '作答框应在屏幕内'); const y0 = await p.evaluate(() => scrollY);
    await p.locator('.mobile-tools button', { hasText: '查看材料' }).click(); await dlg.waitFor();
    ok((await dlg.innerText()).includes('夜市摊主：安卓 85%'), '底部「查看材料」打开的抽屉也要有迁移材料');
    await p.keyboard.press('Escape'); await p.waitForTimeout(400);
    ok(await p.evaluate(() => document.activeElement?.id) === 'f-g7-why', '按 Esc 关闭后焦点没有回到输入框');
    ok(Math.abs(await p.evaluate(() => scrollY) - y0) <= 4, '作答框在屏幕内时，关闭抽屉后页面位置变了');
    ok(await p.inputValue('#f-g7-why') === '写到一半：验证办法不依赖 App', '按 Esc 关闭后作答丢了');
    ok(p.errors.length === 0, p.errors.join(' | ')); await c.close();
  });

  await check('详情页提示和来源标注一致：出海增长不再说全部虚构；没有真实来源的体验仍按原文说明', async () => {
    const { c, p } = await ctx(mobile);
    await p.goto(SITE + '/experiences/overseas-growth/', { waitUntil: 'networkidle' });
    const w = await p.locator('.warn-box').first().innerText();
    ok(!w.includes('都是虚构') && w.includes('教学模拟内容') && w.includes('「内容来源与审核」里逐条标注'), '出海增长详情提示不对：' + w);
    ok((await p.locator('main').innerText()).includes('内容来源与审核'), '详情页没有来源区');
    await shot(p, p.locator('.warn-box').first(), 's06-手机-详情页提示');
    await p.goto(SITE + '/experiences/yc-quick/', { waitUntil: 'networkidle' }); // 简版练习，没有真实来源
    const w2 = await p.locator('.warn-box').first().innerText(); ok(w2.includes('都是虚构的教学内容'), '没有真实来源的体验提示被改了：' + w2);
    ok(p.errors.length === 0, p.errors.join(' | ')); await c.close();
  });

  await b.close(); server.close();
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2));
  const passed = results.filter(r => r.pass).length; console.log(`\n${passed}/${results.length} 通过`);
  process.exit(passed === results.length ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
