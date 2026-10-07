import bcrypt from "bcrypt";
import { randomUUID } from "crypto";
import prisma from "../config/prisma.js";

// ============================================================
// HELPERS
// ============================================================

const ALLOWED_ROLES = [
    "SUPER_ADMIN",
    "SUPERVISOR",
    "FIELD_STAFF",
];

const ALLOWED_STATUSES = [
    "ACTIVE",
    "INACTIVE",
];

const userSelect = {
    id: true,
    name: true,
    email: true,
    phone: true,
    role: true,
    status: true,
    siteId: true,
    site: {
        select: {
            id: true,
            name: true,
            siteCode: true,
        },
    },
    createdAt: true,
    updatedAt: true,
};

// ============================================================
// CREATE USER
// ============================================================

const createUser = async (req, res) => {
    try {
        const {
            name,
            email,
            password,
            phone,
            role,
            siteId,
        } = req.body;

        if (!name || !email || !role) {
            return res.status(400).json({
                success: false,
                message: "Name, email and role are required",
            });
        }

        if (!ALLOWED_ROLES.includes(role)) {
            return res.status(400).json({
                success: false,
                message: "Invalid user role",
            });
        }

        // Field Staff does not log in, so the client does not
        // need to provide a password. Prisma still requires a
        // passwordHash, so an internal random hash is generated.
        if (role !== "FIELD_STAFF") {
            if (!password) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Password is required for Supervisor and Super Admin",
                });
            }

            if (password.length < 6) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Password must be at least 6 characters",
                });
            }
        }

        const normalizedName = name.trim();
        const normalizedEmail = email.toLowerCase().trim();

        if (!normalizedName) {
            return res.status(400).json({
                success: false,
                message: "Name cannot be empty",
            });
        }

        const existingUser = await prisma.user.findUnique({
            where: {
                email: normalizedEmail,
            },
        });

        if (existingUser) {
            return res.status(409).json({
                success: false,
                message: "A user with this email already exists",
            });
        }

        // Super Admin must never be assigned to a site.
        // Supervisor and Field Staff may be assigned now or later.
        const validatedSiteId =
            role === "SUPER_ADMIN"
                ? null
                : siteId || null;

        if (validatedSiteId) {
            const site = await prisma.site.findUnique({
                where: {
                    id: validatedSiteId,
                },
                select: {
                    id: true,
                    status: true,
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
                    message: "Cannot assign user to an inactive site",
                });
            }
        }

        const passwordSource =
            role === "FIELD_STAFF"
                ? randomUUID()
                : password;

        const passwordHash =
            await bcrypt.hash(passwordSource, 12);

        const user = await prisma.user.create({
            data: {
                name: normalizedName,
                email: normalizedEmail,
                passwordHash,
                phone: phone?.trim() || null,
                role,
                status: "ACTIVE",
                siteId: validatedSiteId,
            },
            select: userSelect,
        });

        return res.status(201).json({
            success: true,
            message: "User created successfully",
            data: {
                user,
            },
        });
    } catch (error) {
        console.error("Create user error:", error);

        return res.status(500).json({
            success: false,
            message: "Internal server error",
        });
    }
};

// ============================================================
// GET USERS
// Supports:
// ?status=ACTIVE
// ?role=SUPERVISOR
// ?search=ajit
// ============================================================

const getUsers = async (req, res) => {
    try {
        const {
            status,
            role,
            search,
        } = req.query;

        const where = {};

        // -------------------------
        // STATUS FILTER
        // -------------------------

        if (status) {
            if (status === "ALL") {
                // no status filter
            } else if (ALLOWED_STATUSES.includes(status)) {
                where.status = status;
            } else {
                return res.status(400).json({
                    success: false,
                    message: "Invalid user status filter",
                });
            }
        }

        // -------------------------
        // ROLE FILTER
        // -------------------------

        if (role) {
            if (role === "ALL") {
                // no role filter
            } else if (ALLOWED_ROLES.includes(role)) {
                where.role = role;
            } else {
                return res.status(400).json({
                    success: false,
                    message: "Invalid user role filter",
                });
            }
        }

        // -------------------------
        // SEARCH
        // -------------------------

        if (search?.trim()) {
            const query = search.trim();

            where.OR = [
                {
                    name: {
                        contains: query,
                        mode: "insensitive",
                    },
                },
                {
                    email: {
                        contains: query,
                        mode: "insensitive",
                    },
                },
                {
                    phone: {
                        contains: query,
                        mode: "insensitive",
                    },
                },
            ];
        }

        const users = await prisma.user.findMany({
            where,
            select: userSelect,
            orderBy: {
                createdAt: "desc",
            },
        });

        return res.status(200).json({
            success: true,
            count: users.length,
            data: {
                users,
            },
        });
    } catch (error) {
        console.error("Get users error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to fetch users",
        });
    }
};

// ============================================================
// GET USER BY ID
// ============================================================

const getUserById = async (req, res) => {
    try {
        const { id } = req.params;

        const user = await prisma.user.findUnique({
            where: {
                id,
            },
            select: {
                ...userSelect,
                site: {
                    select: {
                        id: true,
                        name: true,
                        siteCode: true,
                        address: true,
                        city: true,
                        state: true,
                        pincode: true,
                    },
                },
            },
        });

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found",
            });
        }

        return res.status(200).json({
            success: true,
            data: {
                user,
            },
        });
    } catch (error) {
        console.error("Get user by ID error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to fetch user",
        });
    }
};

// ============================================================
// UPDATE USER
// ============================================================

const updateUser = async (req, res) => {
    try {
        const { id } = req.params;

        const {
            name,
            email,
            phone,
            role,
            siteId,
            status,
        } = req.body;

        const existingUser = await prisma.user.findUnique({
            where: {
                id,
            },
        });

        if (!existingUser) {
            return res.status(404).json({
                success: false,
                message: "User not found",
            });
        }

        // =====================================================
        // PREVENT SUPER ADMIN FROM DEACTIVATING THEMSELVES
        // =====================================================

        if (
            req.user?.id === id &&
            status === "INACTIVE"
        ) {
            return res.status(400).json({
                success: false,
                message: "You cannot deactivate your own account",
            });
        }

        // =====================================================
        // NAME
        // =====================================================

        if (name !== undefined) {
            if (!name.trim()) {
                return res.status(400).json({
                    success: false,
                    message: "Name cannot be empty",
                });
            }
        }

        // =====================================================
        // EMAIL
        // =====================================================

        let normalizedEmail;

        if (email !== undefined) {
            normalizedEmail = email.toLowerCase().trim();

            if (!normalizedEmail) {
                return res.status(400).json({
                    success: false,
                    message: "Email cannot be empty",
                });
            }

            const emailUser = await prisma.user.findFirst({
                where: {
                    email: normalizedEmail,
                    NOT: {
                        id,
                    },
                },
            });

            if (emailUser) {
                return res.status(409).json({
                    success: false,
                    message: "A user with this email already exists",
                });
            }
        }

        // =====================================================
        // ROLE
        // =====================================================

        if (
            role !== undefined &&
            !ALLOWED_ROLES.includes(role)
        ) {
            return res.status(400).json({
                success: false,
                message: "Invalid user role",
            });
        }

        // =====================================================
        // STATUS
        // =====================================================

        if (
            status !== undefined &&
            !ALLOWED_STATUSES.includes(status)
        ) {
            return res.status(400).json({
                success: false,
                message: "Invalid user status",
            });
        }

        // =====================================================
        // SITE
        // =====================================================

        const effectiveRole =
            role !== undefined
                ? role
                : existingUser.role;

        const requestedSiteId =
            effectiveRole === "SUPER_ADMIN"
                ? null
                : siteId;

        if (
            requestedSiteId !== undefined &&
            requestedSiteId !== null &&
            requestedSiteId !== ""
        ) {
            const site = await prisma.site.findUnique({
                where: {
                    id: requestedSiteId,
                },
                select: {
                    id: true,
                    status: true,
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
                    message: "Cannot assign user to an inactive site",
                });
            }
        }

        // =====================================================
        // UPDATE
        // =====================================================

        const updatedUser = await prisma.user.update({
            where: {
                id,
            },
            data: {
                ...(name !== undefined && {
                    name: name.trim(),
                }),

                ...(email !== undefined && {
                    email: normalizedEmail,
                }),

                ...(phone !== undefined && {
                    phone: phone?.trim() || null,
                }),

                ...(role !== undefined && {
                    role,
                }),

                ...(role !== undefined &&
                    effectiveRole === "SUPER_ADMIN" && {
                    siteId: null,
                }),

                ...(siteId !== undefined &&
                    effectiveRole !== "SUPER_ADMIN" && {
                    siteId: siteId || null,
                }),

                ...(status !== undefined && {
                    status,
                }),
            },
            select: userSelect,
        });

        return res.status(200).json({
            success: true,
            message: "User updated successfully",
            data: {
                user: updatedUser,
            },
        });
    } catch (error) {
        console.error("Update user error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to update user",
        });
    }
};

// ============================================================
// RESET USER PASSWORD
// Super Admin only
// ============================================================

const resetUserPassword = async (req, res) => {
    try {
        const { id } = req.params;
        const { newPassword } = req.body;

        if (!newPassword) {
            return res.status(400).json({
                success: false,
                message: "New password is required",
            });
        }

        if (newPassword.length < 6) {
            return res.status(400).json({
                success: false,
                message: "Password must be at least 6 characters",
            });
        }

        const user = await prisma.user.findUnique({
            where: {
                id,
            },
            select: {
                id: true,
                name: true,
                email: true,
            },
        });

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found",
            });
        }

        const passwordHash = await bcrypt.hash(
            newPassword,
            12
        );

        await prisma.user.update({
            where: {
                id,
            },
            data: {
                passwordHash,
            },
        });

        return res.status(200).json({
            success: true,
            message: "User password reset successfully",
        });
    } catch (error) {
        console.error("Reset user password error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to reset user password",
        });
    }
};

export {
    createUser,
    getUsers,
    getUserById,
    updateUser,
    resetUserPassword,
};