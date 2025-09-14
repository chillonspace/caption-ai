import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { API_PAGINATION, ERROR_MESSAGES } from '@/lib/constants';

/**
 * Get environment variable with validation
 */
export function getEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

/**
 * Create admin Supabase client
 */
export function createAdminClient() {
  const url = getEnv('NEXT_PUBLIC_SUPABASE_URL');
  const serviceKey = getEnv('SUPABASE_SERVICE_ROLE_KEY');
  return createSupabaseClient(url, serviceKey);
}

/**
 * Find user by email using admin API with pagination
 */
export async function findUserByEmail(email: string) {
  const admin = createAdminClient();
  
  let page = 1;
  const perPage = API_PAGINATION.DEFAULT_PAGE_SIZE;
  
  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    
    const list = data?.users || [];
    const found = list.find((u: any) => (u.email || '').toLowerCase() === email.toLowerCase());
    if (found) return found;
    
    const total = data?.total || 0;
    if (page * perPage >= total) return null;
    page++;
  }
}

/**
 * Set user active status by email
 */
export async function setUserActiveByEmail(email: string, active: boolean) {
  const user = await findUserByEmail(email);
  if (!user) return { ok: false, reason: 'user_not_found' } as const;

  const admin = createAdminClient();
  const newAppMeta = { ...(user.app_metadata || {}), active };
  
  const { error: updErr } = await admin.auth.admin.updateUserById(user.id, { 
    app_metadata: newAppMeta 
  });
  
  if (updErr) return { ok: false, reason: 'update_failed' } as const;
  return { ok: true } as const;
}

/**
 * Validate admin token
 */
export function validateAdminToken(providedToken: string): boolean {
  const adminToken = process.env.ADMIN_API_TOKEN || '';
  return Boolean(adminToken && providedToken === adminToken);
}
