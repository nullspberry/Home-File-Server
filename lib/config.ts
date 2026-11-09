import path from 'node:path';

const toInt = (value: string | undefined, fallback: number): number => {
  const n = Number.parseInt(value ?? '', 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

export const config = {
  port: toInt(process.env.PORT, 3000),
  host: process.env.HOST || '0.0.0.0',
  adminUsername: process.env.ADMIN_USERNAME || 'admin',
  adminPassword: process.env.ADMIN_PASSWORD || 'admin123',
  sessionSecret: process.env.SESSION_SECRET || 'super-secret-key-for-home-media',
  maxStreams: toInt(process.env.MAX_STREAMS, 20),
  dataPath: path.resolve('data/libraries.json'),
};
