import express from "express";

import {
    createSite,
    getSites,
    getEmergencyAuditSites,
    updateSite,
} from "../controllers/siteController.js";

import authenticate from "../middleware/authMiddleware.js";
import authorize from "../middleware/roleMiddleware.js";

const router = express.Router();

// All active sites are available to an authenticated Supervisor for an
// unplanned emergency audit; the normal site-management endpoint stays admin-only.
router.get(
    "/emergency-audit",
    authenticate,
    authorize("SUPERVISOR"),
    getEmergencyAuditSites
);

router.get(
    "/",
    authenticate,
    authorize("SUPER_ADMIN"),
    getSites
);

router.post(
    "/",
    authenticate,
    authorize("SUPER_ADMIN"),
    createSite
);

router.patch(
    "/:id",
    authenticate,
    authorize("SUPER_ADMIN"),
    updateSite
);

export default router;