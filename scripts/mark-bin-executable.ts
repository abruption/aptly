import { chmodSync, lstatSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// tsc writes normal data-file permissions; preserve an executable CLI in the
// distributable archive rather than relying on an installer's permission fixup.
const relative=import.meta.url.endsWith('.ts')?'../dist/bin/aptly.js':'../bin/aptly.js';
const path=fileURLToPath(new URL(relative,import.meta.url));
const stat=lstatSync(path);
if(!stat.isFile()||stat.isSymbolicLink())throw new Error('compiled_cli_unavailable');
chmodSync(path,0o755);
