// 部署前检查（生产构建 + 生产模式启动，模拟托管平台的持久化磁盘；由 `npm run test:deploy` 启动，分 3 个阶段，阶段之间重启服务器）。
// 不配置短信：验证访客模式、生产禁止模拟登录、访客隔离、后台权限、保存失败提示、重启后数据保留、备份与恢复。
const { chromium } = require('playwright');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs'), path = require('node:path');
const BASE = process.env.E2E_BASE, OUT = process.env.RESULTS_DIR, PHASE = Number(process.env.PHASE), SHOTS = path.join(OUT, 'shots');
const STATE = path.join(OUT, 'state.json'), W = '/experiences/ops-returns-deep/work';
fs.mkdirSync(SHOTS, { recursive: true });
const state = fs.existsSync(STATE) ? JSON.parse(fs.readFileSync(STATE, 'utf8')) : {};
const results = []; const ok = (c, m) => { if (!c) throw new Error(m); };
async function check(name, fn) { try { await fn(); results.push({ phase: PHASE, name, pass: true }); console.log('PASS', `[阶段 ${PHASE}]`, name); } catch (e) { results.push({ phase: PHASE, name, pass: false, error: String(e.message).slice(0, 500) }); console.log('FAIL', `[阶段 ${PHASE}]`, name, '\n   ', e.message); } }
const script = (name, args = []) => execFileSync(process.execPath, [process.env.TSX_CLI, path.join('scripts', name), ...args], { env: { ...process.env, NODE_NO_WARNINGS: '1' }, encoding: 'utf8' });
const api = (p, url, body) => p.evaluate(async ([url, body]) => { const s = await (await fetch('/api/session')).json(); const r = await fetch('/api/' + url, body === undefined ? { headers: { 'x-session': s.identity.stamp } } : { method: 'POST', headers: { 'content-type': 'application/json', 'x-session': s.identity.stamp }, body: JSON.stringify(body) }); let j = null; try { j = await r.json(); } catch {} return { status: r.status, body: j }; }, [url, body]);
const waitSaved = p => p.waitForFunction(() => /已保存/.test(document.querySelector('.work-head .save-state')?.textContent || ''), null, { timeout: 15000 });
async function openPractice(p) { await p.goto(BASE + W, { waitUntil: 'networkidle' }); await p.click('.stepper li:nth-child(4) button'); await p.waitForSelector('#f-p1-before'); }
async function write(p, text) { await openPractice(p); await p.fill('#f-p1-before', text); await waitSaved(p); }

(async () => {
  const b = await chromium.launch();
  const ctx = async file => { const c = await b.newContext({ viewport: { width: 1280, height: 860 }, ...(file && fs.existsSync(file) ? { storageState: file } : {}) }); const p = await c.newPage(); p.errors = []; p.on('pageerror', e => p.errors.push(e.message)); return { c, p }; };
  const files = { A: path.join(OUT, 'guestA.json'), B: path.join(OUT, 'guestB.json'), admin: path.join(OUT, 'admin.json') };

  if (PHASE === 1) {
    await check('生产模式：不开放模拟验证码；未配置短信时登录关闭，页面显示「试用版」，没有测试环境提示条', async () => {
      const { c, p } = await ctx(); await p.goto(BASE + '/', { waitUntil: 'networkidle' });
      const s = (await api(p, 'session')).body; ok(s.mock === false && s.loginAvailable === false, JSON.stringify(s));
      const code = await api(p, 'auth/code', { phone: '13900000000' }); ok(code.status === 503 && code.body.code === 'AUTH_CONFIG' && !code.body.code?.match?.(/^\d{6}$/), '获取验证码没有被拒绝：' + JSON.stringify(code));
      const login = await api(p, 'auth/login', { phone: '13900000000', code: '123456' }); ok(login.status === 503, '登录接口没有被拒绝：' + login.status);
      ok(await p.locator('.dev-bar').count() === 0, '出现测试环境提示条');
      ok(await p.locator('.site-head .badge:has-text("试用版")').count() === 1 && await p.locator('.site-head a:has-text("登录")').count() === 0, '页头仍显示登录按钮');
      ok((await p.locator('main').innerText()).includes('示例'), '演示内容没有标注示例');
      await p.screenshot({ path: path.join(SHOTS, 'deploy-home.png') }); await c.close();
    });
    await check('空数据库自动写入演示内容（只写一次，全部标为示例）', async () => {
      const { c, p } = await ctx(); await p.goto(BASE + '/', { waitUntil: 'networkidle' }); const list = (await api(p, 'content')).body;
      ok(list.length > 10 && list.every(i => i.demo === true), '演示内容缺失或没有全部标为示例');
      state.contentCount = list.length; await c.close();
    });
    await check('访客 A、B 共用同一个网址，草稿互相隔离；访客看到试用说明，没有登录 / 收藏入口', async () => {
      const A = await ctx(), B = await ctx();
      await write(A.p, 'A：备份之前写的');
      await openPractice(B.p); ok(await B.p.inputValue('#f-p1-before') === '', '访客 B 看到了 A 的作答');
      await B.p.fill('#f-p1-before', 'B：访客 B 的作答'); await waitSaved(B.p);
      await A.p.reload({ waitUntil: 'networkidle' }); await A.p.click('.stepper li:nth-child(4) button'); ok(await A.p.inputValue('#f-p1-before') === 'A：备份之前写的', '访客 A 的作答被 B 影响');
      const mineB = await api(B.p, 'mine'); ok(!JSON.stringify(mineB.body).includes('A：'), '访客 B 的「我的」包含 A 的内容');
      await A.p.click('.stepper li:nth-child(6) button'); await A.p.waitForSelector('[data-testid="trial-note"]');
      ok(await A.p.locator('a:has-text("登录后保存记录")').count() === 0, '试用版仍显示登录按钮');
      ok((await A.p.locator('[data-testid="trial-note"]').innerText()).includes('30 天'), '没有说明保存范围');
      await A.p.screenshot({ path: path.join(SHOTS, 'deploy-trial-note.png'), fullPage: false });
      await A.p.goto(BASE + '/jobs/j1', { waitUntil: 'networkidle' }); ok(await A.p.locator('button:has-text("收藏")').count() === 0 && (await A.p.locator('main').innerText()).includes('收藏功能暂不可用'), '收藏入口没有关闭');
      await A.p.goto(BASE + '/me', { waitUntil: 'networkidle' }); ok((await A.p.locator('main').innerText()).includes('试用期间暂未开放登录'), '「我的」没有试用说明');
      await A.p.screenshot({ path: path.join(SHOTS, 'deploy-me.png'), fullPage: true });
      ok(A.p.errors.length + B.p.errors.length === 0, '页面脚本错误：' + [...A.p.errors, ...B.p.errors].join(' | '));
      await A.c.storageState({ path: files.A }); await B.c.storageState({ path: files.B }); await A.c.close(); await B.c.close();
    });
    await check('保存失败时有明确提示，网络恢复后自动保存', async () => {
      const { c, p } = await ctx(files.A); await openPractice(p);
      await p.route('**/api/drafts/**', r => r.request().method() === 'POST' ? r.abort('internetdisconnected') : r.continue());
      await p.fill('#f-p2-when', '断网时写的');
      await p.waitForFunction(() => /网络中断/.test(document.querySelector('.work-head .save-state')?.textContent || ''), null, { timeout: 10000 });
      await p.screenshot({ path: path.join(SHOTS, 'deploy-save-failed.png'), fullPage: false });
      await p.unroute('**/api/drafts/**'); await p.click('button:has-text("立即重试")'); await waitSaved(p);
      ok((await api(p, 'drafts/ops-returns-deep')).body.answers['p2.when'] === '断网时写的', '恢复后没有保存到服务器');
      await c.storageState({ path: files.A }); await c.close();
    });
    await check('后台权限：访客打不开后台；一次性链接只在服务器生成、只能用一次；管理员入口只对管理员显示', async () => {
      const g = await ctx(); await g.p.goto(BASE + '/admin', { waitUntil: 'networkidle' });
      ok((await g.p.locator('h1').innerText()).includes('没有访问权限'), '访客打开了后台');
      ok([401, 403].includes((await api(g.p, 'admin')).status), '访客能读取后台接口');
      ok(await g.p.locator('a:has-text("内部后台")').count() === 0, '访客看到了后台入口');
      await g.p.goto(BASE + '/login/link', { waitUntil: 'networkidle' }); ok((await g.p.locator('main').innerText()).includes('链接不完整'), '没有口令也显示登录按钮');
      ok((await api(g.p, 'auth/link', { token: 'x'.repeat(43) })).status === 400, '伪造口令没有被拒绝');
      const out = script('admin-link.ts', ['13900000099']); const link = out.match(/https?:\/\/\S+\/login\/link#\S+/)?.[0];
      ok(link && link.startsWith(BASE), '没有生成链接：' + out);
      const a = await ctx(); await a.p.goto(link, { waitUntil: 'networkidle' });
      ok(!a.p.url().includes('#'), '口令仍留在地址栏'); await a.p.click('button:has-text("以管理员身份登录")'); await a.p.waitForURL('**/admin'); await a.p.waitForSelector('h1:has-text("内部后台")');
      ok(await a.p.locator('a:has-text("内部后台")').count() === 1, '管理员看不到后台入口');
      await a.p.screenshot({ path: path.join(SHOTS, 'deploy-admin.png'), fullPage: false });
      const again = await ctx(); await again.p.goto(link, { waitUntil: 'networkidle' }); await again.p.click('button:has-text("以管理员身份登录")');
      await again.p.waitForSelector('.err:has-text("已经用过")'); await again.c.close();
      await a.c.storageState({ path: files.admin }); await a.c.close(); await g.c.close();
    });
    await check('在线备份（网站运行中执行）', async () => {
      const out = script('backup.ts'); const file = out.match(/备份完成：(.+\.sqlite)/)?.[1]; ok(file && fs.existsSync(file), '备份失败：' + out);
      state.backup = file;
      const { c, p } = await ctx(files.A); await write(p, 'A：备份之后改的'); await c.storageState({ path: files.A }); await c.close();
    });
  }
  if (PHASE === 2) {
    await check('服务器重启后：访客草稿、管理员会话、内容都还在，演示内容没有重复写入', async () => {
      const A = await ctx(files.A); await openPractice(A.p); ok(await A.p.inputValue('#f-p1-before') === 'A：备份之后改的', '重启后访客 A 的草稿丢失');
      const B = await ctx(files.B); await openPractice(B.p); ok(await B.p.inputValue('#f-p1-before') === 'B：访客 B 的作答', '重启后访客 B 的草稿丢失');
      const ad = await ctx(files.admin); await ad.p.goto(BASE + '/admin', { waitUntil: 'networkidle' }); ok((await ad.p.locator('h1').innerText()).includes('内部后台'), '重启后管理员会话丢失');
      ok((await api(ad.p, 'content')).body.length === state.contentCount, '演示内容被重复写入或丢失');
      for (const x of [A, B, ad]) await x.c.close();
    });
    await check('准备从备份恢复（只放到待恢复位置，网站继续运行）', async () => {
      const out = script('restore.ts', [state.backup]); ok(out.includes('已准备恢复'), out);
      const { c, p } = await ctx(files.A); await openPractice(p); ok(await p.inputValue('#f-p1-before') === 'A：备份之后改的', '恢复命令立刻改动了正在运行的数据库'); await c.close();
    });
  }
  if (PHASE === 3) {
    await check('重启后完成恢复：数据回到备份时的状态，原数据库另存，没有删除', async () => {
      const A = await ctx(files.A); await openPractice(A.p); ok(await A.p.inputValue('#f-p1-before') === 'A：备份之前写的', '没有恢复到备份时的内容');
      const dbDir = path.dirname(process.env.DATABASE_PATH); ok(fs.readdirSync(dbDir).some(f => f.includes('.before-restore-')), '恢复前的数据库没有另存');
      await A.c.close();
    });
  }
  await b.close();
  const all = fs.existsSync(path.join(OUT, 'deploy.json')) ? JSON.parse(fs.readFileSync(path.join(OUT, 'deploy.json'), 'utf8')).results : [];
  fs.writeFileSync(path.join(OUT, 'deploy.json'), JSON.stringify({ at: new Date().toISOString(), mode: 'production (next build + next start, NODE_ENV=production, 未配置短信)', results: [...all.filter(r => r.phase !== PHASE), ...results] }, null, 2));
  fs.writeFileSync(STATE, JSON.stringify(state));
  process.exit(results.every(r => r.pass) ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
