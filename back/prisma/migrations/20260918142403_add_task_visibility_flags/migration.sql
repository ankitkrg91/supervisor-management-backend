-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "showAfterMissed" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "showInAdvance" BOOLEAN NOT NULL DEFAULT true;
