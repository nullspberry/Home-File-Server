import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { addLibrary, getAdminLibraries } from '@/lib/libraryStore';
import { HttpError } from '@/lib/errors';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  try {
    requireAdmin(req);
    const items = await getAdminLibraries();
    return NextResponse.json({ items });
  } catch (err: any) {
    if (err instanceof HttpError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: 'Failed to fetch admin libraries' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    requireAdmin(req);
    const body = await req.json();
    const { name, path: dirPath } = body;
    const added = await addLibrary(name, dirPath);
    return NextResponse.json({ ok: true, library: added }, { status: 201 });
  } catch (err: any) {
    if (err instanceof HttpError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: 'Failed to register directory' }, { status: 500 });
  }
}
