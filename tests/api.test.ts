import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeServer } from '../src/server.ts';
import { PokeClient } from '../src/pokemon/client.ts';
import { validateSelection, hydrate } from '../src/routes/api.ts';

const pikachu = {name:'pikachu',types:[{type:{name:'electric'}}],stats:['hp','attack','defense','special-attack','special-defense','speed'].map(name=>({stat:{name},base_stat:80})),sprites:{front_default:null},abilities:[{ability:{name:'static'},is_hidden:false}]};
function upstream() {
  let requests = 0;
  const fetcher: typeof fetch = async input => {
    requests++;
    const path = new URL(String(input)).pathname;
    const data = path.endsWith('/pokemon/pikachu/') ? pikachu : path.endsWith('/ability/static/') ? {name:'static',names:[{language:{name:'es'},name:'Electricidad estática'}]} : path.endsWith('/move/thunderbolt/') ? {
      name:'thunderbolt',names:[{language:{name:'es'},name:'Rayo'}],type:{name:'electric'},damage_class:{name:'special'},power:90,priority:0,accuracy:100,effect_chance:10,
      meta:{ailment:{name:'paralysis'},ailment_chance:10,stat_chance:0,flinch_chance:0,drain:0,healing:0,crit_rate:0,min_hits:null,max_hits:null,min_turns:null,max_turns:null},
      stat_changes:[]
    } : path.endsWith('/move/quick-attack/') ? {
      name:'quick-attack',names:[{language:{name:'es'},name:'Ataque Rápido'}],type:{name:'normal'},damage_class:{name:'physical'},power:40,priority:1,accuracy:100,
      meta:{ailment:{name:'none'},ailment_chance:0,stat_chance:0,flinch_chance:0,drain:0,healing:0,crit_rate:0,min_hits:null,max_hits:null,min_turns:null,max_turns:null},stat_changes:[]
    } : path.endsWith('/move/growl/') ? {
      name:'growl',names:[{language:{name:'es'},name:'Gruñido'}],type:{name:'normal'},damage_class:{name:'status'},power:null,priority:0,accuracy:100,effect_chance:null,
      meta:{ailment:{name:'none'},ailment_chance:0,stat_chance:0,flinch_chance:0,drain:0,healing:0,crit_rate:0,min_hits:null,max_hits:null,min_turns:null,max_turns:null},
      stat_changes:[{change:-1,stat:{name:'attack'}}]
    } : null;
    return new Response(JSON.stringify(data ?? {}),{status:data ? 200 : 404});
  };
  return {fetcher, count:()=>requests};
}
test('API validates team, payload, slugs, abilities and duplicate moves', async () => {
  const valid = {pokemon:'pikachu',ability:'static',item:null,moves:['thunderbolt']};
  assert.deepEqual(validateSelection(valid),valid);
  for (const bad of [{...valid,pokemon:'../../etc/passwd'}, {...valid,moves:['thunderbolt','thunderbolt']},{...valid,ability:null},{...valid,moves:new Array(5).fill('x')}]) assert.throws(()=>validateSelection(bad));
  const dir = await mkdtemp(join(tmpdir(),'randomlocke-api-'));
  const mock = upstream(); const client = new PokeClient(mock.fetcher,dir);
  try {
    await assert.rejects(hydrate(client,{...valid,ability:'levitate'}),/no corresponde/);
    const p = await hydrate(client,valid); assert.equal(p.moves[0].label,'Rayo'); assert.equal(p.stats.attack,80);
    assert.deepEqual(p.moves[0].effects,['Puede aplicar parálisis (10%)']);
    assert.deepEqual((await client.move('quick-attack')).effects,['Prioridad +1']);
    assert.deepEqual((await client.move('growl')).effects,['Ataque -1 nivel']);
  } finally { await rm(dir,{recursive:true}); }
});
test('HTTP integration: analysis, validation, upstream failure and safe static routing', async () => {
  const dir = await mkdtemp(join(tmpdir(),'randomlocke-http-'));
  const mock = upstream(); const server = makeServer(new PokeClient(mock.fetcher,dir));
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  const address = server.address() as {port:number}; const base = `http://127.0.0.1:${address.port}`;
  const post = (data: unknown) => fetch(`${base}/api/analyze`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
  try {
    assert.equal((await fetch(base)).status,200);
    assert.equal((await fetch(`${base}/package.json`)).status,404);
    assert.equal((await post({team:new Array(7).fill({})})).status,400);
    assert.equal((await post({team:'bad'})).status,400);
    assert.equal((await fetch(`${base}/api/pokemon/not-real`)).status,404);
    const p = {pokemon:'pikachu',ability:'static',item:null,moves:['thunderbolt']};
    const response = await post({team:[p],rival:{...p,ability:null,moves:[]}});
    assert.equal(response.status,200);
    const data = await response.json(); assert.equal(data.matchups.length,1); assert.equal(data.coverage.length,18);
    assert.equal(data.matchups[0].incoming.length,0);
    assert.equal(data.ranking,undefined);
    assert.ok(data.warnings.some((w:string)=>w.startsWith('Habilidad rival desconocida')));
    assert.equal((await fetch(`${base}/api/analyze`,{method:'POST',headers:{'Content-Type':'application/json'},body:'{'})).status,400);
    assert.equal((await fetch(`${base}/api/analyze`,{method:'POST',headers:{'Content-Type':'application/json'},body:'x'.repeat(17000)})).status,413);
  } finally { server.closeAllConnections(); await new Promise<void>(resolve=>server.close(()=>resolve())); await rm(dir,{recursive:true}); }
});
test('cache coalesces concurrent requests, persists on disk and does not retain failures', async () => {
  const dir = await mkdtemp(join(tmpdir(),'randomlocke-cache-')); const mock = upstream();
  try {
    const client = new PokeClient(mock.fetcher,dir);
    await Promise.all([client.get('pokemon/pikachu'),client.get('pokemon/pikachu')]); assert.equal(mock.count(),1);
    await new PokeClient(mock.fetcher,dir).get('pokemon/pikachu'); assert.equal(mock.count(),1);
    await assert.rejects(client.get('pokemon/missing')); await assert.rejects(client.get('pokemon/missing')); assert.equal(mock.count(),3);
  } finally { await rm(dir,{recursive:true}); }
});
