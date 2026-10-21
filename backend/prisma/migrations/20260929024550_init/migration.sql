-- CreateTable
CREATE TABLE "products" (
    "id" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "price" INTEGER NOT NULL,
    "original_price" INTEGER,
    "discount_percent" INTEGER,
    "is_offer" BOOLEAN NOT NULL DEFAULT false,
    "stock" INTEGER NOT NULL DEFAULT 0,
    "min_wholesale_qty" INTEGER NOT NULL DEFAULT 1,
    "image" TEXT,
    "badge" TEXT,
    "brand" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "price_tiers" (
    "id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "min_qty" INTEGER NOT NULL,
    "unit_price" INTEGER NOT NULL,

    CONSTRAINT "price_tiers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shipping_zones" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "comuna" TEXT NOT NULL,
    "cost" INTEGER NOT NULL,
    "estimated_hours" TEXT NOT NULL,
    "free_shipping_threshold" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "shipping_zones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "telefono" TEXT,
    "role" TEXT NOT NULL DEFAULT 'customer',
    "rut_empresa" TEXT,
    "razon_social" TEXT,
    "giro_comercial" TEXT,
    "direccion_tributaria" TEXT,
    "comuna_tributaria" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "addresses" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "label" TEXT NOT NULL DEFAULT 'Casa',
    "direccion" TEXT NOT NULL,
    "departamento" TEXT,
    "comuna" TEXT NOT NULL,
    "zona_id" TEXT,
    "instrucciones" TEXT,
    "is_default" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "addresses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" TEXT NOT NULL,
    "order_number" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user_id" TEXT,
    "customer_nombre" TEXT NOT NULL,
    "customer_email" TEXT NOT NULL,
    "customer_telefono" TEXT NOT NULL,
    "dte_tipo_documento" TEXT NOT NULL DEFAULT 'boleta',
    "dte_rut_empresa" TEXT,
    "dte_razon_social" TEXT,
    "dte_giro_comercial" TEXT,
    "dte_direccion" TEXT,
    "dte_comuna" TEXT,
    "subtotal" INTEGER NOT NULL,
    "descuento" INTEGER NOT NULL DEFAULT 0,
    "neto" INTEGER NOT NULL,
    "iva" INTEGER NOT NULL,
    "costo_envio" INTEGER NOT NULL DEFAULT 0,
    "total" INTEGER NOT NULL,
    "payment_method" TEXT NOT NULL,
    "payment_status" TEXT NOT NULL DEFAULT 'pendiente',
    "order_status" TEXT NOT NULL DEFAULT 'pendiente',
    "shipping_zone_id" TEXT NOT NULL,
    "shipping_zone_name" TEXT NOT NULL,
    "shipping_address" TEXT NOT NULL,
    "shipping_comuna" TEXT,
    "shipping_notes" TEXT,
    "dte_folio" TEXT,
    "dte_document_id" INTEGER,
    "dte_pdf_url" TEXT,
    "dte_xml_url" TEXT,
    "dte_status_label" TEXT,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_items" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "product_name" TEXT NOT NULL,
    "product_format" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit_price" INTEGER NOT NULL,
    "subtotal" INTEGER NOT NULL,

    CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webpay_transactions" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "token" TEXT,
    "buy_order" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "return_url" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'INITIATED',
    "response_code" INTEGER,
    "authorization_code" TEXT,
    "card_number" TEXT,
    "payment_type_code" TEXT,
    "installments" INTEGER,
    "accounting_date" TEXT,
    "transaction_date" TIMESTAMP(3),
    "raw_response" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "webpay_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "products_sku_key" ON "products"("sku");

-- CreateIndex
CREATE INDEX "products_category_idx" ON "products"("category");

-- CreateIndex
CREATE INDEX "products_brand_idx" ON "products"("brand");

-- CreateIndex
CREATE INDEX "products_is_offer_idx" ON "products"("is_offer");

-- CreateIndex
CREATE UNIQUE INDEX "price_tiers_product_id_min_qty_key" ON "price_tiers"("product_id", "min_qty");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "orders_order_number_key" ON "orders"("order_number");

-- CreateIndex
CREATE INDEX "orders_created_at_idx" ON "orders"("created_at");

-- CreateIndex
CREATE INDEX "orders_payment_status_idx" ON "orders"("payment_status");

-- CreateIndex
CREATE INDEX "orders_order_status_idx" ON "orders"("order_status");

-- CreateIndex
CREATE UNIQUE INDEX "webpay_transactions_token_key" ON "webpay_transactions"("token");

-- CreateIndex
CREATE INDEX "webpay_transactions_order_id_idx" ON "webpay_transactions"("order_id");

-- CreateIndex
CREATE INDEX "webpay_transactions_status_idx" ON "webpay_transactions"("status");

-- AddForeignKey
ALTER TABLE "price_tiers" ADD CONSTRAINT "price_tiers_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "addresses" ADD CONSTRAINT "addresses_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webpay_transactions" ADD CONSTRAINT "webpay_transactions_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
