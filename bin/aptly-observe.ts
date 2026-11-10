#!/usr/bin/env node
// Internal command Hook. It never emits decisions/context, calls a provider or loads credentials.
import { readSync } from 'node:fs';
async function observe(){
 try{
  if(process.platform==='win32')return;
  const args=process.argv.slice(2);let client:'codex'|'claude'|undefined,policyPath:string|undefined;const seen=new Set<string>();
  for(let n=0;n<args.length;n+=2){const flag=args[n],value=args[n+1];if(seen.has(flag)||!value)return;seen.add(flag);if(flag==='--client'&&(value==='codex'||value==='claude'))client=value;else if(flag==='--policy-path')policyPath=value;else return;}
  if(!client||!policyPath)return;
  const buffer=Buffer.alloc(65537);let size=0;
  while(size<buffer.length){const count=readSync(0,buffer,size,buffer.length-size,null);if(!count)break;size+=count;}
  if(size>65536)return;
  const event:unknown=JSON.parse(buffer.subarray(0,size).toString('utf8'));
  if(!event||typeof event!=='object'||Array.isArray(event))return;
  const value=event as Record<string,unknown>;
  if(!['PostToolUse','SubagentStart','SubagentStop','PostModelRequest'].includes(String(value.hook_event_name)))return;
  if(value.hook_event_name==='PostModelRequest'&&typeof value.agent_id!=='string')return;
  const {statisticsState}=await import('../src/statistics-policy.ts');const state=statisticsState(policyPath);if(!state)return;
  const options={stateDirectory:state};const stats=await import('../src/statistics.ts');const config=stats.loadStatisticsConfig(options);if(!config?.enabled_clients.includes(client))return;
  let bridge:import('../src/statistics.ts').StatisticsBridge|undefined;
  if(client==='codex'&&config.codex_native_metadata&&config.codex_home&&typeof value.agent_id==='string'&&typeof value.session_id==='string'){
   const hash=stats.loadStatisticsHash(options);if(hash){const {resolveCodexStatisticsBridge}=await import('../src/statistics-codex.ts');const result=resolveCodexStatisticsBridge({codexHome:config.codex_home,childId:value.agent_id,parentId:value.session_id,hash});if(result.status==='matched')bridge=result;}
  }
  stats.observeStatistics(options,{client,event:value},bridge);
 }catch{ /* Statistics never steer the host or expose raw errors. */ }
}
await observe();
