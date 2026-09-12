import type { Member, Move, Type } from './model.ts';
import { effectiveness } from './types.ts';

export const SUPPORTED_ABILITIES = ['levitate','water-absorb','storm-drain','dry-skin','volt-absorb','lightning-rod','motor-drive','flash-fire','sap-sipper','thick-fat','wonder-guard','filter','solid-rock','prism-armor','adaptability','huge-power','pure-power','technician','tinted-lens','mold-breaker','teravolt','turboblaze','fur-coat','ice-scales'];
export const SUPPORTED_ITEMS = ['choice-band','choice-specs','choice-scarf','assault-vest','life-orb','expert-belt','muscle-band','wise-glasses'];
const IGNORE = ['mold-breaker','teravolt','turboblaze'];

export function multiplier(type: Type, defender: Member, attacker?: Member): number {
  let n = effectiveness(type, defender.types);
  const ability = IGNORE.includes(attacker?.ability ?? '') && defender.ability !== 'prism-armor' ? null : defender.ability;
  if (type === 'ground' && ability === 'levitate') return 0;
  if (type === 'water' && ['water-absorb','storm-drain','dry-skin'].includes(ability ?? '')) return 0;
  if (type === 'electric' && ['volt-absorb','lightning-rod','motor-drive'].includes(ability ?? '')) return 0;
  if (type === 'fire' && ability === 'flash-fire') return 0;
  if (type === 'grass' && ability === 'sap-sipper') return 0;
  if (ability === 'wonder-guard' && n <= 1) return 0;
  if (ability === 'thick-fat' && ['fire','ice'].includes(type)) n *= 0.5;
  if (ability === 'dry-skin' && type === 'fire') n *= 1.25;
  if (['filter','solid-rock','prism-armor'].includes(ability ?? '') && n > 1) n *= 0.75;
  return n;
}

export function speed(member: Member): number {
  return member.stats.speed * (member.item === 'choice-scarf' ? 1.5 : 1);
}

export function pressure(attacker: Member, defender: Member, move: Move): number | null {
  if (move.category === 'status' || !move.power || move.unsupported) return null;
  const physical = move.category === 'physical';
  let attack = attacker.stats[physical ? 'attack' : 'special-attack'];
  let defense = defender.stats[physical ? 'defense' : 'special-defense'];
  if (physical && ['huge-power','pure-power'].includes(attacker.ability ?? '')) attack *= 2;
  if (attacker.item === (physical ? 'choice-band' : 'choice-specs')) attack *= 1.5;
  if (!physical && defender.item === 'assault-vest') defense *= 1.5;
  if (!IGNORE.includes(attacker.ability ?? '')) {
    if (physical && defender.ability === 'fur-coat') defense *= 2;
    if (!physical && defender.ability === 'ice-scales') defense *= 2;
  }
  let power = move.power;
  if (attacker.ability === 'technician' && power <= 60) power *= 1.5;
  const stab = attacker.types.includes(move.type) ? attacker.ability === 'adaptability' ? 2 : 1.5 : 1;
  let effect = multiplier(move.type, defender, attacker);
  if (attacker.ability === 'tinted-lens' && effect > 0 && effect < 1) effect *= 2;
  const itemBoost = attacker.item === 'life-orb' ? 1.3
    : attacker.item === 'expert-belt' && effectiveness(move.type, defender.types) > 1 ? 1.2
    : attacker.item === (physical ? 'muscle-band' : 'wise-glasses') ? 1.1 : 1;
  // Relative pressure only. This is NOT the Pokémon damage formula or HP percentage.
  return power * attack / defense * stab * effect * itemBoost / defender.stats.hp;
}

export function warnings(member: Member): string[] {
  const out: string[] = [];
  if (member.ability && !SUPPORTED_ABILITIES.includes(member.ability)) out.push(`Habilidad no calculada: ${member.abilities.find(a => a.id === member.ability)?.label ?? member.ability}.`);
  if (member.item && !SUPPORTED_ITEMS.includes(member.item)) out.push(`Objeto no calculado: ${member.item}.`);
  if (member.item?.startsWith('choice-')) out.push('Objeto Elegido: se aplica la mejora, pero no se conoce el bloqueo de movimiento.');
  if (member.item === 'life-orb') out.push('Vidasfera: se aplica el daño extra, sin modelar el retroceso.');
  if (member.ability && SUPPORTED_ABILITIES.includes(member.ability)) out.push('Habilidad: solo efectos directos; sin acumulaciones ni activaciones previas.');
  for (const move of member.moves) {
    if (move.category === 'status') out.push(`${move.label}: estado; su utilidad no entra en el ranking.`);
    else if (!move.power || move.unsupported) out.push(`${move.label}: mecánica especial no calculada.`);
  }
  return out;
}
