import type { Member, Move, Type } from '../src/engine/model.ts';
export function mon(id: string, types: Type[], overrides: Partial<Member> = {}): Member {
  return {id,label:id,types,ability:null,item:null,sprite:null,abilities:[],stats:{hp:80,attack:80,defense:80,'special-attack':80,'special-defense':80,speed:80},moves:[],...overrides};
}
export function move(type: Type, category: 'physical'|'special'|'status' = 'special', power: number|null = 80, overrides: Partial<Move> = {}): Move {
  return {id:type,label:type,type,category,power,priority:0,accuracy:100,unsupported:false,...overrides};
}
