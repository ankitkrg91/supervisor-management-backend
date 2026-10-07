import express from "express";

import {
    createAuditTemplate,
    getAuditTemplates,
    updateAuditTemplate,

    addAuditQuestion,
    updateAuditQuestion,
    deleteAuditQuestion,

    getAuditTemplateById,

    getAuditChecklist,
    createChecklistQuestion,
    updateChecklistQuestion,
    deleteChecklistQuestion,

    submitAudit,
    getAuditSubmission,
} from "../controllers/auditController.js";

import {
    getSubmittedAudits,
    getSubmittedAuditById,
    updateAuditVerificationStatus,
} from "../controllers/auditVerificationController.js";

import authenticate from "../middleware/authMiddleware.js";

import authorize from "../middleware/roleMiddleware.js";


const router = express.Router();


/* =========================================================
   ADMIN - AUDIT TEMPLATE MANAGEMENT
========================================================= */

router.get(
    "/",
    authenticate,
    authorize("SUPER_ADMIN"),
    getAuditTemplates
);


router.post(
    "/",
    authenticate,
    authorize("SUPER_ADMIN"),
    createAuditTemplate
);


router.put(
    "/:templateId",
    authenticate,
    authorize("SUPER_ADMIN"),
    updateAuditTemplate
);


/* =========================================================
   SUPERVISOR + ADMIN
   GET AUDIT CHECKLIST

   IMPORTANT:
   This route MUST come before /:templateId
========================================================= */

router.get(
    "/checklist",
    authenticate,
    authorize(
        "SUPER_ADMIN",
        "SUPERVISOR"
    ),
    getAuditChecklist
);


/* =========================================================
   ADMIN + SUPERVISOR
   AUDIT REGISTER

   ADMIN ONLY
========================================================= */

router.get(
    "/submissions",
    authenticate,
    authorize("SUPER_ADMIN"),
    getSubmittedAudits
);


/* =========================================================
   ADMIN + SUPERVISOR
   GET SINGLE TEMPLATE
========================================================= */

router.get(
    "/:templateId",
    authenticate,
    authorize(
        "SUPER_ADMIN",
        "SUPERVISOR"
    ),
    getAuditTemplateById
);


/* =========================================================
   ADMIN - AUDIT QUESTIONS
========================================================= */

router.post(
    "/:templateId/questions",
    authenticate,
    authorize("SUPER_ADMIN"),
    addAuditQuestion
);


router.put(
    "/:templateId/questions/:questionId",
    authenticate,
    authorize("SUPER_ADMIN"),
    updateAuditQuestion
);


router.delete(
    "/:templateId/questions/:questionId",
    authenticate,
    authorize("SUPER_ADMIN"),
    deleteAuditQuestion
);


/* =========================================================
   ADMIN - CHECKLIST QUESTIONS
========================================================= */

router.post(
    "/checklist/questions",
    authenticate,
    authorize("SUPER_ADMIN"),
    createChecklistQuestion
);


router.put(
    "/checklist/questions/:questionId",
    authenticate,
    authorize("SUPER_ADMIN"),
    updateChecklistQuestion
);


router.delete(
    "/checklist/questions/:questionId",
    authenticate,
    authorize("SUPER_ADMIN"),
    deleteChecklistQuestion
);


/* =========================================================
   SUPERVISOR - SUBMIT AUDIT
========================================================= */

router.post(
    "/visits/:visitId/submit",
    authenticate,
    authorize("SUPERVISOR"),
    submitAudit
);


/* =========================================================
   ADMIN + SUPERVISOR
   GET SUBMISSION
========================================================= */

router.get(
    "/visits/:visitId/submission",
    authenticate,
    authorize(
        "SUPER_ADMIN",
        "SUPERVISOR"
    ),
    getAuditSubmission
);


/* =========================================================
   ADMIN - GET SINGLE SUBMITTED AUDIT
========================================================= */

router.get(
    "/submissions/:id",
    authenticate,
    authorize("SUPER_ADMIN"),
    getSubmittedAuditById
);


/* =========================================================
   ADMIN - VERIFY / REJECT AUDIT
========================================================= */

router.patch(
    "/submissions/:id/status",
    authenticate,
    authorize("SUPER_ADMIN"),
    updateAuditVerificationStatus
);


export default router;