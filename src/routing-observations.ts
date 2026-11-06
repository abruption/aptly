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
    this.entries.delete(value.correlation_id);
    this.entries.set(value.correlation_id,{at:this.now(),value:structuredClone(value)});
    while(this.entries.size>128)this.entries.delete(this.entries.keys().next().value!);
  }
  begin(client:unknown,event:unknown) { this.record(initialHookObservation(client,event)); }
  lookup(client:unknown,event:unknown) {
    this.prune();
    const correlation_id=automaticCallId(client,event);
    const found=correlation_id?this.entries.get(correlation_id):undefined;
    return {scope:'this_process_recent_calls',retention_seconds:600,capacity:128,
      ...(found?structuredClone(found.value):{preflight:'not_observed',reason:correlation_id?'no_matching_observation':'invalid_event',
        ...(correlation_id?{correlation_id}:{}),execution:'not_observed'})};
  }
}
