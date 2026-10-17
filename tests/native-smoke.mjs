import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {Decoder,encodeMessage} from '../helper/core.mjs';
const root=path.resolve('build/native-smoke');fs.rmSync(root,{recursive:true,force:true});fs.mkdirSync(root,{recursive:true});
const helper=path.join(root,'helper');fs.cpSync('helper',helper,{recursive:true});fs.mkdirSync(path.join(helper,'bin'));
const hashes={};
for(const name of ['node','yt-dlp','ffmpeg','ffprobe','_internal'])fs.symlinkSync(path.resolve('vendor/x64',name),path.join(helper,'bin',name));
for(const name of ['node','yt-dlp','ffmpeg','ffprobe','_internal/yt_dlp_ejs/yt/solver/core.min.js','_internal/yt_dlp_ejs/yt/solver/lib.min.js'])hashes[name]=crypto.createHash('sha256').update(fs.readFileSync(path.join(helper,'bin',name))).digest('hex');
fs.writeFileSync(path.join(helper,'components.json'),JSON.stringify({sha256:hashes}));
const config=JSON.parse(fs.readFileSync('helper/config.json'));
const origin=`chrome-extension://${config.extensionId}/`;
const child=spawn(process.execPath,[path.join(helper,'host.mjs'),origin],{env:{HOME:root,PATH:'/usr/bin:/bin'},stdio:['pipe','pipe','pipe'],detached:true});
const decoder=new Decoder();let seq=0,events=[],stderr='';const waiting=new Map();
child.stderr.on('data',c=>stderr+=c);child.stdout.on('data',c=>{for(const m of decoder.push(c)){if(m.event)events.push(m);else{waiting.get(m.id)?.(m);waiting.delete(m.id);}}});
const guard=setTimeout(()=>{process.kill(-child.pid,'SIGKILL');throw new Error('native smoke timeout '+stderr);},90000);
function rpc(command,payload={}){return new Promise(resolve=>{const id=String(++seq);waiting.set(id,resolve);child.stdin.write(encodeMessage({id,command,...payload}));});}
try {
  const first=await rpc('snapshot');assert(first.ok);assert.equal(first.data.protocol,1);
  const hello=await rpc('hello',{protocol:1});console.log(JSON.stringify(hello.data?.health||hello.error,null,2));assert(hello.ok&&hello.data.health.ok,'All bundled components must run and pass integrity check');
  const invalid=await rpc('parse',{url:'file:///etc/passwd'});assert.equal(invalid.ok,false);assert.equal(invalid.error.code,'UNSUPPORTED');
  const injection=await rpc('parse',{url:'https://youtu.be/BaW_jenozKc',output:'/tmp/evil'});assert.equal(injection.ok,false);assert.equal(injection.error.code,'PROTOCOL');
  console.log('Native framing, handshake, health, unsupported URL and message allowlist: PASS');
} finally {
  child.stdin.end();await new Promise(resolve=>child.once('close',resolve));clearTimeout(guard);
}
const invalid=spawn(process.execPath,[path.join(helper,'host.mjs'),'chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/'],{env:{HOME:root,PATH:'/usr/bin:/bin'},stdio:'ignore'});
assert.equal(await new Promise(resolve=>invalid.once('close',resolve)),1);console.log('Invalid extension origin: rejected');
