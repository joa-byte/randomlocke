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
3. Revelar ataques con los cuatro botones del rival. Las fichas se actualizan al guardar.
4. Consultar cobertura ofensiva, debilidades compartidas y tipos sin resistencias/inmunidades.

Las formas aparecen como entradas separadas. Las habilidades incluyen las ocultas y se validan en el servidor. Los movimientos se pueden elegir libremente. Los catálogos muestran nombres en español (p. ej. `Rayo`, `Rayo Hielo`, `Cinta Elección`), ordenados alfabéticamente. Al escribir se aceptan mayúsculas, nombres sin tildes y los originales en inglés. También se traducen las formas disponibles, estimaciones y objetos en las advertencias. Cuando dos recursos tienen el mismo nombre, el selector añade su número para distinguirlos. Sin traducción disponible se conserva el nombre original.

Los IDs internos y el equipo guardado no cambian con el idioma. Las traducciones se incluyen en `src/pokemon/es.json`, extraídas de los [CSV de PokéAPI](https://github.com/PokeAPI/pokeapi/tree/master/data/v2/csv): 937 movimientos, 2173 objetos, 311 habilidades y 1203 Pokémon/formas en esta versión. No se consultan cientos de detalles para traducir un catálogo. El script opcional `node scripts/update-translations.mjs` regenera el archivo desde la fuente; requiere Internet solo al ejecutarlo.

El equipo se guarda en **localStorage del navegador y origen actual**. El rival se mantiene solo mientras está abierta la página. No se guarda nada del equipo en el servidor; este lo recibe para calcular. Un fallo de cálculo no reemplaza el último equipo guardado.

## Comparación de efectividad

Debajo del rival se agrupan los 18 tipos por multiplicador defensivo (×4, ×2, ×1, ×0,5, ×0,25, ×0). Esta tabla considera solo los tipos, como una calculadora.

A la derecha hay una ficha por integrante en el orden del equipo, con sprite pequeño:

- **Pros:** tus ataques cargados con multiplicador mayor que ×1 contra el rival.
- **Contras:** ataques revelados del rival con multiplicador mayor que ×1 contra ese integrante.
- **Ver todos los ataques:** incluye neutros, resistidos, inmunes, estado y mecánicas no calculadas.

No hay clasificación, presión, velocidad estimada ni ataques sintéticos. Los huecos del rival permanecen desconocidos. Los multiplicadores no son daño final: no incorporan potencia, estadísticas, STAB ni objetos.

En las fichas se aplican las inmunidades y modificadores directos de habilidades soportadas, como Levitación, Absorbe Agua, Absorbe Electricidad, Sebo o Filtro; se señala cuando modifican el resultado. No se adivina la habilidad rival. Habilidades no soportadas se advierten en los detalles.

Ataques como Acróbata o Doble Patada conservan su efectividad por tipos aunque no se calcule su daño. Los movimientos de estado, daño especial o efectividad variable no soportada aparecen con una aclaración y sin multiplicador. No se simulan clima, terreno, objetos, activaciones previas ni cambios particulares de Añil.

Las estadísticas base se siguen mostrando como referencia. Los módulos antiguos de presión y ranking se conservan aislados, pero ya no se utilizan en el endpoint de análisis ni en la interfaz.

## Arquitectura

- `src/engine/`: tipos, efectos, presión, comparación y cobertura. Funciones puras sin HTTP ni DOM.
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

Los tests automatizados no requieren Internet: usan fixtures controladas. Incluyen tipos dobles, inmunidades, defensas físicas/especiales, objetos y habilidades, cobertura, incertidumbre, actualización de pros y contras, validaciones HTTP, caché y flujo de formularios/persistencia del DOM. GitHub Actions ejecuta los mismos comandos en Node 24.

El test DOM no sustituye una revisión visual de Chrome. En el entorno de implementación, el navegador remoto bloqueó `127.0.0.1`; la inspección visual y móvil real quedó pendiente. Se comprobó por separado la conexión real con PokéAPI.

Fuentes: [PokéAPI](https://pokeapi.co/docs/v2), [Node.js TypeScript](https://nodejs.org/api/typescript.html). Pokémon y sus sprites pertenecen a sus respectivos titulares. Proyecto personal sin afiliación oficial.
