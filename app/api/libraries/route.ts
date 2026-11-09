import { NextResponse } from 'next/server';
import { getPublicLibraries } from '@/lib/libraryStore';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const items = await getPublicLibraries();
    return NextResponse.json({ items });
  } catch {
    return NextResponse.json({ error: 'Failed to load libraries' }, { status: 500 });
  }
}
