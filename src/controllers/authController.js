import bcrypt from "bcrypt";

import prisma from "../config/prisma.js";

import {
    generateAccessToken,
    generateRefreshToken,
    verifyRefreshToken,
} from "../services/authService.js";

const login = async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: "Email and password are required",
            });
        }

        const user = await prisma.user.findUnique({
            where: {
                email: email.toLowerCase().trim(),
            },
        });

        if (!user) {
            return res.status(401).json({
                success: false,
                message: "Invalid email or password",
            });
        }

        if (user.status !== "ACTIVE") {
            return res.status(403).json({
                success: false,
                message: "User account is inactive",
            });
        }

        // This web portal is only for Super Admin.
        if (user.role !== "SUPER_ADMIN") {
            return res.status(403).json({
                success: false,
                message: "Only Super Admin can access this portal",
            });
        }

        const passwordMatch = await bcrypt.compare(
            password,
            user.passwordHash
        );

        if (!passwordMatch) {
            return res.status(401).json({
                success: false,
                message: "Invalid email or password",
            });
        }

        const accessToken = generateAccessToken(user);
        const refreshToken = generateRefreshToken(user);

        return res.status(200).json({
            success: true,
            message: "Login successful",
            data: {
                user: {
                    id: user.id,
                    name: user.name,
                    email: user.email,
                    role: user.role,
                    status: user.status,
                },
                accessToken,
                refreshToken,
            },
        });
    } catch (error) {
        console.error("Login error:", error);

        return res.status(500).json({
            success: false,
            message: "Internal server error",
        });
    }
};

const supervisorLogin = async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: "Email and password are required",
            });
        }

        const user = await prisma.user.findUnique({
            where: {
                email: email.toLowerCase().trim(),
            },
        });

        if (!user) {
            return res.status(401).json({
                success: false,
                message: "Invalid email or password",
            });
        }

        if (user.status !== "ACTIVE") {
            return res.status(403).json({
                success: false,
                message: "User account is inactive",
            });
        }

        // This endpoint is only for Supervisors.
        if (user.role !== "SUPERVISOR") {
            return res.status(403).json({
                success: false,
                message: "Only Supervisors can use this login",
            });
        }

        const passwordMatch = await bcrypt.compare(
            password,
            user.passwordHash
        );

        if (!passwordMatch) {
            return res.status(401).json({
                success: false,
                message: "Invalid email or password",
            });
        }

        const accessToken = generateAccessToken(user);
        const refreshToken = generateRefreshToken(user);

        return res.status(200).json({
            success: true,
            message: "Supervisor login successful",
            data: {
                user: {
                    id: user.id,
                    name: user.name,
                    email: user.email,
                    role: user.role,
                    status: user.status,
                    siteId: user.siteId,
                },
                accessToken,
                refreshToken,
            },
        });
    } catch (error) {
        console.error("Supervisor login error:", error);

        return res.status(500).json({
            success: false,
            message: "Internal server error",
        });
    }
};

const refreshAccessToken = async (req, res) => {
    try {
        const { refreshToken } = req.body;

        if (!refreshToken) {
            return res.status(401).json({
                success: false,
                message: "Refresh token is required",
            });
        }

        const decoded = verifyRefreshToken(refreshToken);

        const user = await prisma.user.findUnique({
            where: {
                id: decoded.userId,
            },
            select: {
                id: true,
                name: true,
                email: true,
                role: true,
                status: true,
            },
        });

        if (!user) {
            return res.status(401).json({
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

        // Portal remains Super Admin only.
        if (user.role !== "SUPER_ADMIN") {
            return res.status(403).json({
                success: false,
                message: "Only Super Admin can access this portal",
            });
        }

        const accessToken = generateAccessToken(user);

        return res.status(200).json({
            success: true,
            message: "Access token refreshed",
            data: {
                accessToken,
                user,
            },
        });
    } catch (error) {
        console.error("Refresh token error:", error);

        return res.status(401).json({
            success: false,
            message: "Invalid or expired refresh token",
        });
    }
};

const getMe = async (req, res) => {
    try {
        const user = await prisma.user.findUnique({
            where: {
                id: req.user.userId,
            },
            select: {
                id: true,
                name: true,
                email: true,
                phone: true,
                role: true,
                status: true,
                siteId: true,
                createdAt: true,
                updatedAt: true,
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
        console.error("Get current user error:", error);

        return res.status(500).json({
            success: false,
            message: "Internal server error",
        });
    }
};

// ============================================================
// CHANGE PASSWORD
// ============================================================

const changePassword = async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;

        if (!currentPassword || !newPassword) {
            return res.status(400).json({
                success: false,
                message:
                    "Current password and new password are required",
            });
        }

        if (typeof newPassword !== "string") {
            return res.status(400).json({
                success: false,
                message: "Invalid new password",
            });
        }

        if (newPassword.length < 8) {
            return res.status(400).json({
                success: false,
                message:
                    "New password must contain at least 8 characters",
            });
        }

        if (newPassword === currentPassword) {
            return res.status(400).json({
                success: false,
                message:
                    "New password must be different from your current password",
            });
        }

        const user = await prisma.user.findUnique({
            where: {
                id: req.user.userId,
            },
            select: {
                id: true,
                role: true,
                status: true,
                passwordHash: true,
            },
        });

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found",
            });
        }

        if (
            user.role !== "SUPER_ADMIN" &&
            user.role !== "SUPERVISOR"
        ) {
            return res.status(403).json({
                success: false,
                message:
                    "You do not have permission to change this password",
            });
        }

        if (user.status !== "ACTIVE") {
            return res.status(403).json({
                success: false,
                message: "User account is inactive",
            });
        }

        const passwordMatches = await bcrypt.compare(
            currentPassword,
            user.passwordHash
        );

        if (!passwordMatches) {
            return res.status(401).json({
                success: false,
                message: "Current password is incorrect",
            });
        }

        const newPasswordHash = await bcrypt.hash(
            newPassword,
            12
        );

        await prisma.user.update({
            where: {
                id: user.id,
            },
            data: {
                passwordHash: newPasswordHash,
            },
        });

        return res.status(200).json({
            success: true,
            message:
                "Password changed successfully",
        });
    } catch (error) {
        console.error("Change password error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to change password",
        });
    }
};

export {
    login,
    supervisorLogin,
    refreshAccessToken,
    getMe,
    changePassword,
};