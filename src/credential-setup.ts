import { loadSecret, storeSecret, deleteSecret } from './secret-store.ts';
import { setCredentialReference } from './setup.ts';
import type { SetupOptions, SetupResult, SetupClientResult } from './setup.ts';

export interface CredentialBackend {
  loadSecret(options: { account: string }): string | null;
  storeSecret(value: string, options: { account: string }): void;
  deleteSecret(options: { account: string }): void;
}
/** Key bytes enter the OS store only; host files receive nonsecret references. */
export function setApiKey(value: string, options: SetupOptions = {}, backend: CredentialBackend = { loadSecret, storeSecret, deleteSecret }): SetupResult {
  const clients:SetupClientResult['client'][] = [...new Set(options.clients ?? (['codex','claude'] as const))];
  if(clients.some(c=>c!=='codex'&&c!=='claude'))return {status:'partial',clients:[]};
  if (!/^sk-[A-Za-z0-9_-]{12,}$/.test(value) || Buffer.byteLength(value) > 8192) return { status:'partial',clients:clients.map(client=>({client,status:'error',codes:['credential_value_invalid']})) };
  const results: SetupClientResult[]=[];
  for (const client of clients) {
    const account = `${client}:OPENAI_API_KEY`;
    let previous:string|null=null, saved=false;
    try {
      previous=backend.loadSecret({account});
      backend.storeSecret(value,{account});saved=true;
      const configured=setCredentialReference({...options,clients:[client]});
      const result=configured.clients[0];
      if (!result || result.status==='error'||result.status==='skipped') {
        if(previous===null)backend.deleteSecret({account});else backend.storeSecret(previous,{account});
        saved=false;results.push(result??{client,status:'error',codes:['credential_configuration_failed']});
      } else results.push({...result,codes:[...result.codes,'credential_stored_in_os','mcp_restart_required']});
    } catch(error) {
      let rollbackFailed=false;
      if(saved){try{if(previous===null)backend.deleteSecret({account});else backend.storeSecret(previous,{account});}catch{rollbackFailed=true;}}
      const allowed=['secure_store_invalid_options','secure_store_invalid_value','secure_store_unavailable','secure_store_timeout','secure_store_failed','secure_store_cancelled','secure_store_denied','secure_store_locked','secure_store_unsupported_platform'];
      const code=error instanceof Error&&allowed.includes(error.message)?error.message:'credential_store_failed';
      results.push({client,status:'error',codes:[rollbackFailed?'credential_rollback_failed':code]});
    } finally { previous=null; }
  }
  return {status:results.some(r=>r.status==='error')?'partial':'complete',clients:results};
}
