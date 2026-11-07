import { execFileSync } from 'node:child_process';
import { windowsPowerShellPath } from './windows-powershell.ts';

// Static code only: paths are JSON on stdin, never PowerShell source/arguments.
// Windows PowerShell's .NET Framework ACL APIs keep inherited ACEs visible.
const script = String.raw`
$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = [Text.UTF8Encoding]::new($false)
try {
 $request = [Console]::In.ReadToEnd() | ConvertFrom-Json
 $path = [string]$request.path
 if ([string]::IsNullOrWhiteSpace($path) -or ![IO.Path]::IsPathRooted($path)) { throw 'invalid' }
 $attributes = [IO.File]::GetAttributes($path)
 if (($attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'invalid' }
 $isDirectory = ($attributes -band [IO.FileAttributes]::Directory) -ne 0
 $sidType = [Security.Principal.SecurityIdentifier]
 $current = [Security.Principal.WindowsIdentity]::GetCurrent().User
 $allowed = @($current.Value, 'S-1-5-18', 'S-1-5-32-544')
 if ($request.action -eq 'protect-new-directory') {
  if (!$isDirectory) { throw 'invalid' }
  $acl = [Security.AccessControl.DirectorySecurity]::new()
  $acl.SetOwner($current)
  $acl.SetAccessRuleProtection($true, $false)
  foreach ($sid in $allowed) {
   $identity = [Security.Principal.SecurityIdentifier]::new($sid)
   $rule = [Security.AccessControl.FileSystemAccessRule]::new($identity, [Security.AccessControl.FileSystemRights]::FullControl, ([Security.AccessControl.InheritanceFlags]::ContainerInherit -bor [Security.AccessControl.InheritanceFlags]::ObjectInherit), [Security.AccessControl.PropagationFlags]::None, [Security.AccessControl.AccessControlType]::Allow)
   $acl.AddAccessRule($rule)
  }
  [IO.Directory]::SetAccessControl($path, $acl)
 } elseif ($request.action -ne 'assert-private') { throw 'invalid' }
 $acl = if ($isDirectory) { [IO.Directory]::GetAccessControl($path) } else { [IO.File]::GetAccessControl($path) }
 if ($allowed -notcontains $acl.GetOwner($sidType).Value) { throw 'invalid' }
 $descriptor = [Security.AccessControl.RawSecurityDescriptor]::new($acl.GetSecurityDescriptorBinaryForm(), 0)
 if ($null -eq $descriptor.DiscretionaryAcl) { throw 'invalid' }
 foreach ($rule in $acl.GetAccessRules($true, $true, $sidType)) {
  if ($rule.AccessControlType -eq [Security.AccessControl.AccessControlType]::Allow -and $allowed -notcontains $rule.IdentityReference.Value) { throw 'invalid' }
 }
 [Console]::Out.Write('private')
} catch { [Console]::Out.Write('rejected'); exit 1 }
`;
type Runner = (executable: string, args: readonly string[], input: string) => string;
interface WindowsPrivateOptions { execute?: Runner }
const run: Runner = (executable,args,input) => execFileSync(executable,[...args],{
 input, encoding:'utf8', windowsHide:true, timeout:30000, maxBuffer:4096, stdio:['pipe','pipe','pipe']
});
const copyScript = String.raw`
$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = [Text.UTF8Encoding]::new($false)
try {
 $request = [Console]::In.ReadToEnd() | ConvertFrom-Json
 $source = [string]$request.source
 $target = [string]$request.target
 if (![IO.Path]::IsPathRooted($source) -or ![IO.Path]::IsPathRooted($target)) { throw 'invalid' }
 $source = [IO.Path]::GetFullPath($source)
 $target = [IO.Path]::GetFullPath($target)
 if ([string]::Equals($source, $target, [StringComparison]::OrdinalIgnoreCase) -or ![string]::Equals([IO.Path]::GetDirectoryName($source), [IO.Path]::GetDirectoryName($target), [StringComparison]::OrdinalIgnoreCase)) { throw 'invalid' }
 foreach ($path in @($source, $target)) {
  $attributes = [IO.File]::GetAttributes($path)
  if (($attributes -band [IO.FileAttributes]::Directory) -ne 0 -or ($attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'invalid' }
 }
 $sections = [Security.AccessControl.AccessControlSections]::Access
 $sourceAcl = [IO.File]::GetAccessControl($source, $sections)
 $expected = $sourceAcl.GetSecurityDescriptorSddlForm($sections)
 $initial = [IO.File]::GetAccessControl($target, $sections).GetSecurityDescriptorSddlForm($sections)
 # A sibling stage normally inherits the same ACL. Avoid reapplying inherited
 # ACEs when the full DACL descriptor (including protection) already matches.
 if ($expected -ceq $initial) { [Console]::Out.Write('private'); exit 0 }
 $acl = [Security.AccessControl.FileSecurity]::new()
 $acl.SetSecurityDescriptorSddlForm($expected, $sections)
 [IO.File]::SetAccessControl($target, $acl)
 $actual = [IO.File]::GetAccessControl($target, $sections).GetSecurityDescriptorSddlForm($sections)
 if ($expected -cne $actual) { throw 'invalid' }
 [Console]::Out.Write('private')
} catch { [Console]::Out.Write('rejected'); exit 1 }
`;
type FailureCategory = 'timeout' | 'launch' | 'rejected' | 'process' | 'unexpected_output';
function runScript(scriptText: string, input: object, options: WindowsPrivateOptions) {
 const started = Date.now();
 let category: FailureCategory = 'process';
 try {
  const executable = windowsPowerShellPath();
  const result = (options.execute ?? run)(executable,['-NoLogo','-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(scriptText,'utf16le').toString('base64')],JSON.stringify(input));
  if (result === 'private') return;
  category = result === 'rejected' ? 'rejected' : 'unexpected_output';
 } catch (error) {
  // Inspect only bounded process metadata; never propagate stderr or input.
  const failure = error as {code?: unknown; stdout?: unknown; status?: unknown};
  if (failure?.code === 'ETIMEDOUT') category = 'timeout';
  else if (failure?.stdout === 'rejected') category = 'rejected';
  else if (typeof failure?.code === 'string' && failure?.status == null) category = 'launch';
 }
 const failure = new Error('windows_private_permissions') as Error & {category: FailureCategory; elapsed_ms: number};
 failure.category = category;
 failure.elapsed_ms = Math.max(0, Date.now() - started);
 throw failure;
}
function invoke(path: string, action: 'assert-private' | 'protect-new-directory', options: WindowsPrivateOptions) {
 if (typeof path !== 'string' || !path || path.includes('\0')) throw new Error('windows_private_permissions');
 runScript(script,{path,action},options);
}
/** Preserve the existing file DACL, including inheritance protection, before writing stage content. */
export function copyWindowsFilePermissions(source: string, target: string, options: WindowsPrivateOptions = {}): void {
 if ([source,target].some(path => typeof path !== 'string' || !path || path.includes('\0'))) throw new Error('windows_private_permissions');
 runScript(copyScript,{source,target},options);
}
/** Existing paths are inspected, never repaired or granted new permissions. */
export function assertWindowsPrivatePath(path: string, options: WindowsPrivateOptions = {}): void { invoke(path,'assert-private',options); }
/** Only call immediately after this process exclusively created the directory. */
export function protectNewWindowsPrivateDirectory(path: string, options: WindowsPrivateOptions = {}): void { invoke(path,'protect-new-directory',options); }
