import "dotenv/config";
import prisma from "./src/config/prisma.js";

async function cleanLiveData() {
    console.log("==================================================");
    console.log("   LIVE DATABASE CLEANUP - RESET ALL FILLED DATA   ");
    console.log("   (Keeping Only Super Admin Credentials & Structure)");
    console.log("==================================================");

    try {
        // Verify Super Admin exists before deleting anything
        const superAdmins = await prisma.user.findMany({
            where: { role: "SUPER_ADMIN" },
            select: { id: true, email: true, name: true, role: true }
        });

        if (superAdmins.length === 0) {
            console.error("❌ ERROR: No SUPER_ADMIN found in the database!");
            console.error("Aborting cleanup to prevent locking out of the admin panel.");
            process.exit(1);
        }

        console.log(`✅ Preserving ${superAdmins.length} Super Admin account(s):`);
        superAdmins.forEach((admin, i) => {
            console.log(`   ${i + 1}. ${admin.name} (${admin.email})`);
        });
        console.log("\nStarting data cleanup in transaction...\n");

        await prisma.$transaction(async (tx) => {
            // 1. Audit Answers
            const deletedAnswers = await tx.auditAnswer.deleteMany({});
            console.log(`🗑️  Deleted Audit Answers: ${deletedAnswers.count}`);

            // 2. Audit Submissions
            const deletedSubmissions = await tx.auditSubmission.deleteMany({});
            console.log(`🗑️  Deleted Audit Submissions: ${deletedSubmissions.count}`);

            // 3. Location Logs
            const deletedLocationLogs = await tx.locationLog.deleteMany({});
            console.log(`🗑️  Deleted Location Logs: ${deletedLocationLogs.count}`);

            // 4. Tasks
            const deletedTasks = await tx.task.deleteMany({});
            console.log(`🗑️  Deleted Tasks: ${deletedTasks.count}`);

            // 5. Campaigns
            const deletedCampaigns = await tx.campaign.deleteMany({});
            console.log(`🗑️  Deleted Campaigns: ${deletedCampaigns.count}`);

            // 6. Check Ins / Outs (Attendance)
            const deletedCheckIns = await tx.checkInOut.deleteMany({});
            console.log(`🗑️  Deleted Check Ins / Outs: ${deletedCheckIns.count}`);

            // 7. Visits
            const deletedVisits = await tx.visit.deleteMany({});
            console.log(`🗑️  Deleted Visits: ${deletedVisits.count}`);

            // 8. Unlink site from remaining Super Admins before deleting sites
            const unlinkedAdmins = await tx.user.updateMany({
                where: { role: "SUPER_ADMIN" },
                data: { siteId: null }
            });
            console.log(`🔗 Unlinked site reference from Super Admin(s): ${unlinkedAdmins.count}`);

            // 9. Delete all non-admin users (Supervisors, Field Staff, etc.)
            const deletedUsers = await tx.user.deleteMany({
                where: {
                    role: { not: "SUPER_ADMIN" }
                }
            });
            console.log(`🗑️  Deleted Users (Supervisors & Field Staff): ${deletedUsers.count}`);

            // 10. Delete Sites
            const deletedSites = await tx.site.deleteMany({});
            console.log(`🗑️  Deleted Sites: ${deletedSites.count}`);
        });

        console.log("\n==================================================");
        console.log("🎉 SUCCESS! Live data cleanup completed successfully.");
        console.log("- All filled records, supervisor accounts, and sites deleted.");
        console.log("- Super Admin login ID & Password remain active.");
        console.log("- Audit Template & Question structures remain active.");
        console.log("==================================================");

    } catch (error) {
        console.error("\n❌ Data cleanup failed:", error);
        process.exit(1);
    } finally {
        await prisma.$disconnect();
    }
}

cleanLiveData();