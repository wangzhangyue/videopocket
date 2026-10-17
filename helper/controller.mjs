import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {fork, execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import {ACTIVE, AppError, VERSION, PROTOCOL, canonicalURL, webURL, checkDirectory, safeStem, writeJSON, userError, verifyMedia} from './core.mjs';
const exec = promisify(execFile);
const workerFile = fileURLToPath(new URL('./worker.mjs', import.meta.url));
export class Controller {
  constructor({dataDir, bin, emit = () => {}, worker = workerFile}) {
    this.dataDir = dataDir; this.bin = bin; this.emit = emit; this.workerFile = worker; this.child = null; this.health = null; this.closing = false;
    fs.mkdirSync(dataDir, {recursive:true, mode:0o700});
    this.file = path.join(dataDir,'state.json');
    this.state = {schema:1, directory: path.join(os.homedir(),'Downloads','拾影'), configured:false, task:null, history:[]};
    if (fs.existsSync(this.file)) {
      try { const data = JSON.parse(fs.readFileSync(this.file)); if (data.schema !== 1 || !Array.isArray(data.history)) throw new Error('schema'); this.state = data; }
      catch { fs.renameSync(this.file, `${this.file}.corrupt-${Date.now()}`); this.state.notice = '本地任务记录损坏，已保留备份。已下载视频不受影响。'; }
    }
  }
  persist() { writeJSON(this.file, this.state); }
  view() {
    const clean = t => {
      if (!t) return null;
      const {workDir,directoryIdentity,publishing,workerPid,...publicTask} = t;
      return {...publicTask, missing: t.state === 'completed' && !this.validFinal(t)};
    };
    return {version:VERSION, protocol:PROTOCOL, directory:this.state.directory, configured:this.state.configured,
      task:clean(this.state.task), history:this.state.history.map(clean), health:this.health, notice:this.state.notice || null};
  }
  changed() { this.persist(); this.emit(this.view()); }
  validFinal(t) { try { const s = fs.lstatSync(t.path); return s.isFile() && s.size > 0 && (!t.fileIdentity || (s.ino === t.fileIdentity.ino && s.dev === t.fileIdentity.dev)); } catch { return false; } }
  async detect() {
    const components = await Promise.all([['node',['--version']],['yt-dlp',['--version']],['ffmpeg',['-version']],['ffprobe',['-version']]].map(async ([name, args]) => {
      // First launch after installation can exceed 10 s; keep all probes within the 65 s handshake deadline.
      const timeout = name === 'yt-dlp' ? 45000 : 10000;
      try {
        const {stdout} = await exec(path.join(this.bin,name),args,{timeout,maxBuffer:256000});
        return {name,ok:true,version:stdout.trim().split('\n')[0].slice(0,100)};
      } catch (error) {
        const code = error.killed ? 'STARTUP_TIMEOUT' : error.code === 'ENOENT' ? 'MISSING' : 'START_FAILED';
        const version = code === 'STARTUP_TIMEOUT' ? `启动检测超过 ${timeout/1000} 秒，请稍后重新检测` : code === 'MISSING' ? '组件文件缺失，请重新安装助手' : '组件启动失败，请查看诊断信息';
        return {name,ok:false,code,version,diagnostic:userError(error).diagnostic};
      }
    }));
    try {
      const manifest = JSON.parse(fs.readFileSync(path.join(this.bin,'..','components.json')));
      for (const [name, hash] of Object.entries(manifest.sha256)) {
        const actual = crypto.createHash('sha256').update(fs.readFileSync(path.join(this.bin,name))).digest('hex');
        if (actual !== hash) throw new Error('组件完整性校验失败');
      }
      for (const name of ['core.min.js','lib.min.js']) {
        if (fs.statSync(path.join(this.bin,'_internal','yt_dlp_ejs','yt','solver',name)).size === 0) throw new Error('EJS 文件为空');
      }
      components.push({name:'yt-dlp-ejs / 完整性',ok:true,version:`${manifest.ejs||'官方配套版本'}，校验通过`});
    } catch { components.push({name:'yt-dlp-ejs / 完整性',ok:false,version:'缺失或已损坏，请重新安装'}); }
    const node = components.find(c => c.name === 'node');
    if (node.ok && Number(node.version.replace(/^v/,'').split('.')[0]) < 22) node.ok = false;
    this.health = {ok:components.every(c=>c.ok), components};
    this.emit(this.view()); return this.view();
  }
  async recover() {
    const t = this.state.task;
    if (t?.state === 'completed' && t.workDir) { this.cleanup(t); this.record(t); this.changed(); return; }
    if (!t || !ACTIVE.has(t.state)) return;
    if (t.workerPid) {
      // Never signal a recycled PID. A surviving worker must close before its files can be cleaned.
      try {
        const {stdout} = await exec('/bin/ps',['-p',String(t.workerPid),'-o','command=']);
        if (stdout.includes(t.id)) throw new AppError('BUSY','上次任务正在退出，请稍后重新检测连接');
      } catch (e) { if (e instanceof AppError) throw e; }
    }
    if (t.publishing && this.validFinal({...t,path:t.publishing.path,fileIdentity:t.publishing.identity})) {
      try {
        const {stdout} = await exec(path.join(this.bin,'ffprobe'),['-v','error','-show_streams','-show_format','-of','json',t.publishing.path],{timeout:30000,maxBuffer:1000000});
        const verified = verifyMedia(JSON.parse(stdout),t.duration);
        t.state = 'completed'; t.stage = '已保存'; t.path = t.publishing.path; t.fileIdentity = t.publishing.identity; t.height = verified.height; t.ext=t.publishing.ext; t.bytes=t.publishing.bytes;
      } catch (error) { t.state='failed'; t.error = userError(error,'verifying'); }
    } else { t.state='failed'; t.error={code:'INTERRUPTED',message:'上次任务已中断，请重试；重试将从头下载',diagnostic:''}; }
    this.cleanup(t); this.record(t); this.changed();
  }
  cleanup(t) {
    if (!t?.workDir) return;
    try {
      if (path.basename(t.workDir) !== `.videopocket-${t.id}` || path.dirname(t.workDir) !== t.directory) return;
      checkDirectory(t.directory, t.directoryIdentity, false);
      fs.rmSync(t.workDir,{recursive:true,force:true}); delete t.workDir;
    } catch { t.cleanupWarning = '临时文件未能清理；恢复保存目录权限后可手动删除该任务的 .videopocket 文件夹。'; }
  }
  record(t) {
    t.endedAt = new Date().toISOString(); delete t.workerPid; delete t.publishing;
    this.state.history = [structuredClone(t), ...this.state.history.filter(x=>x.id !== t.id)].slice(0,20);
  }
  busy() { return Boolean(this.child || ACTIVE.has(this.state.task?.state)); }
  async request(m) {
    switch (m.command) {
      case 'hello': return this.detect();
      case 'snapshot': return this.view();
      case 'parse': {
        if (this.busy()) throw new AppError('BUSY','已有活动任务，请先完成或取消');
        this.requireHealth(); const url = canonicalURL(m.url);
        const referer = m.referer === undefined ? undefined : webURL(m.referer).href;
        this.start('parse',{id:crypto.randomUUID(),url,referer,state:'parsing',createdAt:new Date().toISOString()}); return this.view();
      }
      case 'download': {
        if (this.busy()) throw new AppError('BUSY','已有活动任务，请勿重复下载');
        this.requireHealth(); const t = this.state.task;
        if (t?.id !== m.taskId || t.state !== 'ready' || !t.options.some(o=>o.key===m.choice)) throw new AppError('STALE','视频信息已变化，请重新解析');
        this.prepareDownload(t,m.choice); this.start('download',t); return this.view();
      }
      case 'cancel': {
        if (this.state.task?.id !== m.taskId || !this.child) throw new AppError('STALE','任务已经结束');
        const child = this.child; child.cancelled = true; this.stop(child); await child.finished; return this.view();
      }
      case 'retry': {
        if (this.busy()) throw new AppError('BUSY','已有活动任务');
        this.requireHealth(); const old = this.state.task?.id === m.taskId ? this.state.task : this.state.history.find(t=>t.id===m.taskId);
        if (!old || !['failed','cancelled'].includes(old.state)) throw new AppError('STALE','此任务不可重试');
        const t = {id:crypto.randomUUID(),url:canonicalURL(old.url),referer:old.referer === undefined ? undefined : webURL(old.referer).href,state:'parsing',createdAt:new Date().toISOString()};
        if (old.selected) this.prepareDownload(t,old.selected);
        this.start(old.selected ? 'download':'parse', t); return this.view();
      }
      case 'chooseDirectory': {
        if (this.busy()) throw new AppError('BUSY','请等待当前任务结束后修改保存目录');
        try {
          const {stdout} = await exec('/usr/bin/osascript',['-e','POSIX path of (choose folder with prompt "选择拾影视频保存位置")'],{timeout:120000});
          this.state.directory = checkDirectory(stdout.trim()).path; this.state.configured = true; this.changed();
        } catch (e) { if (!/User canceled|用户已取消|\(-128\)/i.test(e.message)) throw e; }
        return this.view();
      }
      case 'play':
      case 'reveal': {
        const t = this.state.task?.id === m.taskId ? this.state.task : this.state.history.find(t=>t.id===m.taskId);
        if (!t || t.state !== 'completed' || !this.validFinal(t)) throw new AppError('MISSING','文件不存在或已被替换，请检查保存目录');
        await exec('/usr/bin/open',m.command==='play'?[t.path]:['-R',t.path]); return this.view();
      }
      case 'clearHistory': this.state.history = []; if (!this.busy() && this.state.task?.state !== 'ready') this.state.task=null; this.changed(); return this.view();
      default: throw new AppError('PROTOCOL','不支持的操作');
    }
  }
  requireHealth() { if (!this.health?.ok) throw new AppError('COMPONENT','下载组件缺失或不兼容，请重新安装本地助手'); }
  prepareDownload(t, selected) {
    fs.mkdirSync(this.state.directory,{recursive:true});
    const directoryIdentity = checkDirectory(this.state.directory);
    const directory = directoryIdentity.path;
    const workDir = path.join(directory, `.videopocket-${t.id}`);
    fs.mkdirSync(workDir,{mode:0o700});
    Object.assign(t,{selected,directory,directoryIdentity,workDir}); this.state.configured=true;
  }
  start(operation,t) {
    Object.assign(t,{state:'parsing',stage:'正在解析视频',progress:null,error:null});
    this.state.task=t; this.changed();
    const child = this.child = fork(this.workerFile,[t.id],{execPath:path.join(this.bin,'node'),detached:true,stdio:['ignore','ignore','pipe','ipc'],env:{HOME:os.homedir(),PATH:'/usr/bin:/bin',TMPDIR:process.env.TMPDIR || '/tmp'}});
    let result = null, error = null, timer;
    child.finished = new Promise(resolve => {
      child.on('message', m => {
        if (child.cancelled) return;
        if (m.type === 'update') { Object.assign(t,m.patch); this.changed(); }
        if (m.type === 'result') { result=m.result; error=m.error; this.stop(child); }
      });
      child.stderr.on('data', () => {});
      child.on('error', e => { error=userError(e); });
      child.once('close', () => {
        clearTimeout(child.killTimer); clearTimeout(timer); this.child=null;
        try {
          if (child.cancelled) { t.state=this.closing?'failed':'cancelled'; t.stage='已取消'; t.error=this.closing?{code:'INTERRUPTED',message:'浏览器连接已关闭，任务已中断',diagnostic:''}:null; }
          else if (error) { t.state='failed'; t.error=error; }
          else if (result?.kind === 'ready') { Object.assign(t,result.meta,{state:'ready',stage:'可下载'}); }
          else if (result?.kind === 'complete') this.publish(t,result);
          else { t.state='failed'; t.error={code:'INTERRUPTED',message:'下载助手意外中断，请重试',diagnostic:''}; }
        } catch (e) { t.state='failed'; t.error=userError(e,t.state); }
        this.cleanup(t);
        if (t.state !== 'ready') this.record(t);
        try { this.changed(); } catch { /* A persisted active task will recover as interrupted on the next connection. */ }
        resolve();
      });
    });
    t.workerPid=child.pid; this.persist();
    child.send({operation,bin:this.bin,url:t.url,referer:t.referer,selected:t.selected,workDir:t.workDir,directory:t.directory,directoryIdentity:t.directoryIdentity});
    // shortcut: network stalls time out in yt-dlp; cap the whole job at 24 h for this single-video MVP.
    timer = setTimeout(()=> {error={code:'TIMEOUT',message:'任务执行超过 24 小时，已停止，请重试',diagnostic:''}; this.stop(child);},24*60*60*1000);
  }
  stop(child) {
    if (child.killTimer) return;
    try { process.kill(-child.pid,'SIGTERM'); } catch {}
    child.killTimer=setTimeout(()=>{try {process.kill(-child.pid,'SIGKILL');} catch {}},1500);
  }
  publish(t,result) {
    checkDirectory(t.directory,t.directoryIdentity);
    if (path.dirname(result.output) !== t.workDir || path.basename(result.output) !== `final.${result.ext}` || !['mp4','webm'].includes(result.ext)) throw new AppError('PATH','输出文件路径无效');
    const stat = fs.lstatSync(result.output);
    if (!stat.isFile() || !stat.size) throw new AppError('VERIFY','最终文件不存在或为空');
    const stem = safeStem(result.meta.title,result.meta.videoId);
    const identity = {dev:stat.dev,ino:stat.ino};
    for (let n=0;n<10000;n++) {
      const candidate=path.join(t.directory,`${stem}${n?` (${n})`:''}.${result.ext}`);
      t.publishing={path:candidate,identity,ext:result.ext,bytes:stat.size}; t.duration=result.meta.duration; this.persist();
      try { fs.linkSync(result.output,candidate); }
      catch(e) { if(e.code==='EEXIST') continue; throw e; }
      Object.assign(t,result.meta,{state:'completed',stage:'已保存',thumbnail:result.thumbnail || null,height:result.height,ext:result.ext,path:candidate,fileIdentity:identity,bytes:stat.size});
      this.persist(); return;
    }
    throw new AppError('COLLISION','同名文件过多，请更换保存目录');
  }
  async shutdown() { this.closing=true; if(this.child) {const c=this.child;c.cancelled=true;this.stop(c);await c.finished;} }
}
