# Gluplandia Launcher 1.2.6

## Corrección de timing y volumen de audio

- Halls of the Iron Deep tiene más presencia que en 1.2.5.
- El master del archivo pasó de -5 dB a -1.5 dB.
- El volumen inicial para instalaciones nuevas pasa de 9% a 11%.
- Mientras Java, Minecraft, recursos o mods se preparan, la música conserva el 90% del volumen configurado.
- Pulsar JUGAR A GLUPLANDIA ya no dispara inmediatamente el efecto especial.
- El efecto especial se reproduce únicamente cuando Electron recibe `game-started`, es decir, después de que el proceso de Minecraft haya sido lanzado.
- En ese mismo momento la música hace fade out y entra la animación de portal.
- Se eliminó el sonido de éxito genérico de `game-started` para no superponer dos efectos.
