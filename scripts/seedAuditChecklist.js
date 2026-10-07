import prisma from "../src/config/prisma.js";

const questions = [
    "UAN/PF STATUS",
    "ESIC",
    "LAST MONTH SALARY RECEIVED",
    "KIT RECEIVED",
    "RENEWAL KIT RECEIVED",
    "ADEQUATE LIGHTING",
    "PERIMETER",
    "ACCESS CONTROL",
    "CCTV SYSTEM",
    "FIRE FIGHTING SYSTEMS",
    "ATTENDANCE REGISTER",
    "LOCATION LOG BOOK",
    "EMPLOYEE KYC DOCUMENT",
    "OTHER DOCUMENT",
    "CLIENT - SITE SOP",
    "KNOWLEDGE OF DUTY POST",
    "KNOWLEDGE OF DOCUMENTATION",
    "KNOWLEDGE OF FIRE SAFETY AND EMERGENCY SITUATION",
    "OTHER TRAINING",
    "TRAINING TOPICS",
    "GROOMING",
    "POST ORDER",
    "FRISKING",
    "VEHICLE CHECK",
    "PARKING MANAGEMENT",
];

const seedAuditChecklist = async () => {
    try {
        console.log(
            "Starting audit checklist seed..."
        );

        let template =
            await prisma.auditTemplate.findFirst({
                where: {
                    name: "Site Audit Checklist",
                },
            });

        if (!template) {
            template =
                await prisma.auditTemplate.create({
                    data: {
                        name:
                            "Site Audit Checklist",
                        description:
                            "Supervisor site audit checklist",
                        isActive: true,
                    },
                });

            console.log(
                "Audit checklist created."
            );
        } else {
            console.log(
                "Existing audit checklist found."
            );

            if (!template.isActive) {
                template =
                    await prisma.auditTemplate.update({
                        where: {
                            id: template.id,
                        },
                        data: {
                            isActive: true,
                        },
                    });
            }
        }

        const existingQuestions =
            await prisma.auditQuestion.findMany({
                where: {
                    templateId:
                        template.id,
                },
            });

        const existingByText =
            new Map();

        for (
            const question of existingQuestions
        ) {
            existingByText.set(
                question.question
                    .trim()
                    .toLowerCase(),
                question
            );
        }

        for (
            let index = 0;
            index < questions.length;
            index++
        ) {
            const questionText =
                questions[index];

            const questionNo =
                index + 1;

            const key =
                questionText
                    .trim()
                    .toLowerCase();

            const existing =
                existingByText.get(
                    key
                );

            if (existing) {
                await prisma.auditQuestion.update({
                    where: {
                        id: existing.id,
                    },
                    data: {
                        questionNo,
                        question:
                            questionText,
                        type: "YES_NO",
                        isRequired: true,
                        isActive: true,
                    },
                });

                console.log(
                    `Updated Q${questionNo}: ${questionText}`
                );
            } else {
                await prisma.auditQuestion.create({
                    data: {
                        templateId:
                            template.id,
                        questionNo,
                        question:
                            questionText,
                        type: "YES_NO",
                        isRequired: true,
                        isActive: true,
                    },
                });

                console.log(
                    `Created Q${questionNo}: ${questionText}`
                );
            }
        }

        const currentQuestionKeys =
            new Set(
                questions.map(
                    (question) =>
                        question
                            .trim()
                            .toLowerCase()
                )
            );

        for (
            const existing
            of existingQuestions
        ) {
            const key =
                existing.question
                    .trim()
                    .toLowerCase();

            if (
                !currentQuestionKeys.has(
                    key
                )
            ) {
                await prisma.auditQuestion.update({
                    where: {
                        id: existing.id,
                    },
                    data: {
                        isActive: false,
                    },
                });

                console.log(
                    `Deactivated old question: ${existing.question}`
                );
            }
        }

        const finalQuestions =
            await prisma.auditQuestion.findMany({
                where: {
                    templateId:
                        template.id,
                    isActive: true,
                },
                orderBy: {
                    questionNo:
                        "asc",
                },
            });

        console.log("");
        console.log(
            "===================================="
        );
        console.log(
            "AUDIT CHECKLIST READY"
        );
        console.log(
            "===================================="
        );
        console.log(
            `Template: ${template.name}`
        );
        console.log(
            `Active Questions: ${finalQuestions.length}`
        );

        console.log("");

        for (
            const question
            of finalQuestions
        ) {
            console.log(
                `${question.questionNo}. ${question.question} [YES/NO]`
            );
        }

        console.log("");
        console.log(
            "Audit checklist seed completed successfully."
        );
    } catch (error) {
        console.error(
            "Audit checklist seed failed:",
            error
        );

        process.exitCode = 1;
    } finally {
        await prisma.$disconnect();
    }
};

seedAuditChecklist();