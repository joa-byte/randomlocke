import { TYPES, type Member, type Move } from './model.ts';
import { multiplier, pressure, speed, warnings } from './effects.ts';
const typeNames = {normal:'Normal',fire:'Fuego',water:'Agua',electric:'Eléctrico',grass:'Planta',ice:'Hielo',fighting:'Lucha',poison:'Veneno',ground:'Tierra',flying:'Volador',psychic:'Psíquico',bug:'Bicho',rock:'Roca',ghost:'Fantasma',dragon:'Dragón',dark:'Siniestro',steel:'Acero',fairy:'Hada'};

function evaluated(attacker: Member, defender: Member, moves: Move[]) {
  return moves.map(move => ({ move, value: pressure(attacker, defender, move) }))
    .filter((entry): entry is {move: Move; value: number} => entry.value !== null)
    .sort((a, b) => b.value - a.value);
}

export function rank(team: Member[], rival: Member) {
  const synthetic: Move[] = rival.types.flatMap(type => (['physical','special'] as const).map(category => ({
    id: `estimate-${type}-${category}`, label: `Estimación ${typeNames[type]} (${category === 'physical' ? 'físico' : 'especial'})`,
    type, category, power: 80, accuracy: 100, priority: 0, unsupported: false, effects: [], effectNote: null
  })));
  // Unknown slots retain a STAB baseline, but never pretend to reveal randomized coverage.
  const incomplete = rival.moves.length < 4;
  const threats = [...rival.moves, ...(incomplete ? synthetic : [])];
  return team.map((member, index) => {
    const incoming = evaluated(rival, member, threats)[0] ?? null;
    const outgoing = evaluated(member, rival, member.moves)[0] ?? null;
    const unknown = threats.some(m => m.category !== 'status' && (!m.power || m.unsupported));
    const danger = incoming?.value ?? (unknown ? null : 0);
    const reward = outgoing?.value ?? 0;
    // Reference: neutral 80-power STAB vs 80 HP, equally offensive/defensive stats = 1.5.
    const tier = danger === null ? 1 : danger <= 0.75 ? 0 : danger <= 2.25 ? 1 : 2;
    const order = !outgoing ? null : !incoming ? 'Sin ataque rival evaluable' :
      outgoing.move.priority !== incoming.move.priority ? outgoing.move.priority > incoming.move.priority ? 'Prioridad favorable' : 'Prioridad rival mayor' :
      speed(member) === speed(rival) ? 'Empate de velocidad base' : speed(member) > speed(rival) ? 'Más rápido por estadísticas base' : 'Más lento por estadísticas base';
    return { index, pokemon: member.id, label: member.label, sprite: member.sprite, types: member.types,
      danger, reward, tier, incoming, outgoing, order, estimated: incomplete, uncertain: unknown,
      warnings: warnings(member) };
  }).sort((a,b) => a.tier - b.tier || (a.danger ?? Infinity) - (b.danger ?? Infinity) || b.reward - a.reward || speed(team[b.index]) - speed(team[a.index]));
}

export function coverage(team: Member[]) {
  return TYPES.map(type => {
    const weak = team.filter(p => multiplier(type, p) > 1).map(p => p.label);
    const resistant = team.filter(p => multiplier(type, p) < 1).map(p => p.label);
    const covered = team.some(p => p.moves.some(m => m.category !== 'status' && !m.unsupported && !!m.power && multiplier(m.type, {
      ...p, types: [type], ability: null, item: null
    }, p) > 1));
    return { type, weak, resistant, covered };
  });
}
