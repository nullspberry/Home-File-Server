# Home Movie Server: Complete Implementation Guide

*Prepared for Gil · November 9, 2026 · Backend and frontend as two separate projects*

## 0. What you will build

A movie library that lives on your PC and streams to any phone, tablet or laptop on your wifi. A guest scans a QR code, browses folders, presses play, seeks freely, and can switch subtitles on.

It is built as **two independent projects**:

| Project | Tech | Port | Job |
| --- | --- | --- | --- |
| backend | Node.js with only built-in modules (zero npm dependencies) | 3000 | Lists folders, streams video bytes, serves subtitles. Knows nothing about the UI. |
| frontend | React + Vite | 5173 | Draws the UI. Knows nothing about your disk. Talks to the backend over HTTP. |

Three mnemonics carry the whole guide:

- **D-R-C** (Decode, Resolve, Contain): how the server is locked inside one folder.
- **G-R-A-C-E** (Guard, Route, Authorize, Compute headers, Emit bytes): what every stream request does.
- **L-E-D** (Loading, Error, Data): the three states every React screen that fetches data must render.

**Build order:** backend first (test it with curl and the browser address bar), then frontend, then network setup, then optional video conversion.

## 1. Architecture and API contract

```
Guest phone --wifi--> http://192.168.1.20:5173      (frontend: static React files)
      |
      +-- JavaScript in that page calls --> http://192.168.1.20:3000   (backend)
                                             |-- GET /api/health
                                             |-- GET /api/list?path=Action
                                             |-- GET /stream/Action/Matrix.mp4     (Range support)
                                             +-- GET /subtitle/Action/Matrix.en.srt
                                                    |
                                          MEDIA_ROOT (C:/Movies)  <- nothing outside this
```

Two design decisions come out of separating the projects:

1. **The frontend finds the backend from its own address.** It uses `window.location.hostname` plus port 3000, so the same build works whether the guest opened `192.168.1.20` or `mypc.local`. No hardcoded IP.
2. **CORS is required.** The page is on port 5173 and the API on port 3000. Browsers treat different ports as different origins, so the backend must send `Access-Control-Allow-Origin`. We allow only private-network origins (section A3), not the whole internet.

**The contract** (this is the only thing the two projects share):

| Request | Response |
| --- | --- |
| `GET /api/health` | `{ ok: true }` |
| `GET /api/list?path=Action` | `{ path, parent, items: [{ name, path, kind, size?, ext? }] }` where `kind` is `folder`, `video` or `subtitle` |
| `GET /stream/<path>` | Video bytes. `200` normally, `206` when the browser sends a `Range` header |
| `GET /subtitle/<path>` | WebVTT text (`.srt` files are converted on the fly) |
| Any error | `{ error: 'message' }` with a matching status code |

## 2. Prerequisites and workspace

In PowerShell:

```powershell
node -v          # you have v24.x, good. Anything 22+ works for this guide
mkdir C:/Movies  # skip if it exists; put one small .mp4 inside for testing
mkdir movie-stream
cd movie-stream
mkdir backend, frontend
```

Final layout (we create every file below, in this order):

```
movie-stream/
  backend/
    .env
    package.json
    src/
      server.js            entry point: createServer + routing
      config.js            reads environment variables
      errors.js            HttpError class
      lib/
        http.js            sendJson, sendError, decodePath
        cors.js            CORS rules
        mime.js            extension -> type/kind
        safePath.js        THE folder lock (D-R-C)
        range.js           Range header parser
        subtitles.js       SRT -> VTT
        network.js         find LAN IP for the startup banner
      routes/
        list.js            GET /api/list
        stream.js          GET /stream/...
        subtitle.js        GET /subtitle/...
    test/
      safePath.test.js
      range.test.js
  frontend/
    (Vite + React project, created in Part B)
```

## Part A: The backend

### A1. Initialize the project

```powershell
cd backend
npm init -y
npm pkg set type=module
npm pkg set scripts.start='node --env-file-if-exists=.env src/server.js'
npm pkg set scripts.dev='node --watch --env-file-if-exists=.env src/server.js'
npm pkg set scripts.test='node --test'
mkdir src/lib, src/routes, test
```

What each line does:

- `type=module` lets us use `import`/`export` instead of `require`.
- `--env-file-if-exists=.env` is built into modern Node: it loads `.env` into `process.env` without the `dotenv` package.
- `--watch` restarts the server when you save a file (development only).
- `node --test` is the built-in test runner. Zero dependencies for the whole backend.

Create `backend/.env`:

```
PORT=3000
HOST=0.0.0.0
MEDIA_ROOT=C:/Movies
MAX_STREAMS=20
ALLOWED_ORIGINS=
```

Use forward slashes in `MEDIA_ROOT`. Node and Windows both accept them, and you avoid escaping problems with backslashes in `.env` files.

### A2. `src/config.js`: one place for settings

```js
import path from 'node:path';

const toInt = (value, fallback) => {
  const n = Number.parseInt(value ?? '', 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

export const config = {
  port: toInt(process.env.PORT, 3000),
  host: process.env.HOST || '0.0.0.0',
  mediaRoot: path.resolve(process.env.MEDIA_ROOT || 'C:/Movies'),
  maxStreams: toInt(process.env.MAX_STREAMS, 20),
  allowedOrigins: (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
};
```

Why it is written this way:

- Every setting has a safe default, so the server starts even with no `.env`.
- `HOST=0.0.0.0` means listen on **all** network interfaces. With `localhost` only your own PC could connect. This is the single most common reason guests cannot reach a home server.
- `path.resolve` turns the folder into a normalized absolute path once, at startup.

### A3. Error and HTTP helpers

**`src/errors.js`**

```js
export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
  }
}
```

Any code can `throw new HttpError(404, 'Not found')`. One central handler turns it into a response. This keeps route code free of repeated `res.writeHead(...)` error branches.

**`src/lib/http.js`**

```js
import { HttpError } from '../errors.js';

export function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    'Cache-Control': 'no-store',
  });
  res.end(payload);
}

export function sendError(res, err) {
  // If bytes are already flowing we cannot change the status code. Drop the connection.
  if (res.headersSent) {
    res.destroy();
    return;
  }
  if (err instanceof HttpError) {
    return sendJson(res, err.status, { error: err.message });
  }
  console.error('Unexpected error:', err); // full detail stays in YOUR terminal
  sendJson(res, 500, { error: 'Internal Server Error' }); // guests get nothing revealing
}

export function decodePath(encoded) {
  try {
    return decodeURIComponent(encoded);
  } catch {
    throw new HttpError(400, 'Malformed URL'); // e.g. a lone % sign
  }
}
```

Points to notice:

- `Buffer.byteLength` (not `.length`) is required for `Content-Length`, because a string with non-ASCII characters has more bytes than characters.
- Unexpected errors are logged for you but the guest only sees a generic message, so stack traces and disk paths never leak.
- `decodeURIComponent` throws on bad input such as `%E0%A4%A`. We convert that into a clean 400.

**`src/lib/cors.js`**

```js
import { config } from '../config.js';

function isPrivateHost(hostname) {
  if (hostname === 'localhost' || hostname.endsWith('.local')) return true;
  const m = /^([0-9]+)[.]([0-9]+)[.]([0-9]+)[.]([0-9]+)$/.exec(hostname);
  if (!m) return false;
  const a = Number(m[1]);
  const b = Number(m[2]);
  return (
    a === 10 ||
    a === 127 ||
    (a === 192 && b === 168) ||
    (a === 172 && b >= 16 && b <= 31)
  );
}

function isAllowedOrigin(origin) {
  if (config.allowedOrigins.includes(origin)) return true;
  try {
    return isPrivateHost(new URL(origin).hostname);
  } catch {
    return false;
  }
}

export function applyCors(req, res) {
  const origin = req.headers.origin;
  if (!origin || !isAllowedOrigin(origin)) return;
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Range');
  res.setHeader('Access-Control-Expose-Headers', 'Content-Range, Content-Length, Accept-Ranges');
}
```

How CORS works here:

- The browser adds an `Origin: http://192.168.1.20:5173` header. If we reply with the same value in `Access-Control-Allow-Origin`, the browser lets the page read the response.
- We echo the origin back only when its hostname is `localhost`, a `.local` name, or a private IP range (10.x, 172.16-31.x, 192.168.x). A malicious website on the internet has a public hostname, so it is refused. Anything else can be added through `ALLOWED_ORIGINS` in `.env`.
- `Vary: Origin` tells caches that the response differs per origin.
- `Expose-Headers` lets the page read `Content-Range`, which is useful when debugging seeking.

### A4. `src/lib/mime.js`: what is a video, what is a subtitle

```js
import path from 'node:path';

const VIDEO = {
  '.mp4': 'video/mp4',
  '.m4v': 'video/mp4',
  '.webm': 'video/webm',
  '.ogv': 'video/ogg',
  '.mov': 'video/quicktime',
  '.mkv': 'video/x-matroska',
};
const SUBTITLE = { '.vtt': 'text/vtt', '.srt': 'application/x-subrip' };

// Containers that essentially every browser plays (H.264/AAC or VP9/Opus inside).
export const WIDELY_PLAYABLE = new Set(['.mp4', '.m4v', '.webm']);

export const extOf = (name) => path.extname(name).toLowerCase();
export const videoType = (name) => VIDEO[extOf(name)] ?? null;

export function kindOf(name) {
  const ext = extOf(name);
  if (VIDEO[ext]) return 'video';
  if (SUBTITLE[ext]) return 'subtitle';
  return null; // anything else is invisible to guests
}
```

This is an **allowlist**: only extensions listed here are ever shown or served. A `.txt` or `.exe` sitting in the folder is simply invisible. Allowlists are safer than blocklists because you cannot forget to ban something.

### A5. `src/lib/safePath.js`: the folder lock (most important file)

This module answers one question: *given text from a stranger, which file on disk may I touch, if any?* Every other file calls it before opening anything.

**Mnemonic D-R-C**

| Letter | Step | Defends against |
| --- | --- | --- |
| **D**ecode | Decode the URL exactly once (done by the router), then reject forbidden characters and segments | `..`, backslashes, drive letters `C:`, NTFS streams `file.mp4::$DATA`, device names like `CON` |
| **R**esolve | `path.resolve` then `fs.realpath` | symlinks and junctions that secretly point elsewhere |
| **C**ontain | the real path must be inside the root, compared with `path.relative` | `C:/Movies-private` pretending to match the prefix `C:/Movies` |

```js
import fs from 'node:fs/promises';
import path from 'node:path';
import { HttpError } from '../errors.js';

// Windows device names: opening C:/Movies/CON would talk to a device, not a file.
const RESERVED_NAME = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])([.].*)?$/i;

// Control characters (including NUL), ':' (drive letters, ::$DATA streams) and backslash.
const isForbiddenChar = (code) => code < 32 || code === 58 || code === 92;

export async function createSafeResolver(rootDir) {
  // Canonical root: symlinks resolved, so comparisons below are apples to apples.
  const root = await fs.realpath(path.resolve(rootDir));

  function isInside(candidate) {
    const rel = path.relative(root, candidate);
    if (rel === '') return true; // the root itself
    if (path.isAbsolute(rel)) return false; // different drive on Windows
    return rel !== '..' && !rel.startsWith('..' + path.sep);
  }

  return async function resolveSafe(relative = '') {
    // D: validate the already-decoded text
    if (
      typeof relative !== 'string' ||
      [...relative].some((ch) => isForbiddenChar(ch.charCodeAt(0)))
    ) {
      throw new HttpError(400, 'Invalid path');
    }
    const segments = relative.split('/').filter((s) => s !== '' && s !== '.');
    for (const seg of segments) {
      if (seg === '..' || RESERVED_NAME.test(seg)) {
        throw new HttpError(400, 'Invalid path');
      }
    }

    // R: resolve, following symlinks and junctions to the true location
    const candidate = path.resolve(root, ...segments);
    let real;
    try {
      real = await fs.realpath(candidate);
    } catch (err) {
      if (err.code === 'ENOENT' || err.code === 'ENOTDIR') {
        throw new HttpError(404, 'Not found');
      }
      throw err;
    }

    // C: the TRUE location must be inside the root
    if (!isInside(real)) throw new HttpError(403, 'Forbidden');

    return {
      absolute: real, // for opening files; never sent to the client
      relative: path.relative(root, real).split(path.sep).join('/'), // safe to show
    };
  };
}
```

Line-by-line reasoning:

- **Factory function.** `createSafeResolver(root)` returns a function bound to one root. Tests can create a resolver for a temporary folder; the server creates one for `MEDIA_ROOT`.
- **`rel.startsWith('..' + path.sep)`.** The earlier plan used `ROOT + path.sep` prefix matching. `path.relative` is the same idea but also handles Windows case-insensitivity and other drives. We check `'..' + sep` rather than just `'..'` so a legitimate file named `..cool.mp4` is not rejected.
- **Why both a `..` check and a containment check?** Defense in depth. The segment check stops the obvious attack early. The containment check is the real guarantee, because it also catches attacks the segment check cannot see, like a junction.
- **Decode once.** The router decodes the URL a single time. If an attacker sends `%252e%252e`, it decodes to the literal text `%2e%2e`, which is just a harmless (missing) filename. Decoding twice would turn it into `..`, so never decode again anywhere.
- **Return values.** `absolute` stays inside the server. Only `relative` goes to clients, so they never learn where your movies live on disk.

### A6. `src/lib/range.js`: parsing the Range header

Why this exists: when you drag the seek bar, the browser does not download the movie from the start. It asks for bytes from some offset: `Range: bytes=734003200-`. The server must reply `206 Partial Content` with exactly those bytes.

```js
// Returns:
//   null            -> no usable Range header: send the whole file (200)
//   'unsatisfiable' -> valid syntax but outside the file: reply 416
//   { start, end }  -> inclusive byte offsets to send: reply 206
export function parseRange(header, size) {
  if (!header) return null;
  const match = /^bytes=([0-9]*)-([0-9]*)$/.exec(header.trim());
  if (!match) return null; // other units, multi-ranges, garbage: allowed to ignore
  const [, first, last] = match;
  if (first === '' && last === '') return null;

  let start;
  let end;
  if (first === '') {
    // suffix form 'bytes=-500': the LAST 500 bytes
    const suffix = Number(last);
    if (suffix === 0) return 'unsatisfiable';
    start = Math.max(size - suffix, 0);
    end = size - 1;
  } else {
    start = Number(first);
    end = last === '' ? size - 1 : Math.min(Number(last), size - 1);
  }
  if (start >= size || start > end) return 'unsatisfiable';
  return { start, end };
}
```

The three forms the function understands:

| Header | Meaning | Result for a 1000-byte file |
| --- | --- | --- |
| `bytes=0-499` | first 500 bytes | `{ start: 0, end: 499 }` |
| `bytes=500-` | from byte 500 to the end | `{ start: 500, end: 999 }` |
| `bytes=-100` | last 100 bytes | `{ start: 900, end: 999 }` |
| `bytes=2000-` | beyond the file | `'unsatisfiable'` (416) |

Remember: **206 = Partial, 416 = Requested range not satisfiable**. Byte offsets are **inclusive**, so a response for `start..end` has `end - start + 1` bytes.

### A7. Test the lock before building on it

We write tests now, while only two small modules exist. A security module you have not attacked yourself is a module you only hope works.

**`test/safePath.test.js`**

```js
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createSafeResolver } from '../src/lib/safePath.js';

// A throwaway world:  base/Movies (the root)  and  base/Movies-private (the secret)
const base = await fs.mkdtemp(path.join(os.tmpdir(), 'movie-test-'));
const root = path.join(base, 'Movies');
const secret = path.join(base, 'Movies-private');
await fs.mkdir(path.join(root, 'Action'), { recursive: true });
await fs.mkdir(secret);
await fs.writeFile(path.join(root, 'Action', 'matrix.mp4'), 'video');
await fs.writeFile(path.join(secret, 'secret.txt'), 'top secret');
// A junction INSIDE the root that points OUTSIDE it (no admin rights needed on Windows).
await fs.symlink(secret, path.join(root, 'escape'), 'junction');

const resolveSafe = await createSafeResolver(root);
after(() => fs.rm(base, { recursive: true, force: true }));

const BACKSLASH = String.fromCharCode(92);
const NUL = String.fromCharCode(0);

test('allows a normal file', async () => {
  const r = await resolveSafe('Action/matrix.mp4');
  assert.equal(r.relative, 'Action/matrix.mp4');
});

test('empty path is the root', async () => {
  const r = await resolveSafe('');
  assert.equal(r.relative, '');
});

// [description, input (already URL-decoded), expected status]
const attacks = [
  ['dot-dot traversal', '../Movies-private/secret.txt', 400],
  ['nested dot-dot', 'Action/../../Movies-private/secret.txt', 400],
  ['backslash traversal', '..' + BACKSLASH + 'Movies-private', 400],
  ['drive letter', 'C:/Windows/win.ini', 400],
  ['NTFS alternate stream', 'Action/matrix.mp4::$DATA', 400],
  ['NUL byte', 'Action/matrix.mp4' + NUL, 400],
  ['device name', 'Action/CON', 400],
  ['junction escape (sibling with same prefix)', 'escape/secret.txt', 403],
  ['missing file', 'Action/nope.mp4', 404],
  ['double-encoded text is just a filename', '%2e%2e/Movies-private', 404],
];

for (const [name, input, status] of attacks) {
  test('rejects: ' + name, async () => {
    await assert.rejects(resolveSafe(input), { status });
  });
}
```

What the interesting cases prove:

- **Junction escape** is the test that proves `fs.realpath` matters. The *name* `escape/secret.txt` looks innocent, but the *real* location is outside the root. It is also the sibling-prefix case: `Movies-private` starts with the text `Movies`, yet is not inside it.
- **Double-encoded text** proves the decode-once rule. After one decode the router hands us the literal characters `%2e%2e`. Those are not dots, so the file is simply not found.
- `assert.rejects(promise, { status })` checks that the thrown `HttpError` carries exactly that status code.

**`test/range.test.js`**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRange } from '../src/lib/range.js';

test('no header means whole file', () => {
  assert.equal(parseRange(undefined, 1000), null);
});
test('closed range', () => {
  assert.deepEqual(parseRange('bytes=0-499', 1000), { start: 0, end: 499 });
});
test('open-ended range', () => {
  assert.deepEqual(parseRange('bytes=500-', 1000), { start: 500, end: 999 });
});
test('end is clamped to the file size', () => {
  assert.deepEqual(parseRange('bytes=900-5000', 1000), { start: 900, end: 999 });
});
test('suffix range', () => {
  assert.deepEqual(parseRange('bytes=-100', 1000), { start: 900, end: 999 });
});
test('suffix longer than the file', () => {
  assert.deepEqual(parseRange('bytes=-5000', 1000), { start: 0, end: 999 });
});
test('start beyond the file is unsatisfiable', () => {
  assert.equal(parseRange('bytes=2000-', 1000), 'unsatisfiable');
});
test('multi-range and other units are ignored', () => {
  assert.equal(parseRange('bytes=0-1,5-6', 1000), null);
  assert.equal(parseRange('items=0-1', 1000), null);
});
test('empty file cannot satisfy a range', () => {
  assert.equal(parseRange('bytes=0-', 0), 'unsatisfiable');
});
```

Run them:

```powershell
npm test
```

You should see every test pass. If one fails, fix the module before moving on, because everything below depends on these two files.

### A8. `src/routes/list.js`: browsing folders

```js
import fs from 'node:fs/promises';
import { HttpError } from '../errors.js';
import { sendJson } from '../lib/http.js';
import { extOf, kindOf } from '../lib/mime.js';

const HIDDEN_NAMES = new Set([
  'thumbs.db',
  'desktop.ini',
  '$recycle.bin',
  'system volume information',
]);
const isHidden = (name) => name.startsWith('.') || HIDDEN_NAMES.has(name.toLowerCase());

// numeric: true makes 'Episode 2' sort before 'Episode 10'
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

export function createListHandler(resolveSafe) {
  return async function handleList(req, res, url) {
    const { absolute, relative } = await resolveSafe(url.searchParams.get('path') ?? '');
    const stat = await fs.stat(absolute);
    if (!stat.isDirectory()) throw new HttpError(400, 'Not a folder');

    const entries = await fs.readdir(absolute, { withFileTypes: true });
    const items = (
      await Promise.all(
        entries.map(async (entry) => {
          if (isHidden(entry.name)) return null;
          const childPath = relative ? relative + '/' + entry.name : entry.name;
          try {
            const child = await resolveSafe(childPath); // the same lock, for every entry
            const info = await fs.stat(child.absolute);
            if (info.isDirectory()) {
              return { name: entry.name, path: childPath, kind: 'folder' };
            }
            if (!info.isFile()) return null;
            const kind = kindOf(entry.name);
            if (!kind) return null;
            return {
              name: entry.name,
              path: childPath,
              kind,
              size: info.size,
              ext: extOf(entry.name),
            };
          } catch {
            return null; // unreadable, broken link, or escapes the root: just hide it
          }
        }),
      )
    ).filter(Boolean);

    items.sort((a, b) => {
      const aFolder = a.kind === 'folder';
      const bFolder = b.kind === 'folder';
      if (aFolder !== bFolder) return aFolder ? -1 : 1; // folders first
      return collator.compare(a.name, b.name);
    });

    const parent = relative ? relative.split('/').slice(0, -1).join('/') : null;
    sendJson(res, 200, { path: relative, parent, items });
  };
}
```

Key ideas:

- **Every entry goes through `resolveSafe` again.** A junction in the folder that leads outside the root fails the Contain step and silently disappears from the listing. The guest never even learns it exists.
- **`Promise.all` with `map`** checks all entries in parallel instead of one by one, which keeps big folders fast.
- **Only relative paths are returned** (`Action/Matrix.mp4`), never `C:/Movies/Action/Matrix.mp4`.
- **`parent`** is `null` at the root and a string otherwise (an empty string means the parent is the root). The frontend uses it for a back link.

Example response:

```json
{
  "path": "Action",
  "parent": "",
  "items": [
    { "name": "Matrix.mp4", "path": "Action/Matrix.mp4", "kind": "video", "size": 1503238553, "ext": ".mp4" },
    { "name": "Matrix.en.srt", "path": "Action/Matrix.en.srt", "kind": "subtitle", "size": 91233, "ext": ".srt" }
  ]
}
```

### A9. `src/routes/stream.js`: the technical core

**Mnemonic G-R-A-C-E.** Every stream request passes five stations:

| Letter | Station | Where in the code |
| --- | --- | --- |
| **G**uard | Only GET/HEAD; capacity limit | router (method) and top of this handler (capacity) |
| **R**oute | Which handler owns this URL? | `server.js` |
| **A**uthorize | Is this path allowed? (D-R-C) | `resolveSafe` call |
| **C**ompute | Work out status, range and headers | middle of this handler |
| **E**mit | Pipe bytes from disk to socket | last lines |

```js
import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { pipeline } from 'node:stream';
import { config } from '../config.js';
import { HttpError } from '../errors.js';
import { videoType } from '../lib/mime.js';
import { parseRange } from '../lib/range.js';

let activeStreams = 0;

export function createStreamHandler(resolveSafe) {
  return async function handleStream(req, res, relativePath) {
    // G: capacity guard. Count now, release when the response closes for ANY reason.
    if (activeStreams >= config.maxStreams) {
      res.setHeader('Retry-After', '5');
      throw new HttpError(503, 'Server is busy');
    }
    activeStreams++;
    res.on('close', () => {
      activeStreams--;
    });

    // A: authorize the path
    const { absolute } = await resolveSafe(relativePath);
    const info = await fs.stat(absolute);
    if (!info.isFile()) throw new HttpError(404, 'Not found');
    const type = videoType(absolute);
    if (!type) throw new HttpError(415, 'Unsupported media type');

    // C: compute status and headers
    const size = info.size;
    const range = parseRange(req.headers.range, size);
    if (range === 'unsatisfiable') {
      res.writeHead(416, { 'Content-Range': 'bytes */' + size });
      return res.end();
    }
    const start = range ? range.start : 0;
    const end = range ? range.end : size - 1;
    const headers = {
      'Content-Type': type,
      'Accept-Ranges': 'bytes',
      'Content-Length': size === 0 ? 0 : end - start + 1,
      'Last-Modified': info.mtime.toUTCString(),
      'Cache-Control': 'no-cache',
    };
    if (range) headers['Content-Range'] = 'bytes ' + start + '-' + end + '/' + size;
    res.writeHead(range ? 206 : 200, headers);

    // E: emit bytes (HEAD gets headers only)
    if (req.method === 'HEAD' || size === 0) return res.end();
    pipeline(createReadStream(absolute, { start, end }), res, () => {
      // Errors here are normal: the guest closed the tab or seeked elsewhere.
    });
  };
}
```

Why each decision matters:

- **`Accept-Ranges: bytes`** advertises seeking. Without it, many browsers disable the seek bar.
- **`206` + `Content-Range: bytes 100-199/5000`** says: here are bytes 100 to 199 of a 5000-byte file. `Content-Length` is `end - start + 1`.
- **`createReadStream(file, { start, end })`** reads only that slice from disk. A 10 GB movie costs a few kilobytes of memory, never the whole file.
- **`pipeline` is the leak preventer.** If the guest closes the tab or drags the seek bar, the socket closes. `pipeline` notices, destroys the file stream and releases the file handle. Plain `.pipe()` does not do this reliably and leaks handles. It also respects back-pressure, so a slow phone on weak wifi never makes Node buffer the whole movie in RAM (the streams chapter of *Node.js Design Patterns*, in your project files, covers this in depth).
- **Counting streams** protects your PC. A seek aborts the old request, so the counter drops quickly in normal use. Twenty simultaneous streams is far more than a living room needs.
- **Why the handler is `async` and the router uses `return await`:** an error thrown inside an `async` function becomes a rejected promise. Without `await`, it would skip the router's `try/catch` and the guest would see a hung connection.

### A10. Subtitles

Browsers only understand **WebVTT**. Most downloaded subtitles are **SRT**. The two formats differ in a header line and in the timestamp separator (comma in SRT, dot in VTT).

**`src/lib/subtitles.js`**

```js
export function srtToVtt(srt) {
  const text = srt.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n'); // strip BOM, normalize line endings
  const withDots = text.replace(
    /([0-9]{2}:[0-9]{2}:[0-9]{2}),([0-9]{3})/g,
    '$1.$2', // 00:01:02,500 -> 00:01:02.500
  );
  return 'WEBVTT\n\n' + withDots;
}
```

SRT cue numbers (`1`, `2`, ...) are legal WebVTT cue identifiers, so no further conversion is needed.

**`src/routes/subtitle.js`**

```js
import fs from 'node:fs/promises';
import { HttpError } from '../errors.js';
import { extOf } from '../lib/mime.js';
import { srtToVtt } from '../lib/subtitles.js';

const MAX_SUBTITLE_BYTES = 2 * 1024 * 1024; // real subtitle files are ~100 KB

export function createSubtitleHandler(resolveSafe) {
  return async function handleSubtitle(req, res, relativePath) {
    const { absolute } = await resolveSafe(relativePath);
    const ext = extOf(absolute);
    if (ext !== '.srt' && ext !== '.vtt') throw new HttpError(415, 'Unsupported media type');

    const info = await fs.stat(absolute);
    if (!info.isFile()) throw new HttpError(404, 'Not found');
    if (info.size > MAX_SUBTITLE_BYTES) throw new HttpError(413, 'Subtitle file too large');

    const raw = await fs.readFile(absolute, 'utf8');
    const body = ext === '.srt' ? srtToVtt(raw) : raw;
    res.writeHead(200, {
      'Content-Type': 'text/vtt; charset=utf-8',
      'Content-Length': Buffer.byteLength(body),
      'Cache-Control': 'no-cache',
    });
    res.end(body); // Node drops the body automatically for HEAD requests
  };
}
```

The size cap matters because here we read the *whole* file into memory (unlike video). A cap stops anyone from pointing the route at a huge file. Note this assumes UTF-8 text. An old subtitle saved in a legacy encoding will show garbled accents; re-save it as UTF-8 in any text editor.

### A11. `src/lib/network.js`: show guests where to connect

```js
import os from 'node:os';

export function lanAddresses() {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter((i) => i && i.family === 'IPv4' && !i.internal)
    .map((i) => i.address);
}
```

`os.networkInterfaces()` lists every network adapter. We keep IPv4 addresses that are not loopback (`internal`). Your wifi address (like `192.168.1.20`) is what we print in the startup banner.

### A12. `src/server.js`: wiring everything together

```js
import http from 'node:http';
import { config } from './config.js';
import { HttpError } from './errors.js';
import { applyCors } from './lib/cors.js';
import { decodePath, sendError, sendJson } from './lib/http.js';
import { lanAddresses } from './lib/network.js';
import { createSafeResolver } from './lib/safePath.js';
import { createListHandler } from './routes/list.js';
import { createStreamHandler } from './routes/stream.js';
import { createSubtitleHandler } from './routes/subtitle.js';

const STREAM_PREFIX = '/stream/';
const SUBTITLE_PREFIX = '/subtitle/';

// Build the lock once. If MEDIA_ROOT does not exist, we fail right here with a clear error.
const resolveSafe = await createSafeResolver(config.mediaRoot);
const handleList = createListHandler(resolveSafe);
const handleStream = createStreamHandler(resolveSafe);
const handleSubtitle = createSubtitleHandler(resolveSafe);

const server = http.createServer(async (req, res) => {
  try {
    applyCors(req, res); // first, so even error responses carry CORS headers

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      return res.end();
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.setHeader('Allow', 'GET, HEAD, OPTIONS');
      throw new HttpError(405, 'Method Not Allowed');
    }

    let url;
    try {
      url = new URL(req.url, 'http://localhost');
    } catch {
      throw new HttpError(400, 'Bad request');
    }
    const { pathname } = url;

    if (pathname === '/api/health') return sendJson(res, 200, { ok: true });
    if (pathname === '/api/list') return await handleList(req, res, url);
    if (pathname.startsWith(STREAM_PREFIX)) {
      return await handleStream(req, res, decodePath(pathname.slice(STREAM_PREFIX.length)));
    }
    if (pathname.startsWith(SUBTITLE_PREFIX)) {
      return await handleSubtitle(req, res, decodePath(pathname.slice(SUBTITLE_PREFIX.length)));
    }
    throw new HttpError(404, 'Not found');
  } catch (err) {
    sendError(res, err); // the single exit point for every failure
  }
});

server.headersTimeout = 15_000;
server.requestTimeout = 30_000; // time allowed to RECEIVE a request; it does not cap movie length

server.on('error', (err) => {
  console.error(
    err.code === 'EADDRINUSE'
      ? 'Port ' + config.port + ' is already in use. Is another copy running?'
      : err,
  );
  process.exit(1);
});

server.listen(config.port, config.host, () => {
  console.log('Movie backend ready. Serving: ' + config.mediaRoot);
  console.log('  This PC:  http://localhost:' + config.port);
  for (const ip of lanAddresses()) console.log('  Network:  http://' + ip + ':' + config.port);
});

function shutdown() {
  console.log('Shutting down...');
  server.close(() => process.exit(0));
  server.closeAllConnections(); // otherwise an open stream keeps the server alive
}
process.on('SIGINT', shutdown); // Ctrl+C
process.on('SIGTERM', shutdown);
```

Walkthrough of one request, top to bottom:

1. **CORS first**, then **method check** (only GET, HEAD and the CORS preflight OPTIONS are accepted; everything else is `405`).
2. **Parse the URL.** `new URL(req.url, base)` splits the path from the query string.
3. **Route by path.** `pathname` is still percent-encoded here. For `/stream/` and `/subtitle/` we decode exactly once with `decodePath`. For `/api/list` the query value is already decoded by `searchParams`.
4. Any `HttpError` thrown anywhere lands in the one `catch`, so the response format is consistent.

There is intentionally **no route for static files and no directory listing of the disk**. The backend can only do the four things in the contract.

### A13. Run it and attack it

```powershell
npm start
```

Expected banner:

```
Movie backend ready. Serving: C:/Movies
  This PC:  http://localhost:3000
  Network:  http://192.168.1.20:3000
```

In a **second** PowerShell window (note `curl.exe`: plain `curl` in PowerShell is an alias for a different command):

```powershell
curl.exe http://localhost:3000/api/health
curl.exe 'http://localhost:3000/api/list?path='

# Replace the path below with a real file from your list output
curl.exe -I http://localhost:3000/stream/Action/Matrix.mp4
curl.exe -s -D - -o NUL -H 'Range: bytes=0-99' http://localhost:3000/stream/Action/Matrix.mp4
```

The last command should print `HTTP/1.1 206 Partial Content`, `Content-Range: bytes 0-99/<size>` and `Content-Length: 100`.

Now the attacks. Each one must fail:

```powershell
curl.exe -i --path-as-is 'http://localhost:3000/stream/..%2f..%2fWindows%2fwin.ini'   # 400
curl.exe -i --path-as-is 'http://localhost:3000/stream/%252e%252e/secret'              # 404
curl.exe -i -X POST http://localhost:3000/api/health                                   # 405
curl.exe -i http://localhost:3000/api/list?path=C:/Windows                             # 400
```

(`--path-as-is` stops curl from tidying `..` itself, so the server sees the raw attack.)

Finally the real-world test: paste `http://localhost:3000/stream/Action/Matrix.mp4` into Chrome. It opens the browser's built-in player. Drag the seek bar and watch the Network tab: you should see several requests with status `206`.

**Backend is finished when:** `npm test` passes, the four attack commands fail, and seeking works in the built-in player. Do not start the frontend until all three are true.
