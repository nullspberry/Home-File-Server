export type RangeResult =
  | null
  | 'unsatisfiable'
  | { start: number; end: number };

export function parseRange(header: string | null | undefined, size: number): RangeResult {
  if (!header) return null;
  const match = /^bytes=([0-9]*)-([0-9]*)$/.exec(header.trim());
  if (!match) return null;
  const [, first, last] = match;
  if (first === '' && last === '') return null;

  let start: number;
  let end: number;
  if (first === '') {
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
