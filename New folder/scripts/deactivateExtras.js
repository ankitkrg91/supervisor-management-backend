import "dotenv/config";
import prisma from "../src/config/prisma.js";

async function deactivateExtras() {
    console.log("==================================================");
    console.log("   DEACTIVATE EXTRA 9 QUESTIONS IN LIVE DATABASE   ");
    console.log("==================================================");

    try {
        // Sirf wahi 3 questions jo aapko active rakhne hain
        const activeQuestionsToKeep = [
            "NUMBER OF EMPLOYEES",
            "GROOMING & TURNOUT",
            "LAST MONTH SALARY RECEIVED"
        ];

        // 1. In 3 ke alawa baaki sabhi questions ko database me INACTIVE (false) kar do
        const deactivated = await prisma.auditQuestion.updateMany({
            where: {
                question: {
                    notIn: activeQuestionsToKeep
                }
            },
            data: {
                isActive: false
            }
        });

        console.log(`✅ Successfully deactivated: ${deactivated.count} extra questions.`);

        // 2. Confirm karo ki ye 3 questions active hain
        const activated = await prisma.auditQuestion.updateMany({
            where: {
                question: {
                    in: activeQuestionsToKeep
                }
            },
            data: {
                isActive: true
            }
        });

        console.log(`✅ Confirmed active: ${activated.count} questions.`);
        console.log("==================================================");
        console.log("SUCCESS! Ab mobile app me sirf 3 questions aayenge.");
        console.log("==================================================");

    } catch (err) {
        console.error("❌ Error deactivating extra questions:", err);
    } finally {
        await prisma.$disconnect();
    }
}

deactivateExtras();