import {tr, helperText, language, initLanguage} from './i18n.js';
const $=id=>document.getElementById(id);
const active=new Set(['parsing','downloading','merging','verifying']);
const labels={parsing:'解析中',ready:'可下载',downloading:'下载中',merging:'合并中',verifying:'校验中',completed:'已保存',failed:'失败',cancelled:'已取消'};
let state=null, page='download', waiting=false, uiError=null;
const validThumbnail=value=>typeof value==='string'&&value.length<=32023&&/^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/.test(value);
const show=(id,yes)=>{$(id).hidden=!yes;};
function size(n){if(!Number.isFinite(n))return tr('计算中');if(n<1024)return `${n} B`;const i=Math.min(Math.floor(Math.log(n)/Math.log(1024)),3);return `${(n/1024**i).toFixed(i>1?1:0)} ${['B','KB','MB','GB'][i]}`;}
function duration(n){if(!n)return tr('时长未知');return `${Math.floor(n/60)}:${String(Math.floor(n%60)).padStart(2,'0')}`;}
function error(e){uiError=e;$('error').textContent=helperText(e?.message||'操作未完成，请重试');show('error',true);$('diagnostic-text').textContent=e?.diagnostic||'';show('diagnostics',Boolean(e?.diagnostic));}
function clearError(){uiError=null;show('error',false);show('diagnostics',false);}
async function request(command,payload={}) {
  const response=await chrome.runtime.sendMessage({type:'request',command,payload});
  if(!response?.ok)throw response?.error||{message:'无法连接扩展后台，请重新打开插件'};
  return {...response.data,connected:true};
}
async function act(command,payload={}) {
  if(waiting)return;
  waiting=true;clearError();render();
  try{state=await request(command,payload);render();}
  catch(e){error(e);}
  finally{waiting=false;render();}
}
function render(){
  const connected=Boolean(state?.connected), healthy=connected&&state?.health?.ok;
  const t=state?.task, busy=active.has(t?.state), setup=!healthy;
  show('connection-status',!healthy&&Boolean(state?.connectionError||connected));
  $('reconnect').disabled=waiting;
  $('connection-dot').className=`dot ${healthy?'ok':'off'}`;
  $('connection-text').textContent=helperText(healthy?'本地助手已连接':(state?.connectionError?.message || (connected?'下载组件需要修复':'正在等待本地助手')));
  show('setup',setup&&page==='download');show('download-panel',healthy&&page==='download');show('history-panel',page==='history');
  $('download-tab').classList.toggle('active',page==='download');$('history-tab').classList.toggle('active',page==='history');
  $('download-tab').setAttribute('aria-pressed',page==='download');$('history-tab').setAttribute('aria-pressed',page==='history');
  $('history-count').textContent=state?.history?.length||0;
  show('component-details',Boolean(state?.health?.components));
  $('component-summary').textContent=tr('助手 {version} · 组件信息',{version:state?.version||tr('未知版本')});
  $('component-list').replaceChildren(...(state?.health?.components||[]).map(c=>{const li=document.createElement('li');li.textContent=`${c.ok?'✓':'!'} ${helperText(c.name)}: ${helperText(c.version)}`;return li;}));
  $('notice').textContent=helperText(state?.notice||'');show('notice',Boolean(state?.notice));
  if(connected&&!healthy&&state.health) {
    const failed=state.health.components.filter(c=>!c.ok);
    const reason=failed.every(c=>c.code==='STARTUP_TIMEOUT')?'组件启动超时，请重新检测':'组件检测未通过';
    $('connection-text').textContent=tr(`${reason}：{names}`,{names:failed.map(c=>helperText(c.name)).join(', ')});
    const diagnostics=failed.filter(c=>c.diagnostic).map(c=>`${c.name}：${c.diagnostic}`).join('\n');
    if(diagnostics){$('diagnostic-text').textContent=diagnostics;show('diagnostics',true);}
  }
  show('empty',!t);show('task',Boolean(t));
  for(const id of ['url','parse','current-tab','choose-directory']) $(id).disabled=busy||waiting||!healthy;
  $('directory').textContent=state?.directory||tr('下载 / 拾影');$('directory').title=state?.directory||'';
  if(t){
    const preview=t.state==='completed'&&validThumbnail(t.thumbnail);
    show('play-video',Boolean(preview));
    $('play-video').disabled=waiting||!healthy||t.missing;
    $('play-video').setAttribute('aria-label',tr('使用默认播放器播放'));
    $('play-video').title=tr('使用默认播放器播放');
    $('thumbnail-duration').textContent=duration(t.duration);
    show('thumbnail-duration',Number.isFinite(t.duration)&&t.duration>0);
    if(preview)$('task-thumbnail').src=t.thumbnail;else $('task-thumbnail').removeAttribute('src');
    try {$('video-site').textContent=new URL(t.url).hostname;}catch{$('video-site').textContent=tr('网页视频');}
    $('video-title').textContent=t.title||tr('正在读取视频信息');
    $('video-meta').textContent=t.duration?tr('{duration} · 最高 1080p',{duration:duration(t.duration)}):t.url;
    show('quality-area',t.state==='ready');
    if(t.state==='ready'){
      const chosen=$('quality').value, signature=`${language}:${t.id}:${JSON.stringify(t.options)}`;
      if($('quality').dataset.signature!==signature){
        $('quality').replaceChildren(...t.options.map(o=>{const node=document.createElement('option');node.value=o.key;node.textContent=`${o.height?`${o.height}p`:tr('原始清晰度')}${o.fps>30?` · ${o.fps}fps`:''}    ${o.ext.toUpperCase()}${o.bytes?` · ${tr('约')} ${size(o.bytes)}`:''}`;return node;}));
        $('quality').dataset.signature=signature;
        if($('quality').dataset.taskId===t.id&&t.options.some(o=>o.key===chosen))$('quality').value=chosen;
        $('quality').dataset.taskId=t.id;
      }
      const selected=t.options.find(o=>o.key===$('quality').value);
      $('format-note').textContent=selected?.unverified?tr('源站未提供完整格式信息；下载后校验声音、画面和清晰度，最高 1080p。'):tr('{format} 文件 · 包含声音与画面 · 保留原始编码',{format:selected?.ext.toUpperCase()||''});
    }
    show('progress-area',busy);$('stage').textContent=helperText(t.stage||labels[t.state]);
    const p=t.progress||{}, percent=p.total>0&&p.bytes>=0?Math.min(100,Math.floor(p.bytes/p.total*100)):null;
    $('percentage').textContent=percent===null?tr('计算中'):`${percent}%`;
    if(percent===null)$('progress').removeAttribute('value');else $('progress').value=percent;
    $('bytes').textContent=tr('已下载 {size}',{size:size(p.downloaded)});
    $('speed').textContent=p.speed?`${size(p.speed)}/s`:tr('速度计算中');
    $('eta').textContent=Number.isFinite(p.eta)?tr(p.eta>=60?'剩余 {count} 分钟':'剩余 {count} 秒',{count:Math.ceil(p.eta>=60?p.eta/60:p.eta)}):tr('时间计算中');
    show('result-area',['completed','cancelled'].includes(t.state));
    $('result-label').textContent=helperText(t.state==='completed'?(t.missing?'文件不存在':'已保存到本地'):'任务已取消');
    $('result-detail').textContent=helperText(t.state==='completed'?`${t.height}p · ${(t.ext||'').toUpperCase()} · ${size(t.bytes)}`:(t.cleanupWarning?'任务已停止，请查看下方清理提示。':'临时文件已清理，可以重新尝试。'));
    $('file-path').textContent=t.path||'';show('file-path',Boolean(t.path));
    $('task-error').textContent=helperText(t.error?.message||t.cleanupWarning||'');show('task-error',Boolean(t.error||t.cleanupWarning));
    if(t.error?.diagnostic){$('diagnostic-text').textContent=t.error.diagnostic;show('diagnostics',true);}
    show('start',t.state==='ready');show('cancel',busy);show('retry',['failed','cancelled'].includes(t.state));show('reveal',t.state==='completed'&&!t.missing);
    for(const id of ['start','cancel','retry','reveal'])$(id).disabled=waiting||!healthy;
  }
  if(uiError)error(uiError);
  $('clear-history').disabled=!connected||waiting||!(state?.history?.length);
  const history=state?.history||[];
  $('history-list').replaceChildren();
  if(!history.length){const p=document.createElement('p');p.className='muted';p.textContent=tr('下载过的视频，会在这里留下记录。');$('history-list').append(p);}
  for(const item of history){
    const article=document.createElement('article');article.className='history-item';
    const title=document.createElement('h3');title.textContent=item.title||item.url;
    const row=document.createElement('div');row.className='history-row';
    const status=document.createElement('span');status.textContent=`${tr(item.missing?'文件不存在':labels[item.state])} · ${new Date(item.endedAt).toLocaleDateString(language,{month:'2-digit',day:'2-digit'})}`;
    row.append(status);
    if((item.state==='completed'&&!item.missing)||['failed','cancelled'].includes(item.state)){
      const b=document.createElement('button');b.className='text-button';b.textContent=tr(item.state==='completed'?'在文件夹中显示':'重试');b.disabled=!healthy||waiting||(busy&&item.state!=='completed');
      b.addEventListener('click',()=>{if(item.state!=='completed')page='download';act(item.state==='completed'?'reveal':'retry',{taskId:item.id});});row.append(b);
    }
    if(item.state==='completed'&&validThumbnail(item.thumbnail)){
      const image=document.createElement('img');image.className='history-thumbnail';image.src=item.thumbnail;image.alt='';image.loading='lazy';const play=document.createElement('button');play.type='button';play.className='thumbnail-button history-play';play.setAttribute('aria-label',tr('使用默认播放器播放'));play.title=tr('使用默认播放器播放');play.disabled=waiting||!healthy||item.missing;play.append(image);if(Number.isFinite(item.duration)&&item.duration>0){const time=document.createElement('span');time.className='thumbnail-duration';time.textContent=duration(item.duration);play.append(time);}play.addEventListener('click',()=>act('play',{taskId:item.id}));article.append(play);article.classList.add('has-thumbnail');
    }
    const content=document.createElement('div');content.className='history-content';content.append(title,row);article.append(content);
    if(item.error){const detail=document.createElement('p');detail.className='muted';detail.textContent=helperText(item.error.message);content.append(detail);}
    $('history-list').append(article);
  }
}
async function currentURL(){const [tab]=await chrome.tabs.query({active:true,currentWindow:true});return tab?.url||'';}
function supported(value){try{const u=new URL(value);return ['http:','https:'].includes(u.protocol)&&!u.username&&!u.password;}catch{return false;}}
$('url-form').addEventListener('submit',e=>{e.preventDefault();act('parse',{url:$('url').value});});
$('current-tab').addEventListener('click',async()=>{const url=await currentURL();if(supported(url)){$('url').value=url;await act('parse',{url});}else error({message:'请打开网站视频页面，或粘贴 HTTP / HTTPS 视频链接'});});
$('quality').addEventListener('change',render);
$('start').addEventListener('click',()=>act('download',{taskId:state.task.id,choice:$('quality').value}));
$('cancel').addEventListener('click',()=>act('cancel',{taskId:state.task.id}));
$('retry').addEventListener('click',()=>act('retry',{taskId:state.task.id}));
$('play-video').addEventListener('click',()=>act('play',{taskId:state.task.id}));
$('reveal').addEventListener('click',()=>act('reveal',{taskId:state.task.id}));
$('choose-directory').addEventListener('click',()=>act('chooseDirectory'));
$('clear-history').addEventListener('click',()=>act('clearHistory'));
$('reconnect').addEventListener('click',()=>act('hello',{protocol:1}));
$('download-tab').addEventListener('click',()=>{page='download';render();});
$('history-tab').addEventListener('click',()=>{page='history';render();});
for(const id of ['help','about','install-help'])$(id).addEventListener('click',()=>chrome.tabs.create({url:chrome.runtime.getURL('help.html')}));
chrome.runtime.onMessage.addListener(m=>{if(m.type==='state'){state=m.data;render();}});
await initLanguage(render);
try{
  const saved=await chrome.storage.local.get('lastState');state=saved.lastState?{...saved.lastState,connected:false}:null;render();
  state=await request('snapshot');render();
  if(state.health?.ok&&!state.task){
    const url=await currentURL();if(supported(url)){$('url').value=url;await act('parse',{url});}
  }
}catch(e){state={...state,connected:false,connectionError:e};render();}
setInterval(async()=>{if(!state?.connected||waiting)return;try{state=await request('snapshot');render();}catch{}},2500);
