import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveProvenance, provenanceRequirements, digestToolInput } from '../src/provenance.ts';

const now = Date.parse('2026-11-03T01:00:00.000Z');
const event = client => ({
  hook_event_name: 'PreToolUse', tool_name: client === 'codex' ? 'collaborationspawn_agent' : 'Agent',
  session_id: 'synthetic-session', cwd: '/synthetic/work', tool_use_id: 'call-123',
  tool_input: client === 'codex' ? {task_name:'synthetic',fork_turns:'none',message:'private task body'} :
    {description:'synthetic',subagent_type:'general-purpose',prompt:'private task body'},
});
const context = (client, e = event(client)) => ({
  schema_version: 1, client, client_version: provenanceRequirements[client].versions[0],
  session_id: 'synthetic-session', cwd: '/synthetic/work', issued_at: new Date(now - 1000).toISOString(), expires_at: now + 60000,
  layers: provenanceRequirements[client].layers.map(source=>({source,model:'unset',effort:'unset'})),
  environment: Object.fromEntries(provenanceRequirements[client].environment.map(name=>[name,'unset'])),
  host_extensions:'none', evidence_verified:true,
  tool_use_id:e?.tool_use_id ?? e?.tool_call_id, tool_input_sha256:digestToolInput({client,event:e}),
});
const run = (client, e = event(client), c = context(client, e), extra = {}) => resolveProvenance({client,event:e,context:c,now,...extra});
const layer = (c, source) => c.layers.find(value=>value.source===source);

for (const client of ['codex','claude']) {
  test(`${client}: complete, session-bound trusted coverage permits eligibility, not application`,()=>{
    const e=event(client),c=context(client),before=structuredClone({e,c});
    const result=run(client,e,c);
    assert.equal(result.status,'eligible');assert.equal(result.reason,'eligible');
    assert.deepEqual(result.fields,{model:{state:'unset',source:'none'},effort:{state:'unset',source:'none'}});
    assert.deepEqual(result.constraints,{model_pinned:false,effort_pinned:false,role_pinned:false,fork_inherits:false,provenance_verified:true});
    assert.deepEqual({e,c},before);assert.equal('application' in result,false);
  });
  test(`${client}: native pins preserve every explicit value, including empty/null/undefined`,()=>{
    for(const key of ['model','effort','reasoning_effort','model_reasoning_effort'])for(const value of [null,'',undefined,'fixed']){
      const e=event(client);e.tool_input[key]=value;
      const result=run(client,e,null);assert.equal(result.status,'preserve');
      assert.equal(result.constraints[key==='model'?'model_pinned':'effort_pinned'],true);
      assert.equal(result.constraints.provenance_verified,false);
      assert.equal(result.reason,key==='model'?'explicit_model':'explicit_effort');
    }
  });
  test(`${client}: every fixed settings layer is a preservation source`,()=>{
    for(const source of provenanceRequirements[client].layers)for(const name of ['model','effort']){
      const c=context(client);layer(c,source)[name]='pinned';const result=run(client,undefined,c);
      assert.equal(result.status,'preserve');assert.deepEqual(result.fields[name],{state:'pinned',source});
      assert.equal(result.constraints[`${name}_pinned`],true);assert.equal(result.constraints.provenance_verified,false);
    }
  });
  test(`${client}: missing or unknown layers cannot be inferred from another unset source`,()=>{
    const c=context(client);c.layers.pop();assert.equal(run(client,undefined,c).reason,'layers_incomplete');
    for(const name of ['model','effort']){
      const c=context(client);layer(c,'project')[name]='unknown';const result=run(client,undefined,c);
      assert.equal(result.status,'unknown');assert.equal(result.reason,'context_unknown');assert.equal(result.constraints.provenance_verified,false);
    }
    const duplicate=context(client);duplicate.layers[1]={...duplicate.layers[0]};assert.equal(run(client,undefined,duplicate).reason,'layers_invalid');
    const extra=context(client);extra.layers.push({source:'attacker',model:'unset',effort:'unset'});assert.equal(run(client,undefined,extra).status,'unknown');
  });
  test(`${client}: environment coverage is explicit and set values preserve`,()=>{
    for(const name of provenanceRequirements[client].environment){
      const c=context(client);c.environment[name]='set';const result=run(client,undefined,c);assert.equal(result.status,'preserve');
      assert.equal(Object.values(result.fields).some(value=>value.source==='environment'&&value.state==='pinned'),true);
      const missing=context(client);delete missing.environment[name];assert.equal(run(client,undefined,missing).reason,'environment_incomplete');
      const unknown=context(client);unknown.environment[name]='unknown';assert.equal(run(client,undefined,unknown).status,'unknown');
    }
  });
  test(`${client}: wrong client, version and unverified evidence remain unknown`,()=>{
    assert.equal(resolveProvenance({client,event:event(client),now}).reason,'context_missing');
    for(const patch of [{schema_version:2},{client:'other'},{client_version:'99.0.0'},{client_version:'0.166.0 attacker'},{evidence_verified:false},{evidence_verified:'true'}]){
      assert.equal(run(client,undefined,{...context(client),...patch}).status,'unknown');
    }
    assert.equal(run(client,undefined,{...context(client),evidence_verified:false}).reason,'context_unverified');
    const e=event(client);e.provenance_verified=true;e.context=context(client);assert.equal(run(client,e,null).status,'unknown');
  });
  test(`${client}: current native session and cwd must both match trusted evidence`,()=>{
    for(const patch of [{session_id:'other'},{cwd:'/other'}, {cwd:''}, {session_id:null}])assert.equal(run(client,{...event(client),...patch}).reason,'context_binding_mismatch');
    assert.equal(run(client,undefined,{...context(client),session_id:'other'}).reason,'context_binding_mismatch');
    assert.equal(run(client,undefined,{...context(client),cwd:'/other'}).reason,'context_binding_mismatch');
  });
  test(`${client}: snapshot validity is bounded and clock checked`,()=>{
    for(const patch of [{issued_at:now+5001},{issued_at:now-3600001,expires_at:now+1},{issued_at:'not-a-date'},{expires_at:now-1001},{expires_at:now-2000},{issued_at:null},{expires_at:Infinity}]){
      assert.equal(run(client,undefined,{...context(client),...patch}).status,'unknown');
    }
    assert.equal(run(client,undefined,{...context(client),expires_at:now}).reason,'context_expired');
    assert.equal(run(client,undefined,context(client),{now:NaN}).reason,'context_time_invalid');
    assert.equal(run(client,undefined,{...context(client),issued_at:now+5000,expires_at:now+60000}).status,'eligible');
  });
  test(`${client}: host mods and unobservable overrides block eligibility`,()=>{
    for(const host_extensions of ['present','unknown'])assert.equal(run(client,undefined,{...context(client),host_extensions}).reason,'host_extensions_unknown');
    assert.equal(run(client,undefined,{...context(client),host_extensions:'unsupported'}).status,'unknown');
  });
  test(`${client}: output contains only fixed codes, never actual task, identity, paths or setting values`,()=>{
    const e=event(client),c=context(client);e.tool_input.model='PRIVATE_MODEL_VALUE';
    const result=run(client,e,c),serialized=JSON.stringify(result);
    for(const value of ['private task body','PRIVATE_MODEL_VALUE','synthetic-session','/synthetic/work','call-123'])assert.equal(serialized.includes(value),false);
    const poisoned=context(client);poisoned.layers[0].model='PRIVATE_MODEL_VALUE';assert.equal(run(client,undefined,poisoned).reason,'layers_invalid');
    assert.equal(JSON.stringify(run(client,undefined,poisoned)).includes('PRIVATE_MODEL_VALUE'),false);
  });
  test(`${client}: malformed and unrelated events are unknown without throwing`,()=>{
    for(const value of [null,{},[],{...event(client),tool_input:[]},{...event(client),tool_input:null},{...event(client),hook_event_name:'SubagentStart'},{...event(client),tool_name:'Bash'},{...event(client),tool_use_id:''}])assert.equal(run(client,value).status,'unknown');
    const fallback=event(client);delete fallback.tool_use_id;fallback.tool_call_id='fallback';assert.equal(run(client,fallback).status,'eligible');
  });
}

test('Codex role model takes precedence over explicit invocation model; effort resolves independently',()=>{
  const e=event('codex');e.tool_input.model='explicit-not-returned';const c=context('codex',e);
  layer(c,'role').model='pinned';layer(c,'profile').effort='pinned';
  const result=run('codex',e,c);assert.equal(result.status,'preserve');
  assert.deepEqual(result.fields,{model:{state:'pinned',source:'role'},effort:{state:'pinned',source:'profile'}});
});
test('managed constraints are reported before lower configuration and invocation choices',()=>{
  for(const client of ['codex','claude']){
    const e=event(client);e.tool_input.effort='explicit';const c=context(client,e);layer(c,'managed').model='pinned';layer(c,'managed').effort='pinned';
    layer(c,'invocation').model='pinned';
    assert.deepEqual(run(client,e,c).fields,{model:{state:'pinned',source:'managed'},effort:{state:'pinned',source:'managed'}});
  }
});
test('Claude model chooses invocation before agent; effort environment precedes invocation',()=>{
  const c=context('claude');layer(c,'invocation').model='pinned';layer(c,'agent').model='pinned';
  layer(c,'invocation').effort='pinned';c.environment.CLAUDE_CODE_EFFORT_LEVEL='set';
  const result=run('claude',undefined,c);
  assert.deepEqual(result.fields,{model:{state:'pinned',source:'invocation'},effort:{state:'pinned',source:'environment'}});
});
test('Claude forced subagent model remains a conservative environment blocker',()=>{
  const c=context('claude');c.environment.CLAUDE_CODE_SUBAGENT_MODEL_FORCE='set';layer(c,'invocation').model='pinned';
  assert.deepEqual(run('claude',undefined,c).fields.model,{state:'pinned',source:'environment'});
});
test('native roles and forks preserve context without requiring a snapshot',()=>{
  for(const patch of [{agent_type:'reviewer'},{agent_type:null},{role:''}]){
    const e=event('codex');Object.assign(e.tool_input,patch);const result=run('codex',e,null);
    assert.equal(result.reason,'fixed_role');assert.equal(result.constraints.role_pinned,true);
  }
  for(const patch of [{fork_turns:'all'},{fork_turns:undefined},{fork_turns:null},{fork_context:false}]){
    const e=event('codex');Object.assign(e.tool_input,patch);const result=run('codex',e,null);
    assert.equal(result.reason,'inherited_fork');assert.equal(result.constraints.fork_inherits,true);
  }
  for(const subagent_type of ['Explore','custom',undefined,null,'fork']){
    const e=event('claude');e.tool_input.subagent_type=subagent_type;const result=run('claude',e,null);
    assert.equal(result.status,'preserve');assert.equal(result.reason,subagent_type==='fork'?'inherited_fork':'fixed_role');
  }
});
test('bounded Claude JSON transport preserves native constraints; Codex strings are unsupported',()=>{
  const e=event('claude');e.tool_input=JSON.stringify(e.tool_input);assert.equal(run('claude',e).status,'eligible');
  for(const text of ['{bad','null','[]','1','"private"','x'.repeat(16385)])assert.equal(run('claude',{...e,tool_input:text}).status,'unknown');
  const pinned=event('claude');pinned.tool_input.model=null;pinned.tool_input=JSON.stringify(pinned.tool_input);
  assert.equal(run('claude',pinned,null).reason,'explicit_model');
  assert.equal(run('codex',{...event('codex'),tool_input:JSON.stringify(event('codex').tool_input)}).status,'unknown');
});
test('shape additions cannot smuggle values or self-attest through a layer',()=>{
  for(const patch of [{actual_model:'private'},{layers:[]},{environment:[]},{environment:null}])assert.equal(run('codex',undefined,{...context('codex'),...patch}).status,'unknown');
  const c=context('codex');c.layers[0].provenance_verified=true;assert.equal(run('codex',undefined,c).status,'unknown');
  assert.equal(resolveProvenance({client:'unknown',event:event('codex'),now}).status,'unknown');
  const inherited=Object.create({model:'inherited-value'});inherited.fork_turns='none';
  assert.equal(run('codex',{...event('codex'),tool_input:inherited}).status,'unknown');
});

test('Codex project layer outranks selected profile while either remains preserved',()=>{
  const c=context('codex');layer(c,'project').model='pinned';layer(c,'profile').model='pinned';
  assert.deepEqual(run('codex',undefined,c).fields.model,{state:'pinned',source:'project'});
});
test('resumed or already identified agents are never rewritten, regardless of marker value',()=>{
  for(const client of ['codex','claude'])for(const name of ['resume','resume_agent','agent_id'])for(const value of [false,null,'',undefined,'existing-agent']){
    const e=event(client);e.tool_input[name]=value;
    for(const c of [null,context(client)]){
      const result=run(client,e,c);assert.equal(result.status,'preserve');assert.equal(result.reason,'resumed_agent');
      assert.deepEqual(result.fields,{model:{state:'pinned',source:'resume'},effort:{state:'pinned',source:'resume'}});
      assert.equal(result.constraints.role_pinned,true);assert.equal(result.constraints.provenance_verified,false);
    }
  }
});

test('evidence cannot be replayed for another tool call or changed native input',()=>{
  for(const client of ['codex','claude']){
    const e=event(client),c=context(client,e),other={...e,tool_use_id:'different-call'};
    assert.equal(run(client,other,c).reason,'context_binding_mismatch');
    const changed=structuredClone(e);changed.tool_input[client==='codex'?'message':'prompt']='different current task';
    assert.equal(run(client,changed,c).reason,'context_binding_mismatch');
    for(const patch of [{tool_use_id:''},{tool_use_id:null},{tool_input_sha256:'bad'},{tool_input_sha256:null}]){
      assert.equal(run(client,e,{...c,...patch}).reason,'context_binding_mismatch');
    }
    const missingId=structuredClone(c);delete missingId.tool_use_id;assert.equal(run(client,e,missingId).reason,'context_binding_mismatch');
    const missingHash=structuredClone(c);delete missingHash.tool_input_sha256;assert.equal(run(client,e,missingHash).reason,'context_binding_mismatch');
  }
});
test('stable input digest ignores object key order and normalizes Claude JSON transport',()=>{
  for(const client of ['codex','claude']){
    const e=event(client);e.tool_input.extra={second:[1,{z:true,a:null}],first:'value'};
    const reordered={...e,tool_input:Object.fromEntries(Object.entries(e.tool_input).reverse())};
    reordered.tool_input.extra={first:'value',second:[1,{a:null,z:true}]};
    const original=digestToolInput({client,event:e});assert.match(original,/^[a-f0-9]{64}$/);
    assert.equal(digestToolInput({client,event:reordered}),original);
    assert.equal(run(client,reordered,context(client,e)).status,'eligible');
    if(client==='claude'){
      reordered.tool_input=JSON.stringify(reordered.tool_input);
      assert.equal(digestToolInput({client,event:reordered}),original);
      assert.equal(run(client,reordered,context(client,e)).status,'eligible');
    }
  }
});
test('invalid JSON values or cyclic input cannot produce a reusable digest',()=>{
  for(const bad of [undefined,NaN,Infinity,()=>{},Symbol('private'),new Date()]){
    const e=event('codex');e.tool_input.extra=bad;
    assert.equal(digestToolInput({client:'codex',event:e}),null);
    assert.equal(run('codex',e,context('codex')).reason,'context_binding_mismatch');
  }
  const cyclic=event('codex');cyclic.tool_input.extra=cyclic.tool_input;
  assert.equal(digestToolInput({client:'codex',event:cyclic}),null);
  const pinned=event('codex');pinned.tool_input.model=null;
  assert.equal(run('codex',pinned,{...context('codex'),tool_use_id:'different'}).reason,'explicit_model');
});
