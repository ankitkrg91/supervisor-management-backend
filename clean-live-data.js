import "dotenv/config";
import prisma from "./src/config/prisma.js";

async function cleanLiveData() {
    console.log("=========================================");
    console.log("🧹 STARTING LIVE DATABASE CLEANUP...");
    console.log("=========================================");

    try {
        // 1. Delete Audit Answers
        const answers = await prisma.auditAnswer.deleteMany({});
        console.log(`✅ Deleted Audit Answers: ${answers.count}`);

        // 2. Delete Audit Submissions
        const submissions = await prisma.auditSubmission.deleteMany({});
        console.log(`✅ Deleted Audit Submissions: ${submissions.count}`);

        // 3. Delete Visits
        const visits = await prisma.visit.deleteMany({});
        console.log(`✅ Deleted Visits: ${visits.count}`);

        // 4. Delete Check-Ins / Check-Outs
        const checkIns = await prisma.checkInOut.deleteMany({});
        console.log(`✅ Deleted Check-Ins / Check-Outs: ${checkIns.count}`);

        // 5. Delete Tasks
        const tasks = await prisma.task.deleteMany({});
        console.log(`✅ Deleted Scheduled Tasks: ${tasks.count}`);

        // 6. Delete Location Logs (GPS tracking history)
        const logs = await prisma.locationLog.deleteMany({});
        console.log(`✅ Deleted GPS Location Logs: ${logs.count}`);

        console.log("=========================================");
        console.log("🛡️ PROTECTED & PRESERVED DATA:");
        const usersCount = await prisma.user.count();
        const sitesCount = await prisma.site.count();
        const templatesCount = await prisma.auditTemplate.count();

        console.log(`👤 Users (Admin & Supervisors ID/Pass): ${usersCount} (Intact)`);
        console.log(`📋 Audit Checklist Questions: (Intact)`);
        console.log(`🏢 Sites: ${sitesCount} (Intact)`);
        console.log("=========================================");
        console.log("✨ LIVE DATABASE CLEANUP COMPLETED SUCCESSFULLY!");
    } catch (error) {
        console.error("❌ Error cleaning database:", error);
    } finally {
        await prisma.$disconnect();
    }
}

cleanLiveData();