-- AlterTable
ALTER TABLE "contract_appendices" ADD COLUMN     "appendix_hash" VARCHAR(255),
ADD COLUMN     "approved_at" TIMESTAMP(3),
ADD COLUMN     "effective_date" DATE,
ADD COLUMN     "rejected_at" TIMESTAMP(3),
ADD COLUMN     "rejected_reason" TEXT,
ADD COLUMN     "status" VARCHAR(30) NOT NULL DEFAULT 'active',
ADD COLUMN     "title" TEXT,
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1,
ALTER COLUMN "start_date" DROP NOT NULL,
ALTER COLUMN "end_date" DROP NOT NULL;

-- AlterTable
ALTER TABLE "contract_signature_logs" ADD COLUMN     "details" TEXT;

-- AlterTable
ALTER TABLE "payment_blockchain_proofs" ADD COLUMN     "last_verified_at" TIMESTAMP(3),
ADD COLUMN     "verification_status" VARCHAR(20);

-- AlterTable
ALTER TABLE "rental_contracts" ADD COLUMN     "last_verified_at" TIMESTAMP(3),
ADD COLUMN     "verification_status" VARCHAR(20);

-- CreateIndex
CREATE INDEX "contract_appendices_status_idx" ON "contract_appendices"("status");
