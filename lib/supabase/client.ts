import { createBrowserClient } from '@supabase/ssr';

// Singleton to avoid multiple GoTrueClient instances in the same browser context
let client: ReturnType<typeof createBrowserClient> | null = null;

export function createClient() {
  if (client) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string;
  client = createBrowserClient(url, key, {
    auth: {
      // 30天session过期时间
      persistSession: true,
      autoRefreshToken: true,
      // 设置token过期时间为30天（单位：秒）
      storageKey: 'sb-auth-token',
    },
    global: {
      headers: {
        'x-session-duration': '30-days'
      }
    }
  });
  return client;
}


