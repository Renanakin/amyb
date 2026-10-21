# Preparación para staging Hackteck

El procedimiento canónico del operador es `G:\hostinger\AGENTS.md`. Esta carpeta adapta el repositorio a releases de `/var/www/staging/amyb`; no modifica producción.

## Entorno previsto

| Elemento | Valor |
|---|---|
| Dominio | `amyb-stg.hackteck.cl` |
| API PM2 | `stg-amyb-api`, `127.0.0.1:4202` |
| Frontend | Estático compilado, servido por Nginx; sin proceso Vite |
| PostgreSQL | `amyb_staging`, cuenta `amyb_staging_user`, servidor local |
| Entorno privado | `shared/config/.env.staging`, permiso `0600` |
| Persistencia | `shared/data`, `shared/uploads`, `shared/logs` |

Es una instalación de evaluación con datos iniciales independientes. `NODE_ENV=staging` usa las rutas existentes de desarrollo: FACTO sandbox, correo en captura y Webpay de integración sin credenciales. No se copian secretos ni datos del equipo local. Para probar proveedores, configurar únicamente sus credenciales de prueba por canal privado.

## Artefacto y preparación sin activación

1. Desde una revisión limpia, ejecutar `deploy/staging/build-artifact.ps1`. Compila localmente e incluye solo frontend compilado, API compilada, semillas compiladas, migraciones y manifiestos necesarios. El nombre incluye fecha UTC y commit; se genera SHA256.
2. Consultar estado, puertos y PM2 por SSH usando `hackteck-vps`, como `nano`.
3. Crear el proyecto con `init-project amyb` si falta y cargar archivo y SHA256 a `incoming`. Verificar checksum antes de extraer a un directorio nuevo en `releases`.
4. Copiar `prepare-host.py` y `staging.env.example` a `.control/amyb/`; ejecutar el primero como `nano`. Genera secretos en el VPS sin imprimirlos, conserva la configuración existente y registra el puerto exclusivo.
5. Dentro de `backend`, crear `.env -> ../../../shared/config/.env.staging`. En la raíz del release enlazar `uploads -> ../../shared/uploads` y `data -> ../../shared/data`.
6. En la raíz del release ejecutar `npm ci --omit=dev --ignore-scripts` y `npm run db:generate --workspace=backend`. El artefacto ya llega compilado. El primer comando omite postinstall porque la generación se realiza explícitamente después.
7. Preparar el archivo Nginx en `.control/nginx/amyb-stg.conf`, PM2 en `.control/pm2/stg-amyb.config.cjs` y el script PostgreSQL en `.control/pending-root/amyb-database.py`.

En este punto el release está preparado, todavía sin `current`, sin proceso PM2 y sin instalar un virtualhost nuevo.

## Operaciones privilegiadas y activación posterior

La creación de la cuenta/base PostgreSQL requiere root. El operador humano ejecuta el script preparado; el agente no usa sudo ni automatiza una sesión root. El script solo crea la cuenta/base exclusivas, conserva las existentes si su propietario coincide y no imprime secretos.

Después de crear la base, el agente verifica la conexión como `nano`. Desde `releases/RELEASE/backend`:

```bash
node --env-file=../../../shared/config/.env.staging deploy/start.mjs --prepare-only
```

Aplica migraciones staging y datos iniciales solo sobre una base vacía, sin dejar el servidor en ejecución. No restablece cuentas existentes.

Para la puesta en línea autorizada:

1. Activar con `.control/bin/activate-release amyb RELEASE`.
2. Iniciar solo `stg-amyb-api` con el ecosystem preparado, guardar PM2 y comprobar estabilidad, salud y escucha exclusivamente en loopback.
3. El operador instala el virtualhost Nginx y recarga únicamente si `nginx -t` resulta correcto. Ese bloque root se entrega separado del de PostgreSQL, tras verificar el paso anterior.
4. Comprobar el nombre DNS exacto y crear un registro A con proxy Cloudflare hacia el VPS solo si no existe. Si no hay conector Cloudflare, dejar ese registro como pendiente externo.
5. Verificar HTTPS, rechazo sin autenticación, `X-Robots-Tag`, catálogo, rutas React y logs. Registrar release y commit.

## Reversión

En actualizaciones, confirmar `current` y `previous`, y respaldar la base antes de migrar. Si falla una validación, usar `rollback-release amyb` y reiniciar únicamente `stg-amyb-api` con la configuración preparada. La reversión del código no revierte migraciones.

En el primer despliegue no existe un release anterior: ante un fallo, detener solo `stg-amyb-api` y dejar la instalación sin publicar hasta resolverlo. No fabricar un enlace `previous` ni borrar datos.

El script root y los archivos de configuración incluyen únicamente rutas y nombres públicos. Las contraseñas reales permanecen en `shared/config`.
