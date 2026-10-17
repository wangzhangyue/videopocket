import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const VERSION = '0.2.2';
export const PROTOCOL = 1;
export const ACTIVE = new Set(['parsing', 'downloading', 'merging', 'verifying']);
export class AppError extends Error {
  constructor(code, message, diagnostic = '') { super(message); this.code = code; this.diagnostic = redact(diagnostic); }
}
export function redact(value) {
  return String(value ?? '').replace(/https?:\/\/[^\s"'<>]+/gi, '[链接已隐藏]')
    .replace(/((?:cookie|authorization|token|signature|password)\s*[:=]\s*)[^\r\n]+/gi, '$1[已隐藏]')
    .replace(/\x1b\[[0-9;]*m/g, '').slice(-4000);
}
export function userError(error, phase = '') {
  if (error instanceof AppError) return {code: error.code, message: error.message, diagnostic: error.diagnostic};
  const raw = String(error?.message ?? error);
  let code = 'UNKNOWN', message = '操作未完成，请重试或查看诊断信息';
  if (/ENOSPC|No space left/i.test(raw)) { code = 'DISK_FULL'; message = '保存失败，磁盘空间不足'; }
  else if (/EACCES|EPERM|permission denied|read-only/i.test(raw)) { code = 'DIRECTORY'; message = '无法保存到此位置，请重新选择目录'; }
  else if (/DRM|digital rights|encrypted media/i.test(raw)) { code = 'DRM'; message = '此视频受到 DRM 保护，无法下载'; }
  else if (/unsupported URL|no video|unable to extract/i.test(raw)) { code = 'UNSUPPORTED'; message = '未能解析此页面，请先播放视频，再点击「检测页面视频」'; }
  else if (/sign in|login|log in|confirm.*bot|age.restrict|authentication|cookies|PO Token/i.test(raw)) { code = 'LOGIN'; message = '当前视频需要登录或验证，首版暂不支持'; }
  else if (/HTTP Error 403|Forbidden/i.test(raw)) { code = 'ACCESS'; message = '网站拒绝下载请求，可能需要登录或来源校验；请尝试「检测页面视频」'; }
  else if (/private video|removed|video (?:unavailable|not available)|HTTP Error 404|deleted/i.test(raw)) { code = 'UNAVAILABLE'; message = '无法访问该视频，请检查原页面'; }
  else if (/unsupported option|no such option|javascript runtime|challenge solving|EJS|signature extraction|n challenge/i.test(raw)) { code = 'COMPONENT'; message = '下载组件需要更新，请查看助手更新入口'; }
  else if (/timed? ?out|network|connection|resolve|HTTP Error 5|HTTP Error 429|ECONN/i.test(raw)) { code = 'NETWORK'; message = '网络连接中断或媒体链接失效，下载未完成，请重试'; }
  else if (/requested format.*not available/i.test(raw)) { code = 'NO_FORMAT'; message = '此清晰度暂时不可用，请重新解析'; }
  else if (phase === 'merging' || phase === 'verifying') { code = 'MERGE'; message = '文件合并或校验失败，下载尚未完成'; }
  return {code, message, diagnostic: redact(raw)};
}
export function canonicalURL(input) {
  const u = webURL(input);
  const hosts = ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be'];
  if (!hosts.includes(u.hostname)) return u.href;
  let id;
  if (u.hostname === 'youtu.be') id = u.pathname.slice(1);
  else if (u.pathname === '/watch') id = u.searchParams.get('v');
  else id = /^\/(?:shorts|embed|live)\/([\w-]{11})\/?$/.exec(u.pathname)?.[1];
  if (!/^[\w-]{11}$/.test(id ?? '')) throw new AppError('UNSUPPORTED', '请打开单个视频页面，或点击「检测页面视频」');
  return `https://www.youtube.com/watch?v=${id}`;
}
export function webURL(input) {
  if (typeof input !== 'string' || input.length > 8192 || /[\x00-\x1f\x7f]/.test(input)) throw new AppError('URL', '请粘贴有效的视频链接');
  let u;
  try { u = new URL(input.trim()); } catch { throw new AppError('URL', '请粘贴完整的视频链接'); }
  if (!['https:', 'http:'].includes(u.protocol) || u.username || u.password)
    throw new AppError('UNSUPPORTED', '仅支持 HTTP 或 HTTPS 视频链接；blob 地址请使用「检测页面视频」');
  return u;
}
export function validateVideoInfo(info, url) {
  if (!info || !['string','number'].includes(typeof info.id) || !String(info.id).length || String(info.id).length > 2048)
    throw new AppError('METADATA', '视频信息无效，请重新解析');
  if (info.entries || (info._type && info._type !== 'video'))
    throw new AppError('PLAYLIST', '页面包含多个视频，请打开其中一个，或使用「检测页面视频」选择');
  const u = new URL(url);
  if (u.hostname === 'www.youtube.com' && u.pathname === '/watch' && String(info.id) !== u.searchParams.get('v'))
    throw new AppError('METADATA', '返回的视频与链接不一致');
}
const unknownCodec = c => !c || c === 'unknown';
const rate = f => Number(f.fps || 0) * 1e6 + Number(f.tbr || f.abr || 0);
export function choices(info) {
  if (info.is_live || info.is_upcoming || ['is_live','is_upcoming','post_live'].includes(info.live_status))
    throw new AppError('LIVE', '暂不支持正在直播的视频，请在直播结束并生成回放后重试');
  if (info.has_drm) throw new AppError('DRM', '此视频受到 DRM 保护，无法下载');
  const formats = (info.formats || [info]).filter(f => !f.has_drm &&
    /^https?:\/\//.test(f.url || '') && /^(https?|http_dash_segments|m3u8_native|m3u8)$/.test(f.protocol || 'https') &&
    /^[\w.-]+$/.test(f.format_id || ''));
  const result = [];
  const heights = [...new Set(formats.filter(f => f.vcodec !== 'none' && f.height > 0 && f.height <= 1080).map(f => f.height))].sort((a,b) => b-a);
  if (formats.some(f => f.vcodec !== 'none' && !f.height)) heights.push(null);
  for (const height of heights) {
    for (const ext of ['mp4', 'webm']) {
      const videoCodec = ext === 'mp4' ? /^(avc|h264|hev|hvc|av01|av1)/ : /^(vp0?8|vp0?9|av01|av1)/;
      const audioCodec = ext === 'mp4' ? /^(mp4a|aac)/ : /^(opus|vorbis)/;
      const videos = formats.filter(f => (f.height || null) === height && f.ext === ext && (unknownCodec(f.vcodec) || videoCodec.test(f.vcodec))).sort((a,b) => rate(b)-rate(a));
      const audio = formats.filter(f => f.vcodec === 'none' && audioCodec.test(f.acodec) &&
        (ext === 'mp4' ? ['m4a', 'mp4'].includes(f.ext) : f.ext === 'webm')).sort((a,b) => Number(b.abr || b.tbr || 0)-Number(a.abr || a.tbr || 0))[0];
      const video = videos.find(f => f.acodec === 'none' ? Boolean(audio) : unknownCodec(f.acodec) || audioCodec.test(f.acodec));
      if (!video) continue;
      const tracks = video.acodec === 'none' ? [video, audio] : [video];
      const sizes = tracks.map(f => f.filesize || f.filesize_approx || 0);
      result.push({key: `${height || 'original'}:${ext}`, height, ext, fps: video.fps || null,
        unverified: !height || tracks.some(f => unknownCodec(f.vcodec) || unknownCodec(f.acodec)),
        bytes: sizes.every(Boolean) ? sizes.reduce((a,b) => a+b,0) : null,
        tracks: tracks.map(f => ({id: f.format_id, ext: f.ext, kind: f.vcodec === 'none' ? 'audio' : 'video'}))});
      break;
    }
  }
  if (!result.length) throw new AppError('NO_FORMAT', '暂无可下载格式：需要 1080p 及以下且包含声音和画面的组合');
  return result;
}
export function safeStem(title, id) {
  const clean = String(title || '视频').normalize('NFC').replace(/[\x00-\x1f\x7f/\\:<>"|?*\u202a-\u202e\u2066-\u2069]/g, '_').replace(/^\.+|[ .]+$/g, '').trim();
  let short = [...clean].slice(0, 100).join('');
  while (Buffer.byteLength(short) > 170) short = [...short].slice(0,-1).join('');
  const identifier = /^[\w-]{1,60}$/.test(String(id)) ? String(id) : crypto.createHash('sha256').update(String(id)).digest('hex').slice(0,16);
  return `${short || '视频'} [${identifier}]`;
}
export function writeJSON(file, value) {
  const tmp = `${file}.${crypto.randomUUID()}.tmp`;
  const fd = fs.openSync(tmp, 'wx', 0o600);
  try { fs.writeFileSync(fd, JSON.stringify(value)); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  try { fs.renameSync(tmp, file); } finally { if (fs.existsSync(tmp)) fs.unlinkSync(tmp); }
}
export function checkDirectory(directory, expected, writable = true) {
  const real = fs.realpathSync(directory), stat = fs.statSync(real);
  if (!stat.isDirectory() || (expected && (real !== directory || stat.dev !== expected.dev || stat.ino !== expected.ino)))
    throw new AppError('DIRECTORY', '保存目录已变化，请重新选择目录');
  if (writable) {
    const probe = path.join(real, `.videopocket-check-${crypto.randomUUID()}`);
    fs.closeSync(fs.openSync(probe, 'wx', 0o600)); fs.unlinkSync(probe);
  }
  return {path: real, dev: stat.dev, ino: stat.ino};
}
export function verifyMedia(info, expectedDuration) {
  const video = info.streams?.find(s => s.codec_type === 'video' && !s.disposition?.attached_pic);
  const audio = info.streams?.find(s => s.codec_type === 'audio');
  const duration = Number(info.format?.duration || video?.duration || 0);
  if (video?.height > 1080) throw new AppError('RESOLUTION', '原始视频超过 1080p，当前版本不转码，请选择较低清晰度');
  if (!video || !audio || !(video.height > 0 && video.height <= 1080) || !(duration > 0) ||
    (expectedDuration > 0 && Math.abs(duration - expectedDuration) > Math.max(3, expectedDuration * 0.05)))
    throw new AppError('VERIFY', '文件校验失败：声音、画面或时长不完整');
  return {height: video.height, duration};
}
export function encodeMessage(message) {
  const body = Buffer.from(JSON.stringify(message)), header = Buffer.alloc(4);
  if (body.length > 900000) throw new AppError('PROTOCOL', '响应过大');
  header.writeUInt32LE(body.length); return Buffer.concat([header, body]);
}
export class Decoder {
  buffer = Buffer.alloc(0);
  push(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk]); const messages = [];
    while (this.buffer.length >= 4) {
      const size = this.buffer.readUInt32LE(0);
      if (!size || size > 65536) throw new AppError('PROTOCOL', '消息长度无效');
      if (this.buffer.length < size+4) break;
      messages.push(JSON.parse(this.buffer.subarray(4, size+4).toString('utf8')));
      this.buffer = this.buffer.subarray(size+4);
    }
    return messages;
  }
}
export function validateRequest(m) {
  const fields = {hello: ['protocol'], snapshot: [], parse: ['url','referer'], download: ['taskId','choice'], cancel: ['taskId'], retry: ['taskId'], chooseDirectory: [], reveal: ['taskId'], play: ['taskId'], clearHistory: []};
  if (!m || typeof m !== 'object' || Array.isArray(m) || typeof m.id !== 'string' || m.id.length > 80 || !Object.hasOwn(fields, m.command))
    throw new AppError('PROTOCOL', '不支持的请求');
  if (Object.keys(m).some(k => !['id','command', ...fields[m.command]].includes(k))) throw new AppError('PROTOCOL', '请求包含不支持的参数');
  for (const key of fields[m.command]) {
    if (key === 'referer' && m[key] === undefined) continue;
    if (key === 'protocol') { if (m.protocol !== PROTOCOL) throw new AppError('VERSION', '插件与助手版本不兼容，请安装配套版本'); }
    else if (typeof m[key] !== 'string' || m[key].length > (['url','referer'].includes(key) ? 8192 : 100)) throw new AppError('PROTOCOL', '请求参数无效');
  }
  if (m.referer !== undefined) webURL(m.referer);
  return m;
}
