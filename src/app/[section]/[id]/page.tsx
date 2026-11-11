import { notFound } from 'next/navigation';
import { Detail } from '@/components/catalog';
const SECTIONS = ['events', 'jobs', 'experiences', 'companies'];
export default async function Page({ params }: { params: Promise<{ section: string; id: string }> }) {
  const { section, id } = await params; if (!SECTIONS.includes(section)) notFound();
  return <Detail key={id} id={id} />;
}
