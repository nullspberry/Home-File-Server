import path from 'node:path';

const VIDEO: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.m4v': 'video/mp4',
  '.webm': 'video/webm',
  '.ogv': 'video/ogg',
  '.mov': 'video/quicktime',
  '.mkv': 'video/x-matroska',
  '.avi': 'video/x-msvideo',
  '.ts': 'video/mp2t',
};

const SUBTITLE: Record<string, string> = {
  '.vtt': 'text/vtt',
  '.srt': 'application/x-subrip',
};

const AUDIO: Record<string, string> = {
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.flac': 'audio/flac',
  '.aac': 'audio/aac',
  '.ogg': 'audio/ogg',
  '.m4a': 'audio/mp4',
};

export const WIDELY_PLAYABLE = new Set(['.mp4', '.m4v', '.webm']);

export const extOf = (name: string): string => path.extname(name).toLowerCase();
export const videoType = (name: string): string | null => VIDEO[extOf(name)] ?? null;
export const audioType = (name: string): string | null => AUDIO[extOf(name)] ?? null;
export const subtitleType = (name: string): string | null => SUBTITLE[extOf(name)] ?? null;

export function kindOf(name: string): 'video' | 'subtitle' | 'audio' | 'file' {
  const ext = extOf(name);
  if (VIDEO[ext]) return 'video';
  if (SUBTITLE[ext]) return 'subtitle';
  if (AUDIO[ext]) return 'audio';
  return 'file';
}
