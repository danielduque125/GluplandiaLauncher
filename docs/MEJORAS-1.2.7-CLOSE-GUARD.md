# Gluplandia Launcher 1.2.7

## Guardián de cierre temático

Se reemplazó el `showMessageBox` blanco de Windows que aparecía al intentar cerrar el launcher durante una operación o mientras Minecraft estaba abierto.

### Operación en curso
- Modal propio de React con estética dungeon.
- `Seguir esperando` vuelve al launcher.
- `Cancelar y salir` aborta la operación mediante `AbortController`, espera a que termine de forma segura y cierra el launcher.
- No se fuerza el proceso si la tarea todavía no terminó de cerrarse.

### Minecraft en ejecución
- El launcher no mata Minecraft ni arriesga la partida.
- El modal explica que Minecraft debe cerrarse normalmente.
- `Volver a Minecraft` minimiza el launcher.
- `Quedarme aquí` cierra el modal.
- Cuando Minecraft termina, el modal se retira automáticamente.

### UX
- Fondo oscuro con blur.
- Panel dungeon con runas, emblema y estado contextual.
- Animaciones discretas.
- Sonido suave según el tipo de advertencia.
- ESC descarta el modal sin cerrar el launcher.
- Diseño adaptable a ventanas pequeñas.
