import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const extension=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../extension');
const mock=fs.readFileSync(new URL('./preview-chrome.js',import.meta.url),'utf8');
http.createServer((req,res)=>{
  const pathname=new URL(req.url,'http://localhost').pathname;
  if(pathname==='/preview-chrome.js'){res.setHeader('Content-Type','text/javascript');res.end(mock);return;}
  const name=pathname==='/'?'popup.html':pathname.slice(1);
  if(!/^(popup\.html|popup\.css|popup\.js|i18n\.js|messages\.js|help\.js|help\.html|help\.css)$/.test(name)){res.writeHead(404);res.end();return;}
  let content=fs.readFileSync(path.join(extension,name));
  if(name.endsWith('.html'))content=content.toString().replace('</head>','<script src="/preview-chrome.js"></script></head>');
  res.setHeader('Content-Type',name.endsWith('.css')?'text/css':name.endsWith('.js')?'text/javascript':'text/html');res.end(content);
}).listen(Number(process.argv[2]||4173),'127.0.0.1',()=>console.log('UI fixture server ready (simulated data only)'));
