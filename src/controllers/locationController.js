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
   EXPORTS
========================================================= */

export {
    updateLocation,
    getLatestLocations,
    getTrackedFieldForce,
    getNotCheckedIn,
    getDistanceReport,
    setSocketIO,
};