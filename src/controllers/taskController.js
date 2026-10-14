import prisma from "../config/prisma.js";

/*
 * ============================================================
 * CREATE TASK
 * ============================================================
 *
 * Admin can create a task for:
 * - Any active Supervisor
 * - Any active Site
 *
 * Supervisor creating a task:
 * - Can only create for their own primary/default site
 *
 * Important:
 * User.siteId and Task.siteId are separate.
 * Task.siteId represents the site for this specific task.
 */
const createTask = async (req, res) => {
    try {
        const {
            title,
            description,
            clientEmail,
            clientPhone,
            clientMobile,
            priority,
            scheduledAt,
            assignedToId,
            siteId,
            campaignId,
            showInAdvance = true,
            showAfterMissed = true,
            wholeDay = false,
        } = req.body;

        // ----------------------------------------------------
        // NORMALIZE VALUES
        // ----------------------------------------------------
        const normalizedClientEmail =
            typeof clientEmail === "string" &&
                clientEmail.trim()
                ? clientEmail.trim()
                : null;

        const normalizedShowInAdvance =
            typeof showInAdvance === "boolean"
                ? showInAdvance
                : true;

        const normalizedShowAfterMissed =
            typeof showAfterMissed === "boolean"
                ? showAfterMissed
                : true;

        const normalizedWholeDay =
            typeof wholeDay === "boolean"
                ? wholeDay
                : false;

        // ----------------------------------------------------
        // REQUIRED FIELDS
        // ----------------------------------------------------
        if (
            !title ||
            !scheduledAt ||
            !assignedToId ||
            !siteId
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "title, scheduledAt, assignedToId and siteId are required",
            });
        }

        // ----------------------------------------------------
        // CLIENT EMAIL VALIDATION
        // ----------------------------------------------------
        if (normalizedClientEmail) {
            const emailRegex =
                /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

            if (!emailRegex.test(normalizedClientEmail)) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid client email",
                });
            }
        }

        // ----------------------------------------------------
        // PRIORITY VALIDATION
        // ----------------------------------------------------
        const validPriorities = [
            "LOW",
            "MEDIUM",
            "HIGH",
        ];

        if (
            priority &&
            !validPriorities.includes(priority)
        ) {
            return res.status(400).json({
                success: false,
                message: "Invalid task priority",
            });
        }

        // ----------------------------------------------------
        // DATE VALIDATION
        // ----------------------------------------------------
        const parsedScheduledAt =
            new Date(scheduledAt);

        if (
            !scheduledAt ||
            Number.isNaN(
                parsedScheduledAt.getTime()
            )
        ) {
            return res.status(400).json({
                success: false,
                message: "Invalid scheduled date",
            });
        }

        // ----------------------------------------------------
        // VALIDATE ASSIGNED SUPERVISOR
        // ----------------------------------------------------
        const assignedUser =
            await prisma.user.findUnique({
                where: {
                    id: assignedToId,
                },
                select: {
                    id: true,
                    role: true,
                    status: true,
                    siteId: true,
                },
            });

        if (!assignedUser) {
            return res.status(404).json({
                success: false,
                message: "Assigned user not found",
            });
        }

        if (
            assignedUser.status !== "ACTIVE"
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "Assigned user is inactive",
            });
        }

        if (
            assignedUser.role !== "SUPERVISOR"
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "Tasks can only be assigned to supervisors",
            });
        }

        // ----------------------------------------------------
        // VALIDATE TASK SITE
        // ----------------------------------------------------
        const site =
            await prisma.site.findUnique({
                where: {
                    id: siteId,
                },
                select: {
                    id: true,
                    status: true,
                },
            });

        if (!site) {
            return res.status(404).json({
                success: false,
                message: "Site not found",
            });
        }

        if (
            site.status !== "ACTIVE"
        ) {
            return res.status(400).json({
                success: false,
                message: "Site is inactive",
            });
        }

        // ----------------------------------------------------
        // SUPERVISOR CREATOR SECURITY
        // ----------------------------------------------------
        if (
            req.user.role === "SUPERVISOR"
        ) {
            const supervisor =
                await prisma.user.findUnique({
                    where: {
                        id: req.user.userId,
                    },
                    select: {
                        siteId: true,
                    },
                });

            if (
                !supervisor?.siteId
            ) {
                return res.status(403).json({
                    success: false,
                    message:
                        "Supervisor is not assigned to a site",
                });
            }

            if (
                siteId !== supervisor.siteId
            ) {
                return res.status(403).json({
                    success: false,
                    message:
                        "You can only create tasks for your assigned site",
                });
            }
        }

        // ----------------------------------------------------
        // VALIDATE CAMPAIGN
        // ----------------------------------------------------
        if (campaignId) {
            const campaign =
                await prisma.campaign.findUnique({
                    where: {
                        id: campaignId,
                    },
                    select: {
                        id: true,
                        status: true,
                    },
                });

            if (!campaign) {
                return res.status(404).json({
                    success: false,
                    message: "Campaign not found",
                });
            }

            if (
                campaign.status !== "ACTIVE"
            ) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Campaign is not active",
                });
            }
        }

        // ----------------------------------------------------
        // APPEND CLIENT MOBILE TO DESCRIPTION IF PROVIDED
        // ----------------------------------------------------
        let finalDescription = description || "";
        const mobileToSave = clientPhone || clientMobile;
        if (mobileToSave && typeof mobileToSave === "string" && mobileToSave.trim()) {
            if (!finalDescription.includes("Client Mobile:")) {
                finalDescription = finalDescription
                    ? `${finalDescription} | Client Mobile: ${mobileToSave.trim()}`
                    : `Client Mobile: ${mobileToSave.trim()}`;
            }
        }

        // ----------------------------------------------------
        // CREATE TASK
        // ----------------------------------------------------
        const task = await prisma.task.create({
            data: {
                title,

                description:
                    finalDescription || null,

                clientEmail:
                    normalizedClientEmail,

                priority:
                    priority || "MEDIUM",

                scheduledAt:
                    parsedScheduledAt,

                showInAdvance:
                    normalizedShowInAdvance,

                showAfterMissed:
                    normalizedShowAfterMissed,

                wholeDay:
                    normalizedWholeDay,

                assignedToId,

                assignedById:
                    req.user.userId,

                siteId,

                campaignId:
                    campaignId || null,
            },

            include: {
                assignedTo: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                        phone: true,
                        role: true,
                        status: true,
                    },
                },

                assignedBy: {
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
                        siteCode: true,
                        city: true,
                        state: true,
                    },
                },

                campaign: {
                    select: {
                        id: true,
                        name: true,
                        status: true,
                    },
                },
            },
        });

        return res.status(201).json({
            success: true,
            message:
                "Task created successfully",
            data: {
                task,
            },
        });
    } catch (error) {
        console.error(
            "Create task error:",
            error
        );

        return res.status(500).json({
            success: false,
            message:
                "Failed to create task",
            error: error.message,
        });
    }
};


/*
 * ============================================================
 * GET TASKS
 * ============================================================
 */
const getTasks = async (req, res) => {
    try {
        const {
            status,
            priority,
            assignedToId,
            siteId,
            campaignId,
            search,
            page = 1,
            limit = 20,
        } = req.query;

        // ----------------------------------------------------
        // PAGINATION
        // ----------------------------------------------------
        const pageNumber =
            Math.max(
                Number(page) || 1,
                1
            );

        const limitNumber =
            Math.min(
                Math.max(
                    Number(limit) || 20,
                    1
                ),
                100
            );

        // ----------------------------------------------------
        // BASE FILTER
        // ----------------------------------------------------
        const where = {};

        where.assignedTo = {
            role: "SUPERVISOR",
        };

        // ----------------------------------------------------
        // SUPERVISOR SECURITY
        // ----------------------------------------------------
        if (
            req.user.role === "SUPERVISOR"
        ) {
            where.assignedToId =
                req.user.userId;

            const now = new Date();

            where.AND = [
                {
                    OR: [
                        {
                            scheduledAt: {
                                gt: now,
                            },
                            wholeDay: false,
                            showInAdvance: true,
                        },

                        {
                            scheduledAt: {
                                gt: now,
                            },
                            wholeDay: true,
                            showInAdvance: true,
                        },

                        {
                            scheduledAt: {
                                lte: now,
                            },
                            wholeDay: false,
                            showAfterMissed: true,
                        },

                        {
                            scheduledAt: {
                                lte: now,
                            },
                            wholeDay: true,
                            showAfterMissed: true,
                        },
                    ],
                },
            ];
        }

        // ----------------------------------------------------
        // SITE FILTER
        // ----------------------------------------------------
        else if (siteId) {
            where.siteId = siteId;
        }

        // ----------------------------------------------------
        // STATUS
        // ----------------------------------------------------
        if (status) {
            where.status = status;
        }

        // ----------------------------------------------------
        // PRIORITY
        // ----------------------------------------------------
        if (priority) {
            where.priority = priority;
        }

        // ----------------------------------------------------
        // ASSIGNED SUPERVISOR FILTER
        // ----------------------------------------------------
        if (
            assignedToId &&
            req.user.role !== "SUPERVISOR"
        ) {
            where.assignedToId =
                assignedToId;
        }

        // ----------------------------------------------------
        // CAMPAIGN FILTER
        // ----------------------------------------------------
        if (campaignId) {
            where.campaignId =
                campaignId;
        }

        // ----------------------------------------------------
        // SEARCH
        // ----------------------------------------------------
        if (
            search?.trim()
        ) {
            const searchQuery =
                search.trim();

            where.AND = [
                ...(where.AND || []),
                {
                    OR: [
                        {
                            title: {
                                contains:
                                    searchQuery,
                                mode:
                                    "insensitive",
                            },
                        },

                        {
                            description: {
                                contains:
                                    searchQuery,
                                mode:
                                    "insensitive",
                            },
                        },

                        {
                            clientEmail: {
                                contains:
                                    searchQuery,
                                mode:
                                    "insensitive",
                            },
                        },
                    ],
                },
            ];
        }

        // ----------------------------------------------------
        // PAGINATION OFFSET
        // ----------------------------------------------------
        const skip =
            (pageNumber - 1) *
            limitNumber;

        // ----------------------------------------------------
        // FETCH TASKS
        // ----------------------------------------------------
        const [
            tasks,
            total,
        ] = await Promise.all([
            prisma.task.findMany({
                where,

                include: {
                    assignedTo: {
                        select: {
                            id: true,
                            name: true,
                            email: true,
                            phone: true,
                            role: true,
                            status: true,
                        },
                    },

                    assignedBy: {
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
                            siteCode: true,
                            city: true,
                            state: true,
                        },
                    },

                    campaign: {
                        select: {
                            id: true,
                            name: true,
                            status: true,
                        },
                    },
                },

                orderBy: {
                    scheduledAt:
                        "desc",
                },

                skip,

                take: limitNumber,
            }),

            prisma.task.count({
                where,
            }),
        ]);

        const enrichedTasks = tasks.map((t) => {
            const m = t.description && t.description.match(/Client Mobile:\s*([^\s|]+)/i);
            const phone = m ? m[1].trim() : null;
            return {
                ...t,
                clientMobile: phone,
                clientPhone: phone,
            };
        });

        return res.status(200).json({
            success: true,

            data: {
                tasks: enrichedTasks,

                pagination: {
                    page:
                        pageNumber,

                    limit:
                        limitNumber,

                    total,

                    totalPages:
                        Math.ceil(
                            total /
                            limitNumber
                        ),
                },
            },
        });
    } catch (error) {
        console.error(
            "Get tasks error:",
            error
        );

        return res.status(500).json({
            success: false,
            message:
                "Failed to get tasks",
            error:
                error.message,
        });
    }
};


/*
 * ============================================================
 * GET TASK BY ID
 * ============================================================
 */
const getTaskById = async (
    req,
    res
) => {
    try {
        console.log(
            "🔥 GET TASK BY ID CONTROLLER IS RUNNING"
        );

        const { id } =
            req.params;

        const task =
            await prisma.task.findUnique({
                where: {
                    id,
                },

                include: {
                    assignedTo: {
                        select: {
                            id: true,
                            name: true,
                            email: true,
                            phone: true,
                            role: true,
                            status: true,
                        },
                    },

                    assignedBy: {
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
                            siteCode: true,
                            address: true,
                            city: true,
                            state: true,
                            pincode: true,
                            latitude: true,
                            longitude: true,
                        },
                    },

                    campaign: {
                        select: {
                            id: true,
                            name: true,
                            description: true,
                            startDate: true,
                            endDate: true,
                            status: true,
                        },
                    },
                },
            });

        if (!task) {
            return res.status(404).json({
                success: false,
                message:
                    "Task not found",
            });
        }

        // ----------------------------------------------------
        // SUPERVISOR SECURITY
        // ----------------------------------------------------
        if (
            req.user.role === "SUPERVISOR"
        ) {
            if (
                task.assignedToId !==
                req.user.userId
            ) {
                return res.status(403).json({
                    success: false,
                    message:
                        "You do not have access to this task",
                });
            }
        }

        // ----------------------------------------------------
        // SUPER ADMIN ROLE PROTECTION
        // ----------------------------------------------------
        if (
            task.assignedTo?.role !==
            "SUPERVISOR" &&
            req.user.role ===
            "SUPER_ADMIN"
        ) {
            return res.status(404).json({
                success: false,
                message:
                    "Task not found",
            });
        }

        const m = task.description && task.description.match(/Client Mobile:\s*([^\s|]+)/i);
        const phone = m ? m[1].trim() : null;
        const enrichedTask = {
            ...task,
            clientMobile: phone,
            clientPhone: phone,
        };

        return res.status(200).json({
            success: true,

            data: {
                task: enrichedTask,
            },
        });
    } catch (error) {
        console.error(
            "Get task by ID error:",
            error
        );

        return res.status(500).json({
            success: false,
            message:
                "Failed to get task",
            error:
                error.message,
        });
    }
};


/*
 * ============================================================
 * UPDATE TASK STATUS
 * ============================================================
 */
const updateTaskStatus = async (
    req,
    res
) => {
    try {
        const { id } =
            req.params;

        const { status } =
            req.body;

        const allowedStatuses = [
            "SCHEDULED",
            "IN_PROGRESS",
            "COMPLETED",
            "CANCELLED",
        ];

        if (
            !allowedStatuses.includes(
                status
            )
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "Invalid task status",
            });
        }

        const task =
            await prisma.task.findUnique({
                where: {
                    id,
                },

                include: {
                    assignedTo: {
                        select: {
                            id: true,
                            name: true,
                            role: true,
                            status: true,
                        },
                    },

                    site: {
                        select: {
                            id: true,
                            name: true,
                            siteCode: true,
                        },
                    },
                },
            });

        if (!task) {
            return res.status(404).json({
                success: false,
                message:
                    "Task not found",
            });
        }

        if (
            task.assignedTo?.role !==
            "SUPERVISOR"
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "Only Supervisor tasks can be updated",
            });
        }

        if (
            req.user.role ===
            "SUPERVISOR"
        ) {
            if (
                task.assignedToId !==
                req.user.userId
            ) {
                return res.status(403).json({
                    success: false,
                    message:
                        "You do not have access to this task",
                });
            }
        }

        const allowedTransitions = {
            SCHEDULED: [
                "IN_PROGRESS",
                "CANCELLED",
            ],

            IN_PROGRESS: [
                "COMPLETED",
                "CANCELLED",
            ],

            COMPLETED: [],

            CANCELLED: [],
        };

        if (
            !allowedTransitions[
                task.status
            ]?.includes(
                status
            )
        ) {
            return res.status(400).json({
                success: false,
                message:
                    `Cannot change task status from ${task.status} to ${status}`,
            });
        }

        const updatedTask =
            await prisma.task.update({
                where: {
                    id,
                },

                data: {
                    status,

                    completedAt:
                        status ===
                            "COMPLETED"
                            ? new Date()
                            : null,
                },

                include: {
                    assignedTo: {
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
                            siteCode: true,
                        },
                    },

                    campaign: {
                        select: {
                            id: true,
                            name: true,
                            status: true,
                        },
                    },
                },
            });

        return res.status(200).json({
            success: true,

            message:
                "Task status updated successfully",

            data: {
                task:
                    updatedTask,
            },
        });
    } catch (error) {
        console.error(
            "Update task status error:",
            error
        );

        return res.status(500).json({
            success: false,

            message:
                "Failed to update task status",
        });
    }
};


/*
 * ============================================================
 * REASSIGN TASK
 * ============================================================
 */
const reassignTask = async (
    req,
    res
) => {
    try {
        const { id } =
            req.params;

        const {
            assignedToId,
        } = req.body;

        if (!assignedToId) {
            return res.status(400).json({
                success: false,
                message:
                    "Assigned user ID is required",
            });
        }

        const task =
            await prisma.task.findUnique({
                where: {
                    id,
                },

                include: {
                    assignedTo: {
                        select: {
                            id: true,
                            name: true,
                            email: true,
                            role: true,
                            status: true,
                            siteId: true,
                        },
                    },

                    site: {
                        select: {
                            id: true,
                            name: true,
                            siteCode: true,
                        },
                    },
                },
            });

        if (!task) {
            return res.status(404).json({
                success: false,
                message:
                    "Task not found",
            });
        }

        if (
            req.user.role ===
            "SUPERVISOR"
        ) {
            if (
                task.assignedToId !==
                req.user.userId
            ) {
                return res.status(403).json({
                    success: false,
                    message:
                        "You do not have access to this task",
                });
            }
        }

        if (
            task.status ===
            "COMPLETED" ||
            task.status ===
            "CANCELLED"
        ) {
            return res.status(400).json({
                success: false,
                message:
                    `Cannot reassign a ${task.status.toLowerCase()} task`,
            });
        }

        const assignedUser =
            await prisma.user.findUnique({
                where: {
                    id: assignedToId,
                },

                select: {
                    id: true,
                    name: true,
                    email: true,
                    role: true,
                    status: true,
                    siteId: true,
                },
            });

        if (!assignedUser) {
            return res.status(404).json({
                success: false,
                message:
                    "Assigned user not found",
            });
        }

        if (
            assignedUser.status !==
            "ACTIVE"
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "Assigned user is inactive",
            });
        }

        if (
            assignedUser.role !==
            "SUPERVISOR"
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "Tasks can only be assigned to supervisors",
            });
        }

        const updatedTask =
            await prisma.task.update({
                where: {
                    id,
                },

                data: {
                    assignedToId:
                        assignedToId,
                },

                include: {
                    assignedTo: {
                        select: {
                            id: true,
                            name: true,
                            email: true,
                            role: true,
                        },
                    },

                    assignedBy: {
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
                            siteCode: true,
                        },
                    },
                },
            });

        return res.status(200).json({
            success: true,

            message:
                "Task reassigned successfully",

            data: {
                task:
                    updatedTask,
            },
        });
    } catch (error) {
        console.error(
            "Reassign task error:",
            error
        );

        return res.status(500).json({
            success: false,
            message:
                "Failed to reassign task",
        });
    }
};


/*
 * ============================================================
 * REASSIGN BULK TASKS
 * ============================================================
 *
 * Excel fields:
 * - title
 * - scheduledAt
 * - supervisorEmail
 * - siteCode
 * - clientEmail (optional)
 *
 * Target supervisor UUID comes from assignedToId
 * selected in the frontend dropdown.
 */
const reassignBulkTasks = async (
    req,
    res
) => {
    try {
        const {
            tasks,
            assignedToId,
        } = req.body;

        // ----------------------------------------------------
        // BASIC VALIDATION
        // ----------------------------------------------------
        if (
            !Array.isArray(tasks) ||
            tasks.length === 0
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "tasks must be a non-empty array",
            });
        }

        if (!assignedToId) {
            return res.status(400).json({
                success: false,
                message:
                    "Target supervisor is required",
            });
        }

        if (tasks.length > 500) {
            return res.status(400).json({
                success: false,
                message:
                    "Maximum 500 tasks can be reassigned at once",
            });
        }

        // ----------------------------------------------------
        // VALIDATE TARGET SUPERVISOR
        // ----------------------------------------------------
        const targetSupervisor =
            await prisma.user.findUnique({
                where: {
                    id: assignedToId,
                },

                select: {
                    id: true,
                    name: true,
                    email: true,
                    role: true,
                    status: true,
                    siteId: true,
                },
            });

        if (!targetSupervisor) {
            return res.status(404).json({
                success: false,
                message:
                    "Target supervisor not found",
            });
        }

        if (
            targetSupervisor.role !==
            "SUPERVISOR"
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "Target user must be a Supervisor",
            });
        }

        if (
            targetSupervisor.status !==
            "ACTIVE"
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "Target supervisor is inactive",
            });
        }

        const successfulTasks = [];
        const failedTasks = [];

        // ----------------------------------------------------
        // PROCESS EACH EXCEL ROW
        // ----------------------------------------------------
        for (
            let index = 0;
            index < tasks.length;
            index++
        ) {
            const item =
                tasks[index];

            const title =
                typeof item?.title ===
                    "string"
                    ? item.title.trim()
                    : "";

            const supervisorEmail =
                typeof item?.supervisorEmail ===
                    "string"
                    ? item.supervisorEmail
                        .trim()
                        .toLowerCase()
                    : "";

            const siteCode =
                typeof item?.siteCode ===
                    "string"
                    ? item.siteCode.trim()
                    : "";

            const clientEmail =
                typeof item?.clientEmail ===
                    "string"
                    ? item.clientEmail
                        .trim()
                        .toLowerCase()
                    : "";

            const scheduledAt =
                item?.scheduledAt;

            const excelRow =
                Number(item?.row) ||
                index + 2;

            try {
                // --------------------------------------------
                // REQUIRED FIELDS
                // --------------------------------------------
                if (
                    !title ||
                    !scheduledAt ||
                    !supervisorEmail ||
                    !siteCode
                ) {
                    throw new Error(
                        "title, scheduledAt, supervisorEmail and siteCode are required"
                    );
                }

                // --------------------------------------------
                // DATE
                // --------------------------------------------
                const parsedScheduledAt =
                    new Date(
                        scheduledAt
                    );

                if (
                    Number.isNaN(
                        parsedScheduledAt.getTime()
                    )
                ) {
                    throw new Error(
                        "Invalid scheduled date"
                    );
                }

                // --------------------------------------------
                // FIND CURRENT SUPERVISOR
                // --------------------------------------------
                const currentSupervisor =
                    await prisma.user.findFirst({
                        where: {
                            email: {
                                equals:
                                    supervisorEmail,
                                mode:
                                    "insensitive",
                            },

                            role:
                                "SUPERVISOR",

                            status:
                                "ACTIVE",
                        },

                        select: {
                            id: true,
                            name: true,
                            email: true,
                            role: true,
                            status: true,
                        },
                    });

                if (!currentSupervisor) {
                    throw new Error(
                        `Active Supervisor not found for email: ${supervisorEmail}`
                    );
                }

                // --------------------------------------------
                // FIND TASK SITE
                // --------------------------------------------
                const site =
                    await prisma.site.findFirst({
                        where: {
                            status:
                                "ACTIVE",

                            siteCode: {
                                equals:
                                    siteCode,
                                mode:
                                    "insensitive",
                            },
                        },

                        select: {
                            id: true,
                            name: true,
                            siteCode: true,
                            status: true,
                        },
                    });

                if (!site) {
                    throw new Error(
                        `Active site not found for Site Code: ${siteCode}`
                    );
                }

                // --------------------------------------------
                // TARGET SUPERVISOR MUST BELONG
                // TO THE TASK SITE
                // --------------------------------------------
                if (
                    targetSupervisor.siteId &&
                    targetSupervisor.siteId !==
                    site.id
                ) {
                    throw new Error(
                        `Target supervisor is not assigned to site ${site.siteCode}`
                    );
                }

                // --------------------------------------------
                // FIND EXACT TASK
                // --------------------------------------------
                const taskWhere = {
                    title: {
                        equals:
                            title,
                        mode:
                            "insensitive",
                    },

                    scheduledAt:
                        parsedScheduledAt,

                    assignedToId:
                        currentSupervisor.id,

                    siteId:
                        site.id,
                };

                // --------------------------------------------
                // OPTIONAL CLIENT EMAIL
                // --------------------------------------------
                if (clientEmail) {
                    taskWhere.clientEmail =
                        clientEmail;
                }

                const matchingTasks =
                    await prisma.task.findMany({
                        where:
                            taskWhere,

                        include: {
                            assignedTo: {
                                select: {
                                    id: true,
                                    name: true,
                                    email: true,
                                    role: true,
                                    status: true,
                                },
                            },

                            assignedBy: {
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
                                    siteCode: true,
                                },
                            },

                            campaign: {
                                select: {
                                    id: true,
                                    name: true,
                                    status: true,
                                },
                            },
                        },
                    });

                // --------------------------------------------
                // TASK NOT FOUND
                // --------------------------------------------
                if (
                    matchingTasks.length ===
                    0
                ) {
                    throw new Error(
                        "Task not found for the provided title, scheduledAt, supervisorEmail and siteCode"
                    );
                }

                // --------------------------------------------
                // DUPLICATE TASK PROTECTION
                // --------------------------------------------
                if (
                    matchingTasks.length >
                    1
                ) {
                    throw new Error(
                        "Multiple matching tasks found. Add clientEmail to identify the correct task."
                    );
                }

                const task =
                    matchingTasks[0];

                // --------------------------------------------
                // SECURITY
                // --------------------------------------------
                if (
                    task.assignedTo?.role !==
                    "SUPERVISOR"
                ) {
                    throw new Error(
                        "Only Supervisor tasks can be reassigned"
                    );
                }

                // --------------------------------------------
                // COMPLETED TASK
                // --------------------------------------------
                if (
                    task.status ===
                    "COMPLETED"
                ) {
                    throw new Error(
                        "Cannot reassign a completed task"
                    );
                }

                // --------------------------------------------
                // CANCELLED TASK
                // --------------------------------------------
                if (
                    task.status ===
                    "CANCELLED"
                ) {
                    throw new Error(
                        "Cannot reassign a cancelled task"
                    );
                }

                // --------------------------------------------
                // ALREADY ASSIGNED
                // --------------------------------------------
                if (
                    task.assignedToId ===
                    assignedToId
                ) {
                    throw new Error(
                        "Task is already assigned to this supervisor"
                    );
                }

                // --------------------------------------------
                // REASSIGN TASK
                // --------------------------------------------
                const updatedTask =
                    await prisma.task.update({
                        where: {
                            id:
                                task.id,
                        },

                        data: {
                            assignedToId:
                                assignedToId,
                        },

                        include: {
                            assignedTo: {
                                select: {
                                    id: true,
                                    name: true,
                                    email: true,
                                    phone: true,
                                    role: true,
                                    status: true,
                                },
                            },

                            assignedBy: {
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
                                    siteCode: true,
                                    city: true,
                                    state: true,
                                },
                            },

                            campaign: {
                                select: {
                                    id: true,
                                    name: true,
                                    status: true,
                                },
                            },
                        },
                    });

                successfulTasks.push(
                    updatedTask
                );
            } catch (error) {
                failedTasks.push({
                    row:
                        excelRow,

                    title:
                        title ||
                        null,

                    error:
                        error.message,
                });
            }
        }

        // ----------------------------------------------------
        // RESPONSE
        // ----------------------------------------------------
        return res.status(201).json({
            success: true,

            message:
                "Bulk task reassignment completed",

            data: {
                total:
                    tasks.length,

                successful:
                    successfulTasks.length,

                failed:
                    failedTasks.length,

                successfulTasks,

                failedTasks,
            },
        });
    } catch (error) {
        console.error(
            "Reassign bulk tasks error:",
            error
        );

        return res.status(500).json({
            success: false,

            message:
                "Failed to reassign bulk tasks",

            error:
                error.message,
        });
    }
};


/*
 * ============================================================
 * CANCEL TASK
 * ============================================================
 */
const cancelTask = async (
    req,
    res
) => {
    try {
        const { id } =
            req.params;

        const task =
            await prisma.task.findUnique({
                where: {
                    id,
                },

                include: {
                    assignedTo: {
                        select: {
                            id: true,
                            name: true,
                            email: true,
                            role: true,
                            status: true,
                        },
                    },

                    assignedBy: {
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
                            siteCode: true,
                        },
                    },

                    campaign: {
                        select: {
                            id: true,
                            name: true,
                            status: true,
                        },
                    },
                },
            });

        if (!task) {
            return res.status(404).json({
                success: false,
                message:
                    "Task not found",
            });
        }

        if (
            task.assignedTo?.role !==
            "SUPERVISOR"
        ) {
            return res.status(404).json({
                success: false,
                message:
                    "Task not found",
            });
        }

        if (
            req.user.role ===
            "SUPERVISOR"
        ) {
            if (
                task.assignedToId !==
                req.user.userId
            ) {
                return res.status(403).json({
                    success: false,
                    message:
                        "You do not have access to this task",
                });
            }
        }

        if (
            task.status ===
            "COMPLETED"
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "Cannot cancel a completed task",
            });
        }

        if (
            task.status ===
            "CANCELLED"
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "Task is already cancelled",
            });
        }

        const updatedTask =
            await prisma.task.update({
                where: {
                    id,
                },

                data: {
                    status:
                        "CANCELLED",
                },

                include: {
                    assignedTo: {
                        select: {
                            id: true,
                            name: true,
                            email: true,
                            role: true,
                        },
                    },

                    assignedBy: {
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
                            siteCode: true,
                        },
                    },

                    campaign: {
                        select: {
                            id: true,
                            name: true,
                            status: true,
                        },
                    },
                },
            });

        return res.status(200).json({
            success: true,

            message:
                "Task cancelled successfully",

            data: {
                task:
                    updatedTask,
            },
        });
    } catch (error) {
        console.error(
            "Cancel task error:",
            error
        );

        return res.status(500).json({
            success: false,
            message:
                "Failed to cancel task",
        });
    }
};


/*
 * ============================================================
 * CREATE BULK TASKS
 * ============================================================
 *
 * Excel should use:
 *
 * REQUIRED:
 * - title
 * - scheduledAt
 * - supervisorEmail
 * - siteName OR siteCode
 *
 * OPTIONAL:
 * - description
 * - clientEmail
 * - priority
 *
 * UUIDs are resolved internally by the backend.
 *
 * campaignId is intentionally NOT supported here.
 */
const createBulkTasks = async (
    req,
    res
) => {
    try {
        const {
            tasks,
        } = req.body;

        // ----------------------------------------------------
        // BASIC VALIDATION
        // ----------------------------------------------------
        if (
            !Array.isArray(tasks) ||
            tasks.length === 0
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "tasks must be a non-empty array",
            });
        }

        if (tasks.length > 500) {
            return res.status(400).json({
                success: false,
                message:
                    "Maximum 500 tasks can be created at once",
            });
        }

        // ----------------------------------------------------
        // SUPERVISOR CREATOR SITE
        // ----------------------------------------------------
        let supervisorSiteId = null;

        if (
            req.user.role ===
            "SUPERVISOR"
        ) {
            const supervisor =
                await prisma.user.findUnique({
                    where: {
                        id:
                            req.user.userId,
                    },

                    select: {
                        siteId: true,
                    },
                });

            if (
                !supervisor?.siteId
            ) {
                return res.status(403).json({
                    success: false,
                    message:
                        "Supervisor is not assigned to a site",
                });
            }

            supervisorSiteId =
                supervisor.siteId;
        }

        // ----------------------------------------------------
        // RESULT ARRAYS
        // ----------------------------------------------------
        const successfulTasks = [];
        const failedTasks = [];

        // ----------------------------------------------------
        // PROCESS EACH TASK
        // ----------------------------------------------------
        for (
            let index = 0;
            index < tasks.length;
            index++
        ) {
            const taskData =
                tasks[index];

            const {
                title,
                description,
                clientEmail,
                priority,
                scheduledAt,
                assignedToId,
                siteId,
                supervisorEmail,
                siteCode,
                siteName,
                showInAdvance = true,
                showAfterMissed = true,
                wholeDay = false,
            } = taskData;

            try {
                // --------------------------------------------
                // REQUIRED BASIC FIELDS
                // --------------------------------------------
                if (
                    !title ||
                    !scheduledAt
                ) {
                    throw new Error(
                        "title and scheduledAt are required"
                    );
                }

                // --------------------------------------------
                // CLIENT EMAIL
                // --------------------------------------------
                const normalizedClientEmail =
                    typeof clientEmail ===
                        "string" &&
                        clientEmail.trim()
                        ? clientEmail.trim()
                        : null;

                if (
                    normalizedClientEmail
                ) {
                    const emailRegex =
                        /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

                    if (
                        !emailRegex.test(
                            normalizedClientEmail
                        )
                    ) {
                        throw new Error(
                            "Invalid client email"
                        );
                    }
                }

                // --------------------------------------------
                // PRIORITY
                // --------------------------------------------
                const normalizedPriority =
                    typeof priority ===
                        "string" &&
                        priority.trim()
                        ? priority
                            .trim()
                            .toUpperCase()
                        : "MEDIUM";

                const validPriorities = [
                    "LOW",
                    "MEDIUM",
                    "HIGH",
                ];

                if (
                    !validPriorities.includes(
                        normalizedPriority
                    )
                ) {
                    throw new Error(
                        "Invalid task priority"
                    );
                }

                // --------------------------------------------
                // DATE
                // --------------------------------------------
                const parsedScheduledAt =
                    new Date(
                        scheduledAt
                    );

                if (
                    Number.isNaN(
                        parsedScheduledAt.getTime()
                    )
                ) {
                    throw new Error(
                        "Invalid scheduled date"
                    );
                }

                // --------------------------------------------
                // RESOLVE SUPERVISOR UUID
                // --------------------------------------------
                let resolvedAssignedToId =
                    typeof assignedToId ===
                        "string" &&
                        assignedToId.trim()
                        ? assignedToId.trim()
                        : null;

                if (
                    !resolvedAssignedToId
                ) {
                    const normalizedSupervisorEmail =
                        typeof supervisorEmail ===
                            "string"
                            ? supervisorEmail
                                .trim()
                                .toLowerCase()
                            : "";

                    if (
                        !normalizedSupervisorEmail
                    ) {
                        throw new Error(
                            "Supervisor Email is required"
                        );
                    }

                    const assignedUserByEmail =
                        await prisma.user.findFirst({
                            where: {
                                email: {
                                    equals:
                                        normalizedSupervisorEmail,
                                    mode:
                                        "insensitive",
                                },

                                role:
                                    "SUPERVISOR",

                                status:
                                    "ACTIVE",
                            },

                            select: {
                                id: true,
                            },
                        });

                    if (
                        !assignedUserByEmail
                    ) {
                        throw new Error(
                            `Active Supervisor not found for email: ${normalizedSupervisorEmail}`
                        );
                    }

                    resolvedAssignedToId =
                        assignedUserByEmail.id;
                }

                // --------------------------------------------
                // VALIDATE ASSIGNED SUPERVISOR
                // --------------------------------------------
                const assignedUser =
                    await prisma.user.findUnique({
                        where: {
                            id:
                                resolvedAssignedToId,
                        },

                        select: {
                            id: true,
                            name: true,
                            email: true,
                            role: true,
                            status: true,
                            siteId: true,
                        },
                    });

                if (!assignedUser) {
                    throw new Error(
                        "Assigned Supervisor not found"
                    );
                }

                if (
                    assignedUser.status !==
                    "ACTIVE"
                ) {
                    throw new Error(
                        "Assigned Supervisor is inactive"
                    );
                }

                if (
                    assignedUser.role !==
                    "SUPERVISOR"
                ) {
                    throw new Error(
                        "Tasks can only be assigned to supervisors"
                    );
                }

                // --------------------------------------------
                // RESOLVE SITE UUID
                // --------------------------------------------
                let resolvedSiteId =
                    typeof siteId ===
                        "string" &&
                        siteId.trim()
                        ? siteId.trim()
                        : null;

                if (
                    !resolvedSiteId
                ) {
                    const normalizedSiteCode =
                        typeof siteCode ===
                            "string"
                            ? siteCode.trim()
                            : "";

                    const normalizedSiteName =
                        typeof siteName ===
                            "string"
                            ? siteName.trim()
                            : "";

                    if (
                        !normalizedSiteCode &&
                        !normalizedSiteName
                    ) {
                        throw new Error(
                            "Site Code or Site Name is required"
                        );
                    }

                    let siteByReference =
                        null;

                    // First preference: Site Code
                    if (
                        normalizedSiteCode
                    ) {
                        siteByReference =
                            await prisma.site.findFirst({
                                where: {
                                    status:
                                        "ACTIVE",

                                    siteCode: {
                                        equals:
                                            normalizedSiteCode,
                                        mode:
                                            "insensitive",
                                    },
                                },

                                select: {
                                    id: true,
                                    status: true,
                                },
                            });
                    }

                    // Fallback: Site Name
                    if (
                        !siteByReference &&
                        normalizedSiteName
                    ) {
                        siteByReference =
                            await prisma.site.findFirst({
                                where: {
                                    status:
                                        "ACTIVE",

                                    name: {
                                        equals:
                                            normalizedSiteName,
                                        mode:
                                            "insensitive",
                                    },
                                },

                                select: {
                                    id: true,
                                    status: true,
                                },
                            });
                    }

                    if (
                        !siteByReference
                    ) {
                        throw new Error(
                            `Active site not found for Site Code/Site Name: ${normalizedSiteCode || normalizedSiteName}`
                        );
                    }

                    resolvedSiteId =
                        siteByReference.id;
                }

                // --------------------------------------------
                // VALIDATE SITE
                // --------------------------------------------
                const site =
                    await prisma.site.findUnique({
                        where: {
                            id:
                                resolvedSiteId,
                        },

                        select: {
                            id: true,
                            status: true,
                        },
                    });

                if (!site) {
                    throw new Error(
                        "Site not found"
                    );
                }

                if (
                    site.status !==
                    "ACTIVE"
                ) {
                    throw new Error(
                        "Site is inactive"
                    );
                }

                // --------------------------------------------
                // SUPERVISOR CREATOR SECURITY
                // --------------------------------------------
                if (
                    req.user.role ===
                    "SUPERVISOR"
                ) {
                    if (
                        resolvedSiteId !==
                        supervisorSiteId
                    ) {
                        throw new Error(
                            "You can only create tasks for your assigned site"
                        );
                    }
                }

                // --------------------------------------------
                // NORMALIZE FLAGS
                // --------------------------------------------
                const normalizedShowInAdvance =
                    typeof showInAdvance ===
                        "boolean"
                        ? showInAdvance
                        : true;

                const normalizedShowAfterMissed =
                    typeof showAfterMissed ===
                        "boolean"
                        ? showAfterMissed
                        : true;

                const normalizedWholeDay =
                    typeof wholeDay ===
                        "boolean"
                        ? wholeDay
                        : false;

                // --------------------------------------------
                // APPEND CLIENT MOBILE TO DESCRIPTION IF PROVIDED
                // --------------------------------------------
                let finalBulkDescription = description || "";
                const bulkMobile = taskItem.clientPhone || taskItem.clientMobile;
                if (bulkMobile && typeof bulkMobile === "string" && bulkMobile.trim()) {
                    if (!finalBulkDescription.includes("Client Mobile:")) {
                        finalBulkDescription = finalBulkDescription
                            ? `${finalBulkDescription} | Client Mobile: ${bulkMobile.trim()}`
                            : `Client Mobile: ${bulkMobile.trim()}`;
                    }
                }

                // --------------------------------------------
                // CREATE TASK
                // --------------------------------------------
                const task =
                    await prisma.task.create({
                        data: {
                            title,

                            description:
                                finalBulkDescription ||
                                null,

                            clientEmail:
                                normalizedClientEmail,

                            priority:
                                normalizedPriority,

                            scheduledAt:
                                parsedScheduledAt,

                            showInAdvance:
                                normalizedShowInAdvance,

                            showAfterMissed:
                                normalizedShowAfterMissed,

                            wholeDay:
                                normalizedWholeDay,

                            assignedToId:
                                resolvedAssignedToId,

                            assignedById:
                                req.user
                                    .userId,

                            siteId:
                                resolvedSiteId,
                        },

                        include: {
                            assignedTo: {
                                select: {
                                    id: true,
                                    name: true,
                                    email: true,
                                    role: true,
                                    status: true,
                                },
                            },

                            assignedBy: {
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
                                    siteCode: true,
                                    city: true,
                                    state: true,
                                },
                            },
                        },
                    });

                successfulTasks.push(
                    task
                );
            } catch (error) {
                failedTasks.push({
                    row:
                        index + 2,

                    title:
                        title ||
                        null,

                    error:
                        error.message,
                });
            }
        }

        return res.status(201).json({
            success: true,

            message:
                "Bulk task creation completed",

            data: {
                total:
                    tasks.length,

                successful:
                    successfulTasks.length,

                failed:
                    failedTasks.length,

                successfulTasks,

                failedTasks,
            },
        });
    } catch (error) {
        console.error(
            "Create bulk tasks error:",
            error
        );

        return res.status(500).json({
            success: false,

            message:
                "Failed to create bulk tasks",

            error:
                error.message,
        });
    }
};


/*
 * ============================================================
 * CANCEL BULK TASKS
 * ============================================================
 */
const cancelBulkTasks = async (req, res) => {
    try {
        const { tasks } = req.body;

        if (
            !Array.isArray(tasks) ||
            tasks.length === 0
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "tasks must be a non-empty array",
            });
        }

        if (tasks.length > 500) {
            return res.status(400).json({
                success: false,
                message:
                    "Maximum 500 tasks can be cancelled at once",
            });
        }

        const successfulTasks = [];
        const failedTasks = [];

        for (
            let index = 0;
            index < tasks.length;
            index++
        ) {
            const item = tasks[index];

            const title =
                typeof item?.title === "string"
                    ? item.title.trim()
                    : "";

            const supervisorEmail =
                typeof item?.supervisorEmail ===
                    "string"
                    ? item.supervisorEmail
                        .trim()
                        .toLowerCase()
                    : "";

            const siteCode =
                typeof item?.siteCode ===
                    "string"
                    ? item.siteCode.trim()
                    : "";

            const clientEmail =
                typeof item?.clientEmail ===
                    "string"
                    ? item.clientEmail.trim()
                    : "";

            const scheduledAt =
                item?.scheduledAt;

            const excelRow =
                Number(item?.row) ||
                index + 2;

            try {
                if (
                    !title ||
                    !scheduledAt ||
                    !supervisorEmail ||
                    !siteCode
                ) {
                    throw new Error(
                        "title, scheduledAt, supervisorEmail and siteCode are required"
                    );
                }

                const parsedScheduledAt =
                    new Date(scheduledAt);

                if (
                    Number.isNaN(
                        parsedScheduledAt.getTime()
                    )
                ) {
                    throw new Error(
                        "Invalid scheduled date"
                    );
                }

                // --------------------------------------------
                // FIND ACTIVE SUPERVISOR
                // --------------------------------------------
                const supervisor =
                    await prisma.user.findFirst({
                        where: {
                            email: {
                                equals:
                                    supervisorEmail,
                                mode:
                                    "insensitive",
                            },

                            role: "SUPERVISOR",

                            status: "ACTIVE",
                        },

                        select: {
                            id: true,
                            name: true,
                            email: true,
                            role: true,
                            status: true,
                        },
                    });

                if (!supervisor) {
                    throw new Error(
                        `Active Supervisor not found for email: ${supervisorEmail}`
                    );
                }

                // --------------------------------------------
                // FIND ACTIVE SITE
                // --------------------------------------------
                const site =
                    await prisma.site.findFirst({
                        where: {
                            status: "ACTIVE",

                            siteCode: {
                                equals: siteCode,
                                mode:
                                    "insensitive",
                            },
                        },

                        select: {
                            id: true,
                            name: true,
                            siteCode: true,
                            status: true,
                        },
                    });

                if (!site) {
                    throw new Error(
                        `Active site not found for Site Code: ${siteCode}`
                    );
                }

                // --------------------------------------------
                // FIND EXACT TASK
                // --------------------------------------------
                const taskWhere = {
                    title: {
                        equals: title,
                        mode: "insensitive",
                    },

                    scheduledAt:
                        parsedScheduledAt,

                    assignedToId:
                        supervisor.id,

                    siteId: site.id,
                };

                if (clientEmail) {
                    taskWhere.clientEmail =
                        clientEmail;
                }

                const matchingTasks =
                    await prisma.task.findMany({
                        where: taskWhere,

                        include: {
                            assignedTo: {
                                select: {
                                    id: true,
                                    name: true,
                                    email: true,
                                    role: true,
                                    status: true,
                                },
                            },

                            assignedBy: {
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
                                    siteCode: true,
                                },
                            },

                            campaign: {
                                select: {
                                    id: true,
                                    name: true,
                                    status: true,
                                },
                            },
                        },
                    });

                if (
                    matchingTasks.length === 0
                ) {
                    throw new Error(
                        "Task not found for the provided title, scheduledAt, supervisorEmail and siteCode"
                    );
                }

                if (
                    matchingTasks.length > 1
                ) {
                    throw new Error(
                        "Multiple matching tasks found. Add clientEmail to identify the correct task."
                    );
                }

                const task =
                    matchingTasks[0];

                if (
                    task.assignedTo?.role !==
                    "SUPERVISOR"
                ) {
                    throw new Error(
                        "Only Supervisor tasks can be cancelled"
                    );
                }

                if (
                    task.status ===
                    "COMPLETED"
                ) {
                    throw new Error(
                        "Cannot cancel a completed task"
                    );
                }

                if (
                    task.status ===
                    "CANCELLED"
                ) {
                    throw new Error(
                        "Task is already cancelled"
                    );
                }

                const updatedTask =
                    await prisma.task.update({
                        where: {
                            id: task.id,
                        },

                        data: {
                            status:
                                "CANCELLED",
                        },

                        include: {
                            assignedTo: {
                                select: {
                                    id: true,
                                    name: true,
                                    email: true,
                                    role: true,
                                    status: true,
                                },
                            },

                            assignedBy: {
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
                                    siteCode: true,
                                },
                            },

                            campaign: {
                                select: {
                                    id: true,
                                    name: true,
                                    status: true,
                                },
                            },
                        },
                    });

                successfulTasks.push(
                    updatedTask
                );
            } catch (error) {
                failedTasks.push({
                    row: excelRow,
                    title: title || null,
                    error: error.message,
                });
            }
        }

        return res.status(201).json({
            success: true,

            message:
                "Bulk task cancellation completed",

            data: {
                total:
                    tasks.length,

                successful:
                    successfulTasks.length,

                failed:
                    failedTasks.length,

                successfulTasks,

                failedTasks,
            },
        });
    } catch (error) {
        console.error(
            "Cancel bulk tasks error:",
            error
        );

        return res.status(500).json({
            success: false,
            message:
                "Failed to cancel bulk tasks",
            error:
                error?.message,
        });
    }
};

/*
 * ============================================================
 * EXPORTS
 * ============================================================
 */
export {
    createTask,
    getTasks,
    getTaskById,
    updateTaskStatus,
    reassignTask,
    cancelTask,
    createBulkTasks,
    cancelBulkTasks,
    reassignBulkTasks,
};