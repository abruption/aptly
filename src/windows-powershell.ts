import { win32 } from 'node:path';

/** Use the operator's Windows system directory, never cwd or PATH lookup. */
export function windowsPowerShellPath(env: NodeJS.ProcessEnv = process.env): string {
  const root = env.SystemRoot ?? 'C:\\Windows';
  // Reject drive-relative, UNC/device, traversal and control-character roots.
  if (!/^[A-Za-z]:[\\/]/.test(root) || /[\x00-\x1f\x7f]/.test(root) ||
      root.slice(2).includes(':') || root.split(/[\\/]/).some(part => part === '.' || part === '..')) {
    throw new Error('windows_system_directory_invalid');
  }
  return win32.join(root, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
}
