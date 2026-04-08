/*
  Warnings:

  - You are about to drop the column `wallet_transaction_id` on the `payments` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "payments" DROP COLUMN "wallet_transaction_id";

-- AlterTable
ALTER TABLE "wallet_transactions" ADD COLUMN     "paymentId" UUID;

-- AddForeignKey
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"("payment_id") ON DELETE SET NULL ON UPDATE CASCADE;
