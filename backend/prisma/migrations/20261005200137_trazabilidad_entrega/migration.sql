-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "distancia_entrega_km" DOUBLE PRECISION,
ADD COLUMN     "entrega_aproximada" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "entrega_verificada" BOOLEAN NOT NULL DEFAULT false;
