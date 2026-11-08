import { resolveBudgetSettings } from './budget.ts';
import { Router, defaultPolicy } from './core.ts';
import { decisionsProvider, fixtureProvider } from './provider.ts';
import { loadConfiguration } from './config.ts';
import { resolveCatalog } from './catalog.ts';
import { loadModelInfo } from './model-info.ts';
import { assertPrivateStatePath } from './files.ts';
import { loadSecret } from './secret-store.ts';
export function runtime(env: NodeJS.ProcessEnv=process.env, options:{secretLoader?:typeof loadSecret}={}) {
  const budget=resolveBudgetSettings(env);
  const value=env.ROUTER_PROVIDER ?? 'fixture';
  if(value!=='fixture'&&value!=='decisions') throw new Error('invalid_provider_mode');
  const mode: 'fixture'|'decisions'=value;
  if(mode==='decisions'){if(!env.ROUTER_LEDGER_PATH)throw new Error('paid_mode_requires_ledger');assertPrivateStatePath(env.ROUTER_LEDGER_PATH);}
  const modelInfo=loadModelInfo(env.APTLY_MODEL_INFO_PATH);
  const catalog=resolveCatalog(env,modelInfo.facts);
  const policy={...defaultPolicy,...budget.limits,provider_id:mode,profiles:catalog.profiles,profile_descriptions:catalog.descriptions,catalog_version:catalog.version};
  let key=env.OPENAI_API_KEY,credentialStatus=mode==='fixture'?'unused_in_fixture':key?'environment':'not_configured';
  if(mode==='decisions'&&env.APTLY_SECRET_BACKEND!==undefined){
    key=undefined;
    if(env.APTLY_SECRET_BACKEND!=='os'||!['codex','claude'].includes(env.APTLY_SECRET_CLIENT??''))credentialStatus='invalid_os_reference';
    else try{key=(options.secretLoader??loadSecret)({account:`${env.APTLY_SECRET_CLIENT}:OPENAI_API_KEY`})??undefined;credentialStatus=key?'os_store':'os_store_empty';}catch{credentialStatus='os_store_unavailable';}
  }
  const router=new Router({policy,budgetConfigurable:true,provider:mode==='fixture'?fixtureProvider:decisionsProvider({key,descriptions:catalog.descriptions}),ledgerPath:env.ROUTER_LEDGER_PATH});
  key=undefined;
  return {router,budget,mode,modelInfo,credentialStatus,disabledClients:catalog.disabled_clients,configuration:loadConfiguration(env)};
}
