import test from 'node:test';
import assert from 'node:assert/strict';
import { TYPES } from '../src/engine/model.ts';
import { effectiveness } from '../src/engine/types.ts';
import { pressure, multiplier, speed, warnings } from '../src/engine/effects.ts';
import { rank, coverage } from '../src/engine/index.ts';
import { mon, move } from './fixtures.ts';

test('18-type chart: all 324 combinations, double weaknesses and immunities', () => {
  for (const a of TYPES) for (const d of TYPES) assert.ok([0,.5,1,2].includes(effectiveness(a,[d])));
  assert.equal(effectiveness('electric',['water','flying']),4);
  assert.equal(effectiveness('electric',['water','ground']),0);
  assert.equal(effectiveness('fire',['water','dragon']),.25);
  assert.equal(effectiveness('dragon',['fairy']),0);
  assert.equal(effectiveness('ghost',['steel']),1);
  assert.equal(effectiveness('dark',['steel']),1);
});
test('defensive ability immunity, Mold Breaker and non-bypassable Prism Armor', () => {
  const floating = mon('floating',['electric'],{ability:'levitate'});
  assert.equal(multiplier('ground',floating),0);
  assert.equal(multiplier('ground',floating,mon('breaker',['ground'],{ability:'mold-breaker'})),2);
  assert.equal(multiplier('water',mon('absorb',['rock'],{ability:'water-absorb'})),0);
  assert.equal(multiplier('ground',mon('prism',['electric'],{ability:'prism-armor'}),mon('breaker',['ground'],{ability:'mold-breaker'})),1.5);
});
test('PS, correct offense and correct defense contribute to relative pressure', () => {
  const attacker = mon('mixed',['normal']);
  const wall = mon('physical-wall',['normal'],{stats:{hp:100,attack:80,defense:200,'special-attack':80,'special-defense':40,speed:80}});
  assert.ok(pressure(attacker,wall,move('normal','special'))! > pressure(attacker,wall,move('normal','physical'))! * 4);
  const healthy = {...wall, stats:{...wall.stats,hp:200}};
  assert.equal(pressure(attacker,healthy,move('normal')),pressure(attacker,wall,move('normal'))! / 2);
  const special = {...attacker,stats:{...attacker.stats,'special-attack':160}};
  assert.equal(pressure(special,wall,move('normal')),pressure(attacker,wall,move('normal'))! * 2);
});
test('STAB, Adaptability, power and Choice Specs', () => {
  const a = mon('fire',['fire']), d = mon('target',['normal']);
  assert.equal(pressure(a,d,move('fire')),1.5);
  assert.equal(pressure({...a,ability:'adaptability'},d,move('fire')),2);
  assert.equal(pressure({...a,item:'choice-specs'},d,move('fire')),2.25);
  assert.equal(pressure(a,d,move('fire','special',40)),.75);
});
test('Thick Fat, Fur Coat, Ice Scales, Assault Vest, offensive abilities and items', () => {
  const a = mon('normal',['normal']), d = mon('normal',['normal']);
  assert.equal(pressure(a,{...d,ability:'thick-fat'},move('ice')),.5);
  assert.equal(pressure(a,{...d,ability:'fur-coat'},move('normal','physical')),.75);
  assert.equal(pressure(a,{...d,ability:'ice-scales'},move('normal')), .75);
  assert.equal(pressure(a,{...d,item:'assault-vest'},move('normal')),1);
  assert.equal(pressure({...a,ability:'huge-power'},d,move('normal','physical')),3);
  assert.equal(pressure({...a,ability:'technician'},d,move('normal','physical',40)),1.125);
  assert.equal(pressure({...a,item:'life-orb'},d,move('normal')),1.95);
  assert.equal(pressure({...a,ability:'tinted-lens'},mon('rock',['rock']),move('normal')),1.5);
  assert.equal(speed({...a,item:'choice-scarf'}),120);
});
test('revealing Ice coverage replaces the preferred safe switch', () => {
  const grass = mon('grass',['grass']); const ground = mon('ground',['ground']);
  const rival = mon('water',['water'],{moves:[move('water')]});
  assert.equal(rank([grass,ground],rival)[0].pokemon,'grass');
  const water = mon('water-wall',['water'],{stats:{...grass.stats,'special-defense':70}});
  assert.equal(rank([grass,water],rival)[0].pokemon,'grass');
  assert.equal(rank([grass,water],{...rival,moves:[move('water'),move('ice','special',120)]})[0].pokemon,'water-wall');
});
test('unrevealed slots retain baseline; all four known slots remove it', () => {
  const rival = mon('fire',['fire'],{moves:[move('normal','status',null)]});
  const target = mon('grass',['grass']);
  assert.equal(rank([target],rival)[0].estimated,true);
  assert.ok(rank([target],rival)[0].danger! > 0);
  const four = {...rival,moves:Array.from({length:4},(_,i)=>move('normal','status',null,{id:`status-${i}`}))};
  assert.equal(rank([target],four)[0].estimated,false);
  assert.equal(rank([target],four)[0].danger,0);
});
test('status and special mechanics are not damaging moves; unknown threats stay explicit', () => {
  const p = mon('normal',['normal']);
  assert.equal(pressure(p,p,move('normal','status',null)),null);
  assert.equal(pressure(p,p,move('normal','physical',80,{unsupported:true})),null);
  const r = rank([p],{...p,moves:Array.from({length:4},(_,i)=>move('normal','physical',null,{id:`unknown-${i}`}))})[0];
  assert.equal(r.danger,null); assert.equal(r.uncertain,true); assert.equal(r.tier,1);
});
test('risk colors use fixed thresholds; no forced winner green', () => {
  const team = [mon('ice-a',['ice']),mon('ice-b',['ice'])];
  assert.ok(rank(team,mon('fire',['fire'])).every(r => r.tier === 2));
});
test('coverage includes attacking moves and defensive ability immunities', () => {
  const p = mon('water',['water'],{ability:'volt-absorb',moves:[move('ice')]});
  const c = coverage([p]);
  assert.deepEqual(c.find(t => t.type === 'electric')?.resistant,['water']);
  assert.equal(c.find(t => t.type === 'dragon')?.covered,true);
  assert.equal(c.find(t => t.type === 'water')?.covered,false);
  assert.deepEqual(coverage([p,p]).find(t => t.type === 'grass')?.weak,['water','water']);
});
test('priority is reported separately from base speed, without treating switch as attack', () => {
  const a = mon('slow',['normal'],{stats:{hp:80,attack:80,defense:80,'special-attack':80,'special-defense':80,speed:10},moves:[move('normal','physical',40,{priority:1})]});
  const b = mon('fast',['normal'],{moves:[move('normal')]});
  assert.equal(rank([a],b)[0].order,'Prioridad favorable');
});
test('unsupported abilities, items, and choice locking are visible', () => {
  assert.ok(warnings(mon('test',['normal'],{ability:'intimidate',item:'leftovers'})).some(w=>w.includes('no calculada')));
  assert.ok(warnings(mon('test',['normal'],{item:'choice-band'})).some(w=>w.includes('bloqueo')));
});
