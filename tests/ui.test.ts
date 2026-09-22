import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import { makeServer } from '../src/server.ts';
import { PokeClient, ApiError } from '../src/pokemon/client.ts';
import type { Pokemon, Move, Named } from '../src/engine/model.ts';
import { mon, move } from './fixtures.ts';

const species: Record<string,Pokemon> = {
  'deoxys-attack': {...mon('deoxys-attack',['psychic']),label:'Deoxys (Forma Ataque)',abilities:[{id:'pressure',label:'Presión',hidden:false}]},
  gyarados: {...mon('gyarados',['water','flying']),label:'Gyarados',abilities:[{id:'intimidate',label:'Intimidación',hidden:false},{id:'moxie',label:'Autoestima',hidden:true}]},
  gastrodon: {...mon('gastrodon',['water','ground']),label:'Gastrodon',abilities:[{id:'storm-drain',label:'Colector',hidden:false}]},
  jolteon: {...mon('jolteon',['electric']),label:'Jolteon',abilities:[{id:'volt-absorb',label:'Absorbe electricidad',hidden:false}]}
};
const moves: Record<string,Move> = {
  surf: move('water','special',90,{id:'surf',label:'Surf'}),
  earthquake: move('ground','physical',100,{id:'earthquake',label:'Terremoto'}),
  thunderbolt: move('electric','special',90,{id:'thunderbolt',label:'Rayo',effects:['Puede aplicar parálisis (10%)']}),
  'ice-beam': move('ice','special',90,{id:'ice-beam',label:'Rayo hielo',effects:['Puede aplicar congelación (10%)']})
};
class FakeClient extends PokeClient {
  override async catalog(kind: string): Promise<Named[]> {
    return kind === 'pokemon' ? Object.values(species).map(p=>({id:p.id,label:p.label}))
      : kind === 'move' ? Object.values(moves).map(m=>({id:m.id,label:m.label,aliases:[m.id]})) : [{id:'choice-band',label:'Cinta Elección',aliases:['Choice Band']},{id:'choice-scarf',label:'Pañuelo Elección',aliases:['Choice Scarf']}];
  }
  override async pokemon(id: string) { if (!species[id]) throw new ApiError('No encontrado en PokéAPI',404); return species[id]; }
  override async move(id: string) { if (!moves[id]) throw new ApiError('Movimiento inexistente',404); return moves[id]; }
  override async get(path: string) { if (path === 'item/choice-band') return {name:'choice-band',names:[{language:{name:'es'},name:'Cinta Elección'}]}; if (path === 'item/choice-scarf') return {name:'choice-scarf',names:[{language:{name:'es'},name:'Pañuelo Elección'}]}; throw new ApiError('Objeto inexistente',404); }
}
const html = await readFile(new URL('../public/index.html',import.meta.url),'utf8');
const js = await readFile(new URL('../public/app.js',import.meta.url),'utf8');
async function until(predicate:()=>boolean, message: string) {
  const deadline = Date.now() + 5000;
  while (!predicate()) { if (Date.now() > deadline) throw new Error(message); await new Promise(r=>setTimeout(r,5)); }
}
test('DOM + HTTP: create/edit team, reveal rival moves, errors, persistence and removal', async () => {
  const server = makeServer(new FakeClient());
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base = `http://127.0.0.1:${(server.address() as {port:number}).port}`;
  let dom: JSDOM | null = null;
  async function page(saved?: string) {
    const view = new JSDOM(html,{url:base,runScripts:'outside-only'});
    const w = view.window;
    // jsdom is a DOM unit environment: supply networking and native-dialog behavior.
    w.fetch = (input: string, init: RequestInit) => fetch(new URL(input,base),init);
    w.AbortSignal = AbortSignal;
    w.HTMLDialogElement.prototype.showModal = function() { this.setAttribute('open',''); };
    w.HTMLDialogElement.prototype.close = function() { this.removeAttribute('open'); };
    if (saved) w.localStorage.setItem('randomlocke.team.v1',saved);
    await w.eval(`(async () => { ${js}\n })()`);
    return view;
  }
  try {
    dom = await page();
    let d = dom.window.document;
    const click = (selector: string) => (d.querySelector(selector) as HTMLButtonElement).click();
    const input = (selector: string, value: string) => {
      const field = d.querySelector(selector) as HTMLInputElement;
      field.value = value;
      field.dispatchEvent(new dom!.window.Event('input',{bubbles:true}));
      field.dispatchEvent(new dom!.window.Event('change',{bubbles:true}));
    };
    const ready = () => until(()=>!(d.querySelector('#save') as HTMLButtonElement).disabled,'Editor did not load');
    const save = async () => { click('#save'); await until(()=>!d.querySelector('#editor')?.hasAttribute('open'),'Editor failed to save: '+d.querySelector('#form-error')?.textContent); };
    assert.match(d.querySelector('#team')!.textContent!,/Agregá hasta seis/);
    click('#import-team');
    input('#showdown-paste', `serpiente (Gyarados) (M) @ Choice Band
Ability: Intimidate
Level: 50
Tera Type: Water
EVs: 252 Atk / 4 Def / 252 Spe
Adamant Nature
- Surf
- Ice Beam

barro (Gastrodon) @ Choice Scarf
Ability: Storm Drain
Level: 50
Tera Type: Ground
- Earthquake`);
    click('#confirm-import');
    await until(()=>!d.querySelector('#team-importer')?.hasAttribute('open'),'Showdown import failed: '+d.querySelector('#import-error')?.textContent);
    assert.equal(d.querySelector('#count')!.textContent,'2 / 6');
    assert.match(d.querySelector('#team')!.textContent!,/Gyarados/);
    assert.match(d.querySelector('#team')!.textContent!,/Gastrodon/);
    assert.match(d.querySelector('#team')!.textContent!,/Cinta Elección/);
    assert.match(d.querySelector('#team')!.textContent!,/Pañuelo Elección/);
    assert.deepEqual(JSON.parse(dom.window.localStorage.getItem('randomlocke.team.v1')!).team.map((p:{pokemon:string})=>p.pokemon),['gyarados','gastrodon']);
    click('[data-remove="1"]'); await until(()=>d.querySelector('#count')!.textContent === '1 / 6','Imported removal failed');
    click('[data-remove="0"]'); await until(()=>d.querySelector('#count')!.textContent === '0 / 6','Imported cleanup failed');
    const moveOptions = [...d.querySelectorAll<HTMLOptionElement>('#move-list option')].map(o=>o.value);
    const pokemonOptions = [...d.querySelectorAll<HTMLOptionElement>('#pokemon-list option')].map(o=>o.value);
    assert.ok(moveOptions.includes('Terremoto'));
    assert.ok(moveOptions.includes('Rayo'));
    assert.ok(!moveOptions.includes('thunderbolt'));
    assert.ok(pokemonOptions.includes('Deoxys (Forma Ataque)'));
    assert.ok(!pokemonOptions.includes('deoxys-attack'));
    click('#add'); input('#pokemon-input','Gyarados'); await ready();
    assert.match(d.querySelector('#ability')!.textContent!,/Autoestima \(oculta\)/);
    input('#move-0','surf'); input('#item-input','Choice Band'); await save();
    assert.equal(d.querySelector('#count')!.textContent,'1 / 6');
    assert.match(d.querySelector('#team')!.textContent!,/Surf/);
    assert.match(d.querySelector('#team')!.textContent!,/Cinta Elección/);
    click('#add'); input('#pokemon-input','Gastrodon'); await ready(); input('#move-0','Terremoto'); input('#item-input','Panuelo Eleccion'); await save();
    assert.match(d.querySelector('#team')!.textContent!,/Pañuelo Elección/);
    assert.equal((d.querySelector('#choose-rival') as HTMLButtonElement).disabled,true);
    click('#import-enemy-team');
    input('#showdown-paste', `electrico (Jolteon) @ Choice Scarf
Ability: Volt Absorb
- Thunderbolt

serpiente (Gyarados) @ Choice Band
Ability: Intimidate
- Surf`);
    click('#confirm-import');
    await until(()=>!d.querySelector('#team-importer')?.hasAttribute('open'),'Enemy import failed: '+d.querySelector('#import-error')?.textContent);
    assert.equal(d.querySelector('#enemy-count')!.textContent,'2 / 6');
    assert.equal(d.querySelectorAll('[data-enemy-index]').length,2);
    assert.match(d.querySelector('[data-enemy-index="0"]')!.textContent!,/Puede aplicar parálisis \(10%\)/);
    assert.equal((d.querySelector('#choose-rival') as HTMLButtonElement).disabled,true);
    click('[data-enemy-index="0"]');
    await until(()=>!(d.querySelector('#choose-rival') as HTMLButtonElement).disabled,'Enemy selection failed');
    assert.match(d.querySelector('[data-enemy-index="0"]')!.textContent!,/Rival activo/);
    assert.match(d.querySelector('#rival')!.textContent!,/Jolteon/);
    assert.match(d.querySelector('.match-head')!.textContent!,/Gyarados/);
    assert.ok(!d.querySelector('#ranking')!.textContent!.includes('índice'));
    assert.match(d.querySelector('#defensive-types')!.textContent!,/Debilidades y resistencias/);
    assert.equal(d.querySelectorAll('.match').length,2);
    click('[data-reveal="0"]'); await ready(); input('#move-0','thunderbolt'); await save();
    assert.match(d.querySelector('#revealed')!.textContent!,/Rayo/);
    assert.match(d.querySelector('#revealed')!.textContent!,/Puede aplicar parálisis \(10%\)/);
    assert.match(d.querySelector('#revealed')!.textContent!,/1 \/ 4/);
    assert.match(d.querySelector('.match .cons')!.textContent!,/Rayo.*×4/);
    assert.match(d.querySelector('.match .cons')!.textContent!,/Puede aplicar parálisis \(10%\)/);
    assert.match(d.querySelector('.match .cons .stab')!.textContent!,/STAB ×1,5/);
    assert.match(d.querySelector('.match .cons .attack-stats')!.textContent!,/Rival At. Esp. 80 \/ Tu Def. Esp. 80/);
    assert.equal(d.querySelector('.match .cons .attack-stats')!.closest('details'),null);
    assert.match(d.querySelector('.match details .attack-stats')!.textContent!,/Potencia base 90/);
    assert.match(d.querySelector('.match .base-speed')!.textContent!,/Velocidad base/);
    assert.ok(!d.body.textContent!.includes('Solo ataques cargados y habilidades conocidas. Sin estimar ataques rivales.'));
    assert.equal(d.querySelector('.match details')!.hasAttribute('open'),false);
    // Invalid move: failed candidate never replaces saved data.
    const stored = dom.window.localStorage.getItem('randomlocke.team.v1');
    click('[data-edit="0"]'); await ready(); input('#move-1','nonexistent'); click('#save');
    await until(()=>!!d.querySelector('#form-error')!.textContent,'Missing validation error');
    assert.equal(dom.window.localStorage.getItem('randomlocke.team.v1'),stored);
    assert.ok(d.querySelector('#editor')!.hasAttribute('open'));
    input('#move-1','Rayo hielo'); await ready(); await save();
    assert.match(d.querySelector('#team')!.textContent!,/Rayo hielo/);
    assert.match(d.querySelector('#team')!.textContent!,/Puede aplicar congelación \(10%\)/);
    // Editing the active rival updates that member inside the imported enemy team.
    click('#choose-rival'); await ready(); input('#pokemon-input','Gyarados'); await ready();
    assert.equal((d.querySelector('#move-0') as HTMLInputElement).value,'');
    assert.equal((d.querySelector('#ability') as HTMLSelectElement).value,'');
    (d.querySelector('#ability') as HTMLSelectElement).value = 'intimidate';
    await save();
    assert.match(d.querySelector('#revealed')!.textContent!,/0 \/ 4/);
    assert.match(d.querySelector('[data-enemy-index="0"]')!.textContent!,/Gyarados/);
    const saved = dom.window.localStorage.getItem('randomlocke.team.v1')!;
    const persisted = JSON.parse(saved);
    assert.equal(persisted.enemyTeam[0].pokemon,'gyarados');
    assert.equal(persisted.selectedEnemyIndex,0);
    dom.window.close(); dom = await page(saved); d = dom.window.document;
    assert.equal(d.querySelector('#count')!.textContent,'2 / 6');
    assert.match(d.querySelector('#team')!.textContent!,/Rayo hielo/);
    assert.equal(d.querySelector('#enemy-count')!.textContent,'2 / 6');
    assert.match(d.querySelector('#rival')!.textContent!,/Gyarados/);
    assert.match(d.querySelector('[data-enemy-index="0"]')!.textContent!,/Rival activo/);
    click('[data-remove="0"]'); await until(()=>d.querySelector('#count')!.textContent === '1 / 6','Removal failed');
    assert.equal(JSON.parse(dom.window.localStorage.getItem('randomlocke.team.v1')!).team[0].pokemon,'gastrodon');
    dom.window.close(); dom = await page('{bad-json'); d = dom.window.document;
    assert.match(d.querySelector('#notice')!.textContent!,/No se pudo leer/);
  } finally {
    dom?.window.close(); server.closeAllConnections(); await new Promise<void>(resolve=>server.close(()=>resolve()));
  }
});
