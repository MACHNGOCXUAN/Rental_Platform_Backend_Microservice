/*
  Warnings:

  - The primary key for the `property_rules` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `property_id` on the `property_rules` table. All the data in the column will be lost.
  - You are about to drop the column `rule_id` on the `property_rules` table. All the data in the column will be lost.
  - You are about to drop the column `rule_type` on the `property_rules` table. All the data in the column will be lost.
  - The required column `id` was added to the `property_rules` table with a prisma-level default value. This is not possible if the table is not empty. Please add this column as optional, then populate it before making it required.
  - Added the required column `propertyId` to the `property_rules` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "property_rules" DROP CONSTRAINT "property_rules_property_id_fkey";

-- AlterTable
ALTER TABLE "property_rules" DROP CONSTRAINT "property_rules_pkey",
DROP COLUMN "property_id",
DROP COLUMN "rule_id",
DROP COLUMN "rule_type",
ADD COLUMN     "id" UUID NOT NULL,
ADD COLUMN     "propertyId" UUID NOT NULL,
ADD CONSTRAINT "property_rules_pkey" PRIMARY KEY ("id");

-- AddForeignKey
ALTER TABLE "property_rules" ADD CONSTRAINT "property_rules_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties"("property_id") ON DELETE CASCADE ON UPDATE CASCADE;
