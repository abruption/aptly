import { homedir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';
import { CODEX_HOME_POLICY_SOURCE, resolvePolicySource } from './policy-source.ts';

/** Shared CLI selection; never claims the home of a running host. */
export function resolveHostPaths(options: {home?:string;env?:NodeJS.ProcessEnv}, client: 'codex'|'claude') {
  const home = resolve(options.home ?? homedir()), env = options.env ?? process.env;
  const override = client === 'codex' ? env.CODEX_HOME : env.CLAUDE_CONFIG_DIR;
  if (override && !isAbsolute(override)) throw new Error('relative_configuration_directory');
  if(client==='codex'&&override!==undefined)resolvePolicySource(CODEX_HOME_POLICY_SOURCE,env);
  const dir = override || join(home, client === 'codex' ? '.codex' : '.claude');
  const mcpPath = client === 'codex' ? join(dir, 'config.toml') : override ? join(dir, '.claude.json') : join(home, '.claude.json');
  return { dir, mcpPath, hooksPath: join(dir, client === 'codex' ? 'hooks.json' : 'settings.json'), privateDir: join(dir, 'aptly') };
}
