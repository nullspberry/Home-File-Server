import { NextResponse } from 'next/server';
import fs from 'node:fs/promises';
import { extOf, kindOf } from '@/lib/mime';
import { getLibraryResolver } from '@/lib/safePath';
import { getPublicLibraries } from '@/lib/libraryStore';
import { HttpError } from '@/lib/errors';

export const runtime = 'nodejs';

const HIDDEN_NAMES = new Set([
  'thumbs.db',
  'desktop.ini',
  '$recycle.bin',
  'system volume information',
  'node_modules',
  '.git',
  '.next',
]);

const isHidden = (name: string) => name.startsWith('.') || HIDDEN_NAMES.has(name.toLowerCase());
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    let libId = url.searchParams.get('lib');

    if (!libId) {
      const libs = await getPublicLibraries();
      if (libs.length > 0) {
        libId = libs[0].id;
      } else {
        return NextResponse.json({
          library: null,
          path: '',
          parent: null,
          items: [],
          message: 'No registered paths available yet.',
        });
      }
    }

    const { library, resolveSafe } = await getLibraryResolver(libId);
    const targetPath = url.searchParams.get('path') ?? '';
    const { absolute, relative } = await resolveSafe(targetPath);

    const stat = await fs.stat(absolute);
    if (!stat.isDirectory()) {
      return NextResponse.json({ error: 'Not a folder' }, { status: 400 });
    }

    const entries = await fs.readdir(absolute, { withFileTypes: true });
    const items = (
      await Promise.all(
        entries.map(async (entry) => {
          if (isHidden(entry.name)) return null;
          const childPath = relative ? `${relative}/${entry.name}` : entry.name;
          try {
            const child = await resolveSafe(childPath);
            const info = await fs.stat(child.absolute);
            if (info.isDirectory()) {
              return { name: entry.name, path: childPath, kind: 'folder' };
            }
            if (!info.isFile()) return null;
            const kind = kindOf(entry.name);
            return {
              name: entry.name,
              path: childPath,
              kind,
              size: info.size,
              ext: extOf(entry.name),
            };
          } catch {
            return null;
          }
        }),
      )
    ).filter(Boolean);

    items.sort((a: any, b: any) => {
      const aFolder = a.kind === 'folder';
      const bFolder = b.kind === 'folder';
      if (aFolder !== bFolder) return aFolder ? -1 : 1;
      return collator.compare(a.name, b.name);
    });

    const parent = relative ? relative.split('/').slice(0, -1).join('/') : null;
    return NextResponse.json({
      library: { id: library.id, name: library.name },
      path: relative,
      parent,
      items,
    });
  } catch (err: any) {
    if (err instanceof HttpError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: 'Failed to read directory' }, { status: 500 });
  }
}

