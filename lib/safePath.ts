import fs from 'node:fs/promises';
import path from 'node:path';
import { HttpError } from './errors';
import { getLibrary, Library } from './libraryStore';

const RESERVED_NAME = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])([.].*)?$/i;
const isForbiddenChar = (code: number) => code < 32 || code === 58 || code === 92;

export interface SafePathResult {
  absolute: string;
  relative: string;
}

export type SafeResolver = (relative?: string) => Promise<SafePathResult>;

export async function createSafeResolver(rootDir: string): Promise<SafeResolver> {
  const root = await fs.realpath(path.resolve(rootDir));

  function isInside(candidate: string) {
    const rel = path.relative(root, candidate);
    if (rel === '') return true;
    if (path.isAbsolute(rel)) return false;
    return rel !== '..' && !rel.startsWith('..' + path.sep);
  }

  return async function resolveSafe(relative: string = ''): Promise<SafePathResult> {
    if (typeof relative !== 'string') {
      throw new HttpError(400, 'Invalid path');
    }
    for (let i = 0; i < relative.length; i++) {
      if (isForbiddenChar(relative.charCodeAt(i))) {
        throw new HttpError(400, 'Invalid path');
      }
    }

    const segments = relative.split('/').filter((s) => s !== '' && s !== '.');
    for (const seg of segments) {
      if (seg === '..' || RESERVED_NAME.test(seg)) {
        throw new HttpError(400, 'Invalid path');
      }
    }

    const candidate = path.resolve(root, ...segments);
    let real: string;
    try {
      real = await fs.realpath(candidate);
    } catch (err: any) {
      if (err.code === 'ENOENT' || err.code === 'ENOTDIR') {
        throw new HttpError(404, 'Not found');
      }
      throw err;
    }

    if (!isInside(real)) throw new HttpError(403, 'Forbidden');

    return {
      absolute: real,
      relative: path.relative(root, real).split(path.sep).join('/'),
    };
  };
}

const resolverCache = new Map<string, SafeResolver>();

export async function getLibraryResolver(libraryId: string): Promise<{ library: Library; resolveSafe: SafeResolver }> {
  const library = await getLibrary(libraryId);
  if (!library) {
    throw new HttpError(404, 'Library not found');
  }

  let resolver = resolverCache.get(library.id);
  if (!resolver) {
    resolver = await createSafeResolver(library.path);
    resolverCache.set(library.id, resolver);
  }
  return { library, resolveSafe: resolver };
}

export function clearResolverCache(libraryId?: string) {
  if (libraryId) {
    resolverCache.delete(libraryId);
  } else {
    resolverCache.clear();
  }
}
