/* 上线时可配置的外部链接（打包时读取环境变量；不配置就不显示对应入口）。
   NEXT_PUBLIC_COOP_URL：合作意向问卷的地址（例如腾讯问卷）。试玩版没有服务器，配置后合作页才显示提交入口。 */
const safe = (v?: string) => (v && /^https:\/\//.test(v) ? v : '');
export const COOP_URL = safe(process.env.NEXT_PUBLIC_COOP_URL);
