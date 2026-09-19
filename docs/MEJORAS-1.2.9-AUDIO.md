# Gluplandia Launcher 1.2.9

## Secuencia de audio

### Al pulsar JUGAR A GLUPLANDIA
Se reproduce `play_button_skill_level_up.ogg`, generado a partir del nuevo audio aportado.
Este sonido sirve como feedback inmediato del botón y no reemplaza el efecto de arranque.

### Mientras se prepara Minecraft
`Halls of the Iron Deep` continúa sonando durante verificaciones, descargas, Java, Fabric y mods.

### Cuando Minecraft está realmente listo
Se conserva `launch_level_up_user.ogg`, el efecto anterior.
Solo se reproduce con `game-ready`, después de detectar la ventana/hito real del cliente.

### Música
`Halls of the Iron Deep` ahora tiene `loop = true`.
Cuando la canción llega al final comienza otra vez automáticamente.
Durante `game-ready` hace fade out como antes y vuelve cuando Minecraft termina.
