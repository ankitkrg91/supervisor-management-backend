import prisma from "../config/prisma.js";

/*
 * CREATE SITE
 */
const createSite = async (req, res) => {
    try {
        const {
            name,
            siteCode,
            address,
            city,
            state,
            pincode,
            latitude,
            longitude,
        } = req.body;

        if (!name || !siteCode) {
            return res.status(400).json({
                success: false,
                message:
                    "Name and siteCode are required",
            });
        }

        const normalizedSiteCode =
            siteCode.trim().toUpperCase();

        const existingSite =
            await prisma.site.findUnique({
                where: {
                    siteCode:
                        normalizedSiteCode,
                },
            });

        if (existingSite) {
            return res.status(409).json({
                success: false,
                message:
                    "Site code already exists",
            });
        }

        const site =
            await prisma.site.create({
                data: {
                    name: name.trim(),

                    siteCode:
                        normalizedSiteCode,

                    address:
                        address?.trim() ||
                        null,

                    city:
                        city?.trim() ||
                        null,

                    state:
                        state?.trim() ||
                        null,

                    pincode:
                        pincode?.trim() ||
                        null,

                    latitude:
                        latitude !==
                            undefined &&
                            latitude !== null
                            ? Number(latitude)
                            : null,

                    longitude:
                        longitude !==
                            undefined &&
                            longitude !== null
                            ? Number(longitude)
                            : null,
                },
            });

        return res.status(201).json({
            success: true,
            message:
                "Site created successfully",

            data: {
                site,
            },
        });
    } catch (error) {
        console.error(
            "Create site error:",
            error
        );

        return res.status(500).json({
            success: false,
            message:
                "Failed to create site",
        });
    }
};

/*
 * GET SITES
 *
 * Used by the Super Admin portal
 * to select an existing site.
 */
const getSites = async (req, res) => {
    try {
        const {
            search = "",
            status = "ACTIVE",
        } = req.query;

        const where = {};

        if (status !== "ALL") {
            if (
                !["ACTIVE", "INACTIVE"].includes(
                    status
                )
            ) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Invalid site status",
                });
            }

            where.status = status;
        }

        if (search.trim()) {
            where.OR = [
                {
                    name: {
                        contains:
                            search.trim(),
                        mode: "insensitive",
                    },
                },
                {
                    siteCode: {
                        contains:
                            search.trim(),
                        mode: "insensitive",
                    },
                },
                {
                    city: {
                        contains:
                            search.trim(),
                        mode: "insensitive",
                    },
                },
                {
                    state: {
                        contains:
                            search.trim(),
                        mode: "insensitive",
                    },
                },
            ];
        }

        const sites =
            await prisma.site.findMany({
                where,

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
                    status: true,
                    createdAt: true,
                    updatedAt: true,
                },

                orderBy: {
                    name: "asc",
                },
            });

        return res.status(200).json({
            success: true,
            data: {
                sites,
                count: sites.length,
            },
        });
    } catch (error) {
        console.error(
            "Get sites error:",
            error
        );

        return res.status(500).json({
            success: false,
            message:
                "Failed to fetch sites",
        });
    }
};

/*
 * UPDATE SITE
 */
const updateSite = async (req, res) => {
    try {
        const { id } = req.params;

        const {
            name,
            siteCode,
            address,
            city,
            state,
            pincode,
            latitude,
            longitude,
            status,
        } = req.body;

        const existingSite =
            await prisma.site.findUnique({
                where: {
                    id,
                },
            });

        if (!existingSite) {
            return res.status(404).json({
                success: false,
                message:
                    "Site not found",
            });
        }

        if (siteCode !== undefined) {
            if (!siteCode.trim()) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Site code cannot be empty",
                });
            }

            const normalizedSiteCode =
                siteCode.trim().toUpperCase();

            const duplicateSite =
                await prisma.site.findFirst({
                    where: {
                        siteCode:
                            normalizedSiteCode,

                        NOT: {
                            id,
                        },
                    },
                });

            if (duplicateSite) {
                return res.status(409).json({
                    success: false,
                    message:
                        "Site code already exists",
                });
            }
        }

        if (
            status !== undefined &&
            !["ACTIVE", "INACTIVE"].includes(
                status
            )
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "Invalid site status",
            });
        }

        const updatedSite =
            await prisma.site.update({
                where: {
                    id,
                },

                data: {
                    ...(name !== undefined && {
                        name: name.trim(),
                    }),

                    ...(siteCode !==
                        undefined && {
                        siteCode:
                            siteCode
                                .trim()
                                .toUpperCase(),
                    }),

                    ...(address !==
                        undefined && {
                        address:
                            address?.trim() ||
                            null,
                    }),

                    ...(city !== undefined && {
                        city:
                            city?.trim() ||
                            null,
                    }),

                    ...(state !== undefined && {
                        state:
                            state?.trim() ||
                            null,
                    }),

                    ...(pincode !==
                        undefined && {
                        pincode:
                            pincode?.trim() ||
                            null,
                    }),

                    ...(latitude !==
                        undefined && {
                        latitude:
                            latitude ===
                                null ||
                                latitude === ""
                                ? null
                                : Number(
                                    latitude
                                ),
                    }),

                    ...(longitude !==
                        undefined && {
                        longitude:
                            longitude ===
                                null ||
                                longitude === ""
                                ? null
                                : Number(
                                    longitude
                                ),
                    }),

                    ...(status !==
                        undefined && {
                        status,
                    }),
                },
            });

        return res.status(200).json({
            success: true,
            message:
                "Site updated successfully",

            data: {
                site: updatedSite,
            },
        });
    } catch (error) {
        console.error(
            "Update site error:",
            error
        );

        return res.status(500).json({
            success: false,
            message:
                "Failed to update site",
        });
    }
};

export {
    createSite,
    getSites,
    updateSite,
};