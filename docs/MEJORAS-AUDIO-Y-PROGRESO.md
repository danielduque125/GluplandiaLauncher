# Audio y progreso del portal

La interfaz incorpora efectos sonoros locales y una pista ambiental original almacenados en `public/sounds`. No se añadió ninguna dependencia de npm.

La música ambiental arranca a volumen bajo, baja de intensidad durante la preparación y se desvanece cuando Electron recibe `game-started`. Vuelve suavemente cuando recibe `game-exit`. El usuario puede activar o desactivar música y efectos, además de ajustar ambos volúmenes desde `Mi equipo`. Las preferencias de audio se guardan en `localStorage` del renderer.

El progreso dejó de depender del footer inferior. La tarjeta `launch-status` vive dentro del panel de lanzamiento y muestra la etapa actual, el archivo o recurso, porcentaje cuando existe un total conocido y una animación indeterminada cuando la operación no expone tamaño. Los servicios de Java, Minecraft y modpack ahora etiquetan sus descargas con fases específicas para que la interfaz pueda describirlas correctamente.
