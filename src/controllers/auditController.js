import prisma from "../config/prisma.js";

/* =========================================================
   CREATE AUDIT TEMPLATE
   Kept for backward compatibility.
========================================================= */
const createAuditTemplate = async (req, res) => {
    try {
        const {
            name,
            description,
        } = req.body;

        if (!name || !name.trim()) {
            return res.status(400).json({
                success: false,
                message: "Template name is required",
            });
        }

        const template =
            await prisma.auditTemplate.create({
                data: {
                    name: name.trim(),
                    description:
                        description?.trim() || null,
                    isActive: true,
                },
            });

        return res.status(201).json({
            success: true,
            message:
                "Audit template created successfully",
            data: {
                template,
            },
        });
    } catch (error) {
        console.error(
            "Create audit template error:",
            error
        );

        return res.status(500).json({
            success: false,
            message:
                "Failed to create audit template",
        });
    }
};


/* =========================================================
   GET ALL AUDIT TEMPLATES
   Kept for compatibility.
========================================================= */
const getAuditTemplates = async (req, res) => {
    try {
        const templates =
            await prisma.auditTemplate.findMany({
                orderBy: {
                    createdAt: "desc",
                },
                include: {
                    _count: {
                        select: {
                            questions: true,
                        },
                    },
                },
            });

        return res.status(200).json({
            success: true,
            data: {
                templates,
            },
        });
    } catch (error) {
        console.error(
            "Get audit templates error:",
            error
        );

        return res.status(500).json({
            success: false,
            message:
                "Failed to fetch audit templates",
        });
    }
};


/* =========================================================
   UPDATE AUDIT TEMPLATE
   Kept for compatibility.
========================================================= */
const updateAuditTemplate = async (req, res) => {
    try {
        const {
            templateId,
        } = req.params;

        const {
            name,
            description,
            isActive,
        } = req.body;

        const existingTemplate =
            await prisma.auditTemplate.findUnique({
                where: {
                    id: templateId,
                },
            });

        if (!existingTemplate) {
            return res.status(404).json({
                success: false,
                message:
                    "Audit template not found",
            });
        }

        const updateData = {};

        if (name !== undefined) {
            const trimmedName =
                String(name).trim();

            if (!trimmedName) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Template name cannot be empty",
                });
            }

            updateData.name =
                trimmedName;
        }

        if (description !== undefined) {
            updateData.description =
                description
                    ? String(description).trim()
                    : null;
        }

        if (isActive !== undefined) {
            updateData.isActive =
                Boolean(isActive);
        }

        const template =
            await prisma.auditTemplate.update({
                where: {
                    id: templateId,
                },
                data: updateData,
            });

        return res.status(200).json({
            success: true,
            message:
                "Audit template updated successfully",
            data: {
                template,
            },
        });
    } catch (error) {
        console.error(
            "Update audit template error:",
            error
        );

        return res.status(500).json({
            success: false,
            message:
                "Failed to update audit template",
        });
    }
};


/* =========================================================
   ADD AUDIT QUESTION
   Kept for compatibility.
========================================================= */
const addAuditQuestion = async (req, res) => {
    try {
        const {
            templateId,
        } = req.params;

        const {
            questionNo,
            question,
            type,
            isRequired,
        } = req.body;

        if (
            questionNo === undefined ||
            questionNo === null ||
            !question ||
            !question.trim()
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "Question number and question are required",
            });
        }

        const numericQuestionNo =
            Number(questionNo);

        if (
            !Number.isInteger(
                numericQuestionNo
            ) ||
            numericQuestionNo <= 0
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "Question number must be a positive integer",
            });
        }

        const template =
            await prisma.auditTemplate.findUnique({
                where: {
                    id: templateId,
                },
            });

        if (!template) {
            return res.status(404).json({
                success: false,
                message:
                    "Audit template not found",
            });
        }

        const allowedTypes = [
            "YES_NO",
            "TEXT",
        ];

        const questionType =
            type || "YES_NO";

        if (
            !allowedTypes.includes(
                questionType
            )
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "Invalid question type",
            });
        }

        const existingQuestion =
            await prisma.auditQuestion.findFirst({
                where: {
                    templateId,
                    questionNo:
                        numericQuestionNo,
                    isActive: true,
                },
            });

        if (existingQuestion) {
            return res.status(409).json({
                success: false,
                message:
                    `Question number ${numericQuestionNo} already exists`,
            });
        }

        const auditQuestion =
            await prisma.auditQuestion.create({
                data: {
                    templateId,
                    questionNo:
                        numericQuestionNo,
                    question:
                        question.trim(),
                    type: questionType,
                    isRequired:
                        isRequired !== false,
                    isActive: true,
                },
            });

        return res.status(201).json({
            success: true,
            message:
                "Audit question added successfully",
            data: {
                question:
                    auditQuestion,
            },
        });
    } catch (error) {
        console.error(
            "Add audit question error:",
            error
        );

        return res.status(500).json({
            success: false,
            message:
                "Failed to add audit question",
        });
    }
};


/* =========================================================
   UPDATE AUDIT QUESTION
   Kept for compatibility.
========================================================= */
const updateAuditQuestion = async (
    req,
    res
) => {
    try {
        const {
            templateId,
            questionId,
        } = req.params;

        const {
            questionNo,
            question,
            type,
            isRequired,
            isActive,
        } = req.body;

        const existingQuestion =
            await prisma.auditQuestion.findFirst({
                where: {
                    id: questionId,
                    templateId,
                },
            });

        if (!existingQuestion) {
            return res.status(404).json({
                success: false,
                message:
                    "Audit question not found",
            });
        }

        const updateData = {};

        if (
            questionNo !== undefined
        ) {
            const numericQuestionNo =
                Number(questionNo);

            if (
                !Number.isInteger(
                    numericQuestionNo
                ) ||
                numericQuestionNo <= 0
            ) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Question number must be a positive integer",
                });
            }

            const duplicate =
                await prisma.auditQuestion.findFirst(
                    {
                        where: {
                            templateId,
                            questionNo:
                                numericQuestionNo,
                            isActive: true,
                            NOT: {
                                id: questionId,
                            },
                        },
                    }
                );

            if (duplicate) {
                return res.status(409).json({
                    success: false,
                    message:
                        `Question number ${numericQuestionNo} already exists`,
                });
            }

            updateData.questionNo =
                numericQuestionNo;
        }

        if (
            question !== undefined
        ) {
            if (!question.trim()) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Question cannot be empty",
                });
            }

            updateData.question =
                question.trim();
        }

        if (type !== undefined) {
            const allowedTypes = [
                "YES_NO",
                "TEXT",
            ];

            if (
                !allowedTypes.includes(
                    type
                )
            ) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Invalid question type",
                });
            }

            updateData.type = type;
        }

        if (
            isRequired !== undefined
        ) {
            updateData.isRequired =
                Boolean(isRequired);
        }

        if (
            isActive !== undefined
        ) {
            updateData.isActive =
                Boolean(isActive);
        }

        const updatedQuestion =
            await prisma.auditQuestion.update({
                where: {
                    id: questionId,
                },
                data: updateData,
            });

        return res.status(200).json({
            success: true,
            message:
                "Audit question updated successfully",
            data: {
                question:
                    updatedQuestion,
            },
        });
    } catch (error) {
        console.error(
            "Update audit question error:",
            error
        );

        return res.status(500).json({
            success: false,
            message:
                "Failed to update audit question",
        });
    }
};


/* =========================================================
   DELETE AUDIT QUESTION
   Soft delete.
========================================================= */
const deleteAuditQuestion = async (
    req,
    res
) => {
    try {
        const {
            templateId,
            questionId,
        } = req.params;

        const existingQuestion =
            await prisma.auditQuestion.findFirst({
                where: {
                    id: questionId,
                    templateId,
                },
            });

        if (!existingQuestion) {
            return res.status(404).json({
                success: false,
                message:
                    "Audit question not found",
            });
        }

        const question =
            await prisma.auditQuestion.update({
                where: {
                    id: questionId,
                },
                data: {
                    isActive: false,
                },
            });

        return res.status(200).json({
            success: true,
            message:
                "Audit question deleted successfully",
            data: {
                question,
            },
        });
    } catch (error) {
        console.error(
            "Delete audit question error:",
            error
        );

        return res.status(500).json({
            success: false,
            message:
                "Failed to delete audit question",
        });
    }
};


/* =========================================================
   GET AUDIT TEMPLATE BY ID
   Supervisor can use this.
========================================================= */
const getAuditTemplateById = async (
    req,
    res
) => {
    try {
        const {
            templateId,
        } = req.params;

        const template =
            await prisma.auditTemplate.findUnique({
                where: {
                    id: templateId,
                },
                include: {
                    questions: {
                        where: {
                            isActive: true,
                        },
                        orderBy: {
                            questionNo: "asc",
                        },
                    },
                },
            });

        if (!template) {
            return res.status(404).json({
                success: false,
                message:
                    "Audit template not found",
            });
        }

        return res.status(200).json({
            success: true,
            data: {
                template,
            },
        });
    } catch (error) {
        console.error(
            "Get audit template error:",
            error
        );

        return res.status(500).json({
            success: false,
            message:
                "Failed to fetch audit template",
        });
    }
};


/* =========================================================
   GET SINGLE AUDIT CHECKLIST
   This is the main Admin Management API.
   Only ONE checklist is used.
========================================================= */
const getAuditChecklist = async (
    req,
    res
) => {
    try {
        let checklist =
            await prisma.auditTemplate.findFirst({
                where: {
                    name: "Site Audit Checklist",
                },
                include: {
                    questions: {
                        orderBy: {
                            questionNo: "asc",
                        },
                    },
                },
            });

        /*
         * Create the single checklist automatically
         * if it doesn't exist.
         */
        if (!checklist) {
            checklist =
                await prisma.auditTemplate.create({
                    data: {
                        name:
                            "Site Audit Checklist",

                        description:
                            "Supervisor site audit checklist",

                        isActive: true,
                    },

                    include: {
                        questions: {
                            orderBy: {
                                questionNo: "asc",
                            },
                        },
                    },
                });
        }

        return res.status(200).json({
            success: true,
            data: {
                checklist,
            },
        });
    } catch (error) {
        console.error(
            "Get audit checklist error:",
            error
        );

        return res.status(500).json({
            success: false,
            message:
                "Failed to fetch audit checklist",
        });
    }
};


/* =========================================================
   CREATE CHECKLIST QUESTION
   ONLY YES / NO.
========================================================= */
const createChecklistQuestion = async (
    req,
    res
) => {
    try {
        const {
            questionNo,
            question,
            isRequired,
        } = req.body;

        if (
            questionNo === undefined ||
            questionNo === null ||
            !question ||
            !question.trim()
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "Question number and question are required",
            });
        }

        const numericQuestionNo =
            Number(questionNo);

        if (
            !Number.isInteger(
                numericQuestionNo
            ) ||
            numericQuestionNo <= 0
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "Question number must be a positive integer",
            });
        }

        /*
         * Find the single audit checklist.
         */
        let template =
            await prisma.auditTemplate.findFirst({
                where: {
                    name: "Site Audit Checklist",
                },
            });

        /*
         * Create it if it doesn't exist.
         */
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
        }

        /*
         * Prevent duplicate active question numbers.
         */
        const duplicate =
            await prisma.auditQuestion.findFirst({
                where: {
                    templateId:
                        template.id,

                    questionNo:
                        numericQuestionNo,

                    isActive: true,
                },
            });

        if (duplicate) {
            return res.status(409).json({
                success: false,
                message:
                    `Question number ${numericQuestionNo} already exists`,
            });
        }

        const auditQuestion =
            await prisma.auditQuestion.create({
                data: {
                    templateId:
                        template.id,

                    questionNo:
                        numericQuestionNo,

                    question:
                        question.trim(),

                    /*
                     * Always YES_NO.
                     */
                    type: "YES_NO",

                    isRequired:
                        isRequired !== false,

                    isActive: true,
                },
            });

        return res.status(201).json({
            success: true,
            message:
                "Audit question created successfully",
            data: {
                question:
                    auditQuestion,
            },
        });
    } catch (error) {
        console.error(
            "Create checklist question error:",
            error
        );

        return res.status(500).json({
            success: false,
            message:
                "Failed to create audit question",
        });
    }
};


/* =========================================================
   UPDATE CHECKLIST QUESTION
   ONLY YES / NO.
========================================================= */
const updateChecklistQuestion = async (
    req,
    res
) => {
    try {
        const {
            questionId,
        } = req.params;

        const {
            questionNo,
            question,
            isRequired,
            isActive,
        } = req.body;

        const existingQuestion =
            await prisma.auditQuestion.findUnique({
                where: {
                    id: questionId,
                },
            });

        if (!existingQuestion) {
            return res.status(404).json({
                success: false,
                message:
                    "Audit question not found",
            });
        }

        const updateData = {};

        /* -----------------------------------------
           QUESTION NUMBER
        ----------------------------------------- */
        if (
            questionNo !== undefined
        ) {
            const numericQuestionNo =
                Number(questionNo);

            if (
                !Number.isInteger(
                    numericQuestionNo
                ) ||
                numericQuestionNo <= 0
            ) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Question number must be a positive integer",
                });
            }

            const duplicate =
                await prisma.auditQuestion.findFirst(
                    {
                        where: {
                            templateId:
                                existingQuestion.templateId,

                            questionNo:
                                numericQuestionNo,

                            isActive: true,

                            NOT: {
                                id: questionId,
                            },
                        },
                    }
                );

            if (duplicate) {
                return res.status(409).json({
                    success: false,
                    message:
                        `Question number ${numericQuestionNo} already exists`,
                });
            }

            updateData.questionNo =
                numericQuestionNo;
        }

        /* -----------------------------------------
           QUESTION TEXT
        ----------------------------------------- */
        if (
            question !== undefined
        ) {
            if (!question.trim()) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Question cannot be empty",
                });
            }

            updateData.question =
                question.trim();
        }

        /* -----------------------------------------
           REQUIRED
        ----------------------------------------- */
        if (
            isRequired !== undefined
        ) {
            updateData.isRequired =
                Boolean(isRequired);
        }

        /* -----------------------------------------
           ACTIVE / DELETED
        ----------------------------------------- */
        if (
            isActive !== undefined
        ) {
            updateData.isActive =
                Boolean(isActive);
        }

        /*
         * Always YES / NO for this checklist.
         */
        updateData.type = "YES_NO";

        const updatedQuestion =
            await prisma.auditQuestion.update({
                where: {
                    id: questionId,
                },
                data: updateData,
            });

        return res.status(200).json({
            success: true,
            message:
                "Audit question updated successfully",
            data: {
                question:
                    updatedQuestion,
            },
        });
    } catch (error) {
        console.error(
            "Update checklist question error:",
            error
        );

        return res.status(500).json({
            success: false,
            message:
                "Failed to update audit question",
        });
    }
};


/* =========================================================
   DELETE CHECKLIST QUESTION
   Soft delete so old reports remain safe.
========================================================= */
const deleteChecklistQuestion = async (
    req,
    res
) => {
    try {
        const {
            questionId,
        } = req.params;

        const existingQuestion =
            await prisma.auditQuestion.findUnique({
                where: {
                    id: questionId,
                },
            });

        if (!existingQuestion) {
            return res.status(404).json({
                success: false,
                message:
                    "Audit question not found",
            });
        }

        const deletedQuestion =
            await prisma.auditQuestion.update({
                where: {
                    id: questionId,
                },
                data: {
                    isActive: false,
                },
            });

        return res.status(200).json({
            success: true,
            message:
                "Audit question deleted successfully",
            data: {
                question:
                    deletedQuestion,
            },
        });
    } catch (error) {
        console.error(
            "Delete checklist question error:",
            error
        );

        return res.status(500).json({
            success: false,
            message:
                "Failed to delete audit question",
        });
    }
};


/* =========================================================
   SUBMIT AUDIT
   - Required questions are compulsory
   - YES/NO questions accept only boolean values
   - Missing required questions are rejected
   - Duplicate answers are rejected
========================================================= */
const submitAudit = async (
    req,
    res
) => {
    try {
        const {
            visitId,
        } = req.params;

        const {
            templateId,
            answers,
        } = req.body;

        // =====================================================
        // BASIC VALIDATION
        // =====================================================

        if (!templateId) {
            return res.status(400).json({
                success: false,
                message:
                    "Template ID is required",
            });
        }

        if (!Array.isArray(answers)) {
            return res.status(400).json({
                success: false,
                message:
                    "Audit answers must be an array",
            });
        }

        // =====================================================
        // GET VISIT
        // =====================================================

        const visit =
            await prisma.visit.findUnique({
                where: {
                    id: visitId,
                },

                select: {
                    id: true,
                    userId: true,
                    siteId: true,
                    visitAt: true,
                    status: true,
                },
            });

        if (!visit) {
            return res.status(404).json({
                success: false,
                message:
                    "Visit not found",
            });
        }

        // =====================================================
        // SUPERVISOR SECURITY
        // =====================================================
        //
        // IMPORTANT:
        //
        // User.siteId is NOT used.
        //
        // Supervisor can work at multiple sites.
        //
        // Security is based on:
        //
        // visit.userId === logged-in Supervisor
        //
        // =====================================================

        if (
            req.user.role ===
            "SUPERVISOR"
        ) {
            if (
                visit.userId !==
                req.user.userId
            ) {
                return res.status(403).json({
                    success: false,
                    message:
                        "You do not have access to this visit",
                });
            }

            /*
             * IMPORTANT:
             * A Supervisor can work at multiple sites.
             *
             * The audit must therefore be tied to a site where
             * the logged-in Supervisor has an assigned task.
             *
             * We intentionally DO NOT use:
             *
             *      User.siteId === visit.siteId
             *
             * Task authorization is based on:
             *
             *      Task.assignedToId === Supervisor
             *      Task.siteId        === Visit.siteId
             *
             * A cancelled task cannot authorize an audit.
             */
            const assignedTask =
                await prisma.task.findFirst({
                    where: {
                        assignedToId:
                            req.user.userId,

                        siteId:
                            visit.siteId,

                        status: {
                            not: "CANCELLED",
                        },
                    },

                    select: {
                        id: true,
                        siteId: true,
                        assignedToId: true,
                    },
                });

            if (!assignedTask) {
                return res.status(403).json({
                    success: false,
                    message:
                        "This audit site is not assigned to the logged-in Supervisor through a valid task",
                });
            }
        }

        // =====================================================
        // GET ACTIVE AUDIT TEMPLATE
        // =====================================================

        const template =
            await prisma.auditTemplate.findUnique({
                where: {
                    id: templateId,
                },

                include: {
                    questions: {
                        where: {
                            isActive: true,
                        },

                        orderBy: {
                            questionNo:
                                "asc",
                        },
                    },
                },
            });

        if (!template) {
            return res.status(404).json({
                success: false,
                message:
                    "Audit template not found",
            });
        }

        // =====================================================
        // PREVENT DUPLICATE AUDIT
        // =====================================================

        const existingSubmission =
            await prisma.auditSubmission.findUnique({
                where: {
                    visitId,
                },
            });

        if (existingSubmission) {
            return res.status(409).json({
                success: false,
                message:
                    "Audit has already been submitted for this visit",
            });
        }

        // =====================================================
        // REQUIRE ANSWERS
        // =====================================================

        if (answers.length === 0) {
            return res.status(400).json({
                success: false,
                message:
                    "Please answer all required audit questions",
            });
        }

        // =====================================================
        // QUESTION MAP
        // =====================================================

        const questionMap =
            new Map(
                template.questions.map(
                    (question) => [
                        question.id,
                        question,
                    ]
                )
            );

        // =====================================================
        // CHECK DUPLICATE ANSWERS
        // =====================================================

        const answeredQuestionIds =
            new Set();

        for (
            const answer of answers
        ) {
            if (
                !answer ||
                !answer.questionId
            ) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Invalid audit answer",
                });
            }

            if (
                answeredQuestionIds.has(
                    answer.questionId
                )
            ) {
                return res.status(400).json({
                    success: false,
                    message:
                        `Duplicate answer for question ID ${answer.questionId}`,
                });
            }

            answeredQuestionIds.add(
                answer.questionId
            );
        }

        // =====================================================
        // VALIDATE REQUIRED QUESTIONS
        // =====================================================

        for (
            const question of
            template.questions
        ) {
            const answer =
                answers.find(
                    (item) =>
                        item.questionId ===
                        question.id
                );

            if (
                question.isRequired &&
                !answer
            ) {
                return res.status(400).json({
                    success: false,
                    message:
                        `Answer is required for question ${question.questionNo}: ${question.question}`,
                });
            }

            if (!answer) {
                continue;
            }

            // =================================================
            // YES / NO VALIDATION
            // =================================================

            if (
                question.type ===
                "YES_NO"
            ) {
                if (
                    typeof answer.booleanValue !==
                    "boolean"
                ) {
                    return res.status(400).json({
                        success: false,
                        message:
                            `Question ${question.questionNo} must have YES or NO answer`,
                    });
                }
            }
        }

        // =====================================================
        // CHECK QUESTION IDS
        // =====================================================

        for (
            const answer of answers
        ) {
            const question =
                questionMap.get(
                    answer.questionId
                );

            if (!question) {
                return res.status(400).json({
                    success: false,
                    message:
                        `Invalid question ID: ${answer.questionId}`,
                });
            }

            if (
                question.type ===
                "YES_NO" &&
                typeof answer.booleanValue !==
                "boolean"
            ) {
                return res.status(400).json({
                    success: false,
                    message:
                        `Question ${question.questionNo} accepts only YES or NO`,
                });
            }
        }

        // =====================================================
        // CREATE AUDIT SUBMISSION
        // =====================================================

        const submission =
            await prisma.auditSubmission.create({
                data: {
                    visitId,
                    templateId,

                    answers: {
                        create:
                            answers.map(
                                (
                                    answer
                                ) => {
                                    const question =
                                        questionMap.get(
                                            answer.questionId
                                        );

                                    return {
                                        questionId:
                                            question.id,

                                        questionNo:
                                            question.questionNo,

                                        questionText:
                                            question.question,

                                        booleanValue:
                                            answer.booleanValue !==
                                                undefined
                                                ? answer.booleanValue
                                                : null,

                                        textValue:
                                            answer.textValue !==
                                                undefined
                                                ? answer.textValue
                                                : null,
                                    };
                                }
                            ),
                    },
                },

                include: {
                    answers: {
                        orderBy: {
                            questionNo:
                                "asc",
                        },
                    },

                    template: {
                        select: {
                            id: true,
                            name: true,
                            description:
                                true,
                        },
                    },

                    visit: {
                        select: {
                            id: true,
                            visitAt: true,
                            status: true,
                            userId: true,
                            siteId: true,
                        },
                    },
                },
            });

        // =====================================================
        // SUCCESS
        // =====================================================

        return res.status(201).json({
            success: true,
            message:
                "Audit submitted successfully",

            data: {
                submission,
            },
        });

    } catch (error) {
        console.error(
            "Submit audit error:",
            error
        );

        return res.status(500).json({
            success: false,
            message:
                "Failed to submit audit",
        });
    }
};


/* =========================================================
   GET AUDIT SUBMISSION
   Used by Reports.
========================================================= */
const getAuditSubmission = async (
    req,
    res
) => {
    try {
        const {
            visitId,
        } = req.params;

        const submission =
            await prisma.auditSubmission.findUnique({
                where: {
                    visitId,
                },

                include: {
                    answers: {
                        orderBy: {
                            questionNo:
                                "asc",
                        },
                    },

                    template: {
                        select: {
                            id: true,
                            name: true,
                            description:
                                true,
                        },
                    },

                    visit: {
                        select: {
                            id: true,
                            visitAt: true,
                            status: true,
                            userId: true,
                            siteId: true,

                            user: {
                                select: {
                                    id: true,
                                    name: true,
                                    email: true,
                                    role: true,
                                },
                            },

                            site: {
                                select: {
                                    id: true,
                                    name: true,
                                    siteCode:
                                        true,
                                    city: true,
                                    state: true,
                                },
                            },
                        },
                    },
                },
            });

        // =====================================================
        // NOT FOUND
        // =====================================================

        if (!submission) {
            return res.status(404).json({
                success: false,
                message:
                    "Audit submission not found",
            });
        }

        // =====================================================
        // SUPERVISOR SECURITY
        // =====================================================
        //
        // Security is based on the visit owner.
        //
        // NOT User.siteId.
        //
        // =====================================================

        if (
            req.user.role ===
            "SUPERVISOR"
        ) {
            if (
                submission.visit.userId !==
                req.user.userId
            ) {
                return res.status(403).json({
                    success: false,
                    message:
                        "You do not have access to this audit",
                });
            }
        }

        // =====================================================
        // SUCCESS
        // =====================================================

        return res.status(200).json({
            success: true,

            data: {
                submission,
            },
        });

    } catch (error) {
        console.error(
            "Get audit submission error:",
            error
        );

        return res.status(500).json({
            success: false,
            message:
                "Failed to fetch audit submission",
        });
    }
};


/* =========================================================
   EXPORTS
========================================================= */
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