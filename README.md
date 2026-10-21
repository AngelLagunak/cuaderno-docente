# Cuaderno docente · Fase 0

Objetivo de esta fase: que la app se abra en tu móvil, se instale, y hable con tu Apps Script.

## Paso 1. Subir el proyecto a GitHub (cuenta Propia)
1. En github.com pulsa **New repository**. Nombre: `cuaderno-docente` (debe llamarse así). Visibilidad: **Public**. Crear.
2. Descomprime el zip en tu ordenador. En el repositorio pulsa **Add file → Upload files** y arrastra TODO el contenido de la carpeta, incluida la carpeta `.github`. Pulsa **Commit changes**.
3. Ve a **Settings → Pages**. En **Source** elige **GitHub Actions**.
4. Ve a la pestaña **Actions**. Espera a que el trabajo "Desplegar" termine en verde (2-3 minutos). Si sale en rojo, copia el mensaje de error y pásamelo.
5. La app estará en `https://TU_USUARIO.github.io/cuaderno-docente/`.

Regla: el repositorio es público. No subas nunca datos de alumnos ni tu token.

## Paso 2. Apps Script (prueba primero en la cuenta Educativa)
1. Entra en script.google.com con la cuenta Educativa. **Nuevo proyecto**. Nómbralo "Cuaderno docente".
2. Borra el código de ejemplo y pega el contenido de `apps-script/Code.gs`. Guarda.
3. Arriba, elige la función `generarToken` y pulsa **Ejecutar**. Acepta los permisos. Abre **Registro de ejecución** y copia el token (línea `TOKEN: ...`).
4. **Implementar → Nueva implementación → Aplicación web**. Ejecutar como: **Yo**. Quién tiene acceso: **Cualquier usuario**. Implementar y autorizar. Copia la **URL de la aplicación web** (termina en `/exec`).
5. Si la cuenta Educativa bloquea alguno de estos pasos, anota el mensaje exacto y repite en la cuenta Propia.

## Paso 3. Probar
1. Abre la app. Pega la URL y el token. Pulsa **Probar conexión**.
2. Resultado esperado: `"ok": true` y tu correo.
3. En Android (Chrome): menú ⋮ → **Instalar aplicación**. Ponla en modo avión y ábrela: debe cargar.

## Decisiones de diseño vigentes (cambios respecto a la versión 1)
- La nota oficial sale de **instrumentos de evaluación ponderados** (Proyectos Artísticos: Proyectos 45 %, Cuaderno 25 %, Dinámica de aula 15 %, Exámenes 15 %).
- Cada actividad pertenece a un instrumento y lleva los criterios que trabaja. Esos criterios alimentan el radar de competencias, con el mismo peso para todas las competencias.
- Evaluación ordinaria: 30 % + 30 % + 40 % por trimestres. Final entero; decimales intermedios.
- Modelado y Maquetismo: 3 instrumentos (60/30/10), sin criterios ni competencias. Sus puntos son "aspectos" evaluables.
- Currículo por unidades didácticas: no se precarga. Las programas tú en la app.

## Fase 1-2
- **Configuración**: instrumentos, evaluaciones (pesos editables), cálculo y estructura curricular (niveles y relaciones), igual en todas las materias.
- **Currículo**: añadir, editar y borrar elementos; vincular es opcional.
- **Grupos**: alumnos por pegado o CSV (Apellidos, Nombre, correo, NIA).
- **Planificador**: unidades, actividades (instrumento, evaluación, peso, criterios opcionales) y cobertura.
- **Cuaderno**: tabla alumnos × actividades por evaluación, vista por actividad (con comentario), vista Final y exportación CSV. Marca T = entrega tardía.
- **Asistencia**: pase de lista por fecha y hora (P/A/R/J), resumen con aviso de faltas injustificadas y exportación CSV por sesión y semanal. Umbral y sesiones anuales en Configuración.
- **Informes**: ficha de alumno (notas por instrumento, radar competencial con media del grupo, origen de cada nota) imprimible como PDF; vista de grupo (media, aprobados, distribución, medias por evaluación, radar, mejores y peores elementos).
- **Classroom**: Grupos → importar alumnos; Planificador → importar tareas; Cuaderno (Por actividad) → traer notas y rúbrica. Solo lectura: la API no permite escribir notas de rúbrica.
- **Comunicación**: correo individual con plantillas y marcadores, o anuncio en el tablón; historial.

## Apps Script (Classroom y correo)
1. Configuración del proyecto → marca «Mostrar archivo appsscript.json» y pega el de `apps-script/`.
2. Pega el nuevo `Code.gs`. Ejecuta `autorizar` y acepta los permisos.
3. Implementar → Gestionar implementaciones → lápiz → Versión: Nueva versión → Implementar (la URL no cambia).

## Sincronización (Fase 7)
- Archivo `cuaderno-docente-db.json` en tu Drive. Fusión por registro (gana el `updatedAt` más reciente). Estado visible arriba.
- Actualiza `Code.gs` y `appsscript.json` (nuevos permisos: Drive y disparadores), ejecuta `autorizar` y `instalarCopiaDiaria`, y crea nueva versión de la implementación.
- Copias diarias en la carpeta «Cuaderno docente copias» (últimas 30). Exportar/importar JSON desde Conexión.

## Tests del motor (Paso 1)
- `src/core/*.test.ts` (vitest) prueban el cálculo con datos reales de los catálogos. Se ejecutan en GitHub Actions en cada subida; si fallan, no se publica.
- Perfil competencial: cada actividad pesa lo mismo que en la nota final (trimestre × instrumento × peso dentro del instrumento). Si una actividad evalúa un criterio y una de sus concreciones, la nota cuenta una sola vez.
- Nota final mínima 1 tras redondear (SIGAD no admite 0). Ajustable en Configuración.

## Nota por criterio y rúbricas (Fase 9)
- **Nota por criterio**: en Cuaderno → Por actividad, cada alumno tiene una fila por criterio de la actividad. Si hay notas por criterio, la nota de la actividad es su media (sombreada en la tabla) y la nota global se ignora. En el perfil competencial cada criterio recibe su propia nota.
- **Rúbricas propias** (Planificador → Rúbricas): 4 niveles con su nota (por defecto 2,5 / 5 / 7,5 / 10) y una fila por criterio con descriptores opcionales. Al asignar una rúbrica a una actividad se añaden sus criterios y se califica con un toque (1–4). Si cambias la nota de un nivel, se recalculan las notas puestas con esa rúbrica.
- **Avisos**: actividades sin criterio, y tabla de cobertura criterio × instrumento.
- Las notas anteriores se conservan como nota global; la base de datos local pasa a la versión 5 sin tocar los datos. No hay que actualizar el Apps Script.

## Informes por criterio (Fase 10)
- **Informes → Alumno**: comparar con la media del grupo o entre evaluaciones (una serie por evaluación). Bajo el radar, tabla con el valor de cada eje; lo no evaluado aparece como «Sin evaluar», no como 0.
- **Informes → Grupo**: casilla «Comparar evaluaciones» con la media del grupo en cada una.
- El nivel «Indicador» pasa a llamarse **«Concreción»** (como en la programación), para no confundirlo con los indicadores de logro. Se renombra solo en las instalaciones existentes; si le habías puesto otro nombre, se respeta.
- Marcadores nuevos en Comunicación: `{{criterio}}` (criterios evaluados con su nota, todo el curso) y `{{criterios_pendientes}}` (solo los que no llegan al aprobado).

## Nota por competencias (Fase 11)
Proyectos Artísticos calcula la nota según la cadena del currículo aragonés (LOMLOE):
1. Los **instrumentos** (proyectos, cuaderno, dinámica, exámenes) miden **criterios**. Si varios instrumentos miden el mismo criterio, se combinan con 45/25/15/15; solo cuentan los que lo miden.
2. Un criterio con **concreciones** es la media de sus concreciones.
3. Cada **competencia específica** es la media de sus criterios evaluados (todos pesan igual).
4. La **nota de cada evaluación** es la media de las competencias específicas evaluadas. Aviso si alguna no llega a 5.
5. **Final ordinaria**: 30/30/40, entera, mínimo 1.
6. Las **competencias clave** salen de las competencias específicas a través de los descriptores (radar, no nota).

Una actividad sin criterios no cuenta para la nota en este modo. En Configuración → «Nota de cada evaluación» se puede volver a la media ponderada de instrumentos. Modelado y Maquetismo sigue por instrumentos (60/30/10) y evaluaciones 50/50.

## Reglas de calificación (Fase 12)
En **Cuaderno → Final**:
- **Faltas**: % de faltas injustificadas con aviso ⚠ al llegar al 20 %. La **pérdida de evaluación continua (PEC)** la marcas tú; la nota pasa a ser carpeta 50 % + examen global 50 % (Modelado: dossier 40 % + prueba 60 %).
- **Convocatoria extraordinaria** para quien no aprueba la ordinaria: proyectos 40 % + examen 60 %. En Proyectos Artísticos hace falta un 5 en ambas partes para hacer media; si no, suspenso (4 como máximo).
- **Oficial**: la nota que va al acta (ordinaria, PEC o extraordinaria). Modelado y Maquetismo añade SS/AP/NT/SB.

En **Cuaderno → Por actividad**:
- **Rec.**: registra una recuperación. Cuenta la nota nueva y se guarda la anterior (marca R; se ve en Informes).
- **T**: entrega fuera de plazo sin justificar. En Proyectos Artísticos no se puede recuperar; en Modelado resta un 30 %.
- **∅**: entrega vacía o archivo corrupto, vale 0.

Todo es configurable por materia en Configuración. La exportación CSV incluye Ordinaria, Vía y Oficial.

## Classroom: planificar aquí, traer notas y rúbricas de allí (Fase 13)
1. **Planificador**: crea la actividad con sus criterios aunque aún no exista en Classroom (aparece «sin tarea en Classroom»).
2. Al editarla: **Vincular con una tarea** (elige una tarea existente) o **Crear en Classroom** (se crea como borrador, sobre 10, con los criterios en la descripción). Añádele la rúbrica en Classroom y publícala.
3. **Cuaderno**: las notas y rúbricas de las tareas vinculadas se traen solas al abrirlo (como mucho cada 30 min) y con **Classroom ⟳**. En **Por actividad**, «Traer notas de Classroom» solo para esa tarea.
4. **Rúbrica de Classroom → criterios**: cada fila se empareja con un criterio (sola si el título empieza por el código, «3.2 …»). Los puntos de cada fila pasan a ser la nota de ese criterio (sobre 10).
5. Si Classroom cambia una nota, se actualiza aquí. Si la habías cambiado en la app, no se pisa: la app pregunta.
6. En tareas creadas desde la app: **Enviar notas a Classroom (borrador)** cuando ya estén publicadas.

**Hay que actualizar el Apps Script** (nuevo permiso para crear tareas y escribir notas):
1. Pega el nuevo `apps-script/Code.gs` y el nuevo `appsscript.json`. Guarda.
2. Ejecuta `autorizar` y acepta los permisos nuevos.
3. Implementar → Gestionar implementaciones → lápiz → Versión: **Nueva versión** → Implementar (la URL no cambia).

El servidor también elimina de `cuaderno-docente-db.json` los borrados de hace más de 60 días.

## Importar, exportar y deshacer (Fase 14)
- **Cuaderno → Importar notas**: CSV o Excel con una fila por alumno (NIA, correo o apellidos y nombre) y una columna por actividad. Vista previa con el emparejamiento de columnas; las notas distintas a las de la app solo se sobrescriben si lo marcas. Sirve el archivo que exporta la propia app.
- **Exportar Excel**: hoja «Notas» (actividades, evaluaciones, ordinaria, vía y nota oficial) y hoja «Criterios» (competencias específicas, criterios y concreciones de todo el curso).
- **↶ Deshacer**: deshace los últimos cambios de notas de esta sesión (también importaciones, recuperaciones y notas traídas de Classroom, de una vez).
- Los borrados de hace más de 60 días se eliminan del dispositivo (si ya se enviaron al servidor) y del archivo de Drive.

## Matriz y mapa del currículo (Fase 15)
En **Currículo**:
- **Matriz**: elige una relación (p. ej. competencias específicas → descriptores); filas de un nivel, columnas del otro, una casilla por vínculo. En naranja, elementos sin vínculo que deberían tenerlo.
- **Mapa**: columnas de tarjetas según la cadena (concreciones → criterios → competencias específicas → descriptores → competencias clave). Pulsa una tarjeta para ver solo su cadena. Arrastra de un punto a otro para vincular; selecciona una línea y pulsa «Quitar vínculo» (o Supr).

## Calendario de sesiones (Fase 16)
**Planificador → Calendario**:
- **Generar sesiones**: marca tus horas con el grupo (lunes 3.ª, miércoles 1.ª…) y elige fechas. Se saltan los días no lectivos del calendario escolar y los que añadas para ese grupo (excursiones…).
- **Repartir unidades**: asigna las unidades por orden a las sesiones libres según sus sesiones previstas.
- Vista por semanas: unidad y tema de cada sesión, y las actividades con esa fecha. «Sesiones por unidad» compara previstas y programadas.

## Calendario escolar, sesiones y saberes (Fase 17)
- **Calendario escolar** (pestaña superior, común a todas las materias y grupos): inicio y fin de las clases, fechas de cada evaluación y días no lectivos. «Rellenarlo con una IA» da un prompt para copiar en una IA con búsqueda web; su respuesta se pega y se lee sola. Revisa las fechas con el BOA y añade los días de libre disposición del centro.
- **Sesiones previstas por grupo**: con el horario de cada grupo, sesiones del curso y de cada evaluación. Son la base del % de faltas si en Configuración no hay sesiones anuales fijadas.
- **Realizado / pendiente** en cada sesión (Planificador → Calendario y Asistencia): lo pendiente aparece en la sesión siguiente del grupo.
- Los **saberes básicos** ya no se vinculan a criterios (no se evalúan): se incluyen en las unidades didácticas. El Planificador avisa de los saberes sin unidad.
- **Descriptores** de las competencias clave con su redacción oficial (solo cambian los que no habías editado).

## SIGAD, observaciones del aula y asignaturas nuevas (Fase 18)
- **Cuaderno → SIGAD**: descarga de SIGAD el listado de calificaciones (.xls con Apellido1, Apellido2, Nombre y Calificación), elige la nota (cada evaluación, final ordinaria o extraordinaria) y cárgalo. La app empareja por apellidos y nombre (sin tildes ni mayúsculas; las filas sin emparejar se eligen a mano), rellena la columna Calificación sin tocar el resto del archivo y lo descarga como `…-notas.xls` para subirlo a SIGAD. Las notas son las oficiales (redondeo de Configuración, mínimo 1).
- **Asistencia → Observaciones**: al pasar lista se marcan + Participa, + Trabajo en grupo, − Sin material, − Comportamiento (editables en Configuración → Observaciones del aula).
- **Actividad «Nota desde las observaciones del aula»** (Planificador): en Cuaderno → Por actividad propone la nota con las marcas de las fechas de su evaluación (Calendario escolar): base 6 ± 0,5 por marca, entre 0 y 10. «Aplicar propuesta» la pone (se puede deshacer). Para que cuente en Proyectos Artísticos, la actividad necesita criterios (p. ej. 3.1).
- **+ Asignatura**: plantilla LOMLOE (competencias específicas, criterios, descriptores y saberes), FP (resultados de aprendizaje y criterios), copia de instrumentos y cálculo de otra asignatura, o vacía. **Currículo → Cargar el currículo con una IA**: prompt para copiar y su respuesta (JSON) se añade a la asignatura; los descriptores de Bachillerato usan la redacción oficial.
- **Configuración → Borrar asignatura** (si no tiene grupos).
