-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "rental_request_id" UUID,
ALTER COLUMN "rental_id" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "payments_rental_request_id_idx" ON "payments"("rental_request_id");

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_rental_request_id_fkey" FOREIGN KEY ("rental_request_id") REFERENCES "rental_requests"("request_id") ON DELETE SET NULL ON UPDATE CASCADE;
