import { TYPES, type Type } from './model.ts';

// Attacking type -> [super effective, resisted, immune]. Modern type chart.
const CHART: Record<Type, [string, string, string]> = {
  normal: ['', 'rock steel', 'ghost'],
  fire: ['grass ice bug steel', 'fire water rock dragon', ''],
  water: ['fire ground rock', 'water grass dragon', ''],
  electric: ['water flying', 'electric grass dragon', 'ground'],
  grass: ['water ground rock', 'fire grass poison flying bug dragon steel', ''],
  ice: ['grass ground flying dragon', 'fire water ice steel', ''],
  fighting: ['normal ice rock dark steel', 'poison flying psychic bug fairy', 'ghost'],
  poison: ['grass fairy', 'poison ground rock ghost', 'steel'],
  ground: ['fire electric poison rock steel', 'grass bug', 'flying'],
  flying: ['grass fighting bug', 'electric rock steel', ''],
  psychic: ['fighting poison', 'psychic steel', 'dark'],
  bug: ['grass psychic dark', 'fire fighting poison flying ghost steel fairy', ''],
  rock: ['fire ice flying bug', 'fighting ground steel', ''],
  ghost: ['psychic ghost', 'dark', 'normal'],
  dragon: ['dragon', 'steel', 'fairy'],
  dark: ['psychic ghost', 'fighting dark fairy', ''],
  steel: ['ice rock fairy', 'fire water electric steel', ''],
  fairy: ['fighting dragon dark', 'fire poison steel', '']
};
export function effectiveness(attack: Type, defense: Type[]): number {
  if (!TYPES.includes(attack) || !defense.length || defense.some(t => !TYPES.includes(t))) throw new Error('Tipo inválido');
  const [strong, weak, immune] = CHART[attack].map(s => s.split(' '));
  return defense.reduce((n, t) => n * (immune.includes(t) ? 0 : strong.includes(t) ? 2 : weak.includes(t) ? 0.5 : 1), 1);
}
