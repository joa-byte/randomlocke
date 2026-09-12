const $ = id => document.getElementById(id);
const names = {normal:'Normal',fire:'Fuego',water:'Agua',electric:'Eléctrico',grass:'Planta',ice:'Hielo',fighting:'Lucha',poison:'Veneno',ground:'Tierra',flying:'Volador',psychic:'Psíquico',bug:'Bicho',rock:'Roca',ghost:'Fantasma',dragon:'Dragón',dark:'Siniestro',steel:'Acero',fairy:'Hada'};
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const slug = text => text.trim().toLowerCase().replaceAll(' ', '-');
const badge = type => `<span class="type ${esc(type)}">${esc(names[type] ?? type)}</span>`;
const sprite = p => p.sprite && /^https:\/\/raw\.(githubusercontent\.com|github\.com)\//.test(p.sprite) ? `<img class="sprite" src="${esc(p.sprite)}" alt="${esc(p.label)}" width="72" height="72">` : '<span class="no-sprite" aria-label="Sin sprite">?</span>';
const storageKey = 'randomlocke.team.v1';
let team = [], rival = null, result = null, editing = null, chosen = null, editEpoch = 0, loadingPokemon = false, catalogs = {};
let storageWarning = '';
let busy = false;
const validSaved = s => s && typeof s.pokemon === 'string' && typeof s.ability === 'string' && (s.item === null || typeof s.item === 'string') && Array.isArray(s.moves) && s.moves.length <= 4 && s.moves.every(m => typeof m === 'string');
try {
  const stored = JSON.parse(localStorage.getItem(storageKey) ?? 'null');
  if (stored && stored.version === 1 && Array.isArray(stored.team) && stored.team.length <= 6 && stored.team.every(validSaved)) team = stored.team;
  else if (stored) storageWarning = 'El equipo guardado tiene un formato incompatible. No se borró.';
} catch { storageWarning = 'No se pudo leer el equipo guardado. No se borró.'; }

async function api(path, data) {
  const response = await fetch(path, {...(data ? {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)} : {}), signal:AbortSignal.timeout(60000)});
  const value = await response.json();
  if (!response.ok) throw new Error(value.error ?? 'No se pudo completar la solicitud.');
  return value;
}
function notice(message, retry = false) {
  $('notice').innerHTML = message ? `${esc(message)}${retry ? ' <button id="retry" class="secondary">Reintentar</button>' : ''}` : '';
  $('retry')?.addEventListener('click', () => start());
}
function persist() {
  try { localStorage.setItem(storageKey, JSON.stringify({version:1,team})); }
  catch { notice('El equipo funciona, pero el navegador no permitió guardarlo.'); }
}
const stats = p => `<div class="stats">${[['hp','PS'],['attack','Atq'],['defense','Def'],['special-attack','At. Esp.'],['special-defense','Def. Esp.'],['speed','Vel']].map(([key,label]) => `<span>${label}<strong>${p.stats[key]}</strong></span>`).join('')}</div>`;
const monHead = p => `<div class="mon-head">${sprite(p)}<div><h3>${esc(p.label)}</h3><div class="badges">${p.types.map(badge).join('')}</div></div></div>`;
function render() {
  $('count').textContent = `${team.length} / 6`;
  $('add').disabled = team.length >= 6;
  if (!result) return;
  $('team').innerHTML = result.team.length ? result.team.map((p,i) => `<article class="card">
    ${monHead(p)}${stats(p)}
    <p class="equipment">${esc(p.abilities.find(a => a.id === p.ability)?.label)} · ${esc(p.item ? catalogs.item?.find(item => item.id === p.item)?.label ?? p.item : 'Sin objeto')}</p>
    <div class="moves">${p.moves.length ? p.moves.map(m => `<div>${badge(m.type)} <span>${esc(m.label)}</span><small>${m.category === 'physical' ? 'Fís.' : m.category === 'special' ? 'Esp.' : 'Estado'}${m.power ? ` · ${m.power}` : ''}</small></div>`).join('') : '<p class="muted">Sin movimientos cargados</p>'}</div>
    ${p.warnings?.length ? `<details><summary>Efectos y límites</summary><ul>${p.warnings.map(w => `<li>${esc(w)}</li>`).join('')}</ul></details>` : ''}
    <div class="card-actions"><button class="secondary" data-edit="${i}">Editar</button><button class="quiet" data-remove="${i}" aria-label="Quitar ${esc(p.label)}">Quitar</button></div>
  </article>`).join('') : '<div class="empty team-empty">Tu equipo empieza acá. Agregá hasta seis Pokémon con sus movimientos.</div>';
  document.querySelectorAll('[data-edit]').forEach(b => b.addEventListener('click', () => openEditor(Number(b.dataset.edit))));
  document.querySelectorAll('[data-remove]').forEach(b => b.addEventListener('click', () => removeMember(Number(b.dataset.remove))));
  $('rival').className = result.rival ? '' : 'empty';
  $('rival').innerHTML = result.rival ? monHead(result.rival) + stats(result.rival) : 'Elegí a quién te enfrentás.';
  $('choose-rival').textContent = rival ? 'Editar / cambiar' : 'Elegir rival';
  $('revealed').innerHTML = result.rival ? `<h3 class="minor">Ataques revelados · ${result.rival.moves.length} / 4</h3><div class="revealed">${Array.from({length:4},(_,i) => {
    const m = result.rival.moves[i]; return `<button class="move-slot secondary" data-reveal="${i}">${m ? `${badge(m.type)} ${esc(m.label)}` : '+ Revelar ataque'}</button>`;
  }).join('')}</div><p class="hint">${result.rival.moves.length < 4 ? 'Cobertura incompleta: se mantiene una estimación por STAB.' : 'Cuatro ataques conocidos; revisá las mecánicas no calculadas.'}</p>` : '';
  document.querySelectorAll('[data-reveal]').forEach(b => b.addEventListener('click', () => openEditor('rival', Number(b.dataset.reveal))));
  $('ranking').className = result.ranking.length ? 'ranking' : 'empty';
  $('ranking').innerHTML = result.ranking.length ? result.ranking.map((r,i) => `<article class="match tier-${r.tier}">
    <div class="match-head"><strong>${i+1}. ${esc(r.label)}</strong><span class="verdict">${['Presión baja','Presión media','Presión alta'][r.tier]}</span></div>
    <p>${r.incoming ? `Amenaza: ${esc(r.incoming.move.label)} · índice ${r.danger.toFixed(2)}` : r.uncertain ? 'Aguante sin evaluar: mecánica desconocida.' : 'Sin daño rival calculable en este escenario.'}</p>
    <p>${r.outgoing ? `Respuesta: ${esc(r.outgoing.move.label)} · índice ${r.reward.toFixed(2)}` : 'Sin respuesta ofensiva calculable.'}</p>
    ${r.order ? `<p class="hint">${esc(r.order)} · orientativo</p>` : ''}
    ${r.uncertain ? '<p class="caution">Hay ataques rivales no calculados: el riesgo puede ser mayor.</p>' : ''}
    ${r.warnings.length ? `<details><summary>Efectos y límites (${r.warnings.length})</summary><ul>${r.warnings.map(w => `<li>${esc(w)}</li>`).join('')}</ul></details>` : ''}
  </article>`).join('') + (result.warnings.length ? `<details class="notes"><summary>Información rival incompleta / efectos</summary><ul>${result.warnings.map(w => `<li>${esc(w)}</li>`).join('')}</ul></details>` : '') : 'Cargá tu equipo y un rival para comparar.';
  const c = result.coverage;
  $('coverage').className = 'coverage';
  $('coverage').innerHTML = team.length ? [
    ['Sin ataque supereficaz',c.filter(t => !t.covered), t => badge(t.type)],
    ['Debilidades compartidas',c.filter(t => t.weak.length >= 2), t => `<span class="coverage-entry" title="${esc(t.weak.join(', '))}">${badge(t.type)} <small>${esc(t.weak.join(', '))}</small></span>`],
    ['Sin resistencia ni inmunidad',c.filter(t => !t.resistant.length), t => badge(t.type)]
  ].map(([label,entries,draw]) => `<div><h3>${label}</h3><div class="badges">${entries.length ? entries.map(draw).join('') : '<span class="muted">Ninguno</span>'}</div></div>`).join('') : '<p class="empty">Agregá un Pokémon para ver la cobertura.</p>';
  document.querySelectorAll('img.sprite').forEach(img => img.addEventListener('error', () => { img.replaceWith(Object.assign(document.createElement('span'), {className:'no-sprite',textContent:'?'})); }, {once:true}));
}
async function loadCatalogs() {
  await Promise.all(['pokemon','move','item'].map(async kind => {
    if (!catalogs[kind]) catalogs[kind] = await api(`/api/catalog/${kind}`);
    $(`${kind}-list`).innerHTML = catalogs[kind].map(p => `<option value="${esc(p.label)}"></option>`).join('');
  }));
}
function resolveInput(kind, input) {
  if (!input.trim()) return null;
  const normalized = slug(input);
  return catalogs[kind]?.find(entry => entry.id === normalized || slug(entry.label) === normalized)?.id ?? normalized;
}
function setMoveFields(moves = []) {
  $('move-fields').innerHTML = Array.from({length:4},(_,i) => `<label>Movimiento ${i+1}<input class="move-input" id="move-${i}" list="move-list" autocomplete="off" value="${esc(moves[i] ? catalogs.move?.find(m => m.id === moves[i])?.label ?? moves[i] : '')}" placeholder="Desconocido / vacío"><small id="move-detail-${i}" class="muted"></small></label>`).join('');
  document.querySelectorAll('.move-input').forEach((input,i) => {
    input.addEventListener('change', async () => {
      const value = input.value; const epoch = editEpoch;
      $(`move-detail-${i}`).textContent = '';
      if (!value.trim()) return;
      try {
        const m = await api(`/api/move/${resolveInput('move',value)}`);
        if (epoch === editEpoch && input.value === value) $(`move-detail-${i}`).textContent = `${m.label} · ${names[m.type]} · ${m.category === 'physical' ? 'Físico' : m.category === 'special' ? 'Especial' : 'Estado'}${m.unsupported ? ' · No calculado' : ''}`;
      } catch (e) { if (epoch === editEpoch && input.value === value) $(`move-detail-${i}`).textContent = e.message; }
    });
  });
}
async function loadPokemon(value, ability = null, preserve = false) {
  const epoch = ++editEpoch;
  const id = resolveInput('pokemon',value);
  chosen = null; loadingPokemon = true; $('save').disabled = true;
  $('pokemon-preview').textContent = 'Cargando Pokémon…'; $('form-error').textContent = '';
  try {
    const p = await api(`/api/pokemon/${id}`);
    if (epoch !== editEpoch) return;
    chosen = p;
    $('pokemon-preview').innerHTML = monHead(p) + stats(p);
    $('ability').innerHTML = (editing === 'rival' ? '<option value="">Desconocida</option>' : '') + p.abilities.map(a => `<option value="${esc(a.id)}">${esc(a.label)}${a.hidden ? ' (oculta)' : ''}</option>`).join('');
    if (ability && p.abilities.some(a => a.id === ability)) $('ability').value = ability;
    if (!preserve) { $('item-input').value = ''; setMoveFields(); }
  } catch (e) { if (epoch === editEpoch) { $('form-error').textContent = e.message; $('pokemon-preview').textContent = ''; } }
  finally { if (epoch === editEpoch) { loadingPokemon = false; $('save').disabled = !chosen; } }
}
async function openEditor(target, focusMove = null) {
  if (busy) return;
  editing = target; chosen = null; ++editEpoch;
  $('edit-form').reset(); $('form-error').textContent = ''; $('pokemon-preview').textContent = '';
  $('editor-title').textContent = target === 'rival' ? 'Rival y ataques revelados' : target === null ? 'Agregar Pokémon' : 'Editar Pokémon';
  $('moves-title').textContent = target === 'rival' ? 'Ataques revelados' : 'Movimientos';
  $('ability').innerHTML = '<option value="">Elegí primero un Pokémon</option>';
  $('save').disabled = true; setMoveFields(); $('editor').showModal();
  const selection = target === 'rival' ? rival : target === null ? null : team[target];
  if (selection) {
    $('pokemon-input').value = catalogs.pokemon?.find(p => p.id === selection.pokemon)?.label ?? selection.pokemon;
    $('item-input').value = catalogs.item?.find(p => p.id === selection.item)?.label ?? selection.item ?? '';
    setMoveFields(selection.moves);
    await loadPokemon(selection.pokemon, selection.ability, true);
    if (focusMove !== null && $('editor').open) $(`move-${focusMove}`).focus();
  }
}
async function removeMember(index) {
  if (busy) return;
  busy = true;
  const candidate = team.filter((_,i) => i !== index);
  try { const next = await api('/api/analyze', {team:candidate,rival}); team = candidate; result = next; notice(''); persist(); render(); }
  catch (e) { notice(e.message, true); }
  finally { busy = false; }
}
$('pokemon-input').addEventListener('change', event => { if (event.target.value.trim()) loadPokemon(event.target.value); });
$('pokemon-input').addEventListener('input', () => { ++editEpoch; chosen = null; $('save').disabled = true; });
$('close').addEventListener('click', () => { ++editEpoch; $('editor').close(); });
$('editor').addEventListener('cancel', event => { if (busy) event.preventDefault(); else ++editEpoch; });
$('add').addEventListener('click', () => openEditor(null));
$('choose-rival').addEventListener('click', () => openEditor('rival'));
$('edit-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (!chosen || loadingPokemon || busy) return;
  const selection = {pokemon:chosen.id, ability:$('ability').value || null, item:resolveInput('item',$('item-input').value), moves:[...document.querySelectorAll('.move-input')].map(input => resolveInput('move',input.value)).filter(Boolean)};
  const nextTeam = [...team]; let nextRival = rival;
  if (editing === 'rival') nextRival = selection;
  else if (editing === null) nextTeam.push(selection);
  else nextTeam[editing] = selection;
  busy = true;
  document.querySelectorAll('#edit-form input, #edit-form select, #edit-form button').forEach(el => { el.disabled = true; });
  $('save').textContent = 'Calculando…'; $('form-error').textContent = '';
  try {
    const next = await api('/api/analyze', {team:nextTeam,rival:nextRival});
    team = nextTeam; rival = nextRival; result = next;
    notice(''); persist(); render(); $('editor').close();
  } catch (e) { $('form-error').textContent = e.message; }
  finally {
    busy = false;
    document.querySelectorAll('#edit-form input, #edit-form select, #edit-form button').forEach(el => { el.disabled = false; });
    $('save').disabled = !chosen; $('save').textContent = 'Guardar';
  }
});
async function start() {
  notice('Cargando catálogos…');
  try {
    await loadCatalogs();
    result = await api('/api/analyze', {team,rival}); render(); notice(storageWarning);
  } catch (e) { notice(e.message, true); }
}
await start();
