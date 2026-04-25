-- Ensure only one winner per property for holding deposit
CREATE UNIQUE INDEX IF NOT EXISTS "rental_requests_property_id_holding_deposit_paid_uq"
  ON "rental_requests" ("property_id")
  WHERE "status" IN ('holding_deposit_paid', 'contract_created');
