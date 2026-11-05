import test from 'node:test';
import assert from 'node:assert/strict';
import { builtInProfiles, isSupportedProfile, resolveCatalog } from '../src/catalog.ts';

const safeError = code => error => error instanceof Error && error.message === code && error.code === code;
const models = catalog => catalog.profiles.map(profile => profile.model);

test('draft defaults provide the user-selected three tiers and exact Codex efforts', () => {
  assert.deepEqual(builtInProfiles(), [
    { id:'codex-simple',client:'codex',model:'gpt-6-luna',reasoning_effort:'max' },
    { id:'codex-routine',client:'codex',model:'gpt-6.1-terra',reasoning_effort:'high' },
    { id:'codex-deep',client:'codex',model:'gpt-6.1-sol',reasoning_effort:'medium' },
    { id:'claude-simple',client:'claude',model:'haiku' },
    { id:'claude-routine',client:'claude',model:'sonnet' },
    { id:'claude-deep',client:'claude',model:'opus' },
  ]);
  const catalog=resolveCatalog({});
  assert.deepEqual(catalog.profiles,builtInProfiles());assert.deepEqual(catalog.disabled_clients,[]);
  assert.match(catalog.version,/^catalog-[a-f0-9]{32}$/);
  for(const profile of catalog.profiles){
    assert.ok(isSupportedProfile(profile));
    assert.ok(catalog.descriptions[profile.id].includes(profile.model));
    assert.match(catalog.descriptions[profile.id],/Official capability note \(data\)/);
    assert.match(catalog.descriptions[profile.id],/Availability.*not verified/);
    if(profile.client==='codex')assert.ok(catalog.descriptions[profile.id].includes('configured effort: '+profile.reasoning_effort));
    else assert.equal(Object.hasOwn(profile,'reasoning_effort'),false);
  }
});

test('operator JSON strings filter known models and may explicitly select optional frontier models', () => {
  const catalog=resolveCatalog({APTLY_CODEX_MODELS:'["gpt-6.1-sol","gpt-6-luna"]',APTLY_CLAUDE_MODELS:'["opus"]'});
  assert.deepEqual(models(catalog),['gpt-6.1-sol','gpt-6-luna','opus']);
  const extra=resolveCatalog({APTLY_CODEX_MODELS:'["gpt-6-astra"]',APTLY_CLAUDE_MODELS:'["fable"]'});
  assert.deepEqual(models(extra),['gpt-6-astra','fable']);
  for(const profile of extra.profiles)assert.ok(isSupportedProfile(profile));
  assert.notEqual(catalog.version,resolveCatalog({}).version);
});

test('empty candidate arrays disable a provider and both empty arrays remain a valid empty catalog', () => {
  const one=resolveCatalog({APTLY_CODEX_MODELS:'[]'});
  assert.deepEqual(one.disabled_clients,['codex']);assert.deepEqual(models(one),['haiku','sonnet','opus']);
  const both=resolveCatalog({APTLY_CODEX_MODELS:'[]',APTLY_CLAUDE_MODELS:'[]'});
  assert.deepEqual(both.profiles,[]);assert.deepEqual(both.descriptions,{});assert.deepEqual(both.disabled_clients,['codex','claude']);
});

test('unprefixed compatibility names select the same catalog but simultaneous naming forms are conflicts', () => {
  assert.deepEqual(resolveCatalog({CODEX_MODELS:'["gpt-6-luna"]',CLAUDE_MODELS:'["sonnet"]'}),
    resolveCatalog({APTLY_CODEX_MODELS:'["gpt-6-luna"]',APTLY_CLAUDE_MODELS:'["sonnet"]'}));
  for(const env of [
    {APTLY_CODEX_MODELS:'[]',CODEX_MODELS:'[]'},
    {APTLY_CLAUDE_MODELS:'["haiku"]',CLAUDE_MODELS:'["haiku"]'},
  ])assert.throws(()=>resolveCatalog(env),safeError('catalog_configuration_conflict'));
});

test('the example misspelling is refused explicitly instead of silently ignoring the intended candidate list', () => {
  for(const key of ['CODEX_MODESL','APTLY_CODEX_MODESL'])assert.throws(()=>resolveCatalog({[key]:'["gpt-6-luna"]'}),safeError('catalog_environment_typo'));
});

test('malformed arrays unsupported IDs duplicates and non-string environment values fail with fixed safe codes', () => {
  const sentinel='synthetic-private-setting';
  for(const raw of ['', 'haiku,sonnet', '{}', 'null', '"haiku"', '[null]', '[1]', '["haiku","haiku"]', '["Haiku"]', '["haiku "]', '["gpt-6-luna"]', JSON.stringify([sentinel]), JSON.stringify(Array(21).fill('haiku')), undefined, ['haiku']]) {
    assert.throws(()=>resolveCatalog({APTLY_CLAUDE_MODELS:raw}),error=>safeError('catalog_configuration_invalid')(error)&&!String(error).includes(sentinel));
  }
  assert.throws(()=>resolveCatalog({APTLY_CODEX_MODELS:'["gpt-6-tera"]'}),safeError('catalog_configuration_invalid'));
  assert.throws(()=>resolveCatalog(null),safeError('catalog_configuration_invalid'));
});

test('environment accessors cannot execute while loading candidate lists', () => {
  let read=false;const env={};Object.defineProperty(env,'APTLY_CODEX_MODELS',{enumerable:true,get(){read=true;throw Error('synthetic-private-getter');}});
  assert.throws(()=>resolveCatalog(env),safeError('catalog_configuration_invalid'));assert.equal(read,false);
});

test('only exact trusted profile tuples pass validation, including optional effort key coverage', () => {
  const original=builtInProfiles()[0];
  for(const value of [null,[],{}, {...original,id:'unlisted'}, {...original,model:'gpt-6.1-sol'}, {...original,reasoning_effort:'low'}, {...original,command:'synthetic-command'}, {...builtInProfiles()[3],reasoning_effort:undefined}])assert.equal(isSupportedProfile(value),false);
  let read=false;const accessor={...original};Object.defineProperty(accessor,'model',{enumerable:true,get(){read=true;return original.model;}});
  assert.equal(isSupportedProfile(accessor),false);assert.equal(read,false);
  assert.equal(isSupportedProfile({...original,[Symbol('unknown')]:'value'}),false);
});

test('fresh profile and catalog objects cannot mutate later trusted resolutions', () => {
  const profiles=builtInProfiles();profiles[0].model='attacker-model';profiles.push({id:'extra',client:'codex',model:'attacker'});
  const first=resolveCatalog({});const expected=structuredClone(first);first.profiles[0].reasoning_effort='low';first.descriptions['codex-simple']='attacker';first.disabled_clients.push('codex');
  assert.deepEqual(resolveCatalog({}),expected);
});

test('bounded official facts enrich selected model descriptions and change snapshot identity', () => {
  const base=resolveCatalog({});const fact={client:'codex',model:'gpt-6-luna',description:'Updated official description for focused extraction.'};const before=structuredClone(fact);
  const enriched=resolveCatalog({},[fact]);assert.ok(enriched.descriptions['codex-simple'].includes(fact.description));assert.notEqual(enriched.version,base.version);assert.deepEqual(fact,before);
  const sameWhitespace=resolveCatalog({},[{...fact,description:'  Updated official description\nfor focused extraction.  '}]);assert.equal(sameWhitespace.version,enriched.version);
  const unselected=resolveCatalog({APTLY_CODEX_MODELS:'["gpt-6.1-sol"]'},[fact]);
  assert.equal(unselected.version,resolveCatalog({APTLY_CODEX_MODELS:'["gpt-6.1-sol"]'}).version);
});

test('unknown model facts never introduce models or leak into the candidate descriptions', () => {
  const baseline=resolveCatalog({});const other=resolveCatalog({},[{client:'codex',model:'unknown-model',description:'Unknown model capability sentence.'}]);assert.deepEqual(other,baseline);
});

test('bad or duplicate fact records fail without echoing source text or allowing getters', () => {
  const good={client:'claude',model:'haiku',description:'Official concise description.'};const secret=['sk','fixture-secret-not-a-real-key'].join('-');
  for(const facts of [null,{},[{}],[{...good,description:''}],[{...good,description:'x'.repeat(801)}],[{...good,description:secret}],[{...good,description:'bad\0text'}],[{...good,raw:'private'}],[good,good]]) {
    assert.throws(()=>resolveCatalog({},facts),error=>safeError('catalog_facts_invalid')(error)&&!String(error).includes(secret));
  }
  let read=false;const fact={...good};Object.defineProperty(fact,'description',{enumerable:true,get(){read=true;return good.description;}});
  assert.throws(()=>resolveCatalog({},[fact]),safeError('catalog_facts_invalid'));assert.equal(read,false);
});

test('catalog identity ignores environment and fact record key order but respects configured candidate order', () => {
  const facts=[{client:'claude',model:'sonnet',description:'One official description.'},{client:'codex',model:'gpt-6.1-sol',description:'Another description.'}];
  const a=resolveCatalog({APTLY_CLAUDE_MODELS:'["sonnet"]',APTLY_CODEX_MODELS:'["gpt-6-luna","gpt-6.1-sol"]'},facts);
  const b=resolveCatalog({APTLY_CODEX_MODELS:'["gpt-6-luna","gpt-6.1-sol"]',APTLY_CLAUDE_MODELS:'["sonnet"]'},facts.toReversed().map(f=>({description:f.description,model:f.model,client:f.client})));
  assert.equal(a.version,b.version);
  const reversed=resolveCatalog({APTLY_CODEX_MODELS:'["gpt-6.1-sol","gpt-6-luna"]',APTLY_CLAUDE_MODELS:'["sonnet"]'},facts);assert.notEqual(a.version,reversed.version);
});
