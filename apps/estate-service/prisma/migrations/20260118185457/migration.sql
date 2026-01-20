/*
  Warnings:

  - You are about to drop the column `featured_until` on the `properties` table. All the data in the column will be lost.
  - You are about to drop the column `is_featured` on the `properties` table. All the data in the column will be lost.
  - You are about to drop the column `meta_description` on the `properties` table. All the data in the column will be lost.
  - You are about to drop the column `meta_keywords` on the `properties` table. All the data in the column will be lost.
  - You are about to drop the column `meta_title` on the `properties` table. All the data in the column will be lost.
  - You are about to drop the column `postal_code` on the `properties` table. All the data in the column will be lost.
  - You are about to drop the column `priority` on the `properties` table. All the data in the column will be lost.
  - You are about to drop the column `published_at` on the `properties` table. All the data in the column will be lost.
  - You are about to drop the column `slug` on the `properties` table. All the data in the column will be lost.
  - The primary key for the `property_amenities` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `amenity_category` on the `property_amenities` table. All the data in the column will be lost.
  - You are about to drop the column `amenity_display_name` on the `property_amenities` table. All the data in the column will be lost.
  - You are about to drop the column `amenity_id` on the `property_amenities` table. All the data in the column will be lost.
  - You are about to drop the column `amenity_name` on the `property_amenities` table. All the data in the column will be lost.
  - You are about to drop the column `created_at` on the `property_amenities` table. All the data in the column will be lost.
  - You are about to drop the column `description` on the `property_amenities` table. All the data in the column will be lost.
  - You are about to drop the column `is_available` on the `property_amenities` table. All the data in the column will be lost.
  - You are about to drop the column `property_id` on the `property_amenities` table. All the data in the column will be lost.
  - You are about to drop the column `quantity` on the `property_amenities` table. All the data in the column will be lost.
  - The primary key for the `property_images` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `caption` on the `property_images` table. All the data in the column will be lost.
  - You are about to drop the column `display_order` on the `property_images` table. All the data in the column will be lost.
  - You are about to drop the column `image_id` on the `property_images` table. All the data in the column will be lost.
  - You are about to drop the column `image_type` on the `property_images` table. All the data in the column will be lost.
  - You are about to drop the column `property_id` on the `property_images` table. All the data in the column will be lost.
  - You are about to drop the column `thumbnail_url` on the `property_images` table. All the data in the column will be lost.
  - You are about to drop the column `uploaded_at` on the `property_images` table. All the data in the column will be lost.
  - The primary key for the `property_videos` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `property_id` on the `property_videos` table. All the data in the column will be lost.
  - You are about to drop the column `video_id` on the `property_videos` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[propertyId,name]` on the table `property_amenities` will be added. If there are existing duplicate values, this will fail.
  - The required column `id` was added to the `property_amenities` table with a prisma-level default value. This is not possible if the table is not empty. Please add this column as optional, then populate it before making it required.
  - Added the required column `name` to the `property_amenities` table without a default value. This is not possible if the table is not empty.
  - Added the required column `propertyId` to the `property_amenities` table without a default value. This is not possible if the table is not empty.
  - The required column `id` was added to the `property_images` table with a prisma-level default value. This is not possible if the table is not empty. Please add this column as optional, then populate it before making it required.
  - Added the required column `propertyId` to the `property_images` table without a default value. This is not possible if the table is not empty.
  - The required column `id` was added to the `property_videos` table with a prisma-level default value. This is not possible if the table is not empty. Please add this column as optional, then populate it before making it required.
  - Added the required column `propertyId` to the `property_videos` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "property_amenities" DROP CONSTRAINT "property_amenities_property_id_fkey";

-- DropForeignKey
ALTER TABLE "property_images" DROP CONSTRAINT "property_images_property_id_fkey";

-- DropForeignKey
ALTER TABLE "property_videos" DROP CONSTRAINT "property_videos_property_id_fkey";

-- DropIndex
DROP INDEX "properties_slug_key";

-- DropIndex
DROP INDEX "property_amenities_property_id_amenity_name_key";

-- AlterTable
ALTER TABLE "properties" DROP COLUMN "featured_until",
DROP COLUMN "is_featured",
DROP COLUMN "meta_description",
DROP COLUMN "meta_keywords",
DROP COLUMN "meta_title",
DROP COLUMN "postal_code",
DROP COLUMN "priority",
DROP COLUMN "published_at",
DROP COLUMN "slug";

-- AlterTable
ALTER TABLE "property_amenities" DROP CONSTRAINT "property_amenities_pkey",
DROP COLUMN "amenity_category",
DROP COLUMN "amenity_display_name",
DROP COLUMN "amenity_id",
DROP COLUMN "amenity_name",
DROP COLUMN "created_at",
DROP COLUMN "description",
DROP COLUMN "is_available",
DROP COLUMN "property_id",
DROP COLUMN "quantity",
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "id" UUID NOT NULL,
ADD COLUMN     "name" VARCHAR(255) NOT NULL,
ADD COLUMN     "propertyId" UUID NOT NULL,
ADD CONSTRAINT "property_amenities_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "property_images" DROP CONSTRAINT "property_images_pkey",
DROP COLUMN "caption",
DROP COLUMN "display_order",
DROP COLUMN "image_id",
DROP COLUMN "image_type",
DROP COLUMN "property_id",
DROP COLUMN "thumbnail_url",
DROP COLUMN "uploaded_at",
ADD COLUMN     "id" UUID NOT NULL,
ADD COLUMN     "propertyId" UUID NOT NULL,
ADD CONSTRAINT "property_images_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "property_videos" DROP CONSTRAINT "property_videos_pkey",
DROP COLUMN "property_id",
DROP COLUMN "video_id",
ADD COLUMN     "id" UUID NOT NULL,
ADD COLUMN     "propertyId" UUID NOT NULL,
ADD CONSTRAINT "property_videos_pkey" PRIMARY KEY ("id");

-- CreateIndex
CREATE UNIQUE INDEX "property_amenities_propertyId_name_key" ON "property_amenities"("propertyId", "name");

-- AddForeignKey
ALTER TABLE "property_images" ADD CONSTRAINT "property_images_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties"("property_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_videos" ADD CONSTRAINT "property_videos_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties"("property_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_amenities" ADD CONSTRAINT "property_amenities_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties"("property_id") ON DELETE CASCADE ON UPDATE CASCADE;
