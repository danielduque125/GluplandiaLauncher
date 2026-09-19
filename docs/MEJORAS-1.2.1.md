# Gluplandia Launcher 1.2.1

Esta revisión parte del código fuente 1.1.1 proporcionado por el usuario y conserva las mejoras visuales y de audio existentes.

## Skin del servidor

- Se integra GluplandiaBridge mediante `skinBridgeUrl`.
- La tarjeta de identidad usa la skin asignada en SkinsRestorer, no MCHeads.
- El rostro muestra la capa base y la segunda capa de la cabeza.
- El avatar recibe un marco dungeon más grande, esquinas metálicas, placa GLU y estados de carga/sincronización.
- Si la API o la skin no están disponibles, se usa el avatar local de respaldo.

## Descargas

- Mientras Java, Minecraft, recursos o el modpack se preparan, el progreso se convierte en un dock fijo en la parte inferior de la ventana.
- El dock permanece completamente visible aunque el contenido principal necesite scroll.
- Muestra etapa, porcentaje, archivo actual, velocidad, ETA y los cinco pasos de preparación.
- Se reserva espacio inferior mientras hay una operación para que el dock no tape contenido útil.
- En ventanas estrechas el dock se compacta y mantiene el botón Cancelar visible.

## Validación

- 24/24 pruebas automatizadas superadas.
- `App.jsx`, `electron/main.js`, `electron/preload.cjs` y `electron/services/skin.js` validados sintácticamente.
