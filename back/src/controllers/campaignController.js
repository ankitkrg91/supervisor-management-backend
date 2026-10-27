import prisma from "../config/prisma.js";

// =========================================================
// CREATE CAMPAIGN
// =========================================================

const createCampaign = async (req, res) => {
    try {
        const {
            name,
            description,
            startDate,
            endDate,
        } = req.body;

        // ---------------------------------------------
        // Name validation
        // ---------------------------------------------

        if (
            typeof name !== "string" ||
            !name.trim()
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "Campaign name is required",
            });
        }

        const normalizedName =
            name.trim();

        if (
            normalizedName.length > 150
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "Campaign name cannot exceed 150 characters",
            });
        }

        // ---------------------------------------------
        // Date validation
        // ---------------------------------------------

        let parsedStartDate = null;
        let parsedEndDate = null;

        if (startDate) {
            parsedStartDate =
                new Date(startDate);

            if (
                Number.isNaN(
                    parsedStartDate.getTime()
                )
            ) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Invalid campaign start date",
                });
            }
        }

        if (endDate) {
            parsedEndDate =
                new Date(endDate);

            if (
                Number.isNaN(
                    parsedEndDate.getTime()
                )
            ) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Invalid campaign end date",
                });
            }
        }

        if (
            parsedStartDate &&
            parsedEndDate &&
            parsedEndDate < parsedStartDate
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "End date cannot be before start date",
            });
        }

        // ---------------------------------------------
        // Create campaign
        // ---------------------------------------------

        const campaign =
            await prisma.campaign.create({
                data: {
                    name: normalizedName,

                    description:
                        typeof description ===
                            "string"
                            ? description.trim() ||
                            null
                            : null,

                    startDate:
                        parsedStartDate,

                    endDate:
                        parsedEndDate,

                    status: "ACTIVE",
                },
            });

        return res.status(201).json({
            success: true,
            message:
                "Campaign created successfully",
            data: {
                campaign,
            },
        });
    } catch (error) {
        console.error(
            "Create campaign error:",
            error
        );

        return res.status(500).json({
            success: false,
            message:
                "Failed to create campaign",
        });
    }
};

// =========================================================
// GET CAMPAIGNS
// =========================================================

const getCampaigns = async (req, res) => {
    try {
        const {
            status,
            search,
            page = 1,
            limit = 10,
        } = req.query;

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

        const where = {};

        // ---------------------------------------------
        // Status filter
        // ---------------------------------------------

        if (status) {
            const allowedStatuses = [
                "ACTIVE",
                "INACTIVE",
                "COMPLETED",
            ];

            if (
                !allowedStatuses.includes(
                    status
                )
            ) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Invalid campaign status",
                });
            }

            where.status = status;
        }

        // ---------------------------------------------
        // Search
        // ---------------------------------------------

        if (
            typeof search === "string" &&
            search.trim()
        ) {
            const normalizedSearch =
                search.trim();

            where.OR = [
                {
                    name: {
                        contains:
                            normalizedSearch,
                        mode: "insensitive",
                    },
                },
                {
                    description: {
                        contains:
                            normalizedSearch,
                        mode: "insensitive",
                    },
                },
            ];
        }

        // ---------------------------------------------
        // Query
        // ---------------------------------------------

        const [
            total,
            campaigns,
        ] = await Promise.all([
            prisma.campaign.count({
                where,
            }),

            prisma.campaign.findMany({
                where,

                include: {
                    _count: {
                        select: {
                            tasks: true,
                        },
                    },
                },

                orderBy: {
                    createdAt: "desc",
                },

                skip:
                    (currentPage - 1) *
                    perPage,

                take: perPage,
            }),
        ]);

        return res.status(200).json({
            success: true,

            data: {
                campaigns,

                pagination: {
                    page: currentPage,
                    limit: perPage,
                    total,
                    totalPages:
                        Math.ceil(
                            total / perPage
                        ),
                },
            },
        });
    } catch (error) {
        console.error(
            "Get campaigns error:",
            error
        );

        return res.status(500).json({
            success: false,
            message:
                "Failed to fetch campaigns",
        });
    }
};

// =========================================================
// UPDATE CAMPAIGN
// =========================================================

const updateCampaign = async (req, res) => {
    try {
        const { id } = req.params;

        const {
            name,
            description,
            startDate,
            endDate,
            status,
        } = req.body;

        // ---------------------------------------------
        // Find campaign
        // ---------------------------------------------

        const existingCampaign =
            await prisma.campaign.findUnique({
                where: {
                    id,
                },
            });

        if (!existingCampaign) {
            return res.status(404).json({
                success: false,
                message:
                    "Campaign not found",
            });
        }

        // ---------------------------------------------
        // Name validation
        // ---------------------------------------------

        let normalizedName;

        if (name !== undefined) {
            if (
                typeof name !== "string" ||
                !name.trim()
            ) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Campaign name cannot be empty",
                });
            }

            normalizedName =
                name.trim();

            if (
                normalizedName.length > 150
            ) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Campaign name cannot exceed 150 characters",
                });
            }
        }

        // ---------------------------------------------
        // Status validation
        // ---------------------------------------------

        if (
            status !== undefined &&
            ![
                "ACTIVE",
                "INACTIVE",
                "COMPLETED",
            ].includes(status)
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "Invalid campaign status",
            });
        }

        // ---------------------------------------------
        // Date validation
        // ---------------------------------------------

        let parsedStartDate =
            existingCampaign.startDate;

        let parsedEndDate =
            existingCampaign.endDate;

        if (startDate !== undefined) {
            if (
                startDate === null ||
                startDate === ""
            ) {
                parsedStartDate = null;
            } else {
                parsedStartDate =
                    new Date(startDate);

                if (
                    Number.isNaN(
                        parsedStartDate.getTime()
                    )
                ) {
                    return res.status(400).json({
                        success: false,
                        message:
                            "Invalid campaign start date",
                    });
                }
            }
        }

        if (endDate !== undefined) {
            if (
                endDate === null ||
                endDate === ""
            ) {
                parsedEndDate = null;
            } else {
                parsedEndDate =
                    new Date(endDate);

                if (
                    Number.isNaN(
                        parsedEndDate.getTime()
                    )
                ) {
                    return res.status(400).json({
                        success: false,
                        message:
                            "Invalid campaign end date",
                    });
                }
            }
        }

        if (
            parsedStartDate &&
            parsedEndDate &&
            parsedEndDate < parsedStartDate
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "End date cannot be before start date",
            });
        }

        // ---------------------------------------------
        // Update campaign
        // ---------------------------------------------

        const updatedCampaign =
            await prisma.campaign.update({
                where: {
                    id,
                },

                data: {
                    ...(name !== undefined && {
                        name: normalizedName,
                    }),

                    ...(description !==
                        undefined && {
                        description:
                            typeof description ===
                                "string"
                                ? description.trim() ||
                                null
                                : null,
                    }),

                    ...(startDate !==
                        undefined && {
                        startDate:
                            parsedStartDate,
                    }),

                    ...(endDate !==
                        undefined && {
                        endDate:
                            parsedEndDate,
                    }),

                    ...(status !== undefined && {
                        status,
                    }),
                },
            });

        return res.status(200).json({
            success: true,
            message:
                "Campaign updated successfully",
            data: {
                campaign:
                    updatedCampaign,
            },
        });
    } catch (error) {
        console.error(
            "Update campaign error:",
            error
        );

        return res.status(500).json({
            success: false,
            message:
                "Failed to update campaign",
        });
    }
};

export {
    createCampaign,
    getCampaigns,
    updateCampaign,
};