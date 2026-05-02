-- CreateEnum
CREATE TYPE "ProcessingStatus" AS ENUM ('PENDING', 'PROCESSING', 'DONE');

-- AlterTable
ALTER TABLE "rental_contracts" ADD COLUMN     "blockchainStatus" "ProcessingStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "signProcessingStatus" "ProcessingStatus" NOT NULL DEFAULT 'PENDING';
