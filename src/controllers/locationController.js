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
            batteryLevel,
        } = req.body;

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

        if (
            batteryLevel !== undefined &&
            (
                typeof batteryLevel !== "number" ||
                !Number.isInteger(batteryLevel) ||
                batteryLevel < 0 ||
                batteryLevel > 100
            )
        ) {
            return res.status(400).json({
                success: false,
                message: "Invalid battery level",
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
            return res.status(400).json({
                success: false,
                message: "userId is required",
            });
        }

        // 1. Safe Date parsing (Supports both YYYY-MM-DD and DD-MM-YYYY)
        let targetDate = new Date();
        if (date && typeof date === "string") {
            const parts = date.trim().split("-");
            if (parts.length === 3) {
                if (parts[0].length === 4) {
                    targetDate = new Date(`${parts[0]}-${parts[1]}-${parts[2]}T00:00:00.000Z`);
                } else if (parts[2].length === 4) {
                    targetDate = new Date(`${parts[2]}-${parts[1]}-${parts[0]}T00:00:00.000Z`);
                }
            }
        }
        if (Number.isNaN(targetDate.getTime())) {
            targetDate = new Date();
        }

        const year = targetDate.getUTCFullYear();
        const month = String(targetDate.getUTCMonth() + 1).padStart(2, "0");
        const day = String(targetDate.getUTCDate()).padStart(2, "0");
        const dateStr = `${year}-${month}-${day}`;

        const startDate = new Date(`${dateStr}T00:00:00.000Z`);
        const endDate = new Date(`${dateStr}T23:59:59.999Z`);

        // 2. Fetch User details
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: {
                id: true,
                name: true,
                email: true,
                phone: true,
                role: true,
                status: true,
                site: {
                    select: {
                        id: true,
                        name: true,
                        siteCode: true,
                        address: true,
                        city: true,
                        state: true,
                    },
                },
            },
        });

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "Supervisor not found",
            });
        }

        // 3. Fetch Location Logs (GPS breadcrumbs)
        const locationLogs = await prisma.locationLog.findMany({
            where: {
                userId,
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
                latitude: true,
                longitude: true,
                batteryLevel: true,
                recordedAt: true,
            },
        });

        // Calculate total distance traveled
        let totalDistanceKm = 0;
        for (let i = 1; i < locationLogs.length; i++) {
            totalDistanceKm += calculateDistanceKm(
                locationLogs[i - 1].latitude,
                locationLogs[i - 1].longitude,
                locationLogs[i].latitude,
                locationLogs[i].longitude
            );
        }

        // Latest GPS location & online status (within 5 minutes)
        const latestLog = locationLogs.length > 0 ? locationLogs[locationLogs.length - 1] : null;
        const isOnline = latestLog
            ? Date.now() - new Date(latestLog.recordedAt).getTime() <= 5 * 60 * 1000
            : false;

        // 4. Fetch All Active Sites to show on Map
        const sites = await prisma.site.findMany({
            where: {
                status: "ACTIVE",
                latitude: { not: null },
                longitude: { not: null },
            },
            select: {
                id: true,
                name: true,
                siteCode: true,
                address: true,
                city: true,
                state: true,
                latitude: true,
                longitude: true,
            },
        });

        // 5. Fetch Check-ins for this date
        const checkIns = await prisma.checkInOut.findMany({
            where: {
                userId,
                checkInAt: {
                    gte: startDate,
                    lte: endDate,
                },
            },
            include: {
                site: true,
            },
            orderBy: {
                checkInAt: "asc",
            },
        });

        // 6. Fetch Visits for this date safely
        let visits = [];
        try {
            visits = await prisma.visit.findMany({
                where: {
                    userId,
                    visitAt: {
                        gte: startDate,
                        lte: endDate,
                    },
                },
                include: {
                    site: true,
                    auditSubmission: {
                        include: {
                            answers: {
                                orderBy: {
                                    questionNo: "asc",
                                },
                            },
                        },
                    },
                },
                orderBy: {
                    visitAt: "asc",
                },
            });
        } catch (_) {
            visits = await prisma.visit.findMany({
                where: {
                    userId,
                    visitAt: {
                        gte: startDate,
                        lte: endDate,
                    },
                },
                include: {
                    site: true,
                },
                orderBy: {
                    visitAt: "asc",
                },
            });
        }

        // 7. Build Stops List (Timeline table)
        const stops = [];
        let stopIndex = 1;

        // Add Check-ins
        for (const checkIn of checkIns) {
            const checkInDate = new Date(checkIn.checkInAt);
            const formattedDate = checkInDate.toLocaleDateString("en-IN", {
                day: "2-digit",
                month: "short",
                year: "numeric",
            });
            const formattedTime = checkInDate.toLocaleTimeString("en-IN", {
                hour: "2-digit",
                minute: "2-digit",
                hour12: false,
            });

            const siteLocation = checkIn.site
                ? `${checkIn.site.name}, ${checkIn.site.address || ""} ${checkIn.site.city || ""}`.trim()
                : "Assigned Site";

            const gpsLocation = checkIn.checkInLatitude && checkIn.checkInLongitude
                ? `${checkIn.site?.address || `${checkIn.checkInLatitude.toFixed(6)},${checkIn.checkInLongitude.toFixed(6)}`}`
                : "GPS Recorded";

            const checkInId = `${user.name.replace(/\s+/g, "")}${user.phone || "31799"}-${dateStr.replace(/-/g, "_")}_${formattedTime.replace(":", "_")}`;

            stops.push({
                id: checkIn.id,
                srNo: stopIndex,
                stopNumber: stopIndex++,
                type: "CHECK_IN",
                siteId: "CHECKIN",
                locationName: siteLocation,
                siteLocation,
                gpsLocation,
                dateOfVisit: formattedDate,
                time: formattedTime,
                timeOfVisit: formattedTime,
                distanceFromPrevKm: "0.00",
                distanceInKm: "0.00",
                latitude: checkIn.checkInLatitude,
                longitude: checkIn.checkInLongitude,
                checkInId,
                checkInTime: checkIn.checkInAt,
                checkOutTime: checkIn.checkOutAt,
                checkInAddress: gpsLocation,
                checkOutAddress: checkIn.checkOutAt ? (checkIn.site?.address || "Recorded at Site") : "NA",
                distanceTravelled: `${Number(checkIn.distanceTravelled || totalDistanceKm).toFixed(2)} KM`,
                selfieIn: null,
                selfieOut: null,
                checkInDetails: {
                    checkInId,
                    name: user.name,
                    checkInDateTime: `${formattedDate} ${formattedTime}`,
                    checkOutDateTime: checkIn.checkOutAt
                        ? new Date(checkIn.checkOutAt).toLocaleString("en-IN", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                            hour12: false,
                        })
                        : "In Progress",
                    gpsCheckInAddress: gpsLocation,
                    gpsCheckOutAddress: checkIn.checkOutAt
                        ? (checkIn.site?.address || "Recorded at Site")
                        : "NA",
                    distanceTravelled: `${Number(checkIn.distanceTravelled || totalDistanceKm).toFixed(2)} KM`,
                    checkInPhotoUrl: null,
                    checkOutPhotoUrl: null,
                },
            });
        }

        // Add Visits as subsequent stops
        for (const visit of visits) {
            const visitDate = new Date(visit.visitAt);
            const formattedDate = visitDate.toLocaleDateString("en-IN", {
                day: "2-digit",
                month: "short",
                year: "numeric",
            });
            const formattedTime = visitDate.toLocaleTimeString("en-IN", {
                hour: "2-digit",
                minute: "2-digit",
                hour12: false,
            });

            const visitDayTag = dateStr.replace(/-/g, "");
            const taskNo = `TS${visitDayTag}${visit.id.slice(0, 4)}`;

            stops.push({
                id: visit.id,
                srNo: stopIndex,
                stopNumber: stopIndex++,
                type: "SITE_VISIT",
                siteId: visit.site?.siteCode || `${visit.site?.name || "VISIT"}`,
                locationName: `${visit.clientName ? `${visit.clientName}, ` : ""}${visit.site?.name || ""}`.trim() || "Client Site Inspection",
                siteLocation: `${visit.clientName ? `${visit.clientName}, ` : ""}${visit.site?.name || ""}, ${visit.site?.address || ""}`.trim(),
                gpsLocation: visit.latitude && visit.longitude
                    ? `${visit.latitude.toFixed(6)}, ${visit.longitude.toFixed(6)}`
                    : "Visit Coordinates",
                siteCode: visit.site?.siteCode || "MSF-SITE",
                siteName: visit.site?.name || "Client Site",
                address: `${visit.site?.address || ""}, ${visit.site?.city || ""}, ${visit.site?.state || ""}`,
                dateOfVisit: formattedDate,
                time: formattedTime,
                timeOfVisit: formattedTime,
                distanceFromPrevKm: Number(totalDistanceKm).toFixed(2),
                distanceInKm: Number(totalDistanceKm).toFixed(2),
                latitude: visit.latitude,
                longitude: visit.longitude,
                visitId: visit.id,
                status: visit.status === "VERIFIED" ? "CLOSE" : (visit.status || "COMPLETED"),
                completedOn: `${formattedDate} ${formattedTime}`,
                assignTo: user.name,
                scheduledBy: "ADMIN",
                scheduledOn: formattedDate,
                auditAnswers: visit.auditSubmission?.answers || [],
                visitDetails: {
                    id: visit.id,
                    taskNo,
                    taskName: visit.clientName || "MSF Site Task",
                    siteName: visit.site?.name || "MSF Site",
                    siteCode: visit.site?.siteCode || "18552",
                    siteAddress: `${visit.site?.address || ""}, ${visit.site?.city || ""}, ${visit.site?.state || ""}`,
                    assignTo: user.name,
                    scheduledBy: "ADMIN",
                    scheduledOn: formattedDate,
                    dueOn: formattedDate,
                    priority: "MEDIUM",
                    status: visit.status === "VERIFIED" ? "CLOSE" : visit.status,
                    completedOn: `${formattedDate} ${formattedTime}`,
                    remark: visit.notes || "TASK COMPLETED",
                    latitude: visit.latitude,
                    longitude: visit.longitude,
                    photoUrl: visit.photoUrl,
                    auditAnswers: visit.auditSubmission?.answers || [],
                },
            });
        }

        // 8. Fallback: Agar supervisor ne Check-in nahi kiya par GPS points hain
        if (stops.length === 0 && locationLogs.length > 0) {
            const firstLog = locationLogs[0];
            const lastLog = locationLogs[locationLogs.length - 1];

            stops.push({
                id: "start-1",
                srNo: 1,
                stopNumber: 1,
                type: "CHECK_IN",
                siteId: "START_POINT",
                locationName: user.site?.name || "Tracking Started",
                siteLocation: user.site?.name || "Tracking Started",
                gpsLocation: `${firstLog.latitude.toFixed(6)}, ${firstLog.longitude.toFixed(6)}`,
                dateOfVisit: new Date(firstLog.recordedAt).toLocaleDateString("en-IN", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                }),
                time: new Date(firstLog.recordedAt).toLocaleTimeString("en-IN", {
                    hour: "2-digit",
                    minute: "2-digit",
                    hour12: false,
                }),
                timeOfVisit: new Date(firstLog.recordedAt).toLocaleTimeString("en-IN", {
                    hour: "2-digit",
                    minute: "2-digit",
                    hour12: false,
                }),
                distanceFromPrevKm: "0.00",
                distanceInKm: "0.00",
                latitude: firstLog.latitude,
                longitude: firstLog.longitude,
            });

            if (locationLogs.length > 1) {
                stops.push({
                    id: "live-2",
                    srNo: 2,
                    stopNumber: 2,
                    type: "SITE_VISIT",
                    siteId: "CURRENT_LOCATION",
                    locationName: isOnline ? "Live Moving Point" : "Last Known Location",
                    siteLocation: isOnline ? "Live Moving Point" : "Last Known Location",
                    gpsLocation: `${lastLog.latitude.toFixed(6)}, ${lastLog.longitude.toFixed(6)}`,
                    dateOfVisit: new Date(lastLog.recordedAt).toLocaleDateString("en-IN", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                    }),
                    time: new Date(lastLog.recordedAt).toLocaleTimeString("en-IN", {
                        hour: "2-digit",
                        minute: "2-digit",
                        hour12: false,
                    }),
                    timeOfVisit: new Date(lastLog.recordedAt).toLocaleTimeString("en-IN", {
                        hour: "2-digit",
                        minute: "2-digit",
                        hour12: false,
                    }),
                    distanceFromPrevKm: Number(totalDistanceKm).toFixed(2),
                    distanceInKm: Number(totalDistanceKm).toFixed(2),
                    latitude: lastLog.latitude,
                    longitude: lastLog.longitude,
                });
            }
        }

        return res.status(200).json({
            success: true,
            data: {
                user,
                date: dateStr,
                totalDistanceKm: Number(totalDistanceKm.toFixed(2)),
                isOnline,
                latestLocation: latestLog,
                route: locationLogs,
                sites,
                stops,
            },
        });
    } catch (error) {
        console.error("Daily route error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to fetch daily route and tracking",
        });
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