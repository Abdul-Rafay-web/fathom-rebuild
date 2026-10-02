import type { Metadata } from 'next';
import { listActionItems } from '@/lib/queries';
import { getViewer } from '@/lib/auth';
import { Inbox } from '@/components/Inbox';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Action items' };

export default async function ActionsPage() {
  const v = await getViewer();
  const items = await listActionItems(v.workspace.id);
  return (
    <div className="mx-auto max-w-[960px] px-5 pt-10 pb-24 sm:px-8 lg:pt-14">
      <h1 className="text-[46px] leading-[1.02] sm:text-[56px]">Action items</h1>
      <p className="mt-3 max-w-[60ch] text-[13.5px] text-ink-3">
        Every commitment from every meeting, by owner. Each one links to the moment it was made, so you can hear exactly what was promised.
      </p>
      <Inbox initial={items.map((i) => ({ ...i, started_at: i.started_at.toISOString() }))} />
    </div>
  );
}
