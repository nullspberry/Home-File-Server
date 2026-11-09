import { NextResponse } from 'next/server';
import { loginAdmin } from '@/lib/auth';
import { HttpError } from '@/lib/errors';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { username, password } = body;
    if (!username || !password) {
      return NextResponse.json({ error: 'Username and password are required' }, { status: 400 });
    }

    const token = loginAdmin(username, password);
    const response = NextResponse.json({ ok: true, token, user: { username } });
    
    // Also set HttpOnly cookie for automatic browser authentication
    response.cookies.set({
      name: 'admin_token',
      value: token,
      httpOnly: true,
      path: '/',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7, // 7 days
    });

    return response;
  } catch (err: any) {
    if (err instanceof HttpError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: 'Login failed' }, { status: 500 });
  }
}
