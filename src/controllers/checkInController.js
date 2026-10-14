import prisma from "../config/prisma.js";
import { sendAuditCompletionEmail } from "../services/auditEmailService.js";

/*
 * ============================================================
 * HELPER: EXTRACT SUPERVISOR SELFIE FROM VISIT
 * ============================================================
 * Extracts the actual supervisor face selfie from [SITE_EVIDENCE]
 * so that site entrance photos (photo1) are never mistaken for selfies.
 */
const extractSelfieFromVisit = (visit) => {
    if (!visit) return null;

    // Priority 1: Extract 'selfie' from [SITE_EVIDENCE] in notes
    if (visit.notes && typeof visit.notes === "string") {
        try {
            const m = visit.notes.match(/\[SITE_EVIDENCE\]:\s*(\{[\s\S]*?\})/);
            if (m) {
                const ev = JSON.parse(m[1]);
                if (ev.selfie && typeof ev.selfie === "string" && ev.selfie.trim().length > 0) {
                    return ev.selfie.trim();
                }
            }
        } catch (_) { }
    }

    // Priority 2: Extract from direct [CHECKIN_SELFIE] tag in notes
    if (visit.notes && typeof visit.notes === "string") {
        try {
            const m = visit.notes.match(/\[CHECKIN_SELFIE\]:\s*(data:image\/[^\s\n]+|https?:\/\/[^\s\n]+)/);
            if (m) {
                return m[1].trim();
            }
        } catch (_) { }
    }

    // Priority 3: If visit was created as dedicated "Site Check-In", photoUrl is check-in selfie
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
        } = req.body;

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
                siteId: siteId,
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
                message: "This task is not assigned to the logged-in Supervisor for this site.",
                data: {
                    userId: userId,
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

        if (
            parsedLatitude !== null &&
            (Number.isNaN(parsedLatitude) || parsedLatitude < -90 || parsedLatitude > 90)
        ) {
            return res.status(400).json({
                success: false,
                message: "Invalid latitude",
            });
        }

        if (
            parsedLongitude !== null &&
            (Number.isNaN(parsedLongitude) || parsedLongitude < -180 || parsedLongitude > 180)
        ) {
            return res.status(400).json({
                success: false,
                message: "Invalid longitude",
            });
        }

        // 100-Meter Geofence check
        const calculateDistanceMeters = (lat1, lon1, lat2, lon2) => {
            const R = 6371e3;
            const phi1 = (lat1 * Math.PI) / 180;
            const phi2 = (lat2 * Math.PI) / 180;
            const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
            const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;
            const a =
                Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
                Math.cos(phi1) * Math.cos(phi2) *
                Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
            const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
            return R * c;
        };

        if (
            site.latitude !== null &&
            site.latitude !== undefined &&
            site.longitude !== null &&
            site.longitude !== undefined &&
            parsedLatitude !== null &&
            parsedLongitude !== null
        ) {
            const distanceMeters = calculateDistanceMeters(
                parsedLatitude,
                parsedLongitude,
                site.latitude,
                site.longitude
            );

            if (distanceMeters > 100) {
                return res.status(400).json({
                    success: false,
                    message: `Check-in is only allowed within 100 meters of the site. You are currently ${Math.round(distanceMeters)}m away from ${site.name}.`,
                    data: {
                        distanceMeters: Math.round(distanceMeters),
                        allowedRadiusMeters: 100,
                        siteName: site.name,
                    },
                });
            }
        } else if (
            (site.latitude === null || site.longitude === null) &&
            parsedLatitude !== null &&
            parsedLongitude !== null
        ) {
            await prisma.site.update({
                where: { id: siteId },
                data: {
                    latitude: parsedLatitude,
                    longitude: parsedLongitude,
                },
            });
        }

        const existingCheckIn = await prisma.checkInOut.findFirst({
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

        // Save check-in selfie photo if provided
        if (photoUrl) {
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

                const evJson = JSON.stringify({ selfie: photoUrl, nameplate: "", photo1: photoUrl });

                if (existingVisit) {
                    let notes = existingVisit.notes || "";
                    if (!notes.includes("[SITE_EVIDENCE]")) {
                        notes = notes ? `${notes}\n[SITE_EVIDENCE]: ${evJson}` : `[SITE_EVIDENCE]: ${evJson}`;
                    } else {
                        try {
                            const m = notes.match(/\[SITE_EVIDENCE\]:\s*(\{[\s\S]*?\})/);
                            if (m) {
                                const ev = JSON.parse(m[1]);
                                ev.selfie = photoUrl;
                                notes = notes.replace(m[0], `[SITE_EVIDENCE]: ${JSON.stringify(ev)}`);
                            }
                        } catch (_) { }
                    }

                    await prisma.visit.update({
                        where: { id: existingVisit.id },
                        data: {
                            photoUrl: existingVisit.photoUrl || photoUrl,
                            latitude: parsedLatitude ?? existingVisit.latitude,
                            longitude: parsedLongitude ?? existingVisit.longitude,
                            notes,
                        },
                    });
                } else {
                    await prisma.visit.create({
                        data: {
                            userId,
                            siteId,
                            visitAt: new Date(),
                            reportType: "Site Check-In",
                            clientName: assignedTask?.title || "Client Site",
                            latitude: parsedLatitude,
                            longitude: parsedLongitude,
                            photoUrl,
                            status: "APPROVED",
                            notes: `Check-in selfie photo verified at ${new Date().toLocaleTimeString("en-IN")}\n[SITE_EVIDENCE]: ${evJson}`,
                        },
                    });
                }
            } catch (vErr) {
                console.error("Failed to persist check-in selfie in visit:", vErr);
            }
        }

        const checkIn = await prisma.checkInOut.create({
            data: {
                userId: userId,
                siteId: siteId,
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
                    },
                },
            },
        });

        return res.status(201).json({
            success: true,
            message: "Check-in successful",
            data: {
                checkIn: {
                    ...checkIn,
                    checkInPhotoUrl: photoUrl || null,
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

        if (currentUser.role === "SUPERVISOR") {
            where.userId = currentUser.userId;
        }

        if (siteId) {
            const site = await prisma.site.findUnique({
                where: { id: siteId },
                select: { id: true },
            });

            if (!site) {
                return res.status(404).json({
                    success: false,
                    message: "Site not found",
                });
            }

            where.siteId = siteId;
        }

        const pageNumber = Math.max(parseInt(page, 10) || 1, 1);
        const limitNumber = Math.min(Math.max(parseInt(limit, 10) || 10, 1), 100);
        const skip = (pageNumber - 1) * limitNumber;

        if (role) {
            const allowedRoles = ["SUPER_ADMIN", "SUPERVISOR", "FIELD_STAFF"];
            if (!allowedRoles.includes(role)) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid user role",
                });
            }
            where.user = { role: role };
        }

        if (search && search.trim()) {
            const searchValue = search.trim();
            where.OR = [
                { user: { name: { contains: searchValue, mode: "insensitive" } } },
                { user: { email: { contains: searchValue, mode: "insensitive" } } },
                { site: { name: { contains: searchValue, mode: "insensitive" } } },
                { site: { siteCode: { contains: searchValue, mode: "insensitive" } } },
                { site: { city: { contains: searchValue, mode: "insensitive" } } },
            ];
        }

        if (from || to) {
            where.checkInAt = {};
            if (from) where.checkInAt.gte = new Date(`${from}T00:00:00.000Z`);
            if (to) where.checkInAt.lte = new Date(`${to}T23:59:59.999Z`);
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
                    },
                },
            },
            orderBy: { checkInAt: "desc" },
        });

        const totalPages = Math.ceil(total / limitNumber);

        // Enrich each check-in strictly with Supervisor Selfie from [SITE_EVIDENCE]
        const enrichedCheckIns = await Promise.all(
            checkIns.map(async (ci) => {
                const checkInDate = new Date(ci.checkInAt);
                const dayStart = new Date(checkInDate);
                dayStart.setHours(0, 0, 0, 0);
                const dayEnd = new Date(checkInDate);
                dayEnd.setHours(23, 59, 59, 999);

                // 1. Visit on the same day for this user & site with [SITE_EVIDENCE]
                let visit = await prisma.visit.findFirst({
                    where: {
                        userId: ci.userId,
                        siteId: ci.siteId,
                        visitAt: { gte: dayStart, lte: dayEnd },
                        notes: { contains: "[SITE_EVIDENCE]" },
                    },
                    orderBy: { visitAt: "desc" },
                });

                // 2. If not found, any visit on same day
                if (!visit) {
                    visit = await prisma.visit.findFirst({
                        where: {
                            userId: ci.userId,
                            siteId: ci.siteId,
                            visitAt: { gte: dayStart, lte: dayEnd },
                        },
                        orderBy: { visitAt: "desc" },
                    });
                }

                // 3. Fallback: closest visit for user & site with [SITE_EVIDENCE]
                if (!visit || !visit.notes?.includes("[SITE_EVIDENCE]")) {
                    const evVisit = await prisma.visit.findFirst({
                        where: {
                            userId: ci.userId,
                            siteId: ci.siteId,
                            notes: { contains: "[SITE_EVIDENCE]" },
                        },
                        orderBy: { visitAt: "desc" },
                    });
                    if (evVisit) {
                        visit = evVisit;
                    }
                }

                // 4. Fallback: any visit by this user with [SITE_EVIDENCE]
                if (!visit || !visit.notes?.includes("[SITE_EVIDENCE]")) {
                    const anyEvVisit = await prisma.visit.findFirst({
                        where: {
                            userId: ci.userId,
                            notes: { contains: "[SITE_EVIDENCE]" },
                        },
                        orderBy: { visitAt: "desc" },
                    });
                    if (anyEvVisit) {
                        visit = anyEvVisit;
                    }
                }

                const selfie = extractSelfieFromVisit(visit);

                return {
                    ...ci,
                    checkInPhotoUrl: selfie,
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
            error: process.env.NODE_ENV === "development" ? error.message : undefined,
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
            const deltaLat = toRadians(parsedCheckoutLatitude - Number(checkIn.checkInLatitude));
            const deltaLon = toRadians(parsedCheckoutLongitude - Number(checkIn.checkInLongitude));

            const a =
                Math.sin(deltaLat / 2) ** 2 +
                Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;
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
                console.error("Audit completion email failed:", emailError);
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
            error: process.env.NODE_ENV === "development" ? error.message : undefined,
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

        if (currentUser.role === "SUPERVISOR" && checkIn.userId !== currentUser.userId) {
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
                where: { userId: checkIn.userId, siteId: checkIn.siteId },
                orderBy: { visitAt: "desc" },
            });
        }

        const selfie = extractSelfieFromVisit(visit);

        return res.status(200).json({
            success: true,
            data: {
                checkIn: {
                    ...checkIn,
                    checkInPhotoUrl: selfie,
                },
            },
        });
    } catch (error) {
        console.error("Get check-in by ID error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to fetch check-in record",
            error: process.env.NODE_ENV === "development" ? error.message : undefined,
        });
    }
};

export {
    createCheckIn,
    getCheckIns,
    checkOut,
    getCheckInById,
};