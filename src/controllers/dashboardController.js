import prisma from "../config/prisma.js";

const ONLINE_THRESHOLD_MS = 5 * 60 * 1000;

// ============================================================
// DATE HELPERS
// ============================================================

const startOfDay = (date = new Date()) => {
    const value = new Date(date);

    value.setHours(0, 0, 0, 0);

    return value;
};

const endOfDay = (date = new Date()) => {
    const value = new Date(date);

    value.setHours(23, 59, 59, 999);

    return value;
};

const parseDate = (value, end = false) => {
    if (!value) {
        return null;
    }

    const date = new Date(
        `${value}T${end ? "23:59:59.999" : "00:00:00"}`
    );

    return Number.isNaN(date.getTime())
        ? null
        : date;
};

const parseList = (value) => {
    if (value === undefined) {
        return null;
    }

    if (value === "") {
        return [];
    }

    return value
        .split(",")
        .map((item) => {
            try {
                return decodeURIComponent(item).trim();
            } catch {
                return item.trim();
            }
        })
        .filter(Boolean);
};

const buildRange = (fromDate, toDate) => {
    const range = {};

    if (fromDate) {
        range.gte = fromDate;
    }

    if (toDate) {
        range.lte = toDate;
    }

    return Object.keys(range).length > 0
        ? range
        : undefined;
};

const getMonthRange = (offset = 0) => {
    const now = new Date();

    const start = new Date(
        now.getFullYear(),
        now.getMonth() + offset,
        1,
        0,
        0,
        0,
        0
    );

    let end;

    if (offset === 0) {
        end = new Date(now);
    } else {
        end = new Date(
            now.getFullYear(),
            now.getMonth() + offset + 1,
            0,
            23,
            59,
            59,
            999
        );
    }

    return {
        start,
        end,
    };
};

// ============================================================
// TASK ID EXTRACTION FROM VISIT NOTES
// ============================================================

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

    return match
        ? match[1]
        : null;
};

// ============================================================
// REMOVE DUPLICATE TASK VISITS
//
// A task audit visit stores:
//
// Task ID: <task-id>
//
// If the same task generated multiple Visit rows,
// keep only the latest Visit for that Task ID.
//
// Normal non-task visits are kept normally.
// ============================================================

const deduplicateTaskVisits = (visits) => {
    const taskVisits = new Map();
    const normalVisits = [];

    for (const visit of visits) {
        const taskId =
            extractTaskIdFromNotes(
                visit.notes
            );

        if (taskId) {
            if (
                !taskVisits.has(
                    taskId
                )
            ) {
                taskVisits.set(
                    taskId,
                    visit
                );
            }
        } else {
            normalVisits.push(
                visit
            );
        }
    }

    return [
        ...taskVisits.values(),
        ...normalVisits,
    ].sort(
        (a, b) =>
            new Date(b.visitAt).getTime() -
            new Date(a.visitAt).getTime()
    );
};

// ============================================================
// SITE FILTER
// ============================================================

const buildSiteWhere = ({
    regions,
    branches,
}) => {
    const where = {
        status: "ACTIVE",
    };

    if (regions !== null) {
        where.state = {
            in: regions,
        };
    }

    if (branches !== null) {
        where.city = {
            in: branches,
        };
    }

    return where;
};

// ============================================================
// CLIENT FILTER
// ============================================================

const buildClientWhere = (clients) => {
    if (clients === null) {
        return {};
    }

    return {
        clientName: {
            in: clients,
        },
    };
};

// ============================================================
// TASK CLIENT FILTER
// ============================================================

const buildTaskClientWhere = (clients) => {
    if (clients === null) {
        return {};
    }

    if (clients.length === 0) {
        return {
            id: {
                in: [],
            },
        };
    }

    return {
        OR: clients.map(
            (client) => ({
                description: {
                    contains:
                        `Client: ${client}`,
                    mode: "insensitive",
                },
            })
        ),
    };
};

// ============================================================
// FILTER OPTIONS
// ============================================================

const getFilterOptions = async () => {
    const sites =
        await prisma.site.findMany({
            where: {
                status: "ACTIVE",
            },

            select: {
                state: true,
                city: true,
            },
        });

    const clientRows =
        await prisma.visit.findMany({
            where: {
                clientName: {
                    not: null,
                },
            },

            select: {
                clientName: true,
            },

            distinct: [
                "clientName",
            ],
        });

    const regions = [
        ...new Set(
            sites
                .map(
                    (site) =>
                        site.state
                )
                .filter(Boolean)
        ),
    ].sort();

    const branches = [
        ...new Set(
            sites
                .map(
                    (site) =>
                        site.city
                )
                .filter(Boolean)
        ),
    ].sort();

    const clients = [
        ...new Set(
            clientRows
                .map(
                    (row) =>
                        row.clientName
                )
                .filter(Boolean)
        ),
    ].sort();

    return {
        regions,
        branches,
        clients,
    };
};

// ============================================================
// GET DASHBOARD
// ============================================================

const getDashboard = async (
    req,
    res
) => {
    try {
        const {
            fromDate:
            fromDateParam,

            toDate:
            toDateParam,

            regions:
            regionsParam,

            branches:
            branchesParam,

            clients:
            clientsParam,
        } = req.query;

        // =====================================================
        // DATE FILTER
        // =====================================================

        const fromDate =
            parseDate(
                fromDateParam,
                false
            );

        const toDate =
            parseDate(
                toDateParam,
                true
            );

        if (
            fromDateParam &&
            !fromDate
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "Invalid fromDate",
            });
        }

        if (
            toDateParam &&
            !toDate
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "Invalid toDate",
            });
        }

        if (
            fromDate &&
            toDate &&
            fromDate > toDate
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "From date cannot be after To date",
            });
        }

        // =====================================================
        // FILTER VALUES
        // =====================================================

        const regions =
            parseList(
                regionsParam
            );

        const branches =
            parseList(
                branchesParam
            );

        const clients =
            parseList(
                clientsParam
            );

        // =====================================================
        // FILTERED SITES
        // =====================================================

        const siteWhere =
            buildSiteWhere({
                regions,
                branches,
            });

        const filteredSites =
            await prisma.site.findMany({
                where:
                    siteWhere,

                select: {
                    id: true,
                },
            });

        let filteredSiteIds =
            filteredSites.map(
                (site) =>
                    site.id
            );

        // =====================================================
        // CLIENT -> SITE FILTER
        // =====================================================

        if (
            clients !== null
        ) {
            if (
                clients.length ===
                0
            ) {
                filteredSiteIds =
                    [];
            } else {
                const clientVisits =
                    await prisma.visit.findMany({
                        where: {
                            clientName:
                            {
                                in:
                                    clients,
                            },
                        },

                        select: {
                            siteId:
                                true,
                        },

                        distinct: [
                            "siteId",
                        ],
                    });

                const clientSiteIds =
                    clientVisits.map(
                        (row) =>
                            row.siteId
                    );

                filteredSiteIds =
                    filteredSiteIds.filter(
                        (siteId) =>
                            clientSiteIds.includes(
                                siteId
                            )
                    );
            }
        }

        const selectedDateRange =
            buildRange(
                fromDate,
                toDate
            );

        // =====================================================
        // FILTER OPTIONS
        // =====================================================

        const filterOptions =
            await getFilterOptions();

        // =====================================================
        // AUDIT SUMMARY
        // =====================================================

        const auditVisitFilter = {
            siteId: {
                in:
                    filteredSiteIds,
            },

            ...buildClientWhere(
                clients
            ),
        };

        const auditDateFilter =
            selectedDateRange
                ? {
                    submittedAt:
                        selectedDateRange,
                }
                : {};

        const [
            totalAudits,
            totalVerified,
            rejectedAudits,
            verificationPending,
        ] = await Promise.all([
            prisma.auditSubmission.count({
                where: {
                    visit: {
                        user: {
                            role: "SUPERVISOR",
                        },
                    },
                },
            }),

            prisma.auditSubmission.count({
                where: {
                    visit: {
                        status: "VERIFIED",

                        user: {
                            role: "SUPERVISOR",
                        },
                    },
                },
            }),

            prisma.auditSubmission.count({
                where: {
                    visit: {
                        status: "REJECTED",

                        user: {
                            role: "SUPERVISOR",
                        },
                    },
                },
            }),

            prisma.auditSubmission.count({
                where: {
                    visit: {
                        status: "PENDING",

                        user: {
                            role: "SUPERVISOR",
                        },
                    },
                },
            }),
        ]);

        // =====================================================
        // CURRENT MONTH / LAST MONTH SITE VISITS
        // =====================================================

        const currentMonth =
            getMonthRange(0);

        const lastMonth =
            getMonthRange(-1);

        const getVisitedCount =
            async (
                range
            ) => {
                if (
                    filteredSiteIds.length ===
                    0
                ) {
                    return 0;
                }

                const visitRows =
                    await prisma.visit.findMany({
                        where: {
                            visitAt: {
                                gte:
                                    range.start,

                                lte:
                                    range.end,
                            },

                            siteId: {
                                in:
                                    filteredSiteIds,
                            },

                            ...buildClientWhere(
                                clients
                            ),
                        },

                        select: {
                            siteId:
                                true,
                        },

                        distinct: [
                            "siteId",
                        ],
                    });

                return visitRows.length;
            };

        const [
            currentVisited,
            lastVisited,
        ] =
            await Promise.all([
                getVisitedCount(
                    currentMonth
                ),

                getVisitedCount(
                    lastMonth
                ),
            ]);

        const currentNotVisited =
            Math.max(
                filteredSiteIds.length -
                currentVisited,
                0
            );

        const lastNotVisited =
            Math.max(
                filteredSiteIds.length -
                lastVisited,
                0
            );

        // =====================================================
        // ACTIVE SUPERVISORS
        // =====================================================

        const supervisorWhere = {
            role:
                "SUPERVISOR",

            status:
                "ACTIVE",
        };

        const filtersApplied =
            regions !== null ||
            branches !== null ||
            clients !== null;

        if (
            filtersApplied
        ) {
            supervisorWhere.siteId =
            {
                in:
                    filteredSiteIds,
            };
        }

        const supervisors =
            await prisma.user.findMany({
                where:
                    supervisorWhere,

                select: {
                    id: true,
                    name: true,
                    email: true,
                    siteId: true,

                    site: {
                        select: {
                            id: true,
                            name: true,
                            siteCode:
                                true,
                        },
                    },
                },

                orderBy: {
                    createdAt:
                        "desc",
                },
            });

        // =====================================================
        // ONLINE / OFFLINE / BATTERY
        // =====================================================

        let onlineCount = 0;
        let offlineCount = 0;
        let batteryLowCount = 0;

        await Promise.all(
            supervisors.map(
                async (
                    supervisor
                ) => {
                    const latestLocation =
                        await prisma.locationLog.findFirst(
                            {
                                where: {
                                    userId:
                                        supervisor.id,
                                },

                                orderBy: {
                                    recordedAt:
                                        "desc",
                                },
                            }
                        );

                    if (
                        !latestLocation
                    ) {
                        return;
                    }

                    const age =
                        Date.now() -
                        new Date(
                            latestLocation.recordedAt
                        ).getTime();

                    if (
                        age <=
                        ONLINE_THRESHOLD_MS
                    ) {
                        onlineCount +=
                            1;
                    } else {
                        offlineCount +=
                            1;
                    }

                    if (
                        latestLocation.batteryLevel !==
                        null &&
                        latestLocation.batteryLevel <=
                        20
                    ) {
                        batteryLowCount +=
                            1;
                    }
                }
            )
        );

        // =====================================================
        // TODAY
        // =====================================================

        const todayStart =
            startOfDay();

        const todayEnd =
            endOfDay();

        // =====================================================
        // TODAY VISITS
        //
        // IMPORTANT:
        // Multiple Visit rows for the SAME Task ID
        // are counted as ONE task visit.
        // =====================================================

        const todayVisitWhere = {
            visitAt: {
                gte:
                    todayStart,

                lte:
                    todayEnd,
            },

            siteId: {
                in:
                    filteredSiteIds,
            },

            ...buildClientWhere(
                clients
            ),
        };

        const rawTodayVisits =
            await prisma.visit.findMany({
                where:
                    todayVisitWhere,

                select: {
                    id: true,

                    visitAt:
                        true,

                    status:
                        true,

                    notes:
                        true,
                },

                orderBy: {
                    visitAt:
                        "desc",
                },
            });

        const todayVisitRows =
            deduplicateTaskVisits(
                rawTodayVisits
            );

        const todayVisits =
            todayVisitRows.length;

        const verifiedVisits =
            todayVisitRows.filter(
                (visit) =>
                    visit.status ===
                    "VERIFIED"
            ).length;

        const pendingVisitVerification =
            todayVisitRows.filter(
                (visit) =>
                    visit.status ===
                    "PENDING"
            ).length;

        const unverifiedVisits =
            todayVisitRows.filter(
                (visit) =>
                    visit.status ===
                    "UNVERIFIED"
            ).length;

        // =====================================================
        // TASKS
        //
        // Without date filter:
        // ALL Supervisor tasks.
        //
        // With From/To:
        // Tasks inside selected range.
        // =====================================================

        const taskDateFilter =
            selectedDateRange
                ? {
                    scheduledAt:
                        selectedDateRange,
                }
                : {};

        const taskBaseWhere = {
            ...taskDateFilter,

            siteId: {
                in:
                    filteredSiteIds,
            },

            assignedTo: {
                role:
                    "SUPERVISOR",
            },

            ...buildTaskClientWhere(
                clients
            ),
        };

        const [
            totalTasks,
            assignedTasks,
            inProgressTasks,
            completedTasks,
            pendingTasks,
        ] =
            await Promise.all([
                // -----------------------------------------
                // TOTAL ACTIVE TASKS
                // -----------------------------------------

                prisma.task.count({
                    where: {
                        ...taskBaseWhere,

                        status: {
                            not:
                                "CANCELLED",
                        },
                    },
                }),

                // -----------------------------------------
                // ASSIGNED TASKS
                // -----------------------------------------

                prisma.task.count({
                    where: {
                        ...taskBaseWhere,

                        status: {
                            in: [
                                "SCHEDULED",
                                "IN_PROGRESS",
                                "COMPLETED",
                            ],
                        },
                    },
                }),

                // -----------------------------------------
                // IN PROGRESS
                // -----------------------------------------

                prisma.task.count({
                    where: {
                        ...taskBaseWhere,

                        status:
                            "IN_PROGRESS",
                    },
                }),

                // -----------------------------------------
                // COMPLETED
                // -----------------------------------------

                prisma.task.count({
                    where: {
                        ...taskBaseWhere,

                        status:
                            "COMPLETED",
                    },
                }),

                // -----------------------------------------
                // PENDING
                // -----------------------------------------

                prisma.task.count({
                    where: {
                        ...taskBaseWhere,

                        status:
                            "SCHEDULED",
                    },
                }),
            ]);

        // =====================================================
        // CHECK-IN / CHECK-OUT
        // =====================================================
        //
        // Meaning of each number:
        //
        // Today's Check-Ins
        // -> Total number of check-in EVENTS created today.
        //
        // Checked-Out
        // -> Total number of check-out EVENTS completed today.
        //    Uses checkOutAt, NOT checkInAt.
        //
        // Currently Checked-In
        // -> Number of UNIQUE active Supervisors who currently
        //    have at least one active check-in.
        //
        // Not Checked-In
        // -> Number of UNIQUE active Supervisors who have at least
        //    one relevant task today that is still SCHEDULED or
        //    IN_PROGRESS and have NOT checked in at that task's site
        //    today.
        //
        // IMPORTANT:
        // - User.siteId is NOT used for task-specific attendance.
        // - Task.siteId is the actual task site.
        // - Task.assignedToId identifies the Supervisor.
        // - Multiple pending tasks for one Supervisor count as ONE
        //   Not Checked-In Supervisor.
        // - COMPLETED tasks do not count as pending attendance.
        // - CANCELLED tasks do not count.
        // - A Supervisor with no relevant task today does not count.
        // - Currently Checked-In has NO date restriction.
        // - Checked-Out is based on checkOutAt.
        // =====================================================

        const supervisorIds =
            supervisors.map(
                (user) =>
                    user.id
            );

        let todayCheckIns = 0;
        let checkedOutToday = 0;
        let currentlyCheckedIn = 0;
        let notCheckedInCount = 0;

        if (
            supervisorIds.length > 0 &&
            filteredSiteIds.length > 0
        ) {

            // -----------------------------------------------------
            // TODAY'S CHECK-IN EVENTS
            // -----------------------------------------------------
            const todayCheckInWhere = {
                userId: {
                    in:
                        supervisorIds,
                },

                checkInAt: {
                    gte:
                        todayStart,

                    lte:
                        todayEnd,
                },

                // Respect dashboard site filters.
                siteId: {
                    in:
                        filteredSiteIds,
                },
            };

            // -----------------------------------------------------
            // TODAY'S CHECK-OUT EVENTS
            // -----------------------------------------------------
            //
            // IMPORTANT:
            // Use checkOutAt, not checkInAt.
            //
            // Example:
            // Supervisor checked in yesterday and checked out today.
            // That checkout MUST count today.
            // -----------------------------------------------------
            const checkedOutTodayWhere = {
                userId: {
                    in:
                        supervisorIds,
                },

                status:
                    "CHECKED_OUT",

                checkOutAt: {
                    gte:
                        todayStart,

                    lte:
                        todayEnd,
                },

                // Respect dashboard site filters.
                siteId: {
                    in:
                        filteredSiteIds,
                },
            };

            // -----------------------------------------------------
            // CURRENTLY CHECKED-IN
            // -----------------------------------------------------
            //
            // No date restriction.
            //
            // Active check-in means:
            //
            // status      = CHECKED_IN
            // checkOutAt  = null
            //
            // DISTINCT userId makes the number a Supervisor count,
            // not a check-in-record count.
            // -----------------------------------------------------
            const activeCheckInWhere = {
                userId: {
                    in:
                        supervisorIds,
                },

                status:
                    "CHECKED_IN",

                checkOutAt:
                    null,

                // Respect dashboard site filters.
                siteId: {
                    in:
                        filteredSiteIds,
                },
            };

            // -----------------------------------------------------
            // TODAY'S RELEVANT TASKS
            // -----------------------------------------------------
            //
            // Only active Supervisor tasks scheduled today are used
            // for the Not Checked-In card.
            //
            // SCHEDULED   -> needs attendance
            // IN_PROGRESS -> needs attendance
            // COMPLETED   -> already done, do not count
            // CANCELLED   -> ignored
            // -----------------------------------------------------
            const todayTaskWhere = {
                assignedToId: {
                    in:
                        supervisorIds,
                },

                siteId: {
                    in:
                        filteredSiteIds,
                },

                scheduledAt: {
                    gte:
                        todayStart,

                    lte:
                        todayEnd,
                },

                status: {
                    in: [
                        "SCHEDULED",
                        "IN_PROGRESS",
                        "COMPLETED",
                    ],
                },

                ...buildTaskClientWhere(
                    clients
                ),
            };

            const [
                totalCheckIns,
                totalCheckedOut,
                activeCheckInUsers,
                todayTasks,
                todayAttendanceRows,
            ] =
                await Promise.all([

                    // ---------------------------------------------
                    // ALL CHECK-IN EVENTS CREATED TODAY
                    // ---------------------------------------------
                    prisma.checkInOut.count({
                        where:
                            todayCheckInWhere,
                    }),

                    // ---------------------------------------------
                    // ALL CHECK-OUT EVENTS COMPLETED TODAY
                    // ---------------------------------------------
                    prisma.checkInOut.count({
                        where:
                            checkedOutTodayWhere,
                    }),

                    // ---------------------------------------------
                    // UNIQUE SUPERVISORS CURRENTLY CHECKED-IN
                    // ---------------------------------------------
                    prisma.checkInOut.findMany({
                        where:
                            activeCheckInWhere,

                        select: {
                            userId:
                                true,
                        },

                        distinct: [
                            "userId",
                        ],
                    }),

                    // ---------------------------------------------
                    // TODAY'S SUPERVISOR TASKS
                    // ---------------------------------------------
                    prisma.task.findMany({
                        where:
                            todayTaskWhere,

                        select: {
                            id:
                                true,

                            assignedToId:
                                true,

                            siteId:
                                true,

                            status:
                                true,

                            scheduledAt:
                                true,
                        },

                        orderBy: {
                            scheduledAt:
                                "asc",
                        },
                    }),

                    // ---------------------------------------------
                    // TODAY'S ATTENDANCE BY SUPERVISOR + SITE
                    // ---------------------------------------------
                    //
                    // CheckInOut has no taskId in the current schema.
                    // Therefore task attendance is matched using the
                    // Supervisor + task site + today's check-in.
                    // ---------------------------------------------
                    prisma.checkInOut.findMany({
                        where: {
                            userId: {
                                in:
                                    supervisorIds,
                            },

                            checkInAt: {
                                gte:
                                    todayStart,

                                lte:
                                    todayEnd,
                            },

                            siteId: {
                                in:
                                    filteredSiteIds,
                            },
                        },

                        select: {
                            userId:
                                true,

                            siteId:
                                true,

                            checkInAt:
                                true,

                            checkOutAt:
                                true,

                            status:
                                true,
                        },
                    }),
                ]);

            todayCheckIns =
                totalCheckIns;

            checkedOutToday =
                totalCheckedOut;

            currentlyCheckedIn =
                activeCheckInUsers.length;

            // -----------------------------------------------------
            // BUILD ATTENDANCE LOOKUP
            // -----------------------------------------------------
            //
            // Key format:
            // supervisorId__siteId
            //
            // One Supervisor is counted only once in the final
            // Not Checked-In number, even if several tasks are pending.
            // -----------------------------------------------------
            const attendedSiteKeys =
                new Set();

            for (
                const attendance
                of todayAttendanceRows
            ) {
                const key =
                    `${attendance.userId}__${attendance.siteId}`;

                attendedSiteKeys.add(
                    key
                );
            }

            // -----------------------------------------------------
            // FIND SUPERVISORS WHO STILL NEED TO CHECK IN
            // -----------------------------------------------------
            const supervisorsNotCheckedIn =
                new Set();

            for (
                const task
                of todayTasks
            ) {
                // -----------------------------------------------
                // COMPLETED TASK
                // -----------------------------------------------
                // Already finished. Do not count as missing check-in.
                if (
                    task.status ===
                    "COMPLETED"
                ) {
                    continue;
                }

                // -----------------------------------------------
                // SCHEDULED / IN_PROGRESS TASK
                // -----------------------------------------------
                const attendanceKey =
                    `${task.assignedToId}__${task.siteId}`;

                // Supervisor has already checked in today at the
                // exact site of the task.
                if (
                    attendedSiteKeys.has(
                        attendanceKey
                    )
                ) {
                    continue;
                }

                // One Supervisor = one count, regardless of how many
                // tasks are waiting for check-in.
                supervisorsNotCheckedIn.add(
                    task.assignedToId
                );
            }

            notCheckedInCount =
                supervisorsNotCheckedIn.size;
        }

        // =====================================================
        // RECENT VISITS
        //
        // Remove duplicate task visits here too.
        // =====================================================

        const recentVisitWhere = {
            ...(selectedDateRange
                ? {
                    visitAt:
                        selectedDateRange,
                }
                : {}),

            siteId: {
                in:
                    filteredSiteIds,
            },

            ...buildClientWhere(
                clients
            ),
        };

        const rawRecentVisits =
            await prisma.visit.findMany({
                where:
                    recentVisitWhere,

                orderBy: {
                    visitAt:
                        "desc",
                },

                select: {
                    id:
                        true,

                    visitAt:
                        true,

                    status:
                        true,

                    clientName:
                        true,

                    notes:
                        true,

                    user: {
                        select: {
                            id:
                                true,

                            name:
                                true,
                        },
                    },

                    site: {
                        select: {
                            id:
                                true,

                            name:
                                true,

                            siteCode:
                                true,
                        },
                    },
                },

                take: 100,
            });

        const recentVisitRows =
            deduplicateTaskVisits(
                rawRecentVisits
            ).slice(
                0,
                5
            );

        const formattedRecentVisits =
            recentVisitRows.map(
                (visit) => {
                    let status =
                        "Pending";

                    if (
                        visit.status ===
                        "VERIFIED"
                    ) {
                        status =
                            "Verified";
                    } else if (
                        visit.status ===
                        "UNVERIFIED"
                    ) {
                        status =
                            "Unverified";
                    } else if (
                        visit.status ===
                        "REJECTED"
                    ) {
                        status =
                            "Rejected";
                    }

                    return {
                        id:
                            visit.id,

                        name:
                            visit.user
                                ?.name ||
                            "Unknown",

                        site:
                            visit.site
                                ?.name ||
                            "-",

                        siteCode:
                            visit.site
                                ?.siteCode ||
                            "-",

                        client:
                            visit.clientName ||
                            "-",

                        time:
                            new Date(
                                visit.visitAt
                            ).toLocaleTimeString(
                                "en-IN",
                                {
                                    hour:
                                        "2-digit",

                                    minute:
                                        "2-digit",

                                    second:
                                        "2-digit",
                                }
                            ),

                        status,

                        distance:
                            "-",
                    };
                }
            );

        // =====================================================
        // ALERTS
        // =====================================================

        const alerts = [];

        if (
            offlineCount >
            0
        ) {
            alerts.push({
                id:
                    "offline",

                title:
                    "Field Force Offline",

                description:
                    `${offlineCount} supervisor${offlineCount !==
                        1
                        ? "s"
                        : ""
                    } currently offline.`,

                type:
                    "danger",

                icon:
                    "WifiOff",
            });
        }

        if (
            batteryLowCount >
            0
        ) {
            alerts.push({
                id:
                    "battery",

                title:
                    "Low Battery",

                description:
                    `${batteryLowCount} device${batteryLowCount !==
                        1
                        ? "s"
                        : ""
                    } have battery below 20%.`,

                type:
                    "warning",

                icon:
                    "BatteryLow",
            });
        }

        if (
            pendingVisitVerification >
            0
        ) {
            alerts.push({
                id:
                    "visit-verification",

                title:
                    "Visits Pending Verification",

                description:
                    `${pendingVisitVerification} visit${pendingVisitVerification !==
                        1
                        ? "s"
                        : ""
                    } waiting for verification.`,

                type:
                    "warning",

                icon:
                    "AlertTriangle",
            });
        }

        if (
            verificationPending >
            0
        ) {
            alerts.push({
                id:
                    "audit-verification",

                title:
                    "Audits Pending Verification",

                description:
                    `${verificationPending} audit${verificationPending !==
                        1
                        ? "s"
                        : ""
                    } waiting for Admin verification.`,

                type:
                    "warning",

                icon:
                    "AlertTriangle",
            });
        }

        if (
            notCheckedInCount >
            0
        ) {
            alerts.push({
                id:
                    "checkin",

                title:
                    "Not Checked In",

                description:
                    `${notCheckedInCount} supervisor${notCheckedInCount !==
                        1
                        ? "s"
                        : ""
                    } have not checked in today.`,

                type:
                    "danger",

                icon:
                    "LogIn",
            });
        }

        if (
            pendingTasks >
            0
        ) {
            alerts.push({
                id:
                    "pending-tasks",

                title:
                    "Pending Tasks",

                description:
                    `${pendingTasks} task${pendingTasks !==
                        1
                        ? "s"
                        : ""
                    } are still pending.`,

                type:
                    "warning",

                icon:
                    "AlertTriangle",
            });
        }

        // =====================================================
        // FINAL RESPONSE
        // =====================================================

        return res.status(200).json({
            success:
                true,

            data: {

                // =========================================
                // FILTERS
                // =========================================

                filters:
                    filterOptions,

                // =========================================
                // AUDIT
                // =========================================

                summary: {
                    totalAudits:
                        totalAudits,

                    totalVerified:
                        totalVerified,

                    rejectedAudits:
                        rejectedAudits,

                    verificationPending:
                        verificationPending,
                },

                // =========================================
                // SITE VISITS
                // =========================================

                charts: {

                    currentMonth: [
                        {
                            name:
                                "VISITED",

                            value:
                                currentVisited,
                        },

                        {
                            name:
                                "NOT-VISITED",

                            value:
                                currentNotVisited,
                        },
                    ],

                    lastMonth: [
                        {
                            name:
                                "VISITED",

                            value:
                                lastVisited,
                        },

                        {
                            name:
                                "NOT-VISITED",

                            value:
                                lastNotVisited,
                        },
                    ],
                },

                // =========================================
                // SUPERVISORS
                // =========================================

                fieldForce: {

                    total:
                        supervisors.length,

                    online:
                        onlineCount,

                    offline:
                        offlineCount,

                    batteryLow:
                        batteryLowCount,
                },

                // =========================================
                // VISITS
                // =========================================

                visits: {

                    today:
                        todayVisits,

                    completed:
                        verifiedVisits,

                    pending:
                        pendingVisitVerification,

                    unverified:
                        unverifiedVisits,
                },

                // =========================================
                // CHECK-IN / CHECK-OUT
                // =========================================

                checkIns: {

                    today:
                        todayCheckIns,

                    checkedOut:
                        checkedOutToday,

                    currentlyCheckedIn:
                        currentlyCheckedIn,

                    notCheckedIn:
                        notCheckedInCount,
                },

                // =========================================
                // TASKS
                // =========================================

                tasks: {

                    total:
                        totalTasks,

                    assigned:
                        assignedTasks,

                    pending:
                        pendingTasks,

                    inProgress:
                        inProgressTasks,

                    completed:
                        completedTasks,
                },

                // =========================================
                // RECENT VISITS
                // =========================================

                recentVisits:
                    formattedRecentVisits,

                // =========================================
                // ALERTS
                // =========================================

                alerts,
            },
        });

    } catch (error) {

        console.error(
            "========================================"
        );

        console.error(
            "DASHBOARD ERROR"
        );

        console.error(
            error
        );

        console.error(
            "========================================"
        );

        return res.status(500).json({
            success:
                false,

            message:
                error?.message ||
                "Failed to load dashboard",
        });
    }
};


// ============================================================
// DASHBOARD SITE VISIT LIST
// Returns the active sites represented by a dashboard chart slice.
// The filters and month boundaries mirror the dashboard chart logic.
// ============================================================
const getDashboardSiteVisits = async (req, res) => {
    try {
        const {
            period = "current",
            status = "VISITED",
            regions: regionsParam,
            branches: branchesParam,
            clients: clientsParam,
        } = req.query;

        const normalizedPeriod = String(period).toLowerCase();
        const normalizedStatus = String(status).toUpperCase();

        if (!["current", "last"].includes(normalizedPeriod)) {
            return res.status(400).json({
                success: false,
                message: "Invalid period. Use current or last.",
            });
        }

        if (!["VISITED", "NOT-VISITED"].includes(normalizedStatus)) {
            return res.status(400).json({
                success: false,
                message: "Invalid status. Use VISITED or NOT-VISITED.",
            });
        }

        const regions = parseList(regionsParam);
        const branches = parseList(branchesParam);
        const clients = parseList(clientsParam);

        const siteWhere = buildSiteWhere({ regions, branches });
        const activeSites = await prisma.site.findMany({
            where: siteWhere,
            select: { id: true },
        });

        let filteredSiteIds = activeSites.map((site) => site.id);

        // Keep the same client-to-site filtering used by the dashboard charts.
        if (clients !== null) {
            if (clients.length === 0) {
                filteredSiteIds = [];
            } else {
                const clientSiteRows = await prisma.visit.findMany({
                    where: { clientName: { in: clients } },
                    select: { siteId: true },
                    distinct: ["siteId"],
                });
                const clientSiteIds = new Set(clientSiteRows.map((row) => row.siteId));
                filteredSiteIds = filteredSiteIds.filter((siteId) => clientSiteIds.has(siteId));
            }
        }

        if (filteredSiteIds.length === 0) {
            return res.status(200).json({
                success: true,
                data: {
                    sites: [],
                    count: 0,
                    period: normalizedPeriod,
                    status: normalizedStatus,
                },
            });
        }

        const monthRange = getMonthRange(normalizedPeriod === "current" ? 0 : -1);
        const monthlyVisits = await prisma.visit.findMany({
            where: {
                visitAt: {
                    gte: monthRange.start,
                    lte: monthRange.end,
                },
                siteId: { in: filteredSiteIds },
                ...buildClientWhere(clients),
            },
            select: {
                siteId: true,
                visitAt: true,
                branch: true,
                region: true,
                clientName: true,
                user: { select: { name: true } },
            },
            orderBy: { visitAt: "desc" },
        });

        const monthlyVisitBySite = new Map();
        for (const visit of monthlyVisits) {
            if (!monthlyVisitBySite.has(visit.siteId)) {
                monthlyVisitBySite.set(visit.siteId, visit);
            }
        }

        const visitedSiteIds = new Set(monthlyVisitBySite.keys());
        const targetSiteIds = normalizedStatus === "VISITED"
            ? [...visitedSiteIds]
            : filteredSiteIds.filter((siteId) => !visitedSiteIds.has(siteId));

        if (targetSiteIds.length === 0) {
            return res.status(200).json({
                success: true,
                data: {
                    sites: [],
                    count: 0,
                    period: normalizedPeriod,
                    status: normalizedStatus,
                },
            });
        }

        const sites = await prisma.site.findMany({
            where: { id: { in: targetSiteIds } },
            select: {
                id: true,
                name: true,
                siteCode: true,
                address: true,
                city: true,
                state: true,
                pincode: true,
                clientName: true,
                users: {
                    where: { status: "ACTIVE", role: "SUPERVISOR" },
                    select: { name: true },
                    orderBy: { name: "asc" },
                },
                visits: {
                    take: 1,
                    orderBy: { visitAt: "desc" },
                    select: {
                        branch: true,
                        region: true,
                        clientName: true,
                        user: { select: { name: true } },
                    },
                },
            },
            orderBy: { name: "asc" },
        });

        const data = sites.map((site) => {
            const monthVisit = monthlyVisitBySite.get(site.id);
            const latestVisit = site.visits?.[0];
            const assignedOwners = (site.users || [])
                .map((user) => user.name)
                .filter(Boolean);

            return {
                id: site.id,
                siteId: site.siteCode || "—",
                siteName: site.name || "—",
                address: [site.address, site.pincode].filter(Boolean).join(", ") || "—",
                branch: monthVisit?.branch || latestVisit?.branch || site.city || "—",
                region: monthVisit?.region || latestVisit?.region || "—",
                clientName: site.clientName || monthVisit?.clientName || latestVisit?.clientName || "—",
                siteOwner: assignedOwners.join(", ") || monthVisit?.user?.name || latestVisit?.user?.name || "—",
                state: site.state || "—",
            };
        });

        return res.status(200).json({
            success: true,
            data: {
                sites: data,
                count: data.length,
                period: normalizedPeriod,
                status: normalizedStatus,
            },
        });
    } catch (error) {
        console.error("Dashboard site visit list error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to load dashboard site visit list.",
        });
    }
};

export {
    getDashboard,
    getDashboardSiteVisits,
};