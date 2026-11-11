import { createInterface } from 'node:readline';
import { Writable } from 'node:stream';
import { StringDecoder } from 'node:string_decoder';

const fail = (code: string) => new Error(code);
/** Values never appear in argv, echoed terminal input, diagnostics or temporary files. */
export async function readEnvironmentValue({ key, fromStdin = false }: { key: string; fromStdin?: boolean }): Promise<string> {
  if (fromStdin) {
    const decoder = new StringDecoder('utf8');
    let value = '', bytesRead = 0;
    for await (const chunk of process.stdin) {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      bytesRead += bytes.length;
      if (bytesRead > 8192) throw fail('set_value_too_large');
      value += decoder.write(bytes);
    }
    value += decoder.end();
    if (Buffer.byteLength(value) > 8192) throw fail('set_value_too_large');
    return value.replace(/\r?\n$/, '');
  }
  if (!process.stdin.isTTY || !process.stdout.isTTY) throw fail('set_interactive_input_required');
  const silent = new Writable({ write(_chunk, _encoding, done) { done(); } });
  const rl = createInterface({ input: process.stdin, output: silent, terminal: true });
  process.stdout.write(`Value for ${key} (input hidden): `);
  try {
    return await new Promise<string>((resolve, reject) => {
      let settled = false;
      const cancel = () => { if (!settled) { settled = true; reject(fail('set_input_cancelled')); } };
      rl.once('SIGINT', () => { cancel(); rl.close(); });
      rl.once('close', cancel);
      rl.question('', value => {
        settled = true;
        if (Buffer.byteLength(value) > 8192) reject(fail('set_value_too_large'));
        else resolve(value);
      });
    });
  } finally { rl.close(); process.stdout.write('\n'); }
}

export type TransmissionReviewChoice = 'keep' | 'none' | 'description' | 'excerpt';
export interface TransmissionPromptCandidate {
  client:'codex'|'claude'; transmission:'none'|'description'|'excerpt'|'unselected';
  transmission_source:'legacy'|'explicit'|'unselected'; selected_home_source:'default'|'override';
  application_mode:'defaults'|'advisory'; enabled:boolean;
}
/** Lifecycle, CI and redirected output are never interactive consent. */
export function canPromptTransmission({env=process.env,stdinIsTTY=!!process.stdin.isTTY,stdoutIsTTY=!!process.stdout.isTTY,stderrIsTTY=!!process.stderr.isTTY}:{env?:NodeJS.ProcessEnv;stdinIsTTY?:boolean;stdoutIsTTY?:boolean;stderrIsTTY?:boolean}={}):boolean {
  return stdinIsTTY && stdoutIsTTY && stderrIsTTY && !env.CI && env.APTLY_SKIP_SETUP!=='1' && !env.npm_lifecycle_event;
}
/** Read one actual operator answer. Prompts/terminal echo stay on stderr, JSON on stdout. */
export async function readTransmissionReviewChoice(candidates:readonly TransmissionPromptCandidate[]):Promise<TransmissionReviewChoice> {
  if(!canPromptTransmission())throw fail('set_interactive_input_required');
  process.stderr.write('Review automatic task information sent to the OpenAI Decisions API (not Aptly developers).\nDescriptions and excerpts may contain sensitive information; this is not anonymization.\nCurrent configured scope:\n');
  for(const c of candidates)process.stderr.write('  '+c.client+' ('+c.selected_home_source+' home): '+c.transmission+' ['+(c.transmission_source==='legacy'?'legacy v1':c.transmission_source==='explicit'?'explicit v2':'unselected')+']; '+c.application_mode+', '+(c.enabled?'enabled':'disabled')+'\n');
  process.stderr.write('  1. none        — No automatic transmission\n  2. description — Caller-provided descriptions only\n  3. excerpt     — Bounded task-name/body excerpts and descriptions (Recommended)\n  Enter / keep   — Keep configured scopes; unselected becomes none\n');
  const rl=createInterface({input:process.stdin,output:process.stderr,terminal:true});
  try{return await new Promise((resolve,reject)=>{
    let settled=false;const cancel=()=>{if(!settled){settled=true;reject(fail('set_input_cancelled'));}};
    rl.once('SIGINT',()=>{cancel();rl.close();});rl.once('close',cancel);
    const ask=()=>rl.question('Transmission scope [Enter: keep / unselected: none]: ',value=>{
      const choices:Record<string,TransmissionReviewChoice>={'':'keep',keep:'keep','1':'none',none:'none','2':'description',description:'description','3':'excerpt',excerpt:'excerpt'};
      const selected=value.trim().toLowerCase();
      if(!Object.hasOwn(choices,selected)){process.stderr.write('Choose 1, 2, 3 or keep.\n');ask();return;}
      settled=true;resolve(choices[selected]);
    });ask();
  });}finally{rl.close();}
}
/** Compatibility for the former initial-only input helper. */
export async function readTransmissionChoice():Promise<'none'|'description'|'excerpt'> {
  const result=await readTransmissionReviewChoice([]);return result==='keep'?'none':result;
}
