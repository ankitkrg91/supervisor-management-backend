import express from "express";

import {
    login,
    supervisorLogin,
    refreshAccessToken,
    getMe,
    changePassword,
} from "../controllers/authController.js";

import authenticate from "../middleware/authMiddleware.js";
import authorize from "../middleware/roleMiddleware.js";

const router = express.Router();

// ============================================================
// SUPER ADMIN WEB PORTAL LOGIN
// ============================================================

router.post(
    "/login",
    login
);

// ============================================================
// SUPERVISOR MOBILE APP LOGIN
// ============================================================

router.post(
    "/supervisor-login",
    supervisorLogin
);

// ============================================================
// REFRESH ACCESS TOKEN
// ============================================================

router.post(
    "/refresh",
    refreshAccessToken
);

// ============================================================
// GET CURRENT AUTHENTICATED USER
// ============================================================

router.get(
    "/me",
    authenticate,
    getMe
);

// ============================================================
// CHANGE PASSWORD
// SUPER ADMIN + SUPERVISOR
// ============================================================

router.patch(
    "/change-password",
    authenticate,
    authorize(
        "SUPER_ADMIN",
        "SUPERVISOR"
    ),
    changePassword
);

export default router;