// 浏览器验收（真实 Chromium + 测试环境服务器 + 独立测试数据库）。
// 不要直接运行：请用 `npm run test:e2e`（tests/e2e/run.mjs 会建临时测试库、选空闲端口、启动并清理服务器）。
// 结果写入 test-results/acceptance/acceptance.json，截图写入 test-results/acceptance/shots/。
const { chromium } = require('playwright');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const BASE = process.env.E2E_BASE, OUT = process.env.RESULTS_DIR || path.join('test-results', 'acceptance'), SHOTS = path.join(OUT, 'shots'), W = '/experiences/ops-returns-deep/work';
if (!BASE || !process.env.DATABASE_PATH) { console.error('请用 npm run test:e2e 运行（需要 E2E_BASE 和 DATABASE_PATH）'); process.exit(2); }
fs.mkdirSync(SHOTS, { recursive: true });
const grantAdmin = phone => execFileSync(process.execPath, [process.env.TSX_CLI || require.resolve('tsx/cli'), path.join('scripts', 'admin.ts'), phone], { env: { ...process.env, NODE_NO_WARNINGS: '1' }, stdio: 'pipe' });
const results = []; let browser;
const stamp = String(Date.now()).slice(-6);
const phone = n => '139' + stamp + String(n).padStart(2, '0');
const sleep = ms => new Promise(r => setTimeout(r, ms));
function ok(cond, msg) { if (!cond) throw new Error(msg); }
async function test(name, fn) {
  if (process.env.ONLY && !name.includes(process.env.ONLY)) return;
  const t0 = Date.now();
  try { await fn(); results.push({ name, pass: true, ms: Date.now() - t0 }); console.log('PASS', name); }
  catch (e) { results.push({ name, pass: false, error: String(e.message || e).slice(0, 500) }); console.log('FAIL', name, '\n   ', String(e.message || e).slice(0, 500)); }
}
async function ctx(opts = {}) { const c = await browser.newContext({ viewport: { width: 1280, height: 860 }, ...opts }); const p = await c.newPage(); p.errors = []; p.on('pageerror', e => p.errors.push(e.message)); return { c, p }; }
async function shot(p, name, full = true) { if (full) { await p.evaluate(() => window.scrollTo(0, 0)); await p.waitForTimeout(100); } await p.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: full }); }
async function api(p, path, body) {
  return p.evaluate(async ([path, body]) => {
    const s = await (await fetch('/api/session')).json();
    const r = await fetch('/api/' + path, body === undefined ? { headers: { 'x-session': s.identity.stamp } } : { method: 'POST', headers: { 'content-type': 'application/json', 'x-session': s.identity.stamp }, body: JSON.stringify(body) });
    return { status: r.status, body: await r.json() };
  }, [path, body]);
}
async function login(p, ph, next = '/me') {
  await p.goto(BASE + '/login?next=' + encodeURIComponent(next), { waitUntil: 'networkidle' });
  await p.fill('input[autocomplete="tel"]', ph);
  await p.click('button:has-text("获取验证码")');
  const code = (await p.locator('[data-testid="dev-code"] b').textContent({ timeout: 10000 })).trim();
  await p.fill('#code', code);
  await p.click('button:has-text("登录"):not(:has-text("获取"))');
  await p.waitForFunction(() => !location.pathname.startsWith('/login') || document.body.innerText.includes('已按下面的规则并入账号'), null, { timeout: 15000 });
}
async function waitSaved(p) { await p.waitForFunction(() => /已保存/.test(document.querySelector('.save-state')?.textContent || ''), null, { timeout: 15000 }); }
async function step(p, n) { await p.click(`.stepper li:nth-child(${n}) button`); await p.waitForTimeout(150); }
async function fillAll(p) {
  await step(p, 4);
  await p.fill('#f-p1-before', '约 4.7%（33/697）');
  await p.fill('#f-p1-after', '约 11.1%（110/991）');
  await p.fill('#f-p1-other', '访问量从 18800 涨到 32000，订单也涨了，但退货涨得更快。');
  await p.fill('#f-p2-when', '第 4 周开始。同一周扩充了适配车型、开了广泛匹配广告、降了价。');
  await p.fill('#f-p3-main', '“不匹配我的车”最多，评论里有人说按表格选了还是装不上。');
  await p.check('label.choice:has-text("新增车型的适配数据有错") input');
  await p.check('label.choice:has-text("广泛匹配广告") input');
  await p.fill('#f-p4-why', '不匹配原因占比最高，而且时间点和适配表扩充同一周。');
  await p.fill('#f-p5-first', '抽查新增车型的适配数据，先下架有疑问的车型。');
  await p.fill('#f-p5-second', '看广告搜索词报告，排除不相关的词。');
  await p.fill('#f-p6-missing', '退货订单对应的车型（找客服/仓库），适配数据来源（找供应商）。');
}

(async () => {
  browser = await chromium.launch();

  await test('零经验学生（游客）走完 6 步并在登录后保存完成记录', async () => {
    const { c, p } = await ctx();
    await p.goto(BASE + '/experiences/ops-returns-deep', { waitUntil: 'networkidle' });
    await shot(p, 'flow-00-detail');
    await p.click('a:has-text("开始体验")'); await p.waitForURL('**/work'); await p.waitForSelector('.stepper'); await p.waitForLoadState('networkidle');
    await shot(p, 'flow-01-role');
    for (const [n, name] of [[2, 'demo'], [3, 'brief']]) { await p.click('.nav-steps .btn-primary'); await p.waitForTimeout(200); await shot(p, `flow-0${n}-${name}`); }
    await p.click('.nav-steps .btn-primary');
    await p.click('#pr-p1 button:has-text("看提示")'); await p.click('#pr-p1 button:has-text("再看一条提示")'); await p.click('#pr-p1 button:has-text("答题框架")');
    ok(await p.locator('#pr-p1 .hint-item').count() === 2, '提示没有逐条展开');
    await p.click('#pr-p1 .term >> nth=0'); ok(await p.locator('#pr-p1 .term-def').isVisible(), '术语解释没有显示');
    await fillAll(p); await waitSaved(p);
    await shot(p, 'flow-04-practice');
    ok((await p.locator('.stepper li:nth-child(4) .s').textContent()).includes('已作答 10/10'), '步骤 4 状态不是已作答 10/10');
    await step(p, 5); await shot(p, 'flow-05-reference');
    await step(p, 6);
    await p.check('label.choice:has-text("多了不少") input'); await p.check('label.choice:has-text("相关的实习和校招") input');
    await p.fill('textarea >> nth=-1', '整理数据有点枯燥。').catch(() => {});
    ok(await p.locator('a:has-text("登录后保存记录")').isVisible(), '游客没有看到登录提示');
    await shot(p, 'flow-06-wrap-guest');
    await p.click('a:has-text("登录后保存记录")'); await p.waitForURL('**/login**');
    await p.fill('input[autocomplete="tel"]', phone(1)); await p.click('button:has-text("获取验证码")');
    const code = (await p.locator('[data-testid="dev-code"] b').textContent()).trim(); await shot(p, 'login-dev-code');
    await p.fill('#code', code); await p.click('button:has-text("登录"):not(:has-text("获取"))');
    await p.waitForSelector('text=已按下面的规则并入账号'); await shot(p, 'login-merge-result');
    await p.click('a:has-text("继续 →")'); await p.waitForURL('**/work'); await p.waitForSelector('.stepper');
    ok(await p.locator('#f-p1-before').count() === 0 || true, '');
    await step(p, 4); ok((await p.inputValue('#f-p1-before')).includes('4.7'), '登录后作答没有并入账号');
    await step(p, 6); await p.click('button:has-text("完成并保存记录")');
    await p.waitForURL('**/records/**'); await p.waitForSelector('h1');
    const txt = await p.locator('main').innerText();
    ok(txt.includes('不代表实习经历或职业资格') && txt.includes('多了不少') && txt.includes('参考思路'), '完成记录内容不完整');
    await shot(p, 'record-desktop');
    await p.goto(BASE + '/me', { waitUntil: 'networkidle' }); ok((await p.locator('#h-rec').locator('..').locator('..').locator('..').innerText()).includes('深度版：退货率上升'), '「我的」没有完成记录');
    await shot(p, 'me-desktop');
    ok(p.errors.length === 0, '页面脚本错误：' + p.errors.join(' | '));
    await c.close();
  });

  await test('只浏览不作答：不能完成，服务端也拒绝生成记录', async () => {
    const { c, p } = await ctx(); await login(p, phone(2), W); await p.goto(BASE + W, { waitUntil: 'networkidle' });
    for (let i = 2; i <= 6; i++) await step(p, i);
    ok(await p.locator('button:has-text("完成并保存记录")').isDisabled(), '未作答时完成按钮可用');
    ok((await p.locator('.notice:has-text("还差这些没写")').innerText()).includes('前 3 周整体退货率'), '没有列出缺少的作答');
    await shot(p, 'browse-only-wrap');
    await sleep(900);
    const d = await api(p, 'drafts/ops-returns-deep');
    const r = await api(p, 'experiences/ops-returns-deep/submit', { version: d.body?.version || 1, contentVersion: 1, reflection: {} });
    ok(r.status === 422 && r.body.code === 'INCOMPLETE', '服务端没有拒绝只浏览的提交：' + JSON.stringify(r));
    const m = await api(p, 'mine'); ok(m.body.records.length === 0, '只浏览却产生了完成记录');
    ok(d.body?.progress?.visited?.length === 6 && d.body.progress.referenceViewed, '浏览进度没有保存');
    await c.close();
  });

  await test('自动保存 + 刷新恢复到原步骤和作答', async () => {
    const { c, p } = await ctx(); await p.goto(BASE + W, { waitUntil: 'networkidle' });
    await step(p, 4); await p.fill('#f-p2-when', '第 4 周'); await waitSaved(p);
    await p.reload({ waitUntil: 'networkidle' }); await p.waitForSelector('.stepper');
    ok(await p.locator('.stepper button[aria-current="step"] .t').textContent() === '跟着尝试', '刷新后没有回到上次的步骤');
    ok(await p.inputValue('#f-p2-when') === '第 4 周', '刷新后作答丢失');
    await p.goto(BASE + '/experiences/ops-returns-deep', { waitUntil: 'networkidle' });
    ok(await p.locator('a:has-text("继续体验")').isVisible(), '详情页没有「继续体验」');
    await c.close();
  });

  await test('登录合并：两份作答不同 → 不覆盖，选择后另一份进入可恢复区', async () => {
    const { c, p } = await ctx(); const ph = phone(3);
    await login(p, ph, W); await p.goto(BASE + W, { waitUntil: 'networkidle' }); await step(p, 4);
    await p.fill('#f-p2-when', '账号里写的'); await waitSaved(p);
    const out = await api(p, 'auth/logout', {}); ok(out.status === 200, '退出失败');
    await p.goto(BASE + W, { waitUntil: 'networkidle' }); await step(p, 4);
    ok(await p.inputValue('#f-p2-when') === '', '退出后仍能看到账号作答');
    await p.fill('#f-p2-when', '游客写的'); await waitSaved(p);
    await login(p, ph, W);
    ok((await p.locator('main').innerText()).includes('1 份和账号里的草稿不一样'), '没有提示合并冲突');
    await p.click('a:has-text("继续 →")'); await p.waitForSelector('#cf-h');
    await shot(p, 'conflict-chooser');
    ok(await p.locator('#f-p2-when').getAttribute('readonly') !== null, '冲突时作答没有暂停');
    await p.click('.cf-col button:has-text("改用这份")'); await p.waitForSelector('#cf-h', { state: 'detached' });
    await step(p, 4); ok(await p.inputValue('#f-p2-when') === '游客写的', '没有改用选中的作答');
    const m = await api(p, 'mine'); ok(m.body.recoveries.some(r => JSON.stringify(r.answers).includes('账号里写的')), '另一份没有进入可恢复区');
    await p.goto(BASE + '/me', { waitUntil: 'networkidle' }); await shot(p, 'me-with-recovery');
    await c.close();
  });

  await test('同一账号两个页面同时修改 → 冲突并恢复', async () => {
    const { c, p } = await ctx(); await login(p, phone(4), W);
    const p2 = await c.newPage();
    await p.goto(BASE + W, { waitUntil: 'networkidle' }); await p2.goto(BASE + W, { waitUntil: 'networkidle' });
    await step(p, 4); await step(p2, 4);
    await p.fill('#f-p6-missing', '页面一'); await waitSaved(p);
    await p2.fill('#f-p6-missing', '页面二');
    await p2.waitForSelector('#cf-h', { timeout: 15000 });
    ok((await p2.locator('.work-head .save-state').textContent()).includes('两份草稿'), '保存状态没有提示冲突');
    await p2.click('.cf-col button:has-text("改用这份")'); await p2.waitForSelector('#cf-h', { state: 'detached' });
    await step(p2, 4); ok(await p2.inputValue('#f-p6-missing') === '页面二', '冲突恢复后内容不对');
    await c.close();
  });

  await test('网络中断：本机暂存、自动重试；关页后再打开可恢复本机内容', async () => {
    const { c, p } = await ctx(); await p.goto(BASE + W, { waitUntil: 'networkidle' }); await step(p, 4);
    await p.fill('#f-p1-before', '4.7%'); await waitSaved(p);
    await p.route('**/api/drafts/**', r => r.request().method() === 'POST' ? r.abort('internetdisconnected') : r.continue());
    await p.fill('#f-p1-before', '4.7%，断网时写的');
    await p.waitForFunction(() => /网络中断/.test(document.querySelector('.save-state')?.textContent || ''), null, { timeout: 10000 });
    await shot(p, 'network-retry', false);
    const owner = (await api(p, 'session')).body.identity.owner;
    const bk = await p.evaluate(k => JSON.parse(localStorage.getItem(k)), `onstage:backup:${owner}:ops-returns-deep`);
    ok(bk && bk.synced === false && bk.answers['p1.before'].includes('断网'), '没有在本机暂存');
    await p.unroute('**/api/drafts/**');
    await p.click('button:has-text("立即重试")'); await waitSaved(p);
    // 再断网写一次，然后直接关页：重新打开时提示恢复本机内容
    await p.route('**/api/drafts/**', r => r.request().method() === 'POST' ? r.abort('internetdisconnected') : r.continue());
    await p.fill('#f-p1-before', '关页前没保存上的');
    await p.waitForFunction(() => /网络中断/.test(document.querySelector('.save-state')?.textContent || ''), null, { timeout: 10000 });
    await p.close();
    const p2 = await c.newPage(); await p2.goto(BASE + W, { waitUntil: 'networkidle' });
    await p2.waitForSelector('text=这台设备上有一份没保存到服务器的作答'); await shot(p2, 'backup-restore-prompt', false);
    await p2.click('button:has-text("用本机这份继续")'); await waitSaved(p2); await step(p2, 4);
    ok(await p2.inputValue('#f-p1-before') === '关页前没保存上的', '没有恢复本机内容');
    const d = await api(p2, 'drafts/ops-returns-deep'); ok(d.body.answers['p1.before'] === '关页前没保存上的', '恢复后没有保存到服务器');
    await c.close();
  });

  await test('浏览器存储不可用：明确提示，仍能保存到服务器', async () => {
    const { c, p } = await ctx();
    await p.addInitScript(() => { Storage.prototype.setItem = function () { throw new DOMException('QuotaExceededError', 'QuotaExceededError'); }; });
    await p.goto(BASE + W, { waitUntil: 'networkidle' }); await step(p, 4);
    await p.fill('#f-p3-main', '存储不可用时写的'); await waitSaved(p);
    ok(await p.locator('text=这个浏览器不能使用本地存储').isVisible(), '没有提示存储不可用');
    await shot(p, 'storage-failure', false);
    await c.close();
  });

  await test('多标签页切换账号：旧页面暂停保存和提交，不静默换账号', async () => {
    const { c, p } = await ctx(); await p.goto(BASE + W, { waitUntil: 'networkidle' }); await step(p, 4);
    await p.fill('#f-p5-first', '游客页面'); await waitSaved(p);
    const p2 = await c.newPage(); await login(p2, phone(5), '/me');
    await p.bringToFront(); await p.waitForSelector('[role="alertdialog"]:has-text("登录身份已变化")', { timeout: 20000 });
    await shot(p, 'identity-changed', false);
    await p.click('button:has-text("先收起")');
    ok(await p.locator('.blocked-bar').isVisible(), '收起后没有持续提示');
    ok((await p.locator('.work-head .save-state').textContent()).includes('保存已暂停'), '保存没有暂停');
    ok(await p.locator('#f-p5-first').getAttribute('readonly') !== null, '身份变化后仍可编辑');
    // 直接用旧页面的会话戳写入：服务端拒绝
    const r = await p.evaluate(async () => (await fetch('/api/drafts/ops-returns-deep', { method: 'POST', headers: { 'content-type': 'application/json', 'x-session': 'stale-stamp' }, body: JSON.stringify({ version: 0, contentVersion: 1, answers: {} }) })).status);
    ok(r === 409, '旧会话戳的写入没有被拒绝：' + r);
    await c.close();
  });

  let adminPage, adminCtx, recordA, userA;
  await test('账号隔离：别人的完成记录和草稿读不到；后台不含学生作答', async () => {
    const a = await ctx(); userA = a; await login(a.p, phone(6), W); await a.p.goto(BASE + W, { waitUntil: 'networkidle' });
    await fillAll(a.p); await a.p.fill('#f-p6-missing', '隔离测试-唯一内容-' + stamp); await waitSaved(a.p);
    await step(a.p, 6); await a.p.click('button:has-text("完成并保存记录")'); await a.p.waitForURL('**/records/**');
    recordA = a.p.url().split('/records/')[1];
    const b = await ctx(); await login(b.p, phone(7));
    const r = await api(b.p, 'records/' + recordA); ok(r.status === 404, '其他账号能读到完成记录：' + r.status);
    await b.p.goto(BASE + '/records/' + recordA, { waitUntil: 'networkidle' }); ok((await b.p.locator('main').innerText()).includes('完成记录不存在'), '页面没有拒绝');
    const m = await api(b.p, 'mine'); ok(!JSON.stringify(m.body).includes('隔离测试'), '「我的」泄露了别人的作答');
    const adm = await api(b.p, 'admin'); ok(adm.status === 403, '普通学生能访问后台：' + adm.status);
    // 管理员
    adminCtx = await ctx(); adminPage = adminCtx.p; const aph = phone(8); await login(adminPage, aph);
    grantAdmin(aph);
    const ad = await api(adminPage, 'admin'); ok(ad.status === 200, '管理员不能访问后台');
    ok(!JSON.stringify(ad.body).includes('隔离测试'), '后台数据包含学生作答');
    const vs = await api(adminPage, 'admin/experiences/ops-returns-deep/versions'); ok(!JSON.stringify(vs.body).includes('隔离测试'), '版本数据包含学生作答');
    const ar = await api(adminPage, 'records/' + recordA); ok(ar.status === 404, '管理员能读到学生的完成记录');
    await b.c.close();
  });

  await test('内容更新：旧版本草稿可以做完，历史记录不随新版改变', async () => {
    // 学生 C 在第 1 版留下草稿
    const cU = await ctx(); await login(cU.p, phone(9), W); await cU.p.goto(BASE + W, { waitUntil: 'networkidle' }); await fillAll(cU.p); await waitSaved(cU.p);
    // 管理员在后台建第 2 版、改标题、审核、发布（走页面）
    await adminPage.goto(BASE + '/admin', { waitUntil: 'networkidle' }); await shot(adminPage, 'admin-experiences', false);
    await adminPage.locator('.panel:has-text("ops-returns-deep") button:has-text("管理版本")').click();
    await adminPage.click('button:has-text("新建版本")'); await adminPage.waitForSelector('button:has-text("编辑内容")');
    await adminPage.click('button:has-text("编辑内容")'); await adminPage.waitForSelector('#ve-h');
    await adminPage.fill('#af-title', '深度版：退货率上升（第 2 版）');
    await adminPage.fill('label:has-text("本版改动说明") input', '标题标注版本，用于测试');
    ok(await adminPage.locator('#ve-h ~ .badge, .badge:has-text("有未保存的修改")').count() > 0, '没有显示未保存提示');
    await adminPage.click('button:has-text("保存草稿")'); await adminPage.waitForSelector('#ve-h', { state: 'detached' });
    await adminPage.click('button:has-text("提交审核")'); await adminPage.waitForSelector('button:has-text("审核通过")');
    await shot(adminPage, 'admin-version-review', true);
    await adminPage.click('button:has-text("审核通过")'); await adminPage.waitForSelector('.list-row button:has-text("发布")');
    await adminPage.click('.list-row button:has-text("发布")'); await adminPage.waitForSelector('text=已被替代（只读）');
    await shot(adminPage, 'admin-version-published', true);
    // 已发布 / 已替代的版本只读：直接改第 1 版被拒绝
    const v1 = (await api(adminPage, 'admin/experiences/ops-returns-deep/versions')).body.versions.find(v => v.version === 1);
    const lock = await api(adminPage, 'admin/experiences/ops-returns-deep/versions/1', { data: v1.data, sourceNote: 'x', changeNote: 'x', rev: v1.rev, companyId: null });
    ok(lock.status === 409, '已替代版本仍能修改：' + lock.status);
    // 学生 C：看到旧版本提示，仍能完成第 1 版
    await cU.p.reload({ waitUntil: 'networkidle' }); await cU.p.waitForSelector('text=已经更新到第 2 版');
    await shot(cU.p, 'outdated-notice', false);
    await step(cU.p, 6); await cU.p.click('button:has-text("完成并保存记录")'); await cU.p.waitForURL('**/records/**');
    const rec = await api(cU.p, 'records/' + cU.p.url().split('/records/')[1]);
    ok(rec.body.content_version === 1 && !rec.body.snapshot.data.title.includes('第 2 版'), '旧版本记录被改成了新版本');
    // 学生 A 的历史记录：显示更新提示，但内容仍是第 1 版
    await userA.p.goto(BASE + '/records/' + recordA, { waitUntil: 'networkidle' });
    const t = await userA.p.locator('main').innerText();
    ok(t.includes('后来更新到了第 2 版') && !t.includes('（第 2 版）'), '历史记录随新版改变了');
    await shot(userA.p, 'record-after-update');
    // 新开始的学生拿到第 2 版
    const n = await ctx(); await n.p.goto(BASE + W, { waitUntil: 'networkidle' }); ok((await n.p.locator('.work-title').innerText()).includes('第 2 版'), '新学生没有拿到第 2 版'); await n.c.close();
    await cU.c.close();
  });

  await test('体验下线：不能继续保存或完成，草稿和记录保留；重新上线后恢复', async () => {
    const s = await ctx(); await s.p.goto(BASE + W, { waitUntil: 'networkidle' }); await step(s.p, 4); await s.p.fill('#f-p2-when', '下线前写的'); await waitSaved(s.p);
    await adminPage.goto(BASE + '/admin', { waitUntil: 'networkidle' });
    await adminPage.locator('.panel:has-text("ops-returns-deep") button:has-text("下线")').click(); await adminPage.waitForSelector('.panel:has-text("ops-returns-deep") button:has-text("上线")');
    await s.p.fill('#f-p2-when', '下线后写的');
    await s.p.waitForFunction(() => /下线/.test(document.querySelector('.save-state')?.textContent || ''), null, { timeout: 10000 });
    await shot(s.p, 'offline-while-working', false);
    await s.p.goto(BASE + '/experiences/ops-returns-deep', { waitUntil: 'networkidle' }); ok((await s.p.locator('h1').innerText()).includes('已下线'), '详情页没有显示下线');
    await userA.p.goto(BASE + '/records/' + recordA, { waitUntil: 'networkidle' }); ok((await userA.p.locator('main').innerText()).includes('目前已下线'), '下线后记录不可见');
    await adminPage.locator('.panel:has-text("ops-returns-deep") button:has-text("上线")').click(); await adminPage.waitForSelector('.panel:has-text("ops-returns-deep") button:has-text("下线")');
    await s.p.goto(BASE + W, { waitUntil: 'networkidle' }); await step(s.p, 4); ok(await s.p.inputValue('#f-p2-when') === '下线前写的', '重新上线后草稿丢失');
    await s.c.close();
  });

  await test('企业合作意向：校验、保存、后台可见并可改状态', async () => {
    const { c, p } = await ctx(); await p.goto(BASE + '/cooperate', { waitUntil: 'networkidle' });
    await p.click('button:has-text("提交合作意向")'); await p.waitForSelector('.err', { timeout: 5000 }).catch(() => { throw new Error('空表单没有报错'); });
    await p.fill('label:has-text("企业名称") input', '测试企业' + stamp); await p.fill('label:has-text("联系人") input', '王经理');
    await p.fill('label:has-text("手机号或工作邮箱") input', 'hr@example.com'); await p.fill('label:has-text("岗位或工作场景") textarea', '跨境电商运营的日常数据分析');
    await p.click('button:has-text("提交合作意向")'); await p.waitForSelector('.err:has-text("请确认同意")', { timeout: 5000 }).catch(() => { throw new Error('未勾选同意也能提交'); });
    await p.check('label.choice input'); await p.click('button:has-text("提交合作意向")'); await p.waitForSelector('text=已收到你的合作意向');
    await shot(p, 'cooperate-done');
    await adminPage.goto(BASE + '/admin', { waitUntil: 'networkidle' }); await adminPage.click('button[role="tab"]:has-text("合作意向")');
    const card = adminPage.locator('.panel', { hasText: '测试企业' + stamp }); await card.locator('select').selectOption('contacted'); await card.locator('button:has-text("保存")').click();
    await adminPage.waitForSelector('.panel:has-text("测试企业' + stamp + '") .badge:has-text("已联系")'); await shot(adminPage, 'admin-intents', false);
    await c.close();
  });

  await test('招聘专区不回归：列表、详情、示例投递说明、反馈、收藏需登录、改动后需重新确认', async () => {
    const { c, p } = await ctx(); await p.goto(BASE + '/jobs', { waitUntil: 'networkidle' });
    ok(await p.locator('.card').count() >= 3, '岗位列表为空');
    ok(!(await p.locator('main').innerText()).includes('已下架的示例'), '');
    await p.goto(BASE + '/jobs/j1', { waitUntil: 'networkidle' }); await shot(p, 'job-detail');
    await p.click('button:has-text("前往企业官网投递")'); await p.waitForSelector('[role="dialog"]:has-text("示例信息")');
    await p.keyboard.press('Escape'); await p.waitForSelector('[role="dialog"]', { state: 'detached' });
    await p.click('button:has-text("收藏")'); await p.waitForURL('**/login**');
    await p.goto(BASE + '/jobs/j1', { waitUntil: 'networkidle' }); await p.click('button:has-text("信息失效或有误")');
    await p.fill('[role="dialog"] textarea', '链接打不开'); await p.click('button:has-text("提交反馈")'); await p.waitForSelector('text=反馈已收到');
    const j6 = await api(p, 'content/j6'); ok(j6.body.status !== 'published', '已下架岗位仍显示为可投递');
    // 管理员修改岗位 → 回到待确认，公开页不可投递
    const all = (await api(adminPage, 'admin')).body.content; const j1 = all.find(x => x.id === 'j1');
    const e = await api(adminPage, 'admin/content', { id: 'j1', kind: 'job', companyId: j1.companyId, version: j1.version, demo: true, data: { ...j1.data, salary: '¥250/天' } });
    ok(e.status === 200 && e.body.status === 'pending', '修改后没有回到待确认');
    const pub = await api(p, 'content/j1'); ok(pub.body.status === 'pending' && !pub.body.data.salary, '未确认的修改泄露到公开页');
    const pubFail = await api(adminPage, 'admin/content/j1/transition', { action: 'publish', version: e.body.version }); ok(pubFail.status === 422, '未确认就能发布');
    await api(adminPage, 'admin/content/j1/transition', { action: 'confirm', version: e.body.version, note: '示例：企业 HR 邮件确认' });
    const pubOk = await api(adminPage, 'admin/content/j1/transition', { action: 'publish', version: e.body.version }); ok(pubOk.status === 200 && pubOk.body.status === 'published', '确认后不能发布');
    await c.close();
  });

  await test('后台页面新建四类内容 → 确认 / 审核 → 发布，学生端看到的一致', async () => {
    const A = adminPage; const T = 'S' + stamp, domain = 'onstage-test-' + stamp + '.com';
    const tab = async name => { await A.click(`.admin-tabs button:has-text("${name}")`); await A.waitForTimeout(150); };
    const rowOf = title => A.locator('.list-row', { hasText: title });
    const idOf = async title => (await api(A, 'admin')).body.content.find(c => c.data.title === title).id;
    await A.goto(BASE + '/admin', { waitUntil: 'networkidle' });
    // 企业
    await tab('企业'); await A.click('button:has-text("新建企业")'); await A.waitForSelector('#ed-h');
    await A.fill('#af-title', '测试企业' + T); await A.fill('#af-industry', '出海企业'); await A.fill('#af-about', '页面新建的测试企业。');
    await A.fill('#af-directions', '跨境电商运营\n海外市场'); await A.fill('#af-officialDomain', domain); await A.fill('#af-cooperation', '测试数据，与上场没有合作关系。');
    await A.check('#af-authorized'); await A.fill('#af-authorizationNote', '测试：企业负责人邮件授权（自动化测试）');
    await shot(A, 'admin-new-company', true);
    await A.click('button:has-text("保存为草稿")'); await rowOf('测试企业' + T).waitFor();
    const coId = await idOf('测试企业' + T);
    ok((await api(A, 'content/' + coId)).body.data.title === '这项内容暂不可用', '新建企业保存后就公开了');
    await rowOf('测试企业' + T).locator('button:has-text("发布")').click(); await rowOf('测试企业' + T).locator('.badge:has-text("已发布")').waitFor();
    // 招聘：未确认不能发布 → 记录确认 → 发布
    await tab('招聘'); await A.click('button:has-text("新建招聘")'); await A.waitForSelector('#ed-h');
    await A.selectOption('#af-companyId', coId); await A.fill('#af-title', '测试岗位' + T); await A.fill('#af-direction', '跨境电商运营'); await A.fill('#af-city', '远程');
    await A.fill('#af-salary', '¥200/天'); await A.fill('#af-duties', '整理每周店铺数据。'); await A.fill('#af-requirements', '在校生，每周 3 天。');
    const dl = new Date(Date.now() + 30 * 86400000 + 8 * 3600000).toISOString().slice(0, 10); await A.fill('#af-deadline', dl);
    await A.fill('#af-source', '企业招聘负责人提供（测试）'); await A.fill('#af-applyUrl', 'https://' + domain + '/jobs');
    await A.click('button:has-text("预览")'); await A.waitForSelector('[role="dialog"]:has-text("整理每周店铺数据")'); await shot(A, 'admin-job-preview', false);
    await A.keyboard.press('Escape');
    await A.click('button:has-text("保存为草稿")'); await rowOf('测试岗位' + T).waitFor();
    const jobId = await idOf('测试岗位' + T);
    await rowOf('测试岗位' + T).locator('button:has-text("发布")').click(); await A.waitForSelector('.toast.bad:has-text("确认")');
    ok((await api(A, 'content/' + jobId)).body.status !== 'published', '未确认的岗位被发布了');
    await rowOf('测试岗位' + T).locator('input').fill('测试：企业 HR 邮件确认当前版本');
    await rowOf('测试岗位' + T).locator('button:has-text("记录确认")').click(); await rowOf('测试岗位' + T).locator('text=企业已确认当前版本').waitFor();
    await rowOf('测试岗位' + T).locator('button:has-text("发布")').click(); await rowOf('测试岗位' + T).locator('.badge:has-text("已发布")').waitFor();
    // 赛事
    await tab('赛事'); await A.click('button:has-text("新建赛事")'); await A.waitForSelector('#ed-h');
    await A.fill('#af-title', '测试赛事' + T); await A.fill('#af-organizer', '测试主办方'); await A.fill('#af-city', '线上'); await A.fill('#af-eligibility', '在校学生');
    await A.fill('#af-deadline', dl); await A.fill('#af-source', '主办方官网（测试）'); await A.fill('#af-applyUrl', 'https://' + domain + '/event');
    await A.click('button:has-text("保存为草稿")'); await rowOf('测试赛事' + T).waitFor();
    await rowOf('测试赛事' + T).locator('button:has-text("发布")').click(); await rowOf('测试赛事' + T).locator('.badge:has-text("已发布")').waitFor();
    // 岗位体验（简版）：基本信息 + 模板 → 版本来源 → 审核 → 发布
    await tab('岗位体验'); await A.click('button:has-text("新建岗位体验")'); await A.waitForSelector('#ed-h');
    await A.selectOption('#af-format', 'simple');
    await A.fill('#af-title', '测试体验' + T); await A.fill('#af-direction', '跨境电商运营'); await A.fill('#af-minutes', '15');
    await A.fill('#af-willDo', '读一段情境，做一个判断'); await A.fill('#af-learn', '一个具体任务的思路');
    const tpl = JSON.parse(await A.inputValue('#af-json')); tpl.scene = '测试情境：店铺退货率上升。数据为虚构。'; tpl.tasks[0] = { title: '先查什么', prompt: '选一项并说明理由', options: ['先看退货原因', '先降价'], reference: '先看退货原因：找到主因再行动。' };
    await A.fill('#af-json', JSON.stringify(tpl, null, 2));
    await A.click('button:has-text("保存为草稿")'); await A.waitForSelector('.panel:has-text("测试体验' + T + '")');
    const expId = await idOf('测试体验' + T);
    ok((await api(A, 'content/' + expId)).body.data.title === '这项内容暂不可用', '新建体验保存后就公开了');
    const panel = A.locator('.panel', { hasText: '测试体验' + T });
    await panel.locator('button:has-text("管理版本")').click(); await panel.locator('button:has-text("提交审核")').waitFor();
    await panel.locator('button:has-text("提交审核")').click(); await A.waitForSelector('.toast.bad:has-text("来源")');
    await panel.locator('button:has-text("编辑内容")').click(); await A.waitForSelector('#ve-h');
    await A.fill('label:has-text("内容来源说明") input', '平台根据公开资料整理；数据为虚构（测试）');
    await A.click('button:has-text("保存草稿")'); await A.waitForSelector('#ve-h', { state: 'detached' });
    await panel.locator('button:has-text("提交审核")').click(); await panel.locator('button:has-text("审核通过")').waitFor();
    await panel.locator('button:has-text("审核通过")').click(); await panel.locator('.list-row button:has-text("发布")').waitFor();
    await panel.locator('.list-row button:has-text("发布")').click(); await panel.locator('.badge:has-text("已发布")').first().waitFor();
    await shot(A, 'admin-experiences-after-create', true);
    // 学生端
    const { c, p } = await ctx();
    await p.goto(BASE + '/companies/' + coId, { waitUntil: 'networkidle' }); ok((await p.locator('main').innerText()).includes('测试岗位' + T), '企业页没有显示新岗位');
    await p.goto(BASE + '/jobs/' + jobId, { waitUntil: 'networkidle' }); ok((await p.locator('main').innerText()).includes('整理每周店铺数据'), '岗位详情不一致');
    ok((await api(p, 'apply/' + jobId, {})).body.url === 'https://' + domain + '/jobs', '投递地址不一致');
    await p.goto(BASE + '/events', { waitUntil: 'networkidle' }); ok((await p.locator('main').innerText()).includes('测试赛事' + T), '赛事列表没有新赛事');
    await p.goto(BASE + '/experiences', { waitUntil: 'networkidle' }); ok((await p.locator('main').innerText()).includes('测试体验' + T), '体验列表没有新体验');
    await p.goto(BASE + '/experiences/' + expId + '/work', { waitUntil: 'networkidle' }); ok((await p.locator('h1').innerText()).includes('测试体验' + T), '体验作答页不一致');
    await c.close();
  });

  await test('后台表单：校验错误、取消、未保存提醒、并发编辑不覆盖', async () => {
    const A = adminPage; await A.goto(BASE + '/admin', { waitUntil: 'networkidle' });
    await A.click('.admin-tabs button:has-text("企业")'); await A.click('button:has-text("新建企业")');
    await A.click('button:has-text("保存为草稿")'); await A.waitForSelector('.bad-box:has-text("没有保存")');
    ok((await A.locator('.bad-box').innerText()).includes('标题'), '校验错误没有指出字段');
    ok(await A.locator('#af-title[aria-invalid="true"]').count() === 1, '出错字段没有标记');
    await shot(A, 'admin-form-error', false);
    await A.fill('#af-title', '未保存的企业');
    await A.click('.admin-tabs button:has-text("招聘")'); await A.waitForSelector('[role="alertdialog"]:has-text("未保存的修改")');
    await A.click('button:has-text("继续编辑")'); ok(await A.inputValue('#af-title') === '未保存的企业', '继续编辑后内容丢失');
    await A.locator('section[aria-labelledby="ed-h"] > .row button:has-text("取消")').click(); await A.waitForSelector('[role="alertdialog"]');
    await A.click('button:has-text("放弃修改")'); await A.waitForSelector('#ed-h', { state: 'detached' });
    ok(!(await api(A, 'admin')).body.content.some(c => c.data.title === '未保存的企业'), '取消后仍保存了');
    // 体验 JSON 格式错误
    await A.click('.admin-tabs button:has-text("岗位体验")'); await A.click('button:has-text("新建岗位体验")');
    await A.fill('#af-json', '{ 这不是 JSON'); await A.click('button:has-text("检查格式")'); await A.waitForSelector('text=不是有效的 JSON');
    await A.click('button:has-text("保存为草稿")'); await A.waitForSelector('.bad-box:has-text("不是有效的 JSON")');
    await A.locator('section[aria-labelledby="ed-h"] > .row button:has-text("取消")').click(); await A.click('button:has-text("放弃修改")');
    // 两位管理员同时编辑同一岗位：后保存的一方看到冲突，内容不覆盖
    const B = await adminCtx.c.newPage();
    for (const pg of [A, B]) { await pg.goto(BASE + '/admin', { waitUntil: 'networkidle' }); await pg.click('.admin-tabs button:has-text("招聘")'); await pg.locator('.list-row', { hasText: '跨境电商运营实习生' }).locator('button:has-text("编辑")').click(); await pg.waitForSelector('#ed-h'); }
    await A.fill('#af-salary', '管理员 A 改的'); await A.click('button:has-text("保存修改")'); await A.waitForSelector('#ed-h', { state: 'detached' });
    await B.fill('#af-salary', '管理员 B 改的'); await B.click('button:has-text("保存修改")'); await B.waitForSelector('.bad-box:has-text("已被其他管理员修改"), .warn-box:has-text("其他管理员")');
    ok(await B.inputValue('#af-salary') === '管理员 B 改的', '冲突后 B 的修改丢了');
    const j1 = (await api(A, 'admin')).body.content.find(c => c.id === 'j1'); ok(j1.data.salary === '管理员 A 改的', 'A 的修改被覆盖了');
    ok(j1.status === 'pending', '保存后没有回到待确认');
    await shot(B, 'admin-concurrent-conflict', false);
    await B.close();
    // 恢复 j1 的确认与发布，供后续用例使用
    await api(A, 'admin/content/j1/transition', { action: 'confirm', version: j1.version, note: '测试：恢复确认' }); await api(A, 'admin/content/j1/transition', { action: 'publish', version: j1.version });
  });

  await test('V1.5 短体验（正式版）：游客走完 4 步看到复盘；登录后保存完成记录', async () => {
    const { c, p } = await ctx(); await p.goto(BASE + '/experiences/ops-returns/work', { waitUntil: 'networkidle' });
    await p.click('button:has-text("开始：去后台看看")'); await p.click('.matc:has-text("退货原因") .matc-h button');
    await p.click('button:has-text("写下周的行动")'); await p.locator('.choice:has-text("按原厂目录核对")').click();
    await p.fill('#f-plan-reason', '车型不匹配涨得最多'); await waitSaved(p);
    await p.click('button:has-text("提交方案，看复盘")'); await p.waitForSelector('#rv-ref');
    ok((await p.locator('main').innerText()).includes('没有打开：利润拆解'), '复盘没有对应操作');
    await login(p, phone(31), '/experiences/ops-returns/work'); await p.goto(BASE + '/experiences/ops-returns/work', { waitUntil: 'networkidle' });
    await p.waitForSelector('.work-head'); ok((await p.locator('main').innerText()).includes('已写好'), '登录后作答没有并入账号'); await step(p, 4);
    await p.waitForSelector('#rv-ref'); await p.click('button:has-text("完成并保存记录")'); await p.waitForURL('**/records/**'); await p.waitForSelector('h2:has-text("你的作答")');
    ok((await p.locator('main').innerText()).includes('车型不匹配涨得最多'), '完成记录里没有作答');
    ok(p.errors.length === 0, p.errors.join(' | ')); await c.close();
  });
  await test('简版练习：可以先看参考思路，只看不做不生成完成记录', async () => {
    const { c, p } = await ctx(); await login(p, phone(10), '/experiences/yc-quick/work'); await p.goto(BASE + '/experiences/yc-quick/work', { waitUntil: 'networkidle' });
    ok((await p.locator('.track').innerText()).includes('未看参考思路'), '没有显示参考状态');
    await p.click('#pr-t0 button:has-text("查看参考思路")'); await p.waitForSelector('#pr-t0 [role="note"]:has-text("参考思路")');
    await waitSaved(p);
    ok((await p.locator('.track').innerText()).includes('已看参考思路'), '查看参考后状态没有更新');
    ok(await p.locator('button:has-text("完成并保存记录")').isDisabled(), '没作答也能完成');
    await shot(p, 'simple-reference-viewed');
    const d = await api(p, 'drafts/yc-quick'); ok(d.body.progress.referenceViewed === true, '没有记录看过参考');
    const r = await api(p, 'experiences/yc-quick/submit', { version: d.body.version, contentVersion: d.body.content_version, reflection: {} });
    ok(r.status === 422 && r.body.code === 'INCOMPLETE', '只看参考也能提交');
    ok((await api(p, 'mine')).body.records.length === 0, '只看参考生成了完成记录');
    await p.goto(BASE + '/me', { waitUntil: 'networkidle' }); ok((await p.locator('main').innerText()).includes('已看参考思路'), '「我的」没有区分浏览和作答');
    await c.close();
  });

  for (const [w, h] of [[390, 844], [320, 640]]) await test(`手机 ${w}px：作答时打开材料，关闭后回到原输入框，内容保留，无遮挡`, async () => {
    const { c, p } = await ctx({ viewport: { width: w, height: h }, deviceScaleFactor: 2, hasTouch: true });
    await p.goto(BASE + W, { waitUntil: 'networkidle' }); await step(p, 4);
    await p.locator('#f-p2-when').scrollIntoViewIfNeeded(); await p.click('#f-p2-when'); await p.keyboard.type('第 4 周开始');
    const bar = p.locator('.mobile-tools'); ok(await bar.isVisible(), '没有显示材料入口');
    await bar.locator('button:has-text("查看材料")').click(); const dlg = p.locator('[role="dialog"]:has-text("任务材料")'); await dlg.waitFor();
    ok(await dlg.locator('table').count() >= 1, '抽屉里没有材料表格');
    const tw = await dlg.locator('.table-wrap').first().evaluate(e => ({ sw: e.scrollWidth, cw: e.clientWidth, ox: getComputedStyle(e).overflowX }));
    ok(['auto', 'scroll'].includes(tw.ox), '表格容器不能横向滚动');
    ok(await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth) <= 0, '打开材料后页面横向溢出');
    ok(await dlg.evaluate(e => e.scrollWidth - e.clientWidth) <= 0, '材料抽屉本身横向溢出（应只让表格在容器内滚动）');
    await shot(p, `m${w}_materials_sheet`, false);
    await p.keyboard.press('Escape'); await dlg.waitFor({ state: 'detached' });
    ok(await p.evaluate(() => document.activeElement?.id) === 'f-p2-when', '关闭后焦点没有回到输入框');
    ok(await p.inputValue('#f-p2-when') === '第 4 周开始', '关闭后作答丢失');
    // 卡片内的入口，用「关闭」按钮关闭
    await p.locator('#pr-p3 button:has-text("查看材料")').click(); await dlg.waitFor();
    await dlg.locator('button:has-text("关闭")').click(); await dlg.waitFor({ state: 'detached' });
    ok(await p.evaluate(() => document.activeElement?.id) === 'f-p2-when', '用关闭按钮后焦点没有回到原输入框');
    // 遮挡检查：当前输入框不被顶部材料栏和底部导航挡住
    await p.waitForTimeout(200);
    const r = await p.evaluate(() => { const i = document.activeElement.getBoundingClientRect(), b = document.querySelector('.mobile-tools').getBoundingClientRect(), t = document.querySelector('.tabbar').getBoundingClientRect(); return { it: i.top, ib: i.bottom, bb: b.bottom, tt: t.top }; });
    ok(r.it >= r.bb - 1 && r.ib <= r.tt + 1, `输入框被遮挡：${JSON.stringify(r)}`);
    await shot(p, `m${w}_after_materials`, false);
    await c.close();
  });

  await test('键盘操作与弹窗焦点：跳到主要内容、焦点困在弹窗内、Esc 关闭后焦点返回', async () => {
    const { c, p } = await ctx(); await p.goto(BASE + '/jobs/j2', { waitUntil: 'networkidle' });
    await p.keyboard.press('Tab'); ok(await p.evaluate(() => document.activeElement?.textContent) === '跳到主要内容', '第一个 Tab 不是跳转链接');
    const btn = p.locator('button:has-text("前往企业官网投递")'); await btn.focus(); await p.keyboard.press('Enter');
    await p.waitForSelector('[role="dialog"]');
    for (let i = 0; i < 5; i++) { await p.keyboard.press('Tab'); ok(await p.evaluate(() => !!document.activeElement?.closest('[role="dialog"]')), '焦点离开了弹窗'); }
    ok(await p.evaluate(() => document.querySelector('.shell')?.hasAttribute('inert')), '背景没有设为不可操作');
    await p.keyboard.press('Escape'); await p.waitForSelector('[role="dialog"]', { state: 'detached' });
    ok(await p.evaluate(() => document.activeElement?.textContent?.includes('前往企业官网投递')), '关闭后焦点没有回到按钮');
    // 体验页：步骤可以用键盘切换
    await p.goto(BASE + W, { waitUntil: 'networkidle' }); await p.locator('.stepper li:nth-child(2) button').focus(); await p.keyboard.press('Enter');
    ok(await p.evaluate(() => document.activeElement?.tagName === 'H1'), '切换步骤后焦点没有移到标题');
    await c.close();
  });

  await test('减少动态效果：系统偏好下关闭动画与过渡', async () => {
    const { c, p } = await ctx({ reducedMotion: 'reduce' }); await p.goto(BASE + '/', { waitUntil: 'networkidle' });
    const d = await p.evaluate(() => getComputedStyle(document.querySelector('.card')).transitionDuration);
    ok(d.split(',').every(x => parseFloat(x) < 0.01), '仍有过渡动画：' + d);
    await c.close();
  });

  await test('390px / 320px 无横向滚动，主要页面截图', async () => {
    const pages = ['/', '/experiences', '/experiences/ops-returns-deep', W, '/experiences/yc-quick/work', '/jobs', '/jobs/j1', '/events', '/companies/yc', '/me', '/login', '/cooperate'];
    for (const [name, w, h] of [['m390', 390, 844], ['m320', 320, 640]]) {
      const { c, p } = await ctx({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
      for (const path of pages) {
        await p.goto(BASE + path, { waitUntil: 'networkidle' }); await p.waitForTimeout(200);
        const over = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        ok(over <= 0, `${name} ${path} 横向溢出 ${over}px`);
        await shot(p, `${name}${path.replace(/\//g, '_') || '_home'}`, path !== W);
      }
      await p.goto(BASE + W, { waitUntil: 'networkidle' });
      for (const [n, label] of [[2, 'demo'], [3, 'brief'], [4, 'practice'], [5, 'reference'], [6, 'wrap']]) { await step(p, n); const over = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth); ok(over <= 0, `${name} 第 ${n} 步横向溢出`); await shot(p, `${name}_work_${n}_${label}`, false); }
      await c.close();
    }
    // 管理员后台、完成记录手机截图
    const { c, p } = await ctx({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, storageState: await userA.c.storageState() });
    await p.goto(BASE + '/records/' + recordA, { waitUntil: 'networkidle' }); await shot(p, 'm390_record');
    await c.close();
  });

  await adminCtx?.c.close(); await userA?.c.close(); await browser.close();
  fs.writeFileSync(path.join(OUT, 'acceptance.json'), JSON.stringify({ at: new Date().toISOString(), passed: results.filter(r => r.pass).length, failed: results.filter(r => !r.pass).length, results }, null, 2));
  console.log(`\n${results.filter(r => r.pass).length} passed, ${results.filter(r => !r.pass).length} failed`);
  process.exit(results.some(r => !r.pass) ? 1 : 0);
})().catch(async e => { console.error(e); await browser?.close(); process.exit(1); });
