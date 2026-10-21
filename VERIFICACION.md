# Verificación de instalación portable

Fecha: 21 de octubre de 2026.

Se verificó una copia limpia del código, separada del entorno de trabajo y con base de datos, volumen y puerto exclusivos.

- `npm ci` y `npm run build` completados en Windows.
- Construcción Docker con Node 22 y arranque de PostgreSQL, API y Nginx completados.
- Los tres servicios quedaron saludables.
- Las nueve migraciones Prisma se aplicaron sobre una base nueva.
- `/api/health` respondió `status: ok`, con conexión a PostgreSQL.
- `/api/products` devolvió los 12 productos iniciales.
- Una ruta de producto solicitada directamente respondió HTTP 200 con la aplicación React.
- Al reiniciar la API no quedaron migraciones pendientes; se conservaron catálogo y cuenta inicial, sin volver a ejecutar los seeds.
- Los archivos de entorno reales y documentos comerciales privados se excluyeron de Git y del contexto de construcción Docker.

La comprobación no ejecutó cobros, emisión tributaria real ni envíos de correo. La operación productiva requiere sus propias credenciales, dominio HTTPS y validación de proveedores. Los avisos pendientes de dependencias están documentados en `DEPLOYMENT.md`.