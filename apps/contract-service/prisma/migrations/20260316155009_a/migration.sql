/*
  Warnings:

  - You are about to drop the column `templateType` on the `contract_templates` table. All the data in the column will be lost.
  - You are about to alter the column `template_name` on the `contract_templates` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(255)`.
  - You are about to alter the column `template_category` on the `contract_templates` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(100)`.

*/
-- DropIndex
DROP INDEX "contract_templates_templateType_idx";

-- AlterTable
ALTER TABLE "contract_templates" DROP COLUMN "templateType",
ADD COLUMN     "template_type" "ContractTemplateType" NOT NULL DEFAULT 'standard',
ALTER COLUMN "template_name" SET DATA TYPE VARCHAR(255),
ALTER COLUMN "template_category" SET DATA TYPE VARCHAR(100);

-- CreateIndex
CREATE INDEX "contract_templates_template_type_idx" ON "contract_templates"("template_type");
