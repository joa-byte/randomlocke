import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PokeClient } from '../src/pokemon/client.ts';
import { translated } from '../src/pokemon/locale.ts';
import { warnings } from '../src/engine/effects.ts';
import { rank } from '../src/engine/index.ts';
import { mon } from './fixtures.ts';

test('catalog translations are local, preserve canonical IDs and fall back safely', async () => {
  const dir = await mkdtemp(join(tmpdir(),'randomlocke-es-')); let calls = 0;
  const fake: typeof fetch = async () => {
    calls++;
    return new Response(JSON.stringify({results:[{name:'thunderbolt',url:'https://pokeapi.co/api/v2/move/85/'},{name:'ice-beam',url:'https://pokeapi.co/api/v2/move/58/'},{name:'new-move',url:'https://pokeapi.co/api/v2/move/999999/'}]}));
  };
  try {
    const catalog=await new PokeClient(fake,dir).catalog('move');
    assert.equal(catalog.find(m=>m.id==='thunderbolt')?.label,'Rayo');
    assert.match(catalog.find(m=>m.id==='ice-beam')!.label,/Rayo [Hh]ielo/);
    assert.equal(catalog.find(m=>m.id==='new-move')?.label,'New Move');
    assert.ok(catalog.find(m=>m.id==='thunderbolt')?.aliases?.includes('Thunderbolt'));
    assert.equal(calls,1,'Must not fetch hundreds of detail resources');
  } finally { await rm(dir,{recursive:true}); }
});
test('Spanish names also appear in estimates and item warnings', () => {
  assert.equal(translated('pokemon',25,'pikachu'),'Pikachu');
  const rival=mon('rival',['electric']);
  const member=mon('member',['water'],{item:'leftovers',itemLabel:'Restos'});
  assert.match(rank([member],rival)[0].incoming!.move.label,/Eléctrico/);
  assert.ok(warnings(member).some(w=>w.includes('Restos')));
});
test('duplicate translated names remain separately selectable', async () => {
  const dir=await mkdtemp(join(tmpdir(),'randomlocke-es-duplicates-'));
  const fake:typeof fetch=async()=>new Response(JSON.stringify({results:[{name:'breakneck-blitz--physical',url:'https://pokeapi.co/api/v2/move/622/'},{name:'breakneck-blitz--special',url:'https://pokeapi.co/api/v2/move/623/'}]}));
  try {
    const rows=await new PokeClient(fake,dir).catalog('move');
    assert.deepEqual(rows.map(r=>r.label),['Carrera Arrolladora · #622','Carrera Arrolladora · #623']);
    assert.deepEqual(rows.map(r=>r.id),['breakneck-blitz--physical','breakneck-blitz--special']);
  } finally { await rm(dir,{recursive:true}); }
});
