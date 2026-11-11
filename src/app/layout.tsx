import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { Provider } from '@/components/session';
import './globals.css';

export const metadata: Metadata = { title: '上场 ONSTAGE｜找到机会，提前上场', description: '面向大学生的 AI、出海及互联网职业机会与线上岗位体验平台。不用等到实习，先体验一次真实岗位场景。' };
export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: '#FBF8F3' };
export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="zh-CN"><body><Provider>{children}</Provider></body></html>;
}
