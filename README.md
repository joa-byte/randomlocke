# Randomlocke

Asesor básico de equipo para un randomlocke de Pokémon Añil. Node.js + TypeScript y HTML/CSS/JS vanilla, en una sola pantalla. No necesita base de datos, cuenta ni claves de API.

## Ejecutar

Requiere **Node.js 24 o posterior** (ejecución nativa de TypeScript).

```sh
git clone https://github.com/joa-byte/randomlocke.git
cd randomlocke
npm ci
npm start
```

Abrir **http://localhost:3000**. `npm run dev` reinicia Node cuando cambia el código. El front se actualiza al recargar. `PORT` cambia el puerto; `HOST` permite configurar la interfaz de escucha (por defecto `127.0.0.1`).

No hay compilación ni dependencias de producción. `npm start` funciona incluso sin instalar las herramientas de desarrollo. Se necesita Internet para consultar recursos todavía no cacheados y descargar sprites.

## Uso

1. Agregar hasta seis Pokémon, elegir una habilidad válida, objeto opcional y hasta cuatro movimientos.
2. Elegir el rival. Su habilidad y objeto pueden quedar desconocidos.
3. Revelar ataques con los cuatro botones del rival. El ranking se recalcula al guardar.
4. Consultar cobertura ofensiva, debilidades compartidas y tipos sin resistencias/inmunidades.

Las formas aparecen como entradas separadas. Las habilidades incluyen las ocultas y se validan en el servidor. Los movimientos se pueden elegir libremente. Los catálogos de búsqueda usan nombres en inglés (p. ej. `Thunderbolt`, `Ice Beam`, `Choice Band`); los detalles de movimientos y habilidades muestran el nombre en español disponible en PokéAPI.

El equipo se guarda en **localStorage del navegador y origen actual**. El rival se mantiene solo mientras está abierta la página. No se guarda nada del equipo en el servidor; este lo recibe para calcular. Un fallo de cálculo no reemplaza el último equipo guardado.

## Criterio del ranking

Se usan estadísticas **base** de PokéAPI: PS, Ataque, Defensa, Ataque Especial, Defensa Especial y Velocidad. No hay nivel, IV, EV ni vida actual.

Para cada ataque calculable:

`presión = potencia × ataque / defensa × STAB × efectividad × efectos / PS base del defensor`

Se elige Ataque/Defensa o Ataque Especial/Defensa Especial según la categoría. El índice es una comparación heurística: **no es la fórmula de daño del juego, un porcentaje de vida ni una probabilidad de victoria**. Las proporciones de estadísticas base no equivalen a proporciones de estadísticas reales.

- Aguante: peor presión recibida entre las amenazas consideradas.
- Respuesta: mayor presión que puede generar uno de tus movimientos.
- Orden: presión recibida ascendente; a igualdad, respuesta descendente; a igualdad, velocidad descendente. No se mezclan con pesos opacos. Es deliberadamente conservador: no sacrifica aguante por más daño.
- Semáforo fijo: verde `≤ 0,75`; amarillo `≤ 2,25`; rojo `> 2,25`. Referencia neutral: ataque STAB de potencia 80, 80 PS y estadísticas ofensiva/defensiva iguales da `1,50`. Son umbrales heurísticos, no umbrales de KO. Todo el equipo puede quedar rojo.
- Velocidad base (y Pañuelo Elegido) y prioridad se muestran como indicios de la respuesta, no como certeza. Cambiar consume la acción: no se considera que el Pokémon entrante ataque antes de recibir el golpe.

Mientras falten movimientos rivales, se conservan ataques sintéticos de potencia 80 para cada tipo STAB rival, físicos y especiales. No son ataques confirmados ni un máximo posible: el randomlocke puede dar cobertura inesperada. Con cuatro movimientos revelados se usa solo ese repertorio. Los ataques no calculables generan advertencias; si no existe ningún ataque evaluable, el aguante queda desconocido (amarillo), salvo que los cuatro sean de estado.

La cobertura ofensiva comprueba supereficacia de ataques calculables contra **tipos puros**, no contra todas las combinaciones dobles. Los ataques de mecánica no soportada quedan fuera. La defensiva respeta tipos dobles y habilidades implementadas. No se confunde una resistencia de tipo con aguante físico/especial.

## Efectos implementados

Habilidades (identificadores de PokéAPI): `levitate`, `water-absorb`, `storm-drain`, `dry-skin`, `volt-absorb`, `lightning-rod`, `motor-drive`, `flash-fire`, `sap-sipper`, `thick-fat`, `wonder-guard`, `filter`, `solid-rock`, `prism-armor`, `adaptability`, `huge-power`, `pure-power`, `technician`, `tinted-lens`, `mold-breaker`, `teravolt`, `turboblaze`, `fur-coat`, `ice-scales`.

Solo sus efectos directos: inmunidades, multiplicadores y anulación de habilidades. No se simulan curación, aumentos por activaciones previas, turnos o estados. Por ejemplo, Absorbe Fuego da inmunidad pero no un aumento ofensivo asumido. Rompemoldes no anula Prisma Armadura.

Objetos: `choice-band`, `choice-specs`, `choice-scarf`, `assault-vest`, `life-orb`, `expert-belt`, `muscle-band`, `wise-glasses`. Se calcula la mejora directa; el bloqueo Elegido y retroceso de Vidasfera quedan advertidos, sin simulación.

Otros objetos y habilidades pueden seleccionarse, pero se marcan como no calculados en el ranking. La habilidad y objeto rival desconocidos no se adivinan.

Los ataques de estado no puntúan como daño. Potencia nula, golpes múltiples, movimientos de varios turnos y excepciones explícitas (Psyshock, Body Press, Foul Play, Freeze-Dry, etc.) quedan fuera del daño con advertencia. La lista está en `src/pokemon/client.ts`; no pretende implementar todas las mecánicas. Efectos secundarios, precisión, críticos, clima, terreno, boosts, estados, retroceso y cambios particulares de Añil no se modelan. Los datos son los de PokéAPI, no una extracción de la ROM.

## Arquitectura

- `src/engine/`: tipos, efectos, presión, ranking y cobertura. Funciones puras sin HTTP ni DOM.
- `src/pokemon/`: adaptador de PokéAPI, traducción de detalles y caché en memoria/disco (`.cache/pokeapi`, archivos válidos por 30 días al cargar). Coalescencia de solicitudes concurrentes; no cachea errores.
- `src/routes/`: validación de selecciones y análisis.
- `src/server.ts`: HTTP nativo, recursos estáticos explícitos, límite de cuerpo de 16 KiB y errores JSON.
- `public/`: pantalla, formularios y persistencia local.
- `tests/`: motor, API, caché e interacción del DOM.

Endpoints: `GET /api/health`, `GET /api/catalog/{pokemon|move|item}`, `GET /api/pokemon/:id`, `GET /api/move/:id`, `POST /api/analyze`.

El análisis recibe `{ team: Selection[], rival: Selection | null }`. Cada selección: `{ pokemon, ability, item, moves: string[] }`. El servidor reconstruye estadísticas y efectos desde PokéAPI; no confía en estadísticas enviadas por el cliente.

## Verificación

```sh
npm run check
npm test
```

Los tests automatizados no requieren Internet: usan fixtures controladas. Incluyen tipos dobles, inmunidades, defensas físicas/especiales, objetos y habilidades, cobertura, incertidumbre, actualización del ranking, validaciones HTTP, caché y flujo de formularios/persistencia del DOM. GitHub Actions ejecuta los mismos comandos en Node 24.

El test DOM no sustituye una revisión visual de Chrome. En el entorno de implementación, el navegador remoto bloqueó `127.0.0.1`; la inspección visual y móvil real quedó pendiente. Se comprobó por separado la conexión real con PokéAPI.

Fuentes: [PokéAPI](https://pokeapi.co/docs/v2), [Node.js TypeScript](https://nodejs.org/api/typescript.html). Pokémon y sus sprites pertenecen a sus respectivos titulares. Proyecto personal sin afiliación oficial.
