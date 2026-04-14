-- AlterTable
ALTER TABLE "reports" ADD COLUMN     "termination_request_id" UUID;

-- CreateIndex
CREATE INDEX "reports_termination_request_id_idx" ON "reports"("termination_request_id");

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_termination_request_id_fkey" FOREIGN KEY ("termination_request_id") REFERENCES "contract_termination_requests"("termination_request_id") ON DELETE SET NULL ON UPDATE CASCADE;
