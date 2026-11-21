import { spawn, execFile } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);
export const FFMPEG = process.env.FFMPEG_PATH || 'ffmpeg';
export const FFPROBE = process.env.FFPROBE_PATH || 'ffprobe';

const SUB_EXT = new Set(['.srt', '.vtt', '.ass', '.ssa', '.sub']);
const TEXT_SUB_CODECS = new Set(['subrip', 'srt', 'ass', 'ssa', 'webvtt', 'mov_text', 'text']);
const DIRECT_CONTAINERS = new Set(['mp4', 'm4v', 'webm']);
const DIRECT_VIDEO = new Set(['h264', 'vp8', 'vp9', 'av1']);
const DIRECT_AUDIO = new Set(['aac', 'mp3', 'opus', 'vorbis']);
const COPY_VIDEO = new Set(['h264']); // pode ir para HLS sem recodificar

const LANGS = {
  por: 'Português', pt: 'Português', 'pt-br': 'Português (Brasil)', ptbr: 'Português (Brasil)', 'pt-pt': 'Português (Portugal)', pob: 'Português (Brasil)',
  eng: 'Inglês', en: 'Inglês', spa: 'Espanhol', es: 'Espanhol', fre: 'Francês', fra: 'Francês', fr: 'Francês',
  ger: 'Alemão', deu: 'Alemão', de: 'Alemão', ita: 'Italiano', it: 'Italiano', jpn: 'Japonês', ja: 'Japonês',
  kor: 'Coreano', ko: 'Coreano', chi: 'Chinês', zho: 'Chinês', zh: 'Chinês', rus: 'Russo', ru: 'Russo',
  hin: 'Hindi', ara: 'Árabe', pol: 'Polonês', dut: 'Holandês', nld: 'Holandês', tur: 'Turco', swe: 'Sueco'
};
// Normaliza códigos para comparar preferências (pt, pt-BR, por -> "pt")
export function langKey(code) {
  const c = (code || '').toLowerCase();
  if (!c || c === 'und') return '';
  if (/^(por|pob|pt)/.test(c)) return 'pt';
  if (/^(eng|en)$/.test(c)) return 'en';
  if (/^(spa|es)$/.test(c)) return 'es';
  return c.slice(0, 3);
}
const langName = code => LANGS[(code || '').toLowerCase()] || (code && code !== 'und' ? code.toUpperCase() : '');
const channelsName = n => n >= 8 ? '7.1' : n >= 6 ? '5.1' : n === 2 ? 'estéreo' : n === 1 ? 'mono' : n ? `${n} canais` : '';

/* ---------- Detecção do encoder (GPU quando possível) ---------- */

let encoderPromise = null;
export function detectEncoder() {
  encoderPromise ||= (async () => {
    if (process.env.VIDEO_ENCODER) return process.env.VIDEO_ENCODER;
    // Mede a velocidade real de cada encoder (GPU nem sempre é mais rápida que a CPU) e usa o mais rápido
    let best = { enc: 'libx264', ms: Infinity };
    for (const enc of ['libx264', 'h264_nvenc', 'h264_qsv', 'h264_amf']) {
      const t0 = Date.now();
      try {
        await run(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc2=s=1280x720:r=30:d=5',
          '-vf', 'format=yuv420p', ...encoderArgs(enc), '-f', 'null', '-'], { timeout: 30000 });
        const ms = Date.now() - t0;
        if (ms < best.ms * 0.8) best = { enc, ms }; // GPU só vence se for claramente mais rápida
      } catch { /* não disponível */ }
    }
    return best.enc;
  })();
  return encoderPromise;
}

export async function ffmpegAvailable() {
  try { await run(FFMPEG, ['-version'], { timeout: 10000 }); return true; } catch { return false; }
}

function encoderArgs(enc) {
  switch (enc) {
    case 'h264_nvenc': return ['-c:v', enc, '-preset', 'p4', '-rc', 'vbr', '-cq', '23', '-b:v', '0', '-maxrate', '10M', '-bufsize', '20M'];
    case 'h264_qsv': return ['-c:v', enc, '-preset', 'faster', '-global_quality', '23', '-maxrate', '10M'];
    case 'h264_amf': return ['-c:v', enc, '-quality', 'speed', '-rc', 'qvbr', '-qvbr_quality_level', '24', '-maxrate', '10M', '-bufsize', '20M'];
    default: return ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '21', '-profile:v', 'high', '-level', '4.1'];
  }
}

/* ---------- Análise do arquivo (ffprobe) ---------- */

const probeCache = new Map(); // abs -> { mtime, data }

export async function probe(abs) {
  const st = await fsp.stat(abs);
  const cached = probeCache.get(abs);
  let data = cached?.mtime === st.mtimeMs ? cached.data : null;
  if (!data) {
    const { stdout } = await run(FFPROBE, ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', abs], { timeout: 60000, maxBuffer: 20 * 1024 * 1024 });
    data = JSON.parse(stdout);
    probeCache.set(abs, { mtime: st.mtimeMs, data });
  }
  const streams = data.streams || [];
  const video = streams.find(s => s.codec_type === 'video' && !s.disposition?.attached_pic);

  const audioStreams = streams.filter(s => s.codec_type === 'audio');
  const audio = audioStreams.map((s, i) => {
    const lang = s.tags?.language || '';
    const parts = [langName(lang) || `Faixa ${i + 1}`, s.tags?.title && s.tags.title !== langName(lang) ? s.tags.title : null,
      `${(s.codec_name || '').toUpperCase()}${channelsName(s.channels) ? ' ' + channelsName(s.channels) : ''}`].filter(Boolean);
    return { index: i, lang, langKey: langKey(lang), label: parts.join(' · '), default: !!s.disposition?.default, codec: s.codec_name };
  });

  const subtitles = streams.filter(s => s.codec_type === 'subtitle').map((s, i) => {
    const lang = s.tags?.language || '';
    const text = TEXT_SUB_CODECS.has(s.codec_name);
    const flags = [s.disposition?.forced ? 'forçada' : null, s.disposition?.hearing_impaired ? 'SDH' : null].filter(Boolean);
    return {
      id: `e${i}`, lang, langKey: langKey(lang),
      label: [langName(lang) || `Legenda ${i + 1}`, s.tags?.title, ...flags].filter(Boolean).join(' · '),
      supported: text,
      note: text ? '' : 'formato de imagem (não suportado)',
      forced: !!s.disposition?.forced
    };
  });
  subtitles.push(...await externalSubtitles(abs));

  const ext = path.extname(abs).slice(1).toLowerCase();
  const direct = DIRECT_CONTAINERS.has(ext) && video && DIRECT_VIDEO.has(video.codec_name) &&
    (video.pix_fmt || 'yuv420p') === 'yuv420p' && audioStreams.length <= 1 &&
    audioStreams.every(a => DIRECT_AUDIO.has(a.codec_name));

  return {
    duration: Number(data.format?.duration) || 0,
    video: video ? { codec: video.codec_name, width: video.width, height: video.height, pixFmt: video.pix_fmt, sar: parseSar(video.sample_aspect_ratio) } : null,
    audio, subtitles,
    mode: direct ? 'direct' : 'hls',
    copyVideo: !!video && COPY_VIDEO.has(video.codec_name) && (video.pix_fmt || 'yuv420p') === 'yuv420p'
  };
}

function parseSar(s) {
  const [a, b] = String(s || '').split(':').map(Number);
  return a > 0 && b > 0 ? a / b : 1;
}

// Legendas em arquivos ao lado do vídeo: "Filme.srt", "Filme.pt-BR.srt", "Filme.eng.srt"...
async function externalSubtitles(abs) {
  const dir = path.dirname(abs);
  const base = path.basename(abs, path.extname(abs)).toLowerCase();
  let files;
  try { files = await fsp.readdir(dir); } catch { return []; }
  const videosInDir = files.filter(f => /\.(mp4|mkv|avi|mov|wmv|webm|m4v|mpg|mpeg|ts|flv)$/i.test(f)).length;
  return files
    .filter(f => SUB_EXT.has(path.extname(f).toLowerCase()))
    .filter(f => f.toLowerCase().startsWith(base) || videosInDir === 1)
    .sort()
    .map(f => {
      const stem = path.basename(f, path.extname(f));
      const tail = stem.toLowerCase().startsWith(base) ? stem.slice(base.length).replace(/^[\s._-]+/, '') : '';
      const code = (tail.match(/(?:^|[._\s-])(pt-br|pt-pt|ptbr|pob|por|pt|eng|en|spa|es|fre|fra|fr|ger|deu|de|ita|it|jpn|ja)(?=$|[._\s-])/i) || [])[1] || '';
      const forced = /forced|for[cç]ad/i.test(tail);
      return {
        id: 'x' + crypto.createHash('sha1').update(f).digest('hex').slice(0, 10),
        file: f, lang: code, langKey: langKey(code),
        label: [langName(code) || tail || 'Legenda', 'arquivo', forced ? 'forçada' : null].filter(Boolean).join(' · '),
        supported: path.extname(f).toLowerCase() !== '.sub', note: '', forced
      };
    });
}

/* ---------- Legendas → WebVTT ---------- */

function isUtf8(buf) {
  try { new TextDecoder('utf-8', { fatal: true }).decode(buf); return true; } catch { return false; }
}

const subJobs = new Map();
export async function subtitleVtt(abs, info, subId, cacheDir) {
  const sub = info.subtitles.find(s => s.id === subId);
  if (!sub || !sub.supported) throw new Error('Legenda não suportada');
  const st = await fsp.stat(abs);
  const key = crypto.createHash('sha1').update(`${abs}|${st.mtimeMs}|${subId}`).digest('hex').slice(0, 20);
  const out = path.join(cacheDir, `${key}.vtt`);
  try { await fsp.access(out); return out; } catch { /* gerar */ }
  if (subJobs.has(key)) return subJobs.get(key);

  const job = (async () => {
    await fsp.mkdir(cacheDir, { recursive: true });
    let args;
    if (sub.file) {
      const subPath = path.join(path.dirname(abs), sub.file);
      const head = await fsp.readFile(subPath);
      // Muitas legendas brasileiras vêm em Windows-1252 (acentos quebrados se lidas como UTF-8)
      const charset = isUtf8(head) ? [] : ['-sub_charenc', 'CP1252'];
      args = [...charset, '-i', subPath, '-map', '0:s:0'];
    } else {
      args = ['-i', abs, '-map', `0:s:${Number(sub.id.slice(1))}`];
    }
    const tmp = out + '.tmp';
    await run(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', ...args, '-f', 'webvtt', tmp], { timeout: 10 * 60 * 1000 });
    await fsp.rename(tmp, out);
    return out;
  })().finally(() => subJobs.delete(key));
  subJobs.set(key, job);
  return job;
}

/* ---------- Sessões de transcodificação HLS ---------- */

const SEG = 4; // segundos por segmento
const sessions = new Map();

// videoAbs: arquivo alternativo só com o vídeo (versão melhorada); o áudio continua vindo de abs
export async function startSession({ abs, videoAbs, info, audio = 0, start = 0, workDir }) {
  const id = crypto.randomBytes(8).toString('hex');
  const dir = path.join(workDir, id);
  await fsp.mkdir(dir, { recursive: true });
  const enc = await detectEncoder();

  const args = ['-hide_banner', '-loglevel', 'error', '-nostdin'];
  const ss = start > 0 ? ['-ss', String(start)] : [];
  args.push(...ss, '-i', videoAbs || abs);
  if (videoAbs) args.push(...ss, '-i', abs);
  args.push('-map', '0:v:0');
  if (info.audio.length) args.push('-map', `${videoAbs ? 1 : 0}:a:${Math.min(Math.max(0, audio), info.audio.length - 1)}`);
  args.push('-sn', '-dn', '-map_metadata', '-1', '-map_chapters', '-1');

  if (info.copyVideo || videoAbs) {
    args.push('-c:v', 'copy');
  } else {
    const h = info.video?.height || 0;
    const vf = [h > 1080 ? 'scale=-2:1080' : null, 'format=yuv420p'].filter(Boolean).join(',');
    args.push('-vf', vf, ...encoderArgs(enc), '-force_key_frames', `expr:gte(t,n_forced*${SEG})`);
  }
  if (info.audio.length) args.push('-c:a', 'aac', '-ac', '2', '-b:a', '192k');
  args.push(
    '-f', 'hls', '-hls_time', String(SEG), '-hls_list_size', '0',
    '-hls_playlist_type', 'event', '-hls_flags', 'independent_segments',
    '-hls_segment_filename', path.join(dir, 'seg%05d.ts'),
    path.join(dir, 'index.m3u8')
  );

  const proc = spawn(FFMPEG, args, { windowsHide: true });
  let stderr = '';
  proc.stderr.on('data', d => { stderr = (stderr + d).slice(-4000); });
  const session = { id, dir, proc, lastAccess: Date.now(), done: false, failed: false, encoder: videoAbs ? 'copy (melhorado)' : info.copyVideo ? 'copy' : enc };
  proc.on('exit', code => {
    session.done = true;
    if (code && !session.killed) { session.failed = true; console.error(`[ffmpeg] sessão ${id} saiu com código ${code}: ${stderr.trim()}`); }
  });
  sessions.set(id, session);

  // Espera o primeiro segmento ficar pronto
  const playlist = path.join(dir, 'index.m3u8');
  const deadline = Date.now() + 45000;
  while (Date.now() < deadline) {
    try {
      const txt = await fsp.readFile(playlist, 'utf8');
      if (txt.includes('#EXTINF')) return session;
    } catch { /* ainda não existe */ }
    if (session.failed || (session.done && !fs.existsSync(playlist))) break;
    await new Promise(r => setTimeout(r, 250));
  }
  await stopSession(id);
  throw new Error('Falha ao iniciar a conversão do vídeo' + (stderr ? `: ${stderr.trim().split('\n').pop()}` : ''));
}

export function touchSession(id) {
  const s = sessions.get(id);
  if (s) s.lastAccess = Date.now();
  return s;
}

export async function stopSession(id) {
  const s = sessions.get(id);
  if (!s) return;
  sessions.delete(id);
  s.killed = true;
  if (!s.done) s.proc.kill('SIGKILL');
  // No Windows o arquivo pode continuar travado por um instante após matar o processo
  for (let i = 0; i < 10; i++) {
    try { await fsp.rm(s.dir, { recursive: true, force: true }); break; } catch { await new Promise(r => setTimeout(r, 300)); }
  }
}

export function stopAllSessions() {
  return Promise.all([...sessions.keys()].map(stopSession));
}

// Encerra sessões abandonadas (aba fechada, celular bloqueado...)
setInterval(() => {
  const now = Date.now();
  for (const s of sessions.values()) if (now - s.lastAccess > 90_000) stopSession(s.id);
}, 30_000).unref();
