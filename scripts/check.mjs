import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
for(const dir of ['helper','extension','scripts','tests']) {
  for(const file of fs.readdirSync(dir).filter(f=>/\.(mjs|js)$/.test(f)))execFileSync(process.execPath,['--check',path.join(dir,file)]);
}
const manifest=JSON.parse(fs.readFileSync('extension/manifest.json'));
assert.equal(manifest.manifest_version,3);
assert.deepEqual(manifest.permissions,['activeTab','storage','nativeMessaging']);
assert(!manifest.host_permissions&&!manifest.content_scripts&&!manifest.externally_connectable);
const id=[...crypto.createHash('sha256').update(Buffer.from(manifest.key,'base64')).digest().subarray(0,16)].flatMap(b=>[b>>4,b&15]).map(n=>String.fromCharCode(97+n)).join('');
assert.equal(id,JSON.parse(fs.readFileSync('helper/config.json')).extensionId);
for(const name of [manifest.action.default_popup,manifest.background.service_worker,...Object.values(manifest.icons)])assert(fs.existsSync(path.join('extension',name)));
assert(!fs.existsSync('extension/preview-chrome.js'));
assert(!fs.existsSync('extension/media-scan.js'));
console.log('Syntax, manifest permissions, fixed extension identity and packaged assets: OK');
