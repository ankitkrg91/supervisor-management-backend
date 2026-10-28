import prisma from "../config/prisma.js";
import { sendAuditCompletionEmail } from "../services/auditEmailService.js";

/*
 * ============================================================
 * HELPER: EXTRACT SUPERVISOR SELFIE FROM VISIT
 * ============================================================
 */
const extractSelfieFromVisit = (visit) => {
    if (!visit) return null;

    if (visit.notes && typeof visit.notes === "string") {
        try {
            const m = visit.notes.match(
                /\[SITE_EVIDENCE\]:\s*(\{[\s\S]*?\})/
            );

            if (m) {
                const ev = JSON.parse(m[1]);

                if (
                    ev.selfie &&
                    typeof ev.selfie === "string" &&
                    ev.selfie.trim().length > 0
                ) {
                    return ev.selfie.trim();
                }
            }
        } catch (_) { }
    }

    if (visit.notes && typeof visit.notes === "string") {
        try {
            const m = visit.notes.match(
                /\[CHECKIN_SELFIE\]:\s*(data:image\/[^\s\n]+|https?:\/\/[^\s\n]+)/
            );

            if (m) return m[1].trim();
        } catch (_) { }
    }

    if (visit.reportType === "Site Check-In" && visit.photoUrl) {
        return visit.photoUrl.trim();
    }

    return null;
};

/*
 * ============================================================
 * CREATE CHECK-IN
 * ============================================================
 */
const createCheckIn = async (req, res) => {
    try {
        const userId = req.user.userId;

        const {
            siteId,
            latitude,
            longitude,
            photoUrl,
            isAlternate,
            alternateReason,
        } = req.body;

        if (typeof photoUrl !== "string" || !photoUrl.trim()) {
            return res.status(400).json({
                success: false,
                message: "A check-in selfie is required",
            });
        }

        if (!siteId) {
            return res.status(400).json({
                success: false,
                message: "siteId is required",
            });
        }

        const user = await prisma.user.findUnique({
            where: { id: userId },
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
                message: "Only active Supervisors can check in",
            });
        }

        const site = await prisma.site.findUnique({
            where: { id: siteId },
            select: {
                id: true,
                name: true,
                siteCode: true,
                status: true,
                city: true,
                state: true,
                latitude: true,
                longitude: true,
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

        const assignedTask = await prisma.task.findFirst({
            where: {
                assignedToId: userId,
                siteId,
                status: { not: "CANCELLED" },
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
            orderBy: { scheduledAt: "asc" },
        });

        if (!assignedTask) {
            return res.status(403).json({
                success: false,
                message:
                    "This task is not assigned to the logged-in Supervisor for this site.",
                data: {
                    userId,
                    requestedSiteId: siteId,
                },
            });
        }

        const parsedLatitude =
            latitude !== undefined && latitude !== null && latitude !== ""
                ? Number(latitude)
                : null;

        const parsedLongitude =
            longitude !== undefined && longitude !== null && longitude !== ""
                ? Number(longitude)
                : null;

        if (parsedLatitude === null || parsedLongitude === null) {
            return res.status(400).json({
                success: false,
                message: "Current GPS location is required for check-in",
            });
        }

        if (
            Number.isNaN(parsedLatitude) ||
            parsedLatitude < -90 ||
            parsedLatitude > 90
        ) {
            return res.status(400).json({
                success: false,
                message: "Invalid latitude",
            });
        }

        if (
            Number.isNaN(parsedLongitude) ||
            parsedLongitude < -180 ||
            parsedLongitude > 180
        ) {
            return res.status(400).json({
                success: false,
                message: "Invalid longitude",
            });
        }

        const isAlternateMode = isAlternate === true;
        const normalizedAlternateReason =
            typeof alternateReason === "string"
                ? alternateReason.trim()
                : "";

        if (isAlternateMode && normalizedAlternateReason.length < 5) {
            return res.status(400).json({
                success: false,
                message:
                    "Emergency check-in reason must be at least 5 characters",
            });
        }

        if (isAlternateMode && normalizedAlternateReason.length > 500) {
            return res.status(400).json({
                success: false,
                message:
                    "Emergency check-in reason must not exceed 500 characters",
            });
        }

        const calculateDistanceMeters = (lat1, lon1, lat2, lon2) => {
            const R = 6371e3;
            const phi1 = (lat1 * Math.PI) / 180;
            const phi2 = (lat2 * Math.PI) / 180;
            const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
            const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

            const a =
                Math.sin(deltaPhi / 2) ** 2 +
                Math.cos(phi1) *
                Math.cos(phi2) *
                Math.sin(deltaLambda / 2) ** 2;

            const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
            return R * c;
        };

        let calculatedDistance = null;

        const hasSiteCoordinates =
            site.latitude !== null &&
            site.latitude !== undefined &&
            site.longitude !== null &&
            site.longitude !== undefined;

        if (hasSiteCoordinates) {
            calculatedDistance = calculateDistanceMeters(
                parsedLatitude,
                parsedLongitude,
                Number(site.latitude),
                Number(site.longitude)
            );

            if (!isAlternateMode && calculatedDistance > 200) {
                return res.status(400).json({
                    success: false,
                    message: `Check-in is only allowed within 200 meters of the site. You are currently ${Math.round(
                        calculatedDistance
                    )}m away from ${site.name}. Use Emergency Check-In only for a genuine emergency.`,
                    data: {
                        distanceMeters: Math.round(calculatedDistance),
                        allowedRadiusMeters: 200,
                        siteName: site.name,
                    },
                });
            }
        } else if (!isAlternateMode) {
            return res.status(400).json({
                success: false,
                message:
                    "This site's GPS coordinates are not configured. Ask the Admin to update the site location, or use Emergency Check-In only if there is a genuine emergency.",
                data: {
                    allowedRadiusMeters: 200,
                    siteName: site.name,
                },
            });
        }

        const existingCheckIn = await prisma.checkInOut.findFirst({
            where: {
                userId,
                siteId,
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
                        latitude: true,
                        longitude: true,
                    },
                },
            },
            orderBy: { checkInAt: "desc" },
        });

        if (existingCheckIn) {
            return res.status(200).json({
                success: true,
                message: "Already checked in at this site",
                data: {
                    checkIn: existingCheckIn,
                    task: {
                        id: assignedTask.id,
                        title: assignedTask.title,
                        description: assignedTask.description,
                        status: assignedTask.status,
                        scheduledAt: assignedTask.scheduledAt,
                        priority: assignedTask.priority,
                        siteId: assignedTask.siteId,
                    },
                    alreadyCheckedIn: true,
                },
            });
        }

// Remaining createCheckIn implementation continues in Part 2.

        // Record check-in visit note with reason if Alternate
        try {
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            const existingVisit = await prisma.visit.findFirst({
                where: {
                    userId,
                    siteId,
                    visitAt: { gte: today },
                },
                orderBy: { visitAt: "desc" },
            });

            const reasonTag = isAlternateMode
                ? `[ALTERNATE_CHECKIN]: ${normalizedAlternateReason} (Geofence Bypassed)`
                : `[STANDARD_CHECKIN]: Verified within 200m`;

            const evJson = JSON.stringify({
                selfie: photoUrl || "",
                nameplate: "",
                photo1: photoUrl || "",
            });

            if (existingVisit) {
                let notes = existingVisit.notes || "";

                if (!notes.includes("[SITE_EVIDENCE]")) {
                    notes = notes
                        ? `${notes}\n[SITE_EVIDENCE]: ${evJson}\n${reasonTag}`
                        : `[SITE_EVIDENCE]: ${evJson}\n${reasonTag}`;
                } else if (
                    !notes.includes("[ALTERNATE_CHECKIN]") &&
                    isAlternateMode
                ) {
                    notes = `${notes}\n${reasonTag}`;
                }

                await prisma.visit.update({
                    where: { id: existingVisit.id },
                    data: {
                        photoUrl: existingVisit.photoUrl || photoUrl || null,
                        latitude: parsedLatitude ?? existingVisit.latitude,
                        longitude: parsedLongitude ?? existingVisit.longitude,
                        ...(isAlternateMode &&
                            [
                                "Site Check-In",
                                "Alternate Check-In (Rain/Emergency)",
                            ].includes(existingVisit.reportType)
                            ? {
                                reportType:
                                    "Alternate Check-In (Rain/Emergency)",
                            }
                            : {}),
                        notes,
                    },
                });
            } else {
                await prisma.visit.create({
                    data: {
                        userId,
                        siteId,
                        visitAt: new Date(),
                        reportType: isAlternateMode
                            ? "Alternate Check-In (Rain/Emergency)"
                            : "Site Check-In",
                        clientName: assignedTask?.title || "Client Site",
                        latitude: parsedLatitude,
                        longitude: parsedLongitude,
                        photoUrl: photoUrl || null,
                        status: "APPROVED",
                        notes: `Check-in verified at ${new Date().toLocaleTimeString(
                            "en-IN"
                        )}\n[SITE_EVIDENCE]: ${evJson}\n${reasonTag}`,
                    },
                });
            }
        } catch (vErr) {
            console.error("Failed to persist check-in visit record:", vErr);
        }

        const checkIn = await prisma.checkInOut.create({
            data: {
                userId,
                siteId,
                checkInAt: new Date(),
                checkInLatitude: parsedLatitude,
                checkInLongitude: parsedLongitude,
                status: "CHECKED_IN",
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
                        latitude: true,
                        longitude: true,
                    },
                },
            },
        });

        return res.status(201).json({
            success: true,
            message: isAlternateMode
                ? "Alternate check-in successful (Rain/Emergency Exception granted)"
                : "Check-in successful",
            data: {
                checkIn: {
                    ...checkIn,
                    checkInPhotoUrl: photoUrl || null,
                    isAlternate: isAlternateMode,
                    alternateReason: isAlternateMode
                        ? normalizedAlternateReason
                        : null,
                },
                task: {
                    id: assignedTask.id,
                    title: assignedTask.title,
                    description: assignedTask.description,
                    status: assignedTask.status,
                    scheduledAt: assignedTask.scheduledAt,
                    priority: assignedTask.priority,
                    siteId: assignedTask.siteId,
                },
                alreadyCheckedIn: false,
            },
        });
    } catch (error) {
        console.error("Create check-in error:", error);
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
 */
const getCheckIns = async (req, res) => {
    try {
        const {
            page = 1,
            limit = 10,
            search = "",
            role = "",
            from = "",
            to = "",
            siteId = "",
            userId = "",
        } = req.query;

        const pageNumber = Math.max(1, parseInt(page, 10) || 1);
        const limitNumber = Math.max(1, parseInt(limit, 10) || 10);
        const skip = (pageNumber - 1) * limitNumber;

        const where = {};

        if (siteId) where.siteId = siteId;
        if (userId) where.userId = userId;

        if (role) {
            where.user = { role };
        }

        if (search) {
            where.OR = [
                {
                    user: {
                        name: {
                            contains: search,
                            mode: "insensitive",
                        },
                    },
                },
                {
                    site: {
                        name: {
                            contains: search,
                            mode: "insensitive",
                        },
                    },
                },
            ];
        }

        if (from || to) {
            where.checkInAt = {};

            if (from) {
                where.checkInAt.gte = new Date(from);
            }

            if (to) {
                const toDate = new Date(to);
                toDate.setHours(23, 59, 59, 999);
                where.checkInAt.lte = toDate;
            }
        }

        const total = await prisma.checkInOut.count({ where });

        const checkIns = await prisma.checkInOut.findMany({
            where,
            skip,
            take: limitNumber,
            include: {
                user: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                        phone: true,
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
                        address: true,
                        latitude: true,
                        longitude: true,
                    },
                },
            },
            orderBy: { checkInAt: "desc" },
        });

        const totalPages = Math.ceil(total / limitNumber);

        // Enrich check-ins with selfie photos, alternate check-in notes,
        // and Emergency Audit reason/remark where a matching visit exists.
        const enrichedCheckIns = await Promise.all(
            checkIns.map(async (ci) => {
                const checkInDate = new Date(ci.checkInAt);
                const dayStart = new Date(checkInDate);
                dayStart.setHours(0, 0, 0, 0);

                const dayEnd = new Date(checkInDate);
                dayEnd.setHours(23, 59, 59, 999);

                // 1. Visit on the same day for this user and site
                let visit = await prisma.visit.findFirst({
                    where: {
                        userId: ci.userId,
                        siteId: ci.siteId,
                        visitAt: { gte: dayStart, lte: dayEnd },
                    },
                    orderBy: { visitAt: "desc" },
                });

                if (!visit) {
                    visit = await prisma.visit.findFirst({
                        where: {
                            userId: ci.userId,
                            siteId: ci.siteId,
                        },
                        orderBy: { visitAt: "desc" },
                    });
                }

                if (!visit || !visit.notes?.includes("[SITE_EVIDENCE]")) {
                    const evVisit = await prisma.visit.findFirst({
                        where: {
                            userId: ci.userId,
                            notes: { contains: "[SITE_EVIDENCE]" },
                        },
                        orderBy: { visitAt: "desc" },
                    });

                    if (evVisit) visit = evVisit;
                }

                const selfie = extractSelfieFromVisit(visit);

                // Check whether alternate check-in note is present
                let isAlternate = false;
                let alternateReason = null;

                if (
                    (visit?.notes &&
                        typeof visit.notes === "string" &&
                        visit.notes.includes("[ALTERNATE_CHECKIN]")) ||
                    (visit?.reportType &&
                        typeof visit.reportType === "string" &&
                        visit.reportType.includes("Alternate"))
                ) {
                    isAlternate = true;
                    const match = visit?.notes?.match(
                        /\[ALTERNATE_CHECKIN\]:\s*([^\n]+)/
                    );
                    alternateReason = match
                        ? match[1].trim()
                        : "Rain / Weather Emergency";
                }

                if (!isAlternate) {
                    const twentyFourHoursBefore = new Date(
                        checkInDate.getTime() - 24 * 60 * 60 * 1000
                    );
                    const twentyFourHoursAfter = new Date(
                        checkInDate.getTime() + 24 * 60 * 60 * 1000
                    );

                    const anyAlt = await prisma.visit.findFirst({
                        where: {
                            userId: ci.userId,
                            siteId: ci.siteId,
                            OR: [
                                {
                                    notes: {
                                        contains: "[ALTERNATE_CHECKIN]",
                                    },
                                },
                                {
                                    reportType: {
                                        contains: "Alternate",
                                    },
                                },
                            ],
                            visitAt: {
                                gte: twentyFourHoursBefore,
                                lte: twentyFourHoursAfter,
                            },
                        },
                        orderBy: { visitAt: "desc" },
                    });

                    if (anyAlt) {
                        isAlternate = true;
                        const match = anyAlt.notes?.match(
                            /\[ALTERNATE_CHECKIN\]:\s*([^\n]+)/
                        );
                        alternateReason = match
                            ? match[1].trim()
                            : "Rain / Weather Emergency";
                    }
                }

                // Emergency Audit details are separate from check-in mode.
                // Find a matching audit visit for this supervisor/site/day.
                let emergencyAuditReason = null;
                let emergencyAuditRemark = null;

                const emergencyAuditVisit = await prisma.visit.findFirst({
                    where: {
                        userId: ci.userId,
                        siteId: ci.siteId,
                        visitAt: { gte: dayStart, lte: dayEnd },
                        OR: [
                            {
                                notes: {
                                    contains: "[EMERGENCY_AUDIT]",
                                },
                            },
                            {
                                reportType: {
                                    contains: "Emergency Audit",
                                },
                            },
                        ],
                    },
                    orderBy: { visitAt: "desc" },
                });

                if (emergencyAuditVisit) {
                    const notes =
                        typeof emergencyAuditVisit.notes === "string"
                            ? emergencyAuditVisit.notes
                            : "";

                    const match = notes.match(
                        /\[EMERGENCY_AUDIT\]:\s*([^\n]*)/
                    );

                    if (match) {
                        const payload = match[1].trim();
                        const separator = payload.indexOf("|");

                        if (separator >= 0) {
                            emergencyAuditReason =
                                payload.slice(0, separator).trim() || null;
                            emergencyAuditRemark =
                                payload.slice(separator + 1).trim() || null;
                        } else {
                            emergencyAuditReason = payload || null;
                        }
                    }

                    emergencyAuditReason =
                        emergencyAuditReason ||
                        emergencyAuditVisit.emergencyReason ||
                        null;

                    emergencyAuditRemark =
                        emergencyAuditRemark ||
                        emergencyAuditVisit.emergencyRemark ||
                        null;
                }

                return {
                    ...ci,
                    checkInPhotoUrl: selfie,
                    isAlternate,
                    alternateReason,
                    isEmergencyAudit: Boolean(emergencyAuditVisit),
                    emergencyAuditReason,
                    emergencyAuditRemark,
                };
            })
        );

        return res.status(200).json({
            success: true,
            count: enrichedCheckIns.length,
            pagination: {
                page: pageNumber,
                limit: limitNumber,
                total,
                totalPages,
            },
            data: {
                checkIns: enrichedCheckIns,
            },
        });
    } catch (error) {
        console.error("Get check-ins error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to fetch check-ins",
            error:
                process.env.NODE_ENV === "development"
                    ? error.message
                    : undefined,
        });
    }
};

/*
 * ============================================================
 * CHECK-OUT
 * ============================================================
 */
const checkOut = async (req, res) => {
    try {
        const userId = req.user.userId;
        const { id } = req.params;
        const { latitude, longitude } = req.body;

        const checkIn = await prisma.checkInOut.findFirst({
            where: {
                id,
                userId,
                status: "CHECKED_IN",
                checkOutAt: null,
            },
        });

        if (!checkIn) {
            return res.status(404).json({
                success: false,
                message: "Active check-in not found",
            });
        }

        const checkInUser = await prisma.user.findUnique({
            where: { id: userId },
            select: { id: true, role: true, status: true },
        });

        if (!checkInUser) {
            return res.status(404).json({
                success: false,
                message: "User not found",
            });
        }

        if (checkInUser.status !== "ACTIVE") {
            return res.status(403).json({
                success: false,
                message: "User account is inactive",
            });
        }

        if (checkInUser.role !== "SUPERVISOR") {
            return res.status(403).json({
                success: false,
                message: "Only active Supervisors can check out",
            });
        }

        const parsedCheckoutLatitude =
            latitude !== undefined && latitude !== null && latitude !== ""
                ? Number(latitude)
                : null;

        const parsedCheckoutLongitude =
            longitude !== undefined && longitude !== null && longitude !== ""
                ? Number(longitude)
                : null;

        let distanceTravelled = null;

        if (
            checkIn.checkInLatitude !== null &&
            checkIn.checkInLongitude !== null &&
            parsedCheckoutLatitude !== null &&
            parsedCheckoutLongitude !== null
        ) {
            const toRadians = (deg) => deg * (Math.PI / 180);
            const earthRadiusKm = 6371;

            const lat1 = toRadians(Number(checkIn.checkInLatitude));
            const lat2 = toRadians(parsedCheckoutLatitude);
            const deltaLat = toRadians(
                parsedCheckoutLatitude - Number(checkIn.checkInLatitude)
            );
            const deltaLon = toRadians(
                parsedCheckoutLongitude -
                Number(checkIn.checkInLongitude)
            );

            const a =
                Math.sin(deltaLat / 2) ** 2 +
                Math.cos(lat1) *
                Math.cos(lat2) *
                Math.sin(deltaLon / 2) ** 2;

            const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

            distanceTravelled = Number((earthRadiusKm * c).toFixed(3));
        }

        const updatedCheckIn = await prisma.checkInOut.update({
            where: { id: checkIn.id },
            data: {
                checkOutAt: new Date(),
                checkOutLatitude: parsedCheckoutLatitude,
                checkOutLongitude: parsedCheckoutLongitude,
                distanceTravelled,
                status: "CHECKED_OUT",
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
                        latitude: true,
                        longitude: true,
                    },
                },
            },
        });

        sendAuditCompletionEmail({
            checkInId: updatedCheckIn.id,
        })
            .then((result) => {
                console.log("Audit completion email result:", result);
            })
            .catch((emailError) => {
                console.error(
                    "Audit completion email failed:",
                    emailError
                );
            });

        return res.status(200).json({
            success: true,
            message: "Check-out successful",
            data: {
                checkIn: updatedCheckIn,
            },
        });
    } catch (error) {
        console.error("Check-out error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to check out",
            error:
                process.env.NODE_ENV === "development"
                    ? error.message
                    : undefined,
        });
    }
};

/*
 * ============================================================
 * GET CHECK-IN BY ID
 * ============================================================
 */
const getCheckInById = async (req, res) => {
    try {
        const { id } = req.params;
        const currentUser = req.user;

        const checkIn = await prisma.checkInOut.findUnique({
            where: { id },
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

        if (!checkIn) {
            return res.status(404).json({
                success: false,
                message: "Check-in record not found",
            });
        }

        if (
            currentUser.role === "SUPERVISOR" &&
            checkIn.userId !== currentUser.userId
        ) {
            return res.status(403).json({
                success: false,
                message: "You do not have permission to access this check-in",
            });
        }

        let visit = await prisma.visit.findFirst({
            where: {
                userId: checkIn.userId,
                siteId: checkIn.siteId,
                notes: { contains: "[SITE_EVIDENCE]" },
            },
            orderBy: { visitAt: "desc" },
        });

        if (!visit) {
            visit = await prisma.visit.findFirst({
                where: {
                    userId: checkIn.userId,
                    siteId: checkIn.siteId,
                },
                orderBy: { visitAt: "desc" },
            });
        }

        const selfie = extractSelfieFromVisit(visit);

        let isAlternate = false;
        let alternateReason = null;

        if (
            (visit?.notes &&
                typeof visit.notes === "string" &&
                visit.notes.includes("[ALTERNATE_CHECKIN]")) ||
            (visit?.reportType &&
                typeof visit.reportType === "string" &&
                visit.reportType.includes("Alternate"))
        ) {
            const match = visit?.notes?.match(
                /\[ALTERNATE_CHECKIN\]:\s*([^\n]+)/
            );

            isAlternate = true;
            alternateReason = match
                ? match[1].trim()
                : "Rain / Weather Emergency";
        }

        if (!isAlternate) {
            const checkInDate = new Date(checkIn.checkInAt);

            const twentyFourHoursBefore = new Date(
                checkInDate.getTime() - 24 * 60 * 60 * 1000
            );

            const twentyFourHoursAfter = new Date(
                checkInDate.getTime() + 24 * 60 * 60 * 1000
            );

            const anyAlt = await prisma.visit.findFirst({
                where: {
                    userId: checkIn.userId,
                    siteId: checkIn.siteId,
                    OR: [
                        {
                            notes: {
                                contains: "[ALTERNATE_CHECKIN]",
                            },
                        },
                        {
                            reportType: {
                                contains: "Alternate",
                            },
                        },
                    ],
                    visitAt: {
                        gte: twentyFourHoursBefore,
                        lte: twentyFourHoursAfter,
                    },
                },
                orderBy: { visitAt: "desc" },
            });

            if (anyAlt) {
                isAlternate = true;

                const match = anyAlt.notes?.match(
                    /\[ALTERNATE_CHECKIN\]:\s*([^\n]+)/
                );

                alternateReason = match
                    ? match[1].trim()
                    : "Rain / Weather Emergency";
            }
        }

        return res.status(200).json({
            success: true,
            data: {
                checkIn: {
                    ...checkIn,
                    checkInPhotoUrl: selfie,
                    isAlternate,
                    alternateReason,
                },
            },
        });
    } catch (error) {
        console.error("Get check-in by ID error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to fetch check-in record",
            error:
                process.env.NODE_ENV === "development"
                    ? error.message
                    : undefined,
        });
    }
};

export {
    createCheckIn,
    getCheckIns,
    checkOut,
    getCheckInById,
};