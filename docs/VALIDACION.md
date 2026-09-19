# Validación realizada

El 14 de septiembre de 2026 se inspeccionó el código fuente de OpenLauncher en el commit `0f756373fd2c24d57ebe3b761e3af28f964b4a17`. La comprobación del catálogo oficial encontró Minecraft Java 26.2 publicado y metadatos que requieren Java 25. Fabric Meta ofrecía Fabric Loader 0.19.5 para esa versión.

`npm ci` dispone de un lockfile actualizado. Las dependencias se instalaron inicialmente con scripts desactivados en Linux, y electron-builder ejecutó después su preparación de dependencias al empaquetar Windows. No se necesita keytar ni una compilación nativa de ese módulo.

`npm test` pasó 20 pruebas. Cubren UUID offline compatible con Java, validación de nombres, rutas peligrosas, enlaces simbólicos, descargas corruptas, cancelación, redirecciones inseguras, reutilización por hash, reparación, retirada de archivos administrados, preservación de archivos personales, selección de opcionales, recuperación de journal, firmas y revisiones, reglas de sistema, expansión de argumentos y herencia Fabric. Las pruebas de autenticación usan respuestas simuladas e incluyen el intercambio completo de refresh hasta el perfil, cifrado mediante adaptador, rechazo sin entitlement y conservación del refresh ante un fallo de red. No son una autenticación real con Microsoft.

`npm run build` generó correctamente el frontend de producción con Vite. La auditoría `npm audit --omit=dev` terminó con cero vulnerabilidades informadas después de actualizar adm-zip a 0.6.1. Esto refleja el resultado del servicio de auditoría en esta ejecución y no garantiza ausencia absoluta de defectos.

La interfaz de producción se abrió en Chromium headless con un puente IPC simulado. Se verificaron la carga del inicio, creación de perfil local, cambio a Mi equipo y guardado de memoria. No se registraron errores JavaScript. Las imágenes se cargaron correctamente y no hubo desbordamiento horizontal con viewport de 900 por 650. Se capturó y revisó visualmente `launcher-preview.png` con viewport de 1280 por 820. La captura usa datos de prueba para el pack y no demuestra una conexión real a Gluplandia.

`npm run pack:sample -- sample-pack` descargó desde Modrinth archivos reales de Fabric API, Mod Menu, Placeholder API y Sodium. Verificó los SHA-1 de origen y calculó sus SHA-256. `config/manifest.example.json` conserva sus identificadores y URLs concretas. No se incluyen esos JAR en el ZIP de código fuente. Se comprobó también la respuesta de Adoptium para un JDK Java 25 Windows x64 con checksum y tamaño publicados, sin descargar ni ejecutar ese runtime Windows.

Se ejecutó `electron-builder --win dir --x64 --publish never -c.win.signAndEditExecutable=false`. Terminó correctamente y produjo la estructura Windows x64 con Electron 43.7.0. El ASAR contenía 451 entradas, los servicios nuevos, la configuración y electron-updater. No contenía el antiguo servicio de autenticación. La opción de esa prueba desactiva edición de recursos y firma para permitir una comprobación parcial desde Linux. No sustituye la compilación normal Windows del README.

El intento de NSIS detectó inicialmente que el favicon original solo tenía 48 píxeles. Se corrigió el ICO para incluir imágenes de 16, 32, 48, 64, 128 y 256 píxeles a partir del PNG existente de 512 píxeles. El segundo intento superó esa comprobación y descargó NSIS, pero se detuvo porque el entorno no dispone de Wine. No se entrega ese resultado parcial como instalador terminado.

Quedan pendientes el arranque real de Java y Minecraft en Windows, una sesión Microsoft con la aplicación del distribuidor aprobada, una conexión a un servidor compatible con acceso local, una prueba completa del modpack real y la actualización entre dos instaladores NSIS firmados. El código y el workflow incluyen esas rutas, pero no se afirma que dichas pruebas externas se hayan realizado.

El ZIP final se comprueba mediante CRC de todas sus entradas y extracción completa. Excluye `.git`, `node_modules`, artefactos temporales de compilación, tokens, certificados y JAR descargados. Contiene el proyecto completo y un patch binario aplicable al commit upstream indicado.

También se descargó el perfil oficial `fabric-loader-0.19.5-26.2` y se combinó con los metadatos reales de Minecraft 26.2. La expansión produjo 12 argumentos JVM, 22 argumentos del juego y 138 entradas de bibliotecas antes de filtrar por sistema. No quedaron placeholders desconocidos. Esta comprobación no ejecuta el juego.

## Revisión visual y funcional 1.1.0

La versión 1.1.0 añade estado enriquecido del servidor con latencia, versión y MOTD, copia rápida de la IP, primera configuración guiada, diagnóstico de memoria y disco, recomendación de RAM, progreso visible con fases y velocidad estimada, noticias remotas con fallback local y aviso remoto de mantenimiento. No se añadió modo seguro.

El contenido editorial del launcher se puede actualizar publicando `config/content.json` en el repositorio configurado por `contentUrl`. Si la URL remota falla o aún no existe, el launcher usa la copia local empaquetada y sigue funcionando.


## Revisión visual y funcional 1.1.1

Se verificó la pantalla Aventura a 1440x900. La franja de anuncio, Crónicas, ping, MOTD y el botón de reparación del panel principal ya no aparecen. El botón de juego conserva fondo naranja en hover, utiliza una espada vectorial y el perfil muestra un rostro de skin con fallback local. El sistema de reparación permanece en Mi equipo. Los siete archivos de audio usados por la interfaz y la música están incluidos en el patch. Se ejecutaron 21 pruebas automatizadas con resultado satisfactorio.
