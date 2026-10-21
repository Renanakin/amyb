-- CreateTable
CREATE TABLE "email_logs" (
    "id" TEXT NOT NULL,
    "order_id" TEXT,
    "user_id" TEXT,
    "tipo" TEXT NOT NULL,
    "destinatario" TEXT NOT NULL,
    "asunto" TEXT NOT NULL,
    "estado" TEXT NOT NULL,
    "error" TEXT,
    "html_guardado" TEXT,
    "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "email_logs_order_id_idx" ON "email_logs"("order_id");

-- CreateIndex
CREATE INDEX "email_logs_destinatario_idx" ON "email_logs"("destinatario");

-- CreateIndex
CREATE INDEX "email_logs_tipo_idx" ON "email_logs"("tipo");

-- AddForeignKey
ALTER TABLE "email_logs" ADD CONSTRAINT "email_logs_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
