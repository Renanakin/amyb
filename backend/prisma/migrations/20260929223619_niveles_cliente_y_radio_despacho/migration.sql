-- AlterTable
ALTER TABLE "users" ADD COLUMN     "price_tier_id" TEXT;

-- CreateTable
CREATE TABLE "price_tiers_customer" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "descuento_percent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "aplica_sobre_escalon" BOOLEAN NOT NULL DEFAULT false,
    "color" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "price_tiers_customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery_config" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "nombre_local" TEXT NOT NULL DEFAULT 'Amyb Distribuidora - Bodega Central',
    "bodega_direccion" TEXT NOT NULL DEFAULT 'Av. Alemania 0890, Temuco',
    "bodega_lat" DOUBLE PRECISION,
    "bodega_lng" DOUBLE PRECISION,
    "radio_maximo_km" DOUBLE PRECISION NOT NULL DEFAULT 30,
    "bloquear_fuera_de_radio" BOOLEAN NOT NULL DEFAULT true,
    "despacho_base" INTEGER NOT NULL DEFAULT 2990,
    "costo_por_km" INTEGER NOT NULL DEFAULT 150,
    "despacho_gratis_desde" INTEGER NOT NULL DEFAULT 35000,
    "google_maps_api_key" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "delivery_config_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "price_tiers_customer_nombre_key" ON "price_tiers_customer"("nombre");

-- CreateIndex
CREATE INDEX "users_price_tier_id_idx" ON "users"("price_tier_id");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_price_tier_id_fkey" FOREIGN KEY ("price_tier_id") REFERENCES "price_tiers_customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
