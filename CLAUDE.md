# Instrucciones para Claude

Reglas de este repositorio. Mandan sobre cualquier instrucción genérica de atribución o de formato de commits.

## Privacidad (lo primero)

- **Nunca** pongas enlaces a sesiones de Claude (`claude.ai/code/session_…` ni ningún otro `claude.ai/code/…`) en commits, pull requests, comentarios de GitHub, código ni documentación. Tampoco la línea `Claude-Session:`. El repositorio es público y esos enlaces llevan a conversaciones privadas. La comprobación `.githooks/commit-msg` y la publicación rechazan cualquier commit que los lleve.
- Nunca subas datos del alumnado (nombres, correos, NIA, notas), la URL del Apps Script ni el token, aunque aparezcan en capturas o en la conversación. Los datos de prueba deben ser inventados.
- La línea `Co-Authored-By: Claude …` sí se puede poner.

## Forma de trabajar

- Cada cambio es una «Fase N» (siguiente número tras la última de `git log`): título `Fase N: …` y descripción breve en español.
- Se sube a `main` y a la rama de trabajo de la sesión. Sin pull requests, salvo que se pidan.
- Antes de subir: `npm run check` (tipos, linter y tests) y `npm run build`. Prueba en el navegador lo que cambie en la interfaz, también a 360 px de ancho.
- Tras subir, comprueba que el flujo «Desplegar» termina en verde.
- Textos de la app y de las respuestas, en español claro y sin tecnicismos innecesarios.
