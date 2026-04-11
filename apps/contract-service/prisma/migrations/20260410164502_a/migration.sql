/*
  Warnings:

  - The values [tenant_request,landlord_request,property_sold] on the enum `TerminationReason` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "TerminationReason_new" AS ENUM ('lease_end', 'unilateral_termination', 'mutual_agreement', 'breach_of_contract', 'non_payment', 'force_majeure', 'other');
ALTER TABLE "contract_termination_requests" ALTER COLUMN "termination_reason" TYPE "TerminationReason_new" USING ("termination_reason"::text::"TerminationReason_new");
ALTER TYPE "TerminationReason" RENAME TO "TerminationReason_old";
ALTER TYPE "TerminationReason_new" RENAME TO "TerminationReason";
DROP TYPE "public"."TerminationReason_old";
COMMIT;
