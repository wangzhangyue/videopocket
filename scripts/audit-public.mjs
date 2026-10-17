import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const files=JSON.parse(fs.readFileSync('public-files.json','utf8'));
assert.equal(new Set(files).size,files.length,'Duplicate public path');
for(const name of files){
 assert(!path.isAbsolute(name)&&!name.split('/').includes('..'),'Unsafe public path');
 assert(!/^(build|dist|vendor|node_modules|\.git)\//.test(name),'Generated directory in release');
 assert(!/\.(pkg|zip|log|pem|key)$|results\.(txt|json)$/.test(name),'Non-source output in release');
 const stat=fs.lstatSync(name);assert(stat.isFile()&&!stat.isSymbolicLink(),'Only regular files allowed');
 if(/\.(png|mp4)$/.test(name)){
  assert(/^extension\/icons\/(16|32|48|128)\.png$/.test(name)||name==='tests/fixtures/thumbnail-h264.mp4','Unreviewed binary asset');
  continue;
 }
 const content=fs.readFileSync(name,'utf8');
 assert(!/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(content),'Private key found');
 assert(!/gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,}/.test(content),'Credential-like string found');
 assert(!/\/Users\/(?!demo(?:\/|$)|test(?:\/|$))[^\s/]+\//.test(content),'Personal filesystem path found');
}
console.log(`Public allowlist audit: ${files.length} files passed. Review new files and dependency obligations before release.`);
