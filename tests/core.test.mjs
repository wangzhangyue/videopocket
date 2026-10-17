import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {canonicalURL,validateVideoInfo,choices,safeStem,verifyMedia,Decoder,encodeMessage,validateRequest,redact,userError,checkDirectory} from '../helper/core.mjs';
const url='https://www.youtube.com/watch?v=BaW_jenozKc';
const f=(id,height,ext,vcodec,acodec,extra={})=>({format_id:id,height,ext,vcodec,acodec,url:'https://media.example.test/video',protocol:'https',...extra});
const info=formats=>({id:'BaW_jenozKc',live_status:'not_live',formats});
test('normalizes links and drops playlist, tracking and time parameters',()=>{
  for(const input of [url+'&list=PL123&t=20', 'https://youtu.be/BaW_jenozKc?si=secret','https://m.youtube.com/shorts/BaW_jenozKc','http://youtube.com/embed/BaW_jenozKc'])assert.equal(canonicalURL(input),url);
});
test('rejects unsafe schemes, credentials, playlists and injected arguments',()=>{
  for(const input of ['file:///tmp/a','https://user@youtube.com/watch?v=BaW_jenozKc','https://youtube.com/playlist?list=x','blob:https://example.com/id','javascript:alert(1)','https://site.test/\r\nHeader:evil','--exec rm','https://youtu.be/BaW_jenozKc/extra'])assert.throws(()=>canonicalURL(input));
});
test('prefers compatible MP4 per height, caps at 1080 and always pairs audio',()=>{
  const opts=choices(info([f('v',1080,'mp4','avc1','none'),f('w',1080,'webm','vp9','none'),f('a',null,'m4a','none','mp4a.40.2'),f('wa',null,'webm','none','opus'),f('4k',2160,'mp4','avc1','mp4a.40.2'),f('low',360,'mp4','avc1','mp4a.40.2')]));
  assert.deepEqual(opts.map(o=>o.key),['1080:mp4','360:mp4']);assert.deepEqual(opts[0].tracks.map(t=>t.id),['v','a']);assert.equal(opts[1].tracks.length,1);
});
test('falls back to WebM and rejects silent, DRM, unsupported and empty combinations',()=>{
  assert.equal(choices(info([f('v',720,'webm','vp9','none'),f('a',null,'webm','none','opus')]))[0].ext,'webm');
  for(const formats of [[f('v',720,'mp4','avc1','none')],[f('v',720,'mp4','avc1','mp4a',{has_drm:true})],[f('v',720,'mp4','weird','mp4a')],[f('v',720,'mp4','avc1','mp4a',{protocol:'rtmp'})],[]])assert.throws(()=>choices(info(formats)),/暂无/);
  assert.throws(()=>choices({...info([]),is_live:true}),/直播/);
});
test('filename stays inside directory with Chinese, shell syntax and traversal titles',()=>{
  for(const name of ['../../危险/路径','中文'.repeat(100),'$(touch /tmp/x);`cmd`','\u202eevil\0.mp4','..']){
    const stem=safeStem(name,'BaW_jenozKc');assert(!stem.includes('/'));assert(!stem.includes('\0'));assert(Buffer.byteLength(stem)<220);assert(stem.endsWith('[BaW_jenozKc]'));
  }
});
test('native framing supports split packets, multi-byte Chinese and multiple messages',()=>{
  const d=new Decoder(), frames=Buffer.concat([encodeMessage({id:'1',text:'你好'}),encodeMessage({id:'2'})]);
  assert.deepEqual(d.push(frames.subarray(0,3)),[]);assert.deepEqual(d.push(frames.subarray(3,8)),[]);assert.deepEqual(d.push(frames.subarray(8)),[{id:'1',text:'你好'},{id:'2'}]);
  assert.throws(()=>new Decoder().push(Buffer.from([255,255,255,255])));
});
test('protocol allowlist disallows command and path injection',()=>{
  assert.equal(validateRequest({id:'1',command:'hello',protocol:1}).protocol,1);
  for(const m of [{id:'1',command:'exec'},{id:'1',command:'parse',url,output:'/tmp/evil'},{id:'1',command:'download',taskId:'x',choice:['--exec']},{id:'1',command:'hello',protocol:2},{id:'1',command:'toString'}])assert.throws(()=>validateRequest(m));
});
test('success requires actual audio, video, supported resolution and complete duration',()=>{
  const probe={streams:[{codec_type:'video',height:1080},{codec_type:'audio'}],format:{duration:'60'}};
  assert.deepEqual(verifyMedia(probe,60),{height:1080,duration:60});
  assert.throws(()=>verifyMedia({...probe,streams:probe.streams.slice(0,1)},60));assert.throws(()=>verifyMedia(probe,300));assert.throws(()=>verifyMedia({...probe,format:{duration:'N/A'}},60));
});
test('diagnostics redact credentials and signed URLs; disk and network failures are actionable',()=>{
  const out=redact('error https://x.test/video?token=SECRET\nCookie: mysecret\nAuthorization: Bearer private');
  assert(!/SECRET|mysecret|private/.test(out));assert.equal(userError(new Error('ENOSPC')).code,'DISK_FULL');assert.equal(userError(new Error('Connection timed out')).code,'NETWORK');
});
test('directory identity detects symlink replacement before publication',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'vp-dir-'));try{
    const target=path.join(dir,'chosen');fs.mkdirSync(target);const identity=checkDirectory(target);fs.renameSync(target,path.join(dir,'old'));fs.mkdirSync(path.join(dir,'other'));fs.symlinkSync(path.join(dir,'other'),target);
    assert.throws(()=>checkDirectory(target,identity),/目录已变化/);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('other sites and signed media URLs keep their identifiers and query strings',()=>{
  for(const link of ['https://vimeo.com/12345678','https://www.bilibili.com/video/BV1abc123456/?p=2','https://media.example.test/movie.mp4?token=A%2BB&expires=123','http://127.0.0.1:12345/movie.mp4'])assert.equal(canonicalURL(link),link);
  validateVideoInfo({id:'other-site/episode 1'},'https://example.test/watch/1');
  validateVideoInfo({id:12345},'https://vimeo.com/12345');
  assert.throws(()=>validateVideoInfo({id:'wrong'},url),/不一致/);
  assert.throws(()=>validateVideoInfo({id:'list',entries:[]},'https://example.test'),/多个视频/);
});
test('HLS, DASH and unknown direct media formats can be tried without inventing metadata',()=>{
  assert.equal(choices({id:'123',formats:[f('hls-720',720,'mp4','avc1','mp4a',{protocol:'m3u8_native'})]})[0].key,'720:mp4');
  assert.equal(choices({id:'abc',formats:[f('dash',360,'mp4','avc1','mp4a',{protocol:'http_dash_segments'})]})[0].key,'360:mp4');
  const option=choices({id:'clip',formats:[f('http',null,'mp4',undefined,undefined)]})[0];
  assert.equal(option.key,'original:mp4');assert.equal(option.height,null);assert.equal(option.unverified,true);
  assert.throws(()=>choices({id:'clip',has_drm:true}),/DRM/);
  assert.throws(()=>verifyMedia({streams:[{codec_type:'video',height:2160},{codec_type:'audio'}],format:{duration:'2'}},2),/1080p/);
});
test('untrusted site identifiers cannot escape the chosen directory or exceed filename limits',()=>{
  for(const id of ['../../evil','a/b', 'a'.repeat(1000),'注入\0文件']){
    const name=safeStem('标题'.repeat(100),id);assert(!name.includes('/'));assert(!name.includes('\0'));assert(Buffer.byteLength(name)<240);
  }
});
test('referrer is optional, HTTP-only and cannot inject a header or command',()=>{
  assert.equal(validateRequest({id:'1',command:'parse',url}).url,url);
  assert.equal(validateRequest({id:'1',command:'parse',url,referer:'https://example.test/page'}).referer,'https://example.test/page');
  for(const referer of ['https://site.test/\r\nCookie: secret','file:///tmp/a','https://user:pass@site.test',12])assert.throws(()=>validateRequest({id:'1',command:'parse',url,referer}));
});
