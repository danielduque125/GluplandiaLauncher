# Gluplandia Launcher 1.1.0

Esta revisión se centra en claridad, identidad visual y reducción de soporte técnico para jugadores.

## Aventura

- Estado del servidor con jugadores, latencia, versión y MOTD.
- Botón para copiar `play.gluplandia.com`.
- Aviso remoto de mantenimiento controlado por `config/content.json`.
- Panel de progreso integrado con Java, Minecraft, recursos, modpack y estado final.
- Velocidad y tiempo restante cuando una descarga aporta tamaño total.
- Mensaje específico para perfiles locales protegidos por AuthMeReloaded.
- Reparación de instalación más visible y con resultado concreto.
- Crónicas de Gluplandia actualizables desde GitHub sin recompilar el launcher.

## Mi equipo

- Detección de RAM física.
- Recomendación automática de RAM para Minecraft.
- Límite de memoria ajustado al equipo.
- Espacio libre de disco.
- Versión y cantidad de archivos administrados del modpack.
- Controles de audio conservados y reorganizados.
- Versión real del launcher obtenida desde `package.json`.

## Primera ejecución

Se agregó una bienvenida que explica identidad, memoria recomendada y actualización automática del modpack. La pantalla solo aparece una vez y puede cerrarse sin cambiar ajustes.

## Contenido remoto

`config/launcher.json` apunta a `config/content.json` del repositorio de Gluplandia Launcher. Si la URL remota todavía no existe o GitHub no responde, se usa automáticamente la copia local incluida con el launcher.

## Seguridad y distribución

No se relajaron las protecciones de IPC, navegación externa, rutas seguras, hashes de descarga ni almacenamiento de autenticación. `releaseMode` permanece desactivado mientras no exista una clave pública Ed25519 del manifiesto y un certificado de firma de código configurado. No debe activarse en producción omitiendo esos requisitos.
