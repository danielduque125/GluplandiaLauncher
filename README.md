# Gluplandia Dungeons para Windows

Este proyecto adapta OpenLauncher al servidor play.gluplandia.com. Incluye el código de los dos accesos, instalación de Minecraft Java 26.2 con Fabric, instalación de Java 25, sincronización del modpack y actualización del programa mediante NSIS. La interfaz usa el logo y el fondo de mazmorra del sitio de Gluplandia.

El código base inspeccionado corresponde al commit `0f756373fd2c24d57ebe3b761e3af28f964b4a17` de https://github.com/CesarGarza55/OpenLauncher. Se conserva su licencia GPL-2.0 y la atribución. Los cambios de Gluplandia se realizaron el 14 de septiembre de 2026.

La compilación del frontend y las pruebas automatizadas se ejecutaron en Linux. Esta entrega es código fuente y no incluye un instalador Windows ya certificado. Antes de distribuirlo faltan tu registro Microsoft, el manifiesto de tu modpack real, tu repositorio de releases y tu certificado de firma. El arranque completo del juego, la aprobación de la aplicación Microsoft y una actualización entre dos instaladores firmados requieren validación en Windows. El manifiesto de muestra contiene descargas reales verificadas, pero su conjunto de mods todavía no se ha probado dentro del juego.

## Ejecutar en desarrollo

Instala Node.js 24 LTS x64 en Windows. El jugador final no necesitará Node ni npm. Abre PowerShell en la carpeta del proyecto y ejecuta estos comandos.

```powershell
npm ci
Copy-Item .env.example .env
npm run dev
```

Edita `.env` antes de probar el juego. `GLUPLANDIA_MANIFEST_URL` debe apuntar a un manifiesto HTTPS que hayas publicado y `GLUPLANDIA_MICROSOFT_CLIENT_ID` debe contener tu Application Client ID. El acceso local no requiere ese identificador. Un manifiesto vacío con `files: []` permite probar primero Minecraft y Fabric sin mods, pero debe contener una versión de Fabric válida.

```dotenv
GLUPLANDIA_MANIFEST_URL=https://gluplandia.com/launcher/manifest.json
GLUPLANDIA_MICROSOFT_CLIENT_ID=TU_APPLICATION_CLIENT_ID
GLUPLANDIA_CONTENT_URL=https://gluplandia.com/launcher/content.json
```

Las variables de `.env` se usan exclusivamente en desarrollo. El ejecutable instalado lee `config/launcher.json`, que queda empaquetado dentro de la aplicación. El Client ID es público y no debe confundirse con un secreto. No uses secretos OAuth dentro de Electron.

```powershell
npm test
npm run build
npm start
```

`npm run dev` inicia Vite y Electron. `npm start` abre la compilación de `dist`. Abrir la URL de Vite en un navegador convencional permite ver el frontend, pero las funciones del launcher necesitan el puente de Electron.

## Configuración de la edición distribuible

Completa `config/launcher.json`. Conserva `minecraftVersion` en `26.2`. `manifestUrl` apunta al manifiesto administrado, `microsoftClientId` identifica tu aplicación y `manifestPublicKey` contiene la clave pública PEM Ed25519. `updatePublisher` debe coincidir exactamente con el nombre del publicador de tu certificado Authenticode. Activa `releaseMode` cuando vayas a compilar una edición de distribución.

`contentUrl` es opcional y permite cambiar el fondo y las noticias sin recompilar. `config/content.example.json` muestra su formato. Las noticias se presentan como texto React y nunca como HTML remoto. El fondo remoto debe ser una imagen HTTPS. La aplicación conserva una imagen local de reserva.

El campo `allowUserMods` habilita la carga de la carpeta `user-mods`. No bloquea modificaciones externas del sistema de archivos. Si necesitas imponer estrictamente el conjunto de mods, debes añadir comprobaciones en el servidor.

La configuración inicial deja vacíos los identificadores que debes proporcionar. No contiene credenciales inventadas ni utiliza la aplicación de otro launcher.

## Registro Microsoft y acceso oficial

Abre https://entra.microsoft.com y entra en App registrations. Crea un registro con un nombre como Gluplandia Launcher y soporte para cuentas personales Microsoft. También sirve el tipo que admite cuentas organizativas y personales, aunque el flujo implementado utiliza el tenant `consumers`.

Copia el valor Application Client ID. En Authentication habilita Allow public client flows. No crees ni incluyas un client secret. Esta implementación usa OAuth Device Authorization Grant. El usuario pulsa el botón Microsoft, ve un código en el launcher y lo introduce en la página oficial que se abre en el navegador.

Este flujo no utiliza redirect URI. No debes registrar `http://localhost:8080/callback` para este código. Esa dirección pertenecía al flujo anterior de OpenLauncher. El endpoint de autorización es `https://login.microsoftonline.com/consumers/oauth2/v2.0/devicecode`, el intercambio se realiza en `/token` y los scopes son `XboxLive.signin offline_access`.

Crear el registro en Entra no garantiza que Minecraft Services acepte inmediatamente la aplicación. OpenLauncher indica un trámite de acceso para launchers. Consulta el formulario enlazado por el proyecto y completa la información de tu aplicación. No reutilices un Client ID ajeno para eludir este proceso.

https://forms.office.com/Pages/ResponsePage.aspx?id=v4j5cvGGr0GRqy180BHbR-ajEQ1td1ROpz00KtS8Gd5UNVpPTkVLNFVROVQxNkdRMEtXVjNQQjdXVC4u

El módulo `electron/services/auth.js` intercambia el token Microsoft por un token Xbox Live y después XSTS. A continuación solicita el token de Minecraft Services, comprueba entitlements y obtiene el perfil Java. Una cuenta sin derecho de acceso o sin perfil no se transforma en una cuenta offline automáticamente. Se muestra el error y se conserva la separación entre accesos.

El refresh token se guarda con `safeStorage` de Electron, que usa el cifrado del sistema en Windows. No existe una alternativa de almacenamiento en texto plano. El access token solo vive en el proceso principal y en la invocación del juego. El renderer recibe nombre, UUID y tipo de perfil. Cerrar sesión elimina el refresh token local. Un fallo temporal de red no lo borra.

Java necesita recibir el access token para arrancar. El launcher usa un archivo temporal de argumentos dentro de la carpeta privada del usuario para evitar el límite de longitud de comandos de Windows. Lo elimina al recibir salida de Java, al salir el proceso y al iniciar de nuevo el launcher. No publiques ni compartas esa carpeta mientras el juego arranca. Este mecanismo no ofrece protección frente a un proceso malicioso que ya opere con los permisos del mismo usuario.

## Acceso por nombre

El nombre admite entre 3 y 16 caracteres ASCII alfanuméricos o guion bajo. El UUID reproduce `UUID.nameUUIDFromBytes` con la cadena UTF-8 `OfflinePlayer:<nombre>`, MD5 y los bits de UUID versión 3. El perfil se persiste en `profile.json`. Un mismo nombre exacto conserva su UUID, incluso después de reinstalar el programa si se mantiene el nombre.

Las mayúsculas importan. `Alex` y `alex` generan UUID distintos. No se normalizan silenciosamente porque eso impediría coincidir con servidores que aplican el algoritmo estándar. Los UUID Microsoft y offline también son distintos. Cambiar de modo puede cambiar inventario, progreso y permisos en el servidor salvo que implementes una migración del lado del servidor.

Este acceso no verifica la propiedad de una cuenta ni concede una licencia de Minecraft. Funciona en entornos que acepten perfiles locales. No puede entrar en un servidor con `online-mode=true`. El launcher no cambia esa propiedad ni protege por sí mismo nombres registrados. Un entorno público que admita nombres necesita su propio sistema de identidad y protección frente a suplantaciones. No se implementa un servicio de skins premium para perfiles offline.

## Minecraft, Fabric y Java

La versión 26.2 está publicada. Los metadatos oficiales consultados indican `java-runtime-epsilon` y Java major 25. El manifiesto de muestra fija Fabric Loader 0.19.5. No se selecciona automáticamente un loader nuevo en cada arranque. Debes probarlo y cambiar `fabricVersion` mediante una revisión nueva del manifiesto.

`game.js` consulta el catálogo de Mojang, busca exactamente la release 26.2 y comprueba el SHA-1 de sus metadatos. Descarga el cliente y las bibliotecas desde los endpoints oficiales de los metadatos. Verifica tamaños y hashes cuando están disponibles. Los assets se verifican por SHA-1 y se procesan con una concurrencia de ocho. Una descarga incorrecta bloquea el arranque.

Fabric se instala mediante el perfil JSON oficial de Fabric Meta. No se ejecuta un instalador gráfico. El launcher combina sus bibliotecas y argumentos con los de Mojang. La resolución conserva clasificadores nativos y aplica reglas de sistema y arquitectura. Los argumentos JVM incluyen las opciones de acceso nativo que publica Minecraft 26.2. Las bibliotecas Fabric sin hash embebido usan el checksum publicado por su repositorio Maven.

`java.js` detecta primero un runtime administrado, después JAVA_HOME y finalmente java.exe en PATH. Solo acepta Java 25. Si no lo encuentra, obtiene Eclipse Temurin JDK 25 x64 desde la API de Adoptium. Verifica el SHA-256 del ZIP, valida las rutas antes de extraer y comprueba `java -version`. Se utiliza JDK porque ofrece un runtime completo y una descarga verificable para Windows. La aplicación instala el runtime dentro de sus propios datos y no modifica el PATH global.

La descarga inicial requiere conexión y varios gigabytes libres. El flujo normal también requiere acceder al manifiesto. El programa no inicia una versión antigua del modpack cuando no puede confirmar el manifiesto vigente. El modo por nombre se refiere a la identidad, no a un modo completamente desconectado de internet.

## Ubicación de los archivos

La carpeta base en Windows es `%APPDATA%\Gluplandia`. La instancia única es `%APPDATA%\Gluplandia\instances\gluplandia`. No se escribe en `%APPDATA%\.minecraft`.

Dentro de la instancia se encuentran `versions`, `libraries`, `assets`, `natives`, `mods`, `config`, `resourcepacks` y `shaderpacks`. Minecraft también puede crear `saves`, `screenshots`, `logs` y `options.txt`. Estas últimas rutas no forman parte de las áreas administrables por el manifiesto.

Los mods oficiales se guardan en `mods`. Los personales se guardan en `user-mods` y Fabric los carga con `-Dfabric.addMods=<ruta absoluta>`. Fabric Loader 0.19.5 admite un directorio de JAR en esa propiedad. Dos archivos con el mismo ID de mod pueden provocar un error de Fabric aunque sus nombres difieran. El launcher preserva los mods personales y no resuelve incompatibilidades inventando versiones.

Las configuraciones, resourcepacks y shaderpacks necesitan sus rutas habituales para que sus consumidores las encuentren. El registro `managed.json`, situado en la carpeta base, mantiene su propiedad por archivo. Los archivos no registrados se conservan. Si un archivo personal ocupa una ruta que pasa a ser oficial, se copia a `backups` antes de reemplazarlo.

Los archivos oficiales de `config` se restauran al estado del manifiesto al verificar. Las modificaciones hechas por el jugador se conservan como copias antes de reemplazarlas. No incluyas una configuración en el manifiesto si deseas que cada jugador la pueda editar libremente. Descargar un resourcepack o shaderpack no lo activa por sí solo. Su selección requiere la configuración apropiada del juego o del mod que lo utilice. Los shaders requieren además un mod compatible como Iris, que no está incluido en la muestra.

## Crear y publicar tu modpack

`config/manifest.example.json` contiene un manifiesto real generado en esta ejecución. Incluye Fabric API, Mod Menu, Sodium y una dependencia requerida de Mod Menu. Sus URLs apuntan a versiones concretas de Modrinth y sus SHA-256 fueron calculados sobre los archivos descargados. Una dependencia se identifica como beta en su nombre, aunque la versión de Mod Menu la declara requerida. Debes probar este conjunto antes de adoptarlo.

La lista `files` contiene tanto mods como configuraciones o paquetes visuales. El primer segmento de `path` identifica el área. Cada entrada incluye `id`, `name`, `path`, `url`, `sha256`, `size` en bytes y `required`. La versión del pack se muestra al usuario, y `revision` es un entero creciente que impide retroceder a una publicación anterior. `schemaVersion` permanece en 1.

Puedes crear otra muestra desde versiones publicadas por los autores mediante el siguiente comando. La herramienta se ejecuta como administrador del pack. Los launchers de los jugadores no vuelven a consultar cuál es la versión más reciente de cada mod.

```powershell
npm run pack:sample -- sample-pack
```

La herramienta descarga mods compatibles con 26.2 y Fabric, recorre sus dependencias obligatorias y fija identificadores de versiones y hashes. No actualiza tu manifiesto publicado sin tu intervención. El archivo de ejemplo incluido sigue siendo reproducible aunque posteriormente existan versiones nuevas.

Para construir el manifiesto de tu pack real, prepara una carpeta `pack` y coloca tus JAR en `pack/mods`, las configuraciones en `pack/config`, los paquetes de recursos en `pack/resourcepacks` y los shaders en `pack/shaderpacks`. Debes usar archivos extraídos, no un RAR o ZIP de mods como entrada única. Cada mod se distribuye como JAR individual para permitir actualizaciones parciales.

```powershell
npm run pack:build -- ./pack https://gluplandia.com/launcher/packs/1.0.0 1.0.0 1 0.19.5
```

La herramienta escribe `pack/manifest.json` con los hashes y tamaños reales. El servidor debe alojar los archivos en las rutas resultantes. Puedes publicar los binarios en GitHub Releases, CDN o almacenamiento propio y editar las URLs antes de firmar. La licencia de cada mod determina si puedes alojar otra copia. Las URLs originales de Modrinth evitan copiar los binarios a tu propio servidor.

Un archivo `pack/pack-options.json` permite personalizar el nombre visible y marcar contenido opcional. El ejemplo siguiente expresa opciones para una ruta concreta, que debe existir en tu pack.

```json
{
  "resourcepacks/paquete-visual.zip": {
    "name": "Paquete visual de Gluplandia",
    "required": false
  }
}
```

Los opcionales se seleccionan en Mi equipo. Los obligatorios siempre se sincronizan. Deseleccionar un opcional elimina su copia administrada durante la próxima preparación y conserva una copia de seguridad.

## Firmar el manifiesto

Genera las claves fuera del repositorio. La clave privada debe quedar bajo tu control. La pública se incluye en `config/launcher.json` antes de compilar el launcher.

```powershell
npm run pack:sign -- keygen C:/Claves/gluplandia-pack
npm run pack:sign -- sign ./pack/manifest.json C:/Claves/gluplandia-pack.private.pem
```

Para cargar la clave pública en la configuración sin modificar manualmente los saltos de línea, usa PowerShell.

```powershell
$config = Get-Content config/launcher.json -Raw | ConvertFrom-Json
$config.manifestPublicKey = Get-Content C:/Claves/gluplandia-pack.public.pem -Raw
$config | ConvertTo-Json -Depth 10 | Set-Content config/launcher.json -Encoding utf8NoBOM
```

`utf8NoBOM` requiere PowerShell 7. Si usas Windows PowerShell 5.1, guarda el JSON en UTF-8 sin BOM desde tu editor. Las herramientas Node requieren JSON válido sin BOM.

Publica los binarios antes que el manifiesto. Publica después `manifest.json` y `manifest.json.sig` en la misma carpeta. Configura caché corta o revalidación para ambos. Una publicación temporalmente desincronizada se rechazará por firma y podrá reintentarse cuando ambos archivos estén visibles. Un CDN con cambio atómico de versión evita esa ventana.

Cada modificación del manifiesto, incluidas URLs y cambios de nombres, requiere incrementar `revision` y volver a firmar. Para volver a un conjunto anterior de mods, publica ese conjunto con una revisión superior. No reduzcas la revisión. No incluyas la clave privada en GitHub, en el ZIP del proyecto ni en el ejecutable.

## Sincronización y reparación

El launcher descarga el manifiesto al abrir y vuelve a comprobarlo antes de jugar o reparar. Verifica su firma en las ediciones de distribución. Después verifica los archivos seleccionados con SHA-256 y tamaño. Descarga únicamente los que falten o no coincidan y usa archivos `.part` hasta completar la verificación.

Las descargas nuevas se preparan antes de modificar el pack activo. Un fallo en esa fase deja la instalación anterior intacta. Antes de aplicar los cambios se guarda un journal con las rutas administradas y se copian los archivos que serán reemplazados. Una interrupción durante la aplicación puede dejar temporalmente archivos de dos versiones, pero el juego no se inicia y la siguiente verificación completa la reparación. No se presenta este mecanismo como una transacción atómica de toda la carpeta.

Los mods retirados se borran solo si están registrados como administrados. Las rutas desconocidas se conservan. El botón Reparar verifica también los archivos de Minecraft, bibliotecas y assets, y luego el pack. El flujo normal comprueba los mismos hashes del juego y del pack. Por eso una reparación sin corrupción no vuelve a descargar todo.

Las rutas absolutas, `..`, enlaces simbólicos, nombres reservados de Windows y colisiones sin distinguir mayúsculas se rechazan. Las URLs de descarga exigen HTTPS y no pueden redirigir a HTTP. Se limita el tamaño de los manifiestos y archivos. La firma de un manifiesto autentica al publicador, pero sigue siendo necesario confiar en los mods que el administrador firma, porque un JAR ejecuta código.

Las copias y los blobs no tienen una purga automática en esta versión. Puedes revisarlos desde Mi equipo. No elimines el registro `managed.json` si quieres conservar el seguimiento de archivos retirados.

## Compilar el instalador Windows

Ejecuta la compilación en Windows 10 u 11 x64 con Node.js 24. Electron Builder descarga sus herramientas de NSIS. No necesitas el script NSIS manual que utilizaba OpenLauncher.

```powershell
npm ci
npm test
npm run build:win:installer
```

El resultado esperado es `release/Gluplandia-Setup-1.0.0.exe`. El nombre cambia con `package.json.version`. La configuración también genera `latest.yml` y el blockmap cuando corresponde al feed de actualización. Conserva esos archivos para publicar una release.

```powershell
npm run build:win:portable
```

El portátil se llama `release/Gluplandia-Portable-1.0.0.exe`. El portátil no se autoactualiza. La actualización automática se limita al instalador NSIS para evitar reemplazos inseguros del ejecutable en uso. Ambos mantienen sus datos en la carpeta de usuario de Gluplandia.

## Firma y actualización del programa

La dependencia nueva es `electron-updater` 6.8.9. Se conserva electron-builder y se reemplaza la descarga directa de ejecutables del upstream. El proyecto usa versiones resueltas en `package-lock.json`; utiliza `npm ci` para repetirlas.

Crea tu repositorio de releases y configura `build.publish` en `package.json`. La propuesta inicial es `danielduque125/GluplandiaLauncher`, que debes crear o reemplazar por un repositorio tuyo existente. El proceso no publica nada en el repositorio de CesarGarza55.

Configura `build.win.publisherName` con el mismo valor que `config/launcher.json.updatePublisher`. Mantén `verifyUpdateCodeSignature` activado. Usa un certificado Authenticode válido cuyo publicador corresponda a ese valor. El launcher solo habilita la actualización automática en la edición empaquetada NSIS con `releaseMode=true` y publicador configurado.

```powershell
$env:CSC_LINK = 'C:\Certificados\gluplandia.pfx'
$env:CSC_KEY_PASSWORD = 'TU_CONTRASEÑA_LOCAL'
npm run release:check
npm run build:win:installer
```

No guardes la contraseña en un archivo versionado. Puedes usar los secrets `CSC_LINK` y `CSC_KEY_PASSWORD` en GitHub Actions. La configuración de firma es distinta de la clave Ed25519 del modpack. Una firma autentica el programa y la otra autentica el contenido administrado.

El workflow incluido compila en `windows-latest` mediante ejecución manual o un tag `v*`. Guarda artefactos y no publica automáticamente una release. Los tags de distribución exigen configuración completa y un instalador con firma válida. Una ejecución manual permite generar un instalador de prueba sin habilitar las actualizaciones de producción.

Para publicar, incrementa `package.json.version`, actualiza el lockfile con `npm install --package-lock-only`, recompila y crea una release pública con el tag correspondiente. Adjunta el instalador NSIS, su blockmap y `latest.yml`. Todos deben pertenecer a la misma compilación. Puedes hacerlo desde GitHub o con estos comandos después de revisar los artefactos.

```powershell
git tag v1.0.1
git push origin v1.0.1
gh release create v1.0.1 --repo danielduque125/GluplandiaLauncher --title "Gluplandia 1.0.1" --notes "Actualización del launcher"
gh release upload v1.0.1 release/Gluplandia-Setup-1.0.1.exe release/Gluplandia-Setup-1.0.1.exe.blockmap release/latest.yml --repo danielduque125/GluplandiaLauncher
```

Ajusta los nombres si electron-builder genera un blockmap con otro nombre. No adjuntes el portátil como sustituto del instalador referido por `latest.yml`. La release inicial debe instalarse manualmente una vez.

Al abrir, el launcher comprueba si hay una versión superior, la descarga y muestra una acción de reinicio. No reinicia automáticamente una partida. El actualizador verifica el checksum de la descarga y la firma Authenticode. Mantén tu namespace de GitHub bajo control mientras existan instalaciones que lo consulten.

## Branding y compatibilidad con el servidor

`public/branding/logo.png` contiene el logo de Gluplandia. `hero.png` muestra al grupo entrando en la mazmorra y `icon.png` contiene el icono simplificado. `script/icon.ico` se usa en Windows. La carpeta `public/branding` queda incluida en `dist` durante la compilación.

Para cambiar el fondo sin recompilar, publica `content.json` con una nueva `bannerUrl`. Las noticias admiten `title` y `body`. El estado y el número de jugadores se consultan con el protocolo Server List Ping de Java y resolución SRV. Si no hay respuesta, se muestra Estado no disponible en lugar de inventar una población.

Este launcher ejecuta Minecraft Java. No instala Minecraft Bedrock ni hace que Bedrock cargue mods Fabric. El acceso Bedrock a play.gluplandia.com depende de la configuración y los componentes de tu servidor. Los datapacks y los plugins del servidor tampoco se copian a la carpeta mods del cliente. Solo debes distribuir mods y recursos que correspondan al cliente.

## Validación antes de entregar a jugadores

Realiza la instalación en un Windows limpio sin Java. Entra con un nombre y un entorno de prueba compatible. Comprueba el arranque de Fabric 26.2 y la conexión a Gluplandia. Verifica después el login Microsoft con una cuenta Java y un Client ID aprobado. Prueba el refresh tras cerrar y abrir la aplicación.

Publica una revisión de prueba con un mod nuevo, otro retirado y una configuración cambiada. Corrompe un JAR administrado y confirma que Reparar lo restaura. Comprueba que user-mods, mundos y capturas siguen presentes. Cancela una descarga y vuelve a abrir. Confirma que no arranca una instalación parcial.

Instala una release firmada anterior y publica una superior con su metadata. Comprueba la descarga, la verificación del publicador y el reinicio sin perder el perfil. Un build exitoso del frontend no sustituye estas pruebas.

## Distribución y licencias

OpenLauncher se publica bajo GPL-2.0. Conserva LICENSE y proporciona el código fuente correspondiente a los binarios que distribuyas conforme a esa licencia. Esta entrega mantiene la atribución del autor y el README original en docs.

Minecraft se descarga desde los servicios indicados por Mojang y no se incluye en el ZIP ni en el instalador. La EULA no permite redistribuir libremente el cliente modificado. El acceso por nombre no sustituye la licencia del juego. Revisa las licencias de los mods antes de alojar copias y conserva las licencias del runtime que se extraen junto con Java. Gluplandia es la identidad del servidor y no debe presentarse como un producto oficial de Mojang.

La arquitectura y los archivos modificados se explican en `docs/ARQUITECTURA.md`. Las evidencias y límites de las pruebas se registran en `docs/VALIDACION.md`.
