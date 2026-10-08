import prisma from "../config/prisma.js";

/*
 * ============================================================
 * GOOGLE APPS SCRIPT
 * ============================================================
 */

const APPS_SCRIPT_URL =
    process.env.GOOGLE_APPS_SCRIPT_URL ||
    "https://script.google.com/macros/s/AKfycbyhMb46Rjbe98HzdGzCZ2U2F5kDkSREqDZyjbq_lz_w_5HKjyEKNyFkiLmtX9Jc3ePZQw/exec";


/*
 * ============================================================
 * ESCAPE HTML
 * ============================================================
 */

const escapeHtml = (value) => {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
};


/*
 * ============================================================
 * FORMAT DATE
 * ============================================================
 */

const formatDateTime = (value) => {
    if (!value) {
        return "N/A";
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return "N/A";
    }

    return date.toLocaleString("en-IN", {
        dateStyle: "medium",
        timeStyle: "medium",
    });
};


/*
 * ============================================================
 * EXTRACT TASK ID FROM VISIT NOTES
 * ============================================================
 *
 * Flutter stores:
 *
 * Task ID: xxxxx
 *
 * inside Visit.notes.
 * ============================================================
 */

const extractTaskIdFromNotes = (notes) => {
    if (!notes) {
        return null;
    }

    const text = String(notes);

    const match = text.match(
        /Task\s*ID\s*:\s*([a-zA-Z0-9_-]+)/i
    );

    return match
        ? match[1].trim()
        : null;
};


/*
 * ============================================================
 * NORMALIZE AUDIT ANSWER
 * ============================================================
 */

const getAnswerText = (answer) => {

    if (
        answer?.booleanValue !== null &&
        answer?.booleanValue !== undefined
    ) {
        return answer.booleanValue
            ? "YES"
            : "NO";
    }

    if (
        answer?.textValue !== null &&
        answer?.textValue !== undefined &&
        String(answer.textValue).trim() !== ""
    ) {
        return String(answer.textValue);
    }

    return "N/A";
};


/*
 * ============================================================
 * BUILD PLAIN TEXT EMAIL
 * ============================================================
 */

const buildPlainTextEmail = ({
    task,
    site,
    supervisor,
    visit,
    checkIn,
    auditSubmission,
}) => {

    const lines = [];

    lines.push(
        "Site Audit Completion Report"
    );

    lines.push(
        "================================"
    );

    lines.push(
        `Task: ${task?.title || "N/A"}`
    );

    lines.push(
        `Task ID: ${task?.id || "N/A"}`
    );

    lines.push(
        `Client: ${task?.clientName || visit?.clientName || "N/A"}`
    );

    lines.push(
        `Site: ${site?.name || "N/A"}`
    );

    lines.push(
        `Site Code: ${site?.siteCode || "N/A"}`
    );

    lines.push(
        `Address: ${site?.address || "N/A"}`
    );

    lines.push(
        `City: ${site?.city || "N/A"}`
    );

    lines.push(
        `State: ${site?.state || "N/A"}`
    );

    lines.push(
        `Supervisor: ${supervisor?.name || "N/A"}`
    );

    lines.push(
        `Supervisor Email: ${supervisor?.email || "N/A"}`
    );

    lines.push(
        `Audit Submitted At: ${formatDateTime(
            auditSubmission?.submittedAt
        )}`
    );

    lines.push(
        `Check-In: ${formatDateTime(
            checkIn?.checkInAt
        )}`
    );

    lines.push(
        `Check-Out: ${formatDateTime(
            checkIn?.checkOutAt
        )}`
    );

    lines.push("");

    lines.push(
        "Audit Answers"
    );

    lines.push(
        "================================"
    );

    for (
        const answer of
        auditSubmission?.answers || []
    ) {

        const questionNo =
            answer?.questionNo ?? "";

        const questionText =
            answer?.questionText || "N/A";

        const answerText =
            getAnswerText(answer);

        lines.push(
            `${questionNo}. ${questionText}`
        );

        lines.push(
            `Answer: ${answerText}`
        );

        lines.push("");
    }

    if (
        visit?.latitude !== null &&
        visit?.latitude !== undefined &&
        visit?.longitude !== null &&
        visit?.longitude !== undefined
    ) {

        lines.push(
            `GPS: ${visit.latitude}, ${visit.longitude}`
        );

        lines.push(
            `Map: https://www.google.com/maps?q=${visit.latitude},${visit.longitude}`
        );
    }

    lines.push("");

    lines.push(
        "The site audit has been completed successfully."
    );

    return lines.join("\n");
};


/*
 * ============================================================
 * BUILD HTML EMAIL
 * ============================================================
 */

const buildHtmlEmail = ({
    task,
    site,
    supervisor,
    visit,
    checkIn,
    auditSubmission,
}) => {

    const answerRows =
        (auditSubmission?.answers || [])
            .map((answer) => {

                const questionNo =
                    answer?.questionNo ?? "";

                const questionText =
                    answer?.questionText ||
                    "N/A";

                const answerText =
                    getAnswerText(answer);

                return `
                    <tr>
                        <td style="
                            padding:10px;
                            border:1px solid #ddd;
                            text-align:center;
                            vertical-align:top;
                        ">
                            ${escapeHtml(questionNo)}
                        </td>

                        <td style="
                            padding:10px;
                            border:1px solid #ddd;
                            vertical-align:top;
                        ">
                            ${escapeHtml(questionText)}
                        </td>

                        <td style="
                            padding:10px;
                            border:1px solid #ddd;
                            vertical-align:top;
                            font-weight:600;
                        ">
                            ${escapeHtml(answerText)}
                        </td>
                    </tr>
                `;
            })
            .join("");


    const gpsSection =
        visit?.latitude !== null &&
            visit?.latitude !== undefined &&
            visit?.longitude !== null &&
            visit?.longitude !== undefined
            ? `
                <div style="
                    margin-top:20px;
                    padding:15px;
                    background:#f5f5f5;
                    border-radius:8px;
                ">
                    <strong>Visit GPS</strong>

                    <p style="margin:8px 0;">
                        Latitude:
                        ${escapeHtml(visit.latitude)}
                    </p>

                    <p style="margin:8px 0;">
                        Longitude:
                        ${escapeHtml(visit.longitude)}
                    </p>

                    <p style="margin:8px 0;">
                        <a
                            href="https://www.google.com/maps?q=${encodeURIComponent(
                `${visit.latitude},${visit.longitude}`
            )}"
                            target="_blank"
                        >
                            View location on Google Maps
                        </a>
                    </p>
                </div>
            `
            : "";


    const photoSection =
        visit?.photoUrl
            ? `
                <div style="
                    margin-top:20px;
                    padding:15px;
                    background:#f5f5f5;
                    border-radius:8px;
                ">
                    <strong>Site Photo</strong>

                    <p style="margin-top:8px;">
                        The site visit photo is attached to this email.
                    </p>

                    <p>
                        <a
                            href="${escapeHtml(
                visit.photoUrl
            )}"
                            target="_blank"
                        >
                            View Site Photo
                        </a>
                    </p>
                </div>
            `
            : `
                <div style="
                    margin-top:20px;
                    padding:15px;
                    background:#fff7ed;
                    border-radius:8px;
                ">
                    <strong>Site Photo</strong>

                    <p>
                        No site photo was available.
                    </p>
                </div>
            `;


    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Site Audit Completion Report</title>
</head>

<body style="
    margin:0;
    padding:20px;
    background:#f4f6f8;
    font-family:Arial,Helvetica,sans-serif;
    color:#222;
">

    <div style="
        max-width:900px;
        margin:0 auto;
        background:#ffffff;
        padding:30px;
        border-radius:10px;
    ">

        <h2 style="
            margin-top:0;
            margin-bottom:20px;
        ">
            Site Audit Completion Report
        </h2>


        <p>
            Dear Client,
        </p>

        <p>
            The assigned site audit has been completed
            successfully by the Supervisor.
        </p>


        <!-- TASK INFORMATION -->

        <h3>
            Task Information
        </h3>

        <table style="
            width:100%;
            border-collapse:collapse;
            margin-bottom:20px;
        ">

            <tr>
                <td style="
                    padding:8px;
                    border:1px solid #ddd;
                    font-weight:bold;
                    width:30%;
                ">
                    Task
                </td>

                <td style="
                    padding:8px;
                    border:1px solid #ddd;
                ">
                    ${escapeHtml(
        task?.title || "N/A"
    )}
                </td>
            </tr>


            <tr>
                <td style="
                    padding:8px;
                    border:1px solid #ddd;
                    font-weight:bold;
                ">
                    Task ID
                </td>

                <td style="
                    padding:8px;
                    border:1px solid #ddd;
                ">
                    ${escapeHtml(
        task?.id || "N/A"
    )}
                </td>
            </tr>


            <tr>
                <td style="
                    padding:8px;
                    border:1px solid #ddd;
                    font-weight:bold;
                ">
                    Client
                </td>

                <td style="
                    padding:8px;
                    border:1px solid #ddd;
                ">
                    ${escapeHtml(
        task?.clientName ||
        visit?.clientName ||
        "N/A"
    )}
                </td>
            </tr>

        </table>


        <!-- SITE INFORMATION -->

        <h3>
            Site Information
        </h3>

        <table style="
            width:100%;
            border-collapse:collapse;
            margin-bottom:20px;
        ">

            <tr>
                <td style="
                    padding:8px;
                    border:1px solid #ddd;
                    font-weight:bold;
                    width:30%;
                ">
                    Site Name
                </td>

                <td style="
                    padding:8px;
                    border:1px solid #ddd;
                ">
                    ${escapeHtml(
        site?.name || "N/A"
    )}
                </td>
            </tr>


            <tr>
                <td style="
                    padding:8px;
                    border:1px solid #ddd;
                    font-weight:bold;
                ">
                    Site Code
                </td>

                <td style="
                    padding:8px;
                    border:1px solid #ddd;
                ">
                    ${escapeHtml(
        site?.siteCode || "N/A"
    )}
                </td>
            </tr>


            <tr>
                <td style="
                    padding:8px;
                    border:1px solid #ddd;
                    font-weight:bold;
                ">
                    Address
                </td>

                <td style="
                    padding:8px;
                    border:1px solid #ddd;
                ">
                    ${escapeHtml(
        site?.address || "N/A"
    )}
                </td>
            </tr>


            <tr>
                <td style="
                    padding:8px;
                    border:1px solid #ddd;
                    font-weight:bold;
                ">
                    City
                </td>

                <td style="
                    padding:8px;
                    border:1px solid #ddd;
                ">
                    ${escapeHtml(
        site?.city || "N/A"
    )}
                </td>
            </tr>


            <tr>
                <td style="
                    padding:8px;
                    border:1px solid #ddd;
                    font-weight:bold;
                ">
                    State
                </td>

                <td style="
                    padding:8px;
                    border:1px solid #ddd;
                ">
                    ${escapeHtml(
        site?.state || "N/A"
    )}
                </td>
            </tr>

        </table>


        <!-- SUPERVISOR -->

        <h3>
            Supervisor
        </h3>

        <table style="
            width:100%;
            border-collapse:collapse;
            margin-bottom:20px;
        ">

            <tr>
                <td style="
                    padding:8px;
                    border:1px solid #ddd;
                    font-weight:bold;
                    width:30%;
                ">
                    Name
                </td>

                <td style="
                    padding:8px;
                    border:1px solid #ddd;
                ">
                    ${escapeHtml(
        supervisor?.name ||
        "N/A"
    )}
                </td>
            </tr>


            <tr>
                <td style="
                    padding:8px;
                    border:1px solid #ddd;
                    font-weight:bold;
                ">
                    Email
                </td>

                <td style="
                    padding:8px;
                    border:1px solid #ddd;
                ">
                    ${escapeHtml(
        supervisor?.email ||
        "N/A"
    )}
                </td>
            </tr>

        </table>


        <!-- TIMINGS -->

        <h3>
            Visit Timing
        </h3>

        <table style="
            width:100%;
            border-collapse:collapse;
            margin-bottom:20px;
        ">

            <tr>
                <td style="
                    padding:8px;
                    border:1px solid #ddd;
                    font-weight:bold;
                    width:30%;
                ">
                    Audit Submitted
                </td>

                <td style="
                    padding:8px;
                    border:1px solid #ddd;
                ">
                    ${escapeHtml(
        formatDateTime(
            auditSubmission?.submittedAt
        )
    )}
                </td>
            </tr>


            <tr>
                <td style="
                    padding:8px;
                    border:1px solid #ddd;
                    font-weight:bold;
                ">
                    Check-In
                </td>

                <td style="
                    padding:8px;
                    border:1px solid #ddd;
                ">
                    ${escapeHtml(
        formatDateTime(
            checkIn?.checkInAt
        )
    )}
                </td>
            </tr>


            <tr>
                <td style="
                    padding:8px;
                    border:1px solid #ddd;
                    font-weight:bold;
                ">
                    Check-Out
                </td>

                <td style="
                    padding:8px;
                    border:1px solid #ddd;
                ">
                    ${escapeHtml(
        formatDateTime(
            checkIn?.checkOutAt
        )
    )}
                </td>
            </tr>

        </table>


        <!-- AUDIT ANSWERS -->

        <h3>
            Audit Answers
        </h3>

        <table style="
            width:100%;
            border-collapse:collapse;
            margin-top:10px;
        ">

            <thead>

                <tr>
                    <th style="
                        padding:10px;
                        border:1px solid #ddd;
                        text-align:center;
                    ">
                        #
                    </th>

                    <th style="
                        padding:10px;
                        border:1px solid #ddd;
                        text-align:left;
                    ">
                        Question
                    </th>

                    <th style="
                        padding:10px;
                        border:1px solid #ddd;
                        text-align:left;
                    ">
                        Answer
                    </th>
                </tr>

            </thead>

            <tbody>
                ${answerRows ||
        `
                        <tr>
                            <td
                                colspan="3"
                                style="
                                    padding:15px;
                                    border:1px solid #ddd;
                                    text-align:center;
                                "
                            >
                                No audit answers found.
                            </td>
                        </tr>
                    `
        }
            </tbody>

        </table>


        ${gpsSection}

        ${photoSection}


        <div style="
            margin-top:30px;
            padding-top:20px;
            border-top:1px solid #ddd;
            font-size:13px;
            color:#666;
        ">
            This email was generated automatically after
            completion of the site audit and checkout.
        </div>

    </div>

</body>
</html>
`;
};


/*
 * ============================================================
 * SEND AUDIT COMPLETION EMAIL
 * ============================================================
 *
 * CALLED AFTER CHECKOUT
 * ============================================================
 */

export const sendAuditCompletionEmail = async ({
    checkInId,
}) => {

    try {

        /*
         * --------------------------------------------------------
         * VALIDATE CHECK-IN ID
         * --------------------------------------------------------
         */

        if (!checkInId) {

            return {
                success: false,
                skipped: true,
                reason:
                    "Check-in ID is required.",
            };
        }


        /*
         * --------------------------------------------------------
         * GET CHECK-IN
         * --------------------------------------------------------
         */

        const checkIn =
            await prisma.checkInOut.findUnique({
                where: {
                    id: checkInId,
                },

                include: {
                    user: {
                        select: {
                            id: true,
                            name: true,
                            email: true,
                            role: true,
                        },
                    },

                    site: {
                        select: {
                            id: true,
                            name: true,
                            siteCode: true,
                            address: true,
                            city: true,
                            state: true,
                        },
                    },
                },
            });


        if (!checkIn) {

            return {
                success: false,
                skipped: true,
                reason:
                    "Check-in record not found.",
            };
        }


        /*
         * --------------------------------------------------------
         * ONLY SUPERVISOR
         * --------------------------------------------------------
         */

        if (
            checkIn.user?.role !==
            "SUPERVISOR"
        ) {

            return {
                success: false,
                skipped: true,
                reason:
                    "Audit completion email is only for Supervisors.",
            };
        }


        /*
         * --------------------------------------------------------
         * FIND VISIT
         * --------------------------------------------------------
         *
         * Visit belongs to:
         *
         * Supervisor + Site
         *
         * and contains the Task ID.
         * --------------------------------------------------------
         */

        const visits =
            await prisma.visit.findMany({

                where: {
                    userId:
                        checkIn.userId,

                    siteId:
                        checkIn.siteId,

                    notes: {
                        contains:
                            "Task ID:",
                        mode:
                            "insensitive",
                    },
                },

                orderBy: {
                    visitAt: "desc",
                },

                take: 20,
            });


        if (!visits.length) {

            return {
                success: false,
                skipped: true,
                reason:
                    "No task visit found for this checkout.",
            };
        }


        /*
         * --------------------------------------------------------
         * FIND EXACT TASK + AUDIT VISIT
         * --------------------------------------------------------
         */

        let selectedVisit = null;
        let selectedTask = null;
        let selectedAuditSubmission = null;


        for (
            const visit of visits
        ) {

            const taskId =
                extractTaskIdFromNotes(
                    visit.notes
                );

            if (!taskId) {
                continue;
            }


            const task =
                await prisma.task.findUnique({
                    where: {
                        id: taskId,
                    },
                });


            if (!task) {
                continue;
            }


            /*
             * SECURITY
             *
             * Task must belong to:
             *
             * current Supervisor
             * exact checkout site
             */

            if (
                task.assignedToId !==
                checkIn.userId
            ) {
                continue;
            }


            if (
                task.siteId !==
                checkIn.siteId
            ) {
                continue;
            }


            const auditSubmission =
                await prisma.auditSubmission.findFirst({
                    where: {
                        visitId:
                            visit.id,
                    },

                    include: {

                        answers: {
                            orderBy: {
                                questionNo:
                                    "asc",
                            },
                        },

                        template: {
                            select: {
                                id: true,
                                name: true,
                                description:
                                    true,
                            },
                        },

                    },
                });


            if (!auditSubmission) {
                continue;
            }


            selectedVisit =
                visit;

            selectedTask =
                task;

            selectedAuditSubmission =
                auditSubmission;

            break;
        }


        /*
         * --------------------------------------------------------
         * NO AUDIT
         * --------------------------------------------------------
         */

        if (
            !selectedVisit ||
            !selectedTask ||
            !selectedAuditSubmission
        ) {

            return {
                success: false,
                skipped: true,
                reason:
                    "No audit submission was found for this checkout.",
            };
        }


        /*
         * --------------------------------------------------------
         * VERIFY TASK IS COMPLETED
         * --------------------------------------------------------
         *
         * Email should only be sent after:
         *
         * Audit completed
         * +
         * Task completed
         * +
         * Checkout completed
         * --------------------------------------------------------
         */

        if (
            selectedTask.status !==
            "COMPLETED"
        ) {

            return {
                success: false,
                skipped: true,
                reason:
                    "Task is not marked COMPLETED yet.",
                taskId:
                    selectedTask.id,
            };
        }


        /*
         * --------------------------------------------------------
         * CLIENT EMAIL
         * --------------------------------------------------------
         */

        const clientEmail =
            String(
                selectedTask.clientEmail ||
                ""
            ).trim();


        if (!clientEmail) {

            return {
                success: false,
                skipped: true,
                reason:
                    "Client email is not configured for this task.",
                taskId:
                    selectedTask.id,
            };
        }


        /*
         * --------------------------------------------------------
         * VALIDATE EMAIL
         * --------------------------------------------------------
         */

        const emailRegex =
            /^[^\s@]+@[^\s@]+\.[^\s@]+$/;


        if (
            !emailRegex.test(
                clientEmail
            )
        ) {

            return {
                success: false,
                skipped: true,
                reason:
                    "Invalid client email address.",
                taskId:
                    selectedTask.id,
                clientEmail,
            };
        }


        /*
         * --------------------------------------------------------
         * SUBJECT
         * --------------------------------------------------------
         */

        const subject =
            `Site Audit Completed - ${selectedVisit?.site?.name ||
            checkIn.site?.name ||
            "Site"
            }`;


        /*
         * --------------------------------------------------------
         * HTML BODY
         * --------------------------------------------------------
         */

        const htmlBody =
            buildHtmlEmail({
                task:
                    selectedTask,

                site:
                    checkIn.site,

                supervisor:
                    checkIn.user,

                visit:
                    selectedVisit,

                checkIn,

                auditSubmission:
                    selectedAuditSubmission,
            });


        /*
         * --------------------------------------------------------
         * PLAIN TEXT BODY
         * --------------------------------------------------------
         */

        const textBody =
            buildPlainTextEmail({
                task:
                    selectedTask,

                site:
                    checkIn.site,

                supervisor:
                    checkIn.user,

                visit:
                    selectedVisit,

                checkIn,

                auditSubmission:
                    selectedAuditSubmission,
            });


        /*
         * --------------------------------------------------------
         * PHOTO FILE
         * --------------------------------------------------------
         */

        const photoFileId =
            selectedVisit?.photoFileId
                ? String(
                    selectedVisit.photoFileId
                ).trim()
                : "";


        const photoFileName =
            photoFileId
                ? `site-audit-${selectedTask.id}.jpg`
                : "site_visit_photo.jpg";


        /*
         * --------------------------------------------------------
         * REQUEST BODY FOR GOOGLE APPS SCRIPT
         * --------------------------------------------------------
         */

        const payload = {

            action:
                "sendAuditEmail",

            to:
                clientEmail,

            subject:
                subject,

            htmlBody:
                htmlBody,

            textBody:
                textBody,

            photoFileId:
                photoFileId,

            photoFileName:
                photoFileName,

        };


        /*
         * --------------------------------------------------------
         * SEND TO APPS SCRIPT
         * --------------------------------------------------------
         */

        const response =
            await fetch(
                APPS_SCRIPT_URL,
                {
                    method:
                        "POST",

                    headers: {
                        "Content-Type":
                            "application/json",
                    },

                    body:
                        JSON.stringify(
                            payload
                        ),
                }
            );


        const responseText =
            await response.text();


        let responseData;

        try {

            responseData =
                JSON.parse(
                    responseText
                );

        } catch {

            responseData = {
                success:
                    false,

                message:
                    responseText ||
                    "Invalid response from Google Apps Script.",
            };
        }


        /*
         * --------------------------------------------------------
         * HTTP ERROR
         * --------------------------------------------------------
         */

        if (!response.ok) {

            return {
                success:
                    false,

                taskId:
                    selectedTask.id,

                clientEmail,

                message:
                    responseData?.message ||
                    `Google Apps Script returned HTTP ${response.status}`,

                appScriptResponse:
                    responseData,
            };
        }


        /*
         * --------------------------------------------------------
         * APPS SCRIPT ERROR
         * --------------------------------------------------------
         */

        if (
            responseData?.success !==
            true
        ) {

            return {
                success:
                    false,

                taskId:
                    selectedTask.id,

                clientEmail,

                message:
                    responseData?.message ||
                    "Google Apps Script failed to send the email.",

                appScriptResponse:
                    responseData,
            };
        }


        /*
         * --------------------------------------------------------
         * SUCCESS
         * --------------------------------------------------------
         */

        return {

            success:
                true,

            taskId:
                selectedTask.id,

            visitId:
                selectedVisit.id,

            checkInId:
                checkIn.id,

            clientEmail,

            photoAttached:
                Boolean(
                    photoFileId
                ),

            appScriptResponse:
                responseData,

        };

    } catch (error) {

        /*
         * IMPORTANT:
         *
         * Email failure should NOT
         * break checkout.
         */

        console.error(
            "sendAuditCompletionEmail error:",
            error
        );

        return {

            success:
                false,

            skipped:
                false,

            message:
                error?.message ||
                "Failed to send audit completion email.",

        };
    }
};