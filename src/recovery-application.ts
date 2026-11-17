import { z } from 'zod';
import type { Client } from './types.ts';

const field=z.enum(['model','reasoning_effort']);
const effort=z.enum(['minimal','low','medium','high','xhigh','max']);
const defaults=z.strictObject({model:z.string().min(1).max(256).optional(),reasoning_effort:effort.optional()});
const review=z.strictObject({status:z.literal('caller_review_required'),reason:z.enum(['native_execution_not_observed','explicit_profile_arguments_required']),
 required_fields:z.array(field).min(1).max(2).optional(),on_unavailable:z.literal('stop_and_report').optional(),
 next_action:z.enum(['apply_returned_defaults','submit_prepared_call']).optional()});
const blocked=z.strictObject({status:z.literal('blocked'),reason:z.enum(['inherited_context_application_unverified','history_semantics_unverified','effort_argument_unsupported'])});
const retryCall=z.strictObject({tool:z.enum(['spawn_agent','Agent']),set_if_unspecified:defaults,preserve:z.literal('all_other_arguments_and_history')});
const freshCall=z.strictObject({tool:z.literal('spawn_agent'),arguments:z.strictObject({task_name:z.string().min(1).max(128),message:z.string().min(1).max(12000),fork_turns:z.literal('none'),model:z.string().min(1).max(256),reasoning_effort:effort})});

/** Output coherence only: not host authorization, dispatch or profile availability. */
export const recoveryApplicationSchema=z.strictObject({
 client:z.enum(['codex','claude']),status:z.enum(['recommended','prepared','keep_current','needs_context','unavailable']),application:z.literal('advisory_only'),
 execution:z.literal('not_observed').optional(),
 profile:z.strictObject({id:z.string(),client:z.enum(['codex','claude']),model:z.string(),reasoning_effort:effort.optional()}).optional(),
 spawn_application:z.union([review,blocked]),next_call:z.union([retryCall,freshCall]).optional(),
 protected_fields:z.array(field),
}).superRefine((value,ctx)=>{
 const issue=()=>ctx.addIssue({code:'custom',message:'invalid_recovery_application'});
 const app=value.spawn_application,call=value.next_call;
 if(app.status==='blocked'){if(call||value.status==='prepared')issue();return;}
 if(!['recommended','prepared'].includes(value.status)){
  if(call||app.reason!=='native_execution_not_observed'||app.required_fields||app.on_unavailable||app.next_action)issue();return;
 }
 if(!call||!value.profile||value.profile.client!==value.client){issue();return;}
 const fresh='arguments'in call;
 if(fresh!==(value.status==='prepared')||call.tool!==(value.client==='codex'?'spawn_agent':'Agent'))issue();
 if(app.reason!==(fresh?'explicit_profile_arguments_required':'native_execution_not_observed')||app.next_action!==(fresh?'submit_prepared_call':'apply_returned_defaults')||app.on_unavailable!=='stop_and_report')issue();
 const args=fresh?call.arguments:call.set_if_unspecified;
 const keys=['model','reasoning_effort'].filter(key=>Object.hasOwn(args,key));
 const required=app.required_fields??[];
 if(!keys.length||new Set(required).size!==required.length||keys.length!==required.length||keys.some(key=>!required.includes(key as z.infer<typeof field>)))issue();
 if(value.client==='claude'&&Object.hasOwn(args,'reasoning_effort'))issue();
 for(const key of keys){
  if(args[key as keyof typeof args]===undefined||args[key as keyof typeof args]!==value.profile[key as 'model'|'reasoning_effort'])issue();
  if(!fresh&&value.protected_fields.includes(key as z.infer<typeof field>))issue();
 }
 if(fresh&&value.execution!=='not_observed')issue();
});

export function validRecoveryApplication(result:Record<string,unknown>,client:Client,protectedFields:('model'|'reasoning_effort')[]=[]):boolean {
 return recoveryApplicationSchema.safeParse({client,status:result.status,application:result.application,execution:result.execution,profile:result.profile,
  spawn_application:result.spawn_application,next_call:result.next_call,protected_fields:protectedFields}).success;
}
