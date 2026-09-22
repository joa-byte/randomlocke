import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { TYPES, type Named, type Pokemon, type Move, type Type, type Stats } from '../engine/model.ts';
import { translated } from './locale.ts';

type Resource = Record<string, any>;

const statLabels: Record<string,string> = {
  attack:'Ataque', defense:'Defensa', 'special-attack':'Ataque Especial',
  'special-defense':'Defensa Especial', speed:'Velocidad', accuracy:'Precisión', evasion:'Evasión'
};
const ailmentLabels: Record<string,string> = {
  burn:'quemadura', paralysis:'parálisis', poison:'envenenamiento',
  'badly-poison':'envenenamiento grave', freeze:'congelación', sleep:'sueño',
  confusion:'confusión', infatuation:'enamoramiento', trap:'atrapamiento',
  nightmare:'pesadilla'
};
const chanceSuffix = (chance: number | null | undefined) => chance && chance < 100 ? ` (${chance}%)` : '';
function moveEffects(m: Resource): string[] {
  const effects: string[] = [];
  if (m.priority) effects.push(`Prioridad ${m.priority > 0 ? '+' : ''}${m.priority}`);
  const ailment = m.meta?.ailment?.name;
  if (ailment && ailment !== 'none') {
    const chance = m.meta?.ailment_chance || m.effect_chance;
    const label = ailmentLabels[ailment] ?? title(ailment).toLowerCase();
    effects.push(chance && chance < 100 ? `Puede aplicar ${label} (${chance}%)` : `Aplica ${label}`);
  }
  for (const change of m.stat_changes ?? []) {
    const amount = Number(change.change ?? 0);
    if (!amount) continue;
    const label = statLabels[change.stat?.name] ?? title(change.stat?.name ?? 'estadística');
    const chance = m.meta?.stat_chance || m.effect_chance;
    effects.push(`${label} ${amount > 0 ? '+' : ''}${amount} nivel${Math.abs(amount) === 1 ? '' : 'es'}${chanceSuffix(chance)}`);
  }
  const flinch = Number(m.meta?.flinch_chance ?? 0);
  if (flinch > 0) effects.push(`Puede causar retroceso${chanceSuffix(flinch)}`);
  const drain = Number(m.meta?.drain ?? 0);
  if (drain > 0) effects.push(`Recupera ${drain}% del daño causado`);
  if (drain < 0) effects.push(`Retroceso: ${Math.abs(drain)}% del daño causado`);
  const healing = Number(m.meta?.healing ?? 0);
  if (healing > 0) effects.push(`Recupera ${healing}% de los PS máximos`);
  const critRate = Number(m.meta?.crit_rate ?? 0);
  if (critRate > 0) effects.push(`Crítico +${critRate} nivel${critRate === 1 ? '' : 'es'}`);
  const minHits = m.meta?.min_hits, maxHits = m.meta?.max_hits;
  if (minHits && maxHits && maxHits > 1) effects.push(minHits === maxHits ? `Golpea ${minHits} veces` : `Golpea ${minHits}–${maxHits} veces`);
  const minTurns = m.meta?.min_turns, maxTurns = m.meta?.max_turns;
  if (minTurns && maxTurns && maxTurns > 1) effects.push(minTurns === maxTurns ? `Dura ${minTurns} turnos` : `Dura ${minTurns}–${maxTurns} turnos`);
  return [...new Set(effects)];
}
function localizedEffect(m: Resource): string | null {
  const entry = m.effect_entries?.find((e: Resource) => e.language?.name === 'es');
  if (!entry?.short_effect) return null;
  return String(entry.short_effect)
    .replace(/\$effect_chance/g, String(m.effect_chance ?? ''))
    .replace(/\[([^\]]+)\]\{[^}]+\}/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}
export class ApiError extends Error {
  status: number;
  constructor(message: string, status = 502) { super(message); this.status = status; }
}
export class PokeClient {
  cache = new Map<string, Promise<Resource>>();
  fetcher: typeof fetch;
  cacheDir: string;
  constructor(fetcher: typeof fetch = fetch, cacheDir = resolve('.cache/pokeapi')) { this.fetcher = fetcher; this.cacheDir = cacheDir; }
  async get(path: string): Promise<Resource> {
    if (!/^(pokemon|move|ability|item)(\/[a-z0-9-]+)?$/.test(path)) throw new ApiError('Recurso inválido', 400);
    if (this.cache.has(path)) return this.cache.get(path)!;
    const pending = this.load(path).catch(error => { this.cache.delete(path); throw error; });
    this.cache.set(path, pending);
    return pending;
  }
  private async load(path: string): Promise<Resource> {
    const file = resolve(this.cacheDir, `${createHash('sha256').update(path).digest('hex')}.json`);
    try {
      const saved = JSON.parse(await readFile(file, 'utf8'));
      if (Date.now() - saved.time < 30 * 86400_000) return saved.data;
    } catch { /* First request or invalid cache: fetch again. */ }
    try {
      const suffix = path.includes('/') ? '/' : '?limit=10000';
      const response = await this.fetcher(`https://pokeapi.co/api/v2/${path}${suffix}`, {signal: AbortSignal.timeout(15000)});
      if (!response.ok) throw new ApiError(response.status === 404 ? 'No encontrado en PokéAPI' : 'PokéAPI no está disponible', response.status === 404 ? 404 : 502);
      const data = await response.json() as Resource;
      try { await mkdir(this.cacheDir, {recursive: true}); await writeFile(file, JSON.stringify({time: Date.now(), data})); } catch { /* Read-only disk: memory cache still works. */ }
      return data;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError('No se pudo conectar con PokéAPI. Reintentá en unos segundos.');
    }
  }
  async catalog(kind: string): Promise<Named[]> {
    if (!['pokemon','move','item'].includes(kind)) throw new ApiError('Catálogo inválido', 400);
    const data = await this.get(kind);
    const entries: Named[] = data.results.map((r: Resource) => ({id: r.name,
      label: translated(kind as 'pokemon'|'move'|'item', r.url?.match(/\/(\d+)\/?$/)?.[1], title(r.name)),
      aliases: [title(r.name), r.name]}));
    const counts = new Map<string, number>();
    for (const entry of entries) counts.set(entry.label, (counts.get(entry.label) ?? 0) + 1);
    for (let i=0; i<entries.length; i++) {
      if (counts.get(entries[i].label)! > 1) entries[i].label += ` · #${data.results[i].url?.match(/\/(\d+)\/?$/)?.[1] ?? entries[i].id}`;
    }
    return entries.sort((a,b) => a.label.localeCompare(b.label, 'es'));
  }
  async pokemon(id: string): Promise<Pokemon> {
    const p = await this.get(`pokemon/${id}`);
    return { id: p.name, label: translated('pokemon', p.id, title(p.name)), types: p.types.map((t: Resource) => t.type.name),
      stats: Object.fromEntries(p.stats.map((s: Resource) => [s.stat.name, s.base_stat])) as Stats,
      sprite: p.sprites.front_default ?? null,
      abilities: await Promise.all(p.abilities.map(async (a: Resource) => {
        const detail = await this.get(`ability/${a.ability.name}`);
        return {id: a.ability.name, label: localized(detail, 'ability'), hidden: a.is_hidden};
      })) };
  }
  async move(id: string): Promise<Move> {
    const m = await this.get(`move/${id}`);
    // Exclude mechanics where generic power * attack / defense is misleading.
    const exceptions = ['psyshock','psystrike','secret-sword','foul-play','body-press','flying-press','freeze-dry','weather-ball','terrain-pulse','judgment','multi-attack','techno-blast','revelation-dance','photon-geyser','light-that-burns-the-sky','shell-side-arm','tera-blast','terastar-storm','acrobatics','facade','hex','venoshock','brine','revenge','avalanche','payback','pursuit','assurance','retaliate','stomping-tantrum','lash-out','bolt-beak','fishious-rend','electro-ball','gyro-ball','eruption','water-spout','dragon-energy','flail','reversal','stored-power','power-trip','rage-fist','last-respects','knock-off','expanding-force','rising-voltage','grassy-glide','focus-punch','sucker-punch','beak-blast','shell-trap','future-sight','doom-desire'];
    const special = exceptions.includes(m.name) || m.meta?.min_hits > 1 || m.meta?.min_turns > 1;
    const effects = moveEffects(m);
    const metaCategory = m.meta?.category?.name;
    const effectNote = (special || (effects.length === 0 && (m.damage_class.name === 'status' || (metaCategory && metaCategory !== 'damage')))) ? localizedEffect(m) : null;
    return {id: m.name, label: localized(m, 'move'), type: m.type.name as Type, category: m.damage_class.name,
      power: m.power, priority: m.priority, accuracy: m.accuracy, effects, effectNote,
      unsupported: special || !TYPES.includes(m.type.name)};
  }
}
export function title(value: string) { return value.replaceAll('-', ' ').replace(/\b\w/g, c => c.toUpperCase()); }
export function localized(data: Resource, kind: 'move'|'ability'|'item'): string { return data.names?.find((n: Resource) => n.language.name === 'es')?.name ?? translated(kind, data.id, title(data.name)); }
