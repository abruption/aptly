import { spawnSync } from 'node:child_process';
import { accessSync, constants, statSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';

export interface LinuxReadinessOptions {
  platform?: NodeJS.Platform;
  env?: NodeJS.ProcessEnv;
  execute?: typeof spawnSync;
}
export interface StoreReadiness { status: 'unavailable' | 'unverified'; code: string }

// Locate programs without running them. Empty PATH entries have shell cwd semantics.
function executable(name: string, path: string | undefined, absoluteOnly = false): string | undefined {
  for (const dir of (path ?? '/usr/bin:/bin').split(':')) {
    if (absoluteOnly && !isAbsolute(dir)) continue;
    const candidate = resolve(dir || '.', name);
    try { if (statSync(candidate).isFile()) { accessSync(candidate, constants.X_OK); return candidate; } } catch { /* try next PATH entry */ }
  }
}

/** Passive metadata only: never query, activate, unlock, or write the Secret Service. */
export function linuxStoreReadiness(options: LinuxReadinessOptions = {}): StoreReadiness | undefined {
  if ((options.platform ?? process.platform) !== 'linux') return undefined;
  const env = options.env ?? process.env;
  if (!executable('secret-tool', env.PATH)) return {status:'unavailable',code:'secure_store_secret_tool_missing'};
  const address=env.DBUS_SESSION_BUS_ADDRESS;
  if (!address || !/^unix:(?:path|abstract)=[^,;\s]+(?:,guid=[a-fA-F0-9]{32})?$/.test(address)) return {status:'unverified',code:'secure_store_bus_unverified'};
  if (address.startsWith('unix:path=') && !isAbsolute(address.slice('unix:path='.length).split(',')[0])) return {status:'unverified',code:'secure_store_bus_unverified'};
  const socket=address.match(/^unix:path=([^,%]+)(?:,guid=[a-fA-F0-9]{32})?$/)?.[1];
  if (socket && isAbsolute(socket)) {
    try { statSync(socket); } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {status:'unavailable',code:'secure_store_bus_missing'};
    }
  }
  const gdbus=executable('gdbus',env.PATH,true);
  if (!gdbus) return {status:'unverified',code:'secure_store_probe_unavailable'};
  const call=(method:string, extra:string[]=[]) => {
    try {
      const result=(options.execute ?? spawnSync)(gdbus,['call','--address',address,'--dest','org.freedesktop.DBus','--object-path','/org/freedesktop/DBus','--method',`org.freedesktop.DBus.${method}`,...extra],{env:{PATH:env.PATH ?? '/usr/bin:/bin',LC_ALL:'C'},encoding:'utf8',timeout:2000,maxBuffer:65536});
      return !result.error && result.status===0 && typeof result.stdout==='string' ? result.stdout.trim() : undefined;
    } catch { return undefined; }
  };
  const owner=call('NameHasOwner',['org.freedesktop.secrets']);
  if (owner==='(true,)') return {status:'unverified',code:'secure_store_service_present_unverified'};
  if (owner!=='(false,)') return {status:'unverified',code:'secure_store_bus_unverified'};
  const names=call('ListActivatableNames');
  // gdbus prints a GVariant string array. Accept only its narrow standard shape.
  if (names === '(@as [],)') return {status:'unavailable',code:'secure_store_service_missing'};
  if (names === undefined || !/^\(\[(?:\s*'[^'\\]*'\s*(?:,\s*'[^'\\]*'\s*)*)?\],\)$/.test(names)) return {status:'unverified',code:'secure_store_bus_unverified'};
  if (names.includes("'org.freedesktop.secrets'")) return {status:'unverified',code:'secure_store_service_activatable_unverified'};
  return {status:'unavailable',code:'secure_store_service_missing'};
}
