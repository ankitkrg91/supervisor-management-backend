import express from "express";

import {
    createSite,
    getSites,
    updateSite,
} from "../controllers/siteController.js";

import authenticate from "../middleware/authMiddleware.js";
import authorize from "../middleware/roleMiddleware.js";

const router = express.Router();

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