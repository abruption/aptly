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
export function parseBudgetValue(key:string, value:string):number {
  if (!Object.hasOwn(fields,key) || typeof value!=='string' || !/^(?:0|[1-9]\d*)(?:\.\d{1,6})?$/.test(value)) throw new Error('invalid_budget_configuration');
  const number=Number(value);
  const calls=key==='APTLY_MAX_DAILY_CALLS'||key==='APTLY_MAX_TOTAL_CALLS';
  const maximum=key==='APTLY_MAX_DAILY_CALLS'?100000:key==='APTLY_MAX_TOTAL_CALLS'?1000000:100;
  if (!Number.isFinite(number)||number>maximum||(calls&&(!/^\d+$/.test(value)||!Number.isSafeInteger(number)))||(key==='APTLY_ESTIMATED_CALL_USD'&&number===0)) throw new Error('invalid_budget_configuration');
  return number;
}
export function resolveBudgetSettings(env:NodeJS.ProcessEnv|Record<string,unknown>):BudgetSettings {
  if(Object.keys(env).some(key=>/^(?:APTLY_MAX_|APTLY_ESTIMATED_)/.test(key)&&!Object.hasOwn(fields,key))) throw new Error('invalid_budget_configuration');
  const limits={} as BudgetLimits, provenance={} as BudgetSettings['provenance'];
  for (const key of budgetEnvironmentKeys as (keyof typeof fields)[]) {
    const value=env[key], field=fields[key];
    limits[field]=parseBudgetValue(key,value===undefined?budgetEnvironmentDefaults[key]:value as string);
    provenance[field]=value===undefined?'default':'environment';
  }
  if (limits.max_estimated_usd>0&&limits.estimated_call_usd>limits.max_estimated_usd) throw new Error('invalid_budget_configuration');
  return {limits,provenance};
}
export const defaultBudgetLimits: Readonly<BudgetLimits> = Object.freeze(resolveBudgetSettings({}).limits);
