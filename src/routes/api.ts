import { PokeClient, ApiError, localized } from '../pokemon/client.ts';
import { coverage } from '../engine/index.ts';
import { compareTeam, defensiveTypes, matchupWarnings } from '../engine/matchups.ts';
import type { Member, Selection } from '../engine/model.ts';

const slug = (value: unknown): value is string => typeof value === 'string' && /^[a-z0-9-]{1,80}$/.test(value);
export function validateSelection(value: any, rival = false): Selection {
  if (!value || !slug(value.pokemon) || !Array.isArray(value.moves) || value.moves.length > 4 || !value.moves.every(slug)
    || new Set(value.moves).size !== value.moves.length || !(value.ability === null || slug(value.ability))
    || !(value.item === null || slug(value.item))) throw new ApiError('Pokémon, habilidad, objeto o movimientos inválidos.', 400);
  if (!rival && !value.ability) throw new ApiError('Elegí una habilidad para cada integrante.', 400);
  return value;
}
export async function hydrate(client: PokeClient, value: Selection): Promise<Member> {
  const p = await client.pokemon(value.pokemon);
  if (value.ability && !p.abilities.some(a => a.id === value.ability)) throw new ApiError(`La habilidad elegida no corresponde a ${p.label}.`, 400);
  const itemLabel = value.item ? localized(await client.get(`item/${value.item}`), 'item') : null;
  return {...p, ability: value.ability, item: value.item, itemLabel, moves: await Promise.all(value.moves.map(m => client.move(m)))};
}
export async function analyze(client: PokeClient, body: any) {
  if (!body || !Array.isArray(body.team) || body.team.length > 6) throw new ApiError('El equipo admite hasta seis Pokémon.', 400);
  const selections = body.team.map((s: unknown) => validateSelection(s));
  const rivalSelection = body.rival ? validateSelection(body.rival, true) : null;
  const team = await Promise.all(selections.map((s: Selection) => hydrate(client, s)));
  const rival = rivalSelection ? await hydrate(client, rivalSelection) : null;
  return {team: team.map(p => ({...p, warnings: matchupWarnings(p)})), rival, coverage: coverage(team), matchups: rival ? compareTeam(team, rival) : [],
    defensiveTypes: rival ? defensiveTypes(rival) : [],
    warnings: rival ? [...matchupWarnings(rival), ...(!rival.ability ? ['Habilidad rival desconocida: no se asumen inmunidades adicionales.'] : [])] : []};
}
