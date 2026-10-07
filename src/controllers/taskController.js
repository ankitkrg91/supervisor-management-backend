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
        // CREATE TASK
        // ----------------------------------------------------
        const task =
            await prisma.task.create({
                data: {
                    title,

                    description:
                        description || null,

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

        // ----------------------------------------------------
        // RESPONSE
        // ----------------------------------------------------
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
 *
 * SUPER_ADMIN:
 * - Can filter by site
 * - Can filter by Supervisor
 *
 * SUPERVISOR:
 * - Can see only tasks assigned to themselves
 * - Can receive tasks from different sites
 * - Cannot override assignedToId
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
            /*
             * IMPORTANT:
             * Do NOT filter by Supervisor's User.siteId.
             *
             * A Supervisor may have tasks such as:
             *
             * Sep 25 -> Site A
             * Sep 26 -> Site B
             * Sep 27 -> Site C
             *
             * All are valid because they are assigned to
             * the same Supervisor.
             */

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
        // NON-SUPERVISOR SITE FILTER
        // ----------------------------------------------------
        else if (siteId) {
            where.siteId = siteId;
        }

        // ----------------------------------------------------
        // STATUS FILTER
        // ----------------------------------------------------
        if (status) {
            where.status = status;
        }

        // ----------------------------------------------------
        // PRIORITY FILTER
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
        // FETCH TASKS + TOTAL COUNT
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
                    scheduledAt: "desc",
                },

                skip,

                take: limitNumber,
            }),

            prisma.task.count({
                where,
            }),
        ]);

        // ----------------------------------------------------
        // RESPONSE
        // ----------------------------------------------------
        return res.status(200).json({
            success: true,

            data: {
                tasks,

                pagination: {
                    page: pageNumber,
                    limit: limitNumber,
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
            error: error.message,
        });
    }
};


/*
 * ============================================================
 * GET TASK BY ID
 * ============================================================
 */
const getTaskById = async (req, res) => {
    try {
        console.log(
            "🔥 GET TASK BY ID CONTROLLER IS RUNNING"
        );

        const { id } = req.params;

        // ----------------------------------------------------
        // FETCH TASK
        // ----------------------------------------------------
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

        // ----------------------------------------------------
        // TASK NOT FOUND
        // ----------------------------------------------------
        if (!task) {
            return res.status(404).json({
                success: false,
                message: "Task not found",
            });
        }

        // ----------------------------------------------------
        // SUPERVISOR SECURITY
        // ----------------------------------------------------
        if (
            req.user.role === "SUPERVISOR"
        ) {
            /*
             * Supervisor only needs to be the assigned
             * Supervisor for this task.
             *
             * Task site may be different from User.siteId.
             */

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
                message: "Task not found",
            });
        }

        // ----------------------------------------------------
        // RESPONSE
        // ----------------------------------------------------
        return res.status(200).json({
            success: true,

            data: {
                task,
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
            error: error.message,
        });
    }
};


/*
 * ============================================================
 * UPDATE TASK STATUS
 * ============================================================
 *
 * Allowed lifecycle:
 *
 * SCHEDULED
 *   -> IN_PROGRESS
 *   -> CANCELLED
 *
 * IN_PROGRESS
 *   -> COMPLETED
 *   -> CANCELLED
 *
 * COMPLETED
 *   -> no transition
 *
 * CANCELLED
 *   -> no transition
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

        // Only Supervisor tasks
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

        // Supervisor security:
        // ownership is based on assignedToId.
        //
        // Do NOT use User.siteId here because
        // one Supervisor may have tasks at
        // multiple sites.

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

        // Allowed lifecycle
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
 *
 * Task may be reassigned to any active Supervisor.
 *
 * Target Supervisor does NOT have to belong to
 * the task's site.
 */
const reassignTask =
    async (req, res) => {
        try {
            const { id } =
                req.params;

            const {
                assignedToId,
            } = req.body;

            // ------------------------------------------------
            // REQUIRED ASSIGNED USER
            // ------------------------------------------------
            if (!assignedToId) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Assigned user ID is required",
                });
            }

            // ------------------------------------------------
            // FIND TASK
            // ------------------------------------------------
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

            // ------------------------------------------------
            // SUPERVISOR ACCESS
            // ------------------------------------------------
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

            // ------------------------------------------------
            // COMPLETED / CANCELLED
            // ------------------------------------------------
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

            // ------------------------------------------------
            // VALIDATE TARGET SUPERVISOR
            // ------------------------------------------------
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

            // ------------------------------------------------
            // REASSIGN
            // ------------------------------------------------
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

            // ------------------------------------------------
            // RESPONSE
            // ------------------------------------------------
            return res.status(200).json({
                success: true,

                message:
                    "Task reassigned successfully",

                data: {
                    task: updatedTask,
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
 */
const reassignBulkTasks =
    async (req, res) => {
        try {
            const {
                tasks,
                assignedToId,
            } = req.body;

            // ------------------------------------------------
            // BASIC VALIDATION
            // ------------------------------------------------
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
                        "assignedToId is required",
                });
            }

            if (tasks.length > 500) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Maximum 500 tasks can be reassigned at once",
                });
            }

            // ------------------------------------------------
            // VALIDATE TARGET SUPERVISOR
            // ------------------------------------------------
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
                        "Target supervisor not found",
                });
            }

            if (
                assignedUser.status !==
                "ACTIVE"
            ) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Target supervisor is inactive",
                });
            }

            if (
                assignedUser.role !==
                "SUPERVISOR"
            ) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Tasks can only be reassigned to supervisors",
                });
            }

            // ------------------------------------------------
            // PROCESS
            // ------------------------------------------------
            const successfulTasks = [];
            const failedTasks = [];

            for (
                let index = 0;
                index < tasks.length;
                index++
            ) {
                const item =
                    tasks[index];

                const taskId =
                    typeof item === "string"
                        ? item.trim()
                        : String(
                            item?.taskId ??
                            ""
                        ).trim();

                const excelRow =
                    Number(item?.row) ||
                    index + 2;

                try {
                    // TASK ID
                    if (!taskId) {
                        throw new Error(
                            "Task ID is required"
                        );
                    }

                    // FIND TASK
                    const task =
                        await prisma.task.findUnique({
                            where: {
                                id: taskId,
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
                        throw new Error(
                            "Task not found"
                        );
                    }

                    // SUPERVISOR TASK ONLY
                    if (
                        task.assignedTo?.role !==
                        "SUPERVISOR"
                    ) {
                        throw new Error(
                            "Only Supervisor tasks can be reassigned"
                        );
                    }

                    // SUPERVISOR ACCESS
                    if (
                        req.user.role ===
                        "SUPERVISOR"
                    ) {
                        if (
                            task.assignedToId !==
                            req.user.userId
                        ) {
                            throw new Error(
                                "You do not have access to this task"
                            );
                        }
                    }

                    // COMPLETED TASK
                    if (
                        task.status ===
                        "COMPLETED"
                    ) {
                        throw new Error(
                            "Cannot reassign a completed task"
                        );
                    }

                    // CANCELLED TASK
                    if (
                        task.status ===
                        "CANCELLED"
                    ) {
                        throw new Error(
                            "Cannot reassign a cancelled task"
                        );
                    }

                    // SAME SUPERVISOR
                    if (
                        task.assignedToId ===
                        assignedToId
                    ) {
                        throw new Error(
                            "Task is already assigned to this supervisor"
                        );
                    }

                    // REASSIGN
                    const updatedTask =
                        await prisma.task.update({
                            where: {
                                id: task.id,
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
                        row:
                            excelRow,

                        taskId:
                            taskId ||
                            null,

                        error:
                            error.message,
                    });
                }
            }

            // ------------------------------------------------
            // RESPONSE
            // ------------------------------------------------
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
            });
        }
    };


/*
 * ============================================================
 * CANCEL TASK
 * ============================================================
 */
const cancelTask =
    async (req, res) => {
        try {
            const { id } =
                req.params;

            // ------------------------------------------------
            // FIND TASK
            // ------------------------------------------------
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
                    },
                });

            if (!task) {
                return res.status(404).json({
                    success: false,
                    message:
                        "Task not found",
                });
            }

            // ------------------------------------------------
            // ONLY SUPERVISOR TASKS
            // ------------------------------------------------
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

            // ------------------------------------------------
            // SUPERVISOR ACCESS
            // ------------------------------------------------
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

            // ------------------------------------------------
            // COMPLETED TASK
            // ------------------------------------------------
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

            // ------------------------------------------------
            // ALREADY CANCELLED
            // ------------------------------------------------
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

            // ------------------------------------------------
            // CANCEL
            // ------------------------------------------------
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
                    },
                });

            // ------------------------------------------------
            // RESPONSE
            // ------------------------------------------------
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
 */
const createBulkTasks =
    async (req, res) => {
        try {
            const {
                tasks,
            } = req.body;

            // ------------------------------------------------
            // BASIC VALIDATION
            // ------------------------------------------------
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

            // ------------------------------------------------
            // SUPERVISOR CREATOR SITE
            // ------------------------------------------------
            let supervisorSiteId =
                null;

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

            // ------------------------------------------------
            // RESULT ARRAYS
            // ------------------------------------------------
            const successfulTasks = [];
            const failedTasks = [];

            // ------------------------------------------------
            // PROCESS EACH TASK
            // ------------------------------------------------
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
                    campaignId,
                    showInAdvance = true,
                    showAfterMissed = true,
                    wholeDay = false,
                } = taskData;

                try {
                    // ----------------------------------------
                    // REQUIRED FIELDS
                    // ----------------------------------------
                    if (
                        !title ||
                        !scheduledAt ||
                        !assignedToId ||
                        !siteId
                    ) {
                        throw new Error(
                            "title, scheduledAt, assignedToId and siteId are required"
                        );
                    }

                    // ----------------------------------------
                    // CLIENT EMAIL
                    // ----------------------------------------
                    const normalizedClientEmail =
                        typeof clientEmail === "string" &&
                            clientEmail.trim()
                            ? clientEmail.trim()
                            : null;

                    if (normalizedClientEmail) {
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

                    // ----------------------------------------
                    // PRIORITY
                    // ----------------------------------------
                    const validPriorities = [
                        "LOW",
                        "MEDIUM",
                        "HIGH",
                    ];

                    if (
                        priority &&
                        !validPriorities.includes(
                            priority
                        )
                    ) {
                        throw new Error(
                            "Invalid task priority"
                        );
                    }

                    // ----------------------------------------
                    // DATE
                    // ----------------------------------------
                    const parsedScheduledAt =
                        new Date(
                            scheduledAt
                        );

                    if (
                        !scheduledAt ||
                        Number.isNaN(
                            parsedScheduledAt.getTime()
                        )
                    ) {
                        throw new Error(
                            "Invalid scheduled date"
                        );
                    }

                    // ----------------------------------------
                    // ASSIGNED SUPERVISOR
                    // ----------------------------------------
                    const assignedUser =
                        await prisma.user.findUnique({
                            where: {
                                id:
                                    assignedToId,
                            },

                            select: {
                                id: true,
                                role: true,
                                status: true,
                                siteId: true,
                            },
                        });

                    if (!assignedUser) {
                        throw new Error(
                            "Assigned user not found"
                        );
                    }

                    if (
                        assignedUser.status !==
                        "ACTIVE"
                    ) {
                        throw new Error(
                            "Assigned user is inactive"
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

                    // ----------------------------------------
                    // SITE
                    // ----------------------------------------
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

                    // ----------------------------------------
                    // SUPERVISOR CREATOR SECURITY
                    // ----------------------------------------
                    if (
                        req.user.role ===
                        "SUPERVISOR"
                    ) {
                        if (
                            siteId !==
                            supervisorSiteId
                        ) {
                            throw new Error(
                                "You can only create tasks for your assigned site"
                            );
                        }
                    }

                    // ----------------------------------------
                    // CAMPAIGN
                    // ----------------------------------------
                    if (campaignId) {
                        const campaign =
                            await prisma.campaign.findUnique({
                                where: {
                                    id:
                                        campaignId,
                                },

                                select: {
                                    id: true,
                                    status: true,
                                },
                            });

                        if (!campaign) {
                            throw new Error(
                                "Campaign not found"
                            );
                        }

                        if (
                            campaign.status !==
                            "ACTIVE"
                        ) {
                            throw new Error(
                                "Campaign is not active"
                            );
                        }
                    }

                    // ----------------------------------------
                    // NORMALIZE FLAGS
                    // ----------------------------------------
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

                    // ----------------------------------------
                    // CREATE TASK
                    // ----------------------------------------
                    const task =
                        await prisma.task.create({
                            data: {
                                title,

                                description:
                                    description ||
                                    null,

                                clientEmail:
                                    normalizedClientEmail,

                                priority:
                                    priority ||
                                    "MEDIUM",

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
                                    req.user
                                        .userId,

                                siteId,

                                campaignId:
                                    campaignId ||
                                    null,
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
                        task
                    );
                } catch (error) {
                    failedTasks.push({
                        row:
                            index + 1,

                        title:
                            title ||
                            null,

                        error:
                            error.message,
                    });
                }
            }

            // ------------------------------------------------
            // FINAL RESPONSE
            // ------------------------------------------------
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
            });
        }
    };


/*
 * ============================================================
 * CANCEL BULK TASKS
 * ============================================================
 */
const cancelBulkTasks =
    async (req, res) => {
        try {
            const {
                tasks,
            } = req.body;

            // ------------------------------------------------
            // BASIC VALIDATION
            // ------------------------------------------------
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

            // ------------------------------------------------
            // RESULT ARRAYS
            // ------------------------------------------------
            const successfulTasks = [];
            const failedTasks = [];

            // ------------------------------------------------
            // PROCESS EACH TASK
            // ------------------------------------------------
            for (
                let index = 0;
                index < tasks.length;
                index++
            ) {
                const item =
                    tasks[index];

                const taskId =
                    typeof item === "string"
                        ? item.trim()
                        : String(
                            item?.taskId ??
                            ""
                        ).trim();

                try {
                    // TASK ID
                    if (!taskId) {
                        throw new Error(
                            "Task ID is required"
                        );
                    }

                    // FIND TASK
                    const task =
                        await prisma.task.findUnique({
                            where: {
                                id:
                                    taskId,
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
                            },
                        });

                    if (!task) {
                        throw new Error(
                            "Task not found"
                        );
                    }

                    // SUPERVISOR TASK ONLY
                    if (
                        task.assignedTo?.role !==
                        "SUPERVISOR"
                    ) {
                        throw new Error(
                            "Only Supervisor tasks can be cancelled"
                        );
                    }

                    // SUPERVISOR ACCESS
                    if (
                        req.user.role ===
                        "SUPERVISOR"
                    ) {
                        if (
                            task.assignedToId !==
                            req.user.userId
                        ) {
                            throw new Error(
                                "You do not have access to this task"
                            );
                        }
                    }

                    // COMPLETED
                    if (
                        task.status ===
                        "COMPLETED"
                    ) {
                        throw new Error(
                            "Cannot cancel a completed task"
                        );
                    }

                    // ALREADY CANCELLED
                    if (
                        task.status ===
                        "CANCELLED"
                    ) {
                        throw new Error(
                            "Task is already cancelled"
                        );
                    }

                    // CANCEL
                    const updatedTask =
                        await prisma.task.update({
                            where: {
                                id:
                                    task.id,
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

                    successfulTasks.push(
                        updatedTask
                    );
                } catch (error) {
                    failedTasks.push({
                        row:
                            index + 1,

                        taskId:
                            taskId ||
                            null,

                        error:
                            error.message,
                    });
                }
            }

            // ------------------------------------------------
            // RESPONSE
            // ------------------------------------------------
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