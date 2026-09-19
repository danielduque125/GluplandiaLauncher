# Gluplandia Launcher 1.2.2

## Corrección del panel de descargas

- El panel grande de progreso ya no se renderiza dentro del flujo normal de la pantalla cuando el launcher está inactivo.
- En reposo se muestra un estado compacto `Listo para jugar` dentro del panel de lanzamiento.
- Durante una descarga o preparación, el panel detallado se renderiza como hijo directo de la ventana del launcher y queda fijado al borde inferior del viewport.
- El dock mantiene visibles porcentaje, archivo actual, velocidad, tiempo restante, etapas y botón Cancelar sin depender del scroll de la pantalla Aventura.
- Se reserva espacio inferior mientras una operación está activa para que el dock no cubra el contenido al desplazarse.
- Se compactó la altura del dock para funcionar mejor en ventanas de menor altura.

## Validación

- 24/24 pruebas automatizadas superadas.
- `src/App.jsx` validado con el parser JSX de Babel.
- `electron/main.js` y `electron/preload.cjs` pasan validación sintáctica de Node.
