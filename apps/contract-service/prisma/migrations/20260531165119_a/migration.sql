-- AlterEnum
ALTER TYPE "RentalContractStatus" ADD VALUE 'superseded';

-- AlterTable
ALTER TABLE "rental_contracts" ADD COLUMN     "parent_contract_id" UUID,
ADD COLUMN     "update_expiration_time" TIMESTAMP(3),
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- AddForeignKey
ALTER TABLE "rental_contracts" ADD CONSTRAINT "rental_contracts_parent_contract_id_fkey" FOREIGN KEY ("parent_contract_id") REFERENCES "rental_contracts"("rental_id") ON DELETE SET NULL ON UPDATE CASCADE;
