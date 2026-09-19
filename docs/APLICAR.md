# Aplicar la entrega

El ZIP contiene la carpeta completa gluplandia-launcher. Puedes usarla directamente como proyecto nuevo y seguir README.md. No contiene node_modules, el cliente Minecraft ni un instalador ya firmado.

El archivo cambios-openlauncher.patch representa los cambios completos contra el commit 0f756373fd2c24d57ebe3b761e3af28f964b4a17. Incluye las imágenes mediante un diff binario. Para aplicarlo a un checkout limpio de OpenLauncher, guarda primero cualquier trabajo propio y ejecuta los comandos siguientes desde una copia de trabajo independiente.

```powershell
git clone https://github.com/CesarGarza55/OpenLauncher.git GluplandiaDesdePatch
cd GluplandiaDesdePatch
git checkout 0f756373fd2c24d57ebe3b761e3af28f964b4a17
git switch -c gluplandia
git apply --check C:/Descargas/gluplandia-launcher/cambios-openlauncher.patch
git apply C:/Descargas/gluplandia-launcher/cambios-openlauncher.patch
npm ci
npm test
```

El patch es una alternativa a usar directamente la carpeta completa. No lo apliques sobre la carpeta que ya contiene los cambios. Si quieres publicar el fork, cambia origin por un repositorio tuyo antes de hacer push. La entrega no ha publicado cambios en GitHub.
