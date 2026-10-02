# Cuaderno docente

Cuaderno del profesorado para el móvil y el ordenador. Funciona sin conexión y se instala como una app (PWA). Los datos se guardan en tu dispositivo y en tu propio Google Drive.

Está pensado para la evaluación por competencias de la LOMLOE (currículo de Aragón), pero cada asignatura se configura a medida: competencias, criterios, instrumentos, evaluaciones y reglas de cálculo.

## Qué hace

- **Hoy**: las clases del día según tu horario, con la que toca ahora. Desde aquí pasas lista y anotas lo realizado y lo pendiente. También ves lo que queda por corregir y los avisos (faltas, Classroom, copia de seguridad).
- **Cuaderno**: notas por evaluación y nota final. Se califica alumno a alumno con un toque por criterio (rúbrica), y la nota se calcula en cascada: criterios → competencias específicas → evaluación → final.
- **Planificar**: unidades didácticas, sesiones en el calendario, actividades con sus criterios, rúbricas y cobertura del currículo.
- **Seguimiento**: avance de la programación, resultados del grupo y un **informe del docente** por evaluación y curso, con puntos fuertes y áreas de mejora.
- **Asistencia**: lista en tarjetas o en tabla (presente, ausente, retraso, justificada), observaciones del aula y aviso de faltas.
- **Informes**: ficha de cada alumno con su perfil competencial, y vista del grupo. Se imprimen en PDF.
- **Comunicación con el alumnado**: correos con plantillas y marcadores, y anuncios en el tablón de Classroom.
- **Programación didáctica**: documento con los apartados que pide la normativa. Lo que sale de tus datos se genera solo; el resto se redacta en la app. Se imprime en PDF o se descarga para Word.
- **Currículo**: competencias específicas, criterios, concreciones, descriptores, saberes y objetivos de etapa. Incluye matriz, mapa de relaciones, carga con ayuda de una IA y versiones guardadas.
- **Calendario escolar**: festivos, fechas de las evaluaciones, horas del centro y horario de cada grupo. Con ellos calcula las sesiones previstas.
- **Google Classroom**: importa alumnado y tareas, trae notas y rúbricas, crea tareas y envía notas. Avisa de entregas sin corregir, tareas sin entregar, comentarios y publicaciones del alumnado.
- **Exportar**: Excel, CSV y relleno del listado de calificaciones de SIGAD (.xls).
- **Copias**: sincronización entre dispositivos, copia diaria en Drive y copia descargable.

## Puesta en marcha

### 1. Tu copia de la app (GitHub Pages)
1. Haz un *fork* de este repositorio en tu cuenta de GitHub. Puedes renombrarlo, pero entonces cambia `base` en `vite.config.ts`.
2. En tu repositorio: **Settings → Pages → Source: GitHub Actions**.
3. En **Actions**, espera a que el flujo «Desplegar» termine en verde. Cada subida pasa los tests antes de publicarse.
4. La app queda en `https://TU_USUARIO.github.io/cuaderno-docente/`. En Android, menú ⋮ → **Instalar aplicación**. En iPhone, Compartir → **Añadir a pantalla de inicio**.

La app se puede usar sin el paso 2, pero entonces los datos solo están en ese dispositivo.

### 2. Apps Script (Drive, Classroom y correo)
Usa la cuenta de Google con la que das clase en Classroom.
1. En script.google.com crea un **Nuevo proyecto**.
2. **Configuración del proyecto** → marca «Mostrar el archivo de manifiesto appsscript.json». Pega `apps-script/appsscript.json` y `apps-script/Code.gs`. Guarda.
3. Ejecuta `generarToken` y copia el token del **Registro de ejecución**.
4. Ejecuta `autorizar` y acepta los permisos. Ejecuta también `instalarCopiaDiaria` (copia diaria en Drive; guarda las últimas 30).
5. **Implementar → Nueva implementación → Aplicación web**. Ejecutar como: **Yo**. Acceso: **Cualquier usuario**. Copia la URL (termina en `/exec`).
6. En la app, **Más → Conexión y copias**: pega la URL y el token, y pulsa **Probar conexión**.

Para **actualizar el Apps Script** cuando cambie: pega de nuevo `Code.gs` y `appsscript.json` y ejecuta `autorizar`. Luego ve a **Implementar → Gestionar implementaciones → lápiz → Nueva versión**. La URL no cambia.

Notas:
- Los comentarios de Classroom no salen en su API. La app los lee de los avisos que Classroom manda por correo, así que deja activadas esas notificaciones. Si tu centro bloquea el permiso de correo, todo lo demás sigue funcionando.
- Algunas cuentas educativas no dejan escribir notas en Classroom ni enviar correo. En ese caso la app avisa del error y lo demás funciona.

### 3. Primeros pasos en la app
La app empieza vacía. La pantalla **Hoy** muestra una lista de puesta en marcha con cada paso:
1. **Calendario escolar**: festivos y fechas de las evaluaciones (puedes pegar la respuesta de una IA). Después, las horas del centro y el horario de cada grupo.
2. **Asignatura**: en **Más → Nueva asignatura**, parte de la plantilla LOMLOE, la de FP, una vacía o una copia de otra. Carga el currículo con la ayuda de una IA o a mano en **Currículo**.
3. **Evaluación y configuración**: instrumentos y sus pesos, peso de cada evaluación, de qué sale la nota (competencias o instrumentos), redondeo, entregas tardías, pérdida de evaluación continua, convocatoria extraordinaria y observaciones del aula.
4. **Grupos y alumnos**: pega una lista, importa un CSV o trae el alumnado de Classroom.
5. **Planificar**: unidades con sus criterios, saberes y sesiones. Después, «Repartir unidades» en el calendario y las actividades de cada unidad.
6. Descarga una **copia de seguridad**.

## Cómo se calcula la nota

Cada asignatura elige de dónde sale la nota de cada evaluación:

- **Por competencias** (LOMLOE). Cada actividad pertenece a un instrumento y evalúa unos criterios. La nota de un criterio combina las actividades que lo evalúan, ponderadas por el peso de su instrumento. Un criterio con concreciones es la media de ellas. Cada competencia específica es la media de sus criterios, y la evaluación es la media de las competencias. Las competencias clave salen de los descriptores; se muestran en el perfil, pero no son nota.
- **Por instrumentos**: media ponderada de los instrumentos. Dentro de cada uno, media de sus actividades según su peso.

En los dos casos, lo que aún no se ha evaluado no cuenta como cero. La nota final es la media ponderada de las evaluaciones, con los decimales y la nota mínima que configures. Todo se ajusta en **Evaluación y configuración**.

## Privacidad

- El repositorio es público y solo tiene el código. Nunca subas datos del alumnado ni tu token.
- Los datos viven en el navegador (IndexedDB) y en un archivo `cuaderno-docente-db.json` de tu Drive. Nadie más tiene acceso.
- El token protege tu Apps Script. Si lo compartes por error, ejecuta `generarToken` de nuevo y pégalo en la app.

## Desarrollo

```bash
npm ci
npm run dev        # servidor local
npm run typecheck
npm test           # tests del motor de cálculo (vitest)
npm run build
```

- `src/core`: lógica sin interfaz y con tests (evaluación, reglas, planificación, programación didáctica, informes, SIGAD…).
- `src/ui`: pantallas en React.
- `src/data`: base de datos local (Dexie), sincronización y llamadas al Apps Script.
- `src/catalogs`: descriptores operativos oficiales y catálogos que usan los tests.
- `apps-script`: servidor en Google Apps Script.

Stack: React, TypeScript, Vite, Dexie y vite-plugin-pwa.
