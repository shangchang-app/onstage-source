import type { NextConfig } from 'next';
const config: NextConfig = {
  poweredByHeader: false,
  serverExternalPackages: ['node:sqlite'],
  // 测试运行器用独立的构建目录，避免和你自己开着的 `npm run dev` 互相干扰。
  distDir: process.env.NEXT_DIST_DIR || '.next',
  // 开发工具浮标会遮挡截图和页面内容，关闭。
  devIndicators: false,
  async headers() { return [{ source: '/:path*', headers: [{key:'X-Content-Type-Options',value:'nosniff'},{key:'X-Frame-Options',value:'DENY'},{key:'Referrer-Policy',value:'strict-origin-when-cross-origin'},{key:'Permissions-Policy',value:'camera=(), microphone=(), geolocation=()'}]}]; }
};
export default config;
