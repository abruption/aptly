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
