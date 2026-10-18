# Draftroom

[English](README.md) · **Español**

Un editor de documentos colaborativo. Varias personas escriben a la vez en el mismo documento y ven el cursor de las demás; se comparte por rol; se puede volver a cualquier versión anterior; y se sigue trabajando cuando se corta la conexión. Pensado para escritorio (desde 1280 px), en español e inglés, con tema claro y oscuro.

Es un proyecto de portafolio, hecho para leerse tanto como para usarse: un servidor y una base de datos reales, un editor en tiempo real y las decisiones que hay detrás, por escrito ([arquitectura](docs/architecture.md), [registros de decisión](docs/decisions/)). La documentación técnica está en inglés.

## Recorrido

![El editor con dos personas escribiendo en el mismo documento y un hilo de comentarios anclado a una frase](docs/assets/comments.png)

<video src="docs/assets/tour.webm" controls muted width="720"></video>

[Un clip breve](docs/assets/tour.webm): dos personas escriben en el mismo documento y una comenta una frase; la otra ve llegar el comentario. Grabado desde uno de los dos navegadores, contra el servidor real.

| | |
| --- | --- |
| ![Inicio](docs/assets/home.png) **Inicio**: documentos fijados y actividad reciente. | ![Documentos](docs/assets/explorer.png) **Documentos**: carpetas y lo que cambió. |
| ![El editor](docs/assets/editor.png) **Editor**: el cursor de la otra persona, y «Sincronizado» solo cuando está guardado. | ![Compartir](docs/assets/share.png) **Compartir**: roles por persona y para el espacio de trabajo. |
| ![Historial de versiones](docs/assets/versions.png) **Historial**: previsualiza una versión antes de restaurarla. | ![Configuración](docs/assets/settings.png) **Configuración**: perfil, espacio de trabajo, miembros, apariencia. |
| ![El editor en tema oscuro](docs/assets/editor-dark.png) **Tema oscuro.** | ![El editor en español](docs/assets/editor-es.png) **Español**, en otro espacio de trabajo. |

Estas imágenes y el clip los toma un script del sistema real (`npm run docs:tour`, véase [`scripts/readme-tour`](scripts/readme-tour/run.ts)), con las cuentas de la semilla de demostración. Las capturas muestran la interfaz en inglés salvo la marcada como español.

## Qué hace

- **Escribir juntos.** Varias personas editan un documento y los cambios se combinan sin conflictos (Yjs); se ven los cursores y los nombres de las demás.
- **«Sincronizado» significa guardado.** El editor solo dice que un cambio está sincronizado cuando el servidor confirma que lo escribió en la base de datos, nunca porque haya cambiado la copia local. Cómo funciona, [aquí](docs/architecture.md#synced-means-stored).
- **Seguir sin conexión.** Un documento que ya abriste guarda una copia en el navegador; los cambios hechos sin conexión se envían al reconectar, y cerrar sesión avisa antes de descartar cambios que el servidor nunca guardó.
- **Comentar el texto.** Selecciona una frase y coméntala con el ratón o con Ctrl+Alt+M (⌘⌥M en un Mac); los hilos siguen unidos a su texto aunque otras personas editen, se pueden responder, resolver y reabrir, y funcionan solo con el teclado.
- **Organizar.** Un explorador con carpetas, búsqueda, documentos fijados, plantillas, una papelera con restauración y una vista de lo que otras personas compartieron contigo.
- **Compartir por rol.** Lector, comentarista, editor o propietario, por persona o para todo el espacio de trabajo. El servidor lo aplica tanto en la API como en la conexión en vivo; quitar el acceso cierra la conexión abierta de esa persona.
- **Historial.** Versiones automáticas y con nombre de cada documento, que se pueden previsualizar y restaurar, y un registro de actividad.
- **Configuración.** Perfil, espacio de trabajo, miembros y apariencia (claro, oscuro o el del sistema; tamaño del texto).
- **Dos idiomas.** Cada texto existe en español y en inglés; las fechas y los números siguen el idioma.

## Qué no hace

- No es una aplicación móvil: por debajo de 1280 px de ancho pide una ventana más grande.
- No envía correo, así que no hay invitaciones por correo, ni recuperación de contraseña, ni verificación del correo ([Limitaciones conocidas](#limitaciones-conocidas)).
- No reparte un documento entre varios procesos del servidor: un proceso sirve un documento ([por qué](docs/deploy/README.md)).
- La demo estática no es el producto: véase la sección siguiente.

## Demo estática

El repositorio puede construir una demo que se ejecuta entera en el navegador, sin servidor (`npm run build:demo -w @draftroom/web`). **Todo en ella está simulado en el navegador:** los datos están en memoria y se reinician al recargar la página, la segunda persona que escribe es un guion, y las pestañas del mismo navegador comparten un documento para hacer las veces de otras personas. Sirve para echar un vistazo rápido; no demuestra que el servidor funcione. Por ahora no se publica nada desde este repositorio.

## Tecnología

| Capa | Qué usa |
| --- | --- |
| Cliente | React 19.3, TypeScript 6.0, Vite 8.3, React Router 8.4, TanStack Query 5.104, react-intl 12.1 |
| Editor | Tiptap 3.31 sobre Yjs 13.6, con el proveedor de Hocuspocus 4.7 y `y-indexeddb` para la copia sin conexión |
| Componentes | [Forma UI](https://github.com/Yelison/forma-ui) 0.6 para componentes y tokens de diseño |
| Servidor | Node.js 24, Fastify 5.12 (REST), Hocuspocus 4.7 (WebSocket de colaboración), Kysely 0.29 y `pg` |
| Base de datos | PostgreSQL 17: filas para los datos y el estado binario de Yjs para el contenido de cada documento |
| Contrato | OpenAPI 3.1 ([`packages/contract`](packages/contract/openapi.yaml)) con tipos generados, y un [protocolo de colaboración](docs/collab/protocol.md) |
| Calidad | Vitest 5, Playwright 1.64, oxlint, Prettier |
| Despliegue | Docker Compose con Caddy para HTTPS y el proxy de WebSocket |

Cómo encajan las piezas, con el flujo de datos de una edición, está en [docs/architecture.md](docs/architecture.md).

## Ejecutarlo en desarrollo

Necesitas Node.js 24 (`.nvmrc`), npm 11 y, para ejecutar el servidor real, Docker con el plugin Compose.

```sh
npm ci
npm run dev -w @draftroom/web      # http://localhost:5173, con una API en memoria: no hace falta servidor
```

En desarrollo la aplicación habla con la API en memoria (la misma que usa la demo estática), de modo que la interfaz se puede trabajar sola. Para ejecutarla contra el servidor real y una base de datos:

```sh
cp .env.example .env                                # valores de desarrollo; git ignora .env
sed -i 's|^ALLOWED_ORIGINS=.*|ALLOWED_ORIGINS=http://localhost:5173|' .env   # para que el servidor acepte el WebSocket del navegador
docker compose up -d --wait postgres                # PostgreSQL en 127.0.0.1:5460
npm run migrate -w @draftroom/server                # crea el esquema
npm run seed:demo -w @draftroom/server              # los espacios de trabajo y cuentas de demostración (solo desarrollo)
npm run dev -w @draftroom/server                    # la API en :8380 y la colaboración en :8480

# en otra terminal: la aplicación, que envía /api y /collab a ese servidor
VITE_DATA_SOURCE=http E2E_API_ORIGIN=http://127.0.0.1:8380 E2E_COLLAB_ORIGIN=http://127.0.0.1:8480 \
  npm run dev -w @draftroom/web
```

(`ALLOWED_ORIGINS` es el origen desde el que el navegador abre la aplicación; sin él, el servidor rechaza el WebSocket y el editor se queda en la pantalla de carga. Las dos variables `E2E_` llevan el nombre de la suite de pruebas que las introdujo: con las dos definidas, el servidor de desarrollo reenvía `/api` y `/collab` como lo hace un proxy inverso en producción.) Entra como `daniel.okafor@harborpine.example` con la contraseña `harbor pine rooftop`; las demás cuentas de demostración, todas en [`apps/server/src/db/demo-seed/content.ts`](apps/server/src/db/demo-seed/content.ts), usan la misma. La semilla se niega a ejecutarse fuera de desarrollo y pruebas. Más sobre el servidor y sus scripts, en [CONTRIBUTING](CONTRIBUTING.md).

## Ejecutarlo tú mismo

Necesitas Docker con el plugin Compose y un nombre de host que apunte a la máquina (o `draftroom.localhost` para probarlo en una sola máquina).

```sh
cp deploy/env.example deploy/.env       # luego rellena el nombre de host (`SITE_ADDRESS` y `PUBLIC_ORIGIN`) y los dos secretos (vacíos hasta entonces)
docker compose --env-file deploy/.env -f deploy/docker-compose.prod.yml -p draftroom-prod up -d --build --wait
```

El proyecto de producción se llama `draftroom-prod` y el de desarrollo `draftroom`, para que nunca compartan base de datos ni volumen: con un mismo nombre, la base de producción arrancaría sobre los datos de desarrollo.

Caddy sirve la aplicación por HTTPS, el servidor migra la base de datos al arrancar y solo el proxy publica puertos. Haz una copia de seguridad
con `scripts/backup.sh` y restáurala con `scripts/restore.sh`. [La guía de despliegue](docs/deploy/README.md) explica cómo ejecutarlo sin
Docker, el proxy inverso y lo que exige para los WebSocket, cada variable, las copias de seguridad y por qué un proceso sirve cada documento.

## Cómo se prueba

| Suite | Comando | Qué cubre |
| --- | --- | --- |
| Pruebas unitarias y de componentes | `npm test` | Las reglas de dominio del servidor y los componentes y la lógica de la aplicación web, con Vitest. |
| De extremo a extremo con API simulada | `npm run test:e2e -w @draftroom/web` | Las pantallas en un navegador real contra la API en memoria. |
| Integración del servidor | `npm test -w @draftroom/server` | La API, el servidor de colaboración y las migraciones contra PostgreSQL 17, que arranca Testcontainers (necesita Docker). |
| De extremo a extremo con el sistema real | `npm run test:e2e-collab -w @draftroom/web` | Dos navegadores contra el servidor y la base de datos reales: convergencia, durabilidad cuando se mata el servidor, revocación y la compilación de producción. Necesita PostgreSQL en marcha, como arriba. |
| Demo estática | `npm run test:e2e-demo -w @draftroom/web` | La compilación de la demo, que no debe llegar a la red. |

La CI ejecuta cuatro comprobaciones obligatorias en cada pull request: **Static checks** (lint, formato, comprobación de tipos, el lint de OpenAPI y los tipos generados, y `npm test`), **Web e2e (mocked API)**, **Server integration (PostgreSQL)** y **Collaboration e2e (real stack)**. También se ejecuta una auditoría de dependencias en cada pull request; un simulacro de copia y restauración y la compilación de la demo estática solo se ejecutan cuando el pull request toca lo que cubren. Ninguno es obligatorio.

`npm run docs:links` falla cuando un enlace relativo de los README o del documento de arquitectura apunta a un archivo que no existe.

## Repositorio

```text
apps/server            REST (Fastify) y colaboración (Hocuspocus) en un proceso, migraciones, la semilla de demostración
apps/web               la aplicación React, su API en memoria y las suites de pruebas en navegador
packages/contract      el contrato OpenAPI, sus tipos generados y los esquemas de los mensajes de colaboración
packages/editor-schema el esquema del editor, compartido por el cliente y el servidor
deploy                 archivo Compose, configuración de Caddy y el simulacro de copia y restauración
docs                   arquitectura, registros de decisión, API y protocolo de colaboración, guía de despliegue
scripts                copia y restauración, el recorrido del README, la comprobación de enlaces
```

## Limitaciones conocidas

- **Las direcciones de correo no se verifican al registrarse.** Quien se registre primero con una dirección que tenga una invitación pendiente hereda lo que se compartió con ella, y la respuesta del registro revela qué direcciones ya tienen cuenta. Cerrarlo exige un enlace de verificación y el envío de correo en los dos idiomas; véase el [ADR 0004](docs/decisions/0004-authentication.md#known-risk-no-email-verification).
- **Nada de correo.** No hay correos de invitación, ni recuperación de contraseña, ni forma de cambiarla, ni lista de sesiones: cada cosa necesita el envío de correo o su propia tarea ([ADR 0004](docs/decisions/0004-authentication.md)).
- **Un espacio de trabajo a la vez.** La aplicación trabaja en el primer espacio de trabajo de la persona, por nombre, y todavía no permite elegir otro.
- **Un solo proceso de servidor.** Un documento vive en la memoria de un proceso, así que este montaje no ejecuta réplicas; los límites de intentos de inicio de sesión viven en la memoria de ese proceso y se reinician con él ([guía de despliegue](docs/deploy/README.md#what-is-not-done-yet)).
- **Dos personas escribiendo a la vez en el mismo punto de un documento vacío.** Sus textos pueden quedar contiguos en un párrafo, o en dos párrafos en un orden cualquiera. Las dos ven lo mismo y es lo que queda guardado: es lo que ocurre cuando dos personas escriben en el mismo sitio a la vez.
- **Editar sin conexión exige una primera visita.** Un documento que nunca abriste en este dispositivo no tiene copia local y no se puede editar sin conexión.
- **Solo escritorio.** Desde 1280 px de ancho; a las ventanas más estrechas se les pide que se ensanchen.

## Licencia

[MIT](LICENSE)
