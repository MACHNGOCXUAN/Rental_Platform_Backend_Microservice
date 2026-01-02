/*
  Warnings:

  - You are about to drop the `otp_records` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `user_activity` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `users` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "otp_records" DROP CONSTRAINT "otp_records_userId_fkey";

-- DropForeignKey
ALTER TABLE "user_activity" DROP CONSTRAINT "user_activity_user_id_fkey";

-- DropTable
DROP TABLE "otp_records";

-- DropTable
DROP TABLE "user_activity";

-- DropTable
DROP TABLE "users";

-- DropEnum
DROP TYPE "OtpType";

-- DropEnum
DROP TYPE "UserRole";

-- DropEnum
DROP TYPE "UserStatus";

-- CreateTable
CREATE TABLE "properties" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "properties_pkey" PRIMARY KEY ("id")
);
