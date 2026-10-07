import http from "http";

import { Server } from "socket.io";

import express from "express";

import cors from "cors";

import "dotenv/config";

import prisma from "./config/prisma.js";

import authRoutes from "./routes/authRoutes.js";

import userRoutes from "./routes/userRoutes.js";

import siteRoutes from "./routes/siteRoutes.js";

import checkInRoutes from "./routes/checkInRoutes.js";

import visitRoutes from "./routes/visitRoutes.js";

import auditRoutes from "./routes/auditRoutes.js";

import taskRoutes from "./routes/taskRoutes.js";

import campaignRoutes from "./routes/campaignRoutes.js";

import locationRoutes from "./routes/locationRoutes.js";

import reportRoutes from "./routes/reportRoutes.js";

import dashboardRoutes from "./routes/dashboardRoutes.js";

import { setSocketIO } from "./controllers/locationController.js";

import { verifyAccessToken } from "./services/authService.js";


const app = express();

const PORT = process.env.PORT || 5000;


/* =========================================================
   MIDDLEWARE
========================================================= */

app.use(cors());

app.use(
    express.json({
        limit: "1mb",
    })
);


/* =========================================================
   API ROUTES
========================================================= */

app.use("/api/auth", authRoutes);

app.use("/api/users", userRoutes);

app.use("/api/sites", siteRoutes);

app.use("/api/check-ins", checkInRoutes);

app.use("/api/visits", visitRoutes);

app.use("/api/audit", auditRoutes);

app.use("/api/tasks", taskRoutes);

app.use("/api/campaigns", campaignRoutes);

app.use("/api/location", locationRoutes);

app.use("/api/reports", reportRoutes);

app.use("/api/dashboard", dashboardRoutes);


/* =========================================================
   ROOT HEALTH CHECK
========================================================= */

app.get("/", (req, res) => {
    res.json({
        success: true,
        message: "Supervisor Management Backend is running",
    });
});


/* =========================================================
   API HEALTH CHECK
========================================================= */

app.get("/api/health", async (req, res) => {
    try {
        await prisma.$queryRaw`SELECT 1`;

        res.json({
            success: true,
            message: "API is healthy",
            database: "connected",
            timestamp: new Date().toISOString(),
        });
    } catch (error) {
        console.error(
            "Database connection error:",
            error
        );

        res.status(500).json({
            success: false,
            message:
                "API is running but database connection failed",
        });
    }
});


/* =========================================================
   HTTP SERVER
========================================================= */

const server = http.createServer(app);


/* =========================================================
   SOCKET.IO
========================================================= */

const io = new Server(server, {
    cors: {
        origin: "*",
    },
});


/* =========================================================
   LOCATION CONTROLLER
========================================================= */

setSocketIO(io);


/* =========================================================
   SOCKET.IO JWT AUTH
========================================================= */

io.use((socket, next) => {
    try {
        const token =
            socket.handshake.auth?.token;

        if (!token) {
            return next(
                new Error("Authentication required")
            );
        }

        const decoded =
            verifyAccessToken(token);

        socket.user = decoded;

        next();
    } catch (error) {
        next(
            new Error(
                "Invalid or expired access token"
            )
        );
    }
});


/* =========================================================
   SOCKET.IO CONNECTION
========================================================= */

io.on("connection", (socket) => {
    console.log(
        `Socket connected: ${socket.id} | User: ${socket.user.userId} | Role: ${socket.user.role}`
    );

    socket.on("disconnect", () => {
        console.log(
            `Socket disconnected: ${socket.id}`
        );
    });
});


/* =========================================================
   START SERVER
========================================================= */

server.listen(
    PORT,
    "0.0.0.0",
    () => {
        console.log(
            `Server running on http://0.0.0.0:${PORT}`
        );

        console.log(
            "Socket.IO server ready"
        );
    }
);