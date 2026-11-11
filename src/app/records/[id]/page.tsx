import { Record } from '@/components/me';
export default async function Page({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; return <Record id={id} />; }
