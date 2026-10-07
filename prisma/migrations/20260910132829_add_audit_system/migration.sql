-- CreateEnum
CREATE TYPE "AuditQuestionType" AS ENUM ('YES_NO', 'TEXT');

-- CreateTable
CREATE TABLE "audit_templates" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "audit_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_questions" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "questionNo" INTEGER NOT NULL,
    "question" TEXT NOT NULL,
    "type" "AuditQuestionType" NOT NULL DEFAULT 'YES_NO',
    "isRequired" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "audit_questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_submissions" (
    "id" TEXT NOT NULL,
    "visitId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "audit_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_answers" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "questionNo" INTEGER NOT NULL,
    "questionText" TEXT NOT NULL,
    "booleanValue" BOOLEAN,
    "textValue" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "audit_answers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "audit_templates_isActive_idx" ON "audit_templates"("isActive");

-- CreateIndex
CREATE INDEX "audit_questions_templateId_idx" ON "audit_questions"("templateId");

-- CreateIndex
CREATE INDEX "audit_questions_questionNo_idx" ON "audit_questions"("questionNo");

-- CreateIndex
CREATE UNIQUE INDEX "audit_submissions_visitId_key" ON "audit_submissions"("visitId");

-- CreateIndex
CREATE INDEX "audit_submissions_templateId_idx" ON "audit_submissions"("templateId");

-- CreateIndex
CREATE INDEX "audit_submissions_submittedAt_idx" ON "audit_submissions"("submittedAt");

-- CreateIndex
CREATE INDEX "audit_answers_submissionId_idx" ON "audit_answers"("submissionId");

-- CreateIndex
CREATE INDEX "audit_answers_questionId_idx" ON "audit_answers"("questionId");

-- CreateIndex
CREATE UNIQUE INDEX "audit_answers_submissionId_questionId_key" ON "audit_answers"("submissionId", "questionId");

-- AddForeignKey
ALTER TABLE "audit_questions" ADD CONSTRAINT "audit_questions_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "audit_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_submissions" ADD CONSTRAINT "audit_submissions_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "visits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_submissions" ADD CONSTRAINT "audit_submissions_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "audit_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_answers" ADD CONSTRAINT "audit_answers_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "audit_submissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_answers" ADD CONSTRAINT "audit_answers_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "audit_questions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
