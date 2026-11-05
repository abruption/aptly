// Fixture reference model ONLY. Not a Codex RPC, evidence writer, or spawn adapter.
import { randomUUID } from 'node:crypto';
import { digestToolInput, resolveProvenance } from '../src/provenance.ts';
import { hookOutput } from '../src/hook.ts';
import type { HostContext } from '../src/provenance.ts';
import type { UnknownRecord } from '../src/types.ts';

type Resolver = Pick<HostContext, 'client_version'|'layers'|'environment'|'host_extensions'>;
type State = 'preserve'|'denied'|'cancelled'|'enqueued'|'unknown';
export interface DispatchResult { state: State; reason: string; }
export interface SnapshotTicket { ticket: string; epoch: string; resolver_revision: number; input_digest: string; expires_at: number; }
export interface DispatchReply extends SnapshotTicket { recommendation: unknown; }
interface Entry { snapshot: SnapshotTicket; event: UnknownRecord; context: HostContext; result?: DispatchResult; }
const object = (v: unknown): v is UnknownRecord => !!v && typeof v === 'object' && !Array.isArray(v);
const result = (state: State, reason: string): DispatchResult => ({state,reason});
const callKey = (e: UnknownRecord) => JSON.stringify([e.session_id,e.turn_id,e.tool_use_id??e.tool_call_id]);
const sameCall = (a:UnknownRecord,b:UnknownRecord) => callKey(a)===callKey(b)&&a.cwd===b.cwd&&a.tool_name===b.tool_name;
const binding = (e: UnknownRecord) => ['session_id','cwd','turn_id'].every(k=>typeof e[k]==='string'&&(e[k] as string).length>0&&(e[k] as string).length<=4096);

/**
 * Models an authenticated host's private resolver/dispatch boundary in memory.
 * Fixture setters are NOT evidence collection or authentication. A real host
 * must supply isolation, complete resolver coverage and atomic native enqueue.
 */
export class ReferenceDispatchHost {
  private epoch = randomUUID();
  private revision = 0;
  private resolver: Resolver;
  private entries = new Map<string, Entry>();
  private calls = new Map<string, string>();
  private locked = false;
  private lastTime = -Infinity;
  private readonly now: () => number;
  private readonly capacity: number;
  constructor(resolver: Resolver, {now=Date.now,capacity=128}: {now?:()=>number;capacity?:number}={}) {
    if(!Number.isSafeInteger(capacity)||capacity<1||capacity>4096)throw new Error('invalid_fixture_capacity');
    this.resolver=structuredClone(resolver);this.now=now;this.capacity=capacity;
  }
  private time() {
    const value=this.now();
    if(!Number.isSafeInteger(value)||value<this.lastTime)throw new Error('fixture_clock_invalid');
    this.lastTime=value;return value;
  }
  updateResolver(resolver: Resolver) {
    if(this.locked)throw new Error('fixture_dispatch_locked');
    if(!Number.isSafeInteger(this.revision+1))throw new Error('fixture_revision_exhausted');
    this.resolver=structuredClone(resolver);this.revision++;
  }
  restart() {
    if(this.locked)throw new Error('fixture_dispatch_locked');
    this.epoch=randomUUID();this.revision=0;
    // Simulated connection restart retains the host's dispatch ledger. A real
    // process restart requires durable reconciliation, not clearing dedup state.
    for(const entry of this.entries.values())if(!entry.result)entry.result=result('unknown','restart_unknown');
  }
  captureSpawnSnapshot(event: UnknownRecord, ttlMs=10000): SnapshotTicket {
    if(this.locked)throw new Error('fixture_dispatch_locked');
    if(!binding(event)||!Number.isSafeInteger(ttlMs)||ttlMs<1||ttlMs>60000)throw new Error('fixture_capture_invalid');
    const ev=structuredClone(event),digest=digestToolInput({client:'codex',event:ev}),now=this.time();
    if(!digest||!Number.isSafeInteger(now+ttlMs))throw new Error('fixture_capture_invalid');
    const key=callKey(ev),prior=this.calls.get(key);
    if(prior){const entry=this.entries.get(prior)!;if(entry.snapshot.input_digest!==digest||!sameCall(ev,entry.event))throw new Error('fixture_call_conflict');return structuredClone(entry.snapshot);}
    if(this.entries.size>=this.capacity)throw new Error('fixture_capacity_exhausted');
    const snapshot:SnapshotTicket={ticket:randomUUID(),epoch:this.epoch,resolver_revision:this.revision,input_digest:digest,expires_at:now+ttlMs};
    const context:HostContext={...structuredClone(this.resolver),schema_version:1,client:'codex',session_id:ev.session_id as string,cwd:ev.cwd as string,
      tool_use_id:(ev.tool_use_id??ev.tool_call_id) as string,tool_input_sha256:digest,issued_at:now,expires_at:now+ttlMs,evidence_verified:true};
    // evidence_verified is synthetic and stays inside this fixture model.
    this.entries.set(snapshot.ticket,{snapshot,event:ev,context});this.calls.set(key,snapshot.ticket);
    return structuredClone(snapshot);
  }
  getDispatchResult(ticket: string): DispatchResult | null {
    const value=this.entries.get(ticket)?.result;return value?{...value}:null;
  }
  cancelTicket(ticket: string): DispatchResult {
    const entry=this.entries.get(ticket);if(!entry)return result('preserve','ticket_unknown');
    if(this.locked&&!entry.result)return result('preserve','dispatch_busy');
    if(!entry.result)entry.result=result('cancelled','cancelled');
    return {...entry.result};
  }
  compareAndEnqueue(reply: DispatchReply, finalEvent: UnknownRecord, authorize: (input: UnknownRecord)=>'allow'|'deny'|'ask',
    enqueue: (input: UnknownRecord)=>'accepted'|'unknown'): DispatchResult {
    const entry=this.entries.get(reply?.ticket);
    if(!entry)return result('preserve','ticket_unknown');
    if(entry.result)return {...entry.result};
    const finish=(state:State,reason:string)=>{entry.result=result(state,reason);return {...entry.result};};
    // No await occurs between this point and the synchronous fixture queue.
    if(this.locked)return result('preserve','dispatch_busy');
    let now:number;
    try{now=this.time();}catch{return finish('preserve','clock_invalid');}
    const s=entry.snapshot;
    if(reply.epoch!==this.epoch||reply.epoch!==s.epoch)return finish('preserve','epoch_mismatch');
    if(reply.resolver_revision!==this.revision||reply.resolver_revision!==s.resolver_revision)return finish('preserve','revision_changed');
    if(reply.expires_at!==s.expires_at||now>=s.expires_at)return finish('preserve','expired');
    if(reply.input_digest!==s.input_digest||!object(finalEvent)||!binding(finalEvent)||!sameCall(finalEvent,entry.event)||
      digestToolInput({client:'codex',event:finalEvent})!==s.input_digest)return finish('preserve','call_changed');
    if(resolveProvenance({client:'codex',event:finalEvent,context:entry.context,now}).status!=='eligible')return finish('preserve','settings_preserved');
    const output=hookOutput({client:'codex',event:finalEvent,recommendation:reply.recommendation,mode:'apply',compatibilityVerified:true});
    const input=output.hookSpecificOutput?.updatedInput;
    if(!input)return finish('preserve','recommendation_invalid');
    this.locked=true;
    let security:unknown;
    try{security=authorize(structuredClone(input));}
    catch{this.locked=false;return finish('preserve','security_unknown');}
    if(security!=='allow'){this.locked=false;return finish(security==='deny'?'denied':'preserve','security_not_allowed');}
    // A synchronous authorization can still consume wall time. Recheck expiry
    // at the enqueue boundary rather than relying on the pre-authorization read.
    try{if(this.time()>=s.expires_at){this.locked=false;return finish('preserve','expired');}}
    catch{this.locked=false;return finish('preserve','clock_invalid');}
    // Write the terminal uncertainty BEFORE entering the queue: a throw/reentry
    // after possible acceptance must never create another enqueue attempt.
    entry.result=result('unknown','enqueue_unknown');
    try {
      if(enqueue(structuredClone(input))==='accepted')entry.result=result('enqueued','enqueued');
    }catch{/* Never expose the queue's raw error or retry an uncertain dispatch. */}
    finally{this.locked=false;}
    return {...entry.result};
  }
}
