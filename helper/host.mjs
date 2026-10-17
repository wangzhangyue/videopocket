import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {Controller} from './controller.mjs';
import {Decoder, encodeMessage, validateRequest, userError, AppError} from './core.mjs';
const root=path.dirname(fileURLToPath(import.meta.url));
const config=JSON.parse(fs.readFileSync(path.join(root,'config.json')));
if (process.argv[2] !== `chrome-extension://${config.extensionId}/`) process.exit(1);
process.umask(0o077);
const dataDir=path.join(os.homedir(),'Library','Application Support','VideoPocket');
fs.mkdirSync(dataDir,{recursive:true,mode:0o700});
const lock=path.join(dataDir,'host.lock');
let locked=false, closed=false;
function send(value) { if(!closed && !process.stdout.destroyed) process.stdout.write(encodeMessage(value)); }
let app;
try {
  execFileSync('/usr/bin/shlock',['-p',String(process.pid),'-f',lock],{stdio:'ignore'}); locked=true;
  app=new Controller({dataDir,bin:path.join(root,'bin'),emit:data=>send({event:'state',data})});
  await app.recover();
} catch(e) {
  send({event:'fatal',error:userError(locked?e:new AppError('BUSY','另一个 Chrome 窗口或用户配置正在使用助手，请关闭其下载任务后重试'))});
  if(locked) { try {fs.unlinkSync(lock);} catch {} }
  app=null; process.exitCode=1; process.stdin.resume(); process.stdin.on('data',()=>{}); setTimeout(()=>process.exit(1),250); 
}
if(app) {
  const decoder=new Decoder(); let queue=Promise.resolve(), pending=0;
  async function stop() {
    if(closed) return; closed=true;
    try {await app.shutdown();} finally { if(locked) {try {fs.unlinkSync(lock);} catch {}} process.exit(0); }
  }
  process.stdin.on('data',chunk=>{
    try {
      for(const input of decoder.push(chunk)) {
        if(++pending>32) throw new AppError('PROTOCOL','请求过于频繁');
        queue=queue.then(async()=>{
          try { const m=validateRequest(input); const data=await app.request(m); send({id:m.id,ok:true,data}); }
          catch(e) {send({id:typeof input?.id==='string'?input.id.slice(0,80):'',ok:false,error:userError(e)});}
          finally {pending--;}
        });
      }
    } catch {stop();}
  });
  process.stdin.on('end',stop); process.stdin.on('error',stop); process.stdout.on('error',stop);
  process.on('SIGTERM',stop); process.on('SIGINT',stop);
  process.on('uncaughtException',stop); process.on('unhandledRejection',stop);
}
