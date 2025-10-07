import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function normalizeMsisdn(raw: string): string | null {
  const digits = String(raw || '').replace(/\D/g, '');
  if (!digits) return null;
  if (digits.startsWith('0') && !digits.startsWith('60')) {
    return `60${digits.slice(1)}`;
  }
  return digits;
}

export async function GET(_req: NextRequest, context: any) {
  try {
    const code = String(context?.params?.code || '').trim();
    const msisdn = normalizeMsisdn(code);
    if (!msisdn) return NextResponse.json({ error: 'Invalid number' }, { status: 400 });

    const TRIGGER_ENC = 'Hi%2C%20I%E2%80%99m%20interested%20in%20your%2010secHerb%20product.';
    const waUrl = `https://wa.me/${msisdn}?text=${TRIGGER_ENC}`;
    return NextResponse.redirect(waUrl, 302);
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}


