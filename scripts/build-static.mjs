#!/usr/bin/env node
/* 打包「免费试玩版」：纯静态网页，可以免费放到 GitHub Pages。
   npm run build:static                       仓库名为 onstage 时用（网址 https://用户名.github.io/onstage/）
   npm run build:static -- --base=/仓库名      仓库名不是 onstage 时
   npm run build:static -- --base=            仓库名为「用户名.github.io」时（网址就是 https://用户名.github.io/）
   输出到 dist-pages/。正式项目的代码不会被修改：打包在系统临时目录里的副本中进行。

   试玩版和正式版的区别：没有服务器和数据库；内容是打包时的演示内容；作答只保存在访客自己的浏览器里；
   没有登录、完成记录、收藏、后台、反馈和合作表单提交。 */
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, rmdirSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(root, 'package.json'));
const arg = process.argv.slice(2).find(a => a.startsWith('--base='));
const base = (arg ? arg.slice(7) : '/onstage').replace(/\/+$/, '');
if (base && !/^\/[A-Za-z0-9._-]+$/.test(base)) { console.error('--base 只能是 /仓库名，例如 --base=/onstage'); process.exit(2); }
const outDir = join(root, 'dist-pages');
const tmp = mkdtempSync(join(tmpdir(), 'onstage-pages-')); const app = join(tmp, 'app');
const run = (cmd, args, env = {}) => { const r = spawnSync(process.execPath, [cmd, ...args], { cwd: app, stdio: 'inherit', env: { ...process.env, ...env } }); if (r.status !== 0) throw new Error('步骤失败：' + args.join(' ')); };
try {
  console.log('[pages] 网址路径：' + (base || '/（根目录）'));
  cpSync(root, app, { recursive: true, filter: src => !/[\\/](node_modules|\.next[^\\/]*|data|test-results|dist-pages|\.git)([\\/]|$)/.test(src.slice(root.length)) });
  symlinkSync(join(root, 'node_modules'), join(app, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
  // 试玩版不需要的服务端页面：接口、后台、管理员登录、完成记录页、动态 robots
  for (const p of ['src/app/api', 'src/app/admin', 'src/app/login/link', 'src/app/records', 'src/app/robots.ts']) rmSync(join(app, p), { recursive: true, force: true });
  mkdirSync(join(app, 'public'), { recursive: true }); // 干净检出里没有 public/（git 不保存空目录）
  writeFileSync(join(app, 'public', 'robots.txt'), 'User-agent: *\nDisallow: /\n');
  writeFileSync(join(app, 'public', '.nojekyll'), ''); // GitHub Pages 默认会忽略以 _ 开头的目录（_next），这个文件关闭该行为
  // 演示内容与静态页面列表
  run(require.resolve('tsx/cli'), ['scripts/export-static-data.ts', 'public/static-data.json', 'static-params.json'], { NODE_ENV: 'test', NODE_NO_WARNINGS: '1' });
  const params = JSON.parse(readFileSync(join(app, 'static-params.json'), 'utf8'));
  const page = (file, list, extra = '') => {
    const p = join(app, file); const src = readFileSync(p, 'utf8');
    writeFileSync(p, src + `\nexport const dynamicParams = false;\nexport function generateStaticParams() { return ${JSON.stringify(list)}; }\n${extra}`);
  };
  page('src/app/[section]/page.tsx', ['events', 'jobs', 'experiences', 'companies'].map(section => ({ section })));
  page('src/app/[section]/[id]/page.tsx', params.details);
  page('src/app/[section]/[id]/work/page.tsx', params.experiences);
  // 版本标识：写进页脚和 version.json，方便确认线上部署的是哪一次提交。源码有未提交的改动时加「-modified」。
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  const git = args => { const r = spawnSync('git', args, { cwd: root, encoding: 'utf8' }); return r.status === 0 ? r.stdout.trim() : ''; };
  const commit = (git(['rev-parse', '--short', 'HEAD']) || 'unknown') + (git(['status', '--porcelain', '--untracked-files=no']) ? '-modified' : '');
  writeFileSync(join(app, 'public', 'version.json'), JSON.stringify({ version: pkg.version, commit, builtAt: new Date().toISOString(), base: base || '/' }, null, 2));
  console.log('[pages] 版本 ' + pkg.version + ' · 提交 ' + commit);
  // 「隐藏工位搭子」分享卡二维码指向的探索入口：可用 BUDDY_URL 指定；默认 https://shangchang-app.github.io/<仓库名>/buddy/，永远不指向本机地址
  const siteOrigin = (process.env.SITE_ORIGIN || 'https://shangchang-app.github.io').replace(/\/+$/, '');
  const buddyUrl = process.env.BUDDY_URL || `${siteOrigin}${base}/buddy/`;
  if (!/^https:\/\//.test(buddyUrl) || /localhost|127\.0\.0\.1/.test(buddyUrl)) { console.error('BUDDY_URL 必须是 https 的公开网址'); process.exit(2); }
  console.log('[pages] 分享卡入口：' + buddyUrl);
  writeFileSync(join(app, 'public', 'buddy-entry.json'), JSON.stringify({ url: buddyUrl }));
  writeFileSync(join(app, 'next.config.ts'), `import type { NextConfig } from 'next';
const config: NextConfig = { output: 'export', trailingSlash: true, basePath: ${JSON.stringify(base)}, images: { unoptimized: true }, poweredByHeader: false, devIndicators: false,
  env: { NEXT_PUBLIC_STATIC: '1', NEXT_PUBLIC_BASE_PATH: ${JSON.stringify(base)}, NEXT_PUBLIC_VERSION: ${JSON.stringify(pkg.version)}, NEXT_PUBLIC_COMMIT: ${JSON.stringify(commit)}, NEXT_PUBLIC_BUDDY_URL: ${JSON.stringify(buddyUrl)} } };
export default config;
`);
  run(require.resolve('next/dist/bin/next'), ['build', '--webpack'], { NODE_ENV: 'production', NEXT_TELEMETRY_DISABLED: '1' });
  rmSync(outDir, { recursive: true, force: true });
  cpSync(join(app, 'out'), outDir, { recursive: true });
  if (!existsSync(join(outDir, '.nojekyll'))) writeFileSync(join(outDir, '.nojekyll'), '');
  console.log('[pages] 完成：' + outDir);
} finally {
  // 先单独移除指向项目 node_modules 的链接，再删临时目录，确保不会删到项目里的依赖
  const link = join(app, 'node_modules');
  try { unlinkSync(link); } catch { try { rmdirSync(link); } catch { /* 不存在 */ } }
  if (!existsSync(join(root, 'node_modules', 'next'))) console.error('[pages] 警告：项目依赖异常，请重新运行 npm ci');
  rmSync(tmp, { recursive: true, force: true });
}
