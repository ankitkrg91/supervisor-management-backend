import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import prisma from "../config/prisma.js";
import { generateAccessToken, generateRefreshToken } from "../services/authService.js";
import { sendSuccess, sendError } from "../utils/response.js";

/**
 * Helper: Find user by Email, Employee ID prefix, Phone, or Name
 */
const findUserByIdentifier = async (rawIdentifier) => {
    const cleanId = String(rawIdentifier || "").trim();
    const lowerId = cleanId.toLowerCase();

    return prisma.user.findFirst({
        where: {
            OR: [
                { email: lowerId },
                { email: { startsWith: `${lowerId}@` } },
                { phone: cleanId },
                { name: { equals: cleanId, mode: "insensitive" } },
            ],
        },
        include: {
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
};

export const login = async (req, res, next) => {
    try {
        const identifier = req.body.email || req.body.empId || req.body.identifier;
        const { password } = req.body;

        if (!identifier || !password) {
            return sendError(res, 400, "Email/ID and password are required");
        }

        const user = await findUserByIdentifier(identifier);

        if (!user) {
            return sendError(res, 401, "Invalid email/ID or password");
        }

        if (user.status === "INACTIVE") {
            return sendError(res, 403, "Your account has been deactivated");
        }

        if (user.role !== "SUPER_ADMIN") {
            return sendError(res, 403, "Access denied. Only Super Admin can login to this portal.");
        }

        const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
        if (!isPasswordValid) {
            return sendError(res, 401, "Invalid email/ID or password");
        }

        const tokenPayload = {
            id: user.id,
            email: user.email,
            role: user.role,
            name: user.name,
        };

        const accessToken = generateAccessToken(tokenPayload);
        const refreshToken = generateRefreshToken(tokenPayload);

        return sendSuccess(res, 200, "Login successful", {
            accessToken,
            refreshToken,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                phone: user.phone,
                role: user.role,
                siteId: user.siteId,
                site: user.site || null,
            },
        });
    } catch (error) {
        next(error);
    }
};

export const supervisorLogin = async (req, res, next) => {
    try {
        const identifier = req.body.email || req.body.empId || req.body.identifier || req.body.username;
        const { password } = req.body;

        if (!identifier || !password) {
            return sendError(res, 400, "Employee ID / Email and password are required");
        }

        const user = await findUserByIdentifier(identifier);

        if (!user) {
            return sendError(res, 401, "Invalid Employee ID / Email or password");
        }

        if (user.status === "INACTIVE") {
            return sendError(res, 403, "Your account has been deactivated. Please contact admin.");
        }

        // Allow SUPERVISOR, FIELD_STAFF, and SUPER_ADMIN to sign in to the index.html web app
        if (!["SUPERVISOR", "FIELD_STAFF", "SUPER_ADMIN"].includes(user.role)) {
            return sendError(res, 403, "Access denied for this role.");
        }

        const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
        if (!isPasswordValid) {
            return sendError(res, 401, "Invalid Employee ID / Email or password");
        }

        const tokenPayload = {
            id: user.id,
            email: user.email,
            role: user.role,
            name: user.name,
        };

        const accessToken = generateAccessToken(tokenPayload);
        const refreshToken = generateRefreshToken(tokenPayload);

        return sendSuccess(res, 200, "Login successful", {
            accessToken,
            refreshToken,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                phone: user.phone || "",
                role: user.role,
                siteId: user.siteId,
                site: user.site || null,
            },
        });
    } catch (error) {
        next(error);
    }
};

export const refreshAccessToken = async (req, res, next) => {
    try {
        const { refreshToken } = req.body;
        if (!refreshToken) {
            return sendError(res, 400, "Refresh token is required");
        }

        const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
        const user = await prisma.user.findUnique({
            where: { id: decoded.id },
        });

        if (!user || user.status === "INACTIVE") {
            return sendError(res, 401, "Invalid user or inactive account");
        }

        const tokenPayload = {
            id: user.id,
            email: user.email,
            role: user.role,
            name: user.name,
        };

        const newAccessToken = generateAccessToken(tokenPayload);

        return sendSuccess(res, 200, "Token refreshed", {
            accessToken: newAccessToken,
        });
    } catch (error) {
        return sendError(res, 401, "Invalid or expired refresh token");
    }
};

export const getMe = async (req, res, next) => {
    try {
        const user = await prisma.user.findUnique({
            where: { id: req.user.userId },
            select: {
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
                        address: true,
                        city: true,
                        state: true,
                        pincode: true,
                        latitude: true,
                        longitude: true,
                    },
                },
                createdAt: true,
            },
        });

        if (!user) {
            return sendError(res, 404, "User not found");
        }

        return sendSuccess(res, 200, "User profile fetched", { user });
    } catch (error) {
        next(error);
    }
};
export const changePassword = async (req, res, next) => {
    try {
        const { currentPassword, newPassword, confirmPassword } = req.body;

        if (!currentPassword || !newPassword) {
            return sendError(
                res,
                400,
                "Current password and new password are required"
            );
        }

        if (newPassword.length < 8) {
            return sendError(
                res,
                400,
                "New password must be at least 8 characters long"
            );
        }

        if (
            confirmPassword !== undefined &&
            newPassword !== confirmPassword
        ) {
            return sendError(
                res,
                400,
                "New password and confirm password do not match"
            );
        }

        const user = await prisma.user.findUnique({
            where: { id: req.user.id },
            select: {
                id: true,
                passwordHash: true,
            },
        });

        if (!user) {
            return sendError(res, 404, "User not found");
        }

        const isPasswordValid = await bcrypt.compare(
            currentPassword,
            user.passwordHash
        );

        if (!isPasswordValid) {
            return sendError(res, 401, "Current password is incorrect");
        }

        const passwordHash = await bcrypt.hash(newPassword, 10);

        await prisma.user.update({
            where: { id: user.id },
            data: { passwordHash },
        });

        return sendSuccess(res, 200, "Password changed successfully");
    } catch (error) {
        next(error);
    }
};