-- CreateEnum
CREATE TYPE "RentalRequestStatus" AS ENUM ('pending', 'under_review', 'approved', 'rejected', 'cancelled', 'expired', 'contract_created');

-- CreateEnum
CREATE TYPE "RentalContractStatus" AS ENUM ('draft', 'pending_tenant', 'tenant_signed', 'pending_landlord', 'owner_signed', 'fully_signed', 'active', 'expired', 'terminated', 'renewed', 'cancelled');

-- CreateEnum
CREATE TYPE "ContractType" AS ENUM ('fixed_term', 'periodic', 'short_term');

-- CreateEnum
CREATE TYPE "RenewalStatus" AS ENUM ('not_applicable', 'pending', 'approved', 'declined', 'auto_renewed');

-- CreateEnum
CREATE TYPE "TerminationReason" AS ENUM ('lease_end', 'tenant_request', 'landlord_request', 'mutual_agreement', 'breach_of_contract', 'non_payment', 'property_sold', 'force_majeure', 'other');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('pending', 'paid', 'overdue', 'partial', 'cancelled', 'refunded');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('cash', 'bank_transfer', 'momo', 'vnpay', 'zalopay', 'credit_card', 'crypto', 'other');

-- CreateEnum
CREATE TYPE "PaymentType" AS ENUM ('rent', 'deposit', 'electricity', 'water', 'internet', 'parking', 'management_fee', 'service_fee', 'late_fee', 'damage_fee', 'early_termination', 'other');

-- CreateEnum
CREATE TYPE "DepositStatus" AS ENUM ('held', 'partially_returned', 'fully_returned', 'forfeited');

-- CreateEnum
CREATE TYPE "ContractTemplateType" AS ENUM ('standard', 'custom', 'government');

-- CreateEnum
CREATE TYPE "BlockchainNetwork" AS ENUM ('ethereum', 'polygon', 'bsc', 'solana', 'other');

-- CreateEnum
CREATE TYPE "TerminationRequestStatus" AS ENUM ('pending', 'approved', 'rejected', 'cancelled');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('OWNER', 'TENANT');

-- CreateEnum
CREATE TYPE "ReportType" AS ENUM ('payment', 'deposit', 'property', 'contract', 'other');

-- CreateEnum
CREATE TYPE "ReportPriority" AS ENUM ('low', 'medium', 'high');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('open', 'negotiating', 'admin', 'resolved');

-- CreateEnum
CREATE TYPE "ReportAction" AS ENUM ('CREATED', 'NEGOTIATING', 'SENT_TO_ADMIN', 'RESOLVED');

-- CreateEnum
CREATE TYPE "WalletTransactionType" AS ENUM ('deposit', 'withdraw', 'pay_rent', 'receive_rent', 'hold_deposit', 'refund', 'fee');

-- CreateEnum
CREATE TYPE "WalletTransactionStatus" AS ENUM ('pending', 'success', 'failed');

-- CreateEnum
CREATE TYPE "WithdrawalStatus" AS ENUM ('pending', 'processing', 'success', 'rejected');

-- CreateTable
CREATE TABLE "rental_requests" (
    "request_id" UUID NOT NULL,
    "request_code" VARCHAR(50) NOT NULL,
    "property_id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "proposed_rent" DECIMAL(15,2) NOT NULL,
    "message" TEXT,
    "status" "RentalRequestStatus" NOT NULL DEFAULT 'pending',
    "reviewed_at" TIMESTAMP(3),
    "rejection_reason" TEXT,
    "landlord_notes" TEXT,
    "contract_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rental_requests_pkey" PRIMARY KEY ("request_id")
);

-- CreateTable
CREATE TABLE "rental_contracts" (
    "rental_id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "from_request_id" UUID,
    "contract_code" VARCHAR(50) NOT NULL,
    "contract_type" "ContractType" NOT NULL DEFAULT 'fixed_term',
    "template_id" UUID,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "signed_date" DATE,
    "monthly_rent" DECIMAL(15,2) NOT NULL,
    "deposit_amount" DECIMAL(15,2) NOT NULL,
    "electricity_cost_per_kwh" DECIMAL(10,2),
    "water_cost_per_m3" DECIMAL(10,2),
    "management_fee" DECIMAL(15,2),
    "parking_fee" DECIMAL(15,2),
    "internet_fee" DECIMAL(15,2),
    "payment_due_day" INTEGER NOT NULL DEFAULT 5,
    "late_fee_per_day" DECIMAL(10,2),
    "grace_period_days" INTEGER NOT NULL DEFAULT 3,
    "renewal_status" "RenewalStatus" NOT NULL DEFAULT 'not_applicable',
    "auto_renewal" BOOLEAN NOT NULL DEFAULT false,
    "renewal_notice_days" INTEGER NOT NULL DEFAULT 30,
    "renewed_to_contract_id" UUID,
    "renewed_from_contract_id" UUID,
    "contract_pdf_url" VARCHAR(500),
    "contract_data" JSONB,
    "contract_html" TEXT,
    "status" "RentalContractStatus" NOT NULL DEFAULT 'draft',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "contract_hash" VARCHAR(255),
    "blockchain_tx_hash" VARCHAR(255),
    "blockchain_network" "BlockchainNetwork",
    "blockchain_recorded_at" TIMESTAMP(3),
    "owner_transaction_id" TEXT,
    "tenant_transaction_id" TEXT,
    "owner_signed_at" TIMESTAMP(3),
    "tenant_signed_at" TIMESTAMP(3),
    "sign_hash" TEXT,
    "signed_contract_url" TEXT,

    CONSTRAINT "rental_contracts_pkey" PRIMARY KEY ("rental_id")
);

-- CreateTable
CREATE TABLE "contract_termination_requests" (
    "termination_request_id" UUID NOT NULL,
    "rental_id" UUID NOT NULL,
    "requested_by" UUID NOT NULL,
    "requester_role" "UserRole" NOT NULL,
    "termination_reason" "TerminationReason" NOT NULL,
    "termination_note" TEXT,
    "requested_termination_date" DATE NOT NULL,
    "early_termination_fee" DECIMAL(15,2),
    "status" "TerminationRequestStatus" NOT NULL DEFAULT 'pending',
    "reviewed_by" UUID,
    "reviewed_at" TIMESTAMP(3),
    "review_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contract_termination_requests_pkey" PRIMARY KEY ("termination_request_id")
);

-- CreateTable
CREATE TABLE "contract_signature_logs" (
    "log_id" UUID NOT NULL,
    "rental_id" UUID NOT NULL,
    "action" VARCHAR(50) NOT NULL,
    "actor" TEXT,
    "actor_role" VARCHAR(20) NOT NULL,
    "ip_address" VARCHAR(45),
    "user_agent" VARCHAR(500),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contract_signature_logs_pkey" PRIMARY KEY ("log_id")
);

-- CreateTable
CREATE TABLE "contract_terms" (
    "id" TEXT NOT NULL,
    "rental_id" UUID NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contract_terms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "payment_id" UUID NOT NULL,
    "rental_id" UUID NOT NULL,
    "payment_code" VARCHAR(50) NOT NULL,
    "payment_type" "PaymentType" NOT NULL,
    "due_date" DATE NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'VND',
    "paid_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "remaining_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "late_fee" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "status" "PaymentStatus" NOT NULL DEFAULT 'pending',
    "paymentMethod" "PaymentMethod",
    "paid_at" TIMESTAMP(3),
    "confirmed_at" TIMESTAMP(3),
    "transaction_id" VARCHAR(255),
    "transaction_ref" VARCHAR(255),
    "receipt_url" VARCHAR(500),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("payment_id")
);

-- CreateTable
CREATE TABLE "contract_templates" (
    "template_id" UUID NOT NULL,
    "template_name" VARCHAR(255) NOT NULL,
    "template_type" "ContractTemplateType" NOT NULL DEFAULT 'standard',
    "template_category" VARCHAR(100),
    "description" TEXT,
    "template_content" TEXT NOT NULL,
    "template_variables" JSONB,
    "default_terms" JSONB,
    "version" INTEGER NOT NULL DEFAULT 1,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contract_templates_pkey" PRIMARY KEY ("template_id")
);

-- CreateTable
CREATE TABLE "deposit_transactions" (
    "id" TEXT NOT NULL,
    "rental_id" UUID NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "status" "DepositStatus" NOT NULL DEFAULT 'held',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deposit_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contract_documents" (
    "id" TEXT NOT NULL,
    "rental_id" UUID NOT NULL,
    "url" VARCHAR(500) NOT NULL,
    "type" VARCHAR(50) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contract_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contract_amendments" (
    "id" TEXT NOT NULL,
    "rental_id" UUID NOT NULL,
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contract_amendments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "utility_readings" (
    "id" TEXT NOT NULL,
    "rental_id" UUID NOT NULL,
    "type" VARCHAR(50) NOT NULL,
    "reading" DECIMAL(10,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "utility_readings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reports" (
    "id" TEXT NOT NULL,
    "rental_id" UUID NOT NULL,
    "created_by" UUID NOT NULL,
    "against_id" UUID NOT NULL,
    "type" "ReportType" NOT NULL,
    "priority" "ReportPriority" NOT NULL DEFAULT 'medium',
    "status" "ReportStatus" NOT NULL DEFAULT 'open',
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "adminNote" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),

    CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report_histories" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "action" "ReportAction" NOT NULL,
    "oldStatus" "ReportStatus",
    "newStatus" "ReportStatus",
    "performedBy" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "report_histories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wallets" (
    "wallet_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "balance" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "pending_balance" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'VND',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wallets_pkey" PRIMARY KEY ("wallet_id")
);

-- CreateTable
CREATE TABLE "wallet_transactions" (
    "id" UUID NOT NULL,
    "wallet_id" UUID NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "type" "WalletTransactionType" NOT NULL,
    "status" "WalletTransactionStatus" NOT NULL DEFAULT 'success',
    "reference_id" UUID,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paymentId" UUID,

    CONSTRAINT "wallet_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "withdrawal_requests" (
    "id" UUID NOT NULL,
    "wallet_id" UUID NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "bank_code" TEXT NOT NULL,
    "account_number" TEXT NOT NULL,
    "account_name" TEXT NOT NULL,
    "status" "WithdrawalStatus" NOT NULL DEFAULT 'pending',
    "admin_note" TEXT,
    "evidence_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMP(3),

    CONSTRAINT "withdrawal_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "rental_requests_request_code_key" ON "rental_requests"("request_code");

-- CreateIndex
CREATE UNIQUE INDEX "rental_requests_contract_id_key" ON "rental_requests"("contract_id");

-- CreateIndex
CREATE INDEX "rental_requests_property_id_idx" ON "rental_requests"("property_id");

-- CreateIndex
CREATE INDEX "rental_requests_tenant_id_idx" ON "rental_requests"("tenant_id");

-- CreateIndex
CREATE INDEX "rental_requests_owner_id_idx" ON "rental_requests"("owner_id");

-- CreateIndex
CREATE INDEX "rental_requests_status_idx" ON "rental_requests"("status");

-- CreateIndex
CREATE INDEX "rental_requests_request_code_idx" ON "rental_requests"("request_code");

-- CreateIndex
CREATE UNIQUE INDEX "rental_contracts_from_request_id_key" ON "rental_contracts"("from_request_id");

-- CreateIndex
CREATE UNIQUE INDEX "rental_contracts_contract_code_key" ON "rental_contracts"("contract_code");

-- CreateIndex
CREATE UNIQUE INDEX "rental_contracts_renewed_to_contract_id_key" ON "rental_contracts"("renewed_to_contract_id");

-- CreateIndex
CREATE UNIQUE INDEX "rental_contracts_renewed_from_contract_id_key" ON "rental_contracts"("renewed_from_contract_id");

-- CreateIndex
CREATE INDEX "rental_contracts_property_id_idx" ON "rental_contracts"("property_id");

-- CreateIndex
CREATE INDEX "rental_contracts_owner_id_idx" ON "rental_contracts"("owner_id");

-- CreateIndex
CREATE INDEX "rental_contracts_tenant_id_idx" ON "rental_contracts"("tenant_id");

-- CreateIndex
CREATE INDEX "rental_contracts_status_idx" ON "rental_contracts"("status");

-- CreateIndex
CREATE INDEX "rental_contracts_start_date_idx" ON "rental_contracts"("start_date");

-- CreateIndex
CREATE INDEX "rental_contracts_end_date_idx" ON "rental_contracts"("end_date");

-- CreateIndex
CREATE INDEX "rental_contracts_contract_code_idx" ON "rental_contracts"("contract_code");

-- CreateIndex
CREATE INDEX "rental_contracts_from_request_id_idx" ON "rental_contracts"("from_request_id");

-- CreateIndex
CREATE INDEX "contract_termination_requests_rental_id_idx" ON "contract_termination_requests"("rental_id");

-- CreateIndex
CREATE INDEX "contract_termination_requests_status_idx" ON "contract_termination_requests"("status");

-- CreateIndex
CREATE INDEX "contract_signature_logs_rental_id_idx" ON "contract_signature_logs"("rental_id");

-- CreateIndex
CREATE INDEX "contract_signature_logs_action_idx" ON "contract_signature_logs"("action");

-- CreateIndex
CREATE INDEX "contract_terms_rental_id_idx" ON "contract_terms"("rental_id");

-- CreateIndex
CREATE UNIQUE INDEX "payments_payment_code_key" ON "payments"("payment_code");

-- CreateIndex
CREATE INDEX "payments_rental_id_idx" ON "payments"("rental_id");

-- CreateIndex
CREATE INDEX "payments_status_idx" ON "payments"("status");

-- CreateIndex
CREATE INDEX "payments_due_date_idx" ON "payments"("due_date");

-- CreateIndex
CREATE INDEX "payments_payment_type_idx" ON "payments"("payment_type");

-- CreateIndex
CREATE INDEX "payments_payment_code_idx" ON "payments"("payment_code");

-- CreateIndex
CREATE INDEX "contract_templates_template_type_idx" ON "contract_templates"("template_type");

-- CreateIndex
CREATE INDEX "contract_templates_is_default_idx" ON "contract_templates"("is_default");

-- CreateIndex
CREATE INDEX "contract_templates_is_active_idx" ON "contract_templates"("is_active");

-- CreateIndex
CREATE INDEX "deposit_transactions_rental_id_idx" ON "deposit_transactions"("rental_id");

-- CreateIndex
CREATE INDEX "contract_documents_rental_id_idx" ON "contract_documents"("rental_id");

-- CreateIndex
CREATE INDEX "contract_amendments_rental_id_idx" ON "contract_amendments"("rental_id");

-- CreateIndex
CREATE INDEX "utility_readings_rental_id_idx" ON "utility_readings"("rental_id");

-- CreateIndex
CREATE INDEX "reports_rental_id_idx" ON "reports"("rental_id");

-- CreateIndex
CREATE UNIQUE INDEX "wallets_user_id_key" ON "wallets"("user_id");

-- AddForeignKey
ALTER TABLE "rental_requests" ADD CONSTRAINT "rental_requests_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "rental_contracts"("rental_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_contracts" ADD CONSTRAINT "rental_contracts_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "contract_templates"("template_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_contracts" ADD CONSTRAINT "rental_contracts_renewed_to_contract_id_fkey" FOREIGN KEY ("renewed_to_contract_id") REFERENCES "rental_contracts"("rental_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_termination_requests" ADD CONSTRAINT "contract_termination_requests_rental_id_fkey" FOREIGN KEY ("rental_id") REFERENCES "rental_contracts"("rental_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_signature_logs" ADD CONSTRAINT "contract_signature_logs_rental_id_fkey" FOREIGN KEY ("rental_id") REFERENCES "rental_contracts"("rental_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_terms" ADD CONSTRAINT "contract_terms_rental_id_fkey" FOREIGN KEY ("rental_id") REFERENCES "rental_contracts"("rental_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_rental_id_fkey" FOREIGN KEY ("rental_id") REFERENCES "rental_contracts"("rental_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deposit_transactions" ADD CONSTRAINT "deposit_transactions_rental_id_fkey" FOREIGN KEY ("rental_id") REFERENCES "rental_contracts"("rental_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_documents" ADD CONSTRAINT "contract_documents_rental_id_fkey" FOREIGN KEY ("rental_id") REFERENCES "rental_contracts"("rental_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_amendments" ADD CONSTRAINT "contract_amendments_rental_id_fkey" FOREIGN KEY ("rental_id") REFERENCES "rental_contracts"("rental_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "utility_readings" ADD CONSTRAINT "utility_readings_rental_id_fkey" FOREIGN KEY ("rental_id") REFERENCES "rental_contracts"("rental_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_rental_id_fkey" FOREIGN KEY ("rental_id") REFERENCES "rental_contracts"("rental_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_histories" ADD CONSTRAINT "report_histories_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"("payment_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_wallet_id_fkey" FOREIGN KEY ("wallet_id") REFERENCES "wallets"("wallet_id") ON DELETE RESTRICT ON UPDATE CASCADE;
