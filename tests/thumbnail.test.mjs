import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {thumbnail} from '../helper/thumbnail.mjs';
test('thumbnail failures are optional and temporary output is cleaned',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'vp-thumb-'));
 try {await fs.writeFile(path.join(dir,'thumbnail.jpg'),'partial');assert.equal(await thumbnail('/missing','/missing',2,dir),null);await assert.rejects(fs.stat(path.join(dir,'thumbnail.jpg')));}
 finally {await fs.rm(dir,{recursive:true,force:true});}
});
test('20 thumbnail records plus current task remain below native message limit',()=>{
 const image='data:image/jpeg;base64,'+Buffer.alloc(24000).toString('base64');
 assert(Buffer.byteLength(JSON.stringify({task:{thumbnail:image},history:Array.from({length:20},()=>({thumbnail:image}))}))<800000);
});
test('H.264 file produces a bounded JPEG and cleans its temporary file',{skip:!process.env.VP_MEDIA_TEST},async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'vp-thumb-'));
 try {
  const image=await thumbnail(path.resolve('vendor',process.arch==='arm64'?'arm64':'x64'),path.resolve('tests/fixtures/thumbnail-h264.mp4'),1,dir);
  assert.match(image,/^data:image\/jpeg;base64,/);assert(image.length<=32023);
  const bytes=Buffer.from(image.split(',')[1],'base64');assert.equal(bytes.readUInt16BE(0),0xffd8);
  await assert.rejects(fs.stat(path.join(dir,'thumbnail.jpg')));
 } finally {await fs.rm(dir,{recursive:true,force:true});}
});
