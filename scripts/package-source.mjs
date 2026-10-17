import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
execFileSync(process.execPath,['scripts/audit-public.mjs'],{stdio:'inherit'});
const version=JSON.parse(fs.readFileSync('package.json')).version;
const target=path.resolve(`build/VideoPocket-${version}-public-source`);
fs.rmSync(target,{recursive:true,force:true});fs.mkdirSync(target,{recursive:true});
for(const name of JSON.parse(fs.readFileSync('public-files.json'))){
 const dest=path.join(target,name);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.copyFileSync(name,dest);
}
fs.mkdirSync('dist',{recursive:true});
execFileSync('/usr/bin/ditto',['-c','-k','--sequesterRsrc','--keepParent',target,path.resolve(`dist/VideoPocket-${version}-public-source.zip`)]);
console.log('Source-only archive ready; third-party binaries and private test outputs excluded.');
