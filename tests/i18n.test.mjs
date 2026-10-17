import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {initLanguage, language, tr, helperText, saveLanguage, normalizeLanguage} from '../extension/i18n.js';
import {english} from '../extension/messages.js';

test('language choice persists separately from task data, updates open views and survives reopening', async () => {
  const oldDocument=globalThis.document, oldChrome=globalThis.chrome;
  const stored={language:'en',lastState:{task:{id:'active',state:'downloading'}}};
  const select={value:'',addEventListener(type,callback){this[type]=callback;}};
  const status={hidden:true};
  const listeners=[];
  globalThis.document={documentElement:{lang:''},getElementById:id=>id==='language'?select:status,querySelectorAll:()=>[]};
  globalThis.chrome={storage:{local:{get:async()=>({...stored}),set:async values=>Object.assign(stored,values)},onChanged:{addListener:fn=>listeners.push(fn)}}};
  try {
    let changes=0;
    await initLanguage(()=>changes++);
    assert.equal(language,'en');
    assert.equal(tr('下载到本地'),'Download video');
    assert.equal(helperText('请打开单个视频页面，或点击「检测页面视频」'),'Open the original page for a single video, or paste a valid media URL.');
    assert.equal(helperText('正在合并'),'Merging audio and video');
    select.value='zh-CN';await select.change();
    assert.equal(stored.language,'zh-CN');assert.equal(language,'zh-CN');
    assert.equal(helperText('请打开单个视频页面，或点击「检测页面视频」'),'请打开单个视频的原页面，或粘贴有效的媒体链接');
    assert.deepEqual(stored.lastState,{task:{id:'active',state:'downloading'}});
    await initLanguage();assert.equal(select.value,'zh-CN');
    listeners[0]({language:{newValue:'en'}},'local');
    assert.equal(document.documentElement.lang,'en');assert.equal(select.value,'en');assert.equal(changes,3);
    assert.equal(tr('剩余 {count} 秒',{count:45}),'About 45 sec left');
    assert.equal(tr('{format} 文件 · 包含声音与画面 · 保留原始编码',{format:'MP4'}),'MP4 · Video and audio · Original codecs');
    assert.equal(helperText('启动检测超过 45 秒，请稍后重新检测'),'Startup exceeded 45 seconds. Reconnect shortly.');
    assert.equal(helperText('官方配套版本，校验通过'),'Bundled release, verified');
    for(const input of ['/Users/demo/下载/视频.mp4','https://example.test/视频?token={count}','标题：正在合并'])assert.equal(helperText(input),input);
    chrome.storage.local.set=async()=>{throw new Error('unavailable');};
    select.value='zh-CN';await select.change();
    assert.equal(language,'en');assert.equal(select.value,'en');assert.equal(status.hidden,false);assert.equal(select.disabled,false);
  } finally {globalThis.document=oldDocument;globalThis.chrome=oldChrome;}
});

test('unsupported language values are bounded; failed writes do not pretend success', async () => {
  assert.equal(normalizeLanguage('fr'),'zh-CN');
  assert.equal(normalizeLanguage(null),'zh-CN');
  await assert.rejects(saveLanguage('en',{set:async()=>{throw new Error('write failed');}}),/write failed/);
});

test('translated templates preserve parameters and helper user-facing errors have English translations', () => {
  for(const [zh,en] of Object.entries(english))assert.deepEqual([...zh.matchAll(/\{\w+\}/g)].map(m=>m[0]).sort(),[...en.matchAll(/\{\w+\}/g)].map(m=>m[0]).sort(),zh);
  for(const file of ['helper/core.mjs','helper/controller.mjs','helper/host.mjs','helper/worker.mjs','extension/background.js']){
    const code=fs.readFileSync(new URL('../'+file,import.meta.url),'utf8');
    for(const match of code.matchAll(/(?:new AppError\('[^']+',\s*|message\s*[:=]\s*)'([^']*[\p{Script=Han}][^']*)'/gu))assert.ok(Object.hasOwn(english,match[1]),`${file}: ${match[1]}`);
  }
});
