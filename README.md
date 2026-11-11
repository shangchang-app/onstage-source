# on stage · V1.7（1.7.0）

探索工作，也探索自己。面向大学生的 AI、出海及互联网职业机会与线上岗位体验平台。

- 线上试玩版（GitHub Pages，纯静态，无服务器）：<https://shangchang-app.github.io/onstage/>
- 预览（由本仓库的 GitHub Actions 从源码自动构建）：<https://shangchang-app.github.io/onstage-source/>
- 本轮改动：`docs/V1.7-修改说明.md`（全站黑白视觉，含本地存储与回滚兼容说明）、`docs/V1.7-导航调整.md`
- 上一轮：`docs/V1.6-修改说明.md`；验收、发布与回滚：`docs/V1.6-验收与发布.md`

## 两种运行方式

| | 静态试玩版（当前线上用的） | 正式版（需要服务器，尚未部署） |
|---|---|---|
| 构建 | `npm run build:static` → `dist-pages/` | `npm run build` + `npm start` |
| 数据 | 草稿和成果只在访客自己的浏览器里（localStorage） | 服务器 SQLite 数据库 |
| 测试 | `npm run test:pages`（静态版专用，模拟 GitHub Pages 子路径） | `npm run test:e2e`、`npm run test:deploy` |

**两者的测试互相不能代替**：正式版测试通过，不代表静态版能用。

## 从干净检出生成待发布网站（静态版）

需要：Node.js 24（`.node-version`；最低 22.13）、git、npm。

```bash
git clone https://github.com/shangchang-app/onstage-source.git
cd onstage-source
npm ci                                   # 按 package-lock.json 安装，不改版本
npm run typecheck && npm test            # 类型检查 + 单元测试（47 项）
npx playwright install chromium          # 第一次运行浏览器测试前需要（CI 里加 --with-deps）
npm run build:static                     # 输出 dist-pages/，网址前缀 /onstage（线上仓库名）
npm run test:pages                       # 在模拟的 GitHub Pages /onstage/ 下用 Chromium 实测（25 项）
# 同源升级与回滚（单独执行）：npm run test:rollback -- <V1.4.1 解压目录> <用 --base=/onstage-source 构建的目录>
npm run package:pages                    # 打成 release/onstage-site-<版本>-<提交>.zip，并输出 SHA256
```

- 一条命令：`npm run release`（构建 + 静态版测试 + 打包）。
- 换网址前缀：`npm run build:static -- --base=/仓库名`，测试时设置 `PAGES_BASE=/仓库名`。
- `dist-pages/version.json` 和网站页脚会写入：`version`（版本号）、`commit`（源码提交号，有未提交改动时带 `-modified`）、`builtAt`（构建时间）、`base`。
- 发布包 zip 内文件顺序和时间固定。不同次构建因为构建时间和 Next.js 构建编号不同，校验值会不一样，**以 GitHub Actions 发布的 Release 附件及其 SHA256 为准**（见下）。

## 持续构建与预览（GitHub Actions）

`.github/workflows/preview.yml`：每次推送到 `main`，都会在干净环境里依次运行：

1. `npm ci`、类型检查、单元测试；
2. 用前缀 `/onstage` 构建线上发布包，并运行静态版测试，然后打包；
3. 用前缀 `/onstage-source` 构建预览，并运行静态版测试；
4. 把发布包和 `.sha256` 发到本仓库的 Releases（标签 `build-<提交号前 7 位>`，标为预发布）；
5. 把预览部署到 GitHub Pages。

测试日志和截图作为 Actions 附件保存。

## 发布到线上与回滚

线上仓库 `shangchang-app/onstage` 只放发布包，不放源码。它的 Actions 会解压根目录里**唯一的** `.zip`，然后发布。

- **发布**：从本仓库 Releases 下载对应提交的 `onstage-site-…zip`，核对 SHA256；再在线上仓库删掉旧的 zip、上传新的 zip，等 Actions 变绿；最后打开 `/onstage/version.json` 核对提交号。
- **回滚**：线上仓库的提交 `5eed8ae` 就是 V1.4.1 的发布包（`site.zip`，sha256 `10d61ad4…4f23`），git 历史会一直保留它。用它替换当前 zip 即可（详细步骤和本地数据兼容性见 `docs/V1.6-验收与发布.md`）。

## 正式版（服务器）：环境要求

- Node.js 24 LTS（最低 22.13；需要自带的 `node:sqlite`。Node 22 会打印一条 SQLite experimental 提示，可以忽略）
- 不需要安装数据库，数据保存在一个 SQLite 文件里

## 本地启动

```bash
npm install
cp .env.example .env.local      # 开发环境保持 SMS_PROVIDER=mock 即可
npm run migrate                 # 建表（按版本顺序执行 migrations/ 下的 SQL，已执行的不会重复）
npm run seed                    # 写入演示数据（全部标为「示例」；生产环境会拒绝运行）
npm run dev                     # 打开 http://127.0.0.1:3000
```

登录：开发 / 测试环境用模拟短信，验证码**随机生成并显示在登录页**，页面顶部有「本地开发 / 测试环境」提示条。
没有固定验证码。

设置管理员（本地开发：先用该手机号登录一次；线上试用版没有开放登录时，用 `npm run admin:link -- 手机号` 生成一次性登录链接，见部署指南）：

```bash
npm run admin -- 13900000000
```

管理员登录后，页脚会出现「内部后台」，地址 `/admin`。在后台可以新建、编辑、预览企业、招聘、赛事和岗位体验；新建内容默认是草稿，按规则确认 / 审核后发布才会公开。

## 生产构建

```bash
npm run build
npm start
```

`NODE_ENV=production` 时：

- 必须配置 `SMS_PROVIDER=http`、`SMS_GATEWAY_URL`（https）、`SMS_GATEWAY_TOKEN`、`AUTH_SECRET`（≥32 位），否则登录接口直接返回「登录服务暂不可用」，**不会回退到模拟登录**；浏览和岗位体验仍可用。
- `npm run seed` 拒绝运行（演示数据只用于开发和测试）。
- 会话 cookie 带 `Secure`，必须通过 HTTPS 访问；`APP_ORIGIN` 填正式网址。

## 环境变量

见 `.env.example`。不要把真实密钥写进代码或提交到仓库（`.env*` 已在 `.gitignore` 中）。

| 变量 | 说明 |
|---|---|
| `DATABASE_PATH` | SQLite 文件位置，默认 `./data/onstage.sqlite` |
| `APP_ORIGIN` | 网站地址；所有写请求都校验来源必须等于它 |
| `SMS_PROVIDER` | `mock`（仅开发 / 测试）或 `http` |
| `SMS_GATEWAY_URL` / `SMS_GATEWAY_TOKEN` | 短信网关（POST `{phone,code,expiresInSeconds}`，Bearer 令牌） |
| `AUTH_SECRET` | 验证码摘要密钥，生产必填，≥32 位随机字符串 |

## 数据库迁移与演示数据

- `migrations/001_initial.sql`、`002_portfolio.sql`：Codex 原有，未改动。
  002 中的作品集 / 企业成员等表**保留但没有任何入口**（本轮暂缓的功能）。
- `migrations/003_guided_experience.sql`（V1.4 新增）：
  - `experience_versions`：体验内容的版本、审核与发布状态；已发布 / 已替代的版本由数据库触发器禁止修改。
  - `drafts.progress`（浏览进度）、`drafts.conflict_with`（冲突对应的另一份作答）、`submissions.reflection`（完成时的感受）。
  - `coop_intents`：企业合作意向。
  - 自动为已有体验补上第 1 版记录（已有 V1.3 数据库可以直接升级，测试覆盖）。
- `migrations/004_admin_editing.sql`（V1.4.1 新增）：体验版本记录关联企业，并增加修改计数，防止两位管理员同时编辑时互相覆盖。
- `scripts/seed.ts`：演示数据，与迁移分开。所有企业、岗位、赛事、体验、人物都是虚构的，并标为「示例」。重复运行不会覆盖已有内容。

## 测试

```bash
npm ci                          # 按 package-lock.json 安装，包含锁定版本的 Playwright 1.63.0
npx playwright install chromium # 第一次运行浏览器测试前安装 Chromium（Windows / macOS / Linux 相同）
                                # Linux 服务器缺系统库时用：npx playwright install --with-deps chromium

npm run typecheck               # 类型检查
npm test                        # 服务端测试（30 项：业务规则 22 项 + 部署相关 8 项；每项用独立的临时数据库）
npm run build                   # 生产构建
npm run test:e2e                # 浏览器验收（测试环境，21 项）
npm run test:e2e:screens        # 生产构建 + 生产模式启动后截图，并核对生产登录被拒绝
npm run test:deploy             # 部署前检查：生产模式 + 模拟持久化磁盘，中途重启 2 次（数据保留、备份恢复、访客隔离、后台权限）
npm run verify                  # 依次运行以上全部
```

浏览器测试的运行器是 `tests/e2e/run.mjs`（只用 Node，Windows / macOS / Linux 通用）：

- 测试库建在系统临时目录，**不读写 `data/` 下你的开发或正式数据库**，结束后自动删除（`--keep` 保留）。
- 使用独立的构建目录 `.next-e2e` / `.next-e2e-prod`，你自己开着的 `npm run dev` 不受影响。
- 默认从 3200 开始自动找空闲端口；`--port=3300` 指定端口，被占用时直接报错退出。
- 只结束本次启动的子进程（按进程号；Windows 用 `taskkill /T`），不会按名字结束其他服务。运行时会先启动一个命令行里也带 `next dev` 的「其他项目」进程，结束后确认它仍在运行。
- 启动失败、用例失败、超时（默认 20 分钟，`--timeout=分钟` 可改）都返回非零退出码，并清理本次进程。
- 结果在 `test-results/acceptance/`、`test-results/screens/`（JSON 结果、日志、截图），目录自动创建。

截图说明：`test:e2e` 的截图来自**测试环境**（页面顶部有「本地开发 / 测试环境」提示条，用模拟短信登录）；`test:e2e:screens` 的截图来自**生产构建**，不开放模拟登录，只截不需要登录的页面（游客可以开始岗位体验）。两者的页面内容都是演示数据，标有「示例」。

## 目录

```
migrations/               版本化迁移（001–004）
scripts/                  migrate / seed / admin
src/server/               db、auth（会话、验证码、游客合并）、service（业务规则）、http（接口路由）、validation
src/app/                  页面路由（首页、机会库、岗位体验、企业、我的、登录、记录、合作、后台）
src/components/           页面组件；work.tsx 是岗位体验作答页
tests/service.test.ts     服务端测试
tests/e2e/                浏览器验收：run.mjs（运行器）、acceptance.cjs（测试环境用例）、screens.cjs（生产截图）
docs/                     交付说明
```
