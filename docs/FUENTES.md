# Fuentes técnicas

El código base se inspeccionó directamente en https://github.com/CesarGarza55/OpenLauncher y se conserva el commit exacto en README.md.

La publicación de Minecraft 26.2 se confirmó en https://www.minecraft.net/en-us/article/minecraft-java-edition-26-2. La instalación utiliza https://piston-meta.mojang.com/mc/game/version_manifest_v2.json y el documento específico enlazado por su entrada 26.2. El requisito Java 25 procede del campo javaVersion de ese documento.

El soporte de Fabric se confirmó en https://fabricmc.net/2026/06/15/262.html. El listado de loaders se obtuvo de https://meta.fabricmc.net/v2/versions/loader/26.2. La carga de directorios personales se verificó en el código de https://github.com/FabricMC/fabric-loader/blob/0.19.5/src/main/java/net/fabricmc/loader/impl/discovery/ArgumentModCandidateFinder.java.

El flujo de autorización por dispositivo está documentado en https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-device-code. El README upstream enlaza el formulario de acceso de aplicaciones Minecraft. Su aprobación no se solicitó en esta ejecución.

Las actualizaciones y verificación del publicador se contrastaron con https://www.electron.build/docs/features/security/ y https://www.electron.build/docs/win/. El proyecto conserva electron-builder 26 y su lockfile. No incorpora automáticamente cambios de configuración exclusivos de la versión 27 de la documentación más reciente.

La API de Adoptium consultada fue https://api.adoptium.net/v3/assets/latest/25/hotspot?architecture=x64&image_type=jdk&os=windows&vendor=eclipse. Las descargas de la muestra proceden de https://api.modrinth.com/v2 y sus URLs concretas se conservan en config/manifest.example.json.

La distribución del cliente y el uso de marca se contrastaron con https://www.minecraft.net/en-us/eula. La licencia GPL-2.0 del proyecto base se conserva en LICENSE.
