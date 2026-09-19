# Gluplandia Launcher 1.2.8

## Arranque real de Minecraft

La versión anterior consideraba Minecraft "abierto" apenas `java.exe` era creado.
Eso hacía que el sonido especial y el estado `EN LA AVENTURA` aparecieran demasiado pronto.

### Nuevo flujo

1. Terminan Java, Minecraft, assets y modpack.
2. El launcher entra en `INICIANDO MINECRAFT`.
3. `java.exe` arranca, pero todavía no se marca el juego como listo.
4. En Windows se consulta el proceso hasta detectar una ventana principal visible.
5. Si esa detección no está disponible, se usan hitos tardíos del `Render thread`
   (OpenAL, Sound engine, creación de atlas o conexión) como fallback.
6. Solo entonces se emite `game-ready`.
7. En `game-ready`:
   - se reproduce el efecto especial de lanzamiento;
   - `Halls of the Iron Deep` hace fade out;
   - el botón pasa a `EN LA AVENTURA`;
   - el estado cambia a `Minecraft está abierto`.

### UX

- Mientras carga aparece `Minecraft se está iniciando`.
- Se muestra un contador MM:SS.
- Después de 45 segundos se explica que el primer arranque con mods puede tardar más.
- El botón Jugar permanece bloqueado durante esta fase para impedir lanzamientos duplicados.
- Si Minecraft se cierra antes de llegar a `game-ready`, el launcher lo informa y conserva
  las últimas líneas en Registro.
- El guardián de cierre diferencia entre Minecraft iniciándose y Minecraft ya abierto.
