#!/usr/bin/env node
/* 浏览器验收运行器（Windows / macOS / Linux 通用，只用 Node，不依赖 Bash 或全局安装的工具）。

   npm run test:e2e                 开发 / 测试环境验收：模拟短信、独立测试库，跑全部浏览器用例
   npm run test:e2e:screens         生产构建截图：next build + next start，生产模式，不开放模拟登录
   npm run test:deploy              部署前检查：生产模式 + 模拟持久化磁盘，3 个阶段之间重启服务器（数据保留、备份恢复、访客隔离、后台权限）
   可选参数：--port=3300 指定端口（被占用会直接失败）；--timeout=20 总超时分钟数；--keep 保留测试库和日志目录；
             --no-isolation-check 不做「不影响其他服务」自检。

   保证：
   - 测试库建在系统临时目录，不读写 data/ 下你的开发或正式数据库；
   - 使用独立构建目录（.next-e2e / .next-e2e-prod），不影响你自己开着的 npm run dev；
   - 只结束本次启动的子进程（按进程号，不按进程名）；
   - 启动失败、测试失败、超时都返回非零退出码，并清理本次进程。 */
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, existsSync, createWriteStream } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import net from 'node:net';
import http from 'node:http';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const require = createRequire(join(root, 'package.json'));
const args = Object.fromEntries(process.argv.slice(2).map(a => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true]; }));
const mode = args.mode || 'acceptance';
const timeoutMin = Number(args.timeout || (mode === 'acceptance' ? 20 : 15));
const results = join(root, 'test-results', mode); mkdirSync(join(results, 'shots'), { recursive: true });
const tmp = mkdtempSync(join(tmpdir(), 'onstage-e2e-'));
const dbPath = join(tmp, 'e2e.sqlite');
const tsxCli = require.resolve('tsx/cli'), nextBin = require.resolve('next/dist/bin/next');
const children = new Set();
const log = (...m) => console.log('[e2e]', ...m);

/* ---------- 进程管理：只处理本次启动的子进程 ---------- */
function start(name, cmdArgs, env, opts = {}) {
  const out = createWriteStream(join(results, name + '.log'));
  const child = spawn(process.execPath, cmdArgs, { cwd: root, env: { ...process.env, ...env }, detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'], ...opts });
  child.stdout.pipe(out); child.stderr.pipe(out);
  if (opts.echo) { child.stdout.pipe(process.stdout); child.stderr.pipe(process.stderr); }
  children.add(child); child.on('exit', () => children.delete(child));
  return child;
}
function kill(child) {
  if (!child || child.exitCode !== null || child.signalCode) return;
  try {
    if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    else { process.kill(-child.pid, 'SIGTERM'); setTimeout(() => { try { process.kill(-child.pid, 'SIGKILL'); } catch { /* 已退出 */ } }, 3000).unref(); }
  } catch { /* 已退出 */ }
}
let cleaned = false;
function cleanup() {
  if (cleaned) return; cleaned = true;
  for (const c of children) kill(c);
  if (!args.keep) { try { rmSync(tmp, { recursive: true, force: true }); } catch { /* Windows 上文件可能仍被占用 */ } }
}
process.on('exit', cleanup);
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => { log('收到 ' + sig + '，清理本次进程'); cleanup(); process.exit(130); });
process.on('uncaughtException', e => { console.error(e); cleanup(); process.exit(1); });
const overall = setTimeout(() => { console.error(`[e2e] 超过 ${timeoutMin} 分钟，终止本次测试`); cleanup(); process.exit(124); }, timeoutMin * 60000); overall.unref();

/* ---------- 端口 ---------- */
const free = port => new Promise(ok => { const s = net.createServer().once('error', () => ok(false)).once('listening', () => s.close(() => ok(true))).listen(port, '127.0.0.1'); });
async function pickPort(preferred) {
  if (args.port) { const p = Number(args.port); if (!(await free(p))) throw new Error(`端口 ${p} 已被占用。换一个 --port，或不指定让脚本自动选择`); return p; }
  for (let p = preferred; p < preferred + 200; p++) if (await free(p)) return p;
  throw new Error('找不到空闲端口');
}
const get = url => new Promise(ok => { const r = http.get(url, res => { res.resume(); ok(res.statusCode); }); r.on('error', () => ok(0)); r.setTimeout(5000, () => { r.destroy(); ok(0); }); });
async function waitReady(url, child, seconds) {
  for (let i = 0; i < seconds * 2; i++) {
    if (child.exitCode !== null) throw new Error('服务器启动失败（已退出，代码 ' + child.exitCode + '），见 ' + join(results, 'server.log'));
    if (await get(url) === 200) return;
    await new Promise(r => setTimeout(r, 500));
  }
  throw new Error('服务器在 ' + seconds + ' 秒内没有就绪');
}
const run = (name, cmdArgs, env) => new Promise(ok => { const c = start(name, cmdArgs, env, { echo: true }); c.on('exit', code => ok(code ?? 1)); });

/* ---------- 自检用的「其他服务」：命令行里也带 next dev 字样，验证不会被按名字误杀 ---------- */
async function decoy(preferred) {
  if (args['no-isolation-check']) return null;
  if (!(await free(preferred))) return null;
  const code = `require('http').createServer((q,s)=>s.end('decoy')).listen(${preferred},'127.0.0.1')`;
  const c = spawn(process.execPath, ['-e', code, 'next', 'dev', 'other-project'], { stdio: 'ignore', detached: process.platform !== 'win32' });
  children.add(c);
  for (let i = 0; i < 20 && await get(`http://127.0.0.1:${preferred}/`) !== 200; i++) await new Promise(r => setTimeout(r, 100));
  return { child: c, port: preferred };
}

async function main() {
  const report = { mode, startedAt: new Date().toISOString(), node: process.version, platform: `${process.platform}-${process.arch}`, steps: [] };
  const step = (name, ok, extra = {}) => { report.steps.push({ name, ok, ...extra }); log((ok ? '✓ ' : '✗ ') + name); };
  const preferred = 3200;
  const other = await decoy(preferred);
  if (other) log(`自检：已在 ${other.port} 端口启动一个「其他项目」进程（命令行含 next dev），测试结束后确认它仍在运行`);
  const port = await pickPort(preferred); const base = `http://127.0.0.1:${port}`;
  log('测试库（临时目录）：' + dbPath); log('地址：' + base);
  const env = { DATABASE_PATH: dbPath, APP_ORIGIN: base, NEXT_TELEMETRY_DISABLED: '1', NODE_NO_WARNINGS: '1' };

  // 1. 独立测试库：迁移 + 演示数据（NODE_ENV=test）。部署检查不预先写入，验证「空数据库自动写入演示内容」。
  if (mode !== 'deploy') {
    const seeded = await run('seed', [tsxCli, 'scripts/seed.ts'], { ...env, NODE_ENV: 'test' });
    step('初始化独立测试库', seeded === 0); if (seeded) throw new Error('初始化测试库失败');
  }

  let server, testCode;
  if (mode === 'deploy') {
    const distDir = '.next-e2e-prod';
    const built = await run('build', [nextBin, 'build', '--webpack'], { ...env, NEXT_DIST_DIR: distDir, NODE_ENV: 'production' });
    step('生产构建', built === 0); if (built) throw new Error('生产构建失败');
    const prodEnv = { ...env, NEXT_DIST_DIR: distDir, NODE_ENV: 'production', SMS_PROVIDER: '', AUTH_SECRET: '', DEMO_CONTENT: 'seed-if-empty', TSX_CLI: tsxCli, E2E_BASE: base, RESULTS_DIR: results };
    rmSync(join(results, 'state.json'), { force: true }); rmSync(join(results, 'deploy.json'), { force: true });
    testCode = 0;
    for (const phase of [1, 2, 3]) {
      server = start('server-' + phase, [nextBin, 'start', '-H', '127.0.0.1', '-p', String(port)], prodEnv);
      await waitReady(base + '/api/health', server, 90); step(`生产服务器启动（第 ${phase} 次）`, true);
      const code = await run('deploy-' + phase, [join('tests', 'e2e', 'deploy-check.cjs')], { ...prodEnv, PHASE: String(phase) });
      step(`阶段 ${phase} 检查`, code === 0); testCode = testCode || code;
      kill(server); await new Promise(r => { if (server.exitCode !== null) r(); else server.once('exit', r); setTimeout(r, 8000); });
    }
  } else if (mode === 'screens') {
    // 2a. 生产构建 + 生产启动：不配置短信，验证登录被拒绝，不开放模拟验证码
    const distDir = '.next-e2e-prod';
    const built = await run('build', [nextBin, 'build', '--webpack'], { ...env, NEXT_DIST_DIR: distDir, NODE_ENV: 'production' });
    step('生产构建', built === 0); if (built) throw new Error('生产构建失败');
    server = start('server', [nextBin, 'start', '-H', '127.0.0.1', '-p', String(port)], { ...env, NEXT_DIST_DIR: distDir, NODE_ENV: 'production', SMS_PROVIDER: '', AUTH_SECRET: '' });
    await waitReady(base + '/api/session', server, 90); step('生产服务器启动', true);
    testCode = await run('screens', [join('tests', 'e2e', 'screens.cjs')], { ...env, E2E_BASE: base, RESULTS_DIR: results });
  } else {
    // 2b. 开发 / 测试环境：模拟短信（验证码显示在页面上，仅限测试）
    server = start('server', [nextBin, 'dev', '-H', '127.0.0.1', '-p', String(port)], { ...env, NEXT_DIST_DIR: '.next-e2e', SMS_PROVIDER: 'mock' });
    await waitReady(base + '/api/session', server, 120); step('测试服务器启动', true);
    for (const p of ['/', '/experiences', '/experiences/ops-returns', '/experiences/ops-returns/work', '/experiences/yc-quick/work', '/jobs', '/jobs/j1', '/events', '/companies/yc', '/me', '/login', '/cooperate', '/admin', '/records/x']) await get(base + p); // 预编译页面
    testCode = await run('acceptance', [join('tests', 'e2e', 'acceptance.cjs')], { ...env, E2E_BASE: base, RESULTS_DIR: results, TSX_CLI: tsxCli });
  }
  step('浏览器用例', testCode === 0, { exitCode: testCode });
  kill(server);
  if (other) {
    const alive = await get(`http://127.0.0.1:${other.port}/`) === 200;
    step(`其他服务未被终止（${other.port} 端口仍在响应）`, alive);
    kill(other.child);
    if (!alive) testCode = testCode || 1;
  }
  report.finishedAt = new Date().toISOString(); report.ok = testCode === 0 && report.steps.every(s => s.ok);
  writeFileSync(join(results, 'runner.json'), JSON.stringify(report, null, 2));
  log(report.ok ? '全部通过' : '有失败项', '→ ' + results);
  return report.ok ? 0 : 1;
}
main().then(code => { cleanup(); process.exit(code); }, e => { console.error('[e2e] ' + (e.message || e)); cleanup(); process.exit(1); });
