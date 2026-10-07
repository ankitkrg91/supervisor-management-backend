import prisma from "../config/prisma.js";
import { sendAuditCompletionEmail } from "../services/auditEmailService.js";

/*
 * ============================================================
 * CREATE CHECK-IN
 * ============================================================
 *
 * RULES
 * ------------------------------------------------------------
 * 1. User.siteId = supervisor primary/default site only.
 * 2. Task.siteId = actual site of the current task.
 * 3. Supervisor can work at multiple sites through assigned tasks.
 * 4. Check-in permission is based on:
 *
 *      Task.assignedToId === current Supervisor
 *      Task.siteId        === requested site
 *
 * 5. We NEVER compare:
 *
 *      user.siteId === siteId
 *
 * 6. One Supervisor can have only one active check-in at a time.
 * 7. Same-site active check-in is reused.
 * 8. Different-site active check-in requires checkout first.
 */
const createCheckIn = async (req, res) => {
    try {
        const userId = req.user.userId;

        const {
            siteId,
            latitude,
            longitude,
        } = req.body;

        if (!siteId) {
            return res.status(400).json({
                success: false,
                message: "siteId is required",
            });
        }

        // --------------------------------------------------------
        // CURRENT USER
        // --------------------------------------------------------

        const user = await prisma.user.findUnique({
            where: {
                id: userId,
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

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found",
            });
        }

        if (user.status !== "ACTIVE") {
            return res.status(403).json({
                success: false,
                message: "User account is inactive",
            });
        }

        if (user.role !== "SUPERVISOR") {
            return res.status(403).json({
                success: false,
                message:
                    "Only active Supervisors can check in",
            });
        }

        // --------------------------------------------------------
        // SITE
        // --------------------------------------------------------

        const site = await prisma.site.findUnique({
            where: {
                id: siteId,
            },

            select: {
                id: true,
                name: true,
                siteCode: true,
                status: true,
                city: true,
                state: true,
            },
        });

        if (!site) {
            return res.status(404).json({
                success: false,
                message: "Site not found",
            });
        }

        if (site.status !== "ACTIVE") {
            return res.status(400).json({
                success: false,
                message: "Site is inactive",
            });
        }

        // --------------------------------------------------------
        // VERIFY TASK ASSIGNMENT
        // --------------------------------------------------------

        /*
         * IMPORTANT:
         * NEVER compare user.siteId with siteId.
         *
         * Supervisor can have:
         *
         * Task 1 -> Site A
         * Task 2 -> Site B
         * Task 3 -> Site C
         *
         * The Supervisor is allowed to check in if the
         * requested site belongs to one of their assigned tasks.
         */

        const assignedTask = await prisma.task.findFirst({
            where: {
                assignedToId: userId,
                siteId: siteId,
                status: {
                    not: "CANCELLED",
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
                scheduledAt: "asc",
            },
        });

        if (!assignedTask) {
            return res.status(403).json({
                success: false,
                message:
                    "This task is not assigned to the logged-in Supervisor for this site.",
                data: {
                    userId: userId,
                    requestedSiteId: siteId,
                },
            });
        }

        // --------------------------------------------------------
        // LOCATION
        // --------------------------------------------------------

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
                Number.isNaN(parsedLatitude) ||
                parsedLatitude < -90 ||
                parsedLatitude > 90
            )
        ) {
            return res.status(400).json({
                success: false,
                message: "Invalid latitude",
            });
        }

        if (
            parsedLongitude !== null &&
            (
                Number.isNaN(parsedLongitude) ||
                parsedLongitude < -180 ||
                parsedLongitude > 180
            )
        ) {
            return res.status(400).json({
                success: false,
                message: "Invalid longitude",
            });
        }

        // --------------------------------------------------------
        // CHECK ACTIVE CHECK-IN AT THIS SITE ONLY
        // --------------------------------------------------------

        /*
         * IMPORTANT:
         *
         * DO NOT search only by userId.
         *
         * Multiple active check-ins at different sites are allowed.
         *
         * Example:
         *
         * Site A -> CHECKED_IN
         * Site B -> CHECKED_IN
         * Site C -> CHECKED_IN
         */

        const existingCheckIn =
            await prisma.checkInOut.findFirst({
                where: {
                    userId: userId,
                    siteId: siteId,
                    status: "CHECKED_IN",
                    checkOutAt: null,
                },

                include: {
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
                            siteCode: true,
                            city: true,
                            state: true,
                        },
                    },
                },

                orderBy: {
                    checkInAt: "desc",
                },
            });

        // --------------------------------------------------------
        // ALREADY CHECKED IN AT THIS TASK SITE
        // --------------------------------------------------------

        if (existingCheckIn) {
            return res.status(200).json({
                success: true,
                message: "Already checked in at this site",

                data: {
                    checkIn: existingCheckIn,

                    task: {
                        id: assignedTask.id,
                        title: assignedTask.title,
                        description:
                            assignedTask.description,
                        status: assignedTask.status,
                        scheduledAt:
                            assignedTask.scheduledAt,
                        priority:
                            assignedTask.priority,
                        siteId:
                            assignedTask.siteId,
                    },

                    alreadyCheckedIn: true,
                },
            });
        }

        // --------------------------------------------------------
        // CREATE NEW CHECK-IN
        // --------------------------------------------------------

        const checkIn =
            await prisma.checkInOut.create({
                data: {
                    userId: userId,
                    siteId: siteId,

                    checkInAt:
                        new Date(),

                    checkInLatitude:
                        parsedLatitude,

                    checkInLongitude:
                        parsedLongitude,

                    status:
                        "CHECKED_IN",
                },

                include: {
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
                            siteCode: true,
                            city: true,
                            state: true,
                        },
                    },
                },
            });

        // --------------------------------------------------------
        // SUCCESS
        // --------------------------------------------------------

        return res.status(201).json({
            success: true,
            message: "Check-in successful",

            data: {
                checkIn,

                task: {
                    id: assignedTask.id,
                    title: assignedTask.title,
                    description:
                        assignedTask.description,
                    status: assignedTask.status,
                    scheduledAt:
                        assignedTask.scheduledAt,
                    priority:
                        assignedTask.priority,
                    siteId:
                        assignedTask.siteId,
                },

                alreadyCheckedIn: false,
            },
        });
    } catch (error) {
        console.error(
            "Create check-in error:",
            error
        );

        return res.status(500).json({
            success: false,
            message: "Failed to check in",
        });
    }
};


/*
 * ============================================================
 * GET CHECK-INS
 * ============================================================
 *
 * Supervisor:
 * - only own records
 * - multiple sites allowed
 *
 * Admin:
 * - existing filters available
 */
const getCheckIns = async (req, res) => {
    try {
        const currentUser = req.user;

        const {
            from,
            to,
            role,
            search,
            siteId,
            page = "1",
            limit = "10",
        } = req.query;

        const where = {};

        // --------------------------------------------------------
        // SUPERVISOR SECURITY
        // --------------------------------------------------------

        /*
         * Security boundary is USER ID.
         * NOT User.siteId.
         */

        if (
            currentUser.role ===
            "SUPERVISOR"
        ) {
            where.userId =
                currentUser.userId;
        }

        // --------------------------------------------------------
        // OPTIONAL SITE FILTER
        // --------------------------------------------------------

        if (siteId) {
            const site =
                await prisma.site.findUnique({
                    where: {
                        id: siteId,
                    },

                    select: {
                        id: true,
                    },
                });

            if (!site) {
                return res.status(404).json({
                    success: false,
                    message: "Site not found",
                });
            }

            where.siteId = siteId;
        }

        // --------------------------------------------------------
        // PAGINATION
        // --------------------------------------------------------

        const pageNumber = Math.max(
            parseInt(page, 10) || 1,
            1
        );

        const limitNumber = Math.min(
            Math.max(
                parseInt(limit, 10) || 10,
                1
            ),
            100
        );

        const skip =
            (pageNumber - 1) *
            limitNumber;

        // --------------------------------------------------------
        // ROLE FILTER
        // --------------------------------------------------------

        if (role) {
            const allowedRoles = [
                "SUPER_ADMIN",
                "SUPERVISOR",
                "FIELD_STAFF",
            ];

            if (
                !allowedRoles.includes(role)
            ) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Invalid user role",
                });
            }

            where.user = {
                role: role,
            };
        }

        // --------------------------------------------------------
        // SEARCH
        // --------------------------------------------------------

        if (
            search &&
            search.trim()
        ) {
            const searchValue =
                search.trim();

            where.OR = [
                {
                    user: {
                        name: {
                            contains:
                                searchValue,
                            mode:
                                "insensitive",
                        },
                    },
                },

                {
                    user: {
                        email: {
                            contains:
                                searchValue,
                            mode:
                                "insensitive",
                        },
                    },
                },

                {
                    site: {
                        name: {
                            contains:
                                searchValue,
                            mode:
                                "insensitive",
                        },
                    },
                },

                {
                    site: {
                        siteCode: {
                            contains:
                                searchValue,
                            mode:
                                "insensitive",
                        },
                    },
                },

                {
                    site: {
                        city: {
                            contains:
                                searchValue,
                            mode:
                                "insensitive",
                        },
                    },
                },
            ];
        }

        // --------------------------------------------------------
        // DATE FILTER
        // --------------------------------------------------------

        if (
            from ||
            to
        ) {
            where.checkInAt = {};

            if (from) {
                where.checkInAt.gte =
                    new Date(
                        `${from}T00:00:00.000Z`
                    );
            }

            if (to) {
                where.checkInAt.lte =
                    new Date(
                        `${to}T23:59:59.999Z`
                    );
            }
        }

        // --------------------------------------------------------
        // TOTAL
        // --------------------------------------------------------

        const total =
            await prisma.checkInOut.count({
                where: where,
            });

        // --------------------------------------------------------
        // FETCH
        // --------------------------------------------------------

        const checkIns =
            await prisma.checkInOut.findMany({
                where: where,

                skip: skip,
                take: limitNumber,

                include: {
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
                            siteCode: true,
                            city: true,
                            state: true,
                        },
                    },
                },

                orderBy: {
                    checkInAt: "desc",
                },
            });

        // --------------------------------------------------------
        // TOTAL PAGES
        // --------------------------------------------------------

        const totalPages =
            Math.ceil(
                total /
                limitNumber
            );

        // --------------------------------------------------------
        // RESPONSE
        // --------------------------------------------------------

        return res.status(200).json({
            success: true,

            count:
                checkIns.length,

            pagination: {
                page:
                    pageNumber,

                limit:
                    limitNumber,

                total:
                    total,

                totalPages:
                    totalPages,
            },

            data: {
                checkIns:
                    checkIns,
            },
        });
    } catch (error) {
        console.error(
            "Get check-ins error:",
            error
        );

        return res.status(500).json({
            success: false,
            message:
                "Failed to fetch check-ins",

            error:
                process.env.NODE_ENV ===
                    "development"
                    ? error.message
                    : undefined,
        });
    }
};


/*
 * ============================================================
 * CHECK-OUT
 * ============================================================
 *
 * Supervisor can checkout only their own active check-in.
 *
 * Email:
 * - Triggered AFTER successful checkout.
 * - Email errors do NOT fail checkout.
 * - Audit email service will verify the completed task,
 *   audit submission, visit and client email before sending.
 */
const checkOut = async (req, res) => {
    try {
        const userId =
            req.user.userId;

        const { id } =
            req.params;

        const {
            latitude,
            longitude,
        } = req.body;

        // --------------------------------------------------------
        // FIND ACTIVE CHECK-IN
        // --------------------------------------------------------

        const checkIn =
            await prisma.checkInOut.findFirst({
                where: {
                    id: id,
                    userId: userId,
                    status:
                        "CHECKED_IN",
                    checkOutAt:
                        null,
                },
            });

        if (!checkIn) {
            return res.status(404).json({
                success: false,
                message:
                    "Active check-in not found",
            });
        }

        // --------------------------------------------------------
        // VERIFY USER
        // --------------------------------------------------------

        const checkInUser =
            await prisma.user.findUnique({
                where: {
                    id: userId,
                },

                select: {
                    id: true,
                    role: true,
                    status: true,
                },
            });

        if (!checkInUser) {
            return res.status(404).json({
                success: false,
                message:
                    "User not found",
            });
        }

        if (
            checkInUser.status !==
            "ACTIVE"
        ) {
            return res.status(403).json({
                success: false,
                message:
                    "User account is inactive",
            });
        }

        if (
            checkInUser.role !==
            "SUPERVISOR"
        ) {
            return res.status(403).json({
                success: false,
                message:
                    "Only active Supervisors can check out",
            });
        }

        // --------------------------------------------------------
        // PARSE CHECKOUT LOCATION
        // --------------------------------------------------------

        const parsedCheckoutLatitude =
            latitude !== undefined &&
                latitude !== null &&
                latitude !== ""
                ? Number(latitude)
                : null;

        const parsedCheckoutLongitude =
            longitude !== undefined &&
                longitude !== null &&
                longitude !== ""
                ? Number(longitude)
                : null;

        // --------------------------------------------------------
        // VALIDATE CHECKOUT LATITUDE
        // --------------------------------------------------------

        if (
            parsedCheckoutLatitude !== null &&
            (
                Number.isNaN(
                    parsedCheckoutLatitude
                ) ||
                parsedCheckoutLatitude < -90 ||
                parsedCheckoutLatitude > 90
            )
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "Invalid checkout latitude",
            });
        }

        // --------------------------------------------------------
        // VALIDATE CHECKOUT LONGITUDE
        // --------------------------------------------------------

        if (
            parsedCheckoutLongitude !== null &&
            (
                Number.isNaN(
                    parsedCheckoutLongitude
                ) ||
                parsedCheckoutLongitude < -180 ||
                parsedCheckoutLongitude > 180
            )
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "Invalid checkout longitude",
            });
        }

        // --------------------------------------------------------
        // CALCULATE DISTANCE
        // --------------------------------------------------------

        let distanceTravelled =
            null;

        if (
            checkIn.checkInLatitude !== null &&
            checkIn.checkInLongitude !== null &&
            parsedCheckoutLatitude !== null &&
            parsedCheckoutLongitude !== null
        ) {
            const toRadians =
                (degrees) =>
                    degrees *
                    (
                        Math.PI /
                        180
                    );

            const earthRadiusKm =
                6371;

            const lat1 =
                toRadians(
                    Number(
                        checkIn.checkInLatitude
                    )
                );

            const lat2 =
                toRadians(
                    parsedCheckoutLatitude
                );

            const deltaLat =
                toRadians(
                    parsedCheckoutLatitude -
                    Number(
                        checkIn.checkInLatitude
                    )
                );

            const deltaLon =
                toRadians(
                    parsedCheckoutLongitude -
                    Number(
                        checkIn.checkInLongitude
                    )
                );

            const a =
                Math.sin(
                    deltaLat / 2
                ) ** 2 +
                Math.cos(lat1) *
                Math.cos(lat2) *
                Math.sin(
                    deltaLon / 2
                ) ** 2;

            const c =
                2 *
                Math.atan2(
                    Math.sqrt(a),
                    Math.sqrt(1 - a)
                );

            distanceTravelled =
                Number(
                    (
                        earthRadiusKm *
                        c
                    ).toFixed(3)
                );
        }

        // --------------------------------------------------------
        // UPDATE CHECK-IN
        // --------------------------------------------------------

        const updatedCheckIn =
            await prisma.checkInOut.update({
                where: {
                    id:
                        checkIn.id,
                },

                data: {
                    checkOutAt:
                        new Date(),

                    checkOutLatitude:
                        parsedCheckoutLatitude,

                    checkOutLongitude:
                        parsedCheckoutLongitude,

                    distanceTravelled:
                        distanceTravelled,

                    status:
                        "CHECKED_OUT",
                },

                include: {
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
                            siteCode: true,
                            city: true,
                            state: true,
                        },
                    },
                },
            });

        // --------------------------------------------------------
        // AUDIT COMPLETION EMAIL
        // --------------------------------------------------------
        /*
         * IMPORTANT:
         *
         * Checkout must remain successful even if the email
         * service fails.
         *
         * The email service will verify:
         * - completed Task
         * - correct Supervisor
         * - correct Site
         * - Visit
         * - AuditSubmission
         * - Audit answers
         * - Client email
         * - Visit photo
         *
         * The email is sent from the Google Apps Script account.
         */

        sendAuditCompletionEmail({
            checkInId:
                updatedCheckIn.id,
        })
            .then((result) => {
                console.log(
                    "Audit completion email result:",
                    result
                );
            })
            .catch((emailError) => {
                console.error(
                    "Audit completion email failed:",
                    emailError
                );
            });

        // --------------------------------------------------------
        // RESPONSE
        // --------------------------------------------------------

        return res.status(200).json({
            success: true,
            message:
                "Check-out successful",

            data: {
                checkIn:
                    updatedCheckIn,
            },
        });
    } catch (error) {
        console.error(
            "Check-out error:",
            error
        );

        return res.status(500).json({
            success: false,
            message:
                "Failed to check out",

            error:
                process.env.NODE_ENV ===
                    "development"
                    ? error.message
                    : undefined,
        });
    }
};


/*
 * ============================================================
 * GET CHECK-IN BY ID
 * ============================================================
 *
 * Supervisor can access only their own record.
 */
const getCheckInById = async (
    req,
    res
) => {
    try {
        const { id } =
            req.params;

        const currentUser =
            req.user;

        // --------------------------------------------------------
        // FETCH CHECK-IN
        // --------------------------------------------------------

        const checkIn =
            await prisma.checkInOut.findUnique({
                where: {
                    id: id,
                },

                include: {
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
                },
            });

        // --------------------------------------------------------
        // NOT FOUND
        // --------------------------------------------------------

        if (!checkIn) {
            return res.status(404).json({
                success: false,
                message:
                    "Check-in record not found",
            });
        }

        // --------------------------------------------------------
        // SUPERVISOR SECURITY
        // --------------------------------------------------------

        if (
            currentUser.role ===
            "SUPERVISOR"
        ) {
            if (
                checkIn.userId !==
                currentUser.userId
            ) {
                return res.status(403).json({
                    success: false,
                    message:
                        "You do not have permission to access this check-in",
                });
            }
        }

        // --------------------------------------------------------
        // RESPONSE
        // --------------------------------------------------------

        return res.status(200).json({
            success: true,

            data: {
                checkIn:
                    checkIn,
            },
        });
    } catch (error) {
        console.error(
            "Get check-in by ID error:",
            error
        );

        return res.status(500).json({
            success: false,
            message:
                "Failed to fetch check-in record",

            error:
                process.env.NODE_ENV ===
                    "development"
                    ? error.message
                    : undefined,
        });
    }
};


/*
 * ============================================================
 * EXPORTS
 * ============================================================
 */

export {
    createCheckIn,
    getCheckIns,
    checkOut,
    getCheckInById,
};