export const TYPES = ['normal','fire','water','electric','grass','ice','fighting','poison','ground','flying','psychic','bug','rock','ghost','dragon','dark','steel','fairy'] as const;
export type Type = typeof TYPES[number];
export type Stats = { hp: number; attack: number; defense: number; 'special-attack': number; 'special-defense': number; speed: number };
export type Named = { id: string; label: string; aliases?: string[] };
export type Pokemon = Named & { types: Type[]; stats: Stats; sprite: string | null; abilities: (Named & { hidden: boolean })[] };
export type Move = Named & { type: Type; category: 'physical' | 'special' | 'status'; power: number | null; priority: number; accuracy: number | null; unsupported: boolean };
export type Member = Pokemon & { ability: string | null; item: string | null; itemLabel?: string | null; moves: Move[] };
export type Selection = { pokemon: string; ability: string | null; item: string | null; moves: string[] };
