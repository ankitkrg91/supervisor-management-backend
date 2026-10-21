import express from "express";
import authenticate from "../middleware/authMiddleware.js";
import authorize from "../middleware/roleMiddleware.js";
import {
    updateLocation,
    getLatestLocations,
    getTrackedFieldForce,
    getNotCheckedIn,
    getDistanceReport,
    getDailyRoute,
    getSupervisorDailyBreakdown, // <--- Corrected: import add kar diya gaya hai
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
   DISTANCE REPORT (30-DAY SUMMARY)
   Super Admin Portal
========================= */
router.get(
    "/distance-report",
    authenticate,
    authorize("SUPER_ADMIN"),
    getDistanceReport
);

/* =========================
   DAILY ROUTE & STOPS
   (OpenStreetMap Playback & Audits)
========================= */
router.get(
    "/daily-route",
    authenticate,
    authorize("SUPER_ADMIN", "SUPERVISOR"),
    getDailyRoute
);

/* =========================
   SUPERVISOR DAILY BREAKDOWN
   (Day-Wise KM Accordion)
========================= */
router.get(
    "/daily-breakdown",
    authenticate,
    authorize("SUPER_ADMIN", "SUPERVISOR"),
    getSupervisorDailyBreakdown
);

export default router;