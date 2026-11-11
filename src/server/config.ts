/* 部署相关配置集中在这里：网站地址、数据库位置、会话时长。
   以后绑定或更换域名，只需要改环境变量 APP_ORIGIN，不用改代码。 */
import { isAbsolute } from 'node:path';

const DEV_ORIGIN = 'http://127.0.0.1:3000';
const isProd = (env: NodeJS.ProcessEnv) => env.NODE_ENV === 'production';

/** 允许的网站地址（写请求的 Origin 必须是其中之一）。
 *  APP_ORIGIN 可写多个，用英文逗号分隔，例如换域名期间：https://try.example.com,https://onstage-trial.onrender.com
 *  没有设置时，自动使用托管平台提供的地址（Render: RENDER_EXTERNAL_URL；Railway: RAILWAY_PUBLIC_DOMAIN）。 */
export function publicOrigins(env = process.env): string[] {
  const list = (env.APP_ORIGIN || '').split(',').map(s => s.trim().replace(/\/+$/, '')).filter(Boolean);
  if (env.RENDER_EXTERNAL_URL) list.push(env.RENDER_EXTERNAL_URL.replace(/\/+$/, ''));
  if (env.RAILWAY_PUBLIC_DOMAIN) list.push('https://' + env.RAILWAY_PUBLIC_DOMAIN.replace(/\/+$/, ''));
  if (!list.length && !isProd(env)) list.push(DEV_ORIGIN);
  return [...new Set(list)];
}
/** 第一个地址作为「主地址」，用于生成管理员登录链接等。 */
export const primaryOrigin = (env = process.env) => publicOrigins(env)[0] || DEV_ORIGIN;

/** 生产环境启动前必须满足的条件。返回问题列表；为空表示可以运行。 */
export function productionProblems(env = process.env): string[] {
  if (!isProd(env)) return [];
  const problems: string[] = [];
  const origins = publicOrigins(env);
  if (!origins.length) problems.push('没有设置网站地址：请设置 APP_ORIGIN（例如 https://你的服务名.onrender.com）');
  // 本机验收（127.0.0.1 / localhost）允许 http；任何公网地址都必须是 https。
  for (const o of origins) if (!/^https:\/\/[^/\s]+$/.test(o) && !/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(o)) problems.push(`网站地址必须是 https:// 开头、不带路径：${o}`);
  // 不允许把数据库默认写进项目目录：大多数托管平台的项目目录在重新部署后会被清空。
  if (!env.DATABASE_PATH) problems.push('没有设置 DATABASE_PATH：生产环境必须把数据库放在持久化磁盘上（例如 /var/data/onstage.sqlite）');
  else if (env.DATABASE_PATH !== ':memory:' && !isAbsolute(env.DATABASE_PATH)) problems.push('DATABASE_PATH 必须是持久化磁盘上的绝对路径（例如 /var/data/onstage.sqlite）');
  return problems;
}

/** 会话有效期（天），默认 30 天；每次访问自动续期，所以「连续 30 天没打开网站」才会过期。 */
export const sessionDays = (env = process.env) => { const n = Number(env.SESSION_DAYS || 30); return Number.isFinite(n) && n >= 1 && n <= 365 ? n : 30; };
/** 通过一次性链接登录的管理员会话：12 小时，不自动续期。 */
export const ADMIN_LINK_SESSION_MS = 12 * 3600000;
