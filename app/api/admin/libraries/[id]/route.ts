import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { removeLibrary } from '@/lib/libraryStore';
import { clearResolverCache } from '@/lib/safePath';
import { HttpError } from '@/lib/errors';

export const runtime = 'nodejs';

export async function DELETE(
  req: Request,
  { params }: { params: { id: string } },
) {
  try {
    requireAdmin(req);
    const id = params.id;
    const removed = await removeLibrary(id);
    clearResolverCache(id);
    return NextResponse.json({ ok: true, removed });
  } catch (err: any) {
    if (err instanceof HttpError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: 'Failed to delete library' }, { status: 500 });
  }
}

