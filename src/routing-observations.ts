import {automaticCallId,initialHookObservation} from './automatic-hook.ts';
import type {AutomaticHookObservation} from './automatic-hook.ts';

/** Process-local, bounded diagnostics; absence is never proof that a host bypassed MCP. */
export class RoutingObservations {
  private entries=new Map<string,{at:number;value:AutomaticHookObservation}>();
  private now:()=>number;
  constructor(now:()=>number=Date.now) {this.now=now;}
  private prune() {
    for(const [id,entry] of this.entries)if(this.now()-entry.at>=600_000)this.entries.delete(id);
  }
  record(value:AutomaticHookObservation) {
    this.prune();
    if(!value.correlation_id)return;
    const previous=this.entries.get(value.correlation_id);
    const recovery=previous?.value.context_retry;
    const fresh=previous?.value.fresh_delegation;
    this.entries.delete(value.correlation_id);
    this.entries.set(value.correlation_id,{at:previous?.at??this.now(),value:structuredClone({...value,
      ...(recovery?{retry_id:previous!.value.retry_id,context_retry:recovery}:{}),...(fresh?{retry_id:previous!.value.retry_id,fresh_delegation:fresh}:{})})});
    while(this.entries.size>128)this.entries.delete(this.entries.keys().next().value!);
  }
  begin(client:unknown,event:unknown) { this.record(initialHookObservation(client,event)); }
  recordFresh(retry_id:string,result:Record<string,unknown>) {
    this.prune();const entry=[...this.entries.values()].find(entry=>entry.value.retry_id===retry_id);if(!entry)return;
    const status=result.status==='prepared'?'prepared':'rejected';
    const reason=typeof result.reason==='string'&&/^[a-z_]{1,64}$/.test(result.reason)?result.reason:'invalid_response';
    const outcome=status==='prepared'&&typeof result.preparation_id==='string'&&/^[a-f0-9]{64}$/.test(result.preparation_id)&&typeof result.profile_id==='string'&&/^codex-(simple|routine|deep)$/.test(result.profile_id)?{preparation_id:result.preparation_id,profile_id:result.profile_id}:entry.value.fresh_delegation?.outcome;
    entry.value={...entry.value,fresh_delegation:{...(outcome?{outcome}:{}),last_attempt:{status,reason},execution:'not_observed'}};
  }
  recordRetry(retry_id:string,result:Record<string,unknown>) {
    this.prune();
    const entry=[...this.entries.values()].find(entry=>entry.value.retry_id===retry_id);
    if(!entry)return;
    const status=['recommended','needs_context','unavailable','keep_current'].includes(String(result.status))?String(result.status):'unavailable';
    const reason=typeof result.reason==='string'&&/^[a-z_]{1,64}$/.test(result.reason)?result.reason:'invalid_response';
    const last_attempt={status,reason};
    const previous=entry.value.context_retry;
    let outcome=previous?.outcome;
    // Rejected duplicates/conflicts must not overwrite an earlier classification.
    if(result.request_id===retry_id){
      const application=result.spawn_application;
      outcome={status,reason,request_id:retry_id,
        classification:result.reason==='outcome_unknown'?'unknown':result.cached===true?'cache_hit':typeof result.latency_ms==='number'?'provider_requested':'local_outcome',
        recommendation:status==='recommended'?'produced':'not_produced',
        application:application&&typeof application==='object'&&'status' in application&&application.status==='blocked'?'blocked':'not_attempted',
        ...(typeof result.profile_id==='string'&&/^(codex|claude)-(simple|routine|deep)$/.test(result.profile_id)?{profile_id:result.profile_id}:{})};
    }
    // Keep the original timestamp and preflight stage; lookup never renews retention.
    entry.value={...entry.value,context_retry:{...(outcome?{outcome}:{}),last_attempt}};
  }
  lookupRetry(retry_id:string) {
    this.prune();
    const entry=[...this.entries.values()].find(entry=>entry.value.retry_id===retry_id);
    return {scope:'this_process_recent_calls',retention_seconds:600,capacity:128,
      ...(entry?structuredClone(entry.value):{preflight:'not_observed',reason:'no_matching_observation',execution:'not_observed'})};
  }
  lookup(client:unknown,event:unknown) {
    this.prune();
    const correlation_id=automaticCallId(client,event);
    const found=correlation_id?this.entries.get(correlation_id):undefined;
    return {scope:'this_process_recent_calls',retention_seconds:600,capacity:128,
      ...(found?structuredClone(found.value):{preflight:'not_observed',reason:correlation_id?'no_matching_observation':'invalid_event',
        ...(correlation_id?{correlation_id}:{}),execution:'not_observed'})};
  }
}
