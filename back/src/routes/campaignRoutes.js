import express from "express";

import {
    createCampaign,
    getCampaigns,
    updateCampaign,
} from "../controllers/campaignController.js";

import authenticate from "../middleware/authMiddleware.js";
import authorize from "../middleware/roleMiddleware.js";

const router = express.Router();

router.post(
    "/",
    authenticate,
    authorize("SUPER_ADMIN"),
    createCampaign
);

router.get(
    "/",
    authenticate,
    authorize("SUPER_ADMIN"),
    getCampaigns
);

router.patch(
    "/:id",
    authenticate,
    authorize("SUPER_ADMIN"),
    updateCampaign
);

export default router;