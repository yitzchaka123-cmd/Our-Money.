import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

/** Liveness only — deliberately reports no configuration detail. */
export async function GET(): Promise<NextResponse> {
  return NextResponse.json({ ok: true, service: 'our-money' });
}
