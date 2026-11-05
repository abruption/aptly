import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync,chmodSync,symlinkSync,mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { loadConfiguration,loadHostContext,readPrivateJson } from '../src/config.ts';
import { createTestTemp } from '../test-support/temp.ts';
const write=(path,value)=>writeFileSync(path,JSON.stringify(value),{mode:0o600});
test('private operator configuration is opt-in, strict and fails to shadow',t=>{
 const dir=createTestTemp(t,'codex-config-test-'),path=join(dir,'router.json');
 assert.equal(loadConfiguration({}).mode,'shadow');
 write(path,{schema_version:1,mode:'apply',context_path:join(dir,'context.json')});
 assert.equal(loadConfiguration({ROUTER_CONFIG_PATH:path}).mode,'apply');
 chmodSync(path,0o644);assert.equal(loadConfiguration({ROUTER_CONFIG_PATH:path}).mode,'shadow');
 chmodSync(path,0o600);write(path,{schema_version:1,mode:'apply',provenance_verified:true});
 assert.equal(loadConfiguration({ROUTER_CONFIG_PATH:path}).error,'configuration_invalid');
 assert.equal(loadConfiguration({ROUTER_CONFIG_PATH:'relative.json'}).mode,'shadow');
});
test('private context refuses symlinks, malformed/oversized files and source drift',t=>{
 const dir=createTestTemp(t,'codex-context-test-'),source=join(dir,'settings.json'),path=join(dir,'context.json');
 write(source,{model:'synthetic-setting'});
 const sha=createHash('sha256').update(JSON.stringify({model:'synthetic-setting'})).digest('hex');
 write(path,{schema_version:1,authority:'effective-host-settings-v1',context:{client:'codex'},sources:[{path:source,sha256:sha}]});
 assert.equal(loadHostContext(path).context.evidence_verified,true);
 write(source,{model:'changed'});assert.equal(loadHostContext(path).reason,'context_sources_changed');
 write(path,{schema_version:1,authority:'effective-host-settings-v1',context:{evidence_verified:true},sources:[]});
 assert.equal(loadHostContext(path).reason,'context_envelope_invalid');
 const link=join(dir,'link.json');symlinkSync(path,link);assert.throws(()=>readPrivateJson(link),/private_file_unavailable/);
 const real=join(dir,'real');mkdirSync(real);write(join(real,'context.json'),{});symlinkSync(real,join(dir,'alias'));
 assert.throws(()=>readPrivateJson(join(dir,'alias','context.json')),/private_file_unavailable/);
 writeFileSync(path,'x'.repeat(65537));assert.equal(loadHostContext(path).reason,'context_file_unavailable');
});
test('source fingerprints change even if redacted effective states are identical',t=>{
 const dir=createTestTemp(t,'codex-context-hash-'),source=join(dir,'settings.json'),path=join(dir,'context.json');
 const envelope={schema_version:1,authority:'effective-host-settings-v1',context:{client:'codex'},sources:[]};
 const save=value=>{write(source,{unrelated:value});envelope.sources=[{path:source,sha256:createHash('sha256').update(JSON.stringify({unrelated:value})).digest('hex')}];write(path,envelope);return loadHostContext(path);};
 const before=save('before'),after=save('after');
 assert.deepEqual(before.context,after.context);assert.notEqual(before.fingerprint,after.fingerprint);
});
