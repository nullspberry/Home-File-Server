import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { HttpError } from '@/lib/errors';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  try {
    requireAdmin(req);
    return NextResponse.json({ ok: true, role: 'admin' });
  } catch (err: any) {
    if (err instanceof HttpError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
