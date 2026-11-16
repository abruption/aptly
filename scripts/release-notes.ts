// Offline body rendering only: no release/tag/registry writes or network access.
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join, posix, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { markdownAnchors } from './docs-check.ts';

const tagPattern = /^v(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[A-Za-z0-9]+(?:[.-][A-Za-z0-9]+)*)?$/;
const shaPattern = /^[a-f0-9]{40}$/;
function fail(code:string):never { throw new Error(code); }
export type PublishedLink = { path:string; ref:string; fragment:string; href:string };
export function renderReleaseBody(source:string, options:{releaseTag:string;evidenceRef:string;readFile:(ref:string,path:string)=>string|undefined}) {
  if (!tagPattern.test(options.releaseTag) || !shaPattern.test(options.evidenceRef)) fail('release_notes_invalid_ref');
  const sourcePath = `docs/release-notes/${options.releaseTag.slice(1)}.md`, links:PublishedLink[] = [];
  const cache = new Map<string,string>();
  const rewrite = (raw:string):string => {
    const angle = raw.startsWith('<'), destination = angle ? raw.slice(1,-1) : raw;
    if (/^(?:https?:\/\/|mailto:)/i.test(destination)) return raw;
    if (destination.startsWith('#')) {
      let fragment:string;try { fragment=decodeURIComponent(destination.slice(1)); } catch { return fail('release_notes_invalid_link'); }
      if (!markdownAnchors(source).has(fragment)) fail('release_notes_missing_anchor');
      return raw;
    }
    if (!destination || /[\x00-\x20\x7f\\?]/.test(destination) || /^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(destination)) fail('release_notes_invalid_link');
    const [location, encodedFragment='', ...extra] = destination.split('#');
    if (extra.length) fail('release_notes_invalid_link');
    let decoded:string,fragment:string;
    try { decoded=decodeURIComponent(location);fragment=decodeURIComponent(encodedFragment); } catch { return fail('release_notes_invalid_link'); }
    if (/[\x00-\x1f\x7f\\]/.test(decoded+fragment)) fail('release_notes_invalid_link');
    const path=posix.normalize(decoded.startsWith('/')?decoded.slice(1):posix.join(posix.dirname(sourcePath),decoded));
    if (path==='..' || path.startsWith('../') || path.startsWith('/') || path==='.' || path.split('/').some(part=>part==='.git'||!part)) fail('release_notes_unsafe_path');
    const ref=path.startsWith('docs/releases/')?options.evidenceRef:options.releaseTag, key=ref+':'+path;
    let content=cache.get(key);
    if (content===undefined) { content=options.readFile(ref,path);if(content===undefined)fail('release_notes_missing_file');cache.set(key,content); }
    if (fragment && !markdownAnchors(content).has(fragment)) fail('release_notes_missing_anchor');
    const href=`https://github.com/abruption/aptly/blob/${ref}/${path.split('/').map(encodeURIComponent).join('/')}${fragment?'#'+encodeURIComponent(fragment):''}`;
    links.push({path,ref,fragment,href});return angle?'<'+href+'>':href;
  };
  // The repository's notes use inline Markdown links. Preserve code verbatim;
  // reject unsupported relative reference/HTML forms instead of silently publishing them.
  let fence='';
  const body=source.split('\n').map(line=>{
    const marker=line.match(/^\s{0,3}(`{3,}|~{3,})(.*)$/);
    if(fence){if(marker&&marker[1][0]===fence[0]&&marker[1].length>=fence.length&&!marker[2].trim())fence='';return line;}
    if(marker){fence=marker[1];return line;}
    if(/\\`/.test(line))fail('release_notes_unsupported_link');
    const plain=(part:string)=>{
      if(/^\s*\[[^\]]+\]:\s*(?!<?https?:\/\/|<?mailto:)\S/i.test(part)||/\b(?:href|src)\s*=\s*(?:["'](?!https?:\/\/|mailto:|#)|(?=[^\s"'])(?!https?:\/\/|mailto:|#))/i.test(part))fail('release_notes_unsupported_link');
      const result=part.replace(/\]\((<[^>]+>|[^\s()]+)(\s+(?:"[^"]*"|'[^']*'))?\)/g,(_all,link,title='')=>']('+rewrite(link)+title+')');
      if(/\]\(\s*(?!<?(?:https?:\/\/|mailto:|#))/i.test(result))fail('release_notes_unsupported_link');
      return result;
    };
    let output='',cursor=0;
    while(cursor<line.length){
      const open=line.indexOf('`',cursor);
      if(open<0){output+=plain(line.slice(cursor));break;}
      const count=line.slice(open).match(/^`+/)![0].length;
      const runs=/`+/g;runs.lastIndex=open+count;let closing:RegExpExecArray|null;
      do{closing=runs.exec(line);}while(closing&&closing[0].length!==count);
      // Multi-line/unterminated inline code is outside this bounded convention.
      if(!closing)fail('release_notes_unsupported_link');
      output+=plain(line.slice(cursor,open))+line.slice(open,closing.index+count);cursor=closing.index+count;
    }
    return output;
  }).join('\n');
  if(fence)fail('release_notes_unclosed_fence');
  return {body,links};
}

function main() {
  const args=process.argv.slice(2);
  if(args.length===1&&args[0]==='--help'){console.log('Usage: node scripts/release-notes.ts --tag vX.Y.Z --evidence-ref FULL_COMMIT_SHA\nPrint a validated publishable body to stdout. Source checkout only; no network or release writes.');return;}
  if(args.length!==4||args[0]!=='--tag'||args[2]!=='--evidence-ref'||!tagPattern.test(args[1])||!shaPattern.test(args[3]))fail('release_notes_invalid_options');
  const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
  const git=(argv:string[])=>execFileSync('git',argv,{cwd:root,encoding:'utf8',timeout:15000,maxBuffer:1024*1024,stdio:['ignore','pipe','pipe']});
  const commits=new Map<string,string>();
  for(const ref of [args[1],args[3]]){let sha:string;try{sha=git(['rev-parse','--verify',ref+'^{commit}']).trim();}catch{return fail('release_notes_ref_not_found');}if(!shaPattern.test(sha))fail('release_notes_invalid_ref');commits.set(ref,sha);}
  const readFile=(ref:string,path:string):string|undefined=>{
    const commit=commits.get(ref)!;
    try { const tree=git(['--literal-pathspecs','ls-tree','-z',commit,'--',path]);if(!/^(?:100644|100755) blob [a-f0-9]{40}\t/.test(tree)||tree.split('\0').filter(Boolean).length!==1||tree.slice(tree.indexOf('\t')+1,-1)!==path)return undefined;return git(['show',commit+':'+path]); } catch { return undefined; }
  };
  const source=readFileSync(join(root,'docs/release-notes',args[1].slice(1)+'.md'),'utf8');
  process.stdout.write(renderReleaseBody(source,{releaseTag:args[1],evidenceRef:args[3],readFile}).body);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  try{main();}catch(error){const code=error instanceof Error&&/^release_notes_[a-z_]+$/.test(error.message)?error.message:'release_notes_failed';process.stderr.write(code+'\n');process.exitCode=1;}
}
