export type Client = 'codex' | 'claude';
export type UnknownRecord = Record<string, unknown>;
export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
export interface Profile { id: string; client: Client; model: string; reasoning_effort?: string; }
export interface RoutingConstraints { model_pinned?: boolean; effort_pinned?: boolean; role_pinned?: boolean; fork_inherits?: boolean; provenance_verified?: boolean; }
export interface RoutingTask { summary: string; operation: 'read_only' | 'write' | 'review' | 'analysis'; context_sufficient: boolean; }
export interface RoutingInput { request_id: string; client: Client; task: RoutingTask; eligible_profile_ids: string[]; constraints: RoutingConstraints; }
export interface Usage { input_tokens: number; output_tokens: number; total_tokens: number; }
export type RoutingStatus = 'recommended' | 'keep_current' | 'needs_context' | 'unavailable';
export type BudgetLimit = 'max_daily_calls' | 'max_total_calls' | 'max_estimated_usd';
export interface RoutingResult { budget_limit?: BudgetLimit; status: RoutingStatus; reason: string; application: 'advisory_only'; policy_version: string; catalog_version: string; profile_id?: string; profile?: Profile; usage?: Usage; latency_ms?: number; confidence?: number; cached?: boolean; }
export interface RoutingPolicy { version: string; catalog_version: string; max_summary_bytes: number; max_concurrency: number; max_daily_calls: number; max_total_calls: number; estimated_call_usd: number; max_estimated_usd: number; timeout_ms: number; profiles: readonly Profile[]; provider_id?: string; profile_descriptions?: Record<string,string>; }
export interface ProviderArguments { input: RoutingInput; profiles: Profile[]; signal: AbortSignal; }
export interface ProviderAnswer { choice: string; confidence?: number; usage?: unknown; }
export type RoutingProvider = ((args: ProviderArguments) => Promise<ProviderAnswer>) & {
  /** Synchronous local readiness check only; must not initiate transport. */
  preflight?: () => void;
};
export function isRecord(value: unknown): value is UnknownRecord { return value !== null && typeof value === 'object' && !Array.isArray(value); }
export function errorCode(error: unknown): string | undefined { return isRecord(error) && typeof error.code === 'string' ? error.code : undefined; }
