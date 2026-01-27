-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('admin', 'user');

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('male', 'female', 'other');

-- CreateEnum
CREATE TYPE "WalletType" AS ENUM ('metamask', 'trust_wallet', 'coinbase', 'other');

-- CreateEnum
CREATE TYPE "KycStatus" AS ENUM ('pending', 'in_review', 'verified', 'rejected', 'expired');

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('id_card', 'passport', 'driver_license', 'business_license');

-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('pending', 'in_review', 'approved', 'rejected');

-- CreateEnum
CREATE TYPE "PropertyType" AS ENUM ('apartment', 'house', 'land', 'office', 'room');

-- CreateEnum
CREATE TYPE "FurnitureStatus" AS ENUM ('empty', 'basic', 'full', 'luxury');

-- CreateEnum
CREATE TYPE "PropertyStatus" AS ENUM ('draft', 'pending_approval', 'active', 'rented', 'maintenance', 'inactive', 'rejected');

-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('pending', 'approved', 'rejected');

-- CreateEnum
CREATE TYPE "ImageType" AS ENUM ('exterior', 'interior', 'bedroom', 'bathroom', 'kitchen', 'living_room', 'view', 'other');

-- CreateEnum
CREATE TYPE "AmenityCategory" AS ENUM ('appliances', 'furniture', 'safety', 'convenience', 'entertainment', 'outdoor', 'other');

-- CreateEnum
CREATE TYPE "RuleType" AS ENUM ('restriction', 'requirement', 'policy', 'other');

-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('pending', 'confirmed', 'cancelled', 'completed', 'no_show');

-- CreateEnum
CREATE TYPE "ReportTargetType" AS ENUM ('property', 'user', 'review', 'rental');

-- CreateEnum
CREATE TYPE "ReportCategory" AS ENUM ('fraud', 'scam', 'fake_listing', 'inappropriate_content', 'harassment', 'discrimination', 'spam', 'copyright', 'dangerous_property', 'misrepresentation', 'other');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('pending', 'under_review', 'resolved', 'dismissed', 'escalated');

-- CreateEnum
CREATE TYPE "ReportPriority" AS ENUM ('low', 'normal', 'high', 'urgent');

-- CreateEnum
CREATE TYPE "ActionTaken" AS ENUM ('none', 'warning_sent', 'content_removed', 'account_suspended', 'account_banned', 'listing_removed', 'other');

-- CreateEnum
CREATE TYPE "MaintenanceCategory" AS ENUM ('plumbing', 'electrical', 'appliance', 'structural', 'heating_cooling', 'security', 'cleaning', 'pest_control', 'other');

-- CreateEnum
CREATE TYPE "MaintenancePriority" AS ENUM ('low', 'normal', 'high', 'emergency');

-- CreateEnum
CREATE TYPE "MaintenanceStatus" AS ENUM ('submitted', 'acknowledged', 'scheduled', 'in_progress', 'completed', 'cancelled', 'on_hold');

-- CreateEnum
CREATE TYPE "WhoPays" AS ENUM ('landlord', 'tenant', 'split', 'warranty');

-- CreateEnum
CREATE TYPE "MaintenanceUpdateType" AS ENUM ('status_change', 'assignment', 'note', 'completion', 'cost_update');

-- CreateEnum
CREATE TYPE "InspectionType" AS ENUM ('move_in', 'move_out', 'periodic', 'maintenance', 'damage_assessment');

-- CreateEnum
CREATE TYPE "InspectionCondition" AS ENUM ('excellent', 'good', 'fair', 'poor');

-- CreateEnum
CREATE TYPE "ResponsibleParty" AS ENUM ('tenant', 'landlord', 'normal_wear', 'unknown');

-- CreateEnum
CREATE TYPE "SettingType" AS ENUM ('string', 'number', 'boolean', 'json');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" VARCHAR(255),
    "password_hash" VARCHAR(255),
    "full_name" VARCHAR(255) NOT NULL,
    "phone" VARCHAR(20),
    "phone_verified" BOOLEAN NOT NULL DEFAULT false,
    "date_of_birth" DATE,
    "gender" "Gender",
    "avatar_url" VARCHAR(500),
    "role" "UserRole" NOT NULL DEFAULT 'user',
    "wallet_address" VARCHAR(42),
    "wallet_type" "WalletType",
    "kyc_status" "KycStatus" NOT NULL DEFAULT 'pending',
    "kyc_submitted_at" TIMESTAMP(3),
    "kyc_verified_at" TIMESTAMP(3),
    "kyc_expired_at" TIMESTAMP(3),
    "kyc_rejection_reason" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_email_verified" BOOLEAN NOT NULL DEFAULT false,
    "email_verified_at" TIMESTAMP(3),
    "is_banned" BOOLEAN NOT NULL DEFAULT false,
    "banned_at" TIMESTAMP(3),
    "banned_reason" TEXT,
    "banned_until" TIMESTAMP(3),
    "last_login_at" TIMESTAMP(3),
    "last_login_ip" TEXT,
    "login_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_profiles" (
    "profile_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "full_name" VARCHAR(255) NOT NULL,
    "id_card_number" VARCHAR(20) NOT NULL,
    "current_address" TEXT,
    "current_ward" VARCHAR(100),
    "current_district" VARCHAR(100),
    "current_city" VARCHAR(100),
    "occupation" VARCHAR(255),
    "emergency_contact_name" VARCHAR(255),
    "emergency_contact_phone" VARCHAR(20),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_profiles_pkey" PRIMARY KEY ("profile_id")
);

-- CreateTable
CREATE TABLE "kyc_documents" (
    "kyc_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "document_type" "DocumentType" NOT NULL,
    "document_number" VARCHAR(50) NOT NULL,
    "document_issue_date" DATE,
    "document_expiry_date" DATE,
    "document_issue_place" VARCHAR(255),
    "front_image_url" VARCHAR(500) NOT NULL,
    "back_image_url" VARCHAR(500),
    "selfie_url" VARCHAR(500) NOT NULL,
    "face_match_score" DECIMAL(5,2),
    "ocr_data" JSONB,
    "liveness_score" DECIMAL(5,2),
    "verification_provider" VARCHAR(50),
    "verification_reference_id" VARCHAR(255),
    "status" "DocumentStatus" NOT NULL DEFAULT 'pending',
    "reviewed_by" UUID,
    "reviewed_at" TIMESTAMP(3),
    "rejection_reason" TEXT,
    "notes" TEXT,
    "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "kyc_documents_pkey" PRIMARY KEY ("kyc_id")
);

-- CreateTable
CREATE TABLE "properties" (
    "property_id" UUID NOT NULL,
    "landlord_id" UUID NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "property_type" "PropertyType" NOT NULL,
    "address" TEXT NOT NULL,
    "ward" VARCHAR(100) NOT NULL,
    "district" VARCHAR(100) NOT NULL,
    "city" VARCHAR(100) NOT NULL,
    "country" VARCHAR(100) NOT NULL DEFAULT 'Vietnam',
    "latitude" DECIMAL(10,8),
    "longitude" DECIMAL(11,8),
    "area_sqm" DECIMAL(10,2) NOT NULL,
    "floor_number" INTEGER,
    "total_floors" INTEGER,
    "bedrooms" INTEGER NOT NULL DEFAULT 0,
    "bathrooms" INTEGER NOT NULL DEFAULT 0,
    "living_rooms" INTEGER NOT NULL DEFAULT 0,
    "kitchens" INTEGER NOT NULL DEFAULT 0,
    "balconies" INTEGER NOT NULL DEFAULT 0,
    "price_per_month" DECIMAL(15,2) NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'VND',
    "deposit_amount" DECIMAL(15,2),
    "deposit_months" INTEGER NOT NULL DEFAULT 1,
    "electricity_cost_per_kwh" DECIMAL(10,2),
    "water_cost_per_m3" DECIMAL(10,2),
    "management_fee" DECIMAL(15,2),
    "parking_fee" DECIMAL(15,2),
    "internet_fee" DECIMAL(15,2),
    "available_from" DATE,
    "minimum_lease_months" INTEGER NOT NULL DEFAULT 6,
    "maximum_lease_months" INTEGER,
    "furniture_status" "FurnitureStatus",
    "has_fire_certificate" BOOLEAN NOT NULL DEFAULT false,
    "status" "PropertyStatus" NOT NULL DEFAULT 'draft',
    "approval_status" "ApprovalStatus" NOT NULL DEFAULT 'pending',
    "rejection_reason" TEXT,
    "approved_by" UUID,
    "approved_at" TIMESTAMP(3),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "view_count" INTEGER NOT NULL DEFAULT 0,
    "favorite_count" INTEGER NOT NULL DEFAULT 0,
    "contact_count" INTEGER NOT NULL DEFAULT 0,
    "booking_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "properties_pkey" PRIMARY KEY ("property_id")
);

-- CreateTable
CREATE TABLE "property_images" (
    "id" UUID NOT NULL,
    "propertyId" UUID NOT NULL,
    "image_url" VARCHAR(500) NOT NULL,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "property_images_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "property_videos" (
    "id" UUID NOT NULL,
    "propertyId" UUID NOT NULL,
    "video_url" VARCHAR(500) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "property_videos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "property_amenities" (
    "id" UUID NOT NULL,
    "propertyId" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "property_amenities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "property_rules" (
    "id" UUID NOT NULL,
    "propertyId" UUID NOT NULL,
    "rule_text" TEXT NOT NULL,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "property_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bookings" (
    "booking_id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "landlord_id" UUID NOT NULL,
    "booking_code" VARCHAR(50) NOT NULL,
    "visit_date" DATE NOT NULL,
    "visit_time_start" TIME(6) NOT NULL,
    "visit_time_end" TIME(6),
    "tenant_note" TEXT,
    "tenant_phone" VARCHAR(20),
    "number_of_visitors" INTEGER NOT NULL DEFAULT 1,
    "status" "BookingStatus" NOT NULL DEFAULT 'pending',
    "cancelled_by" UUID,
    "cancelled_at" TIMESTAMP(3),
    "cancellation_reason" TEXT,
    "confirmed_by" UUID,
    "confirmed_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "landlord_note" TEXT,
    "reminder_sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bookings_pkey" PRIMARY KEY ("booking_id")
);

-- CreateTable
CREATE TABLE "reviews" (
    "review_id" UUID NOT NULL,
    "rental_id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "reviewer_id" UUID NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT NOT NULL,
    "image_urls" TEXT[],
    "reply" TEXT,
    "replied_at" TIMESTAMP(3),
    "is_public" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reviews_pkey" PRIMARY KEY ("review_id")
);

-- CreateTable
CREATE TABLE "favorites" (
    "favorite_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "favorites_pkey" PRIMARY KEY ("favorite_id")
);

-- CreateTable
CREATE TABLE "reports" (
    "report_id" UUID NOT NULL,
    "reporter_id" UUID NOT NULL,
    "report_target_type" "ReportTargetType" NOT NULL,
    "report_target_id" UUID NOT NULL,
    "report_category" "ReportCategory" NOT NULL,
    "description" TEXT NOT NULL,
    "evidence_urls" TEXT[],
    "status" "ReportStatus" NOT NULL DEFAULT 'pending',
    "priority" "ReportPriority" NOT NULL DEFAULT 'normal',
    "reviewed_by" UUID,
    "reviewed_at" TIMESTAMP(3),
    "resolution_note" TEXT,
    "action_taken" "ActionTaken",
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reports_pkey" PRIMARY KEY ("report_id")
);

-- CreateTable
CREATE TABLE "maintenance_requests" (
    "request_id" UUID NOT NULL,
    "rental_id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "requester_id" UUID NOT NULL,
    "request_code" VARCHAR(50) NOT NULL,
    "category" "MaintenanceCategory" NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "description" TEXT NOT NULL,
    "priority" "MaintenancePriority" NOT NULL DEFAULT 'normal',
    "location_detail" VARCHAR(255),
    "image_urls" TEXT[],
    "video_url" VARCHAR(500),
    "status" "MaintenanceStatus" NOT NULL DEFAULT 'submitted',
    "assigned_to" UUID,
    "assigned_at" TIMESTAMP(3),
    "scheduled_date" DATE,
    "scheduled_time_start" TIME(6),
    "scheduled_time_end" TIME(6),
    "tenant_will_be_present" BOOLEAN NOT NULL DEFAULT true,
    "access_instructions" TEXT,
    "completed_at" TIMESTAMP(3),
    "completion_notes" TEXT,
    "estimated_cost" DECIMAL(15,2),
    "actual_cost" DECIMAL(15,2),
    "who_pays" "WhoPays",
    "tenant_rating" INTEGER,
    "tenant_feedback" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "maintenance_requests_pkey" PRIMARY KEY ("request_id")
);

-- CreateTable
CREATE TABLE "maintenance_updates" (
    "update_id" UUID NOT NULL,
    "request_id" UUID NOT NULL,
    "updated_by" UUID NOT NULL,
    "update_type" "MaintenanceUpdateType",
    "old_status" VARCHAR(20),
    "new_status" VARCHAR(20),
    "note" TEXT,
    "image_urls" TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "maintenance_updates_pkey" PRIMARY KEY ("update_id")
);

-- CreateTable
CREATE TABLE "property_inspections" (
    "inspection_id" UUID NOT NULL,
    "rental_id" UUID,
    "property_id" UUID NOT NULL,
    "inspection_type" "InspectionType" NOT NULL,
    "inspection_date" DATE NOT NULL,
    "inspector_id" UUID NOT NULL,
    "tenant_present" BOOLEAN NOT NULL DEFAULT false,
    "landlord_present" BOOLEAN NOT NULL DEFAULT false,
    "overall_condition" "InspectionCondition",
    "findings" JSONB,
    "issues_found" TEXT[],
    "repair_needed" TEXT[],
    "damage_cost" DECIMAL(15,2),
    "responsible_party" "ResponsibleParty",
    "photo_urls" TEXT[],
    "video_url" VARCHAR(500),
    "report_pdf_url" VARCHAR(500),
    "inspector_signature_url" VARCHAR(500),
    "tenant_signature_url" VARCHAR(500),
    "landlord_signature_url" VARCHAR(500),
    "inspector_signed_at" TIMESTAMP(3),
    "tenant_signed_at" TIMESTAMP(3),
    "landlord_signed_at" TIMESTAMP(3),
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "property_inspections_pkey" PRIMARY KEY ("inspection_id")
);

-- CreateTable
CREATE TABLE "notification_preferences" (
    "preference_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "email_new_booking" BOOLEAN NOT NULL DEFAULT true,
    "email_booking_confirmed" BOOLEAN NOT NULL DEFAULT true,
    "email_payment_reminder" BOOLEAN NOT NULL DEFAULT true,
    "email_payment_received" BOOLEAN NOT NULL DEFAULT true,
    "email_maintenance_request" BOOLEAN NOT NULL DEFAULT true,
    "email_contract_expiring" BOOLEAN NOT NULL DEFAULT true,
    "email_new_message" BOOLEAN NOT NULL DEFAULT true,
    "email_new_review" BOOLEAN NOT NULL DEFAULT true,
    "email_marketing" BOOLEAN NOT NULL DEFAULT false,
    "push_new_booking" BOOLEAN NOT NULL DEFAULT true,
    "push_booking_confirmed" BOOLEAN NOT NULL DEFAULT true,
    "push_payment_reminder" BOOLEAN NOT NULL DEFAULT true,
    "push_payment_received" BOOLEAN NOT NULL DEFAULT true,
    "push_maintenance_request" BOOLEAN NOT NULL DEFAULT true,
    "push_new_message" BOOLEAN NOT NULL DEFAULT true,
    "sms_booking_confirmed" BOOLEAN NOT NULL DEFAULT false,
    "sms_payment_reminder" BOOLEAN NOT NULL DEFAULT true,
    "sms_urgent_maintenance" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("preference_id")
);

-- CreateTable
CREATE TABLE "activity_logs" (
    "activity_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "activity_type" VARCHAR(50) NOT NULL,
    "description" TEXT,
    "metadata" JSONB,
    "ip_address" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_logs_pkey" PRIMARY KEY ("activity_id")
);

-- CreateTable
CREATE TABLE "system_settings" (
    "setting_id" UUID NOT NULL,
    "setting_key" VARCHAR(100) NOT NULL,
    "setting_value" TEXT NOT NULL,
    "setting_type" "SettingType" NOT NULL,
    "description" TEXT,
    "is_public" BOOLEAN NOT NULL DEFAULT false,
    "updated_by" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "system_settings_pkey" PRIMARY KEY ("setting_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_wallet_address_key" ON "users"("wallet_address");

-- CreateIndex
CREATE UNIQUE INDEX "user_profiles_user_id_key" ON "user_profiles"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_profiles_id_card_number_key" ON "user_profiles"("id_card_number");

-- CreateIndex
CREATE UNIQUE INDEX "property_amenities_propertyId_name_key" ON "property_amenities"("propertyId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "bookings_booking_code_key" ON "bookings"("booking_code");

-- CreateIndex
CREATE UNIQUE INDEX "favorites_user_id_property_id_key" ON "favorites"("user_id", "property_id");

-- CreateIndex
CREATE UNIQUE INDEX "maintenance_requests_request_code_key" ON "maintenance_requests"("request_code");

-- CreateIndex
CREATE UNIQUE INDEX "notification_preferences_user_id_key" ON "notification_preferences"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "system_settings_setting_key_key" ON "system_settings"("setting_key");

-- AddForeignKey
ALTER TABLE "user_profiles" ADD CONSTRAINT "user_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kyc_documents" ADD CONSTRAINT "kyc_documents_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kyc_documents" ADD CONSTRAINT "kyc_documents_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "properties" ADD CONSTRAINT "properties_landlord_id_fkey" FOREIGN KEY ("landlord_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "properties" ADD CONSTRAINT "properties_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_images" ADD CONSTRAINT "property_images_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties"("property_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_videos" ADD CONSTRAINT "property_videos_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties"("property_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_amenities" ADD CONSTRAINT "property_amenities_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties"("property_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_rules" ADD CONSTRAINT "property_rules_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties"("property_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("property_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_landlord_id_fkey" FOREIGN KEY ("landlord_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_cancelled_by_fkey" FOREIGN KEY ("cancelled_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_confirmed_by_fkey" FOREIGN KEY ("confirmed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("property_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_reviewer_id_fkey" FOREIGN KEY ("reviewer_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("property_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_reporter_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_report_target_id_fkey" FOREIGN KEY ("report_target_id") REFERENCES "properties"("property_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_requests" ADD CONSTRAINT "maintenance_requests_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("property_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_requests" ADD CONSTRAINT "maintenance_requests_requester_id_fkey" FOREIGN KEY ("requester_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_requests" ADD CONSTRAINT "maintenance_requests_assigned_to_fkey" FOREIGN KEY ("assigned_to") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_updates" ADD CONSTRAINT "maintenance_updates_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "maintenance_requests"("request_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_updates" ADD CONSTRAINT "maintenance_updates_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_inspections" ADD CONSTRAINT "property_inspections_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("property_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_inspections" ADD CONSTRAINT "property_inspections_inspector_id_fkey" FOREIGN KEY ("inspector_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "system_settings" ADD CONSTRAINT "system_settings_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
