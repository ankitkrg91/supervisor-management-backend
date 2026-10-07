import prisma from "../config/prisma.js";

/* =========================================================
   HELPERS
========================================================= */

const parseDateStart = (value) => {
    if (!value) {
        return null;
    }

    const date = new Date(
        `${value}T00:00:00.000Z`
    );

    return Number.isNaN(date.getTime())
        ? null
        : date;
};

const parseDateEnd = (value) => {
    if (!value) {
        return null;
    }

    const date = new Date(
        `${value}T23:59:59.999Z`
    );

    return Number.isNaN(date.getTime())
        ? null
        : date;
};

const formatDate = (value) => {
    if (!value) {
        return "-";
    }

    return new Date(value).toLocaleDateString(
        "en-IN"
    );
};

const formatTime = (value) => {
    if (!value) {
        return "-";
    }

    return new Date(value).toLocaleTimeString(
        "en-IN",
        {
            hour: "2-digit",
            minute: "2-digit",
        }
    );
};

const extractDescriptionValue = (
    description,
    label
) => {
    if (!description) {
        return "";
    }

    const lines = description.split("\n");

    const line = lines.find((item) =>
        item
            .trim()
            .toLowerCase()
            .startsWith(
                `${label.toLowerCase()}:`
            )
    );

    if (!line) {
        return "";
    }

    return line
        .split(":")
        .slice(1)
        .join(":")
        .trim();
};

const getTaskType = (task) => {
    return (
        extractDescriptionValue(
            task.description,
            "Type"
        ) ||
        task.title ||
        "Task"
    );
};

const getTaskClient = (task) => {
    return (
        extractDescriptionValue(
            task.description,
            "Client"
        ) || "-"
    );
};

const getTaskStatus = (task) => {
    if (
        task.status === "SCHEDULED" &&
        new Date(task.scheduledAt) < new Date()
    ) {
        return "Missed";
    }

    if (task.status === "IN_PROGRESS") {
        return "In Progress";
    }

    if (task.status === "COMPLETED") {
        return "Completed";
    }

    if (task.status === "CANCELLED") {
        return "Cancelled";
    }

    return "Pending";
};

const getRegion = (site) => {
    return site?.state || "-";
};

const getBranch = (site) => {
    return site?.city || "-";
};

const normalizeSearch = (value) =>
    typeof value === "string"
        ? value.trim().toLowerCase()
        : "";

const matchesSearch = (
    row,
    search
) => {
    if (!search) {
        return true;
    }

    return [
        row.date,
        row.user,
        row.client,
        row.site,
        row.type,
        row.status,
        row.distance,
    ]
        .join(" ")
        .toLowerCase()
        .includes(search);
};

const matchesCommonFilters = (
    row,
    {
        fromDate,
        toDate,
        region,
        branch,
        client,
        user,
        search,
    }
) => {
    if (
        fromDate &&
        row.rawDate &&
        new Date(row.rawDate) < fromDate
    ) {
        return false;
    }

    if (
        toDate &&
        row.rawDate &&
        new Date(row.rawDate) > toDate
    ) {
        return false;
    }

    if (
        region &&
        region !== "All Regions" &&
        row.region !== region
    ) {
        return false;
    }

    if (
        branch &&
        branch !== "All Branches" &&
        row.branch !== branch
    ) {
        return false;
    }

    if (
        client &&
        client !== "All Clients" &&
        row.client !== client
    ) {
        return false;
    }

    if (
        user &&
        user !== "All Users" &&
        row.user !== user
    ) {
        return false;
    }

    return matchesSearch(
        row,
        search
    );
};

/* =========================================================
   TASK REPORT
========================================================= */

const buildTaskReport = async () => {
    const tasks =
        await prisma.task.findMany({
            include: {
                assignedTo: {
                    select: {
                        id: true,
                        name: true,
                        phone: true,
                    },
                },

                site: {
                    select: {
                        id: true,
                        name: true,
                        city: true,
                        state: true,
                    },
                },
            },

            orderBy: {
                scheduledAt: "desc",
            },
        });

    return tasks.map((task) => ({
        id: task.id,

        rawDate: task.scheduledAt,

        date: formatDate(
            task.scheduledAt
        ),

        user:
            task.assignedTo?.name ||
            "-",

        client:
            getTaskClient(task),

        site:
            task.site?.name ||
            "-",

        type:
            getTaskType(task),

        status:
            getTaskStatus(task),

        checkIn: "-",

        checkOut: "-",

        distance: "0.00",

        region:
            getRegion(task.site),

        branch:
            getBranch(task.site),
    }));
};

/* =========================================================
   VISIT REPORT
========================================================= */

const buildVisitReport = async () => {
    const visits =
        await prisma.visit.findMany({
            include: {
                user: {
                    select: {
                        id: true,
                        name: true,
                        phone: true,
                    },
                },

                site: {
                    select: {
                        id: true,
                        name: true,
                        city: true,
                        state: true,
                    },
                },
            },

            orderBy: {
                visitAt: "desc",
            },
        });

    return visits.map((visit) => ({
        id: visit.id,

        rawDate: visit.visitAt,

        date: formatDate(
            visit.visitAt
        ),

        user:
            visit.user?.name ||
            "-",

        client:
            visit.clientName ||
            "-",

        site:
            visit.site?.name ||
            "-",

        type:
            visit.reportType ||
            "Visit",

        status:
            visit.status,

        checkIn: "-",

        checkOut: "-",

        distance: "0.00",

        region:
            getRegion(visit.site),

        branch:
            getBranch(visit.site),
    }));
};

/* =========================================================
   AUDIT REPORT
========================================================= */

const buildAuditReport = async () => {
    const submissions =
        await prisma.auditSubmission.findMany({
            include: {
                visit: {
                    include: {
                        user: {
                            select: {
                                id: true,
                                name: true,
                                phone: true,
                            },
                        },

                        site: {
                            select: {
                                id: true,
                                name: true,
                                city: true,
                                state: true,
                            },
                        },
                    },
                },

                template: {
                    select: {
                        id: true,
                        name: true,
                    },
                },
            },

            orderBy: {
                submittedAt: "desc",
            },
        });

    return submissions.map(
        (submission) => {
            const visit =
                submission.visit;

            return {
                id:
                    submission.id,

                // Added for Audit Details drill-down
                visitId:
                    visit?.id || null,

                rawDate:
                    submission.submittedAt,

                date:
                    formatDate(
                        submission.submittedAt
                    ),

                user:
                    visit?.user?.name ||
                    "-",

                client:
                    visit?.clientName ||
                    "-",

                site:
                    visit?.site?.name ||
                    "-",

                type:
                    submission
                        ?.template
                        ?.name ||
                    "Audit",

                status:
                    visit?.status ||
                    "PENDING",

                checkIn: "-",

                checkOut: "-",

                distance: "0.00",

                region:
                    getRegion(
                        visit?.site
                    ),

                branch:
                    getBranch(
                        visit?.site
                    ),
            };
        }
    );
};

/* =========================================================
   CHECK-IN / CHECK-OUT REPORT
========================================================= */

const buildCheckInReport =
    async () => {
        const checkIns =
            await prisma.checkInOut.findMany(
                {
                    include: {
                        user: {
                            select: {
                                id: true,
                                name: true,
                                phone: true,
                            },
                        },

                        site: {
                            select: {
                                id: true,
                                name: true,
                                city: true,
                                state: true,
                            },
                        },
                    },

                    orderBy: {
                        checkInAt: "desc",
                    },
                }
            );

        return checkIns.map(
            (checkIn) => ({
                id: checkIn.id,

                rawDate:
                    checkIn.checkInAt,

                date:
                    formatDate(
                        checkIn.checkInAt
                    ),

                user:
                    checkIn.user?.name ||
                    "-",

                client: "-",

                site:
                    checkIn.site?.name ||
                    "-",

                type:
                    "Field Visit",

                status:
                    "Present",

                checkIn:
                    formatTime(
                        checkIn.checkInAt
                    ),

                checkOut:
                    formatTime(
                        checkIn.checkOutAt
                    ),

                distance:
                    Number(
                        checkIn.distanceTravelled ||
                        0
                    ).toFixed(2),

                region:
                    getRegion(
                        checkIn.site
                    ),

                branch:
                    getBranch(
                        checkIn.site
                    ),
            })
        );
    };

/* =========================================================
   FIELD FORCE PERFORMANCE
========================================================= */

const buildPerformanceReport =
    async () => {
        const supervisors =
            await prisma.user.findMany({
                where: {
                    role: "SUPERVISOR",
                },

                select: {
                    id: true,
                    name: true,
                    phone: true,

                    site: {
                        select: {
                            id: true,
                            name: true,
                            city: true,
                            state: true,
                        },
                    },

                    assignedTasks: {
                        select: {
                            id: true,
                            status: true,
                            scheduledAt: true,
                        },
                    },

                    checkIns: {
                        select: {
                            checkInAt: true,
                            checkOutAt: true,
                            distanceTravelled:
                                true,
                        },
                    },
                },
            });

        return supervisors.map(
            (supervisor) => {
                const tasks =
                    supervisor.assignedTasks ||
                    [];

                const completed =
                    tasks.filter(
                        (task) =>
                            task.status ===
                            "COMPLETED"
                    ).length;

                const total =
                    tasks.length;

                const percentage =
                    total > 0
                        ? Math.round(
                            (
                                completed /
                                total
                            ) *
                            100
                        )
                        : 0;

                const checkIns =
                    supervisor.checkIns ||
                    [];

                const sortedCheckIns =
                    [...checkIns].sort(
                        (a, b) =>
                            new Date(
                                a.checkInAt
                            ) -
                            new Date(
                                b.checkInAt
                            )
                    );

                const firstCheckIn =
                    sortedCheckIns[0];

                const lastCheckIn =
                    sortedCheckIns[
                    sortedCheckIns.length - 1
                    ];

                const totalDistance =
                    checkIns.reduce(
                        (
                            sum,
                            item
                        ) =>
                            sum +
                            Number(
                                item.distanceTravelled ||
                                0
                            ),
                        0
                    );

                return {
                    id:
                        supervisor.id,

                    rawDate:
                        firstCheckIn
                            ?.checkInAt ||
                        null,

                    date:
                        firstCheckIn
                            ?.checkInAt
                            ? formatDate(
                                firstCheckIn.checkInAt
                            )
                            : "-",

                    user:
                        supervisor.name,

                    client:
                        "All Clients",

                    site:
                        supervisor
                            .site
                            ?.name ||
                        "-",

                    type:
                        `${total} Tasks`,

                    status:
                        `${percentage}% Complete`,

                    checkIn:
                        firstCheckIn
                            ?.checkInAt
                            ? formatTime(
                                firstCheckIn.checkInAt
                            )
                            : "-",

                    checkOut:
                        lastCheckIn
                            ?.checkOutAt
                            ? formatTime(
                                lastCheckIn.checkOutAt
                            )
                            : "-",

                    distance:
                        totalDistance.toFixed(
                            2
                        ),

                    region:
                        getRegion(
                            supervisor.site
                        ),

                    branch:
                        getBranch(
                            supervisor.site
                        ),
                };
            }
        );
    };

/* =========================================================
   DISTANCE REPORT
========================================================= */

const calculateDistanceKm = (
    latitude1,
    longitude1,
    latitude2,
    longitude2
) => {
    const earthRadiusKm =
        6371;

    const toRadians = (
        degrees
    ) =>
        (degrees * Math.PI) /
        180;

    const lat1 =
        toRadians(latitude1);

    const lat2 =
        toRadians(latitude2);

    const deltaLat =
        toRadians(
            latitude2 -
            latitude1
        );

    const deltaLon =
        toRadians(
            longitude2 -
            longitude1
        );

    const a =
        Math.sin(deltaLat / 2) **
        2 +
        Math.cos(lat1) *
        Math.cos(lat2) *
        Math.sin(
            deltaLon / 2
        ) **
        2;

    const c =
        2 *
        Math.atan2(
            Math.sqrt(a),
            Math.sqrt(1 - a)
        );

    return (
        earthRadiusKm * c
    );
};

const buildDistanceReport =
    async () => {
        const supervisors =
            await prisma.user.findMany(
                {
                    where: {
                        role: "SUPERVISOR",
                    },

                    select: {
                        id: true,
                        name: true,
                        phone: true,

                        site: {
                            select: {
                                id: true,
                                name: true,
                                city: true,
                                state: true,
                            },
                        },
                    },
                }
            );

        const userIds =
            supervisors.map(
                (user) => user.id
            );

        const logs =
            userIds.length > 0
                ? await prisma.locationLog.findMany(
                    {
                        where: {
                            userId: {
                                in: userIds,
                            },
                        },

                        select: {
                            userId: true,
                            latitude: true,
                            longitude: true,
                            recordedAt: true,
                        },

                        orderBy: {
                            recordedAt:
                                "asc",
                        },
                    }
                )
                : [];

        const logsByUser =
            new Map();

        for (const log of logs) {
            if (
                !logsByUser.has(
                    log.userId
                )
            ) {
                logsByUser.set(
                    log.userId,
                    []
                );
            }

            logsByUser
                .get(log.userId)
                .push(log);
        }

        return supervisors.map(
            (supervisor) => {
                const points =
                    logsByUser.get(
                        supervisor.id
                    ) || [];

                let distance = 0;

                for (
                    let index = 1;
                    index < points.length;
                    index++
                ) {
                    distance +=
                        calculateDistanceKm(
                            points[index - 1]
                                .latitude,
                            points[index - 1]
                                .longitude,
                            points[index]
                                .latitude,
                            points[index]
                                .longitude
                        );
                }

                return {
                    id:
                        supervisor.id,

                    rawDate:
                        points[0]
                            ?.recordedAt ||
                        null,

                    date:
                        points[0]
                            ?.recordedAt
                            ? formatDate(
                                points[0]
                                    .recordedAt
                            )
                            : "-",

                    user:
                        supervisor.name,

                    client: "-",

                    site:
                        supervisor
                            .site?.name ||
                        "-",

                    type: "Travel",

                    status:
                        points.length > 0
                            ? "Tracked"
                            : "No GPS",

                    checkIn: "-",

                    checkOut: "-",

                    distance:
                        distance.toFixed(
                            2
                        ),

                    region:
                        getRegion(
                            supervisor.site
                        ),

                    branch:
                        getBranch(
                            supervisor.site
                        ),
                };
            }
        );
    };

/* =========================================================
   GET REPORT
========================================================= */

const getReport = async (
    req,
    res
) => {
    try {
        const {
            type = "Task Report",
            fromDate,
            toDate,
            region = "",
            branch = "",
            client = "",
            user = "",
            search = "",
            page = 1,
            limit = 10,
        } = req.query;

        const validTypes = [
            "Task Report",
            "Visit Report",
            "Audit Report",
            "Check-In / Check-Out Report",
            "Field Force Performance",
            "Distance Report",
        ];

        if (
            !validTypes.includes(
                type
            )
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "Invalid report type",
            });
        }

        const startDate =
            parseDateStart(
                fromDate
            );

        const endDate =
            parseDateEnd(
                toDate
            );

        if (
            fromDate &&
            !startDate
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "Invalid from date",
            });
        }

        if (
            toDate &&
            !endDate
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "Invalid to date",
            });
        }

        if (
            startDate &&
            endDate &&
            endDate < startDate
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "To date cannot be before from date",
            });
        }

        const currentPage =
            Math.max(
                Number(page) || 1,
                1
            );

        const perPage =
            Math.min(
                Math.max(
                    Number(limit) ||
                    10,
                    1
                ),
                100
            );

        const filters = {
            fromDate:
                startDate,

            toDate:
                endDate,

            region:
                typeof region === "string"
                    ? region
                    : "",

            branch:
                typeof branch === "string"
                    ? branch
                    : "",

            client:
                typeof client === "string"
                    ? client
                    : "",

            user:
                typeof user === "string"
                    ? user
                    : "",

            search:
                normalizeSearch(
                    search
                ),
        };

        let rows = [];

        if (
            type === "Task Report"
        ) {
            rows =
                await buildTaskReport();
        }

        if (
            type === "Visit Report"
        ) {
            rows =
                await buildVisitReport();
        }

        if (
            type === "Audit Report"
        ) {
            rows =
                await buildAuditReport();
        }

        if (
            type ===
            "Check-In / Check-Out Report"
        ) {
            rows =
                await buildCheckInReport();
        }

        if (
            type ===
            "Field Force Performance"
        ) {
            rows =
                await buildPerformanceReport();
        }

        if (
            type ===
            "Distance Report"
        ) {
            rows =
                await buildDistanceReport();
        }

        const filteredRows =
            rows.filter((row) =>
                matchesCommonFilters(
                    row,
                    filters
                )
            );

        const completedCount =
            filteredRows.filter(
                (row) =>
                    [
                        "Completed",
                        "Verified",
                        "Present",
                        "Tracked",
                    ].includes(
                        row.status
                    ) ||
                    row.status
                        ?.includes(
                            "% Complete"
                        )
            ).length;

        const pendingCount =
            filteredRows.filter(
                (row) =>
                    [
                        "Pending",
                        "Unverified",
                        "In Progress",
                    ].includes(
                        row.status
                    )
            ).length;

        const missedCount =
            filteredRows.filter(
                (row) =>
                    row.status ===
                    "Missed"
            ).length;

        const totalDistance =
            filteredRows.reduce(
                (sum, row) =>
                    sum +
                    Number(
                        row.distance ||
                        0
                    ),
                0
            );

        const uniqueRegions =
            [
                ...new Set(
                    rows
                        .map(
                            (row) =>
                                row.region
                        )
                        .filter(
                            Boolean
                        )
                ),
            ].sort();

        const uniqueBranches =
            [
                ...new Set(
                    rows
                        .map(
                            (row) =>
                                row.branch
                        )
                        .filter(
                            Boolean
                        )
                ),
            ].sort();

        const uniqueClients =
            [
                ...new Set(
                    rows
                        .map(
                            (row) =>
                                row.client
                        )
                        .filter(
                            (value) =>
                                value &&
                                value !== "-"
                        )
                ),
            ].sort();

        const uniqueUsers =
            [
                ...new Set(
                    rows
                        .map(
                            (row) =>
                                row.user
                        )
                        .filter(
                            Boolean
                        )
                ),
            ].sort();

        const total =
            filteredRows.length;

        const totalPages =
            Math.ceil(
                total / perPage
            );

        const safePage =
            totalPages > 0
                ? Math.min(
                    currentPage,
                    totalPages
                )
                : 1;

        const startIndex =
            (safePage - 1) *
            perPage;

        const paginatedRows =
            filteredRows.slice(
                startIndex,
                startIndex +
                perPage
            );

        return res.status(200).json({
            success: true,

            data: {
                reportType: type,

                rows:
                    paginatedRows,

                summary: {
                    totalRecords:
                        total,

                    completed:
                        completedCount,

                    pending:
                        pendingCount,

                    missed:
                        missedCount,

                    totalDistance:
                        Number(
                            totalDistance.toFixed(
                                2
                            )
                        ),
                },

                filters: {
                    regions:
                        uniqueRegions,

                    branches:
                        uniqueBranches,

                    clients:
                        uniqueClients,

                    users:
                        uniqueUsers,
                },

                pagination: {
                    page: safePage,
                    limit: perPage,
                    total,
                    totalPages,
                },
            },
        });
    } catch (error) {
        console.error(
            "Get report error:",
            error
        );

        return res.status(500).json({
            success: false,
            message:
                "Failed to generate report",
        });
    }
};

export {
    getReport,
};