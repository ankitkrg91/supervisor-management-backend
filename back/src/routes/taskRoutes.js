import express from "express";

import {
    createTask,
    getTasks,
    getTaskById,
    updateTaskStatus,
    reassignTask,
    cancelTask,
    createBulkTasks,
    cancelBulkTasks,
    reassignBulkTasks,
} from "../controllers/taskController.js";

import authenticate from "../middleware/authMiddleware.js";
import authorize from "../middleware/roleMiddleware.js";

const router = express.Router();

// Get tasks
// Super Admin → all tasks
// Supervisor → only their assigned tasks
router.get(
    "/",
    authenticate,
    authorize("SUPER_ADMIN", "SUPERVISOR"),
    getTasks
);

// Get task by ID
// Super Admin → any task
// Supervisor → only their assigned task
router.get(
    "/:id",
    authenticate,
    authorize("SUPER_ADMIN", "SUPERVISOR"),
    getTaskById
);

// Create task
// ONLY Super Admin
router.post(
    "/",
    authenticate,
    authorize("SUPER_ADMIN"),
    createTask
);

// Update task status
// Super Admin + Supervisor
// Supervisor authorization is handled inside controller
router.patch(
    "/:id/status",
    authenticate,
    authorize("SUPER_ADMIN", "SUPERVISOR"),
    updateTaskStatus
);

// Reassign task
// ONLY Super Admin
router.patch(
    "/:id/reassign",
    authenticate,
    authorize("SUPER_ADMIN"),
    reassignTask
);

// Cancel task
// ONLY Super Admin
router.patch(
    "/:id/cancel",
    authenticate,
    authorize("SUPER_ADMIN"),
    cancelTask
);

// Bulk create tasks
// ONLY Super Admin
router.post(
    "/bulk",
    authenticate,
    authorize("SUPER_ADMIN"),
    createBulkTasks
);

router.post(
    "/bulk-cancel",
    authenticate,
    authorize("SUPER_ADMIN"),
    cancelBulkTasks
);

router.post(
    "/bulk-reassign",
    authenticate,
    authorize("SUPER_ADMIN"),
    reassignBulkTasks
);

export default router;