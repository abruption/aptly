import { Router, defaultPolicy } from './core.ts';
import { decisionsProvider, fixtureProvider } from './provider.ts';
import { loadConfiguration } from './config.ts';
import { resolveCatalog } from './catalog.ts';
import { loadModelInfo } from './model-info.ts';
import { assertPrivateStatePath } from './files.ts';
export function runtime(env: NodeJS.ProcessEnv=process.env) {
  const value=env.ROUTER_PROVIDER ?? 'fixture';
  if(value!=='fixture'&&value!=='decisions') throw new Error('invalid_provider_mode');
  const mode: 'fixture'|'decisions'=value;
  if(mode==='decisions'){if(!env.ROUTER_LEDGER_PATH)throw new Error('paid_mode_requires_ledger');assertPrivateStatePath(env.ROUTER_LEDGER_PATH);}
  const modelInfo=loadModelInfo(env.APTLY_MODEL_INFO_PATH);
  const catalog=resolveCatalog(env,modelInfo.facts);
  const policy={...defaultPolicy,provider_id:mode,profiles:catalog.profiles,profile_descriptions:catalog.descriptions,catalog_version:catalog.version};
  const router=new Router({policy,provider:mode==='fixture'?fixtureProvider:decisionsProvider({key:env.OPENAI_API_KEY,descriptions:catalog.descriptions}),ledgerPath:env.ROUTER_LEDGER_PATH});
  return {router,mode,modelInfo,disabledClients:catalog.disabled_clients,configuration:loadConfiguration(env)};
}
