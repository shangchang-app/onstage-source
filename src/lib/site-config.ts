/* 上线时可配置的外部链接（打包时读取环境变量；不配置就不显示对应入口）。
   NEXT_PUBLIC_FUN_URL：首页趣味入口「隐藏工位搭子」的站内地址（以 / 开头）。动物模块做完前不配置，首页只显示预告、不显示按钮。
   NEXT_PUBLIC_COOP_URL：合作意向问卷的地址（例如腾讯问卷）。试玩版没有服务器，配置后合作页才显示提交入口。 */
const safe = (v?: string) => (v && /^https:\/\//.test(v) ? v : '');
export const COOP_URL = safe(process.env.NEXT_PUBLIC_COOP_URL);
const internal = (v?: string) => (v && /^\/[a-z0-9/_-]*$/i.test(v) ? v : '');
export const FUN_URL = internal(process.env.NEXT_PUBLIC_FUN_URL);
