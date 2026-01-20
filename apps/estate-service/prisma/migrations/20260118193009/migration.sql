/*
  Warnings:

  - The values [unfurnished,partially_furnished,fully_furnished] on the enum `FurnitureStatus` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "FurnitureStatus_new" AS ENUM ('empty', 'basic', 'full', 'luxury');
ALTER TABLE "properties" ALTER COLUMN "furniture_status" TYPE "FurnitureStatus_new" USING ("furniture_status"::text::"FurnitureStatus_new");
ALTER TYPE "FurnitureStatus" RENAME TO "FurnitureStatus_old";
ALTER TYPE "FurnitureStatus_new" RENAME TO "FurnitureStatus";
DROP TYPE "public"."FurnitureStatus_old";
COMMIT;
