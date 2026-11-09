import { NextResponse } from 'next/server';
import { getAuthTokenFromRequest, logoutAdmin } from '@/lib/auth';

export const runtime = 'nodejs';

export async function POST() {
  logoutAdmin();

  const response = NextResponse.json({ ok: true });
  response.cookies.delete('admin_token');
  return response;
}
