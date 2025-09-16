import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';

export function createServer() {
  const cookieStore = cookies(); // In some runtimes this is Promise<ReadonlyRequestCookies>
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string;
  return createServerClient(url, key, {
    cookies: {
      async get(name: string) {
        const store = await cookieStore as any;
        return store.get(name)?.value;
      },
      async set(name: string, value: string, options: any) {
        const store = await cookieStore as any;
        if (typeof store?.set === 'function') {
          store.set({ name, value, ...options });
        }
      },
      async remove(name: string, options: any) {
        const store = await cookieStore as any;
        if (typeof store?.set === 'function') {
          store.set({ name, value: '', ...options });
        }
      },
    },
  });
}


