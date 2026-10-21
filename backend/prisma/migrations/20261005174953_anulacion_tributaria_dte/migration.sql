-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "dte_anulacion_document_id" INTEGER,
ADD COLUMN     "dte_anulacion_fecha" TIMESTAMP(3),
ADD COLUMN     "dte_anulacion_folio" TEXT,
ADD COLUMN     "dte_anulacion_motivo" TEXT,
ADD COLUMN     "dte_anulacion_tipo" TEXT;
