# Despliegue de Amyb

## 1. Qué contiene el repositorio

Tres servicios Docker:

| Servicio | Función | Exposición |
|---|---|---|
| postgres | PostgreSQL 17 y volumen persistente | Red interna |
| api | Express, Prisma y procesos de compra existentes | Red interna, puerto 3001 |
| web | Frontend compilado y proxy /api | 127.0.0.1:8080 por defecto |

No hay rutas G:/ ni C:/ obligatorias. Los Dockerfiles usan Node 22 y el lockfile de npm. Nginx resuelve las rutas de React y reenvía /api sin cambiar sus contratos.

## 2. Configuración

npm run configure genera, solo cuando no existen:

- .env para Docker y herramientas de raíz.
- backend/.env para desarrollo con Node.
- POSTGRES_PASSWORD, JWT_SECRET y ADMIN_PASSWORD aleatorios por equipo.

Si ya existe .env, se conserva. Para adaptar una instalación anterior, agregar las variables Docker indicadas en .env.example y usar la contraseña real del PostgreSQL existente; no reemplazar sus credenciales por valores nuevos.

.env y backend/.env se utilizan en modalidades diferentes; mantenerlos coherentes al cambiar puertos o proveedores. No se incluyen en Git ni en las imágenes.

## 3. Primera instalación local

~~~sh
npm run configure
docker compose up --build -d
docker compose ps
~~~

La API espera PostgreSQL, aplica las migraciones pendientes y después inicia. El frontend espera el healthcheck de la API.

Con INIT_DEMO_DATA=true y NODE_ENV=development:
- Se carga el catálogo y zonas iniciales si no hay productos.
- Una base que ya tiene productos no se vuelve a sembrar.

Con INIT_ADMIN=true:
- ADMIN_EMAIL y ADMIN_PASSWORD deben estar configurados.
- Si la cuenta ya existe, no se cambia su contraseña ni su rol.
- En una instalación nueva se crea la cuenta inicial con sus valores privados.

La configuración local no equivale a una tienda productiva: el correo se captura y los documentos pueden ser simulados según la lógica de desarrollo existente.

## 4. Producción

1. Copiar .env.production.example a .env.production.
2. Completar todas las variables del comercio y los proveedores.
3. Usar NODE_ENV=production, FACTO_SANDBOX=false e INIT_DEMO_DATA=false.
4. Generar una contraseña PostgreSQL y un JWT exclusivos de ese entorno.
5. Configurar el dominio HTTPS en CORS_ORIGIN, FRONTEND_URL y WEBPAY_RETURN_URL.
6. Confirmar ADMIN_EMAIL y ADMIN_PASSWORD si se creará la cuenta inicial.
7. Configurar SMTP y credenciales productivas de Webpay y FACTO.

~~~sh
docker compose --env-file .env.production up --build -d
~~~

AMYB_ENV_FILE=.env.production dentro de ese archivo hace que la API reciba la misma configuración.

El backend ya rechaza el arranque productivo si faltan sus variables obligatorias. No desactivar esa validación para publicar.

### Dominio y TLS

Mantener WEB_BIND_ADDRESS=127.0.0.1 y colocar un proxy HTTPS del servidor frente al puerto WEB_PORT. El dominio apunta al servidor donde se ejecuta Docker; configurar su certificado y reenviar el sitio hacia http://127.0.0.1:8080.

Si se utiliza un balanceador o plataforma de contenedores, publicar solo web a través de su terminación TLS. PostgreSQL y la API permanecen internos.

Webpay debe devolver al cliente a https://SU-DOMINIO/webpay/return. La llamada a la API sigue bajo el mismo dominio en /api.

No se ha publicado ningún servidor ni dominio como parte de la carga a GitHub.

## 5. Persistencia y respaldo

El volumen por defecto es amyb_pgdata. POSTGRES_VOLUME permite un nombre distinto por entorno. La configuración productiva de ejemplo utiliza amyb_production_pgdata.

Actualizar imágenes no borra el volumen. docker compose down -v sí elimina volúmenes; no usarlo sobre datos que se deban conservar.

Ejemplo de respaldo lógico, guardado fuera del repositorio:

~~~sh
docker compose exec -T postgres pg_dump -U amyb -d amyb > respaldo-amyb.sql
~~~

En PowerShell con datos sensibles o copias grandes, preferir una herramienta de respaldo que preserve UTF-8 binario o pg_dump -Fc hacia un archivo dentro del contenedor y extraerlo con docker cp. Proteger el respaldo y la configuración del entorno.

Para trasladar una tienda existente a otro equipo, restaurar su base y copiar su configuración por un canal privado. Git por sí solo no transporta clientes, pedidos, contraseñas ni inventario actualizado.

## 6. Actualizar una instalación

1. Respaldar PostgreSQL y el archivo de entorno.
2. Descargar la revisión deseada.
3. Revisar cambios de migración antes de aplicarlos sobre datos comerciales.
4. Reconstruir y levantar.

~~~sh
git pull --ff-only
docker compose up --build -d
docker compose ps
~~~

Prisma migrate deploy aplica solo las migraciones que faltan. No se ejecuta db reset ni un seed sobre un catálogo existente.

Para volver a una versión anterior del código, utilizar su commit o etiqueta y reconstruir. Una reversión de esquema requiere su propio procedimiento y respaldo; no se intenta deshacer migraciones automáticamente.

## 7. Puertos y entornos paralelos

Cambiar WEB_PORT para evitar conflictos. Para una instalación de verificación usar, además, un COMPOSE_PROJECT_NAME y POSTGRES_VOLUME diferentes.

compose.dev.yml expone PostgreSQL en loopback solo para desarrollo con Node:

~~~sh
docker compose -f docker-compose.yml -f compose.dev.yml up -d postgres
~~~

No ejecutar estos comandos contra una base comercial esperando que copie los datos de otro entorno. Cada volumen conserva su propia base.

## 8. Verificación esperada

- Los tres servicios aparecen saludables.
- /api/health devuelve status ok.
- /api/products devuelve el catálogo inicial o el conservado.
- /producto/SU-SKU, /cuenta y /mis-pedidos abren mediante Nginx.
- Los archivos .env y documentación privada no forman parte del repositorio.
- Pagos, envío real de correo y emisión tributaria requieren validación con los proveedores del comercio.

## 9. Dependencias

Se aplicaron las actualizaciones compatibles disponibles al preparar esta entrega. npm audit todavía informa avisos heredados en Prisma, Tailwind y React Router cuya corrección propuesta requiere actualizar versiones mayores. Esta preparación no constituye una migración a Prisma 7, Tailwind 4 o React Router 7 ni una certificación de seguridad productiva. Revisar esos avisos y su exposición antes de operar públicamente.
