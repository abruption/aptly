import { spawnSync } from 'node:child_process';
import { windowsPowerShellPath } from './windows-powershell.ts';

export interface SecretExecOptions {
  input?: string;
  encoding: 'utf8';
  timeout: number;
  maxBuffer: number;
  stdio: ['pipe', 'pipe', 'pipe'];
}
export interface SecretExecResult {
  status: number | null;
  stdout?: string | Buffer;
  stderr?: string | Buffer;
  error?: Error | { code?: string };
}
export type SecretExecutor = (command: string, args: string[], options: SecretExecOptions) => SecretExecResult;
export interface SecretStoreOptions {
  service?: string;
  account?: string;
  platform?: NodeJS.Platform;
  exec?: SecretExecutor;
}
const fail = (code: string): never => { throw new Error(code); };
const validName = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,254}$/.test(value);
const validValue = (value: unknown): value is string => typeof value === 'string' && !!value && value.trim() === value && Buffer.byteLength(value) <= 8192 && !/[\x00-\x1f\x7f]/.test(value);
const runner: SecretExecutor = (command, args, options) => spawnSync(command, args, options);

// Keychain Services generic-password dictionary keys are stable API values.
// Literal NSString keys avoid JXA's opaque CFString global-constant wrappers.
// Rebinding CopyMatching's output as id* bridges its NSData result correctly.
const keychainScript = String.raw`ObjC.import('Foundation');
ObjC.import('Security');
ObjC.bindFunction('SecItemCopyMatching', ['int', ['id', 'id*']]);
const input = JSON.parse(ObjC.unwrap($.NSString.alloc.initWithDataEncoding($.NSFileHandle.fileHandleWithStandardInput.readDataToEndOfFile, $.NSUTF8StringEncoding)));
const query = $.NSMutableDictionary.alloc.init;
query.setObjectForKey($('genp'), $('class'));
query.setObjectForKey($(input.service), $('svce'));
query.setObjectForKey($(input.account), $('acct'));
let status = 0;
let value = null;
if (input.action === 'store') {
  const data = $(input.value).dataUsingEncoding($.NSUTF8StringEncoding);
  const changes = $.NSMutableDictionary.alloc.init;
  changes.setObjectForKey(data, $('v_Data'));
  status = $.SecItemUpdate(query, changes);
  if (status === -25300) {
    query.setObjectForKey(data, $('v_Data'));
    status = $.SecItemAdd(query, null);
  }
} else if (input.action === 'load') {
  query.setObjectForKey($(true), $('r_Data'));
  query.setObjectForKey($('m_LimitOne'), $('m_Limit'));
  const result = Ref();
  status = $.SecItemCopyMatching(query, result);
  if (status === 0) value = ObjC.unwrap($.NSString.alloc.initWithDataEncoding(result[0], $.NSUTF8StringEncoding));
} else if (input.action === 'delete') {
  status = $.SecItemDelete(query);
} else {
  status = -50;
}
const output = $(JSON.stringify({ status, value })).dataUsingEncoding($.NSUTF8StringEncoding);
$.NSFileHandle.fileHandleWithStandardOutput.writeData(output);`;

// Windows generic credentials belong to the current token's credential set.
// The script is constant: target metadata and secret values arrive over stdin.
// CREDENTIALW layout/blob limit: learn.microsoft.com/windows/win32/api/wincred/ns-wincred-credentialw
const windowsScript = String.raw`$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Console]::InputEncoding = New-Object System.Text.UTF8Encoding($false)
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$status = -1
$value = $null
try {
  $request = [Console]::In.ReadToEnd() | ConvertFrom-Json
  Add-Type -TypeDefinition @'
using System;
using System.Text;
using System.Runtime.InteropServices;
public static class AptlyCredentialStore {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  private struct Credential {
    public uint Flags;
    public uint Type;
    [MarshalAs(UnmanagedType.LPWStr)] public string TargetName;
    [MarshalAs(UnmanagedType.LPWStr)] public string Comment;
    public System.Runtime.InteropServices.ComTypes.FILETIME LastWritten;
    public uint CredentialBlobSize;
    public IntPtr CredentialBlob;
    public uint Persist;
    public uint AttributeCount;
    public IntPtr Attributes;
    [MarshalAs(UnmanagedType.LPWStr)] public string TargetAlias;
    [MarshalAs(UnmanagedType.LPWStr)] public string UserName;
  }
  [DllImport("Advapi32.dll", EntryPoint="CredWriteW", CharSet=CharSet.Unicode, ExactSpelling=true, SetLastError=true)]
  [return: MarshalAs(UnmanagedType.Bool)]
  private static extern bool CredWrite(ref Credential credential, uint flags);
  [DllImport("Advapi32.dll", EntryPoint="CredReadW", CharSet=CharSet.Unicode, ExactSpelling=true, SetLastError=true)]
  [return: MarshalAs(UnmanagedType.Bool)]
  private static extern bool CredRead(string target, uint type, uint flags, out IntPtr credential);
  [DllImport("Advapi32.dll", EntryPoint="CredDeleteW", CharSet=CharSet.Unicode, ExactSpelling=true, SetLastError=true)]
  [return: MarshalAs(UnmanagedType.Bool)]
  private static extern bool CredDelete(string target, uint type, uint flags);
  [DllImport("Advapi32.dll", ExactSpelling=true)]
  private static extern void CredFree(IntPtr credential);
  private static readonly UTF8Encoding Utf8 = new UTF8Encoding(false, true);
  public static int Store(string target, string value) {
    byte[] bytes = Utf8.GetBytes(value);
    IntPtr blob = IntPtr.Zero;
    try {
      if (bytes.Length == 0 || bytes.Length > 2560) return 87;
      blob = Marshal.AllocHGlobal(bytes.Length);
      Marshal.Copy(bytes, 0, blob, bytes.Length);
      Credential credential = new Credential();
      credential.Type = 1;
      credential.TargetName = target;
      credential.UserName = "Aptly";
      credential.CredentialBlobSize = (uint)bytes.Length;
      credential.CredentialBlob = blob;
      credential.Persist = 2;
      return CredWrite(ref credential, 0) ? 0 : Marshal.GetLastWin32Error();
    } finally {
      if (blob != IntPtr.Zero) {
        for (int i = 0; i < bytes.Length; i++) Marshal.WriteByte(blob, i, 0);
        Marshal.FreeHGlobal(blob);
      }
      Array.Clear(bytes, 0, bytes.Length);
    }
  }
  public static int Load(string target, out string value) {
    value = null;
    IntPtr pointer = IntPtr.Zero;
    byte[] bytes = null;
    try {
      if (!CredRead(target, 1, 0, out pointer)) return Marshal.GetLastWin32Error();
      Credential credential = (Credential)Marshal.PtrToStructure(pointer, typeof(Credential));
      if (credential.CredentialBlobSize == 0 || credential.CredentialBlobSize > 2560 || credential.CredentialBlob == IntPtr.Zero) return 87;
      bytes = new byte[(int)credential.CredentialBlobSize];
      Marshal.Copy(credential.CredentialBlob, bytes, 0, bytes.Length);
      value = Utf8.GetString(bytes);
      return 0;
    } finally {
      if (bytes != null) Array.Clear(bytes, 0, bytes.Length);
      if (pointer != IntPtr.Zero) CredFree(pointer);
    }
  }
  public static int Delete(string target) {
    return CredDelete(target, 1, 0) ? 0 : Marshal.GetLastWin32Error();
  }
}
'@
  $target = [string]$request.service + ':' + [string]$request.account
  switch ($request.action) {
    'store' { $status = [AptlyCredentialStore]::Store($target, [string]$request.value) }
    'load' { $status = [AptlyCredentialStore]::Load($target, [ref]$value) }
    'delete' { $status = [AptlyCredentialStore]::Delete($target) }
  }
} catch {
  $status = -1
  $value = $null
}
[Console]::Out.WriteLine((@{status=$status;value=$value} | ConvertTo-Json -Compress))`;

function execute(command: string, args: string[], input: string | undefined, options: SecretStoreOptions): SecretExecResult {
  let result: SecretExecResult;
  try { result = (options.exec ?? runner)(command, args, { input, encoding: 'utf8', timeout: 15000, maxBuffer: 65536, stdio: ['pipe', 'pipe', 'pipe'] }); }
  catch { return fail('secure_store_failed'); }
  const errorCode = result.error && 'code' in result.error ? result.error.code : undefined;
  if (errorCode === 'ENOENT') fail('secure_store_unavailable');
  if (errorCode === 'ETIMEDOUT') fail('secure_store_timeout');
  if (result.error) fail('secure_store_failed');
  return result;
}
function operate(action: 'store' | 'load' | 'delete', value: string | undefined, options: SecretStoreOptions): string | null {
  const service = options.service ?? 'dev.aptly.mcp', account = options.account ?? 'OPENAI_API_KEY';
  if (!validName(service) || !validName(account)) fail('secure_store_invalid_options');
  if (action === 'store' && !validValue(value)) fail('secure_store_invalid_value');
  const platform = options.platform ?? process.platform;
  if (platform === 'win32') {
    if (action === 'store' && Buffer.byteLength(value!) > 2560) fail('secure_store_invalid_value');
    const input = JSON.stringify({ action, service, account, ...(action === 'store' ? { value } : {}) });
    let executable: string;
    try { executable = windowsPowerShellPath(); } catch { return fail('secure_store_unavailable'); }
    const result = execute(executable, ['-NoProfile', '-NonInteractive', '-Command', windowsScript], input, options);
    if (result.status !== 0) fail('secure_store_failed');
    let parsed: unknown;
    try { parsed = JSON.parse(String(result.stdout ?? '')); } catch { return fail('secure_store_failed'); }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) fail('secure_store_failed');
    const response = parsed as { status?: unknown; value?: unknown };
    if (response.status === 1168 && action !== 'store') return null;
    if (response.status === 5) fail('secure_store_denied');
    if (response.status === 1223) fail('secure_store_cancelled');
    if (response.status === 1312 || response.status === 50) fail('secure_store_unavailable');
    if (response.status !== 0) fail('secure_store_failed');
    if (action !== 'load') return null;
    const loaded = response.value;
    if (!validValue(loaded) || Buffer.byteLength(loaded) > 2560) return fail('secure_store_invalid_value');
    return loaded;
  }
  if (platform === 'darwin') {
    const input = JSON.stringify({ action, service, account, ...(action === 'store' ? { value } : {}) });
    const result = execute('/usr/bin/osascript', ['-l', 'JavaScript', '-e', keychainScript], input, options);
    if (result.status !== 0) fail('secure_store_failed');
    let parsed: unknown;
    try { parsed = JSON.parse(String(result.stdout ?? '')); } catch { return fail('secure_store_failed'); }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) fail('secure_store_failed');
    const response = parsed as { status?: unknown; value?: unknown };
    if (response.status === -25300) {
      if (action === 'store') fail('secure_store_unavailable');
      return null;
    }
    if (response.status === -128) fail('secure_store_cancelled');
    if (response.status === -25293) fail('secure_store_denied');
    if (response.status === -25308) fail('secure_store_locked');
    if (response.status === -34018) fail('secure_store_unavailable');
    if (response.status !== 0) fail('secure_store_failed');
    if (action !== 'load') return null;
    const loaded = response.value;
    if (!validValue(loaded)) return fail('secure_store_invalid_value');
    return loaded;
  }
  if (platform === 'linux') {
    const args = action === 'store' ? ['store', '--label=Aptly MCP classification key', 'service', service, 'account', account] : [action === 'load' ? 'lookup' : 'clear', 'service', service, 'account', account];
    const result = execute('secret-tool', args, action === 'store' ? value + '\n' : undefined, options);
    if (result.status === 1 && !String(result.stderr ?? '').trim() && (action === 'delete' || (action === 'load' && !String(result.stdout ?? '').trim()))) return null;
    if (result.status !== 0) fail('secure_store_failed');
    if (action !== 'load') return null;
    const loaded = String(result.stdout ?? '').replace(/\r?\n$/, '');
    if (!validValue(loaded)) fail('secure_store_invalid_value');
    return loaded;
  }
  return fail('secure_store_unsupported_platform');
}
/** Secret values are sent to OS tools only over stdin, never command arguments. */
export function storeSecret(value: string, options: SecretStoreOptions = {}): void { operate('store', value, options); }
/** Internal runtime API: callers must never echo the returned value. */
export function loadSecret(options: SecretStoreOptions = {}): string | null { return operate('load', undefined, options); }
export function deleteSecret(options: SecretStoreOptions = {}): void { operate('delete', undefined, options); }
