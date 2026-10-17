import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
function setup({version='0.2.2'}={}){
  const listeners={};let connections=0,requests=[],cached;
  const port={onMessage:{addListener:fn=>listeners.native=fn},onDisconnect:{addListener:fn=>listeners.disconnect=fn},disconnect(){listeners.disconnect();},postMessage(m){requests.push(m);queueMicrotask(()=>listeners.native({id:m.id,ok:true,data:{version,protocol:1,health:{ok:true},task:{id:'persisted',state:'downloading'}}}));}};
  const chrome={runtime:{id:'test',getURL:name=>`chrome-extension://test/${name}`,connectNative(){connections++;return port;},onMessage:{addListener:fn=>listeners.popup=fn},sendMessage:async()=>{},lastError:undefined},storage:{local:{set:async value=>{cached=value;}}}};
  vm.runInNewContext(fs.readFileSync(new URL('../extension/background.js',import.meta.url),'utf8'),{chrome,console,setTimeout,clearTimeout,Map,Set});
  const send=(command,payload={})=>new Promise(resolve=>listeners.popup({type:'request',command,payload},{id:'test',url:'chrome-extension://test/popup.html'},resolve));
  return {send,listeners,chrome,get connections(){return connections;},get requests(){return requests;},get cached(){return cached;}};
}
test('popup reopen uses same native port and restores existing task without creating a download',async()=>{
  const app=setup();assert((await app.send('snapshot')).ok);assert((await app.send('snapshot')).ok);assert.equal(app.connections,1);assert.deepEqual(app.requests.map(r=>r.command),['hello','snapshot','snapshot']);
});
test('background rejects messages from web pages and other extensions',()=>{
  const app=setup();let called=false;
  app.listeners.popup({type:'request',command:'download'},{id:'other',url:'https://evil.test'},()=>called=true);assert.equal(called,false);assert.equal(app.connections,0);
});
test('incompatible helper is disconnected before forwarding user command',async()=>{
  const app=setup({version:'0.9.0'});const result=await app.send('parse',{url:'https://youtu.be/BaW_jenozKc'});assert.equal(result.ok,false);assert.equal(result.error.code,'VERSION');assert.equal(app.requests.length,1);
});
test('connection loss marks cached state disconnected and next user action reconnects',async()=>{
  const app=setup();await app.send('snapshot');app.listeners.disconnect();assert.equal(app.cached.lastState.connected,false);assert((await app.send('snapshot')).ok);assert.equal(app.connections,2);
});
