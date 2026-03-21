/*
  Warnings:

  - You are about to drop the column `template_type` on the `contract_templates` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "contract_templates_template_type_idx";

-- AlterTable
ALTER TABLE "contract_templates" DROP COLUMN "template_type",
ADD COLUMN     "templateType" "ContractTemplateType" NOT NULL DEFAULT 'standard',
ADD COLUMN     "template_category" TEXT,
ALTER COLUMN "template_name" SET DATA TYPE TEXT;

-- AlterTable
ALTER TABLE "rental_contracts" ADD COLUMN     "contract_data" JSONB,
ADD COLUMN     "contract_html" TEXT;

-- CreateIndex
CREATE INDEX "contract_templates_templateType_idx" ON "contract_templates"("templateType");

-- CreateIndex
CREATE INDEX "contract_templates_is_default_idx" ON "contract_templates"("is_default");
