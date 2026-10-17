import fs from 'node:fs';
import {thumbnail} from './thumbnail.mjs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {AppError, choices, validateVideoInfo, verifyMedia, userError, checkDirectory} from './core.mjs';

let currentChild = null, phase = 'parsing';
const emit = message => { if (process.connected) process.send(message); };
// The worker owns a process group; losing the host also stops yt-dlp, its JS runtime and FFmpeg.
process.on('disconnect', () => { try { process.kill(-process.pid, 'SIGKILL'); } catch { process.exit(1); } });
function run(executable, args, {input, timeout = 0, onLine, maxBytes = 12 * 1024 * 1024} = {}) {
  return new Promise((resolve, reject) => {
    const child = currentChild = spawn(executable, args, {stdio: ['pipe','pipe','pipe'], env: {
      PATH: '/usr/bin:/bin', HOME: process.env.HOME, TMPDIR: process.env.TMPDIR || '/tmp', LANG: 'en_US.UTF-8',
    }});
    let output = '', diagnostic = '', partial = '', settled = false, bytes = 0;
    const finish = (error, data) => { if (settled) return; settled = true; clearTimeout(timer); error ? reject(error) : resolve(data); };
    const timer = timeout ? setTimeout(() => {
      child.kill('SIGTERM');
      finish(new AppError('TIMEOUT', phase === 'parsing' ? '解析超过 30 秒，请检查网络后重试' : '操作超时，请重试'));
    }, timeout) : null;
    child.on('error', error => finish(error));
    child.stdout.on('data', chunk => {
      bytes += chunk.length;
      if (!onLine && bytes > maxBytes) { child.kill(); finish(new AppError('METADATA', '视频信息过大，首版暂不支持')); return; }
      if (!onLine) output += chunk.toString();
      else {
        partial += chunk.toString();
        if (partial.length > 65536) { partial = ''; return; }
        const lines = partial.split('\n'); partial = lines.pop(); for (const line of lines) onLine(line);
      }
    });
    child.stderr.on('data', chunk => { diagnostic = (diagnostic + chunk.toString()).slice(-8000); });
    child.on('close', code => { currentChild = null; if (partial && onLine) onLine(partial); finish(code === 0 ? null : new Error(diagnostic || `组件退出 (${code})`), output); });
    child.stdin.on('error', () => {});
    child.stdin.end(input);
  });
}
export const baseArgs = bin => ['--ignore-config','--no-plugin-dirs','--no-cache-dir','--no-playlist',
  '--no-remote-components','--no-js-runtimes','--js-runtimes', `node:${path.join(bin,'node')}`,
  '--ffmpeg-location', bin, '--socket-timeout','15','--retries','1','--fragment-retries','1',
  '--abort-on-unavailable-fragments','--fixup','never','--color','never','--downloader','m3u8:native'];
async function execute(job) {
  const {bin, url, workDir, directoryIdentity, selected} = job;
  emit({type: 'update', patch: {state: 'parsing', stage: '正在解析视频', progress: null}});
  const args = [...baseArgs(bin), ...(job.referer ? ['--referer',job.referer] : [])];
  const info = JSON.parse(await run(path.join(bin, 'yt-dlp'), [...args, '--dump-single-json', '--', url], {timeout: 30000}));
  validateVideoInfo(info, url);
  const options = choices(info);
  const meta = {title: String(info.title || '未命名视频').slice(0,500), videoId: String(info.id), duration: Number(info.duration) || null,
    options: options.map(({tracks, ...option}) => option)};
  if (job.operation === 'parse') return {kind: 'ready', meta};
  const option = options.find(o => o.key === selected);
  if (!option) throw new AppError('NO_FORMAT', '所选清晰度或格式已不可用，请重新解析后选择');
  checkDirectory(job.directory, directoryIdentity);
  const estimated = option.bytes ? option.bytes * 2 + 32 * 1024 * 1024 : 64 * 1024 * 1024;
  const space = fs.statfsSync(job.directory);
  if (space.bavail * space.bsize < estimated) throw new AppError('DISK_FULL', '保存失败，磁盘空间不足');
  phase = 'downloading';
  emit({type: 'update', patch: {...meta, selected, state: phase, stage: '正在下载视频'}});
  let completedBytes = 0;
  const files = [];
  for (const [index, track] of option.tracks.entries()) {
    const file = path.join(workDir, `track-${index}.${track.ext}`); files.push(file);
    const stage = option.tracks.length === 1 ? '正在下载视频与音频' : (track.kind === 'video' ? '正在下载视频' : '正在下载音频');
    emit({type: 'update', patch: {state: phase, stage, progress: {downloaded: completedBytes, bytes: null, total: null, speed: null, eta: null}}});
    await run(path.join(bin,'yt-dlp'), [...args, '--load-info-json','-', '--no-simulate',
      '--format',track.id, '--output',file, '--no-overwrites','--no-continue','--newline','--progress','--progress-delta','0.4',
      '--progress-template','download:VP:%(progress)j'], {input: JSON.stringify(info), onLine: line => {
      if (!line.startsWith('VP:')) return;
      let p; try { p = JSON.parse(line.slice(3)); } catch { return; }
      const number = value => Number.isFinite(value) && value >= 0 ? value : null;
      emit({type: 'update', patch: {state: phase, stage, progress: {downloaded: completedBytes + (number(p.downloaded_bytes) || 0),
        bytes: number(p.downloaded_bytes), total: number(p.total_bytes || p.total_bytes_estimate), speed: number(p.speed), eta: number(p.eta)}}});
    }});
    if (!fs.statSync(file).isFile() || fs.statSync(file).size === 0) throw new AppError('EMPTY','下载文件为空，请重试');
    completedBytes += fs.statSync(file).size;
  }
  phase = 'merging';
  const output = path.join(workDir, `final.${option.ext}`);
  emit({type: 'update', patch: {state: phase, stage: '正在合并', progress: {downloaded: completedBytes}}});
  await run(path.join(bin,'ffmpeg'), ['-nostdin','-hide_banner','-loglevel','error','-n',
    ...files.flatMap(file => ['-i',file]), '-map','0:v:0','-map',files.length > 1 ? '1:a:0' : '0:a:0',
    '-c','copy', ...(option.ext === 'mp4' ? ['-movflags','+faststart'] : []), output]);
  phase = 'verifying';
  emit({type: 'update', patch: {state: phase, stage: '正在校验文件'}});
  const probe = JSON.parse(await run(path.join(bin,'ffprobe'), ['-v','error','-show_streams','-show_format','-of','json',output], {timeout: 30000}));
  const verified = verifyMedia(probe, info.duration);
  if (option.height && verified.height !== option.height) throw new AppError('VERIFY','文件清晰度与所选档位不一致');
  const preview = await thumbnail(bin, output, verified.duration || info.duration, workDir);
  return {kind:'complete', meta, output, thumbnail: preview, ext: option.ext, ...verified};
}
process.once('message', job => execute(job).then(result => emit({type:'result', result})).catch(error => emit({type:'result', error: userError(error, phase)})));
