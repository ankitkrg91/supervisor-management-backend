import express from "express";

import authenticate from "../middleware/authMiddleware.js";

import authorize from "../middleware/roleMiddleware.js";

import {
    updateLocation,
    getLatestLocations,
    getTrackedFieldForce,
    getNotCheckedIn,
    getDistanceReport,
} from "../controllers/locationController.js";

const router = express.Router();

/* =========================
   UPDATE LOCATION
   Supervisor Mobile App
========================= */

router.post(
    "/",
    authenticate,
    authorize("SUPERVISOR"),
    updateLocation
);

/* =========================
   LATEST LOCATIONS
========================= */

router.get(
    "/latest",
    authenticate,
    authorize("SUPER_ADMIN", "SUPERVISOR"),
    getLatestLocations
);

/* =========================
   TRACK FIELD FORCE
========================= */

router.get(
    "/track",
    authenticate,
    authorize("SUPER_ADMIN", "SUPERVISOR"),
    getTrackedFieldForce
);

/* =========================
   NOT CHECKED IN
========================= */

router.get(
    "/not-checked-in",
    authenticate,
    authorize("SUPER_ADMIN", "SUPERVISOR"),
    getNotCheckedIn
);

/* =========================
   DISTANCE REPORT
   Super Admin Portal
========================= */

router.get(
    "/distance-report",
    authenticate,
    authorize("SUPER_ADMIN"),
    getDistanceReport
);

export default router;