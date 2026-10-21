import express from "express";
import { createVisit, getVisits, getVisitById, updateVisitStatus } from "../controllers/visitController.js";
import authenticate from "../middleware/authMiddleware.js";
import authorize from "../middleware/roleMiddleware.js";

const router = express.Router();

router.post(
    "/",
    authenticate,
    authorize("SUPERVISOR", "FIELD_STAFF"),
    createVisit
);

router.get(
    "/",
    authenticate,
    authorize("SUPER_ADMIN", "SUPERVISOR"),
    getVisits
);

router.get(
    "/:id",
    authenticate,
    authorize("SUPER_ADMIN", "SUPERVISOR"),
    getVisitById
);

router.patch(
    "/:id/status",
    authenticate,
    authorize("SUPER_ADMIN", "SUPERVISOR"),
    updateVisitStatus
);

export default router;