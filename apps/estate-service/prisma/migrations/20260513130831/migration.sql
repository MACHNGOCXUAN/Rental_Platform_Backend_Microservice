-- CreateEnum
CREATE TYPE "ImportSessionStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'PARTIAL_FAILED', 'FAILED');

-- CreateTable
CREATE TABLE "import_sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "file_name" VARCHAR(255) NOT NULL,
    "total_rows" INTEGER NOT NULL DEFAULT 0,
    "success_rows" INTEGER NOT NULL DEFAULT 0,
    "failed_rows" INTEGER NOT NULL DEFAULT 0,
    "status" "ImportSessionStatus" NOT NULL DEFAULT 'PENDING',
    "error_file_url" VARCHAR(500),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "import_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_row_errors" (
    "id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "row_number" INTEGER NOT NULL,
    "field" VARCHAR(100) NOT NULL,
    "value" VARCHAR(500),
    "error_message" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "import_row_errors_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "import_sessions" ADD CONSTRAINT "import_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_row_errors" ADD CONSTRAINT "import_row_errors_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "import_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
