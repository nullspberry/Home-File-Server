export function srtToVtt(srt: string): string {
  const text = srt.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const withDots = text.replace(
    /([0-9]{2}:[0-9]{2}:[0-9]{2}),([0-9]{3})/g,
    '$1.$2',
  );
  return 'WEBVTT\n\n' + withDots;
}
