import prisma from "../config/prisma.js";

/* =========================================================
   HELPERS
========================================================= */

const REPORT_TIME_ZONE = "Asia/Kolkata";

const parseDateStart = (value) => {
    if (!value) return null;
    const date = new Date(`${value}T00:00:00+05:30`);
    return Number.isNaN(date.getTime()) ? null : date;
};

const parseDateEnd = (value) => {
    if (!value) return null;
    const date = new Date(`${value}T23:59:59.999+05:30`);
    return Number.isNaN(date.getTime()) ? null : date;
};

const formatDate = (value) => {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "-";
    return date.toLocaleDateString("en-IN", {
        timeZone: REPORT_TIME_ZONE,
        day: "2-digit",
        month: "short",
        year: "numeric",
    });
};

const formatTime = (value) => {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "-";
    return date.toLocaleTimeString("en-IN", {
        timeZone: REPORT_TIME_ZONE,
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
    });
};

const formatDateTime = (value) => {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "-";
    return date.toLocaleString("en-IN", {
        timeZone: REPORT_TIME_ZONE,
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
    });
};

const extractDescriptionValue = (
    description,
    label
) => {
    if (!description) {
        return "";
    }

    const lines =
        String(description).split("\n");

    const line = lines.find((item) =>
        item
            .trim()
            .toLowerCase()
            .startsWith(
                `${String(label).toLowerCase()}:`
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

/* =========================================================
   TASK HELPERS
========================================================= */

const getTaskClient = (task) => (
    extractDescriptionValue(task?.description, "Client") ||
    task?.site?.clientName ||
    "-"
);

// Client email is sourced only from the task/site client fields or task description.
// It must never fall back to the supervisor's email.
const getTaskClientEmail = (task) => {
    const databaseEmail = typeof task?.clientEmail === "string"
        ? task.clientEmail.trim()
        : "";
    const siteEmail = typeof task?.site?.clientEmail === "string"
        ? task.site.clientEmail.trim()
        : "";
    const descriptionEmail = extractDescriptionValue(task?.description, "Client Email").trim();
    return databaseEmail || siteEmail || descriptionEmail || "-";
};

const getTaskAddress = (task) => {
    const street = extractDescriptionValue(task?.description, "Address") || task?.site?.address || "";
    const parts = [street, task?.site?.city, task?.site?.state, task?.site?.pincode]
        .filter(Boolean)
        .filter((value, index, values) => values.findIndex((item) => String(item).trim().toLowerCase() === String(value).trim().toLowerCase()) === index);
    return parts.join(", ") || "-";
};

const getTaskType = (task) => (
    extractDescriptionValue(task?.description, "Type") ||
    extractDescriptionValue(task?.description, "Category") ||
    task?.title ||
    "Task"
);

const parseScheduleRange = (description) => {
    const match = String(description || "").match(/Schedule range:\s*(\d{4}-\d{2}-\d{2})\s+to\s+(\d{4}-\d{2}-\d{2})/i);
    return match ? { start: match[1], end: match[2] } : null;
};

const parseIndiaDate = (dateText, timeSource = null, endOfDay = false) => {
    if (!dateText) return null;
    const time = timeSource instanceof Date && !Number.isNaN(timeSource.getTime())
        ? timeSource.toLocaleTimeString("en-GB", { timeZone: REPORT_TIME_ZONE, hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" })
        : "00:00:00";
    const date = new Date(`${dateText}T${endOfDay ? "23:59:59.999" : time}${endOfDay ? "+05:30" : "+05:30"}`);
    return Number.isNaN(date.getTime()) ? null : date;
};

const getTaskScheduleInfo = (task) => {
    const scheduledAt = task?.scheduledAt ? new Date(task.scheduledAt) : null;
    const validScheduledAt = scheduledAt && !Number.isNaN(scheduledAt.getTime()) ? scheduledAt : null;
    const range = parseScheduleRange(task?.description);
    const wholeDay = task?.wholeDay === true || /Scheduled for whole day\./i.test(String(task?.description || ""));

    const startAt = range
        ? parseIndiaDate(range.start, validScheduledAt, false)
        : validScheduledAt;
    const scheduledDateInIndia = validScheduledAt
        ? new Intl.DateTimeFormat("en-CA", {
            timeZone: REPORT_TIME_ZONE,
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
        }).format(validScheduledAt)
        : null;
    const dueAt = range
        ? parseIndiaDate(range.end, validScheduledAt, wholeDay)
        : (wholeDay && scheduledDateInIndia
            ? parseIndiaDate(scheduledDateInIndia, null, true)
            : validScheduledAt);

    return {
        startAt,
        dueAt,
        wholeDay,
        scheduledDate: formatDate(startAt),
        scheduledTime: wholeDay ? "Whole Day" : formatTime(startAt),
        dueDate: formatDate(dueAt),
        dueTime: wholeDay ? "End of day" : formatTime(dueAt),
    };
};

const getTaskStatus = (task, scheduleInfo = getTaskScheduleInfo(task)) => {
    const status = String(task?.status || "SCHEDULED").toUpperCase();
    if (status === "COMPLETED") return "Completed";
    if (status === "IN_PROGRESS") return "In Progress";
    if (status === "CANCELLED") return "Cancelled";
    if (status === "SCHEDULED" && scheduleInfo.dueAt && scheduleInfo.dueAt.getTime() < Date.now()) {
        return "Missed";
    }
    return "Pending";
};

/* =========================================================
   VISIT / AUDIT HELPERS
========================================================= */

const getRegion = (site) => site?.state || "-";
const getBranch = (site) => site?.city || "-";

const getSiteAddress = (site) => [
    site?.address,
    site?.city,
    site?.state,
    site?.pincode,
].filter(Boolean).join(", ") || "-";

const getMapUrl = (latitude, longitude, address) => {
    const lat = Number(latitude);
    const lng = Number(longitude);
    if (Number.isFinite(lat) && Number.isFinite(lng) && (lat !== 0 || lng !== 0)) {
        return `https://www.google.com/maps?q=${lat},${lng}`;
    }
    if (address && address !== "-") {
        return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
    }
    return null;
};

const getTaskIdFromVisit = (visit) => {
    const notes = String(visit?.notes || "");
    const match = notes.match(/Task ID:\s*([a-f0-9-]{36})/i);
    return match?.[1] || null;
};

const getSiteEvidence = (notes) => {
    const match = String(notes || "").match(/\[SITE_EVIDENCE\]:\s*(\{[\s\S]*?\})/);
    if (!match) return {};
    try { return JSON.parse(match[1]); } catch { return {}; }
};

const normalizeVisitStatus = (status) => {
    const value = String(status || "PENDING").toUpperCase();
    if (value === "VERIFIED") return "Verified";
    if (value === "UNVERIFIED" || value === "REJECTED") return "Unverified";
    return "Pending Review";
};

/* =========================================================
   SEARCH
========================================================= */

const normalizeSearch = (value) => {
    return typeof value === "string"
        ? value.trim().toLowerCase()
        : "";
};

const matchesSearch = (
    row,
    search
) => {
    if (!search) {
        return true;
    }

    return [
        row?.date,
        row?.user,
        row?.client,
        row?.clientEmail,
        row?.site,
        row?.type,
        row?.status,
        row?.distance,
        row?.taskId,
        row?.taskTitle,
        row?.taskType,
        row?.createdBy,
        row?.address,
        row?.scheduledDate,
        row?.dueDate,
        row?.visitStatus,
        row?.checkInStatus,
    ]
        .join(" ")
        .toLowerCase()
        .includes(search);
};

/* =========================================================
   COMMON FILTERS
========================================================= */

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
        row?.rawDate &&
        new Date(row.rawDate) <
        fromDate
    ) {
        return false;
    }

    if (
        toDate &&
        row?.rawDate &&
        new Date(row.rawDate) >
        toDate
    ) {
        return false;
    }

    if (
        region &&
        region !== "All Regions" &&
        row?.region !== region
    ) {
        return false;
    }

    if (
        branch &&
        branch !== "All Branches" &&
        row?.branch !== branch
    ) {
        return false;
    }

    if (
        client &&
        client !== "All Clients" &&
        row?.client !== client
    ) {
        return false;
    }

    if (
        user &&
        user !== "All Users" &&
        row?.user !== user
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
    const tasks = await prisma.task.findMany({
        include: {
            assignedTo: { select: { id: true, name: true, phone: true, email: true } },
            assignedBy: { select: { id: true, name: true } },
            site: {
                select: {
                    id: true, name: true, siteCode: true, clientName: true,
                    clientEmail: true, address: true, city: true, state: true,
                    pincode: true, latitude: true, longitude: true,
                },
            },
        },
        orderBy: { createdAt: "desc" },
    });

    return tasks.map((task) => {
        const schedule = getTaskScheduleInfo(task);
        const address = getTaskAddress(task) !== "-" ? getTaskAddress(task) : getSiteAddress(task.site);
        const mapUrl = getMapUrl(task.site?.latitude, task.site?.longitude, address);
        return {
            id: task.id,
            taskId: task.id,
            rawDate: task.createdAt || task.scheduledAt,
            date: formatDate(task.createdAt || task.scheduledAt),
            createdAt: task.createdAt,
            createdDate: formatDate(task.createdAt),
            createdTime: formatTime(task.createdAt),
            createdBy: task.assignedBy?.name || "-",
            user: task.assignedTo?.name || "-",
            supervisorId: task.assignedTo?.id || null,
            supervisorPhone: task.assignedTo?.phone || "-",
            supervisorEmail: task.assignedTo?.email || "-",
            client: getTaskClient(task),
            clientEmail: getTaskClientEmail(task),
            site: task.site?.name || "-",
            siteCode: task.site?.siteCode || "-",
            address,
            latitude: task.site?.latitude ?? null,
            longitude: task.site?.longitude ?? null,
            mapUrl,
            type: getTaskType(task),
            taskType: getTaskType(task),
            taskTitle: task.title || "-",
            priority: task.priority || "MEDIUM",
            status: getTaskStatus(task, schedule),
            rawStatus: task.status,
            scheduledAt: task.scheduledAt,
            scheduledDate: schedule.scheduledDate,
            scheduledTime: schedule.scheduledTime,
            dueAt: schedule.dueAt,
            dueDate: schedule.dueDate,
            dueTime: schedule.dueTime,
            completedAt: task.completedAt,
            completedDateTime: formatDateTime(task.completedAt),
            description: task.description || "",
            checkIn: "-",
            checkOut: "-",
            distance: "0.00",
            region: getRegion(task.site),
            branch: getBranch(task.site),
        };
    });
};

const buildMissedTaskReport = async () => {
    const tasks = await buildTaskReport();
    return tasks
        .filter((task) => task.status === "Missed")
        .map((task) => ({
            ...task,
            rawDate: task.dueAt || task.scheduledAt,
            date: task.dueDate || task.date,
            missedDateTime: task.dueAt ? formatDateTime(task.dueAt) : "-",
        }));
};

/* =========================================================
   VISIT ENRICHMENT (TASK, CHECK-IN, PHOTO & LOCATION)
========================================================= */
const enrichVisits = async (visits) => {
    const userIds = [...new Set(visits.map((visit) => visit.userId).filter(Boolean))];
    const siteIds = [...new Set(visits.map((visit) => visit.siteId).filter(Boolean))];
    const taskIds = [...new Set(visits.map(getTaskIdFromVisit).filter(Boolean))];

    const [tasks, checkIns] = await Promise.all([
        taskIds.length
            ? prisma.task.findMany({
                where: { id: { in: taskIds } },
                include: {
                    site: {
                        select: {
                            id: true, name: true, siteCode: true, clientName: true,
                            clientEmail: true, address: true, city: true, state: true,
                            pincode: true, latitude: true, longitude: true,
                        },
                    },
                },
            })
            : Promise.resolve([]),
        userIds.length && siteIds.length
            ? prisma.checkInOut.findMany({
                where: { userId: { in: userIds }, siteId: { in: siteIds } },
                orderBy: { checkInAt: "desc" },
            })
            : Promise.resolve([]),
    ]);

    const taskMap = new Map(tasks.map((task) => [task.id, task]));
    const checkInsByPair = new Map();
    for (const checkIn of checkIns) {
        const key = `${checkIn.userId}:${checkIn.siteId}`;
        if (!checkInsByPair.has(key)) checkInsByPair.set(key, []);
        checkInsByPair.get(key).push(checkIn);
    }

    return visits.map((visit) => {
        const taskId = getTaskIdFromVisit(visit);
        const task = taskId ? taskMap.get(taskId) : null;
        const dayKey = new Date(visit.visitAt).toLocaleDateString("en-CA", { timeZone: REPORT_TIME_ZONE });
        const candidates = checkInsByPair.get(`${visit.userId}:${visit.siteId}`) || [];
        const sameDay = candidates.filter((item) => (
            new Date(item.checkInAt).toLocaleDateString("en-CA", { timeZone: REPORT_TIME_ZONE }) === dayKey
        ));
        const matchedCheckIn = sameDay.length
            ? sameDay.reduce((best, current) => {
                const bestDiff = Math.abs(new Date(best.checkInAt).getTime() - new Date(visit.visitAt).getTime());
                const currentDiff = Math.abs(new Date(current.checkInAt).getTime() - new Date(visit.visitAt).getTime());
                return currentDiff < bestDiff ? current : best;
            })
            : null;

        const evidence = getSiteEvidence(visit.notes);
        const checkInPhotoUrl = evidence.selfie || evidence.selfiePhoto || visit.photoUrl || null;
        const site = visit.site || task?.site || null;
        const address = getSiteAddress(site);
        const latitude = matchedCheckIn?.checkInLatitude ?? visit.latitude ?? site?.latitude ?? null;
        const longitude = matchedCheckIn?.checkInLongitude ?? visit.longitude ?? site?.longitude ?? null;
        const mapUrl = getMapUrl(latitude, longitude, address);
        const taskType = task ? getTaskType(task) : (visit.reportType || "Visit");

        return {
            id: visit.id,
            visitId: visit.id,
            taskId: task?.id || taskId || null,
            rawDate: visit.visitAt,
            date: formatDate(visit.visitAt),
            dateTime: formatDateTime(visit.visitAt),
            user: visit.user?.name || "-",
            supervisorId: visit.user?.id || visit.userId || null,
            client: task
                ? getTaskClient(task)
                : (visit.clientName || site?.clientName || "-"),
            clientEmail: getTaskClientEmail(task) !== "-" ? getTaskClientEmail(task) : (site?.clientEmail || "-"),
            site: site?.name || "-",
            siteCode: site?.siteCode || "-",
            address,
            latitude,
            longitude,
            mapUrl,
            type: taskType,
            taskType,
            taskTitle: task?.title || "-",
            scheduledDate: task ? getTaskScheduleInfo(task).scheduledDate : "-",
            scheduledTime: task ? getTaskScheduleInfo(task).scheduledTime : "-",
            dueDate: task ? getTaskScheduleInfo(task).dueDate : "-",
            status: normalizeVisitStatus(visit.status),
            visitStatus: normalizeVisitStatus(visit.status),
            checkIn: matchedCheckIn ? formatDateTime(matchedCheckIn.checkInAt) : "-",
            checkOut: matchedCheckIn?.checkOutAt ? formatDateTime(matchedCheckIn.checkOutAt) : "-",
            checkInAt: matchedCheckIn?.checkInAt || null,
            checkOutAt: matchedCheckIn?.checkOutAt || null,
            checkInId: matchedCheckIn?.id || null,
            checkInStatus: matchedCheckIn ? (matchedCheckIn.checkOutAt ? "Checked Out" : "Checked In") : "No Check-In Linked",
            checkInPhotoUrl,
            photoUrl: visit.photoUrl || null,
            reportPhotoUrl: visit.photoUrl || checkInPhotoUrl,
            checkInLatitude: matchedCheckIn?.checkInLatitude ?? null,
            checkInLongitude: matchedCheckIn?.checkInLongitude ?? null,
            distance: matchedCheckIn?.distanceTravelled ? Number(matchedCheckIn.distanceTravelled).toFixed(2) : "0.00",
            reportType: visit.reportType || "Visit",
            notes: visit.notes || "",
            region: getRegion(site),
            branch: getBranch(site),
        };
    });
};

/* =========================================================
   VISIT REPORT
========================================================= */
const buildVisitReport = async () => {
    const visits = await prisma.visit.findMany({
        include: {
            user: { select: { id: true, name: true, phone: true, email: true } },
            site: {
                select: {
                    id: true, name: true, siteCode: true, clientName: true,
                    clientEmail: true, address: true, city: true, state: true,
                    pincode: true, latitude: true, longitude: true,
                },
            },
        },
        orderBy: { visitAt: "desc" },
    });
    return enrichVisits(visits);
};

/* =========================================================
   AUDIT REPORT
========================================================= */
const buildAuditReport = async () => {
    const submissions = await prisma.auditSubmission.findMany({
        include: {
            visit: {
                include: {
                    user: { select: { id: true, name: true, phone: true, email: true } },
                    site: {
                        select: {
                            id: true, name: true, siteCode: true, clientName: true,
                            clientEmail: true, address: true, city: true, state: true,
                            pincode: true, latitude: true, longitude: true,
                        },
                    },
                },
            },
            template: { select: { id: true, name: true } },
            answers: { select: { id: true } },
        },
        orderBy: { submittedAt: "desc" },
    });

    const visits = submissions.map((submission) => submission.visit).filter(Boolean);
    const enriched = await enrichVisits(visits);
    const visitRows = new Map(enriched.map((row) => [row.visitId, row]));

    return submissions.map((submission) => {
        const visit = submission.visit;
        const base = visit ? visitRows.get(visit.id) : null;
        const reviewPath = visit?.id ? `/audit-view/${encodeURIComponent(visit.id)}` : null;
        const status = normalizeVisitStatus(visit?.status);
        return {
            ...(base || {}),
            id: submission.id,
            visitId: visit?.id || null,
            rawDate: submission.submittedAt,
            date: formatDate(submission.submittedAt),
            dateTime: formatDateTime(submission.submittedAt),
            visitDateTime: visit?.visitAt ? formatDateTime(visit.visitAt) : "-",
            user: visit?.user?.name || base?.user || "-",
            client: base?.client || visit?.clientName || "-",
            site: visit?.site?.name || base?.site || "-",
            type: base?.taskType || submission.template?.name || visit?.reportType || "Audit",
            taskType: base?.taskType || visit?.reportType || submission.template?.name || "Audit",
            status,
            auditStatus: status,
            templateName: submission.template?.name || "Audit",
            answerCount: Array.isArray(submission.answers) ? submission.answers.length : 0,
            submittedAt: submission.submittedAt,
            auditReviewUrl: reviewPath,
            region: getRegion(visit?.site),
            branch: getBranch(visit?.site),
        };
    });
};

/* =========================================================
   FIELD FORCE PERFORMANCE
========================================================= */

const buildPerformanceReport =
    async () => {
        const supervisors =
            await prisma.user.findMany(
                {
                    where: {
                        role:
                            "SUPERVISOR",
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
                                scheduledAt:
                                    true,
                            },
                        },

                        checkIns: {
                            select: {
                                checkInAt:
                                    true,

                                checkOutAt:
                                    true,

                                distanceTravelled:
                                    true,
                            },
                        },
                    },
                }
            );

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
                    sortedCheckIns.length -
                    1
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
   DISTANCE
========================================================= */

const calculateDistanceKm = (
    latitude1,
    longitude1,
    latitude2,
    longitude2
) => {
    const earthRadiusKm =
        6371;

    const toRadians =
        (degrees) =>
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
        Math.sin(
            deltaLat / 2
        ) **
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

/* =========================================================
   DISTANCE REPORT
========================================================= */

const buildDistanceReport =
    async () => {
        const supervisors =
            await prisma.user.findMany(
                {
                    where: {
                        role:
                            "SUPERVISOR",
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
                (user) =>
                    user.id
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

        for (
            const log of logs
        ) {
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
                    index <
                    points.length;
                    index++
                ) {
                    distance +=
                        calculateDistanceKm(
                            points[
                                index - 1
                            ].latitude,

                            points[
                                index - 1
                            ].longitude,

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

                    client:
                        "-",

                    site:
                        supervisor
                            .site
                            ?.name ||
                        "-",

                    type:
                        "Travel",

                    status:
                        points.length >
                            0
                            ? "Tracked"
                            : "No GPS",

                    checkIn:
                        "-",

                    checkOut:
                        "-",

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
            "Missed Task Report",
            "Field Force Performance",
            "Distance Report",
        ];

        if (
            !validTypes.includes(
                type
            )
        ) {
            return res.status(400).json(
                {
                    success: false,

                    message:
                        "Invalid report type",
                }
            );
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
            return res.status(400).json(
                {
                    success: false,

                    message:
                        "Invalid from date",
                }
            );
        }

        if (
            toDate &&
            !endDate
        ) {
            return res.status(400).json(
                {
                    success: false,

                    message:
                        "Invalid to date",
                }
            );
        }

        if (
            startDate &&
            endDate &&
            endDate < startDate
        ) {
            return res.status(400).json(
                {
                    success: false,

                    message:
                        "To date cannot be before from date",
                }
            );
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
                typeof region ===
                    "string"
                    ? region
                    : "",

            branch:
                typeof branch ===
                    "string"
                    ? branch
                    : "",

            client:
                typeof client ===
                    "string"
                    ? client
                    : "",

            user:
                typeof user ===
                    "string"
                    ? user
                    : "",

            search:
                normalizeSearch(
                    search
                ),
        };

        let rows = [];

        if (
            type ===
            "Task Report"
        ) {
            rows =
                await buildTaskReport();
        } else if (
            type ===
            "Visit Report"
        ) {
            rows =
                await buildVisitReport();
        } else if (
            type ===
            "Audit Report"
        ) {
            rows =
                await buildAuditReport();
        } else if (
            type ===
            "Missed Task Report"
        ) {
            rows =
                await buildMissedTaskReport();
        } else if (
            type ===
            "Field Force Performance"
        ) {
            rows =
                await buildPerformanceReport();
        } else if (
            type ===
            "Distance Report"
        ) {
            rows =
                await buildDistanceReport();
        }

        const filteredRows =
            rows.filter(
                (row) =>
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
                    String(
                        row.status || ""
                    ).includes(
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
        const auditVerifiedCount = filteredRows.filter((row) => row.status === "Verified").length;
        const auditUnverifiedCount = filteredRows.filter((row) => row.status === "Unverified").length;
        const auditPendingCount = filteredRows.filter((row) => row.status === "Pending Review").length;

        const totalDistance =
            filteredRows.reduce(
                (
                    sum,
                    row
                ) =>
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
                                value !==
                                "-"
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
                total /
                perPage
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

        /*
         * IMPORTANT DEBUG:
         *
         * This confirms exactly what the
         * API is sending to Admin Reports.
         */
        if (
            type ===
            "Task Report"
        ) {
            console.log(
                "TASK REPORT RESPONSE:",
                paginatedRows.map(
                    (row) => ({
                        id:
                            row.id,

                        client:
                            row.client,

                        clientEmail:
                            row.clientEmail,

                        supervisor:
                            row.user,
                    })
                )
            );
        }

        return res.status(200).json(
            {
                success: true,

                data: {
                    reportType:
                        type,

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

                        auditVerified:
                            auditVerifiedCount,

                        auditUnverified:
                            auditUnverifiedCount,

                        auditPending:
                            auditPendingCount,

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
                        page:
                            safePage,

                        limit:
                            perPage,

                        total,

                        totalPages,
                    },
                },
            }
        );
    } catch (error) {
        console.error(
            "Get report error:",
            error
        );

        return res.status(500).json(
            {
                success: false,

                message:
                    "Failed to generate report",

                error:
                    error?.message ||
                    "Unknown error",
            }
        );
    }
};

/* =========================================================
   EXPORT
========================================================= */

export {
    getReport,
};