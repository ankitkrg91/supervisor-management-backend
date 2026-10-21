import express from "express";

import authenticate from "../middleware/authMiddleware.js";

import authorize from "../middleware/roleMiddleware.js";

import {
    getReport,
} from "../controllers/reportController.js";

const router = express.Router();

router.get(
    "/",
    authenticate,
    authorize("SUPER_ADMIN"),
    getReport
);

export default router;