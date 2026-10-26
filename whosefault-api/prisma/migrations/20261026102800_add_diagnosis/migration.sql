-- CreateTable
CREATE TABLE "diagnoses" (
    "id" UUID NOT NULL,
    "occurrence_id" UUID NOT NULL,
    "context" JSONB NOT NULL,
    "result" JSONB NOT NULL,
    "is_outdated" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "diagnoses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "diagnoses_occurrence_id_key" ON "diagnoses"("occurrence_id");

-- AddForeignKey
ALTER TABLE "diagnoses" ADD CONSTRAINT "diagnoses_occurrence_id_fkey" FOREIGN KEY ("occurrence_id") REFERENCES "occurrences"("id") ON DELETE CASCADE ON UPDATE CASCADE;
