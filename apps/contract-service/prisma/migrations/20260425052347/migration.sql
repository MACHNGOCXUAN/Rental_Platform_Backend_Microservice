-- CreateTable
CREATE TABLE "report_attachments" (
    "id" TEXT NOT NULL,
    "report_id" TEXT NOT NULL,
    "url" VARCHAR(500) NOT NULL,
    "type" VARCHAR(50) NOT NULL,
    "file_name" VARCHAR(255),
    "file_size" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "report_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "termination_decisions" (
    "id" TEXT NOT NULL,
    "termination_request_id" UUID NOT NULL,
    "decision_type" VARCHAR(50) NOT NULL,
    "deposit_return_amount" DECIMAL(15,2),
    "penalty_amount" DECIMAL(15,2),
    "compensation_amount" DECIMAL(15,2),
    "final_note" TEXT,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "termination_decisions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "report_attachments_report_id_idx" ON "report_attachments"("report_id");

-- CreateIndex
CREATE INDEX "termination_decisions_termination_request_id_idx" ON "termination_decisions"("termination_request_id");

-- AddForeignKey
ALTER TABLE "report_attachments" ADD CONSTRAINT "report_attachments_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "termination_decisions" ADD CONSTRAINT "termination_decisions_termination_request_id_fkey" FOREIGN KEY ("termination_request_id") REFERENCES "contract_termination_requests"("termination_request_id") ON DELETE CASCADE ON UPDATE CASCADE;
