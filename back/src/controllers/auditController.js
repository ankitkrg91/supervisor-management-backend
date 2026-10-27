import prisma from "../config/prisma.js";

const createAuditTemplate = async (req, res) => {
    try {
        const { name, description } = req.body;
        if (!name || !name.trim()) {
            return res.status(400).json({ success: false, message: "Template name is required" });
        }
        const template = await prisma.auditTemplate.create({
            data: { name: name.trim(), description: description?.trim() || null, isActive: true },
        });
        return res.status(201).json({ success: true, data: { template } });
    } catch (error) {
        console.error("Create audit template error:", error);
        return res.status(500).json({ success: false, message: "Failed to create audit template" });
    }
};

const getAuditTemplates = async (req, res) => {
    try {
        const templates = await prisma.auditTemplate.findMany({
            orderBy: { createdAt: "desc" },
            include: { _count: { select: { questions: true } } },
        });
        return res.status(200).json({ success: true, data: { templates } });
    } catch (error) {
        return res.status(500).json({ success: false, message: "Failed to fetch audit templates" });
    }
};

const updateAuditTemplate = async (req, res) => {
    try {
        const { templateId } = req.params;
        const { name, description, isActive } = req.body;
        const updateData = {};
        if (name !== undefined) updateData.name = String(name).trim();
        if (description !== undefined) updateData.description = description ? String(description).trim() : null;
        if (isActive !== undefined) updateData.isActive = Boolean(isActive);
        const template = await prisma.auditTemplate.update({
            where: { id: templateId },
            data: updateData,
        });
        return res.status(200).json({ success: true, data: { template } });
    } catch (error) {
        return res.status(500).json({ success: false, message: "Failed to update audit template" });
    }
};

const addAuditQuestion = async (req, res) => {
    try {
        const { templateId } = req.params;
        const { questionNo, question, type, isRequired } = req.body;
        const numericNo = Number(questionNo);
        if (!numericNo || !question?.trim()) {
            return res.status(400).json({ success: false, message: "Question number and text are required" });
        }
        const existing = await prisma.auditQuestion.findFirst({
            where: { templateId, questionNo: numericNo, isActive: true },
        });
        if (existing) {
            const updated = await prisma.auditQuestion.update({
                where: { id: existing.id },
                data: { question: question.trim(), type: type || "YES_NO", isRequired: isRequired !== false, isActive: true },
            });
            return res.status(200).json({ success: true, data: { question: updated } });
        }
        const created = await prisma.auditQuestion.create({
            data: {
                templateId,
                questionNo: numericNo,
                question: question.trim(),
                type: type || "YES_NO",
                isRequired: isRequired !== false,
                isActive: true,
            },
        });
        return res.status(201).json({ success: true, data: { question: created } });
    } catch (error) {
        return res.status(500).json({ success: false, message: "Failed to add audit question" });
    }
};

const updateAuditQuestion = async (req, res) => {
    try {
        const { questionId } = req.params;
        const { questionNo, question, type, isRequired, isActive } = req.body;
        const updateData = {};
        if (questionNo !== undefined) updateData.questionNo = Number(questionNo);
        if (question !== undefined) updateData.question = String(question).trim();
        if (type !== undefined) updateData.type = type;
        if (isRequired !== undefined) updateData.isRequired = Boolean(isRequired);
        if (isActive !== undefined) updateData.isActive = Boolean(isActive);

        const updated = await prisma.auditQuestion.update({
            where: { id: questionId },
            data: updateData,
        });
        return res.status(200).json({ success: true, data: { question: updated } });
    } catch (error) {
        return res.status(500).json({ success: false, message: "Failed to update audit question" });
    }
};

const deleteAuditQuestion = async (req, res) => {
    try {
        const { questionId } = req.params;
        const deleted = await prisma.auditQuestion.update({
            where: { id: questionId },
            data: { isActive: false },
        });
        return res.status(200).json({ success: true, data: { question: deleted } });
    } catch (error) {
        return res.status(500).json({ success: false, message: "Failed to delete audit question" });
    }
};

const getAuditTemplateById = async (req, res) => {
    try {
        const template = await prisma.auditTemplate.findUnique({
            where: { id: req.params.templateId },
            include: { questions: { where: { isActive: true }, orderBy: { questionNo: "asc" } } },
        });
        if (!template) return res.status(404).json({ success: false, message: "Template not found" });
        return res.status(200).json({ success: true, data: { template } });
    } catch (error) {
        return res.status(500).json({ success: false, message: "Failed to fetch audit template" });
    }
};

const getAuditChecklist = async (req, res) => {
    try {
        let checklist = await prisma.auditTemplate.findFirst({
            where: { name: "Site Audit Checklist" },
            include: {
                questions: {
                    where: { isActive: true },
                    orderBy: { questionNo: "asc" },
                },
            },
        });

        if (!checklist) {
            checklist = await prisma.auditTemplate.create({
                data: { name: "Site Audit Checklist", description: "Supervisor site audit checklist", isActive: true },
                include: { questions: { where: { isActive: true }, orderBy: { questionNo: "asc" } } },
            });
        }

        // Renumber active questions sequentially (1, 2, 3...) for clean display in App & Admin
        const sequentialQuestions = (checklist.questions || []).map((q, idx) => ({
            ...q,
            originalQuestionNo: q.questionNo,
            questionNo: idx + 1,
        }));

        return res.status(200).json({
            success: true,
            data: {
                checklist: {
                    ...checklist,
                    questions: sequentialQuestions,
                },
            },
        });
    } catch (error) {
        console.error("Get audit checklist error:", error);
        return res.status(500).json({ success: false, message: "Failed to fetch audit checklist" });
    }
};

const createChecklistQuestion = async (req, res) => {
    try {
        const { questionNo, question, type, isRequired } = req.body;
        const numericNo = Number(questionNo);
        if (!numericNo || !question?.trim()) {
            return res.status(400).json({ success: false, message: "Question number and text are required" });
        }
        let template = await prisma.auditTemplate.findFirst({ where: { name: "Site Audit Checklist" } });
        if (!template) {
            template = await prisma.auditTemplate.create({
                data: { name: "Site Audit Checklist", description: "Supervisor site audit checklist", isActive: true },
            });
        }
        const existing = await prisma.auditQuestion.findFirst({
            where: { templateId: template.id, questionNo: numericNo, isActive: true },
        });
        if (existing) {
            const updated = await prisma.auditQuestion.update({
                where: { id: existing.id },
                data: { question: question.trim(), type: type || existing.type || "YES_NO", isRequired: isRequired !== false, isActive: true },
            });
            return res.status(200).json({ success: true, data: { question: updated } });
        }
        const created = await prisma.auditQuestion.create({
            data: {
                templateId: template.id,
                questionNo: numericNo,
                question: question.trim(),
                type: type || "YES_NO",
                isRequired: isRequired !== false,
                isActive: true,
            },
        });
        return res.status(201).json({ success: true, data: { question: created } });
    } catch (error) {
        return res.status(500).json({ success: false, message: "Failed to create checklist question" });
    }
};

const updateChecklistQuestion = updateAuditQuestion;
const deleteChecklistQuestion = deleteAuditQuestion;

const submitAudit = async (req, res) => {
    try {
        const { visitId } = req.params;
        const { templateId, answers } = req.body;

        if (!templateId) return res.status(400).json({ success: false, message: "Template ID is required" });
        if (!Array.isArray(answers) || answers.length === 0) {
            return res.status(400).json({ success: false, message: "Audit answers are required" });
        }

        const visit = await prisma.visit.findUnique({ where: { id: visitId } });
        if (!visit) return res.status(404).json({ success: false, message: "Visit not found" });

        const template = await prisma.auditTemplate.findUnique({
            where: { id: templateId },
            include: { questions: { where: { isActive: true }, orderBy: { questionNo: "asc" } } },
        });
        if (!template) return res.status(404).json({ success: false, message: "Audit template not found" });

        const questionMap = new Map(template.questions.map((q) => [q.id, q]));

        // If a submission already exists for this visit, remove old answers & submission so re-submit works cleanly
        const existingSubmission = await prisma.auditSubmission.findUnique({ where: { visitId } });
        if (existingSubmission) {
            await prisma.auditAnswer.deleteMany({ where: { submissionId: existingSubmission.id } });
            await prisma.auditSubmission.delete({ where: { id: existingSubmission.id } });
        }

        const validAnswers = answers.filter((a) => a && a.questionId && questionMap.has(a.questionId));

        const submission = await prisma.auditSubmission.create({
            data: {
                visitId,
                templateId,
                answers: {
                    create: validAnswers.map((answer, idx) => {
                        const question = questionMap.get(answer.questionId);
                        const isTextType = question.type === "TEXT";
                        const hasPhotos = Array.isArray(answer.photos) && answer.photos.length > 0;
                        const hasTextValue = answer.textValue !== undefined && answer.textValue !== null && String(answer.textValue).trim().length > 0;

                        return {
                            questionId: question.id,
                            questionNo: idx + 1, // Always sequential 1, 2, 3...
                            questionText: question.question,
                            booleanValue: typeof answer.booleanValue === "boolean"
                                ? answer.booleanValue
                                : (isTextType ? null : true),
                            textValue: hasTextValue
                                ? String(answer.textValue).trim()
                                : hasPhotos
                                    ? JSON.stringify(answer.photos)
                                    : null,
                        };
                    }),
                },
            },
            include: {
                answers: { orderBy: { questionNo: "asc" } },
                template: { select: { id: true, name: true, description: true } },
                visit: { select: { id: true, visitAt: true, status: true, userId: true, siteId: true } },
            },
        });

        return res.status(201).json({
            success: true,
            message: "Audit submitted successfully",
            data: { submission },
        });
    } catch (error) {
        console.error("Submit audit error:", error);
        return res.status(500).json({ success: false, message: "Failed to submit audit" });
    }
};

const getAuditSubmission = async (req, res) => {
    try {
        const { visitId } = req.params;
        const submission = await prisma.auditSubmission.findUnique({
            where: { visitId },
            include: {
                answers: { orderBy: { questionNo: "asc" } },
                template: { select: { id: true, name: true, description: true } },
                visit: {
                    select: {
                        id: true, visitAt: true, status: true, userId: true, siteId: true,
                        user: { select: { id: true, name: true, email: true, role: true } },
                        site: { select: { id: true, name: true, siteCode: true, city: true, state: true } },
                    },
                },
            },
        });

        if (!submission) return res.status(404).json({ success: false, message: "Audit submission not found" });
        return res.status(200).json({ success: true, data: { submission } });
    } catch (error) {
        console.error("Get audit submission error:", error);
        return res.status(500).json({ success: false, message: "Failed to fetch audit submission" });
    }
};

export {
    createAuditTemplate,
    getAuditTemplates,
    updateAuditTemplate,
    addAuditQuestion,
    updateAuditQuestion,
    deleteAuditQuestion,
    getAuditTemplateById,
    getAuditChecklist,
    createChecklistQuestion,
    updateChecklistQuestion,
    deleteChecklistQuestion,
    submitAudit,
    getAuditSubmission,
};