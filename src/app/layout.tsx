import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { Provider } from '@/components/session';
import './globals.css';

export const metadata: Metadata = { title: 'on stage｜探索工作，也探索自己', description: '面向大学生的 AI、出海及互联网职业机会与线上岗位体验平台。不用等到实习，先体验一次真实岗位场景。' };
export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: '#F5F4F1' };
export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="zh-CN"><body><Provider>{children}</Provider></body></html>;
}
