import prisma from "../config/prisma.js";

const createTask = async ({
    title,
    description,
    priority,
    scheduledAt,
    assignedToId,
    assignedById,
    siteId,
    campaignId,
}) => {
    const task = await prisma.task.create({
        data: {
            title: title.trim(),
            description: description?.trim() || null,
            priority: priority || "MEDIUM",
            scheduledAt: new Date(scheduledAt),
            assignedToId,
            assignedById,
            siteId,
            campaignId: campaignId || null,
        },
        include: {
            assignedTo: {
                select: {
                    id: true,
                    name: true,
                    email: true,
                    role: true,
                },
            },
            assignedBy: {
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
                },
            },
            campaign: {
                select: {
                    id: true,
                    name: true,
                    status: true,
                },
            },
        },
    });

    return task;
};

export {
    createTask,
};