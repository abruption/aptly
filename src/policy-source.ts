import { isAbsolute, join } from 'node:path';

export const CODEX_HOME_POLICY_SOURCE='@codex-home';

/** Resolve only the explicit Codex selector; existing fixed paths remain unchanged. */
export function resolvePolicySource(value:string|undefined,env:NodeJS.ProcessEnv,_home?:string):string|undefined {
 if(value!==CODEX_HOME_POLICY_SOURCE)return value;
 const codexHome=env.CODEX_HOME;
 if(codexHome===undefined||!codexHome.trim()||!isAbsolute(codexHome)||/[\x00-\x1f\x7f-\x9f]/.test(codexHome))throw new Error('policy_source_home_invalid');
 return join(codexHome,'aptly','auto-policy.json');
}
