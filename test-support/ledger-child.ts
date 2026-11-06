import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {Router,defaultPolicy} from '../src/core.ts';

export const ledgerPolicy = () => ({...defaultPolicy,timeout_ms:60000});
export const ledgerRequest = (id:string) => ({
 request_id:id,client:'codex' as const,
 task:{summary:'Review the supplied synthetic ledger fixture for a missing guard.',operation:'read_only' as const,context_sufficient:true},
 eligible_profile_ids:['codex-routine','codex-deep'],
 constraints:{provenance_verified:true,model_pinned:false,effort_pinned:false,role_pinned:false,fork_inherits:false}
});

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const [ledgerPath,id,mode='wait']=process.argv.slice(2);
 const provider=async()=>{
  process.send?.({type:'provider_enter',id});
  if(mode==='wait')await new Promise<void>(resolve=>{
   const release=(message:unknown)=>{
    if(message&&typeof message==='object'&&(message as {type?:string}).type==='release'){
     process.off('message',release);resolve();
    }
   };
   process.on('message',release);
  });
  return {choice:'codex-routine',confidence:1};
 };
 try{
  const result=await new Router({ledgerPath,policy:ledgerPolicy(),provider}).recommend(ledgerRequest(id));
  process.send?.({type:'result',id,result},()=>process.disconnect?.());
 }catch{
  process.send?.({type:'fixture_failed'},()=>process.disconnect?.());process.exitCode=1;
 }
}
