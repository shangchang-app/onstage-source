// 生产构建截图与核对（由 `npm run test:e2e:screens` 启动；生产模式，不配置短信，不开放模拟登录）。
// 页面内容来自独立测试库里的演示数据（全部标为「示例」）。只截不需要登录的页面；游客也可以开始岗位体验。
const { chromium } = require('playwright');
const fs = require('node:fs'), path = require('node:path');
const BASE = process.env.E2E_BASE, OUT = process.env.RESULTS_DIR, SHOTS = path.join(OUT, 'shots');
fs.mkdirSync(SHOTS, { recursive: true });
const results = [];
const ok = (c, m) => { if (!c) throw new Error(m); };
async function check(name, fn) { try { await fn(); results.push({ name, pass: true }); console.log('PASS', name); } catch (e) { results.push({ name, pass: false, error: String(e.message).slice(0, 400) }); console.log('FAIL', name, e.message); } }
const W = '/experiences/ops-returns-deep/work';
(async () => {
  const b = await chromium.launch();
  await check('生产模式：未配置短信时登录被拒绝，不回退到模拟验证码', async () => {
    const c = await b.newContext(); const p = await c.newPage(); await p.goto(BASE + '/login', { waitUntil: 'networkidle' });
    const r = await p.evaluate(async () => { const s = await (await fetch('/api/session')).json(); const code = await fetch('/api/auth/code', { method: 'POST', headers: { 'content-type': 'application/json', 'x-session': s.identity.stamp }, body: JSON.stringify({ phone: '13900000000' }) }); return { s, status: code.status, body: await code.json() }; });
    ok(r.s.mock === false && r.s.loginAvailable === false, '会话接口显示可以模拟登录：' + JSON.stringify(r.s));
    ok(r.status === 503 && r.body.code === 'AUTH_CONFIG' && !('code' in r.body && /^\d{6}$/.test(r.body.code)), '获取验证码没有被拒绝：' + JSON.stringify(r));
    ok(await p.locator('.dev-bar').count() === 0, '生产页面出现了测试环境提示条');
    ok((await p.locator('main').innerText()).includes('登录服务暂不可用'), '登录页没有说明不可用');
    await p.screenshot({ path: path.join(SHOTS, 'prod-desktop_login.png'), fullPage: true }); await c.close();
  });
  const pages = ['/', '/experiences', '/experiences/ops-returns', '/experiences/ops-returns/work', '/experiences/ops-returns-deep', W, '/experiences/yc-quick/work', '/jobs', '/jobs/j1', '/events', '/companies/yc', '/cooperate', '/me'];
  for (const [name, w, h, dsf] of [['desktop', 1280, 860, 1], ['m390', 390, 844, 2], ['m320', 320, 640, 2]]) {
    await check(`生产页面截图 ${name}：无脚本错误、无横向溢出`, async () => {
      const c = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dsf }); const p = await c.newPage();
      const errs = []; p.on('pageerror', e => errs.push(e.message));
      for (const u of pages) {
        await p.goto(BASE + u, { waitUntil: 'networkidle' }); await p.waitForTimeout(250);
        const over = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        ok(over <= 0, `${u} 横向溢出 ${over}px`);
        await p.screenshot({ path: path.join(SHOTS, `prod-${name}${u.replace(/\//g, '_') || '_home'}.png`), fullPage: u !== W });
      }
      // 作答页：第 4 步；手机上打开材料抽屉
      await p.goto(BASE + W, { waitUntil: 'networkidle' }); await p.click('.stepper li:nth-child(4) button'); await p.waitForTimeout(300);
      await p.screenshot({ path: path.join(SHOTS, `prod-${name}_work_practice.png`), fullPage: false });
      const side = await p.evaluate(() => { const e = document.querySelector('.work-side'); return e ? e.scrollWidth - e.clientWidth : 0; }); ok(side <= 0, `作答页侧栏横向溢出 ${side}px`);
      if (w < 960) { await p.click('.mobile-tools button:has-text("查看材料")'); await p.waitForSelector('[role="dialog"]'); await p.waitForTimeout(200); await p.screenshot({ path: path.join(SHOTS, `prod-${name}_work_materials.png`) }); }
      ok(errs.length === 0, '页面脚本错误：' + errs.join(' | '));
      await c.close();
    });
  }
  await b.close();
  fs.writeFileSync(path.join(OUT, 'screens.json'), JSON.stringify({ at: new Date().toISOString(), mode: 'production (next build + next start)', results }, null, 2));
  process.exit(results.every(r => r.pass) ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
