import { notFound } from 'next/navigation';
import { Catalog } from '@/components/catalog';
const KINDS: Record<string, string> = { events: 'event', jobs: 'job', experiences: 'experience', companies: 'company' };
export default async function Page({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params; const kind = KINDS[section]; if (!kind) notFound();
  return <Catalog kind={kind} />;
}
