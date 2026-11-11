import { Suspense } from 'react';
import { Login } from '@/components/login';
export default function Page() { return <Suspense fallback={<div className="wrap page" role="status">正在载入…</div>}><Login /></Suspense>; }
