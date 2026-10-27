import express from "express";

import {
    getAuditTemplates,
    getAuditTemplateById,
    getAuditChecklist,
    submitAudit,
    getAuditSubmission,
} from "../controllers/auditController.js";

import authenticate from "../middleware/authMiddleware.js";
import authorize from "../middleware/roleMiddleware.js";

const router = express.Router();

// Read-only template list
router.get(
    "/",
    authenticate,
    authorize("SUPER_ADMIN"),
    getAuditTemplates
);

// Keep checklist read API for compatibility.
// The delivered index.html does not dynamically load questions from this API.
router.get(
    "/checklist",
    authenticate,
    authorize("SUPER_ADMIN", "SUPERVISOR"),
    getAuditChecklist
);

// Keep existing template read API
router.get(
    "/:templateId",
    authenticate,
    authorize("SUPER_ADMIN", "SUPERVISOR"),
    getAuditTemplateById
);

// Preserve audit submission
router.post(
    "/visits/:visitId/submit",
    authenticate,
    authorize("SUPERVISOR"),
    submitAudit
);

// Preserve existing submission/history access
router.get(
    "/visits/:visitId/submission",
    authenticate,
    authorize("SUPER_ADMIN", "SUPERVISOR"),
    getAuditSubmission
);

export default router;