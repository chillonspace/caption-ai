import { NextRequest, NextResponse } from 'next/server';
import { validateAdminToken, createAdminClient } from '@/lib/admin-utils';
import { API_PAGINATION, ERROR_MESSAGES } from '@/lib/constants';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const providedToken = req.headers.get('x-admin-token') || '';
  if (!validateAdminToken(providedToken)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();

  let count = 0;
  let page = 1;
  const perPage = API_PAGINATION.DEFAULT_PAGE_SIZE;
  
  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) {
      return NextResponse.json({ 
        error: ERROR_MESSAGES.LIST_FAILED, 
        detail: error.message 
      }, { status: 500 });
    }
    
    count += data?.users?.length || 0;
    const total = data?.total || 0;
    if (count >= total) break;
    page += 1;
  }

  return NextResponse.json({ count });
}


