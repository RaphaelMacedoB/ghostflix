import { spawn, execFile } from 'node:child_process';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { FFMPEG } from './media.js';

// Filmes a partir de Full HD (1920 de largura ou 1080 de altura) já têm boa qualidade e não são processados
export const needsEnhance = v => !!v && v.width > 0 && v.width < 1900 && v.height < 1060;

// Tamanho final: cabe em 1920×1080 mantendo a proporção (corrige pixels não quadrados de DVD)
export function targetSize(v) {
  const w0 = v.width * (v.sar || 1), h0 = v.height;
  const k = Math.min(1920 / w0, 1080 / h0);
  const even = n => Math.max(2, Math.round(n / 2) * 2);
  return { width: even(w0 * k), height: even(h0 * k) };
}

/**
 * Encerra processos ffmpeg que sobraram de uma execução anterior (ex.: a janela do terminal foi fechada
 * no X, o que mata o Node sem dar tempo de encerrar os filhos). Só mexe nos que usam a pasta de dados.
 */
export async function killOrphanFfmpeg(dataDir) {
  const exec = (cmd, args) => new Promise(r => execFile(cmd, args, { windowsHide: true, timeout: 20000 }, (err, out) => r(err ? '' : out)));
  let pids = [];
  if (process.platform === 'win32') {
    const dir = dataDir.replace(/'/g, "''");
    const out = await exec('powershell', ['-NoProfile', '-NonInteractive', '-Command',
      `Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'ffmpeg.exe' -and $_.CommandLine -and $_.CommandLine.Contains('${dir}') } | ForEach-Object { $_.ProcessId }`]);
    pids = out.split(/\s+/).filter(Boolean).map(Number);
  } else {
    const out = await exec('ps', ['-eo', 'pid=,args=']);
    pids = out.split('\n').filter(l => /ffmpeg/.test(l) && l.includes(dataDir)).map(l => Number(l.trim().split(/\s+/)[0]));
  }
  for (const pid of pids) { try { process.kill(pid, 'SIGKILL'); } catch { /* já saiu */ } }
  if (pids.length) await new Promise(r => setTimeout(r, 800)); // o Windows libera os arquivos logo depois
  return pids.length;
}

const CRF = process.env.ENHANCE_CRF || '19';
const PRESET = process.env.ENHANCE_PRESET || 'medium';
const CHUNK = Math.max(2, Math.round((Number(process.env.ENHANCE_CHUNK) || 300) / 2) * 2); // segundos por bloco (múltiplo dos 2 s entre quadros-chave)

const partName = n => `part${String(n).padStart(5, '0')}.ts`;
const cancelled = () => Object.assign(new Error('cancelado'), { cancelled: true });

// Quantos blocos seguidos já terminaram. O ffmpeg só anota um bloco em list-N.csv depois de fechá-lo,
// então o bloco que estava sendo gravado quando o servidor caiu não aparece na lista e é descartado.
async function finishedChunks(workDir) {
  const files = await fsp.readdir(workDir).catch(() => []);
  const listed = new Set();
  for (const f of files.filter(f => /^list-\d+\.csv$/.test(f))) {
    const txt = await fsp.readFile(path.join(workDir, f), 'utf8').catch(() => '');
    for (const line of txt.split(/\r?\n/)) {
      const m = line.match(/^part(\d{5})\.ts,/);
      if (m) listed.add(Number(m[1]));
    }
  }
  let k = 0;
  while (listed.has(k) && files.includes(partName(k))) k++;
  for (const f of files) {
    const m = f.match(/^part(\d{5})\.ts$/);
    if (m && Number(m[1]) >= k) await fsp.rm(path.join(workDir, f), { force: true });
  }
  return k;
}

/**
 * Gera uma versão melhorada só do vídeo (o áudio e as legendas continuam vindo do arquivo original):
 * remove ruído/blocos de compressão, aumenta para até 1920×1080 (lanczos) e realça a nitidez (CAS).
 *
 * O filme é processado em blocos de 5 min dentro de workDir. Se o servidor cair, a próxima chamada
 * continua do primeiro bloco que não terminou; no fim os blocos são juntados (sem recodificar) em "out".
 */
export function runEnhance({ src, workDir, out, duration, onProgress, onResume }) {
  let killed = false, proc = null;
  const kill = () => { killed = true; if (proc && proc.exitCode === null) proc.kill('SIGKILL'); };
  process.on('exit', kill);

  const ffmpeg = (args, progressBase = 0) => new Promise((resolve, reject) => {
    if (killed) return reject(cancelled());
    proc = spawn(FFMPEG, args, { windowsHide: true });
    // Prioridade baixa: assistir a um filme continua fluido enquanto outro é melhorado
    try { os.setPriority(proc.pid, os.constants.priority.PRIORITY_LOW); } catch { /* sem permissão */ }
    let stderr = '';
    proc.stderr.on('data', d => { stderr = (stderr + d).slice(-3000); });
    readline.createInterface({ input: proc.stdout }).on('line', line => {
      const m = line.match(/^out_time_us=(\d+)/);
      if (m && duration > 0) onProgress?.(Math.min(99.9, (progressBase + Number(m[1]) / 1e6) / duration * 100));
    });
    proc.on('error', reject);
    proc.on('exit', code => {
      if (killed) reject(cancelled());
      else if (code === 0) resolve();
      else reject(new Error(stderr.trim().split('\n').pop() || `ffmpeg saiu com código ${code}`));
    });
  });

  const done = (async () => {
    await fsp.mkdir(workDir, { recursive: true });
    const k = await finishedChunks(workDir);
    const from = k * CHUNK;
    if (from < duration - 1) {
      if (k > 0) onResume?.(Math.min(99, from / duration * 100));
      const vf = [
        "scale='trunc(iw*sar/2)*2':ih", 'setsar=1',
        'hqdn3d=1.5:1.5:6:6',
        'scale=1920:1080:force_original_aspect_ratio=decrease:force_divisible_by=2:flags=lanczos',
        'cas=0.5',
        'format=yuv420p'
      ].join(',');
      await ffmpeg([
        '-hide_banner', '-loglevel', 'error', '-nostdin', '-y',
        ...(from > 0 ? ['-ss', String(from)] : []),
        '-i', src, '-map', '0:v:0', '-an', '-sn', '-dn', '-map_metadata', '-1', '-map_chapters', '-1',
        '-vf', vf,
        '-c:v', 'libx264', '-preset', PRESET, '-crf', CRF, '-profile:v', 'high', '-level', '4.1',
        '-force_key_frames', 'expr:gte(t,n_forced*2)', // quadros-chave a cada 2 s: avançar o vídeo fica preciso
        '-f', 'segment', '-segment_time', String(CHUNK), '-segment_format', 'mpegts',
        '-segment_start_number', String(k), '-reset_timestamps', '1',
        '-segment_list', path.join(workDir, `list-${k}.csv`), '-segment_list_type', 'csv',
        '-progress', 'pipe:1', '-nostats',
        path.join(workDir, 'part%05d.ts')
      ], from);
    }
    // Junta os blocos num MP4 só (cópia direta, leva segundos)
    const parts = (await fsp.readdir(workDir)).filter(f => /^part\d{5}\.ts$/.test(f)).sort();
    if (!parts.length) throw new Error('nenhum bloco foi gerado');
    const listFile = path.join(workDir, 'concat.txt');
    await fsp.writeFile(listFile, parts.map(p => `file '${p}'`).join('\n'));
    await ffmpeg(['-hide_banner', '-loglevel', 'error', '-nostdin', '-y', '-f', 'concat', '-safe', '0',
      '-i', listFile, '-c', 'copy', '-movflags', '+faststart', '-f', 'mp4', out]);
  })();
  done.finally(() => process.off('exit', kill)).catch(() => {});
  return { done, kill };
}
