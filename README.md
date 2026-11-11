# 上场 ONSTAGE · V1.4.1 部署准备版（1.4.1-deploy.1）

> **要部署到线上，先看 `docs/部署指南.md`**（Render 分步操作、费用、国内访问测试、备份恢复）。本版本相对 V1.4.1 的改动见 `docs/部署准备-修改说明.md`。


找到机会，提前上场。面向大学生的 AI、出海及互联网职业机会与线上岗位体验平台。

本版本在 Codex 已开发的项目（Next.js + Node 内置 SQLite + zod）上继续，新增 **线上岗位体验**：
一个完整的引导式示范体验「跨境电商运营：商品退货率上升，先查什么？」，以及配套的账号、草稿、版本、后台和企业合作意向。
V1.4.1 修复了公开状态的优先级问题，补齐了后台内容维护页面，并让测试可以在干净环境中复跑（修改说明见 `docs/V1.4.1-修改说明.md`）。
招聘专区（V1.3 / V1.3.1）保留，规则不变。

> 这是可以在本机运行的开发版本，**没有部署到公网，网站尚未上线**。

## 环境要求

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
