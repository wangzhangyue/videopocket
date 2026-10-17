import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {Controller} from '../helper/controller.mjs';
function fixture(t, ytdlp) {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'vp-health-')),bin=path.join(root,'bin');
  fs.mkdirSync(path.join(bin,'_internal/yt_dlp_ejs/yt/solver'),{recursive:true});
  fs.writeFileSync(path.join(root,'components.json'),JSON.stringify({ejs:'test',sha256:{}}));
  for(const file of ['core.min.js','lib.min.js'])fs.writeFileSync(path.join(bin,'_internal/yt_dlp_ejs/yt/solver',file),'fixture');
  for(const name of ['node','yt-dlp','ffmpeg','ffprobe']) {
    if(name==='yt-dlp'&&ytdlp===null)continue;
    const code=name==='yt-dlp'?ytdlp:"console.log('v22.23.3')";
    fs.writeFileSync(path.join(bin,name),`#!${process.execPath}\n${code}\n`,{mode:0o755});
  }
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  return new Controller({dataDir:path.join(root,'data'),bin});
}
test('first yt-dlp startup exceeding the previous 10 s limit is accepted',async t=>{
  const app=fixture(t,"setTimeout(()=>console.log('2026.08.19'),11000)");
  const result=await app.detect();assert.equal(result.health.ok,true);assert.equal(result.health.components.find(c=>c.name==='yt-dlp').version,'2026.08.19');
});
test('missing component is distinguished from a startup failure',async t=>{
  const missing=await fixture(t,null).detect();const m=missing.health.components.find(c=>c.name==='yt-dlp');assert.equal(m.ok,false);assert.equal(m.code,'MISSING');
  const failed=await fixture(t,"console.error('loader failed');process.exit(1)").detect();const f=failed.health.components.find(c=>c.name==='yt-dlp');assert.equal(f.ok,false);assert.equal(f.code,'START_FAILED');assert.match(f.diagnostic,/loader failed/);
});
