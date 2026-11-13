// V1.8 短实践回归检查（试玩版静态网站）：动物结果 → 短实践 → 即时反馈 → 复盘 → 轻量反馈 → 保存成果 → 我的 → 完整版。
// 用法：npm run build:static && node tests/e2e/short-check.cjs dist-pages
// 另查：390px 布局（不横向滚动）、只用键盘完成、刷新恢复、旧数据兼容、反馈只存本机并能导出。截图在 test-results/short/screens。
const { chromium } = require('playwright');
const http = require('node:http'), fs = require('node:fs'), path = require('node:path'), net = require('node:net');
const { spawnSync } = require('node:child_process');
const ROOT = path.resolve(process.argv[2] || 'dist-pages'), BASE = (process.env.PAGES_BASE ?? '/onstage').replace(/\/+$/, '');
const OUT = path.join('test-results', 'short'), SHOTS = path.join(OUT, 'screens'); fs.mkdirSync(SHOTS, { recursive: true });
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.txt': 'text/plain; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2' };
function serve(req, res) {
  const u = new URL(req.url, 'http://x'); let p = decodeURIComponent(u.pathname);
  if (!p.startsWith(BASE + '/') && p !== BASE) { res.writeHead(404); return res.end('not found'); }
  p = p.slice(BASE.length) || '/'; let file = path.join(ROOT, p);
  if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) { if (!p.endsWith('/')) { res.writeHead(301, { location: BASE + p + '/' + u.search }); return res.end(); } file = path.join(file, 'index.html'); }
  if (!fs.existsSync(file)) { res.writeHead(404, { 'content-type': TYPES['.html'] }); return fs.createReadStream(path.join(ROOT, '404.html')).pipe(res); }
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' }); fs.createReadStream(file).pipe(res);
}
const freePort = () => new Promise(ok => { const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => ok(p)); }); });
const results = []; const ok = (c, m) => { if (!c) throw new Error(m); };
async function check(name, fn) { const t = Date.now(); try { await fn(); results.push({ name, pass: true, ms: Date.now() - t }); console.log('PASS', name); } catch (e) { results.push({ name, pass: false, error: String(e.message).slice(0, 600) }); console.log('FAIL', name, '\n   ', e.message); } }

const DATA = JSON.parse(fs.readFileSync(path.join(ROOT, 'static-data.json'), 'utf8'));
const AI = 'ai-answer-check', GROWTH = 'growth-feedback';
const opts = id => DATA.guides[id].data.guide.practice[0].fields.find(f => f.id === 'plan.actions').options;
const best = id => Object.entries(DATA.guides[id].data.guide.quick.actions).find(([, v]) => v.tone === 'strong')[0];
const P = JSON.parse(spawnSync(process.execPath, [require.resolve('tsx/cli'), 'scripts/buddy-paths.ts'], { encoding: 'utf8', env: { ...process.env, NODE_NO_WARNINGS: '1' } }).stdout);
const SCORE = /得分|分数：|正确率|你的能力|你适合做|你不适合|擅长|天赋/;
const FAKE_SENT = /已发送给平台|已提交给平台|提交成功|已收到你的反馈|感谢您的反馈，我们会/;

(async () => {
  const port = await freePort(); const server = http.createServer(serve).listen(port, '127.0.0.1');
  const SITE = `http://127.0.0.1:${port}${BASE}`;
  const b = await chromium.launch();
  const mobile = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
  const ctx = async (o = {}) => { const c = await b.newContext({ viewport: { width: 1280, height: 860 }, acceptDownloads: true, ...o }); const p = await c.newPage(); p.errors = []; p.on('pageerror', e => p.errors.push(e.message)); p.on('console', m => { if (m.type() === 'error') p.errors.push(m.text()); }); return { c, p }; };
  const noScroll = async (p, where) => { const w = await p.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth })); ok(w.sw <= w.iw + 1, `${where}：390px 下出现横向滚动（${w.sw} > ${w.iw}）`); };
  const saved = p => p.waitForFunction(() => /已保存/.test(document.querySelector('.work-head .save-state')?.textContent || ''), null, { timeout: 15000 });
  const shot = (p, name, full = true) => p.screenshot({ path: path.join(SHOTS, name + '.png'), fullPage: full });
  const runBuddy = async (p, role) => {
    await p.goto(SITE + '/buddy/', { waitUntil: 'networkidle' }); await p.getByRole('button', { name: '开始' }).click(); await p.waitForSelector('.bd-opts');
    for (let i = 0; i < role.answers.length; i++) { await p.locator('.bd-opt', { hasText: role.answers[i] }).click(); await p.locator('.bd-nav .btn-primary').click(); if (i < role.answers.length - 1) await p.waitForSelector(`.bd-progress >> text=${i + 2} / 8`); }
    await p.waitForSelector('.bd-result h1'); await p.waitForSelector('.bd-rec-card');
  };

  await check('动物结果的推荐：13 个结果都是「第一入口短实践 → 第二入口完整实践」，标明时间和能学到什么；不把动物说成职业能力或限制', async () => {
    const quick = Object.values(DATA.content).filter(c => c.kind === 'experience');
    for (const r of P.roles) {
      const a = DATA.content[r.rec], f = DATA.content[r.full];
      ok(a && a.data.format === 'guided' && a.data.guideSummary?.quick && a.data.minutes <= 10, `${r.name} 的第一入口不是短实践：${r.rec}`);
      ok(f && f.data.format === 'guided' && !f.data.guideSummary?.quick, `${r.name} 的第二入口不是完整实践：${r.full}`);
      ok(a.data.guideSummary.deep === r.full, `${r.name}：短实践做完推荐的完整版（${a.data.guideSummary.deep}）和第二入口（${r.full}）不一致`);
    }
    ok(quick.length >= 3, '体验数量不对');
    const { c, p } = await ctx(mobile); const role = P.roles.find(r => r.rec === AI); await runBuddy(p, role);
    const cards = p.locator('.bd-rec-card'); ok(await cards.count() === 2, '应有两张推荐卡');
    const [t1, t2] = await cards.allInnerTexts();
    ok((await cards.nth(0).getAttribute('data-kind')) === 'quick' && t1.includes('第一步') && t1.includes('短实践') && /约 [5-8] 分钟/.test(t1) && t1.includes('能学到'), '第一入口不对：' + t1);
    ok((await cards.nth(1).getAttribute('data-kind')) === 'deep' && t2.includes('第二步') && t2.includes('完整实践') && t2.includes('能学到'), '第二入口不对：' + t2);
    const note = await p.getByTestId('rec-note').innerText(); ok(note.includes('不代表你适合或不适合'), '缺少「推荐不代表适合与否」的说明');
    ok(!SCORE.test((await p.locator('.bd-rec').innerText()).replace(note, '')), '推荐里出现了能力 / 适合度的说法');
    await noScroll(p, '动物结果'); await shot(p, 's01-手机-动物结果两级推荐');
    ok(p.errors.length === 0, p.errors.join(' | ')); await c.close();
  });

  await check('全链路（390px，AI 短实践）：动物结果 → 短实践 → 看材料 → 选一项看即时反馈 → 改选 → 刷新恢复 → 写修改建议 → 复盘 → 保存成果 → 轻量反馈 → 我的 → 完整版', async () => {
    const { c, p } = await ctx(mobile); const role = P.roles.find(r => r.rec === AI); await runBuddy(p, role);
    await p.locator('.bd-rec-card[data-kind="quick"]').click(); await p.waitForURL(`**/experiences/${AI}/`); await p.waitForSelector('main h1');
    const detail = await p.locator('main').innerText();
    ok(detail.includes('看对话和规则') && detail.includes('选一句并说明') && detail.includes('约 6 分钟'), '详情页没有写短实践的流程和时间');
    ok((await p.getByTestId('detail-next-full').innerText()).includes('完整实践'), '详情页没有说明做完可以接完整版');
    await shot(p, 's02-手机-短实践详情'); await noScroll(p, '短实践详情');
    await p.locator(`main a.btn-primary[href*="/experiences/${AI}/work"]`).click(); await p.waitForSelector('.quick');
    const s0 = await p.locator('.quick').innerText(); ok(s0.includes('教学模拟') && s0.includes('不是任何真实 AI'), '第 1 步没有标注教学模拟');
    await noScroll(p, '第 1 步'); await shot(p, 's03-手机-收到任务');
    await p.getByRole('button', { name: /开始：去看材料/ }).click(); await p.waitForSelector('.mats');
    for (const t of ['退换货规则（节选）', '这位用户的订单']) await p.locator('.matc-h button', { hasText: t }).click();
    await noScroll(p, '第 2 步'); await shot(p, 's04-手机-看材料');
    await p.getByRole('button', { name: '选一句并说明 →' }).click(); await p.waitForSelector('#f-plan-actions');
    const [o1, o2, o3] = opts(AI); ok(best(AI) === o2, '参考里最先改的应是第 2 句');
    ok(await p.getByTestId('pick-show-feedback').isDisabled(), '没选、没写理由时不应能看反馈');
    await p.locator('label.choice', { hasText: o3 }).click(); await p.locator('#f-plan-reason').fill('到账时间和规则第 5 条不一样');
    await p.getByTestId('pick-show-feedback').click(); const fb1 = p.getByTestId('pick-feedback'); await fb1.waitFor();
    const f1 = await fb1.innerText(); ok(f1.includes('为什么') && f1.includes('要权衡的') && f1.includes('不是 AI 点评') && !SCORE.test(f1), '即时反馈不对：' + f1);
    const box = await fb1.boundingBox(); ok(box && box.width <= 390, '反馈卡超出屏幕宽度');
    await fb1.scrollIntoViewIfNeeded(); await shot(p, 's05-手机-即时反馈-改选前', false);
    await p.locator('label.choice', { hasText: o2 }).click(); ok(await p.getByTestId('pick-feedback').count() === 0, '改选后不应继续显示上一项的反馈');
    await p.getByTestId('pick-show-feedback').click(); ok((await p.getByTestId('pick-feedback').innerText()).includes('依据最充分'), '第 2 句的反馈不对');
    await saved(p);
    // 刷新：停在第 3 步，选择、理由和反馈都还在
    await p.reload({ waitUntil: 'networkidle' }); await p.waitForSelector('#f-plan-actions');
    ok(await p.locator(`input[name="pick"][value="${o2}"]`).isChecked(), '刷新后选择丢了');
    ok((await p.locator('#f-plan-reason').inputValue()) === '到账时间和规则第 5 条不一样', '刷新后理由丢了');
    ok(await p.getByTestId('pick-feedback').count() === 1, '刷新后已看过的反馈应还在');
    await p.locator('#f-plan-follow').fill('把「拆封也能无理由退」改成「拆封的耳机不能无理由退，有质量问题可以申请检测」');
    await noScroll(p, '第 3 步'); await shot(p, 's06-手机-选择理由与修改建议');
    await p.getByRole('button', { name: '提交，看复盘 →' }).click(); await p.waitForSelector('#rv-mine');
    const rv = await p.locator('.quick').innerText();
    ok((await p.getByTestId('pick-first').innerText()).includes(o3), '复盘没记下第一次看反馈的选项');
    ok(rv.includes('到账时间和规则第 5 条不一样') && rv.includes('拆封的耳机不能无理由退'), '复盘没有原样展示你写的内容');
    ok(rv.includes('没有接入 AI') && rv.includes('不打分') && !SCORE.test(rv.replace(/不评价你适不适合这个方向|说明不了你适不适合这个方向/g, '')), '复盘里的说明不对');
    ok(rv.includes('问题出在哪') && rv.includes('一种改法'), '参考复盘的小标题不对');
    await noScroll(p, '复盘'); await shot(p, 's07-手机-复盘');
    // 保存成果
    await p.click('[data-testid="save-work"]'); await p.waitForSelector('.out-side .ok-box'); ok((await p.locator('.out-side .ok-box').innerText()).includes('已保存到本机'), '成果没有保存');
    // 轻量反馈：只存本机，不假装发送
    const fb = p.getByTestId('feedback-box'); ok((await p.getByTestId('feedback-scope').innerText()).includes('不会自动发送给平台'), '没有说明反馈只存本机');
    ok(await p.getByTestId('feedback-save').isDisabled(), '没选时不应能保存反馈');
    await fb.locator('label.choice', { hasText: '太难' }).click(); await fb.locator('textarea').fill('第 2 份材料条款有点多');
    await p.getByTestId('feedback-save').click(); const fbMsg = await fb.locator('.ok-box').innerText();
    ok(fbMsg.includes('已保存在这台设备上') && fbMsg.includes('没有发送给平台') && !FAKE_SENT.test(fbMsg), '反馈保存后的提示不对：' + fbMsg);
    await fb.scrollIntoViewIfNeeded(); await shot(p, 's08-手机-轻量反馈', false);
    const next = p.getByTestId('next-full'); const nt = await next.innerText();
    ok((await next.getAttribute('href')).endsWith('/experiences/ai-eval') || (await next.getAttribute('href')).endsWith('/experiences/ai-eval/'), '复盘推荐的完整版不对');
    ok(nt.includes('完整实践') && nt.includes('会进一步学'), '复盘没有说明完整版会学什么：' + nt);
    // 我的
    await p.goto(SITE + '/me/', { waitUntil: 'networkidle' }); await p.waitForSelector(`[data-testid="draft-${AI}"]`);
    const row = p.getByTestId('draft-' + AI); ok((await row.getByTestId('practice-state').innerText()).startsWith('已完成实践'), '我的里没有显示已完成实践');
    const nf = row.getByTestId('me-next-full'); ok((await nf.innerText()).includes('完整实践'), '我的里没有推荐完整版');
    ok(await p.locator('.list-row', { hasText: 'AI 回答检查单' }).count() === 1, '我的成果里没有这份成果');
    const frow = p.getByTestId('feedback-row'); ok(await frow.count() === 1 && (await frow.innerText()).includes('太难') && (await frow.innerText()).includes('未发送'), '我的反馈里没有这条反馈');
    const [dl] = await Promise.all([p.waitForEvent('download'), p.getByTestId('feedback-export').click()]);
    const exp = JSON.parse(fs.readFileSync(await dl.path(), 'utf8')); ok(exp.items.length === 1 && exp.items[0].rating === 'hard' && exp.items[0].sent === false && exp.note.includes('没有发送给平台'), '导出的反馈不对');
    const [bk] = await Promise.all([p.waitForEvent('download'), p.getByRole('button', { name: '导出备份' }).click()]);
    const backup = JSON.parse(fs.readFileSync(await bk.path(), 'utf8')); ok(backup.feedback?.length === 1 && backup.works.length === 1, '备份里应包含成果和反馈');
    await noScroll(p, '我的'); await shot(p, 's09-手机-我的');
    await p.locator('.list-row', { hasText: 'AI 回答检查单' }).locator('a:has-text("打开")').click(); await p.waitForSelector('.work-card');
    const w = await p.locator('.work-card').innerText(); ok(w.includes('教学模拟作品') && w.includes('拆封的耳机不能无理由退') && w.includes(o2), '重新打开的成果内容不对');
    await p.goBack(); await p.waitForSelector(`[data-testid="draft-${AI}"]`);
    await p.getByTestId('draft-' + AI).getByTestId('me-next-full').locator('a').click(); await p.waitForURL('**/experiences/ai-eval/'); await p.waitForSelector('main h1');
    ok((await p.locator('main h1').innerText()).includes('4 个 AI 回答'), '没有打开完整版');
    await shot(p, 's10-手机-完整版详情');
    ok(p.errors.length === 0, p.errors.join(' | ')); await c.close();
  });

  await check('出海短实践只用键盘完成（Tab / 回车 / 方向键 / 空格），每一步焦点落在标题上，390px 不横向滚动', async () => {
    const { c, p } = await ctx(mobile);
    await p.goto(`${SITE}/experiences/${GROWTH}/work/`, { waitUntil: 'networkidle' }); await p.waitForSelector('.quick');
    const tabTo = async (pred, max = 60) => { for (let i = 0; i < max; i++) { await p.keyboard.press('Tab'); if (await p.evaluate(pred)) return; } throw new Error('Tab 找不到目标：' + pred); };
    const headFocused = () => p.waitForFunction(() => document.activeElement?.id === 'q-h');
    ok((await p.locator('.quick').innerText()).includes('教学模拟'), '没有标注教学模拟'); await noScroll(p, '出海第 1 步');
    await tabTo(() => /开始：去看材料/.test(document.activeElement?.textContent || '')); await p.keyboard.press('Enter'); await headFocused();
    await tabTo(() => /注册漏斗/.test(document.activeElement?.textContent || '') && document.activeElement?.tagName === 'BUTTON'); await p.keyboard.press('Enter');
    ok(await p.locator('.matc-b table').count() === 1, '用回车没有打开材料'); await noScroll(p, '出海第 2 步'); await shot(p, 'g01-手机-出海看材料');
    await tabTo(() => /选问题并写验证办法 →/.test(document.activeElement?.textContent || '')); await p.keyboard.press('Enter'); await headFocused();
    const [o1, o2] = opts(GROWTH); ok(best(GROWTH) === o1, '出海参考答案应是验证码问题');
    await tabTo(() => document.activeElement?.getAttribute('name') === 'pick'); await p.keyboard.press('Space');
    await p.keyboard.press('ArrowDown'); ok(await p.locator(`input[name="pick"][value="${o2}"]`).isChecked(), '方向键没有改选');
    await p.keyboard.press('ArrowUp'); ok(await p.locator(`input[name="pick"][value="${o1}"]`).isChecked(), '方向键没有改回');
    await p.keyboard.press('Tab'); ok(await p.evaluate(() => document.activeElement?.id === 'f-plan-reason'), '选项之后应是理由输入框');
    await p.keyboard.type('三条反馈和漏斗都指向验证码');
    await p.keyboard.press('Tab'); ok(await p.evaluate(() => document.activeElement?.getAttribute('data-testid') === 'pick-show-feedback'), '理由之后应是「看反馈」按钮');
    await p.keyboard.press('Enter'); await p.getByTestId('pick-feedback').waitFor(); ok((await p.getByTestId('pick-feedback').innerText()).includes('依据最充分'), '键盘看反馈不对');
    await tabTo(() => document.activeElement?.id === 'f-plan-follow'); await p.keyboard.type('用 20 个马来西亚和菲律宾号码各注册一次，看收到验证码的比例，低于 90% 就说明问题成立');
    await noScroll(p, '出海第 3 步'); await shot(p, 'g02-手机-出海选择与验证办法');
    await tabTo(() => /提交，看复盘/.test(document.activeElement?.textContent || '')); await p.keyboard.press('Enter'); await headFocused();
    await p.waitForSelector('#rv-mine'); ok((await p.locator('.quick').innerText()).includes('一种验证办法'), '出海复盘的小标题不对');
    await tabTo(() => document.activeElement?.getAttribute('data-testid') === 'save-work'); await p.keyboard.press('Enter'); await p.waitForSelector('.out-side .ok-box');
    await tabTo(() => document.activeElement?.getAttribute('name') === 'fb-' + 'growth-feedback'); await p.keyboard.press('Space');
    await tabTo(() => document.activeElement?.getAttribute('data-testid') === 'feedback-save'); await p.keyboard.press('Enter');
    ok((await p.getByTestId('feedback-box').locator('.ok-box').innerText()).includes('没有发送给平台'), '键盘保存反馈不对');
    await noScroll(p, '出海复盘'); await shot(p, 'g03-手机-出海复盘');
    ok(p.errors.length === 0, p.errors.join(' | ')); await c.close();
  });

  await check('旧数据兼容：升级前的原短版草稿（多选行动）照常继续、复盘里多了轻量反馈；旧版备份（没有反馈）能导入；短实践里不合法的旧选择要求重新确认', async () => {
    const { c, p } = await ctx(mobile);
    const v = DATA.guides['ops-returns'].version, va = DATA.guides[AI].version;
    const acts = Object.keys(DATA.guides['ops-returns'].data.guide.quick.actions).slice(0, 2);
    const db = { owner: 'local:old', schema: 2, recoveries: [], drafts: {
      'ops-returns': { owner: 'local:old', content_id: 'ops-returns', version: 3, content_version: v, conflict: 0, conflict_with: null, saved_at: '2026-11-10T08:00:00.000Z', answers: { 'plan.actions': acts, 'plan.reason': '升级前写的理由' }, progress: { step: 3, visited: [0, 1, 2, 3], referenceViewed: true, hintsOpened: [] } },
      [AI]: { owner: 'local:old', content_id: AI, version: 1, content_version: va, conflict: 0, conflict_with: null, saved_at: '2026-11-10T08:00:00.000Z', answers: { 'plan.actions': opts(AI).slice(0, 2), 'plan.reason': '旧的' }, progress: { step: 2, visited: [0, 1, 2], referenceViewed: false, hintsOpened: [] } } } };
    const works = { schema: 1, works: [{ id: 'w-old', label: '教学模拟作品', experienceId: 'ops-returns', experienceTitle: '旧成果', direction: '跨境电商运营', outputTitle: '行动方案', contentVersion: v, createdAt: '2026-11-10T08:00:00.000Z', updatedAt: '2026-11-10T08:00:00.000Z', sections: [{ heading: '理由', items: [{ label: '理由', text: '升级前写的理由' }] }], before: null, revisions: [] }] };
    await p.goto(SITE + '/', { waitUntil: 'networkidle' });
    await p.evaluate(([d, w]) => { localStorage.setItem('onstage-free:v1', d); localStorage.setItem('onstage-works:v1', w); localStorage.setItem('onstage:migrated:v16', '1'); }, [JSON.stringify(db), JSON.stringify(works)]);
    await p.goto(SITE + '/experiences/ops-returns/work/', { waitUntil: 'networkidle' }); await p.waitForSelector('#rv-mine');
    const t = await p.locator('.quick').innerText(); ok(t.includes('升级前写的理由') && acts.every(a => t.includes(a)), '原短版旧草稿没有原样恢复');
    ok(await p.getByTestId('feedback-box').count() === 1, '原短版复盘页也应有轻量反馈');
    await p.goto(`${SITE}/experiences/${AI}/work/`, { waitUntil: 'networkidle' }); await p.waitForSelector('#f-plan-actions');
    ok(await p.getByTestId('legacy-plan.actions').count() === 1, '多选的旧作答应提示重新确认'); ok(await p.locator('input[name="pick"]:checked').count() === 0, '不应替用户选');
    ok(await p.getByRole('button', { name: '提交，看复盘 →' }).isDisabled(), '没有重新确认前不应能提交');
    const stored = await p.evaluate(() => JSON.parse(localStorage.getItem('onstage-free:v1')).drafts['ai-answer-check'].answers['plan.actions']); ok(stored.length === 2, '旧作答不应被静默改掉');
    await shot(p, 's11-手机-旧选择重新确认');
    // 旧版备份：没有 feedback 字段
    await p.goto(SITE + '/me/', { waitUntil: 'networkidle' }); await p.waitForSelector('#h-works');
    ok(await p.locator('.list-row', { hasText: '旧成果' }).count() === 1, '升级前的成果不见了');
    const oldBackup = { format: 'onstage-backup', version: 1, exportedAt: '2026-11-01T00:00:00.000Z', works: [{ ...works.works[0], id: 'w-import', experienceId: 'ops-returns-deep', experienceTitle: '导入的成果', outputTitle: '问题诊断与行动建议卡' }], drafts: [] };
    await p.setInputFiles('#import-file', { name: 'old.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(oldBackup)) });
    const msg = await p.locator('.ok-box').first().innerText(); ok(msg.includes('导入完成') && msg.includes('新增 1 份成果'), '旧版备份导入失败：' + msg);
    ok(await p.getByTestId('feedback-row').count() === 0, '旧备份不应凭空多出反馈');
    ok(p.errors.length === 0, p.errors.join(' | ')); await c.close();
  });

  await check('桌面宽度：复盘页的反馈、成果、完整版入口都在，截图留档', async () => {
    const { c, p } = await ctx();
    await p.goto(`${SITE}/experiences/${GROWTH}/work/`, { waitUntil: 'networkidle' }); await p.waitForSelector('.quick');
    await p.getByRole('button', { name: /开始：去看材料/ }).click(); await p.getByRole('button', { name: '选问题并写验证办法 →' }).click();
    await p.locator('label.choice', { hasText: opts(GROWTH)[1] }).click(); await p.locator('#f-plan-reason').fill('有两条说贵');
    await p.getByTestId('pick-show-feedback').click(); await p.getByTestId('pick-feedback').waitFor();
    ok((await p.getByTestId('pick-feedback').innerText()).includes('有道理，但不是最先要做的'), '价格选项的反馈不对');
    await shot(p, 'd01-桌面-出海即时反馈', false);
    await p.locator('#f-plan-follow').fill('先做一次小范围价格测试'); await p.getByRole('button', { name: '提交，看复盘 →' }).click(); await p.waitForSelector('#rv-mine');
    ok(await p.getByTestId('next-full').count() === 1 && await p.getByTestId('feedback-box').count() === 1, '复盘页缺少反馈或完整版入口');
    await shot(p, 'd02-桌面-出海复盘');
    ok(p.errors.length === 0, p.errors.join(' | ')); await c.close();
  });

  await b.close(); server.close();
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2));
  const passed = results.filter(r => r.pass).length; console.log(`\n${passed}/${results.length} 通过`);
  process.exit(passed === results.length ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
