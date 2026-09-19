# Gluplandia Launcher 1.3.0

Corrección del descargador de Java.

- Las descargas incompletas ahora se conservan como archivo .part.
- Se utiliza HTTP Range para continuar desde el último byte descargado cuando el servidor lo permite.
- Se aumentaron los intentos de recuperación.
- Un corte temporal de red ya no obliga a comenzar Java desde cero.
- Se mantiene la validación SHA antes de aceptar el runtime.
