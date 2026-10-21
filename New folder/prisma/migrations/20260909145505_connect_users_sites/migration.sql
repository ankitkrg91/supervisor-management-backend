-- AlterTable
ALTER TABLE "users" ADD COLUMN     "siteId" TEXT;

-- CreateIndex
CREATE INDEX "users_siteId_idx" ON "users"("siteId");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE SET NULL ON UPDATE CASCADE;
