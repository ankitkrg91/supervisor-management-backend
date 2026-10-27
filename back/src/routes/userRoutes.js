import express from "express";

import {
    createUser,
    getUsers,
    getUserById,
    updateUser,
    resetUserPassword,
} from "../controllers/userController.js";

import authenticate from "../middleware/authMiddleware.js";
import authorize from "../middleware/roleMiddleware.js";

const router = express.Router();

// ============================================================
// USERS
// ============================================================

// Create user
router.post(
    "/",
    authenticate,
    authorize("SUPER_ADMIN"),
    createUser
);

// Get all users
router.get(
    "/",
    authenticate,
    authorize("SUPER_ADMIN"),
    getUsers
);

// Get single user
router.get(
    "/:id",
    authenticate,
    authorize("SUPER_ADMIN"),
    getUserById
);

// Update user
router.patch(
    "/:id",
    authenticate,
    authorize("SUPER_ADMIN"),
    updateUser
);

// Reset user password
router.post(
    "/:id/reset-password",
    authenticate,
    authorize("SUPER_ADMIN"),
    resetUserPassword
);

export default router;