import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { createServer } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function CaptionLayout({ children }: { children: ReactNode }) {
  const sb = createServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect('/login');
  // 临时跳过active检查，让用户能正常使用
  return <>{children}</>;
}


