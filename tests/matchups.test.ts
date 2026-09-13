import test from 'node:test';
import assert from 'node:assert/strict';
import { compareTeam, defensiveTypes, attackEffect } from '../src/engine/matchups.ts';
import { mon, move } from './fixtures.ts';

test('comparison preserves team order, shows only known threats, filters pros and cons', () => {
  const a=mon('gyarados',['water','flying'],{moves:[move('ice'),move('water')]});
  const b=mon('gastrodon',['water','ground']);
  const rival=mon('kilowattrel',['electric','flying'],{moves:[move('electric')]});
  const rows=compareTeam([a,b],rival);
  assert.deepEqual(rows.map(r=>r.pokemon),['gyarados','gastrodon']);
  assert.equal(rows[0].pros[0].value,2);
  assert.equal(rows[0].cons[0].value,4);
  assert.equal(rows[0].outgoing.length,2);
  assert.equal(rows[1].cons.length,0);
  assert.equal(rows[1].incoming[0].value,0);
  assert.equal(compareTeam([a],{...rival,moves:[]})[0].incoming.length,0);
});
test('known abilities apply, without multiplying by power or STAB', () => {
  const a=mon('ground',['ground']);
  const d=mon('electric',['electric'],{ability:'levitate'});
  assert.equal(attackEffect(move('ground'),a,d).value,0);
  assert.equal(attackEffect(move('ground'),{...a,ability:'mold-breaker'},d).value,2);
  assert.equal(attackEffect(move('ground'),a,{...d,ability:null}).value,2);
});
test('multi-hit and conditional-power moves retain type effectiveness; unknown mechanics do not', () => {
  const a=mon('a',['normal']),d=mon('d',['grass']);
  assert.equal(attackEffect(move('flying','physical',55,{id:'acrobatics',unsupported:true}),a,d).value,2);
  assert.equal(attackEffect(move('fire','status',null),a,d).value,null);
  assert.equal(attackEffect(move('ice','special',70,{id:'freeze-dry',unsupported:true}),a,d).value,null);
});
test('defensive table accounts for dual typing and contains every type exactly once', () => {
  const groups=defensiveTypes(mon('g',['water','flying']));
  assert.ok(groups.find(g=>g.value===4)!.types.includes('electric'));
  assert.ok(groups.find(g=>g.value===0)!.types.includes('ground'));
  assert.equal(new Set(groups.flatMap(g=>g.types)).size,18);
});

test('physical/special stats and STAB are informational and separate from effectiveness', () => {
  const a=mon('a',['ground'],{stats:{hp:80,attack:125,defense:90,'special-attack':65,'special-defense':75,speed:81}});
  const d=mon('d',['electric'],{stats:{hp:80,attack:105,defense:70,'special-attack':120,'special-defense':100,speed:125}});
  const physical=attackEffect(move('ground','physical',100),a,d);
  assert.equal(physical.value,2); assert.equal(physical.stab,1.5);
  assert.deepEqual(physical.comparison,{attackLabel:'Atq.',defenseLabel:'Def.',attack:125,defense:70});
  const special=attackEffect(move('water','special',90),d,a);
  assert.equal(special.stab,1); assert.equal(special.comparison!.attack,120); assert.equal(special.comparison!.defense,75);
  assert.equal(attackEffect(move('ground'),{...a,ability:'adaptability'},d).stab,2);
  assert.equal(attackEffect(move('ground','status',null),a,d).stab,null);
  assert.equal(attackEffect(move('ground','physical',80,{id:'body-press'}),a,d).comparison,null);
  const card=compareTeam([a],d)[0]; assert.equal(card.speed,81); assert.equal(card.rivalSpeed,125);
});
