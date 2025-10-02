import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createServer } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Caption',
};

export default async function CaptionLayout({ children }: { children: ReactNode }) {
  const sb = createServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect('/login');
  const active = Boolean((user.app_metadata as any)?.active);
  if (!active) redirect('/login');
  return <>{children}</>;
}


