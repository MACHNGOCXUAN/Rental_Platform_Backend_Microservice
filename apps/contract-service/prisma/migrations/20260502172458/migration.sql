/*
  Warnings:

  - You are about to drop the column `signProcessingStatus` on the `rental_contracts` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "rental_contracts" DROP COLUMN "signProcessingStatus",
ADD COLUMN     "ownerSignStatus" "ProcessingStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "tenantSignStatus" "ProcessingStatus" NOT NULL DEFAULT 'PENDING';
