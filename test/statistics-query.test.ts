import test from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createTestTemp } from '../test-support/temp.ts';
import { STATISTICS_CONFIG_FILE, STATISTICS_DATABASE_FILE, STATISTICS_KEY_FILE, readStatistics, readStatisticsQuery, recordStatisticsRecommendation, serializeStatisticsConfig } from '../src/statistics.ts';

const posix={skip:process.platform==='win32'};
const config=(enabled_clients:('codex'|'claude')[])=>serializeStatisticsConfig({schema_version:1,enabled_clients});

test('detailed statistics reports absent and disabled stores without creating files',posix,t=>{
 const stateDirectory=createTestTemp(t,'codex-stats-query-');const options={stateDirectory};
 const absent=readStatisticsQuery(options);assert.equal(absent.failed,false);assert.deepEqual(absent.result,readStatistics(options));assert.deepEqual(readdirSync(stateDirectory),[]);
 writeFileSync(join(stateDirectory,STATISTICS_CONFIG_FILE),config([]),{mode:0o600});
 const disabled=readStatisticsQuery(options);assert.equal(disabled.failed,false);assert.deepEqual(disabled.result,readStatistics(options));assert.deepEqual(readdirSync(stateDirectory),[STATISTICS_CONFIG_FILE]);
});

test('malformed and insecure configuration reports failure with the legacy projection',posix,t=>{
 const stateDirectory=createTestTemp(t,'codex-stats-query-');const options={stateDirectory};const path=join(stateDirectory,STATISTICS_CONFIG_FILE);
 writeFileSync(path,'{bad',{mode:0o600});
 let view=readStatisticsQuery(options);assert.equal(view.failed,true);assert.deepEqual(view.result,readStatistics(options));
 writeFileSync(path,config(['codex']));chmodSync(path,0o644);
 view=readStatisticsQuery(options);assert.equal(view.failed,true);assert.deepEqual(view.result,readStatistics(options));assert.equal(readFileSync(path,'utf8'),config(['codex']));
});

test('missing or invalid database fails when required while retaining legacy fields',posix,t=>{
 const stateDirectory=createTestTemp(t,'codex-stats-query-');const options={stateDirectory};
 writeFileSync(join(stateDirectory,STATISTICS_CONFIG_FILE),config(['codex']),{mode:0o600});
 let view=readStatisticsQuery(options);assert.equal(view.failed,true);assert.deepEqual(view.result,readStatistics(options));assert.equal(view.result.status,'ok');
 const other=readStatisticsQuery(options,{client:'claude'});assert.equal(other.failed,false);assert.deepEqual(other.result,readStatistics(options,{client:'claude'}));
 const db=join(stateDirectory,STATISTICS_DATABASE_FILE);writeFileSync(db,'not a database',{mode:0o600});
 view=readStatisticsQuery(options);assert.equal(view.failed,true);assert.deepEqual(view.result,readStatistics(options));assert.equal(view.result.status,'unavailable');assert.equal(readFileSync(db,'utf8'),'not a database');
 chmodSync(db,0o644);view=readStatisticsQuery(options);assert.equal(view.failed,true);assert.deepEqual(view.result,readStatistics(options));
 assert.deepEqual(readdirSync(stateDirectory).sort(),[STATISTICS_CONFIG_FILE,STATISTICS_DATABASE_FILE].sort());
});

test('detailed query preserves retained counts and does not change store files',posix,t=>{
 const stateDirectory=createTestTemp(t,'codex-stats-query-');const options={stateDirectory};
 writeFileSync(join(stateDirectory,STATISTICS_CONFIG_FILE),config(['codex']),{mode:0o600});
 writeFileSync(join(stateDirectory,STATISTICS_KEY_FILE),'a'.repeat(64)+'\n',{mode:0o600});
 assert.equal(recordStatisticsRecommendation(options,{client:'codex',requestId:'one',disposition:'unbound'}).status,'recorded');
 const names=readdirSync(stateDirectory).sort();const before=names.map(name=>readFileSync(join(stateDirectory,name)));
 const view=readStatisticsQuery(options);assert.equal(view.failed,false);assert.equal(view.result.unbound,1);assert.equal(view.result.delegations,1);assert.deepEqual(view.result,readStatistics(options));
 assert.deepEqual(readdirSync(stateDirectory).sort(),names);assert.deepEqual(names.map(name=>readFileSync(join(stateDirectory,name))),before);
 writeFileSync(join(stateDirectory,STATISTICS_CONFIG_FILE),'{bad');
 const malformed=readStatisticsQuery(options);assert.equal(malformed.failed,true);assert.equal(malformed.result.unbound,1);assert.deepEqual(malformed.result,readStatistics(options));
});

test('missing configuration with retained artifacts is incomplete',posix,t=>{
 const stateDirectory=createTestTemp(t,'codex-stats-query-');const options={stateDirectory};
 const key=join(stateDirectory,STATISTICS_KEY_FILE);writeFileSync(key,'not-read-as-secret',{mode:0o600});
 let view=readStatisticsQuery(options);assert.equal(view.failed,true);assert.deepEqual(view.result,readStatistics(options));
 // A valid retained DB also requires its missing configuration to be reported.
 writeFileSync(join(stateDirectory,STATISTICS_CONFIG_FILE),config(['codex']),{mode:0o600});
 writeFileSync(key,'a'.repeat(64)+'\n');
 assert.equal(recordStatisticsRecommendation(options,{client:'codex',requestId:'one',disposition:'unbound'}).status,'recorded');
 unlinkSync(join(stateDirectory,STATISTICS_CONFIG_FILE));unlinkSync(key);
 view=readStatisticsQuery(options);assert.equal(view.failed,true);assert.equal(view.result.unbound,1);assert.deepEqual(view.result,readStatistics(options));
});
