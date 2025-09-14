import { NextRequest, NextResponse } from 'next/server';
import { validateAdminToken } from '@/lib/admin-utils';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const providedToken = req.headers.get('x-admin-token') || '';
  if (!validateAdminToken(providedToken)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const usageFile = path.join(process.cwd(), 'data', 'usage-stats.json');
    
    if (!fs.existsSync(usageFile)) {
      return NextResponse.json({ stats: {} });
    }
    
    const stats = JSON.parse(fs.readFileSync(usageFile, 'utf8'));
    return NextResponse.json({ stats });
    
  } catch (error) {
    console.error('Failed to read usage stats:', error);
    return NextResponse.json({ error: 'Failed to read stats' }, { status: 500 });
  }
}
