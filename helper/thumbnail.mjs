import fs from 'node:fs/promises';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const exec = promisify(execFile);
// Bound each image so 20 history entries plus the current task fit Native Messaging's 1 MiB limit.
export async function thumbnail(bin, video, duration, workDir) {
  const output = path.join(workDir, 'thumbnail.jpg');
  try {
    await exec(path.join(bin, 'ffmpeg'), ['-nostdin','-hide_banner','-loglevel','error','-y',
      '-ss',String(Math.min(3, Math.max(0, (duration || 0) / 10))),'-i',video,
      '-frames:v','1','-an','-vf','scale=320:180:force_original_aspect_ratio=decrease','-c:v','mjpeg','-pix_fmt','yuvj420p','-q:v','6',output],
    {timeout:10000,maxBuffer:65536});
    const stat = await fs.stat(output);
    if (!stat.size || stat.size > 24000) return null;
    const bytes = await fs.readFile(output);
    if (bytes[0] !== 255 || bytes[1] !== 216) return null;
    return `data:image/jpeg;base64,${bytes.toString('base64')}`;
  } catch { return null; } // Thumbnail failure must never turn a valid download into a failure.
  finally { await fs.rm(output,{force:true}).catch(()=>{}); }
}
