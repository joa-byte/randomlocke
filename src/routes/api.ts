import { PokeClient, ApiError, localized, abilityDescription } from '../pokemon/client.ts';
import { coverage } from '../engine/index.ts';
import { compareTeam, defensiveTypes, matchupWarnings } from '../engine/matchups.ts';
import { TYPES, type Member, type Selection } from '../engine/model.ts';

const slug = (value: unknown): value is string => typeof value === 'string' && /^[a-z0-9-]{1,80}$/.test(value);
export function validateSelection(value: any, rival = false): Selection {
  if (!value || !slug(value.pokemon) || !Array.isArray(value.moves) || value.moves.length > 4 || !value.moves.every(slug)
    || new Set(value.moves).size !== value.moves.length || !(value.ability === null || slug(value.ability))
    || !(value.item === null || slug(value.item))) throw new ApiError('Pokémon, habilidad, objeto o movimientos inválidos.', 400);
  if (!rival && !value.ability) throw new ApiError('Elegí una habilidad para cada integrante.', 400);
  if (value.teraType != null && !TYPES.includes(value.teraType)) throw new ApiError('Teratipo inválido.',400);
  if (value.teraActive !== undefined && typeof value.teraActive !== 'boolean') throw new ApiError('Estado Tera inválido.',400);
  if (value.teraActive && !value.teraType) throw new ApiError('Elegí un teratipo antes de activar Tera.',400);
  return value;
}
export async function hydrate(client: PokeClient, value: Selection): Promise<Member> {
  const p = await client.pokemon(value.pokemon);
  let selectedAbility = p.abilities.find(a => a.id === value.ability);
  if (value.ability && !p.abilities.some(a => a.id === value.ability)) {
    try { const detail = await client.get(`ability/${value.ability}`); selectedAbility = {id:value.ability,label:localized(detail,'ability'),description:abilityDescription(detail),hidden:false}; }
    catch (error) { if (error instanceof ApiError && error.status === 404) throw new ApiError(`${p.label}: habilidad "${value.ability}" no encontrada en PokéAPI.`, 400); throw error; }
  }
  const itemLabel = value.item ? localized(await client.get(`item/${value.item}`), 'item') : null;
  return {...p, originalTypes:p.types, types:value.teraActive && value.teraType ? [value.teraType] : p.types, teraType:value.teraType ?? null, teraActive:value.teraActive ?? false, abilityLabel:selectedAbility?.label ?? null, abilityDescription:selectedAbility?.description ?? null, ability: value.ability, item: value.item, itemLabel, moves: await Promise.all(value.moves.map(m => client.move(m)))};
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
