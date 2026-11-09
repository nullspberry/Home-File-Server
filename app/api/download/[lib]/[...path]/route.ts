import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { parseRange } from '@/lib/range';
import { getLibraryResolver } from '@/lib/safePath';
import { HttpError } from '@/lib/errors';

export const runtime = 'nodejs';

export async function GET(
  req: Request,
  { params }: { params: { lib: string; path: string[] } },
) {
  try {
    const libId = params.lib;
    const relativePath = params.path.map(decodeURIComponent).join('/');

    const { resolveSafe } = await getLibraryResolver(libId);
    const { absolute } = await resolveSafe(relativePath);

    const stat = await fs.stat(absolute);
    if (!stat.isFile()) {
      return new Response(JSON.stringify({ error: 'File not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const filename = path.basename(absolute);
    const encodedFilename = encodeURIComponent(filename).replace(/['()]/g, escape);
    const size = stat.size;

    const rangeHeader = req.headers.get('range');
    const range = parseRange(rangeHeader, size);

    if (range === 'unsatisfiable') {
      return new Response(null, {
        status: 416,
        headers: {
          'Content-Range': `bytes */${size}`,
        },
      });
    }

    const start = range ? range.start : 0;
    const end = range ? range.end : size - 1;

    const headers: Record<string, string> = {
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${filename}"; filename*=UTF-8''${encodedFilename}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': `${size === 0 ? 0 : end - start + 1}`,
      'Last-Modified': stat.mtime.toUTCString(),
      'Cache-Control': 'no-cache',
    };

    if (range) {
      headers['Content-Range'] = `bytes ${start}-${end}/${size}`;
    }

    if (req.method === 'HEAD' || size === 0) {
      return new Response(null, { status: range ? 206 : 200, headers });
    }

    const nodeStream = createReadStream(absolute, { start, end });
    const webStream = Readable.toWeb(nodeStream);

    return new Response(webStream as BodyInit, {
      status: range ? 206 : 200,
      headers,
    });
  } catch (err: any) {
    if (err instanceof HttpError) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: err.status,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({ error: 'Download failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

