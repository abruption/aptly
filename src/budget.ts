/** Local reservation estimates only; none of these limits is a provider billing cap. */
export const budgetEnvironmentDefaults: Readonly<Record<string, string>> = Object.freeze({
  APTLY_MAX_DAILY_CALLS: '200',
  APTLY_MAX_TOTAL_CALLS: '0',
  APTLY_MAX_ESTIMATED_USD: '0',
  APTLY_ESTIMATED_CALL_USD: '0.002',
});
export const budgetEnvironmentKeys: readonly string[] = Object.freeze(Object.keys(budgetEnvironmentDefaults));
const fields = {
  APTLY_MAX_DAILY_CALLS: 'max_daily_calls', APTLY_MAX_TOTAL_CALLS: 'max_total_calls',
  APTLY_MAX_ESTIMATED_USD: 'max_estimated_usd', APTLY_ESTIMATED_CALL_USD: 'estimated_call_usd',
} as const;
export interface BudgetLimits { max_daily_calls:number; max_total_calls:number; max_estimated_usd:number; estimated_call_usd:number; }
export interface BudgetSettings { limits:BudgetLimits; provenance:Record<keyof BudgetLimits, 'environment'|'default'>; }
export type BudgetErrorReason = 'invalid_value'|'rate_exceeds_ceiling'|'unknown_budget_key';
export interface BudgetErrorDetails { invalid_budget_keys?:string[]; budget_error?:BudgetErrorReason; }
/** Return only static reasons and recognized field names, never input names or values. */
export function budgetErrorDetails(error:unknown):BudgetErrorDetails {
  if(error===null||typeof error!=='object')return {};
  const descriptors=Object.getOwnPropertyDescriptors(error);
  const reason=descriptors.budget_error?.value;
  if(!['invalid_value','rate_exceeds_ceiling','unknown_budget_key'].includes(reason))return {};
  const inputKeys=descriptors.invalid_budget_keys?.value;
  const keys=Array.isArray(inputKeys)?budgetEnvironmentKeys.filter(key=>inputKeys.includes(key)):[];
  return {...(keys.length?{invalid_budget_keys:keys}:{}),budget_error:reason};
}
function invalidBudget(reason:BudgetErrorReason,keys:readonly string[]=[]):never {
  const details:BudgetErrorDetails={...(keys.length?{invalid_budget_keys:budgetEnvironmentKeys.filter(key=>keys.includes(key))}:{}),budget_error:reason};
  throw Object.assign(new Error('invalid_budget_configuration'),details);
}
export function parseBudgetValue(key:string, value:string):number {
  if(!Object.hasOwn(fields,key))invalidBudget('unknown_budget_key');
  if(typeof value!=='string'||!/^(?:0|[1-9]\d*)(?:\.\d{1,6})?$/.test(value))invalidBudget('invalid_value',[key]);
  const number=Number(value);
  const calls=key==='APTLY_MAX_DAILY_CALLS'||key==='APTLY_MAX_TOTAL_CALLS';
  const maximum=key==='APTLY_MAX_DAILY_CALLS'?100000:key==='APTLY_MAX_TOTAL_CALLS'?1000000:100;
  if (!Number.isFinite(number)||number>maximum||(calls&&(!/^\d+$/.test(value)||!Number.isSafeInteger(number)))||(key==='APTLY_ESTIMATED_CALL_USD'&&number===0)||(number===0&&value!=='0')) invalidBudget('invalid_value',[key]);
  return number;
}
export function resolveBudgetSettings(env:NodeJS.ProcessEnv|Record<string,unknown>):BudgetSettings {
  if(Object.keys(env).some(key=>/^(?:APTLY_MAX_|APTLY_ESTIMATED_)/.test(key)&&!Object.hasOwn(fields,key))) invalidBudget('unknown_budget_key');
  const limits={} as BudgetLimits, provenance={} as BudgetSettings['provenance'];
  for (const key of budgetEnvironmentKeys as (keyof typeof fields)[]) {
    const value=env[key], field=fields[key];
    limits[field]=parseBudgetValue(key,value===undefined?budgetEnvironmentDefaults[key]:value as string);
    provenance[field]=value===undefined?'default':'environment';
  }
  if (limits.max_estimated_usd>0&&limits.estimated_call_usd>limits.max_estimated_usd) invalidBudget('rate_exceeds_ceiling',['APTLY_MAX_ESTIMATED_USD','APTLY_ESTIMATED_CALL_USD']);
  return {limits,provenance};
}
export const defaultBudgetLimits: Readonly<BudgetLimits> = Object.freeze(resolveBudgetSettings({}).limits);
