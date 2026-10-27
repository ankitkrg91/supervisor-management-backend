ALTER TYPE "AuditQuestionType" ADD VALUE IF NOT EXISTS 'NUMBER';
ALTER TYPE "AuditQuestionType" ADD VALUE IF NOT EXISTS 'POPUP';

ALTER TABLE "audit_questions"
ADD COLUMN IF NOT EXISTS "section" TEXT;

ALTER TABLE "audit_questions"
ADD COLUMN IF NOT EXISTS "config" JSONB;

CREATE INDEX IF NOT EXISTS "audit_questions_section_idx"
ON "audit_questions"("section");