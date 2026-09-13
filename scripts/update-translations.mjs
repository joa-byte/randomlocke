// Optional maintenance script; the app uses the checked-in JSON, never downloads CSVs.
import { writeFile } from 'node:fs/promises';
const base = 'https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv/';
function csv(text) {
  const rows = []; let row = [], field = '', quoted = false;
  for (let i=0; i<text.length; i++) {
    const c=text[i];
    if (c === '"') { if (quoted && text[i+1] === '"') {field+='"';i++;} else quoted=!quoted; }
    else if (c === ',' && !quoted) {row.push(field);field='';}
    else if (c === '\n' && !quoted) {row.push(field.replace(/\r$/, ''));rows.push(row);row=[];field='';}
    else field+=c;
  }
  if (field || row.length) {row.push(field);rows.push(row);}
  const headers=rows.shift();
  return rows.map(r=>Object.fromEntries(headers.map((key,i)=>[key,r[i]??''])));
}
async function get(file) {
  const r=await fetch(base+file+'.csv',{signal:AbortSignal.timeout(30000)});
  if (!r.ok) throw new Error(`${file}: HTTP ${r.status}`);
  return csv(await r.text());
}
const files=['languages','move_names','item_names','ability_names','pokemon_species_names','pokemon_form_names','pokemon_forms','pokemon'];
const data=Object.fromEntries(await Promise.all(files.map(async name=>[name,await get(name)])));
const language=data.languages.find(l=>l.identifier==='es')?.id;
if (!language) throw new Error('Spanish language ID not found');
const translated=(file,key,value='name')=>Object.fromEntries(data[file].filter(r=>r.local_language_id===language && r[value]).map(r=>[r[key],r[value]]));
const species=translated('pokemon_species_names','pokemon_species_id');
const forms=translated('pokemon_form_names','pokemon_form_id','pokemon_name');
const formLabels=translated('pokemon_form_names','pokemon_form_id','form_name');
const pokemon={};
for (const p of data.pokemon) {
  const form=data.pokemon_forms.find(f=>f.pokemon_id===p.id && f.is_default==='1');
  const label=species[p.species_id];
  if (form && forms[form.id]) pokemon[p.id]=forms[form.id];
  else if (form && formLabels[form.id] && label) pokemon[p.id]=`${label} (${formLabels[form.id]})`;
  else if (p.is_default==='1' && label) pokemon[p.id]=label;
}
const output={source:base,language:'es',move:translated('move_names','move_id'),item:translated('item_names','item_id'),ability:translated('ability_names','ability_id'),pokemon};
if (Object.keys(output.move).length<500 || Object.keys(output.item).length<500) throw new Error('Incomplete translation dataset');
await writeFile(new URL('../src/pokemon/es.json',import.meta.url),JSON.stringify(output,null,2)+'\n');
console.log(Object.fromEntries(['move','item','ability','pokemon'].map(k=>[k,Object.keys(output[k]).length])));
