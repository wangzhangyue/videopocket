import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');process.chdir(root);
const arch=process.argv[2]||'arm64';if(!['arm64','x64'].includes(arch))throw new Error('Expected arm64 or x64');
const version=JSON.parse(fs.readFileSync('package.json')).version;
const config=JSON.parse(fs.readFileSync('helper/config.json'));
const base=path.resolve(`build/package-${arch}`), payload=path.join(base,'root'), install='/Library/Application Support/VideoPocket';
fs.rmSync(base,{recursive:true,force:true});fs.mkdirSync(payload,{recursive:true});
const helper=path.join(payload,install);
fs.cpSync('helper',helper,{recursive:true});fs.mkdirSync(path.join(helper,'bin'));
const components={arch,ytDlp:'2026.08.19',node:'22.23.3',ejs:'0.8.0',ffmpeg:'8.0.1',sha256:{}};
for(const name of ['node','yt-dlp','ffmpeg','ffprobe']) {
  const source=`vendor/${arch}/${name}`;if(!fs.existsSync(source))throw new Error(`Missing ${source}; run fetch-vendor.sh and build-ffmpeg.sh first`);
  const dest=path.join(helper,'bin',name);fs.copyFileSync(source,dest);fs.chmodSync(dest,0o755);
  components.sha256[name]=crypto.createHash('sha256').update(fs.readFileSync(source)).digest('hex');
}
fs.cpSync(`vendor/${arch}/_internal`,path.join(helper,'bin','_internal'),{recursive:true,verbatimSymlinks:true});
for(const name of ['core.min.js','lib.min.js']) {
  const relative=`_internal/yt_dlp_ejs/yt/solver/${name}`;
  components.sha256[relative]=crypto.createHash('sha256').update(fs.readFileSync(path.join(helper,'bin',relative))).digest('hex');
}
fs.writeFileSync(path.join(helper,'components.json'),JSON.stringify(components,null,2));
fs.cpSync('vendor/licenses',path.join(helper,'licenses'),{recursive:true});
fs.copyFileSync('docs/THIRD_PARTY.md',path.join(helper,'licenses','THIRD_PARTY.md'));
const registration=path.join(payload,'Library/Google/Chrome/NativeMessagingHosts');fs.mkdirSync(registration,{recursive:true});
fs.writeFileSync(path.join(registration,'com.videopocket.helper.json'),JSON.stringify({name:'com.videopocket.helper',description:'VideoPocket local video download helper',path:`${install}/launch.sh`,type:'stdio',allowed_origins:[`chrome-extension://${config.extensionId}/`]},null,2));
fs.chmodSync(path.join(helper,'launch.sh'),0o755);
const release=path.resolve(`dist/VideoPocket-${version}-${arch}`);fs.rmSync(release,{recursive:true,force:true});fs.mkdirSync(release,{recursive:true});
const component=path.join(base,'component.pkg');
const componentPlist=path.join(base,'components.plist');
fs.writeFileSync(componentPlist,'<?xml version="1.0"?><plist version="1.0"><array/></plist>');
execFileSync('/usr/bin/pkgbuild',['--root',payload,'--component-plist',componentPlist,'--identifier','com.videopocket.helper','--version',version,'--install-location','/','--ownership','recommended',component],{stdio:'inherit'});
const xml=`<?xml version="1.0"?><installer-gui-script minSpecVersion="2"><title>拾影 · VideoPocket ${version}</title><options customize="never" require-scripts="false" hostArchitectures="${arch==='arm64'?'arm64':'x86_64'}"/><allowed-os-versions><os-version min="13.0"/></allowed-os-versions><domains enable_localSystem="true" enable_currentUserHome="false" enable_anywhere="false"/><choices-outline><line choice="default"/></choices-outline><choice id="default" visible="false"><pkg-ref id="com.videopocket.helper"/></choice><pkg-ref id="com.videopocket.helper" version="${version}" onConclusion="none">component.pkg</pkg-ref></installer-gui-script>`;
fs.writeFileSync(path.join(base,'Distribution.xml'),xml);
execFileSync('/usr/bin/productbuild',['--distribution',path.join(base,'Distribution.xml'),'--package-path',base,path.join(release,`VideoPocket-${version}-${arch}.pkg`)],{stdio:'inherit'});
if (arch === process.arch) {
  const preflight = execFileSync('/usr/sbin/installer',['-showChoicesXML','-pkg',path.join(release,`VideoPocket-${version}-${arch}.pkg`),'-target','/'],{encoding:'utf8'});
  fs.writeFileSync(path.join(base,'installer-preflight.xml'),preflight);
  console.log('System installer compatibility preflight: passed (no installation performed)');
}
fs.cpSync('extension',path.join(release,'extension'),{recursive:true});
fs.cpSync('docs',path.join(release,'docs'),{recursive:true});
fs.copyFileSync('README.md',path.join(release,'开始使用.md'));
fs.cpSync('vendor/licenses',path.join(release,'licenses'),{recursive:true});
fs.mkdirSync(path.join(release,'sources'));
fs.copyFileSync('vendor/src/ffmpeg-8.0.1.tar.xz',path.join(release,'sources/ffmpeg-8.0.1.tar.xz'));
fs.copyFileSync('scripts/build-ffmpeg.sh',path.join(release,'sources/build-ffmpeg.sh'));
fs.copyFileSync('vendor/src/yt-dlp-2026.08.19.tar.gz',path.join(release,'sources/yt-dlp-2026.08.19.tar.gz'));
execFileSync('/usr/bin/osacompile',['-o',path.join(release,'卸载拾影助手.app'),'scripts/uninstall.applescript']);
const files=fs.readdirSync(release).filter(f=>f.endsWith('.pkg'));
fs.writeFileSync(path.join(release,'SHA256SUMS.txt'),files.map(f=>`${crypto.createHash('sha256').update(fs.readFileSync(path.join(release,f))).digest('hex')}  ${f}`).join('\n')+'\n');
execFileSync('/usr/bin/ditto',['-c','-k','--sequesterRsrc','--keepParent',release,`${release}.zip`]);
console.log(`Built ${release}.zip`);
