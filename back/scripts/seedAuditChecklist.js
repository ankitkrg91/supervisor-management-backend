import prisma from "../src/config/prisma.js";

const auditQuestions = [
    { questionNo: 1, question: "NUMBER OF EMPLOYEES", type: "TEXT" },
    { questionNo: 2, question: "ENTER GUARD DETAILS", type: "TEXT" },
    { questionNo: 3, question: "GROOMING & TURNOUT", type: "YES_NO" },
    { questionNo: 4, question: "ESS APP LOGIN STATUS", type: "YES_NO" },
    { questionNo: 5, question: "UAN/ PF STATUS", type: "TEXT" },
    { questionNo: 6, question: "ESIC", type: "TEXT" },
    { questionNo: 7, question: "LAST MONTH SALARY RECEIVED", type: "YES_NO" },
    { questionNo: 8, question: "KIT RECEIVED", type: "YES_NO" },
    { questionNo: 9, question: "RENEWAL KIT RECEIVED", type: "YES_NO" },
    { questionNo: 10, question: "SITE HOUSEKEEPING QUALITY", type: "YES_NO" },
    { questionNo: 11, question: "LOBBY AREA", type: "YES_NO" },
    { questionNo: 12, question: "MEETING ROOM", type: "YES_NO" },
    { questionNo: 13, question: "PANTRY", type: "YES_NO" },
    { questionNo: 14, question: "WASH ROOM", type: "YES_NO" },
    { questionNo: 15, question: "CABINS", type: "YES_NO" },
    { questionNo: 16, question: "WORK STATIONS", type: "YES_NO" },
    { questionNo: 17, question: "COMMON AREA", type: "YES_NO" },
    { questionNo: 18, question: "STORE ROOM", type: "YES_NO" },
    { questionNo: 19, question: "ATTENDANCE REGISTER", type: "YES_NO" },
    { questionNo: 20, question: "HK WASHROOM CHECKLIST", type: "YES_NO" },
    { questionNo: 21, question: "HK KYC DOCUMENT", type: "YES_NO" },
    { questionNo: 22, question: "OTHER", type: "TEXT" },
    { questionNo: 23, question: "KNOWLEDGE OF DUTY POST", type: "YES_NO" },
    { questionNo: 24, question: "KNOWLEDGE OF DOCUMENTATION", type: "YES_NO" },
    { questionNo: 25, question: "KNOWLEDGE OF FIRE SAFETY AND EMERGENCY SITUATION", type: "YES_NO" },
    { questionNo: 26, question: "OTHER TRAINING", type: "YES_NO" },
    { questionNo: 27, question: "TRAINING TOPICS", type: "YES_NO" },
    { questionNo: 28, question: "POST ORDER", type: "YES_NO" },
    { questionNo: 29, question: "FED", type: "YES_NO" },
    { questionNo: 30, question: "MEDICAL EMERGENCY", type: "YES_NO" },
    { questionNo: 31, question: "FIRST AID AND CPR", type: "YES_NO" },
    { questionNo: 32, question: "HANDING/TAKING OVER", type: "YES_NO" },
    { questionNo: 33, question: "POSH", type: "YES_NO" },
    { questionNo: 34, question: "OPEN SESSION", type: "YES_NO" },
    { questionNo: 35, question: "DAILY USE EQUIPMENTS / CLEANING CHEMICAL", type: "YES_NO" },
    { questionNo: 36, question: "PPE TRAINING", type: "YES_NO" },
    { questionNo: 37, question: "DEEP CLEANING", type: "YES_NO" },
    { questionNo: 38, question: "CLIENT MET", type: "YES_NO" },
    { questionNo: 39, question: "NAME", type: "TEXT" },
    { questionNo: 40, question: "DESIGNATION", type: "TEXT" },
    { questionNo: 41, question: "CLIENT'S FEEDBACK", type: "TEXT" },
    { questionNo: 42, question: "OBSERVATIONS", type: "TEXT" },
    { questionNo: 43, question: "ANY R & M WORK REQUIRED", type: "YES_NO" },
    { questionNo: 44, question: "ANY OTHER OBSERVATIONS", type: "TEXT" },
    { questionNo: 45, question: "INCIDENT RESPONSE", type: "YES_NO" },
];

const seedHdfcChecklist = async () => {
    try {
        console.log("Seeding exact 45 HDFC/MSF Audit Questions...");

        let template = await prisma.auditTemplate.findFirst({
            where: { name: "Site Audit Checklist" },
        });

        if (!template) {
            template = await prisma.auditTemplate.create({
                data: {
                    name: "Site Audit Checklist",
                    description: "HDFC MSF Site Audit Checklist (45 Questions)",
                    isActive: true,
                },
            });
        }

        // Purane mismatched questions hata kar exact 45 questions rakhna
        await prisma.auditQuestion.deleteMany({
            where: { templateId: template.id },
        });

        for (const item of auditQuestions) {
            await prisma.auditQuestion.create({
                data: {
                    templateId: template.id,
                    questionNo: item.questionNo,
                    question: item.question,
                    type: item.type === "TEXT" ? "TEXT" : "YES_NO",
                    isRequired: true,
                    isActive: true,
                },
            });
        }

        console.log("✅ Successfully seeded all 45 Audit Questions into database!");
    } catch (err) {
        console.error("Seed error:", err);
    } finally {
        await prisma.$disconnect();
    }
};

seedHdfcChecklist();