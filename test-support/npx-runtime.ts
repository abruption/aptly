import { chmodSync, copyFileSync, cpSync, existsSync, lstatSync, mkdirSync, readdirSync, realpathSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { TestContext } from 'node:test';
import { createTestTemp } from './temp.ts';

function protectCopy(directory: string): void {
  for (const entry of readdirSync(directory, {withFileTypes:true})) {
    const path=join(directory,entry.name);
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) protectCopy(path);
    else chmodSync(path,lstatSync(path).mode & 0o755);
  }
  chmodSync(directory,0o700);
}

/** Hosted CI can put Node/npm inside a shared writable cache. Use a private copy
 * for actual launcher checks, without changing the cache or production policy. */
export function copyNpxTestNode(t: TestContext): string | undefined {
  const original=realpathSync(process.execPath),prefix=dirname(dirname(original));
  const npm=['lib/node_modules/npm','share/nodejs/npm'].map(path=>join(prefix,path))
    .find(path=>existsSync(join(path,'bin/npx-cli.js')));
  if (!npm) {
    t.skip('Node npm CLI unavailable');
    return;
  }
  if (process.env.GITHUB_ACTIONS==='true') {
    for (let path=dirname(npm);;path=dirname(path)) {
      const stat=lstatSync(path);
      if ((stat.mode&0o022)!==0&&!((stat.mode&0o1000)!==0&&stat.uid===0)) {
        t.diagnostic(`Shared Node/npm ancestor: ${path} (mode ${(stat.mode&0o777).toString(8)}). Testing a private copy.`);
        break;
      }
      if (dirname(path)===path) break;
    }
  }
  const root=createTestTemp(t,'codex-npx-node-'),bin=join(root,'bin'),node=join(bin,'node');
  mkdirSync(bin,{mode:0o700});
  copyFileSync(original,node);
  chmodSync(node,0o700);
  const bundled=join(root,'lib/node_modules/npm');
  cpSync(npm,bundled,{recursive:true,verbatimSymlinks:true});
  protectCopy(bundled);
  return node;
}
