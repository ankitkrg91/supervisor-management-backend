import prisma from "../config/prisma.js";

let io = null;

const setSocketIO = (socketIO) => {
    io = socketIO;
};

/* =========================================================
   UPDATE LOCATION
========================================================= */

const updateLocation = async (req, res) => {
    try {
        const {
            latitude,
            longitude,
        } = req.body;

        // Accepts both batteryLevel and batteryPercentage from mobile app
        const rawBattery =
            req.body.batteryLevel !== undefined
                ? req.body.batteryLevel
                : req.body.batteryPercentage;

        let batteryLevel = null;
        if (rawBattery !== undefined && rawBattery !== null) {
            const parsed = Number(rawBattery);
            if (!Number.isNaN(parsed) && parsed >= 0 && parsed <= 100) {
                batteryLevel = Math.round(parsed);
            }
        }

        // Only SUPERVISOR can send GPS location
        if (req.user.role !== "SUPERVISOR") {
            return res.status(403).json({
                success: false,
                message: "Only supervisors can update location",
            });
        }

        if (
            latitude === undefined ||
            typeof latitude !== "number" ||
            latitude < -90 ||
            latitude > 90
        ) {
            return res.status(400).json({
                success: false,
                message: "Invalid latitude",
            });
        }

        if (
            longitude === undefined ||
            typeof longitude !== "number" ||
            longitude < -180 ||
            longitude > 180
        ) {
            return res.status(400).json({
                success: false,
                message: "Invalid longitude",
            });
        }

        const user = await prisma.user.findUnique({
            where: {
                id: req.user.userId,
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

        if (user.role !== "SUPERVISOR") {
            return res.status(403).json({
                success: false,
                message: "Only supervisors can update location",
            });
        }

        if (user.status !== "ACTIVE") {
            return res.status(403).json({
                success: false,
                message: "User is inactive",
            });
        }

        const location = await prisma.locationLog.create({
            data: {
                userId: user.id,
                latitude,
                longitude,
                batteryLevel:
                    batteryLevel !== undefined
                        ? batteryLevel
                        : null,
            },
        });

        if (io) {
            io.emit("field-location-updated", {
                user: {
                    id: user.id,
                    name: user.name,
                    email: user.email,
                    role: user.role,
                    siteId: user.siteId,
                },
                location: {
                    id: location.id,
                    latitude: location.latitude,
                    longitude: location.longitude,
                    batteryLevel: location.batteryLevel,
                    recordedAt: location.recordedAt,
                },
            });
        }

        return res.status(201).json({
            success: true,
            message: "Location updated successfully",
            data: {
                location,
            },
        });
    } catch (error) {
        console.error("Update location error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to update location",
        });
    }
};

/* =========================================================
   LATEST LOCATIONS
========================================================= */

const getLatestLocations = async (req, res) => {
    try {
        const {
            status,
            battery,
        } = req.query;

        const validStatuses = [
            "ONLINE",
            "OFFLINE",
            "NO_GPS",
        ];

        if (
            status &&
            !validStatuses.includes(status)
        ) {
            return res.status(400).json({
                success: false,
                message: "Invalid tracking status",
            });
        }

        if (
            battery &&
            battery !== "LOW"
        ) {
            return res.status(400).json({
                success: false,
                message: "Invalid battery filter",
            });
        }

        const where = {
            role: "SUPERVISOR",
            status: "ACTIVE",
        };

        if (req.user.role === "SUPERVISOR") {
            where.id = req.user.userId;
        }

        const users =
            await prisma.user.findMany({
                where,
                select: {
                    id: true,
                    name: true,
                    email: true,
                    phone: true,
                    siteId: true,
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

        const now = Date.now();
        const ONLINE_THRESHOLD_MS =
            5 * 60 * 1000;

        const locations =
            await Promise.all(
                users.map(async (user) => {
                    const latestLocation =
                        await prisma.locationLog.findFirst({
                            where: {
                                userId: user.id,
                            },
                            orderBy: {
                                recordedAt: "desc",
                            },
                        });

                    let trackingStatus =
                        "NO_GPS";

                    let batteryStatus =
                        "UNKNOWN";

                    if (latestLocation) {
                        const locationAge =
                            now -
                            new Date(
                                latestLocation.recordedAt
                            ).getTime();

                        trackingStatus =
                            locationAge <=
                                ONLINE_THRESHOLD_MS
                                ? "ONLINE"
                                : "OFFLINE";

                        if (
                            latestLocation.batteryLevel ===
                            null
                        ) {
                            batteryStatus =
                                "UNKNOWN";
                        } else if (
                            latestLocation.batteryLevel <=
                            20
                        ) {
                            batteryStatus =
                                "BATTERY_LOW";
                        } else {
                            batteryStatus =
                                "NORMAL";
                        }
                    }

                    return {
                        user,
                        location:
                            latestLocation,
                        trackingStatus,
                        batteryStatus,
                    };
                })
            );

        let filteredLocations =
            locations;

        if (status) {
            filteredLocations =
                filteredLocations.filter(
                    (item) =>
                        item.trackingStatus ===
                        status
                );
        }

        if (battery === "LOW") {
            filteredLocations =
                filteredLocations.filter(
                    (item) =>
                        item.batteryStatus ===
                        "BATTERY_LOW"
                );
        }

        return res.status(200).json({
            success: true,
            data: {
                locations:
                    filteredLocations,
            },
        });
    } catch (error) {
        console.error(
            "Get latest locations error:",
            error
        );

        return res.status(500).json({
            success: false,
            message:
                "Failed to fetch latest locations",
        });
    }
};

/* =========================================================
   TRACK FIELD FORCE
========================================================= */

const getTrackedFieldForce = async (
    req,
    res
) => {
    try {
        const where = {
            role: "SUPERVISOR",
            status: "ACTIVE",
        };

        if (
            req.user.role === "SUPERVISOR"
        ) {
            where.id =
                req.user.userId;
        }

        const users =
            await prisma.user.findMany({
                where,
                select: {
                    id: true,
                    name: true,
                    email: true,
                    phone: true,
                    siteId: true,
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

        const now = Date.now();

        const ONLINE_THRESHOLD_MS =
            5 * 60 * 1000;

        const trackedFieldForce =
            await Promise.all(
                users.map(async (user) => {
                    const latestLocation =
                        await prisma.locationLog.findFirst({
                            where: {
                                userId: user.id,
                            },
                            orderBy: {
                                recordedAt: "desc",
                            },
                        });

                    let trackingStatus =
                        "NO_GPS";

                    let batteryStatus =
                        "UNKNOWN";

                    if (latestLocation) {
                        const locationAge =
                            now -
                            new Date(
                                latestLocation.recordedAt
                            ).getTime();

                        trackingStatus =
                            locationAge <=
                                ONLINE_THRESHOLD_MS
                                ? "ONLINE"
                                : "OFFLINE";

                        if (
                            latestLocation.batteryLevel ===
                            null
                        ) {
                            batteryStatus =
                                "UNKNOWN";
                        } else if (
                            latestLocation.batteryLevel <=
                            20
                        ) {
                            batteryStatus =
                                "BATTERY_LOW";
                        } else {
                            batteryStatus =
                                "NORMAL";
                        }
                    }

                    return {
                        user: {
                            id: user.id,
                            name: user.name,
                            email: user.email,
                            phone: user.phone,
                        },

                        site: user.site,

                        location:
                            latestLocation
                                ? {
                                    latitude:
                                        latestLocation.latitude,
                                    longitude:
                                        latestLocation.longitude,
                                    batteryLevel:
                                        latestLocation.batteryLevel,
                                    recordedAt:
                                        latestLocation.recordedAt,
                                }
                                : null,

                        trackingStatus,
                        batteryStatus,
                    };
                })
            );

        return res.status(200).json({
            success: true,
            data: {
                fieldForce:
                    trackedFieldForce,
            },
        });
    } catch (error) {
        console.error(
            "Track field force error:",
            error
        );

        return res.status(500).json({
            success: false,
            message:
                "Failed to fetch tracked field force",
        });
    }
};

/* =========================================================
   NOT CHECKED IN
========================================================= */

const getNotCheckedIn = async (
    req,
    res
) => {
    try {
        const where = {
            role: "SUPERVISOR",
            status: "ACTIVE",
        };

        if (
            req.user.role === "SUPERVISOR"
        ) {
            where.id =
                req.user.userId;
        }

        const users =
            await prisma.user.findMany({
                where,
                select: {
                    id: true,
                    name: true,
                    email: true,
                    phone: true,
                    siteId: true,
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

        const startOfDay =
            new Date();

        startOfDay.setHours(
            0,
            0,
            0,
            0
        );

        const endOfDay =
            new Date();

        endOfDay.setHours(
            23,
            59,
            59,
            999
        );

        const notCheckedInUsers =
            [];

        for (const user of users) {
            const checkIn =
                await prisma.checkInOut.findFirst({
                    where: {
                        userId: user.id,
                        checkInAt: {
                            gte: startOfDay,
                            lte: endOfDay,
                        },
                    },
                    orderBy: {
                        checkInAt: "desc",
                    },
                });

            if (!checkIn) {
                notCheckedInUsers.push({
                    user: {
                        id: user.id,
                        name: user.name,
                        email: user.email,
                        phone: user.phone,
                    },
                    site: user.site,
                });
            }
        }

        return res.status(200).json({
            success: true,
            data: {
                notCheckedIn:
                    notCheckedInUsers,
            },
        });
    } catch (error) {
        console.error(
            "Get not checked in error:",
            error
        );

        return res.status(500).json({
            success: false,
            message:
                "Failed to fetch not checked in supervisors",
        });
    }
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
    const EARTH_RADIUS_KM = 6371;

    const toRadians = (degrees) =>
        (degrees * Math.PI) / 180;

    const lat1 =
        toRadians(latitude1);

    const lat2 =
        toRadians(latitude2);

    const deltaLatitude =
        toRadians(
            latitude2 - latitude1
        );

    const deltaLongitude =
        toRadians(
            longitude2 - longitude1
        );

    const a =
        Math.sin(
            deltaLatitude / 2
        ) *
        Math.sin(
            deltaLatitude / 2
        ) +
        Math.cos(lat1) *
        Math.cos(lat2) *
        Math.sin(
            deltaLongitude / 2
        ) *
        Math.sin(
            deltaLongitude / 2
        );

    const c =
        2 *
        Math.atan2(
            Math.sqrt(a),
            Math.sqrt(1 - a)
        );

    return (
        EARTH_RADIUS_KM *
        c
    );
};

const getDistanceReport = async (
    req,
    res
) => {
    try {
        const {
            fromDate,
            toDate,
            region,
            search,
            page = 1,
            limit = 10,
        } = req.query;

        let startDate;
        let endDate;

        if (fromDate) {
            startDate = new Date(
                `${fromDate}T00:00:00.000Z`
            );

            if (
                Number.isNaN(
                    startDate.getTime()
                )
            ) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Invalid from date",
                });
            }
        } else {
            startDate = new Date(0);
        }

        if (toDate) {
            endDate = new Date(
                `${toDate}T23:59:59.999Z`
            );

            if (
                Number.isNaN(
                    endDate.getTime()
                )
            ) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Invalid to date",
                });
            }
        } else {
            endDate = new Date();
        }

        if (endDate < startDate) {
            return res.status(400).json({
                success: false,
                message:
                    "To date cannot be before from date",
            });
        }

        const currentPage = Math.max(
            Number(page) || 1,
            1
        );

        const perPage = Math.min(
            Math.max(
                Number(limit) || 10,
                1
            ),
            100
        );

        const normalizedSearch =
            typeof search === "string"
                ? search.trim()
                : "";

        const normalizedRegion =
            typeof region === "string"
                ? region.trim()
                : "";

        const supervisorWhere = {
            role: "SUPERVISOR",
        };

        if (normalizedRegion) {
            supervisorWhere.site = {
                state: {
                    equals: normalizedRegion,
                    mode: "insensitive",
                },
            };
        }

        if (normalizedSearch) {
            supervisorWhere.OR = [
                {
                    name: {
                        contains:
                            normalizedSearch,
                        mode: "insensitive",
                    },
                },
                {
                    email: {
                        contains:
                            normalizedSearch,
                        mode: "insensitive",
                    },
                },
                {
                    phone: {
                        contains:
                            normalizedSearch,
                        mode: "insensitive",
                    },
                },
                {
                    site: {
                        name: {
                            contains:
                                normalizedSearch,
                            mode: "insensitive",
                        },
                    },
                },
                {
                    site: {
                        siteCode: {
                            contains:
                                normalizedSearch,
                            mode: "insensitive",
                        },
                    },
                },
                {
                    site: {
                        state: {
                            contains:
                                normalizedSearch,
                            mode: "insensitive",
                        },
                    },
                },
            ];
        }

        const supervisors =
            await prisma.user.findMany({
                where: supervisorWhere,
                select: {
                    id: true,
                    name: true,
                    email: true,
                    phone: true,
                    status: true,
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

        if (
            supervisors.length === 0
        ) {
            return res.status(200).json({
                success: true,
                data: {
                    reports: [],
                    pagination: {
                        page: currentPage,
                        limit: perPage,
                        total: 0,
                        totalPages: 0,
                    },
                },
            });
        }

        const supervisorIds =
            supervisors.map(
                (supervisor) =>
                    supervisor.id
            );

        const locationLogs =
            await prisma.locationLog.findMany({
                where: {
                    userId: {
                        in: supervisorIds,
                    },
                    recordedAt: {
                        gte: startDate,
                        lte: endDate,
                    },
                },
                orderBy: {
                    recordedAt: "asc",
                },
                select: {
                    id: true,
                    userId: true,
                    latitude: true,
                    longitude: true,
                    recordedAt: true,
                },
            });

        const logsByUser = new Map();

        for (const log of locationLogs) {
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

        const reports =
            supervisors.map(
                (supervisor) => {
                    const logs =
                        logsByUser.get(
                            supervisor.id
                        ) || [];

                    let totalDistanceKm =
                        0;

                    for (
                        let index = 1;
                        index < logs.length;
                        index++
                    ) {
                        const previous =
                            logs[index - 1];

                        const current =
                            logs[index];

                        totalDistanceKm +=
                            calculateDistanceKm(
                                previous.latitude,
                                previous.longitude,
                                current.latitude,
                                current.longitude
                            );
                    }

                    return {
                        user: {
                            id: supervisor.id,
                            name: supervisor.name,
                            email: supervisor.email,
                            phone: supervisor.phone,
                            status: supervisor.status,
                        },

                        site:
                            supervisor.site,

                        distanceKm:
                            Number(
                                totalDistanceKm.toFixed(
                                    2
                                )
                            ),

                        locationPoints:
                            logs.length,

                        firstLocation:
                            logs.length > 0
                                ? logs[0]
                                    .recordedAt
                                : null,

                        lastLocation:
                            logs.length > 0
                                ? logs[
                                    logs.length -
                                    1
                                ].recordedAt
                                : null,
                    };
                }
            );

        reports.sort(
            (a, b) =>
                b.distanceKm -
                a.distanceKm
        );

        const total =
            reports.length;

        const totalPages =
            Math.ceil(
                total / perPage
            );

        const skip =
            (currentPage - 1) *
            perPage;

        const paginatedReports =
            reports.slice(
                skip,
                skip + perPage
            );

        return res.status(200).json({
            success: true,
            data: {
                reports:
                    paginatedReports,

                dateRange: {
                    from:
                        fromDate ||
                        null,
                    to:
                        toDate ||
                        null,
                },

                pagination: {
                    page: currentPage,
                    limit: perPage,
                    total,
                    totalPages,
                },
            },
        });
    } catch (error) {
        console.error(
            "Distance report error:",
            error
        );

        return res.status(500).json({
            success: false,
            message:
                "Failed to generate distance report",
        });
    }
};

/* =========================================================
   GET DAILY ROUTE & TIMELINE
   Super Admin Portal
========================================================= */

const getDailyRoute = async (req, res) => {
    try {
        const { userId, date } = req.query;
        if (!userId) {
            return res.status(400).json({ success: false, message: "userId is required" });
        }

        // Safe Date Normalization (handles DD-MM-YYYY and YYYY-MM-DD)
        let normalizedDate = (date || new Date().toISOString().split("T")[0]).trim();
        if (normalizedDate.includes("-")) {
            const parts = normalizedDate.split("-");
            if (parts[0].length === 2 && parts[2].length === 4) {
                normalizedDate = `${parts[2]}-${parts[1]}-${parts[0]}`;
            }
        }

        let startOfDay = new Date(`${normalizedDate}T00:00:00.000Z`);
        let endOfDay = new Date(`${normalizedDate}T23:59:59.999Z`);
        if (isNaN(startOfDay.getTime()) || isNaN(endOfDay.getTime())) {
            const todayStr = new Date().toISOString().split("T")[0];
            startOfDay = new Date(`${todayStr}T00:00:00.000Z`);
            endOfDay = new Date(`${todayStr}T23:59:59.999Z`);
            normalizedDate = todayStr;
        }

        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { id: true, name: true, email: true, phone: true, status: true },
        });

        if (!user) {
            return res.status(404).json({ success: false, message: "User not found" });
        }

        // Fixed: batteryLevel instead of battery
        const locationLogs = await prisma.locationLog.findMany({
            where: {
                userId,
                recordedAt: { gte: startOfDay, lte: endOfDay },
            },
            orderBy: { recordedAt: "asc" },
            select: { id: true, latitude: true, longitude: true, recordedAt: true, batteryLevel: true },
        });

        let totalDistanceKm = 0;
        for (let i = 1; i < locationLogs.length; i++) {
            const p1 = locationLogs[i - 1];
            const p2 = locationLogs[i];
            if (p1 && p2 && Number.isFinite(p1.latitude) && Number.isFinite(p1.longitude) && Number.isFinite(p2.latitude) && Number.isFinite(p2.longitude)) {
                totalDistanceKm += calculateDistanceKm(
                    p1.latitude,
                    p1.longitude,
                    p2.latitude,
                    p2.longitude
                );
            }
        }
        if (!Number.isFinite(totalDistanceKm)) totalDistanceKm = 0;

        const checkIns = await prisma.checkInOut.findMany({
            where: {
                userId,
                checkInAt: { gte: startOfDay, lte: endOfDay },
            },
            include: { site: true },
            orderBy: { checkInAt: "asc" },
        });

        const visits = await prisma.visit.findMany({
            where: {
                userId,
                visitAt: { gte: startOfDay, lte: endOfDay },
            },
            include: {
                site: true,
                user: true,
                auditSubmission: {
                    include: {
                        answers: true,
                    },
                },
            },
            orderBy: { visitAt: "asc" },
        });

        const extractSelfieFromVisit = (v) => {
            if (!v) return null;
            if (v.notes && typeof v.notes === "string") {
                const match = v.notes.match(/\[SITE_EVIDENCE\]:\s*(\{[\s\S]*?\})/);
                if (match) {
                    try {
                        const parsed = JSON.parse(match[1]);
                        if (parsed.selfie && typeof parsed.selfie === "string" && parsed.selfie.trim().length > 0) {
                            return parsed.selfie.trim();
                        }
                    } catch (e) { }
                }
            }
            return v.photoUrl || null;
        };

        const stops = [];
        let stopNumber = 1;

        // Check if ANY visit today for this user has alternate checkin
        const dayHasAlternate = visits.some(v => v.notes && typeof v.notes === "string" && v.notes.includes("[ALTERNATE_CHECKIN]"));
        let dayAlternateReason = null;
        if (dayHasAlternate) {
            const vAlt = visits.find(v => v.notes && v.notes.includes("[ALTERNATE_CHECKIN]"));
            const mAlt = vAlt.notes.match(/\[ALTERNATE_CHECKIN\]:\s*([^\n]+)/);
            if (mAlt) dayAlternateReason = mAlt[1].trim();
        }

        // 1. Process Check-In Stops
        for (const ci of checkIns) {
            const matchingVisit = visits.find((v) => v.siteId === ci.siteId) || visits[0];
            const selfie = extractSelfieFromVisit(matchingVisit);

            let isAlternate = dayHasAlternate;
            let alternateReason = dayAlternateReason;
            if (matchingVisit?.notes && typeof matchingVisit.notes === "string" && matchingVisit.notes.includes("[ALTERNATE_CHECKIN]")) {
                const match = matchingVisit.notes.match(/\[ALTERNATE_CHECKIN\]:\s*([^\n]+)/);
                if (match) {
                    isAlternate = true;
                    alternateReason = match[1].trim();
                }
            }

            const inDate = ci.checkInAt ? new Date(ci.checkInAt) : new Date();
            const dateTag = isNaN(inDate.getTime()) ? "DATE" : inDate.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }).replace(/\s+/g, "_");
            const timeTag = isNaN(inDate.getTime()) ? "TIME" : inDate.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }).replace(/\s+/g, "_");
            const userName = (user?.name || "Supervisor").replace(/\s+/g, "");
            const userPhone = user?.phone || "0000";
            const customCheckInId = `${userName}${userPhone}-${dateTag}_${timeTag}`;

            stops.push({
                id: ci.id,
                stopNumber: stopNumber++,
                type: "CHECK_IN",
                locationName: ci.site?.name || "Site Check-In",
                siteCode: ci.site?.siteCode || "",
                time: ci.checkInAt ? new Date(ci.checkInAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "N/A",
                timeFull: ci.checkInAt,
                latitude: ci.checkInLatitude || (locationLogs[0] ? locationLogs[0].latitude : 30.901),
                longitude: ci.checkInLongitude || (locationLogs[0] ? locationLogs[0].longitude : 75.857),
                distanceFromPrevKm: "0.00",
                checkInId: customCheckInId,
                checkInTime: ci.checkInAt,
                checkOutTime: ci.checkOutAt,
                checkInAddress: ci.site?.address || "Site GPS Verified",
                checkOutAddress: ci.checkOutAt ? (ci.site?.address || "Site Check-out") : "NA (Currently Active)",
                selfieIn: selfie,
                selfieOut: null,
                distanceTravelled: ci.distanceTravelled != null ? `${Number(ci.distanceTravelled).toFixed(2)} KM` : `${totalDistanceKm.toFixed(2)} KM`,
                isAlternate,
                alternateReason,
                rawCheckIn: ci,
            });
        }

        // 2. Process Site Visit Stops
        for (const v of visits) {
            let isAlt = dayHasAlternate;
            let altReason = dayAlternateReason;
            if (v.notes && typeof v.notes === "string" && v.notes.includes("[ALTERNATE_CHECKIN]")) {
                const match = v.notes.match(/\[ALTERNATE_CHECKIN\]:\s*([^\n]+)/);
                if (match) {
                    isAlt = true;
                    altReason = match[1].trim();
                }
            }

            stops.push({
                id: v.id,
                stopNumber: stopNumber++,
                type: "SITE_VISIT",
                locationName: v.site?.name || "Site Inspection",
                time: v.visitAt ? new Date(v.visitAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "N/A",
                timeFull: v.visitAt,
                latitude: v.latitude || (v.site ? v.site.latitude : 30.901),
                longitude: v.longitude || (v.site ? v.site.longitude : 75.857),
                distanceFromPrevKm: "0.00",
                siteCode: v.site?.siteCode || "MSF-SITE",
                siteName: v.site?.name || "Client Site",
                address: v.site?.address ? `${v.site.address}, ${v.site.city || ""} ${v.site.state || ""}` : "Industrial Area",
                visitId: v.id,
                status: v.status || "VERIFIED",
                completedOn: v.visitAt ? new Date(v.visitAt).toLocaleString("en-IN") : "N/A",
                assignTo: user?.name || "Supervisor",
                scheduledBy: "Admin",
                scheduledOn: v.createdAt ? new Date(v.createdAt).toISOString().split("T")[0] : "N/A",
                visit: v,
                auditAnswers: v.auditSubmission?.answers || [],
                isAlternate: isAlt,
                alternateReason: altReason,
            });
        }

        const isOnline = locationLogs.length > 0 && (Date.now() - new Date(locationLogs[locationLogs.length - 1].recordedAt).getTime()) < 15 * 60 * 1000;

        return res.status(200).json({
            success: true,
            data: {
                user,
                date: normalizedDate,
                totalDistanceKm: Number(totalDistanceKm.toFixed(2)),
                totalStops: stops.length,
                isOnline,
                route: locationLogs,
                stops,
                sites: visits.map(v => v.site).filter(Boolean),
            },
        });
    } catch (error) {
        console.error("Daily route error:", error);
        return res.status(500).json({ success: false, message: "Failed to fetch daily route", error: error.message });
    }
};
/* =========================================================
   GET SUPERVISOR DAILY BREAKDOWN (For 30-Day Accordion)
========================================================= */
const getSupervisorDailyBreakdown = async (req, res) => {
    try {
        const { userId, fromDate, toDate } = req.query;
        if (!userId) {
            return res.status(400).json({ success: false, message: "userId is required" });
        }

        const startDate = fromDate ? new Date(`${fromDate}T00:00:00.000Z`) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const endDate = toDate ? new Date(`${toDate}T23:59:59.999Z`) : new Date();

        const logs = await prisma.locationLog.findMany({
            where: {
                userId,
                recordedAt: { gte: startDate, lte: endDate },
            },
            orderBy: { recordedAt: "asc" },
            select: { latitude: true, longitude: true, recordedAt: true },
        });

        const dayMap = {};
        for (const log of logs) {
            const dateStr = log.recordedAt.toISOString().split("T")[0];
            if (!dayMap[dateStr]) dayMap[dateStr] = [];
            dayMap[dateStr].push(log);
        }

        const days = [];
        for (const [dateStr, dayLogs] of Object.entries(dayMap)) {
            let dayDistance = 0;
            for (let i = 1; i < dayLogs.length; i++) {
                dayDistance += calculateDistanceKm(
                    dayLogs[i - 1].latitude,
                    dayLogs[i - 1].longitude,
                    dayLogs[i].latitude,
                    dayLogs[i].longitude
                );
            }
            days.push({
                date: dateStr,
                distanceKm: Number(dayDistance.toFixed(2)),
                pointsCount: dayLogs.length,
                startTime: dayLogs[0].recordedAt,
                endTime: dayLogs[dayLogs.length - 1].recordedAt,
            });
        }

        days.sort((a, b) => b.date.localeCompare(a.date));

        return res.status(200).json({
            success: true,
            data: {
                userId,
                fromDate: startDate.toISOString().split("T")[0],
                toDate: endDate.toISOString().split("T")[0],
                totalDays: days.length,
                days,
            },
        });
    } catch (error) {
        console.error("Daily breakdown error:", error);
        return res.status(500).json({ success: false, message: "Failed to fetch daily breakdown" });
    }
};

/* =========================================================
   EXPORTS
========================================================= */

export {
    updateLocation,
    getLatestLocations,
    getTrackedFieldForce,
    getNotCheckedIn,
    getDistanceReport,
    getDailyRoute,
    getSupervisorDailyBreakdown,
    setSocketIO,
};