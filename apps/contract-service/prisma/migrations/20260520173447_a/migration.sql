-- CreateTable
CREATE TABLE "payment_blockchain_proofs" (
    "id" UUID NOT NULL,
    "paymentId" UUID NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "txHash" TEXT NOT NULL,
    "blockNumber" BIGINT NOT NULL,
    "chainId" INTEGER NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_blockchain_proofs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "payment_blockchain_proofs_paymentId_key" ON "payment_blockchain_proofs"("paymentId");

-- CreateIndex
CREATE INDEX "payment_blockchain_proofs_paymentId_idx" ON "payment_blockchain_proofs"("paymentId");

-- CreateIndex
CREATE INDEX "payment_blockchain_proofs_txHash_idx" ON "payment_blockchain_proofs"("txHash");

-- AddForeignKey
ALTER TABLE "payment_blockchain_proofs" ADD CONSTRAINT "payment_blockchain_proofs_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"("payment_id") ON DELETE CASCADE ON UPDATE CASCADE;
