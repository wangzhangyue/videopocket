import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {Controller} from '../helper/controller.mjs';
import {checkDirectory,writeJSON} from '../helper/core.mjs';
const url='https://www.youtube.com/watch?v=BaW_jenozKc';
function fixture(t){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'vp-test-')),bin=path.join(dir,'bin');fs.mkdirSync(bin);fs.symlinkSync(process.execPath,path.join(bin,'node'));
  const app=new Controller({dataDir:path.join(dir,'data'),bin,worker:fileURLToPath(new URL('./fake-worker.mjs',import.meta.url))});
  app.health={ok:true,components:[]};app.state.directory=path.join(dir,'saved');
  t.after(async()=>{await app.shutdown();fs.rmSync(dir,{recursive:true,force:true});});return {app,dir};
}
async function ready(app){await app.request({command:'parse',url});await app.child.finished;assert.equal(app.state.task.state,'ready');return app.state.task;}
test('parse, download, verified publication, collision and history preserve existing files',async t=>{
  const {app}=fixture(t);let task=await ready(app);
  await app.request({command:'download',taskId:task.id,choice:'720:mp4'});const finished=app.child.finished;
  await assert.rejects(app.request({command:'download',taskId:task.id,choice:'720:mp4'}),/活动任务/);
  await finished;assert.equal(task.state,'completed');const first=task.path;assert(fs.existsSync(first));assert.equal(fs.readdirSync(task.directory).length,1);
  task=await ready(app);await app.request({command:'download',taskId:task.id,choice:'720:mp4'});await app.child.finished;
  assert.notEqual(task.path,first);assert.match(task.path,/\(1\)\.mp4$/);assert.equal(app.state.history.length,2);
  await app.request({command:'clearHistory'});assert.equal(app.state.history.length,0);assert(fs.existsSync(first));assert(fs.existsSync(task.path));
});
test('cancel while merging cleans only this task and permits fresh retry',async t=>{
  const {app}=fixture(t);const task=await ready(app);task.options.push({key:'stall'});
  const untouched=path.join(app.state.directory,'existing.mp4');fs.mkdirSync(app.state.directory,{recursive:true});fs.writeFileSync(untouched,'keep');
  await app.request({command:'download',taskId:task.id,choice:'stall'});
  await new Promise(resolve=>app.child.on('message',m=>{if(m.patch?.state==='merging')resolve();}));assert.equal(task.state,'merging');
  await app.request({command:'cancel',taskId:task.id});assert.equal(task.state,'cancelled');assert.deepEqual(fs.readdirSync(task.directory),['existing.mp4']);
  await app.request({command:'retry',taskId:task.id});assert.notEqual(app.state.task.id,task.id);await app.request({command:'cancel',taskId:app.state.task.id});
});
test('crashed download recovers to interrupted and cleans its own temp directory',async t=>{
  const {app}=fixture(t);fs.mkdirSync(app.state.directory,{recursive:true});const directoryIdentity=checkDirectory(app.state.directory),id='interrupted';app.state.directory=directoryIdentity.path;const workDir=path.join(app.state.directory,`.videopocket-${id}`);fs.mkdirSync(workDir);fs.writeFileSync(path.join(workDir,'part'),'partial');
  app.state.task={id,url,state:'downloading',directory:app.state.directory,directoryIdentity,workDir};app.persist();await app.recover();
  assert.equal(app.state.task.state,'failed');assert.equal(app.state.task.error.code,'INTERRUPTED');assert(!fs.existsSync(workDir));
});
test('moved/deleted files are marked missing, never offered as locatable',async t=>{
  const {app}=fixture(t);const task=await ready(app);await app.request({command:'download',taskId:task.id,choice:'720:mp4'});await app.child.finished;fs.unlinkSync(task.path);
  assert.equal(app.view().task.missing,true);assert.equal(app.view().history[0].missing,true);await assert.rejects(app.request({command:'reveal',taskId:task.id}),/文件不存在/);await assert.rejects(app.request({command:'play',taskId:task.id}),/文件不存在/);
});
test('download failure never completes and retained history is bounded at 20',async t=>{
  const {app}=fixture(t);const task=await ready(app);task.options.push({key:'failure'});await app.request({command:'download',taskId:task.id,choice:'failure'});await app.child.finished;
  assert.equal(task.state,'failed');assert(!task.path);assert.equal(fs.readdirSync(task.directory).length,0);
  for(let i=0;i<30;i++)app.record({id:String(i),state:'failed'});assert.equal(app.state.history.length,20);assert.equal(app.state.history[0].id,'29');
});
test('invalid messages cannot choose an arbitrary output directory or format',async t=>{
  const {app}=fixture(t);const task=await ready(app);await assert.rejects(app.request({command:'download',taskId:'stale',choice:'720:mp4'}),/视频信息/);await assert.rejects(app.request({command:'download',taskId:task.id,choice:'--exec'}),/视频信息/);
});
test('broken state file is preserved for diagnosis without deleting video files',t=>{
  const {app,dir}=fixture(t);fs.writeFileSync(app.file,'broken json');const restored=new Controller({dataDir:app.dataDir,bin:app.bin});assert.match(restored.state.notice,/损坏/);assert(fs.readdirSync(app.dataDir).some(f=>f.includes('.corrupt-')));
});
test('restart after publishing but before cleanup restores history and removes only temporary files',async t=>{
  const {app}=fixture(t);const task=await ready(app);
  app.prepareDownload(task,'720:mp4');const workDir=task.workDir;
  const output=path.join(workDir,'final.mp4');fs.writeFileSync(output,'verified fixture');
  app.publish(task,{output,ext:'mp4',height:720,meta:{title:'完成前中断',videoId:'BaW_jenozKc',duration:10}});
  assert.equal(task.state,'completed');assert(fs.existsSync(workDir));
  await app.recover();assert(!fs.existsSync(workDir));assert(fs.existsSync(task.path));assert.equal(app.state.history[0].id,task.id);
});

test('detected media keeps its page referrer when retrying',async t=>{
  const {app}=fixture(t);
  await app.request({command:'parse',url:'https://media.example.test/clip.mp4?token=abc',referer:'https://example.test/player'});await app.child.finished;
  const task=app.state.task;task.options.push({key:'failure'});
  await app.request({command:'download',taskId:task.id,choice:'failure'});await app.child.finished;
  await app.request({command:'retry',taskId:task.id});
  assert.equal(app.state.task.referer,'https://example.test/player');assert.equal(app.state.task.url,task.url);
  await app.child.finished;
});
