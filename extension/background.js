const HOST='com.videopocket.helper';
let port=null, connecting=null, serial=0, lastState=null;
const pending=new Map();
const commands=new Set(['hello','snapshot','parse','download','cancel','retry','chooseDirectory','reveal','play','clearHistory']);
function connectionError(message='') {
  if (/not found|not registered/i.test(message)) return {code:'NOT_INSTALLED',message:'需要安装本地下载助手'};
  if (/forbidden/i.test(message)) return {code:'REGISTRATION',message:'助手与插件未正确配对，请重新安装配套版本'};
  return {code:'DISCONNECTED',message:'助手连接中断，请重新检测连接'};
}
function publish(data) {
  lastState=data;
  chrome.storage.local.set({lastState:data});
  chrome.runtime.sendMessage({type:'state',data}).catch(()=>{});
}
function rpc(command,payload={},timeout=15000) {
  return new Promise((resolve,reject)=>{
    if(!port) {reject(connectionError());return;}
    const id=String(++serial);
    const timer=setTimeout(()=>{pending.delete(id);reject({code:'TIMEOUT',message:'助手响应超时，请重新检测连接'});},timeout);
    pending.set(id,{resolve,reject,timer});
    try {port.postMessage({id,command,...payload});} catch {clearTimeout(timer);pending.delete(id);reject(connectionError());}
  });
}
async function connect() {
  if(connecting) return connecting;
  if(port) return;
  connecting=(async()=>{
    port=chrome.runtime.connectNative(HOST);
    port.onMessage.addListener(m=>{
      if(m.event==='state') publish({...m.data,connected:true});
      else if(m.event==='fatal') {
        const error=m.error; for(const p of pending.values()) {clearTimeout(p.timer);p.reject(error);} pending.clear();
        publish({...lastState,connected:false,connectionError:error});
      } else if(pending.has(m.id)) {
        const p=pending.get(m.id);pending.delete(m.id);clearTimeout(p.timer);
        if(m.ok) {publish({...m.data,connected:true});p.resolve(m.data);} else p.reject(m.error);
      }
    });
    port.onDisconnect.addListener(()=>{
      const error=connectionError(chrome.runtime.lastError?.message);
      port=null;
      for(const p of pending.values()) {clearTimeout(p.timer);p.reject(error);} pending.clear();
      publish({...lastState,connected:false,connectionError:lastState?.connectionError?.code==='BUSY'?lastState.connectionError:error});
    });
    const state=await rpc('hello',{protocol:1},65000);
    if(state.protocol!==1 || state.version!=='0.2.2') {
      port.disconnect();port=null;throw {code:'VERSION',message:'插件与助手版本不兼容，请安装配套的 0.2.2 版本'};
    }
  })().catch(error=>{if(port){port.disconnect();port=null;}throw error;}).finally(()=>{connecting=null;});
  return connecting;
}
chrome.runtime.onMessage.addListener((m,sender,reply)=>{
  if(sender.id!==chrome.runtime.id || sender.url!==chrome.runtime.getURL('popup.html')) return;
  if(m?.type!=='request' || !commands.has(m.command)) return;
  (async()=>{
    try {await connect();reply({ok:true,data:await rpc(m.command,m.payload||{},m.command==='chooseDirectory'?125000:m.command==='hello'?65000:15000)});}
    catch(error) {reply({ok:false,error});}
  })();return true;
});
