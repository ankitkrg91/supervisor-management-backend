import prisma from "../config/prisma.js";

/* ============================================================
   HELPERS
   ============================================================ */

const extractTaskIdFromNotes = (notes) => {
    if (
        typeof notes !== "string" ||
        !notes.trim()
    ) {
        return null;
    }

    const match = notes.match(
        /Task ID:\s*([a-f0-9-]{36})/i
    );

    return match ? match[1] : null;
};


const visitInclude = {
    user: {
        select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            role: true,
            status: true,
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

    auditSubmission: {
        select: {
            id: true,
            templateId: true,
            submittedAt: true,
        },
    },
};


/* ============================================================
   CREATE VISIT
   ============================================================ */

const createVisit = async (
    req,
    res
) => {
    try {
        const userId =
            req.user.userId;

        const {
            siteId,
            visitAt,
            reportType,
            clientName,
            branch,
            region,
            latitude,
            longitude,
            photoUrl,
            photoFileId,
            notes,
        } = req.body || {};

        if (!siteId) {
            return res.status(400).json({
                success: false,
                message:
                    "siteId is required",
            });
        }

        const user =
            await prisma.user.findUnique({
                where: {
                    id: userId,
                },

                select: {
                    id: true,
                    name: true,
                    email: true,
                    role: true,
                    status: true,
                },
            });

        if (!user) {
            return res.status(404).json({
                success: false,
                message:
                    "User not found",
            });
        }

        if (
            user.status !==
            "ACTIVE"
        ) {
            return res.status(403).json({
                success: false,
                message:
                    "User account is inactive",
            });
        }

        if (
            user.role !==
            "SUPERVISOR"
        ) {
            return res.status(403).json({
                success: false,
                message:
                    "Only active Supervisors can create visits",
            });
        }

        const site =
            await prisma.site.findUnique({
                where: {
                    id: siteId,
                },

                select: {
                    id: true,
                    name: true,
                    siteCode: true,
                    status: true,
                    address: true,
                    city: true,
                    state: true,
                    pincode: true,
                    latitude: true,
                    longitude: true,
                },
            });

        if (!site) {
            return res.status(404).json({
                success: false,
                message:
                    "Site not found",
            });
        }

        if (
            site.status !==
            "ACTIVE"
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "Site is inactive",
            });
        }

        /* =====================================================
           TASK
           ===================================================== */

        const taskId =
            extractTaskIdFromNotes(
                notes
            );

        let assignedTask = null;

        if (taskId) {
            assignedTask =
                await prisma.task.findUnique({
                    where: {
                        id: taskId,
                    },

                    select: {
                        id: true,
                        title: true,
                        description: true,
                        status: true,
                        scheduledAt: true,
                        priority: true,
                        siteId: true,
                        assignedToId: true,
                    },
                });

            if (!assignedTask) {
                return res.status(404).json({
                    success: false,
                    message:
                        "Task not found",
                });
            }

            if (
                assignedTask.assignedToId !==
                userId
            ) {
                return res.status(403).json({
                    success: false,
                    message:
                        "This task is not assigned to the logged-in Supervisor.",
                });
            }

            if (
                assignedTask.siteId !==
                siteId
            ) {
                return res.status(403).json({
                    success: false,
                    message:
                        "This task belongs to a different site.",
                });
            }

            if (
                assignedTask.status ===
                "CANCELLED"
            ) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Cancelled tasks cannot create visits",
                });
            }
        } else {
            assignedTask =
                await prisma.task.findFirst({
                    where: {
                        assignedToId:
                            userId,

                        siteId,

                        status: {
                            not:
                                "CANCELLED",
                        },
                    },

                    select: {
                        id: true,
                        title: true,
                        description: true,
                        status: true,
                        scheduledAt: true,
                        priority: true,
                        siteId: true,
                        assignedToId: true,
                    },

                    orderBy: {
                        scheduledAt:
                            "asc",
                    },
                });

            if (!assignedTask) {
                return res.status(403).json({
                    success: false,
                    message:
                        "No active task is assigned to this Supervisor for this site.",
                });
            }
        }

        /* =====================================================
           VISIT DATE
           ===================================================== */

        const parsedVisitAt =
            visitAt
                ? new Date(
                    visitAt
                )
                : new Date();

        if (
            Number.isNaN(
                parsedVisitAt.getTime()
            )
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "Invalid visit date/time",
            });
        }

        /* =====================================================
           GPS
           ===================================================== */

        const parsedLatitude =
            latitude !== undefined &&
                latitude !== null &&
                latitude !== ""
                ? Number(latitude)
                : null;

        const parsedLongitude =
            longitude !== undefined &&
                longitude !== null &&
                longitude !== ""
                ? Number(longitude)
                : null;

        if (
            parsedLatitude !== null &&
            (
                Number.isNaN(
                    parsedLatitude
                ) ||
                parsedLatitude < -90 ||
                parsedLatitude > 90
            )
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "Invalid latitude",
            });
        }

        if (
            parsedLongitude !== null &&
            (
                Number.isNaN(
                    parsedLongitude
                ) ||
                parsedLongitude < -180 ||
                parsedLongitude > 180
            )
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "Invalid longitude",
            });
        }

        /* =====================================================
           PHOTO
           ===================================================== */

        const cleanPhotoUrl =
            typeof photoUrl ===
                "string"
                ? photoUrl.trim()
                : null;

        const cleanPhotoFileId =
            typeof photoFileId ===
                "string"
                ? photoFileId.trim()
                : null;

        /* =====================================================
           EXISTING TASK VISIT
           
           IMPORTANT:
           If visit already exists, update its photo/GPS.
           ===================================================== */

        if (taskId) {
            const existingVisit =
                await prisma.visit.findFirst({
                    where: {
                        userId,
                        siteId,

                        notes: {
                            contains:
                                `Task ID: ${taskId}`,
                        },
                    },

                    orderBy: {
                        visitAt:
                            "desc",
                    },

                    include:
                        visitInclude,
                });

            if (existingVisit) {
                const updateData = {};

                if (
                    cleanPhotoUrl
                ) {
                    updateData.photoUrl =
                        cleanPhotoUrl;
                }

                if (
                    cleanPhotoFileId
                ) {
                    updateData.photoFileId =
                        cleanPhotoFileId;
                }

                if (
                    parsedLatitude !==
                    null
                ) {
                    updateData.latitude =
                        parsedLatitude;
                }

                if (
                    parsedLongitude !==
                    null
                ) {
                    updateData.longitude =
                        parsedLongitude;
                }

                if (
                    Object.keys(
                        updateData
                    ).length > 0
                ) {
                    const updatedVisit =
                        await prisma.visit.update({
                            where: {
                                id:
                                    existingVisit.id,
                            },

                            data:
                                updateData,

                            include:
                                visitInclude,
                        });

                    return res.status(200).json({
                        success: true,
                        message:
                            "Existing visit updated successfully",

                        data: {
                            visit:
                                updatedVisit,
                        },
                    });
                }

                return res.status(200).json({
                    success: true,
                    message:
                        "Existing visit found",

                    data: {
                        visit:
                            existingVisit,
                    },
                });
            }
        }

        /* =====================================================
           CREATE NEW VISIT
           ===================================================== */

        const visit =
            await prisma.visit.create({
                data: {
                    userId,
                    siteId,

                    visitAt:
                        parsedVisitAt,

                    reportType:
                        typeof reportType ===
                            "string" &&
                            reportType.trim()
                            ? reportType.trim()
                            : null,

                    clientName:
                        typeof clientName ===
                            "string" &&
                            clientName.trim()
                            ? clientName.trim()
                            : null,

                    branch:
                        typeof branch ===
                            "string" &&
                            branch.trim()
                            ? branch.trim()
                            : null,

                    region:
                        typeof region ===
                            "string" &&
                            region.trim()
                            ? region.trim()
                            : null,

                    latitude:
                        parsedLatitude,

                    longitude:
                        parsedLongitude,

                    // PHOTO
                    photoUrl:
                        cleanPhotoUrl,

                    photoFileId:
                        cleanPhotoFileId,

                    notes:
                        typeof notes ===
                            "string" &&
                            notes.trim()
                            ? notes.trim()
                            : null,

                    status:
                        "PENDING",
                },

                include:
                    visitInclude,
            });

        return res.status(201).json({
            success: true,

            message:
                "Visit created successfully",

            data: {
                visit,
            },
        });
    } catch (error) {
        console.error(
            "Create visit error:",
            error
        );

        return res.status(500).json({
            success: false,

            message:
                "Failed to create visit",

            error:
                process.env.NODE_ENV ===
                    "development"
                    ? error.message
                    : undefined,
        });
    }
};


/* ============================================================
   GET VISITS
   ============================================================ */

const getVisits = async (
    req,
    res
) => {
    try {
        const currentUser =
            req.user;

        const {
            from,
            to,
            status,
            role,
            search,
            siteId,
            region,
            branch,
            clientName,
            page = "1",
            limit = "100",
        } = req.query;

        const where = {};

        /* SUPERVISOR = OWN VISITS */
        if (
            currentUser.role ===
            "SUPERVISOR"
        ) {
            where.userId =
                currentUser.userId;
        }

        /* ADMIN / DEFAULT = SUPERVISOR VISITS */
        if (role) {
            where.user = {
                role,
            };
        } else {
            where.user = {
                role:
                    "SUPERVISOR",
            };
        }

        if (siteId) {
            where.siteId =
                siteId;
        }

        if (status) {
            const allowedStatuses = [
                "PENDING",
                "VERIFIED",
                "UNVERIFIED",
                "REJECTED",
            ];

            if (
                !allowedStatuses.includes(
                    status
                )
            ) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Invalid visit status",
                });
            }

            where.status =
                status;
        }

        if (
            region &&
            region !== "ALL"
        ) {
            where.region =
                region;
        }

        if (
            branch &&
            branch !== "ALL"
        ) {
            where.branch =
                branch;
        }

        if (
            clientName &&
            clientName !== "ALL"
        ) {
            where.clientName = {
                contains:
                    clientName,
                mode:
                    "insensitive",
            };
        }

        if (from || to) {
            where.visitAt = {};

            if (from) {
                where.visitAt.gte =
                    new Date(
                        `${from}T00:00:00.000Z`
                    );
            }

            if (to) {
                where.visitAt.lte =
                    new Date(
                        `${to}T23:59:59.999Z`
                    );
            }
        }

        if (
            search &&
            search.trim()
        ) {
            const q =
                search.trim();

            where.AND = [
                {
                    OR: [
                        {
                            user: {
                                name: {
                                    contains:
                                        q,
                                    mode:
                                        "insensitive",
                                },
                            },
                        },

                        {
                            user: {
                                email: {
                                    contains:
                                        q,
                                    mode:
                                        "insensitive",
                                },
                            },
                        },

                        {
                            site: {
                                name: {
                                    contains:
                                        q,
                                    mode:
                                        "insensitive",
                                },
                            },
                        },

                        {
                            site: {
                                siteCode: {
                                    contains:
                                        q,
                                    mode:
                                        "insensitive",
                                },
                            },
                        },

                        {
                            clientName: {
                                contains:
                                    q,
                                mode:
                                    "insensitive",
                            },
                        },
                    ],
                },
            ];
        }

        const pageNumber =
            Math.max(
                parseInt(
                    page,
                    10
                ) || 1,
                1
            );

        const limitNumber =
            Math.min(
                Math.max(
                    parseInt(
                        limit,
                        10
                    ) || 100,
                    1
                ),
                100
            );

        const skip =
            (pageNumber - 1) *
            limitNumber;

        const [
            total,
            visits,
        ] =
            await Promise.all([
                prisma.visit.count({
                    where,
                }),

                prisma.visit.findMany({
                    where,

                    skip,

                    take:
                        limitNumber,

                    orderBy: {
                        visitAt:
                            "desc",
                    },

                    include:
                        visitInclude,
                }),
            ]);

        return res.status(200).json({
            success: true,

            count:
                visits.length,

            data: {
                visits,
            },

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
        });
    } catch (error) {
        console.error(
            "Get visits error:",
            error
        );

        return res.status(500).json({
            success: false,
            message:
                "Failed to fetch visits",
        });
    }
};


/* ============================================================
   GET VISIT BY ID
   ============================================================ */

const getVisitById = async (
    req,
    res
) => {
    try {
        const currentUser =
            req.user;

        const {
            id,
        } = req.params;

        const visit =
            await prisma.visit.findUnique({
                where: {
                    id,
                },

                include:
                    visitInclude,
            });

        if (!visit) {
            return res.status(404).json({
                success: false,
                message:
                    "Visit not found",
            });
        }

        if (
            visit.user?.role !==
            "SUPERVISOR"
        ) {
            return res.status(403).json({
                success: false,
                message:
                    "This is not a Supervisor visit",
            });
        }

        if (
            currentUser.role ===
            "SUPERVISOR" &&
            visit.userId !==
            currentUser.userId
        ) {
            return res.status(403).json({
                success: false,
                message:
                    "You do not have permission to access this visit",
            });
        }

        return res.status(200).json({
            success: true,

            data: {
                visit,
            },
        });
    } catch (error) {
        console.error(
            "Get visit by ID error:",
            error
        );

        return res.status(500).json({
            success: false,
            message:
                "Failed to fetch visit",
        });
    }
};


/* ============================================================
   UPDATE STATUS
   ============================================================ */

const updateVisitStatus = async (
    req,
    res
) => {
    try {
        const currentUser =
            req.user;

        const {
            id,
        } = req.params;

        const status =
            String(
                req.body?.status ||
                ""
            )
                .trim()
                .toUpperCase();

        const allowedStatuses = [
            "VERIFIED",
            "UNVERIFIED",
            "REJECTED",
        ];

        if (
            !allowedStatuses.includes(
                status
            )
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "Invalid visit status",
            });
        }

        const visit =
            await prisma.visit.findUnique({
                where: {
                    id,
                },

                select: {
                    id: true,
                    userId: true,
                    siteId: true,
                    status: true,

                    user: {
                        select: {
                            role: true,
                            status: true,
                        },
                    },
                },
            });

        if (!visit) {
            return res.status(404).json({
                success: false,
                message:
                    "Visit not found",
            });
        }

        if (
            visit.user?.role !==
            "SUPERVISOR"
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "Only Supervisor visits can be updated",
            });
        }

        if (
            currentUser.role ===
            "SUPERVISOR" &&
            visit.userId !==
            currentUser.userId
        ) {
            return res.status(403).json({
                success: false,
                message:
                    "You do not have permission to update this visit",
            });
        }

        const updatedVisit =
            await prisma.visit.update({
                where: {
                    id,
                },

                data: {
                    status,
                },

                include:
                    visitInclude,
            });

        return res.status(200).json({
            success: true,

            message:
                "Visit status updated successfully",

            data: {
                visit:
                    updatedVisit,
            },
        });
    } catch (error) {
        console.error(
            "Update visit status error:",
            error
        );

        return res.status(500).json({
            success: false,
            message:
                "Failed to update visit status",
        });
    }
};


export {
    createVisit,
    getVisits,
    getVisitById,
    updateVisitStatus,
};