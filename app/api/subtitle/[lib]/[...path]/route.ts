import fs from 'node:fs/promises';
import { extOf } from '@/lib/mime';
import { getLibraryResolver } from '@/lib/safePath';
import { srtToVtt } from '@/lib/subtitles';
import { HttpError } from '@/lib/errors';

export const runtime = 'nodejs';

const MAX_SUBTITLE_BYTES = 2 * 1024 * 1024;

export async function GET(
  req: Request,
  { params }: { params: { lib: string; path: string[] } },
) {
  try {
    const libId = params.lib;
    const relativePath = params.path.map(decodeURIComponent).join('/');

    const { resolveSafe } = await getLibraryResolver(libId);
    const { absolute } = await resolveSafe(relativePath);

    const ext = extOf(absolute);
    if (ext !== '.srt' && ext !== '.vtt') {
      return new Response(JSON.stringify({ error: 'Unsupported subtitle type' }), {
        status: 415,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const stat = await fs.stat(absolute);
    if (!stat.isFile()) {
      return new Response(JSON.stringify({ error: 'Subtitle not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (stat.size > MAX_SUBTITLE_BYTES) {
      return new Response(JSON.stringify({ error: 'Subtitle file too large' }), {
        status: 413,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const raw = await fs.readFile(absolute, 'utf8');
    const body = ext === '.srt' ? srtToVtt(raw) : raw;

    return new Response(body, {
      status: 200,
      headers: {
        'Content-Type': 'text/vtt; charset=utf-8',
        'Content-Length': `${Buffer.byteLength(body)}`,
        'Cache-Control': 'no-cache',
      },
    });
  } catch (err: any) {
    if (err instanceof HttpError) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: err.status,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({ error: 'Failed to read subtitle' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

