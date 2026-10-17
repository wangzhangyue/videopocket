import fs from 'node:fs';
import path from 'node:path';
process.on('disconnect',()=>process.exit());
process.once('message',job=>{
  const meta={title:'中文 / 标题',videoId:'BaW_jenozKc',duration:10,options:[{key:'720:mp4',height:720,ext:'mp4'}]};
  if(job.operation==='parse'){process.send({type:'result',result:{kind:'ready',meta}});return;}
  process.send({type:'update',patch:{...meta,state:job.selected==='stall'?'merging':'downloading',stage:'测试阶段'}});
  if(job.selected==='stall')return;
  if(job.selected==='failure'){process.send({type:'result',error:{code:'NETWORK',message:'网络连接中断'}});return;}
  const output=path.join(job.workDir,'final.mp4');fs.writeFileSync(output,'verified test fixture');
  setTimeout(()=>process.send({type:'result',result:{kind:'complete',meta,output,ext:'mp4',height:720,duration:10}}),50);
});
