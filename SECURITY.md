# Seguridad y privacidad

## Dónde están los datos
- El repositorio es público y solo contiene código. No hay datos de alumnado, claves ni direcciones en el código ni en el historial.
- Los datos de cada docente viven en su navegador (IndexedDB) y en un archivo de su propio Google Drive. No pasan por ningún servidor de terceros.
- La app publicada solo puede conectarse con Google Apps Script (política de seguridad de contenido). No lleva analítica ni carga recursos de otros sitios.

## Cómo se protege
- **Apps Script.** La aplicación web es pública, así que toda petición debe traer un token secreto de 64 caracteres. Sin él no se ejecuta nada. Las entradas se validan (tablas, identificadores, direcciones de correo, tamaños) antes de usarlas.
- **Token.** Se guarda solo en el dispositivo. Si se filtra, ejecuta `generarToken` en el Apps Script y pega el nuevo en la app: el anterior deja de valer al instante.
- **Navegador.** No se ejecuta HTML ni código que venga de datos. El único punto que genera HTML (la programación didáctica) escapa todo el texto. Las exportaciones a CSV neutralizan las fórmulas.
- **Publicación.** Cada subida pasa comprobación de tipos, linter, tests y auditoría de dependencias antes de publicarse. Las acciones de GitHub van fijadas a un commit y con permisos mínimos.

## Permisos del Apps Script
El manifiesto pide solo lo que usa: Classroom (cursos, alumnado, tareas y tablón), Drive (el archivo de datos y sus copias), envío de correo y lectura del correo para los avisos de comentarios de Classroom. Si no quieres dar el permiso de correo, quita la línea `https://mail.google.com/` de `appsscript.json`: todo funciona salvo los comentarios en Hoy.

## Avisar de un fallo de seguridad
Usa «Report a vulnerability» en la pestaña **Security** del repositorio (aviso privado). No abras una incidencia pública con los detalles.
