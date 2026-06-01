-- AlterTable
ALTER TABLE "properties" ADD COLUMN     "free_listing_end_date" DATE,
ADD COLUMN     "is_listing_expired" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "listing_expires_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "listing_fee_configs" (
    "id" UUID NOT NULL,
    "property_type" "PropertyType" NOT NULL,
    "fee_amount" DECIMAL(15,2) NOT NULL,
    "duration_days" INTEGER NOT NULL DEFAULT 30,
    "free_trial_days" INTEGER NOT NULL DEFAULT 30,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "listing_fee_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "listing_renewal_history" (
    "id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "paid_by_id" UUID NOT NULL,
    "fee_amount" DECIMAL(15,2) NOT NULL,
    "duration_days" INTEGER NOT NULL,
    "payment_method" VARCHAR(50),
    "previous_expiry" TIMESTAMP(3),
    "new_expiry" TIMESTAMP(3) NOT NULL,
    "status" VARCHAR(30) NOT NULL DEFAULT 'completed',
    "transaction_ref" VARCHAR(255),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "listing_renewal_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "listing_fee_configs_property_type_key" ON "listing_fee_configs"("property_type");

-- CreateIndex
CREATE INDEX "listing_renewal_history_property_id_idx" ON "listing_renewal_history"("property_id");

-- CreateIndex
CREATE INDEX "listing_renewal_history_paid_by_id_idx" ON "listing_renewal_history"("paid_by_id");

-- CreateIndex
CREATE INDEX "properties_is_listing_expired_idx" ON "properties"("is_listing_expired");

-- CreateIndex
CREATE INDEX "properties_listing_expires_at_idx" ON "properties"("listing_expires_at");

-- AddForeignKey
ALTER TABLE "listing_renewal_history" ADD CONSTRAINT "listing_renewal_history_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("property_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing_renewal_history" ADD CONSTRAINT "listing_renewal_history_paid_by_id_fkey" FOREIGN KEY ("paid_by_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
