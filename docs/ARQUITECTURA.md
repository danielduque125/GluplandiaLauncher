# Arquitectura de Gluplandia

El proyecto upstream utiliza Electron con ESM, React 19 y Vite 8. `electron/main.js` reunía 2.357 líneas con ventanas, preferencias, autenticación, descargas, administración de mods, instaladores y arranque. `src/lib/minecraftLauncher.js` construía catálogos generales y enviaba invocaciones IPC. `src/lib/microsoftAuth.js` delegaba el login en `openlauncher.api.codevbox.com`. El proyecto ya incorporaba electron-builder, aunque combinaba un script NSIS independiente con un actualizador manual que elegía assets de GitHub y ejecutaba el archivo descargado.

La inspección identificó escritura en la carpeta global .minecraft, UUID offline basado en SHA-1, fallback de refresh tokens a JSON sin cifrado, exposición genérica de invoke desde preload y errores de herencia de argumentos Fabric. El arranque añadía argumentos obligatorios y luego eliminaba valores duplicados por contenido, lo cual podía romper pares de opciones. Algunas descargas fallidas se registraban pero permitían continuar. La nueva implementación cambia esas decisiones.

`electron/main.js` conserva el papel de proceso principal y compone servicios específicos. Solo permite una instancia del launcher y una operación de preparación o juego a la vez. Define las rutas de Gluplandia, lee la configuración empaquetada y registra los handlers de una API limitada. El frontend no puede elegir comandos del sistema, rutas arbitrarias, tokens, versiones del juego ni argumentos JVM.

`electron/preload.cjs` expone métodos específicos mediante contextBridge. Cada handler comprueba el webContents y el frame principal del emisor. No hay un método invoke público. La ventana utiliza contextIsolation, sandbox y nodeIntegration desactivado. Se bloquean nuevas ventanas, navegación externa y permisos web. Abrir la web utiliza únicamente la dirección configurada por el distribuidor.

`electron/services/io.js` centraliza HTTPS, descargas a archivos temporales, hashes, rutas seguras y escrituras por rename. Las solicitudes usan timeout y aceptan cancelación. Las descargas tienen tres intentos y nunca sustituyen un archivo por bytes que no superen la verificación.

`electron/services/offline.js` implementa UUID offline versión 3 compatible con Java. `electron/services/auth.js` implementa Device Code, refresh, Xbox Live, XSTS y Minecraft Services. Se retiró el backend privado del upstream y su almacenamiento alternativo sin cifrar. La dependencia keytar ya no es necesaria.

`electron/services/game.js` adapta las ideas del motor upstream para la instancia fija. Reutiliza su enfoque de metadatos Mojang y Fabric, coordenadas Maven y sustitución de argumentos, pero separa preparación y arranque. La herencia concatena listas de argumentos y sustituye bibliotecas por grupo, artefacto y clasificador. Las reglas filtran sistemas y arquitecturas antes de descargar. La línea de comandos se construye con arrays y se pasa por argfile a Java sin shell.

`electron/services/java.js` detecta Java 25 y administra una copia privada de Temurin en Windows x64. Verifica el paquete y las rutas de extracción. La ejecución posterior verifica el hash guardado del ejecutable administrado antes de consultarle la versión. Un Java del sistema se trata como una instalación externa y se verifica mediante su versión. La integridad completa de todos los archivos de una instalación Java externa queda a cargo de su administrador.

`electron/services/pack.js` valida el manifiesto y su firma. Registra revisiones aceptadas, impide reutilizar una revisión con contenido distinto y sincroniza únicamente áreas permitidas. El esquema es un único array tipado por el primer segmento de path. Esto evita aplicar cuatro algoritmos de propiedad distintos a mods, config, resourcepacks y shaderpacks.

`electron/services/status.js` implementa Server List Ping con TCP, límite de tamaño y timeout. `electron/services/updater.js` configura electron-updater para instaladores NSIS firmados y mantiene la instalación de actualizaciones separada de la ejecución del juego.

`src/App.jsx`, `src/App.css`, `src/index.css` y `src/main.jsx` sustituyen el selector genérico de perfiles por Aventura, Mi equipo y Registro. Mantienen React y Vite del upstream. El título, icono, paleta naranja, logo y arte local corresponden a Gluplandia. El frontend no representa datos ficticios como población real del servidor.

`config/launcher.json`, `config/content.example.json` y `config/manifest.example.json` son archivos nuevos. `.env.example` documenta las variables de desarrollo. `tools/build-manifest.mjs` calcula hashes para un directorio real, `tools/sample-pack.mjs` resuelve versiones de Modrinth y dependencias, `tools/sign-manifest.mjs` crea claves y firmas, y `tools/release-check.mjs` valida requisitos de distribución.

`package.json`, `package-lock.json`, `vite.config.js`, `compile-windows.bat`, `index.html`, `.gitignore` y `.github/workflows/release.yml` se modificaron. Se añadió electron-updater y se actualizó adm-zip. Se retiraron keytar, el preload alternativo, los servicios src/lib que ya no tenían consumidores, los locales genéricos y los scripts de publicación y empaquetado anteriores. El historial Git conserva el código original y `docs/UPSTREAM-README.md` conserva su documentación.

El flujo de apertura comprueba actualizaciones y obtiene el manifiesto. La interfaz permite seleccionar Microsoft o nombre local. Al jugar, el proceso principal autentica o reconstruye la identidad, vuelve a verificar el manifiesto, detecta o instala Java, verifica Minecraft y Fabric, sincroniza el pack y lanza el juego. Un error interrumpe el flujo antes del arranque. El botón de reparación omite la autenticación porque no lanza el juego.

El sincronizador y la preparación del juego comparten el bloqueo de operación. Las mutaciones del pack no se ejecutan mientras el proceso Minecraft administrado siga activo. Cerrar la ventana durante una operación requiere cancelarla o cerrar antes Minecraft. No se mata silenciosamente una partida ni se reinicia para aplicar una actualización mientras está en curso.

La primera compilación no puede inventar la aprobación Microsoft ni la firma de código. Esas identidades pertenecen al distribuidor. El proyecto deja los puntos de configuración explícitos y falla de manera visible cuando faltan, para que una interfaz compilada no se confunda con un lanzamiento ya autorizado y validado.
