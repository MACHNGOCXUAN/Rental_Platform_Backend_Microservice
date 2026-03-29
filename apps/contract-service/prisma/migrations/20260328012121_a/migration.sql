-- AlterEnum
ALTER TYPE "RentalContractStatus" ADD VALUE 'owner_signed';

-- AlterTable
ALTER TABLE "rental_contracts" ADD COLUMN     "owner_signed_at" TIMESTAMP(3),
ADD COLUMN     "owner_transaction_id" TEXT,
ADD COLUMN     "sign_hash" TEXT,
ADD COLUMN     "signed_contract_url" TEXT,
ADD COLUMN     "tenant_signed_at" TIMESTAMP(3),
ADD COLUMN     "tenant_transaction_id" TEXT;
