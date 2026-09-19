# Gluplandia Launcher 1.2.4

Corrección de red para la preparación inicial.

- La capa HTTP del proceso principal usa `electron.net.fetch`, es decir la pila de red de Chromium.
- Mantiene `global fetch` como respaldo.
- Añade reintentos para GET/HEAD en errores de red y respuestas 408/429/5xx.
- Los errores de conexión ahora indican el host y la causa en vez de mostrar solo `fetch failed`.
- Java 25 usa dos consultas compatibles de Adoptium antes de rendirse.
- El progreso diferencia búsqueda de runtime, localización y descarga.
