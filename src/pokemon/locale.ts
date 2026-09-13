import { readFileSync } from 'node:fs';
type Kind = 'pokemon' | 'move' | 'item' | 'ability';
const names = JSON.parse(readFileSync(new URL('./es.json', import.meta.url), 'utf8')) as Record<Kind, Record<string, string>>;
export function translated(kind: Kind, id: string | number | undefined, fallback: string): string {
  return names[kind]?.[String(id)] ?? fallback;
}
