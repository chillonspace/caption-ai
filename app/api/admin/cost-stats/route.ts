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
    const file = path.join(process.cwd(), 'data', 'cost-stats.json');
    if (!fs.existsSync(file)) {
      return NextResponse.json({
        samples: 0,
        sums: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0, cost_usd: 0 },
        avg: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0, cost_usd: 0 },
        pricing: {
          input_usd_per_1k: Number(parseFloat(String(process.env.DS_INPUT_USD_PER_1K || '0')).toFixed(6)),
          output_usd_per_1k: Number(parseFloat(String(process.env.DS_OUTPUT_USD_PER_1K || '0')).toFixed(6)),
        },
        by_model: {},
        by_user: {}
      });
    }

    const agg = JSON.parse(fs.readFileSync(file, 'utf8')) || {};
    const samples = Number(agg.samples || 0) || 0;
    const sPrompt = Number(agg.sum_prompt_tokens || 0) || 0;
    const sComp = Number(agg.sum_completion_tokens || 0) || 0;
    const sTotal = Number(agg.sum_total_tokens || 0) || 0;
    const sCost = Number(agg.sum_cost_usd || 0) || 0;

    const avgPrompt = samples > 0 ? sPrompt / samples : 0;
    const avgComp = samples > 0 ? sComp / samples : 0;
    const avgTotal = samples > 0 ? sTotal / samples : 0;
    const avgCost = samples > 0 ? sCost / samples : 0;

    return NextResponse.json({
      samples,
      sums: {
        prompt_tokens: sPrompt,
        completion_tokens: sComp,
        total_tokens: sTotal,
        cost_usd: Number(sCost.toFixed(6)),
      },
      avg: {
        prompt_tokens: Number(avgPrompt.toFixed(2)),
        completion_tokens: Number(avgComp.toFixed(2)),
        total_tokens: Number(avgTotal.toFixed(2)),
        cost_usd: Number(avgCost.toFixed(6)),
      },
      pricing: {
        input_usd_per_1k: Number(parseFloat(String(process.env.DS_INPUT_USD_PER_1K || '0')).toFixed(6)),
        output_usd_per_1k: Number(parseFloat(String(process.env.DS_OUTPUT_USD_PER_1K || '0')).toFixed(6)),
      },
      by_model: agg.by_model || {},
      by_user: agg.by_user || {},
    });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to read cost stats' }, { status: 500 });
  }
}


