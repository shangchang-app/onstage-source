// 出海增长体验（overseas-growth）静态版检查：在模拟 GitHub Pages 的子路径下，用 Chromium 实际走一遍。
// 用法：npm run build:static && node tests/e2e/growth-check.cjs dist-pages
// 每项检查都用全新、隔离的浏览器环境；截图在 test-results/growth/screens。
const { chromium } = require('playwright');
const http = require('node:http'), fs = require('node:fs'), path = require('node:path'), net = require('node:net');
const ROOT = path.resolve(process.argv[2] || 'dist-pages'), BASE = (process.env.PAGES_BASE ?? '/onstage').replace(/\/+$/, '');
const OUT = path.join('test-results', 'growth'), SHOTS = path.join(OUT, 'screens'); fs.mkdirSync(SHOTS, { recursive: true });
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

const MY = { // 学生自己的写法（故意和参考不同：选夜市摊主）
  'f-g1-why': '我先服务夜市摊主。材料 2 里当面介绍 35 次访问留下 14 个邮箱，愿意聊的有 11 人；受访者 7 说进货的钱和自己的钱混在一起。暂时放弃年轻上班族，受访者 6 说银行 App 就够了。',
  'f-g2-guess': '最关键的推测：摊主愿意为分开经营账和个人账付钱。',
  'f-g3-rate': '19.0',
  'f-g3-compare': '不能直接比：摊主是当面邀请，只有 35 次访问；群里转发的方式不同。',
  'f-g4-scene': '每晚收摊后，算当天收了多少现金和电子钱包。',
  'f-g4-hyp': '如果摊主真的为分不清经营账发愁，那么问他们上周怎么算账，大多数人能说出具体做法和麻烦。',
  'f-g4-evidence': '受访者 7：收摊后在本子上写个总数，进货的钱和自己的钱混在一起。',
  'f-g5-plan': '找 8 位摊主，用马来语访谈问上周怎么记账；再请 5 位试两周人工代记账。礼品约 800 元，两周。',
  'f-g6-signal': '第 2 周还在发小票的人数；有没有人问能不能分开进货账。',
  'f-g6-decide': '我自己定的规则：5 人里至少 3 人坚持到第 2 周就继续，否则换中国留学生再验证。',
  'f-g6-missing': '马来语版本的开发时间、摊主能接受的价格。',
  'f-g7-why': '我的验证靠访谈和人工代记账，不依赖新版本；摊主 85% 用安卓，正好不受影响。'
};
const PICK = { 'g1.segment': '夜市摊主', 'g5.method': '人工代记账：团队人工帮用户记两周', 'g7.change': '不需要调整' };

(async () => {
  const port = await freePort(); const server = http.createServer(serve).listen(port, '127.0.0.1');
  const SITE = `http://127.0.0.1:${port}${BASE}`, GW = SITE + '/experiences/overseas-growth/work/';
  const b = await chromium.launch();
  const ctx = async (o = {}) => { const c = await b.newContext({ viewport: { width: 1280, height: 860 }, ...o }); const p = await c.newPage(); p.errors = []; p.on('pageerror', e => p.errors.push(e.message)); p.on('console', m => { if (m.type() === 'error') p.errors.push(m.text()); }); return { c, p }; };
  const waitSaved = p => p.waitForFunction(() => /已保存/.test(document.querySelector('.work-head .save-state')?.textContent || ''), null, { timeout: 15000 });
  const save = async (p, name, full = true) => {
    const mobile = full && await p.evaluate(() => { const t = document.querySelector('.tabbar'); return !!t && getComputedStyle(t).display !== 'none'; });
    if (mobile) await p.addStyleTag({ content: '.tabbar{position:static!important}' }).then(h => h.evaluate(e => e.id = 'shot-fix'));
    await p.screenshot({ path: path.join(SHOTS, name + '.png'), fullPage: full });
    if (mobile) await p.evaluate(() => document.getElementById('shot-fix')?.remove());
  };
  const step = async (p, n) => { await p.click(`.stepper li:nth-child(${n}) button`); await p.waitForTimeout(150); };
  const pick = async (p, fieldId, option) => { await p.locator(`#pr-${fieldId.split('.')[0]} fieldset`).filter({ hasText: option }).locator('.choice', { hasText: option }).first().click(); };
  const fillMine = async p => {
    for (const sec of await p.locator('.practice').all()) {
      for (const el of await sec.locator('input.input, textarea').all()) { const id = await el.getAttribute('id'); if (MY[id] && !(await el.inputValue())) await el.fill(MY[id]); }
    }
  };
  const store = p => p.evaluate(() => JSON.parse(localStorage.getItem('onstage-free:v1') || '{}'));

  await check('详情页：主题、成果、设计估计时长、来源和审核状态都写清楚', async () => {
    const { c, p } = await ctx({ deviceScaleFactor: 2 }); await p.goto(SITE + '/experiences/overseas-growth/', { waitUntil: 'networkidle' });
    const t = await p.locator('main').innerText();
    for (const k of ['一款产品进入新市场，先验证什么？', '出海增长', '用户假设与验证方案', '设计估计', '未经出海增长从业者审核', '马来西亚政府门户', 'Y Combinator']) ok(t.includes(k), '详情页缺少：' + k);
    ok(await p.locator('a[href="https://www.malaysia.gov.my/en/government/learn-about-malaysia/official-language"]').count() >= 1, '真实来源没有链接');
    await save(p, 'g01-桌面-详情页'); ok(p.errors.length === 0, p.errors.join(' | ')); await c.close();
  });

  await check('完整流程：示范 → 独立实践（数字和事实/推测检查）→ 参考（多种方案）→ 回去修改 → 迁移 → 保存成果；成果只有自己的作答', async () => {
    const { c, p } = await ctx({ deviceScaleFactor: 2 });
    await p.goto(GW, { waitUntil: 'networkidle' }); await p.waitForSelector('.stepper');
    await save(p, 'g02-桌面-第1步-认识工作');
    await step(p, 2); await p.waitForSelector('#lessons-h');
    const demo = await p.locator('main').innerText();
    for (const k of ['自动喂食器进入日本', '先写下「我们以为」', '提前定好怎么判断', '这不是行业标准', '用户：先选一群具体的人', '渠道：在哪里找到他们，不等于买广告']) ok(demo.includes(k), '示范页缺少：' + k);
    ok(!demo.includes('小账本'), '示范里不应出现练习用的产品');
    await save(p, 'g03-桌面-第2步-示范与方法');
    await step(p, 3); const brief = await p.locator('main').innerText();
    for (const k of ['小账本（虚构）', '只有简体中文和英文', '人民币 5,000 元', '310', '59', '受访者 8', '国语和官方语言', '教学模拟数据']) ok(brief.includes(k), '任务材料缺少：' + k);
    await save(p, 'g04-桌面-第3步-任务与材料');
    await step(p, 4); await p.waitForSelector('#f-g3-rate');
    // 数字检查：常见算错有说明，算对显示一致
    await p.fill('#f-g3-rate', '23.7'); await p.waitForSelector('[data-testid="rule-g3.rate"]');
    ok((await p.locator('[data-testid="rule-g3.rate"]').innerText()).includes('愿意聊的比例'), '常见算错没有对应说明');
    await p.fill('#f-g3-rate', '');
    for (const [fid, opt] of Object.entries(PICK).filter(([k]) => !k.startsWith('g7'))) await pick(p, fid, opt);
    for (const opt of ['中国留学生渠道两周留下了 59 个邮箱', '一位受访的摊主收摊后在本子上写总数', '中国留学生愿意每月付费使用记账 App']) await pick(p, 'g2.facts', opt);
    await fillMine(p);
    await p.waitForFunction(() => /一致/.test(document.querySelector('[data-testid="rule-g3.rate"]')?.textContent || ''));
    await p.locator('#pr-g2 button:has-text("对照参考标注")').click();
    const r2 = await p.locator('[data-testid="rule-g2.facts"]').innerText();
    ok(r2.includes('只比较你选的') && r2.includes('材料里没有任何人谈过价格'), '事实/推测检查没有说明范围或理由：' + r2.slice(0, 200));
    ok(await p.locator('[data-testid="rule-g1.segment"], [data-testid="rule-g5.method"]').count() === 0, '开放题不应有规则检查');
    await waitSaved(p); await p.evaluate(() => scrollTo(0, 0)); await save(p, 'g05-桌面-第4步-独立实践');
    await step(p, 5); await p.waitForSelector('#chg-h');
    const ref = await p.locator('main').innerText();
    for (const k of ['不是评分依据', '先服务夜市摊主', '先服务华人大学生', '默认先买广告', '个性化点评：没有提供']) ok(ref.includes(k), '参考页缺少：' + k);
    await save(p, 'g06-桌面-第5步-对照参考');
    await p.click('button:has-text("回去修改作答")'); await p.waitForSelector('#f-g6-decide');
    await p.fill('#f-g6-decide', '看完参考后改写：5 人里至少 3 人坚持到第 2 周，并且至少 1 人愿意预付，就继续。这是我自己定的规则。'); await waitSaved(p);
    await step(p, 5); await p.waitForSelector('.chg li'); ok((await p.locator('.chg').innerText()).includes('看完参考后改写'), '没有显示前后变化');
    await step(p, 6); await p.waitForSelector('.transfer-intro');
    ok(await p.locator('[data-testid="save-work"]').count() === 0, '迁移练习没做也能保存');
    ok((await p.locator('main').innerText()).includes('还没写') || (await p.locator('main').innerText()).includes('没写'), '没有提示还差哪些');
    ok((await p.locator('#pr-g7').innerText()).includes('只能在安卓'), '迁移材料没有显示');
    await pick(p, 'g7.change', PICK['g7.change']); await fillMine(p); await waitSaved(p);
    await p.locator('#out-h').scrollIntoViewIfNeeded(); await save(p, 'g07-桌面-第6步-迁移与成果预览');
    await p.click('[data-testid="save-work"]'); await p.waitForSelector('.out-side .ok-box');
    await p.click('.out-side a:has-text("打开成果页")'); await p.waitForURL('**/works/?id=*'); await p.waitForSelector('.work-card');
    const w = await p.locator('.work-card').innerText();
    for (const k of ['用户假设与验证方案', '教学模拟作品', '优先用户与理由', '夜市摊主', '事实与推测', '使用场景与需求假设', '低成本验证', '判断规则', '还缺的信息', '条件变化时', '看完参考后改写', '马来语版本的开发时间']) ok(w.includes(k), '成果页缺少：' + k);
    ok(!w.includes('先服务中国留学生。') && !w.includes('从 14 位愿意聊的留学生里约 10 位'), '成果里混入了参考答案');
    await save(p, 'g08-桌面-成果页');
    await p.goto(SITE + '/me/', { waitUntil: 'networkidle' }); await p.waitForSelector('#h-works');
    ok((await p.locator('main').innerText()).includes('用户假设与验证方案'), '「我的」没有这份成果');
    ok(p.errors.length === 0, p.errors.join(' | ')); await c.close();
  });

  await check('暂停与恢复：写一半关掉，再打开回到同一步，作答都在；草稿只存在 overseas-growth 下，不影响其他体验', async () => {
    const { c, p } = await ctx();
    // 先在另一个体验里写一格
    await p.goto(SITE + '/experiences/ai-eval/work/', { waitUntil: 'networkidle' }); await step(p, 4); await p.waitForSelector('#f-q1-goal'); await p.fill('#f-q1-goal', 'AI 体验里的作答'); await waitSaved(p);
    await p.goto(GW, { waitUntil: 'networkidle' }); await step(p, 4); await p.waitForSelector('#f-g4-hyp');
    await p.fill('#f-g4-hyp', '暂停前写的假设'); await pick(p, 'g1.segment', '中国留学生'); await waitSaved(p);
    const s = await store(p);
    ok(s.drafts['overseas-growth']?.answers['g4.hyp'] === '暂停前写的假设', '草稿没有存到 overseas-growth');
    ok(s.drafts['ai-eval']?.answers['q1.goal'] === 'AI 体验里的作答' && !('g4.hyp' in (s.drafts['ai-eval']?.answers || {})), '和 AI 体验的数据混在一起');
    ok(Object.keys(s.drafts['overseas-growth'].answers).every(k => /^g\d\./.test(k)), '出海增长草稿里混入了别的字段');
    const p2 = await c.newPage(); await p.close(); await p2.goto(GW, { waitUntil: 'networkidle' }); await p2.waitForSelector('#f-g4-hyp');
    ok(await p2.inputValue('#f-g4-hyp') === '暂停前写的假设', '刷新后作答丢了');
    ok(await p2.locator('#pr-g1 input:checked').count() === 1, '刷新后选择丢了');
    await p2.goto(SITE + '/experiences/ops-returns-deep/work/', { waitUntil: 'networkidle' }); await step(p2, 4); await p2.waitForSelector('.practice');
    ok(!(await p2.locator('main').innerText()).includes('暂停前写的假设'), '其他体验里出现了这里的作答');
    await c.close();
  });

  await check('导出与导入：成果和草稿一起导出，在另一个干净的浏览器里导入后能打开', async () => {
    const { c, p } = await ctx({ acceptDownloads: true });
    await p.goto(GW, { waitUntil: 'networkidle' }); await step(p, 4); await p.waitForSelector('.practice');
    for (const [fid, opt] of Object.entries(PICK).filter(([k]) => !k.startsWith('g7'))) await pick(p, fid, opt);
    await pick(p, 'g2.facts', '小账本目前只支持简体中文和英文界面');
    await fillMine(p); await step(p, 5); await step(p, 6); await p.waitForSelector('.transfer-intro'); await pick(p, 'g7.change', '只调整验证办法'); await fillMine(p); await waitSaved(p);
    await p.click('[data-testid="save-work"]'); await p.waitForSelector('.out-side .ok-box');
    await p.goto(SITE + '/me/', { waitUntil: 'networkidle' });
    const [dl] = await Promise.all([p.waitForEvent('download'), p.click('button:has-text("导出备份")')]);
    const file = path.join(OUT, 'growth-backup.json'); await dl.saveAs(file);
    const j = JSON.parse(fs.readFileSync(file, 'utf8'));
    ok(j.format === 'onstage-backup' && j.works.some(w => w.experienceId === 'overseas-growth') && j.drafts.some(d => d.content_id === 'overseas-growth' || d.id === 'overseas-growth' || JSON.stringify(d).includes('overseas-growth')), '备份里没有这个体验的成果或草稿');
    await c.close();
    const { c: c2, p: q } = await ctx();
    await q.goto(SITE + '/me/', { waitUntil: 'networkidle' }); await q.setInputFiles('#import-file', file);
    await q.waitForFunction(() => /导入完成/.test(document.body.innerText));
    ok((await q.locator('main').innerText()).includes('用户假设与验证方案'), '导入后「我的」没有成果');
    await q.click('.list-row a:has-text("打开")'); await q.waitForSelector('.work-card'); ok((await q.locator('.work-card').innerText()).includes('只调整验证办法'), '导入后的成果内容不对');
    ok(q.errors.length === 0, q.errors.join(' | ')); await c2.close();
  });

  await check('390px 手机：没有横向滚动；材料抽屉能看到 4 份材料、表格可滑动、关闭后焦点回到原处；底部导航不挡保存按钮', async () => {
    const { c, p } = await ctx({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await p.goto(SITE + '/experiences/overseas-growth/', { waitUntil: 'networkidle' }); await save(p, 'g11-手机-详情页');
    await p.goto(GW, { waitUntil: 'networkidle' }); await step(p, 2); await p.waitForSelector('#lessons-h'); await save(p, 'g12-手机-示范与方法');
    await step(p, 4); await p.waitForSelector('#f-g1-why');
    for (const u of ['overflow']) { const w = await p.evaluate(() => document.documentElement.scrollWidth); ok(w <= 391, '手机上有横向滚动：' + w); }
    await p.focus('#f-g1-why'); await p.locator('#pr-g1 button:has-text("查看材料")').click(); await p.waitForSelector('.modal.sheet');
    const sheet = await p.locator('.modal.sheet').innerText();
    for (const k of ['材料 1：产品和资源', '材料 2：落地页两周数据', '材料 3：8 段访谈摘录', '材料 4：一条真实背景信息']) ok(sheet.includes(k), '材料抽屉缺少：' + k);
    await p.click('[role="dialog"] .matc:has-text("落地页两周数据") .matc-h button').catch(() => {});
    await p.waitForTimeout(200); await save(p, 'g13-手机-材料抽屉', false);
    const tbl = await p.evaluate(() => { const t = document.querySelector('.modal.sheet table'); if (!t) return null; const box = t.closest('.table-wrap, .tbl, .scroll-x') || t.parentElement; return { sw: box.scrollWidth, cw: box.clientWidth, ox: getComputedStyle(box).overflowX }; });
    ok(!tbl || tbl.sw <= tbl.cw || /auto|scroll/.test(tbl.ox), '材料表格在手机上被截断：' + JSON.stringify(tbl));
    await p.keyboard.press('Escape'); await p.waitForSelector('.modal.sheet', { state: 'detached' }).catch(() => {});
    ok(await p.evaluate(() => document.activeElement?.id) === 'f-g1-why', '关闭材料后焦点没有回到原来的输入框');
    await pick(p, 'g1.segment', '中国留学生'); await save(p, 'g14-手机-独立实践');
    await step(p, 6); await p.waitForSelector('.transfer-intro'); await p.locator('#out-h').scrollIntoViewIfNeeded();
    const cover = await p.evaluate(() => { const bar = document.querySelector('.tabbar'); const last = [...document.querySelectorAll('main .out-side .notice li button, main .out-side .btn')].pop(); if (!bar || !last) return { ok: true }; last.scrollIntoView({ block: 'end' }); window.scrollBy(0, 400); const b = last.getBoundingClientRect(), t = bar.getBoundingClientRect(); return { ok: b.bottom <= t.top + 1 || getComputedStyle(bar).display === 'none', b: b.bottom, t: t.top }; });
    ok(cover.ok, '底部导航挡住了成果区的按钮：' + JSON.stringify(cover));
    await save(p, 'g15-手机-迁移与成果');
    ok(p.errors.length === 0, p.errors.join(' | ')); await c.close();
  });

  await check('键盘：只用键盘就能选选项、填文字；必填没写时保存区列出还差哪些，点一下回到对应的题目', async () => {
    const { c, p } = await ctx();
    await p.goto(GW, { waitUntil: 'networkidle' }); await step(p, 4); await p.waitForSelector('#pr-g1');
    const first = p.locator('#pr-g1 fieldset input').first(); await first.focus(); await p.keyboard.press('Space');
    ok(await first.isChecked(), '空格键不能选中选项');
    const outline = await p.evaluate(() => { const e = document.activeElement; const s = getComputedStyle(e.closest('label') || e); return s.outlineStyle + ' ' + s.outlineWidth + ' / ' + getComputedStyle(e).outlineStyle; });
    ok(!/^none 0px \/ none$/.test(outline), '选项聚焦时看不到焦点框：' + outline);
    for (let i = 0; i < 12 && await p.evaluate(() => document.activeElement?.id) !== 'f-g1-why'; i++) await p.keyboard.press('Tab'); // 依次经过其余选项，再到理由输入框
    await p.keyboard.type('用键盘输入的理由'); await waitSaved(p);
    ok((await p.inputValue('#f-g1-why')).includes('用键盘输入'), 'Tab 没有进入理由输入框');
    await step(p, 6); await p.waitForSelector('#out-h');
    const notice = p.locator('.out-side .notice'); ok((await notice.innerText()).includes('还差'), '没有列出还差哪些');
    await notice.locator('button', { hasText: '还缺什么信息' }).first().click(); await p.waitForTimeout(400);
    // 现有共享组件的行为：回到对应的步骤并滚动到那一题（焦点在步骤标题上），不是直接聚焦到输入框
    ok(await p.locator('#f-g6-missing').count() === 1, '点「还差」里的项目没有回到对应的步骤');
    ok(await p.evaluate(() => { const r = document.getElementById('pr-g6').getBoundingClientRect(); return r.top < innerHeight && r.bottom > 0; }), '没有滚动到对应的题目');
    ok(p.errors.length === 0, p.errors.join(' | ')); await c.close();
  });

  await check('其他页面：体验列表能找到入口；首页按数据显示岗位主题（不改首页布局）', async () => {
    const { c, p } = await ctx({ deviceScaleFactor: 2 });
    await p.goto(SITE + '/experiences/', { waitUntil: 'networkidle' }); ok(await p.locator('main a[href$="/experiences/overseas-growth/"]').count() >= 1, '体验列表没有入口');
    await save(p, 'g21-桌面-体验列表');
    await p.goto(SITE + '/', { waitUntil: 'networkidle' }); const t = await p.locator('main').innerText();
    ok(t.includes('出海增长') && t.includes('3 个岗位主题'), '首页没有按数据显示新主题');
    await save(p, 'g22-桌面-首页（数据自动更新）');
    ok(p.errors.length === 0, p.errors.join(' | ')); await c.close();
  });

  await b.close(); server.close();
  const pass = results.filter(r => r.pass).length;
  fs.writeFileSync(path.join(OUT, 'growth.json'), JSON.stringify({ at: new Date().toISOString(), base: BASE, results }, null, 2));
  console.log(`\n${pass} passed, ${results.length - pass} failed`);
  process.exit(pass === results.length ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
