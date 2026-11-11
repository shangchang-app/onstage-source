/* 上线时可配置的外部链接（打包时读取环境变量；不配置就不显示对应入口）。
   NEXT_PUBLIC_FUN_URL：首页趣味入口按钮的站内地址（以 / 开头）。不配置时默认 /buddy/。
   NEXT_PUBLIC_BUDDY_URL：「隐藏工位搭子」分享卡二维码指向的探索入口（https）。静态打包时默认 https://shangchang-app.github.io/<仓库名>/buddy/（见 scripts/build-static.mjs）；
     没有配置时，只在 https 且不是本机地址的页面上用当前网址推导，否则不画二维码。
   NEXT_PUBLIC_COOP_URL：合作意向问卷的地址（例如腾讯问卷）。试玩版没有服务器，配置后合作页才显示提交入口。 */
const safe = (v?: string) => (v && /^https:\/\//.test(v) ? v : '');
export const COOP_URL = safe(process.env.NEXT_PUBLIC_COOP_URL);
const internal = (v?: string) => (v && /^\/[a-z0-9/_-]*$/i.test(v) ? v : '');
export const FUN_URL = internal(process.env.NEXT_PUBLIC_FUN_URL);
export const BUDDY_URL = safe(process.env.NEXT_PUBLIC_BUDDY_URL);
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || '';
