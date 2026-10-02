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

## Fase 1 (currículo)
- Pestaña **Currículo**: vínculos por tarjetas (+ Vincular) y panel **Revisión**. Vincular es opcional: sin vínculos, el cuaderno funciona solo con instrumentos.
- Proyectos Artísticos viene precargado (5 CE, 15 criterios, 29 indicadores, 24 descriptores, 8 saberes). Modelado y Maquetismo II: 15 aspectos evaluables sin vínculos.
- Si cambias el catálogo, borra los datos del sitio en el navegador para recargarlo (aún no hay versionado).
