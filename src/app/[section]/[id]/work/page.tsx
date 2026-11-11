import { notFound } from 'next/navigation';
import { Work } from '@/components/work';
export default async function Page({ params }: { params: Promise<{ section: string; id: string }> }) {
  const { section, id } = await params; if (section !== 'experiences') notFound();
  return <Work key={id} id={id} />;
}
