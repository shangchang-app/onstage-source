import type { MetadataRoute } from 'next';
/* 试用期间默认不让搜索引擎收录（内容多为示例）。正式上线后设置 ALLOW_INDEXING=true 即可开放。 */
export const dynamic = 'force-dynamic';
export default function robots(): MetadataRoute.Robots {
  return process.env.ALLOW_INDEXING === 'true' ? { rules: [{ userAgent: '*', allow: '/', disallow: ['/admin', '/login/link', '/api/'] }] } : { rules: [{ userAgent: '*', disallow: '/' }] };
}
