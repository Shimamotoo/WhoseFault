-- CreateEnum
CREATE TYPE "EvidenceType" AS ENUM ('HTTP_REQUEST', 'HTTP_RESPONSE', 'ERROR_LOG', 'MANUAL_NOTE');

-- CreateTable
CREATE TABLE "occurrences" (
    "id" UUID NOT NULL,
    "api_name" VARCHAR(255) NOT NULL,
    "url" VARCHAR(2048) NOT NULL,
    "method" VARCHAR(10) NOT NULL,
    "description" TEXT,
    "title" VARCHAR(255) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "occurrences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evidences" (
    "id" UUID NOT NULL,
    "occurrence_id" UUID NOT NULL,
    "type" "EvidenceType" NOT NULL,
    "method" VARCHAR(10),
    "url" VARCHAR(2048),
    "status_code" INTEGER,
    "headers" JSONB,
    "payload" TEXT,
    "body" TEXT,
    "content" TEXT,
    "context" VARCHAR(2000),
    "notes" VARCHAR(2000),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "evidences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "evidences_occurrence_id_idx" ON "evidences"("occurrence_id");

-- AddForeignKey
ALTER TABLE "evidences" ADD CONSTRAINT "evidences_occurrence_id_fkey" FOREIGN KEY ("occurrence_id") REFERENCES "occurrences"("id") ON DELETE CASCADE ON UPDATE CASCADE;
