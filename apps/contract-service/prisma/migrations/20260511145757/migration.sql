-- CreateEnum
CREATE TYPE "RenewalRequestStatus" AS ENUM ('pending', 'approved', 'rejected', 'cancelled');

-- CreateEnum
CREATE TYPE "ContractAppendixType" AS ENUM ('renewal', 'adjustment', 'extension');

-- AlterEnum
ALTER TYPE "RentalContractStatus" ADD VALUE 'near_expiration';

-- AlterTable
ALTER TABLE "rental_contracts" ADD COLUMN     "auto_renew_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "max_auto_renew_count" INTEGER NOT NULL DEFAULT 3;

-- CreateTable
CREATE TABLE "renewal_requests_v2" (
    "id" UUID NOT NULL,
    "contract_id" UUID NOT NULL,
    "requested_by_id" UUID NOT NULL,
    "duration_months" INTEGER NOT NULL,
    "proposed_start_date" DATE NOT NULL,
    "proposed_end_date" DATE NOT NULL,
    "status" "RenewalRequestStatus" NOT NULL DEFAULT 'pending',
    "note" TEXT,
    "review_note" TEXT,
    "appendix_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approved_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "renewal_requests_v2_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contract_appendices" (
    "id" UUID NOT NULL,
    "contract_id" UUID NOT NULL,
    "type" "ContractAppendixType" NOT NULL DEFAULT 'renewal',
    "appendix_number" INTEGER NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "content" TEXT,
    "created_by_id" UUID NOT NULL,
    "signed_at" TIMESTAMP(3),
    "blockchain_tx_hash" VARCHAR(255),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contract_appendices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "renewal_requests_v2_appendix_id_key" ON "renewal_requests_v2"("appendix_id");

-- CreateIndex
CREATE INDEX "renewal_requests_v2_contract_id_idx" ON "renewal_requests_v2"("contract_id");

-- CreateIndex
CREATE INDEX "renewal_requests_v2_requested_by_id_idx" ON "renewal_requests_v2"("requested_by_id");

-- CreateIndex
CREATE INDEX "renewal_requests_v2_status_idx" ON "renewal_requests_v2"("status");

-- CreateIndex
CREATE INDEX "contract_appendices_contract_id_idx" ON "contract_appendices"("contract_id");

-- AddForeignKey
ALTER TABLE "renewal_requests_v2" ADD CONSTRAINT "renewal_requests_v2_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "rental_contracts"("rental_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "renewal_requests_v2" ADD CONSTRAINT "renewal_requests_v2_appendix_id_fkey" FOREIGN KEY ("appendix_id") REFERENCES "contract_appendices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_appendices" ADD CONSTRAINT "contract_appendices_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "rental_contracts"("rental_id") ON DELETE CASCADE ON UPDATE CASCADE;
