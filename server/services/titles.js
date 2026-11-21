import path from 'node:path';

export const VIDEO_EXTENSIONS = new Set([
  '.mp4', '.mkv', '.avi', '.mov', '.wmv', '.flv', '.webm', '.m4v',
  '.mpg', '.mpeg', '.ts', '.m2ts', '.3gp', '.ogv', '.vob', '.divx', '.xvid'
]);

export function isVideo(file) {
  return VIDEO_EXTENSIONS.has(path.extname(file).toLowerCase());
}

// Termos comuns em nomes de arquivos de release que não fazem parte do título
const JUNK = [
  '2160p', '1080p', '720p', '480p', '4k', 'uhd', 'hd', 'fullhd', 'fhd',
  'bluray', 'blu-ray', 'brrip', 'bdrip', 'dvdrip', 'webrip', 'web-dl', 'webdl', 'web',
  'hdrip', 'hdtv', 'dvdscr', 'cam', 'ts', 'remux', 'hdr', 'hdr10', 'dv', 'sdr',
  'x264', 'x265', 'h264', 'h265', 'hevc', 'avc', 'xvid', 'divx', '10bit', '8bit',
  'aac', 'ac3', 'dts', 'ddp', 'dd5', 'atmos', 'truehd', 'mp3', '5.1', '7.1', '2.0',
  'dual', 'dublado', 'legendado', 'nacional', 'audio', 'multi', 'subs', 'sub',
  'extended', 'unrated', 'remastered', 'directors', 'cut', 'proper', 'repack', 'imax',
  'yify', 'yts', 'rarbg', 'amzn', 'nf', 'dsnp', 'hmax', 'pt-br', 'ptbr', 'eng', 'pt'
];
const JUNK_RE = new RegExp(`(^|\\s)(${JUNK.map(j => j.replace(/[.\-]/g, '\\$&')).join('|')})(?=\\s|$)`, 'i');

/**
 * Converte "The.Matrix.1999.1080p.BluRay.x264.mkv" em { title: "The Matrix", year: 1999 }
 */
export function parseTitle(file) {
  let name = path.basename(file, path.extname(file));
  name = name.replace(/\[[^\]]*\]/g, ' ');            // remove [tags]
  name = name.replace(/[._]+/g, ' ').replace(/\s+/g, ' ').trim();

  let year = null;
  // Ano entre parênteses ou solto: o último ano plausível marca o fim do título
  const yearRe = /\(?\b(19[2-9]\d|20\d{2})\b\)?/g;
  let match, lastMatch = null;
  while ((match = yearRe.exec(name)) !== null) {
    if (match.index > 0) lastMatch = match; // ano no início provavelmente é parte do título (ex.: "2001 ...")
  }
  if (lastMatch) {
    year = Number(lastMatch[1]);
    name = name.slice(0, lastMatch.index);
  }

  // Corta no primeiro termo "lixo" de release
  const junk = JUNK_RE.exec(name);
  if (junk && junk.index > 0) name = name.slice(0, junk.index);

  name = name.replace(/\([^)]*\)/g, ' ').replace(/[-–—]+\s*$/, '').replace(/\s+/g, ' ').trim();
  if (!name) name = path.basename(file, path.extname(file));

  return { title: name, year };
}
