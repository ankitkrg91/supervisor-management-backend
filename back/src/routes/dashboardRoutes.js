import express from "express";

import {
    getDashboard,
    getDashboardSiteVisits,
} from "../controllers/dashboardController.js";

import authenticate from "../middleware/authMiddleware.js";
import authorize from "../middleware/roleMiddleware.js";

const router = express.Router();

router.get(
    "/",
    authenticate,
    authorize("SUPER_ADMIN"),
    getDashboard
);

router.get(
    "/site-visits",
    authenticate,
    authorize("SUPER_ADMIN"),
    getDashboardSiteVisits
);

export default router;