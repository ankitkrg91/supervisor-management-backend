import express from "express";
import { createCheckIn, getCheckIns, checkOut, getCheckInById } from "../controllers/checkInController.js";
import authenticate from "../middleware/authMiddleware.js";
import authorize from "../middleware/roleMiddleware.js";

const router = express.Router();

router.post(
    "/",
    authenticate,
    authorize("SUPERVISOR", "FIELD_STAFF"),
    createCheckIn
);

router.get(
    "/",
    authenticate,
    authorize("SUPER_ADMIN", "SUPERVISOR"),
    getCheckIns
);

router.post(
    "/:id/check-out",
    authenticate,
    authorize("SUPERVISOR", "FIELD_STAFF"),
    checkOut
);

router.get(
    "/:id",
    authenticate,
    authorize("SUPER_ADMIN", "SUPERVISOR"),
    getCheckInById
);

export default router;