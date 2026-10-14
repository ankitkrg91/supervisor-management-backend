import prisma from "../config/prisma.js";

const extractTaskIdFromNotes = (notes) => {
    if (typeof notes !== "string" || !notes.trim()) return null;
    const match = notes.match(/Task ID:\s*([a-f0-9-]{36})/i);
    return match ? match[1] : null;
};

const visitInclude = {
    user: {
        select: { id: true, name: true, email: true, phone: true, role: true, status: true },
    },
    site: {
        select: {
            id: true, name: true, siteCode: true, address: true,
            city: true, state: true, pincode: true, latitude: true, longitude: true,
        },
    },
    auditSubmission: {
        select: {
            id: true,
            templateId: true,
            submittedAt: true,
            answers: {
                select: {
                    id: true,
                    questionNo: true,
                    questionText: true,
                    booleanValue: true,
                    textValue: true,
                },
                orderBy: { questionNo: "asc" },
            },
        },
    },
};

const createVisit = async (req, res) => {
    try {
        const userId = req.user.userId;
        const {
            siteId, visitAt, reportType, clientName, branch,
            region, latitude, longitude, photoUrl, photoFileId, notes,
        } = req.body || {};

        if (!siteId) {
            return res.status(400).json({ success: false, message: "siteId is required" });
        }

        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { id: true, name: true, email: true, role: true, status: true },
        });

        if (!user) return res.status(404).json({ success: false, message: "User not found" });
        if (user.status !== "ACTIVE") return res.status(403).json({ success: false, message: "User account is inactive" });
        if (user.role !== "SUPERVISOR") return res.status(403).json({ success: false, message: "Only active Supervisors can create visits" });

        const site = await prisma.site.findUnique({
            where: { id: siteId },
            select: {
                id: true, name: true, siteCode: true, status: true,
                address: true, city: true, state: true, pincode: true, latitude: true, longitude: true,
            },
        });

        if (!site) return res.status(404).json({ success: false, message: "Site not found" });
        if (site.status !== "ACTIVE") return res.status(400).json({ success: false, message: "Site is inactive" });

        const taskId = extractTaskIdFromNotes(notes);
        let assignedTask = null;

        if (taskId) {
            assignedTask = await prisma.task.findUnique({
                where: { id: taskId },
                select: { id: true, title: true, status: true, siteId: true, assignedToId: true },
            });
            if (!assignedTask) return res.status(404).json({ success: false, message: "Task not found" });
            if (assignedTask.assignedToId !== userId) return res.status(403).json({ success: false, message: "Task is not assigned to logged-in Supervisor" });
            if (assignedTask.siteId !== siteId) return res.status(403).json({ success: false, message: "Task belongs to a different site" });
            if (assignedTask.status === "CANCELLED") return res.status(400).json({ success: false, message: "Cancelled tasks cannot create visits" });
        } else {
            assignedTask = await prisma.task.findFirst({
                where: { assignedToId: userId, siteId, status: { not: "CANCELLED" } },
                orderBy: { scheduledAt: "asc" },
            });
            if (!assignedTask) return res.status(403).json({ success: false, message: "No active task is assigned for this site" });
        }

        const parsedVisitAt = visitAt ? new Date(visitAt) : new Date();
        if (Number.isNaN(parsedVisitAt.getTime())) {
            return res.status(400).json({ success: false, message: "Invalid visit date/time" });
        }

        const parsedLatitude = latitude !== undefined && latitude !== null && latitude !== "" ? Number(latitude) : null;
        const parsedLongitude = longitude !== undefined && longitude !== null && longitude !== "" ? Number(longitude) : null;

        const cleanPhotoUrl = typeof photoUrl === "string" && photoUrl.trim() ? photoUrl.trim() : null;
        const cleanPhotoFileId = typeof photoFileId === "string" && photoFileId.trim() ? photoFileId.trim() : null;
        const cleanNotes = typeof notes === "string" && notes.trim() ? notes.trim() : null;

        // Check existing visit for this task OR recent check-in visit at this site today
        let existingVisit = null;
        if (taskId) {
            existingVisit = await prisma.visit.findFirst({
                where: { userId, siteId, notes: { contains: `Task ID: ${taskId}` } },
                orderBy: { visitAt: "desc" },
                include: visitInclude,
            });
        }
        if (!existingVisit) {
            const startOfDay = new Date();
            startOfDay.setHours(0, 0, 0, 0);
            existingVisit = await prisma.visit.findFirst({
                where: { userId, siteId, visitAt: { gte: startOfDay }, auditSubmission: { is: null } },
                orderBy: { visitAt: "desc" },
                include: visitInclude,
            });
        }

        if (existingVisit) {
            const updateData = {};
            if (cleanPhotoUrl) updateData.photoUrl = cleanPhotoUrl;
            if (cleanPhotoFileId) updateData.photoFileId = cleanPhotoFileId;
            if (parsedLatitude !== null) updateData.latitude = parsedLatitude;
            if (parsedLongitude !== null) updateData.longitude = parsedLongitude;
            if (cleanNotes) updateData.notes = cleanNotes;
            if (typeof reportType === "string" && reportType.trim()) updateData.reportType = reportType.trim();
            if (typeof clientName === "string" && clientName.trim()) updateData.clientName = clientName.trim();

            const updatedVisit = await prisma.visit.update({
                where: { id: existingVisit.id },
                data: updateData,
                include: visitInclude,
            });

            return res.status(200).json({
                success: true,
                message: "Existing visit updated with site evidence photos",
                data: { visit: updatedVisit },
            });
        }

        const visit = await prisma.visit.create({
            data: {
                userId,
                siteId,
                visitAt: parsedVisitAt,
                reportType: typeof reportType === "string" && reportType.trim() ? reportType.trim() : null,
                clientName: typeof clientName === "string" && clientName.trim() ? clientName.trim() : null,
                branch: typeof branch === "string" && branch.trim() ? branch.trim() : null,
                region: typeof region === "string" && region.trim() ? region.trim() : null,
                latitude: parsedLatitude,
                longitude: parsedLongitude,
                photoUrl: cleanPhotoUrl,
                photoFileId: cleanPhotoFileId,
                notes: cleanNotes,
                status: "PENDING",
            },
            include: visitInclude,
        });

        return res.status(201).json({
            success: true,
            message: "Visit created successfully",
            data: { visit },
        });
    } catch (error) {
        console.error("Create visit error:", error);
        return res.status(500).json({ success: false, message: "Failed to create visit" });
    }
};

const getVisits = async (req, res) => {
    try {
        const currentUser = req.user;
        const { from, to, status, role, search, siteId, region, branch, clientName, page = "1", limit = "100" } = req.query;
        const where = {};

        if (currentUser.role === "SUPERVISOR") where.userId = currentUser.userId;
        where.user = { role: role || "SUPERVISOR" };
        if (siteId) where.siteId = siteId;

        if (status) {
            const allowed = ["PENDING", "VERIFIED", "UNVERIFIED", "REJECTED"];
            if (!allowed.includes(status)) return res.status(400).json({ success: false, message: "Invalid visit status" });
            where.status = status;
        }

        if (region && region !== "ALL") where.region = region;
        if (branch && branch !== "ALL") where.branch = branch;
        if (clientName && clientName !== "ALL") where.clientName = { contains: clientName, mode: "insensitive" };

        if (from || to) {
            where.visitAt = {};
            if (from) where.visitAt.gte = new Date(`${from}T00:00:00.000Z`);
            if (to) where.visitAt.lte = new Date(`${to}T23:59:59.999Z`);
        }

        if (search && search.trim()) {
            const q = search.trim();
            where.AND = [{
                OR: [
                    { user: { name: { contains: q, mode: "insensitive" } } },
                    { user: { email: { contains: q, mode: "insensitive" } } },
                    { site: { name: { contains: q, mode: "insensitive" } } },
                    { site: { siteCode: { contains: q, mode: "insensitive" } } },
                    { clientName: { contains: q, mode: "insensitive" } },
                ],
            }];
        }

        const pageNumber = Math.max(parseInt(page, 10) || 1, 1);
        const limitNumber = Math.min(Math.max(parseInt(limit, 10) || 100, 1), 100);
        const skip = (pageNumber - 1) * limitNumber;

        const [total, visits] = await Promise.all([
            prisma.visit.count({ where }),
            prisma.visit.findMany({
                where,
                skip,
                take: limitNumber,
                orderBy: { visitAt: "desc" },
                include: visitInclude,
            }),
        ]);

        return res.status(200).json({
            success: true,
            count: visits.length,
            data: { visits },
            pagination: {
                page: pageNumber,
                limit: limitNumber,
                total,
                totalPages: Math.ceil(total / limitNumber),
            },
        });
    } catch (error) {
        console.error("Get visits error:", error);
        return res.status(500).json({ success: false, message: "Failed to fetch visits" });
    }
};

const getVisitById = async (req, res) => {
    try {
        const visit = await prisma.visit.findUnique({
            where: { id: req.params.id },
            include: visitInclude,
        });
        if (!visit) return res.status(404).json({ success: false, message: "Visit not found" });
        if (req.user.role === "SUPERVISOR" && visit.userId !== req.user.userId) {
            return res.status(403).json({ success: false, message: "Access denied" });
        }
        return res.status(200).json({ success: true, data: { visit } });
    } catch (error) {
        console.error("Get visit by ID error:", error);
        return res.status(500).json({ success: false, message: "Failed to fetch visit" });
    }
};

const updateVisitStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const status = String(req.body?.status || "").trim().toUpperCase();
        if (!["VERIFIED", "UNVERIFIED", "REJECTED"].includes(status)) {
            return res.status(400).json({ success: false, message: "Invalid visit status" });
        }
        const updatedVisit = await prisma.visit.update({
            where: { id },
            data: { status },
            include: visitInclude,
        });
        return res.status(200).json({
            success: true,
            message: "Visit status updated successfully",
            data: { visit: updatedVisit },
        });
    } catch (error) {
        console.error("Update visit status error:", error);
        return res.status(500).json({ success: false, message: "Failed to update visit status" });
    }
};

export { createVisit, getVisits, getVisitById, updateVisitStatus };