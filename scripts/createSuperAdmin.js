import "dotenv/config";
import bcrypt from "bcrypt";
import prisma from "../src/config/prisma.js";

const email = process.env.SUPER_ADMIN_EMAIL;
const password = process.env.SUPER_ADMIN_PASSWORD;

if (!email || !password) {
    console.error(
        "SUPER_ADMIN_EMAIL and SUPER_ADMIN_PASSWORD are required."
    );
    process.exit(1);
}

if (password.length < 8) {
    console.error(
        "Super Admin password must be at least 8 characters."
    );
    process.exit(1);
}

try {
    const existingUser = await prisma.user.findUnique({
        where: {
            email: email.toLowerCase().trim(),
        },
    });

    if (existingUser) {
        console.error(
            `A user with email ${email} already exists.`
        );
        process.exit(1);
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const user = await prisma.user.create({
        data: {
            name: "Super Admin",
            email: email.toLowerCase().trim(),
            passwordHash,
            role: "SUPER_ADMIN",
            status: "ACTIVE",
        },
    });

    console.log("Super Admin created successfully.");
    console.log("User ID:", user.id);
    console.log("Email:", user.email);
    console.log("Role:", user.role);
} catch (error) {
    console.error("Failed to create Super Admin:", error);
    process.exit(1);
} finally {
    await prisma.$disconnect();
}