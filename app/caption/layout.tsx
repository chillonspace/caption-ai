import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { createServer } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function CaptionLayout({ children }: { children: ReactNode }) {
  const sb = createServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect('/login');
  return <>{children}</>;
}


