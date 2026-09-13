import { TYPES, type Member, type Move } from './model.ts';
import { effectiveness } from './types.ts';
import { multiplier, SUPPORTED_ABILITIES } from './effects.ts';

// These moves change type/effectiveness or bypass normal immunities.
const SPECIAL_TYPES = new Set(['freeze-dry','flying-press','weather-ball','terrain-pulse','judgment','multi-attack','techno-blast','revelation-dance','tera-blast','terastar-storm','thousand-arrows','struggle']);
const TYPE_ABILITIES = new Set(['normalize','aerilate','pixilate','refrigerate','galvanize','liquid-voice','scrappy','minds-eye']);
export function attackEffect(move: Move, attacker: Member, defender: Member) {
  let value: number | null = null;
  let note: string | null = null;
  if (move.category === 'status') note = 'Estado';
  else if (!TYPES.includes(move.type) || SPECIAL_TYPES.has(move.id) || TYPE_ABILITIES.has(attacker.ability ?? '')) note = 'Efectividad especial sin calcular';
  else if (!move.power) note = 'Daño especial sin calcular';
  else {
    value = multiplier(move.type, defender, attacker);
    if (attacker.ability === 'tinted-lens' && value > 0 && value < 1) value *= 2;
    if (value !== effectiveness(move.type, defender.types)) note = 'Ajustado por habilidad';
  }
  return {id: move.id, label: move.label, type: move.type, value, note};
}
export function matchupWarnings(member: Member) {
  return member.ability && !SUPPORTED_ABILITIES.includes(member.ability)
    ? [`Habilidad no contemplada: ${member.abilities.find(a => a.id === member.ability)?.label ?? member.ability}.`] : [];
}
export function compareTeam(team: Member[], rival: Member) {
  return team.map(member => {
    const outgoing = member.moves.map(move => attackEffect(move, member, rival));
    const incoming = rival.moves.map(move => attackEffect(move, rival, member));
    return {pokemon:member.id,label:member.label,sprite:member.sprite,
      pros:outgoing.filter(m => m.value !== null && m.value > 1),
      cons:incoming.filter(m => m.value !== null && m.value > 1),
      outgoing,incoming,warnings:matchupWarnings(member)};
  });
}
export function defensiveTypes(member: Member) {
  // A pure type chart, independent of abilities; per-move cards apply known effects.
  return [4,2,1,0.5,0.25,0].map(value => ({value,types:TYPES.filter(type => effectiveness(type,member.types) === value)})).filter(group => group.types.length);
}
