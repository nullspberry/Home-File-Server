import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from './config';
import { HttpError } from './errors';

export interface Library {
  id: string;
  name: string;
  path: string;
}

export type PublicLibrary = Omit<Library, 'path'>;

let libraries: Library[] = [];
let initialized = false;

export async function initLibraries(): Promise<Library[]> {
  if (initialized) return libraries;
  try {
    const content = await fs.readFile(config.dataPath, 'utf8');
    libraries = JSON.parse(content);
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      const defaultPath = path.resolve('movies');
      try {
        await fs.mkdir(defaultPath, { recursive: true });
        const real = await fs.realpath(defaultPath);
        libraries = [
          {
            id: 'default',
            name: 'Default Movies',
            path: real.split(path.sep).join('/'),
          },
        ];
      } catch {
        libraries = [];
      }
      await saveLibraries();
    } else {
      console.error('Error loading libraries store:', err);
      libraries = [];
    }
  }
  initialized = true;
  return libraries;
}

export async function saveLibraries(): Promise<void> {
  try {
    await fs.mkdir(path.dirname(config.dataPath), { recursive: true });
    await fs.writeFile(config.dataPath, JSON.stringify(libraries, null, 2), 'utf8');
  } catch (err) {
    console.error('Failed to save libraries:', err);
    throw new HttpError(500, 'Failed to save registered paths');
  }
}

export async function getPublicLibraries(): Promise<PublicLibrary[]> {
  await initLibraries();
  return libraries.map(({ id, name }) => ({ id, name }));
}

export async function getAdminLibraries(): Promise<Library[]> {
  await initLibraries();
  return libraries.map(({ id, name, path }) => ({ id, name, path }));
}

export async function getLibrary(id: string): Promise<Library | null> {
  await initLibraries();
  return libraries.find((lib) => lib.id === id) ?? null;
}

export async function addLibrary(name: string, rawPath: string): Promise<Library> {
  await initLibraries();
  if (!name || typeof name !== 'string' || !name.trim()) {
    throw new HttpError(400, 'Library name is required');
  }
  if (!rawPath || typeof rawPath !== 'string' || !rawPath.trim()) {
    throw new HttpError(400, 'Directory path is required');
  }

  const resolved = path.resolve(rawPath.trim());
  let stat;
  try {
    stat = await fs.stat(resolved);
  } catch {
    throw new HttpError(400, `Directory does not exist: ${rawPath}`);
  }

  if (!stat.isDirectory()) {
    throw new HttpError(400, `Path is not a directory: ${rawPath}`);
  }

  const real = await fs.realpath(resolved);
  const normalizedPath = real.split(path.sep).join('/');

  const existing = libraries.find(
    (l) => l.path.toLowerCase() === normalizedPath.toLowerCase(),
  );
  if (existing) {
    throw new HttpError(409, `Directory already registered under "${existing.name}"`);
  }

  const id = 'lib_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const newLib: Library = {
    id,
    name: name.trim(),
    path: normalizedPath,
  };

  libraries.push(newLib);
  await saveLibraries();
  return newLib;
}

export async function removeLibrary(id: string): Promise<Library> {
  await initLibraries();
  const index = libraries.findIndex((l) => l.id === id);
  if (index === -1) {
    throw new HttpError(404, 'Library not found');
  }
  const removed = libraries.splice(index, 1)[0];
  await saveLibraries();
  return removed;
}
