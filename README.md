# Amyb Distribuidora

Ecommerce de Amyb con una única interfaz responsive. Incluye frontend React, API Express y PostgreSQL con Prisma.

## Requisitos

- Git.
- Node.js 22 LTS y npm 10 o superior.
- Docker Engine o Docker Desktop con Compose v2, en ejecución.
- Windows, Linux o macOS. No se necesitan rutas de este equipo ni dependencias globales de Prisma.

## Descargar y levantar una instalación local

~~~sh
git clone https://github.com/Renanakin/amyb.git
cd amyb
npm run configure
docker compose up --build -d
~~~

Abrir **http://localhost:8080**.

No hace falta ejecutar npm install en el equipo para esta modalidad: las imágenes instalan las dependencias con npm ci. El comando configure usa únicamente Node y genera secretos únicos por instalación.

El entorno inicial es de **desarrollo**: crea el catálogo de demostración solo si la base está vacía y crea la cuenta inicial solo si no existe. El correo y la contraseña de esa cuenta quedan en el archivo privado .env, en ADMIN_EMAIL y ADMIN_PASSWORD. No hay una contraseña compartida en el repositorio.

Webpay, FACTO y SMTP reales requieren las credenciales del proveedor correspondiente. Ver [DEPLOYMENT.md](DEPLOYMENT.md) antes de publicar una tienda operativa.

## Estado y registros

~~~sh
docker compose ps
docker compose logs --tail=100 api
docker compose logs --tail=100 web
~~~

Salud de la aplicación: http://localhost:8080/api/health

Para detener conservando los datos:

~~~sh
docker compose down
~~~

El volumen PostgreSQL permanece. No agregar -v al detener si se desean conservar datos.

## Desarrollo con Node fuera de Docker

~~~sh
npm run configure
npm ci
npm run db:up
npm run db:deploy
npm run db:seed
npm run dev
~~~

- Frontend: http://localhost:5173
- Backend: http://localhost:3001
- PostgreSQL local: puerto 5433.
- Cambiar CORS_ORIGIN, FRONTEND_URL y WEBPAY_RETURN_URL en backend/.env para usar el puerto 5173 en esta modalidad.
- db:seed carga y actualiza el catálogo inicial: ejecutarlo solo para preparar una base de desarrollo, no como actualización de datos comerciales.

## Compilar

~~~sh
npm ci
npm run build
~~~

El postinstall genera el cliente Prisma. El build compila frontend, backend y utilidades de inicialización.

## Estructura

~~~
frontend/src/storefront/    Interfaz principal: inicio, catálogo, ficha, carrito y cuenta
frontend/src/components/   Acceso, perfil, checkout y documentos
frontend/src/pages/        Pedidos, retorno de pago, impresión y administración
frontend/src/services/     Clientes API
backend/src/               API y reglas existentes
backend/prisma/            Esquema, migraciones y catálogo inicial
backend/deploy/            Migraciones e inicio del contenedor
deploy/                    Dockerfiles y Nginx
scripts/configure.mjs      Configuración portable por equipo
~~~

El frontend conserva rutas de producto por SKU, historial, recuperación de contraseña, retorno Webpay, comprobantes y panel administrativo. El catálogo, stock, escalas y precios por cliente proceden de la API.

## Producción y actualizaciones

Ver [DEPLOYMENT.md](DEPLOYMENT.md): configuración de proveedores, dominio HTTPS, persistencia, respaldo y despliegue sobre una instalación existente.

El repositorio incluye código y migraciones. Las credenciales, datos de clientes y pedidos no viajan con Git; se configuran o restauran de forma separada en cada entorno.
