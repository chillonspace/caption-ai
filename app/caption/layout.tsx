import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { createServer } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function CaptionLayout({ children }: { children: ReactNode }) {
  const sb = createServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect('/login');
  // Only redirect when active is explicitly true/false; avoid undefined flicker
  const activeMeta = (user.app_metadata as any)?.active;
  if (activeMeta === true) {
    // ok
  } else if (activeMeta === false) {
    redirect('/login');
  }
  return <>{children}</>;
}


