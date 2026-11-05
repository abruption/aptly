// Explicit, no-model-call developer probe; not an evidence writer or product API.
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createTestTemp } from './temp.ts';
import { CodexProbeRpc } from './codex-probe-rpc.ts';

const record = (value: unknown): value is Record<string, any> => !!value && typeof value === 'object' && !Array.isArray(value);
const originTypes = ['packagedDefaults','mdm','system','enterpriseManaged','user','project','sessionFlags','legacyManagedConfigTomlFromFile','legacyManagedConfigTomlFromMdm'];
const origin = (value: unknown): string => record(value) && record(value.name) && originTypes.includes(value.name.type) ? value.name.type : 'unknown';
const versioned = (value: unknown): boolean => record(value) && typeof value.version === 'string' && value.version.length > 0;

/** Internal comparison only: never serialize the raw RPC result or fingerprint. */
export function observeConfig(value: unknown) {
  const config = record(value) && record(value.config) ? value.config : {};
  const origins = record(value) && record(value.origins) ? value.origins : {};
  const modelOrigin = origin(origins.model), effortOrigin = origin(origins.model_reasoning_effort);
  const complete = typeof config.model === 'string' && typeof config.model_reasoning_effort === 'string' &&
    modelOrigin !== 'unknown' && effortOrigin !== 'unknown' && versioned(origins.model) && versioned(origins.model_reasoning_effort);
  const versions = complete ? { model: origins.model.version as string, effort: origins.model_reasoning_effort.version as string } : null;
  const fingerprint = complete ? createHash('sha256').update(JSON.stringify({
    model: config.model, effort: config.model_reasoning_effort,
    model_origin: origins.model, effort_origin: origins.model_reasoning_effort,
  })).digest('hex') : null;
  return { fingerprint, modelOrigin, effortOrigin, complete, versions };
}

export function summarizeConfigProbe(baseline: unknown, repeat: unknown, changed: unknown, overridden: unknown) {
  const first = observeConfig(baseline), same = observeConfig(repeat), next = observeConfig(changed), override = observeConfig(overridden);
  const matches = (value: unknown, model: string, effort: string) => record(value) && record(value.config) && value.config.model === model && value.config.model_reasoning_effort === effort;
  return {
    schema_version: 1, application: 'shadow', evidence_verified: false,
    isolated_config: {
      baseline_matches_fixture: matches(baseline, 'aptly-fixture-a', 'low'),
      repeat_stable: first.complete && same.complete && first.fingerprint === same.fingerprint,
      file_change_observed: first.complete && next.complete && first.fingerprint !== next.fingerprint && matches(changed, 'aptly-fixture-b', 'high'),
      file_origin_versions_changed: !!first.versions && !!next.versions && first.versions.model !== next.versions.model && first.versions.effort !== next.versions.effort,
      baseline_model_origin: first.modelOrigin, baseline_effort_origin: first.effortOrigin,
      cli_override_observed: override.complete && matches(overridden, 'aptly-fixture-override', 'medium'),
      override_model_origin: override.modelOrigin, override_effort_origin: override.effortOrigin,
    },
    native_session: { all_effective_sources_verified: false, complete_change_feed_verified: false, atomic_spawn_recheck_verified: false },
    limitations: ['separate_app_server_not_current_session', 'config_read_has_no_thread_or_call_binding', 'layer_version_not_resolver_revision', 'native_change_and_dispatch_not_exercised'],
    model_turns_started: 0, native_agents_spawned: 0,
  };
}

export async function runCodexHostProbe({ command = 'codex' } = {}) {
  const version = spawnSync(command, ['--version'], { encoding: 'utf8', timeout: 5000, maxBuffer: 4096 });
  const match = version.status === 0 && /^codex-cli (\d+\.\d+\.\d+)\s*$/.exec(version.stdout);
  if (!match) throw new Error('probe_version_unavailable');
  let cleanup = () => {};
  const root = createTestTemp({ after(fn) { cleanup = fn; } }, 'codex-host-probe-');
  const clients: CodexProbeRpc[] = [];
  try {
    const home = join(root, 'codex-home'), cwd = join(root, 'workspace');
    mkdirSync(home, { mode: 0o700 }); mkdirSync(cwd, { mode: 0o700 });
    const config = join(home, 'config.toml');
    const write = (model: string, effort: string) => writeFileSync(config, `model = "${model}"\nmodel_reasoning_effort = "${effort}"\n`, { mode: 0o600 });
    write('aptly-fixture-a', 'low');
    const connect = async (overrides: string[] = []) => {
      // CODEX_HOME is used for its documented isolation purpose; inherit no keys,
      // real Codex config, MCP registrations, auth environment, or session IDs.
      const client = new CodexProbeRpc(command, ['app-server', '--listen', 'stdio://', ...overrides], { cwd, env: { PATH: process.env.PATH, CODEX_HOME: home } });
      clients.push(client);
      await client.request('initialize', { clientInfo: { name: 'aptly-host-probe', version: '0.1.0' }, capabilities: { experimentalApi: true } });
      client.initialized(); return client;
    };
    const client = await connect();
    const read = () => client.request('config/read', { cwd, includeLayers: true });
    const baseline = await read(), repeat = await read();
    write('aptly-fixture-b', 'high');
    const changed = await read();
    const overridden = await connect(['-c', 'model="aptly-fixture-override"', '-c', 'model_reasoning_effort="medium"']);
    const override = await overridden.request('config/read', { cwd, includeLayers: true });
    const summary = summarizeConfigProbe(baseline, repeat, changed, override);
    const checks = summary.isolated_config;
    const passed = checks.baseline_matches_fixture && checks.repeat_stable && checks.file_change_observed && checks.file_origin_versions_changed && checks.cli_override_observed;
    return { ...summary, probe_completed: true, config_probe_passed: passed, client_version: match[1],
      version_matches_reviewed_contract: match[1] === '0.166.0', methods_sent: clients.map(c => [...c.sentMethods]),
      native_session_started: false, credentials_supplied: false, integration_ready: false };
  } finally {
    await Promise.all(clients.map(client => client.close()));
    cleanup();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 2) throw new Error('probe_invalid_arguments');
    const result = await runCodexHostProbe();
    console.log(JSON.stringify(result, null, 2));
    if (!result.config_probe_passed || !result.version_matches_reviewed_contract) process.exitCode = 1;
  } catch (error) {
    const codes = ['probe_version_unavailable','probe_invalid_arguments','probe_method_forbidden','probe_process_closed','probe_process_error','probe_output_limit','probe_protocol_error','probe_rpc_error','probe_timeout'];
    const code = error instanceof Error && codes.includes(error.message) ? error.message : 'probe_failed';
    console.log(JSON.stringify({ probe_completed: false, application: 'shadow', evidence_verified: false, code }));
    process.exitCode = 1;
  }
}
