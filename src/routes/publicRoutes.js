import express from "express";
import prisma from "../config/prisma.js";

const router = express.Router();

/* =========================================================
   HELPER: Parse Site Evidence JSON from Notes
   ========================================================= */
const parseSiteEvidence = (notes) => {
    if (!notes || typeof notes !== "string") return {};
    const match = notes.match(/\[SITE_EVIDENCE\]:\s*(\{[\s\S]*?\})/);
    if (match) {
        try {
            return JSON.parse(match[1]);
        } catch (_) { }
    }
    return {};
};

/* =========================================================
   HELPER: Parse Submitted Audit Answers
   ========================================================= */
const parseSubmittedAnswers = (visit) => {
    const answers = visit?.auditSubmission?.answers;
    if (answers && Array.isArray(answers) && answers.length > 0) {
        return answers.map((a, idx) => {
            let photos = [];
            let displayTextValue = a.textValue;
            if (a.textValue) {
                try {
                    const parsed = JSON.parse(a.textValue);
                    if (Array.isArray(parsed)) {
                        photos = parsed.filter(Boolean);
                        displayTextValue = null;
                    } else if (
                        typeof parsed === "string" &&
                        (parsed.startsWith("data:image") || parsed.startsWith("http"))
                    ) {
                        photos = [parsed];
                        displayTextValue = null;
                    }
                } catch (_) {
                    if (
                        typeof a.textValue === "string" &&
                        (a.textValue.startsWith("data:image") || a.textValue.startsWith("http"))
                    ) {
                        photos = [a.textValue];
                        displayTextValue = null;
                    }
                }
            }
            const hasBool = typeof a.booleanValue === "boolean";
            return {
                no: a.questionNo || idx + 1,
                text: a.questionText || `Question #${a.questionNo || idx + 1}`,
                ans: hasBool ? (a.booleanValue ? "Yes" : "No") : (displayTextValue || "-"),
                booleanValue: a.booleanValue,
                photos,
                score: a.booleanValue === false ? "0 / 4" : "4 / 4",
            };
        });
    }

    /* Fallback: reports pushed by the supervisor mobile app (VSF) keep their answers inside
       Visit.notes as a single line:  [VINICA_VSF_REPORT]: {json}  */
    const m = typeof visit?.notes === "string" ? visit.notes.match(/\[VINICA_VSF_REPORT\]:\s*(.+)/) : null;
    if (m) {
        try {
            const report = JSON.parse(m[1]);
            const list = Array.isArray(report.answers) ? report.answers : [];
            return list.map((a, idx) => {
                const raw = String(a.a ?? "").trim();
                const isYes = raw.toLowerCase() === "yes";
                const isNo = raw.toLowerCase() === "no";
                const extra = [
                    a.kp ? `Number: ${a.kp}` : "",
                    a.rm ? `Remark: ${a.rm}` : "",
                ].filter(Boolean).join(" | ");
                const base = isYes ? "Yes" : isNo ? "No" : (raw || "-");
                return {
                    no: a.n || idx + 1,
                    text: a.t || `Question #${a.n || idx + 1}`,
                    ans: extra ? `${base} (${extra})` : base,
                    booleanValue: isYes ? true : isNo ? false : undefined,
                    photos: Array.isArray(a.ph) ? a.ph.filter(Boolean) : [],
                    score: isNo ? "0 / 4" : "4 / 4",
                };
            });
        } catch (_) { /* ignore malformed notes */ }
    }
    return [];
};

/* =========================================================
   1. JSON API: PUBLIC AUDIT REPORT DATA
   Used by React Frontend (PublicAuditView.jsx)
   ========================================================= */
router.get("/audit/:visitId", async (req, res) => {
    try {
        const { visitId } = req.params;

        const visit = await prisma.visit.findFirst({
            where: {
                OR: [
                    { id: visitId },
                    { notes: { contains: visitId } },
                ],
            },
            include: {
                site: true,
                user: {
                    select: {
                        id: true,
                        name: true,
                        phone: true,
                        email: true,
                    },
                },
                auditSubmission: {
                    include: {
                        answers: {
                            orderBy: { questionNo: "asc" },
                        },
                    },
                },
            },
        });

        if (!visit) {
            return res.status(404).json({
                success: false,
                message: "Audit report not found",
            });
        }

        return res.status(200).json({
            success: true,
            data: { visit },
        });
    } catch (error) {
        console.error("Public audit fetch error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to fetch audit report",
        });
    }
});

/* =========================================================
   2. STANDALONE HTML WEB VIEW: PUBLIC AUDIT REPORT
   Opened directly from WhatsApp link on any mobile or desktop
   Includes live photos, GPS stamp, scores, and PDF Download
   ========================================================= */
router.get(["/audit-view/:visitId", "/report/:visitId"], async (req, res) => {
    try {
        const { visitId } = req.params;

        const visit = await prisma.visit.findFirst({
            where: {
                OR: [
                    { id: visitId },
                    { notes: { contains: visitId } },
                ],
            },
            include: {
                site: true,
                user: {
                    select: {
                        id: true,
                        name: true,
                        phone: true,
                        email: true,
                    },
                },
                auditSubmission: {
                    include: {
                        answers: {
                            orderBy: { questionNo: "asc" },
                        },
                    },
                },
            },
        });

        if (!visit) {
            return res.status(404).send(`
                <!DOCTYPE html>
                <html>
                <head>
                    <meta charset="utf-8"/>
                    <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
                    <title>Report Not Found</title>
                    <style>
                        body { font-family: -apple-system, sans-serif; text-align: center; padding: 50px 20px; background: #f8fafc; color: #1e293b; }
                        h2 { color: #dc2626; }
                    </style>
                </head>
                <body>
                    <h2>Audit Report Not Found</h2>
                    <p>The requested audit visit record does not exist or has expired.</p>
                </body>
                </html>
            `);
        }

        const siteEvidence = parseSiteEvidence(visit.notes);
        const submittedQuestions = parseSubmittedAnswers(visit);
        const totalQ = submittedQuestions.length;
        const passedQ = submittedQuestions.filter((q) => q.booleanValue === true).length;
        const dynamicScore = totalQ > 0 ? Math.round((passedQ / totalQ) * 100) : 100;

        const siteName = visit.site?.name || visit.clientName || "Client Site";
        const siteCode = visit.site?.siteCode || "";
        const locationTag = visit.site?.city || visit.site?.state || "Site Location";
        const auditorName = visit.user?.name || "Operation Executive";
        const auditorPhone = visit.user?.phone || "";
        const visitDateStr = visit.visitAt
            ? new Date(visit.visitAt).toLocaleString("en-IN", {
                day: "2-digit",
                month: "short",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
                hour12: true,
            })
            : "—";

        const lat = visit.latitude !== null && visit.latitude !== undefined ? Number(visit.latitude).toFixed(6) : "N/A";
        const lng = visit.longitude !== null && visit.longitude !== undefined ? Number(visit.longitude).toFixed(6) : "N/A";

        const namePlateImg = siteEvidence.nameplate || siteEvidence.namePlatePhoto || "";
        const selfieImg = siteEvidence.selfie || siteEvidence.selfiePhoto || "";
        const sitePhoto1Img = siteEvidence.photo1 || siteEvidence.sitePhoto || visit.photoUrl || "";

        const questionsHtml = submittedQuestions.length === 0
            ? `<div style="padding: 20px; color: #64748b; text-align: center;">No audit checklist questions submitted for this visit.</div>`
            : submittedQuestions.map((q) => {
                const photosHtml = q.photos && q.photos.length > 0
                    ? `<div class="q-photos">${q.photos.map((p, pIdx) => `
                        <div class="q-thumb" onclick="openPreview('${p.replace(/'/g, "\\'")}', 'Q#${q.no} Evidence Photo${pIdx + 1}')">
                            <img src="${p}" alt="Evidence ${pIdx + 1}" />
                        </div>
                    `).join("")}</div>`
                    : "";

                const scoreColor = q.booleanValue === false ? "#dc2626" : "#0891b2";
                const scoreBorder = q.booleanValue === false ? "#f87171" : "#06b6d4";

                return `
                    <div class="audit-row">
                        <div class="q-no">${q.no}.</div>
                        <div class="q-body">
                            <div class="q-title">${q.text}</div>
                            <div class="q-ans">${q.ans}</div>
                            ${photosHtml}
                        </div>
                        <div class="q-score">
                            <span class="score-badge" style="color: ${scoreColor}; border-color: ${scoreBorder};">SCORE : ${q.score}</span>
                        </div>
                    </div>
                `;
            }).join("");

        const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8"/>
    <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
    <title>Audit Report - ${siteName} (${siteCode})</title>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
            background: #f1f5f9;
            color: #0f172a;
            line-height: 1.5;
            padding-bottom: 40px;
        }

        .report-header {
            background: #ffffff;
            border-bottom: 1px solid #e2e8f0;
            padding: 16px 24px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            flex-wrap: wrap;
            gap: 16px;
            position: sticky;
            top: 0;
            z-index: 100;
            box-shadow: 0 1px 3px rgba(0,0,0,0.05);
        }
        .header-title-box h1 {
            font-size: 19px;
            font-weight: 800;
            color: #0f172a;
            display: inline-block;
        }
        .loc-pill {
            display: inline-block;
            margin-left: 10px;
            padding: 2px 10px;
            background: #eff6ff;
            color: #2563eb;
            border: 1px solid #bfdbfe;
            border-radius: 12px;
            font-size: 11px;
            font-weight: 700;
        }
        .header-meta {
            display: flex;
            gap: 16px;
            margin-top: 6px;
            font-size: 12px;
            color: #64748b;
            flex-wrap: wrap;
        }
        .header-actions {
            display: flex;
            gap: 10px;
            align-items: center;
        }
        .btn-download {
            background: #2563eb;
            color: #ffffff;
            border: none;
            padding: 10px 18px;
            border-radius: 8px;
            font-size: 13px;
            font-weight: 700;
            cursor: pointer;
            display: inline-flex;
            align-items: center;
            gap: 6px;
            transition: background 0.2s;
        }
        .btn-download:hover { background: #1d4ed8; }
        .btn-feedback {
            background: #059669;
            color: #ffffff;
            border: none;
            padding: 10px 18px;
            border-radius: 8px;
            font-size: 13px;
            font-weight: 700;
            text-decoration: none;
            display: inline-flex;
            align-items: center;
            gap: 6px;
        }
        .btn-feedback:hover { background: #047857; }

        .report-container {
            max-width: 1200px;
            margin: 20px auto;
            padding: 0 16px;
        }

        .score-banner {
            display: flex;
            justify-content: space-between;
            align-items: center;
            background: #ffffff;
            border: 1px solid #e2e8f0;
            border-radius: 8px;
            padding: 14px 20px;
            margin-bottom: 18px;
        }
        .score-banner .category {
            font-size: 16px;
            font-weight: 800;
            color: #1e293b;
        }
        .score-banner .score-num {
            font-size: 16px;
            font-weight: 800;
            color: #059669;
        }

        .evidence-card {
            background: #ffffff;
            border: 1px solid #e2e8f0;
            border-radius: 10px;
            padding: 20px;
            margin-bottom: 20px;
            box-shadow: 0 1px 3px rgba(0,0,0,0.02);
        }
        .evidence-header {
            font-size: 14px;
            font-weight: 700;
            color: #334155;
            margin-bottom: 16px;
        }
        .photos-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
            gap: 20px;
            margin-bottom: 20px;
        }
        .photo-card {
            display: flex;
            flex-direction: column;
            align-items: center;
            text-align: center;
        }
        .photo-frame {
            width: 100%;
            height: 180px;
            border-radius: 8px;
            overflow: hidden;
            border: 1.5px solid #cbd5e1;
            background: #f8fafc;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            position: relative;
        }
        .photo-frame img {
            width: 100%;
            height: 100%;
            object-fit: cover;
        }
        .photo-placeholder {
            color: #94a3b8;
            font-size: 12px;
            font-weight: 600;
            padding: 10px;
        }
        .photo-label {
            margin-top: 8px;
            font-size: 12px;
            font-weight: 700;
            color: #475569;
            text-transform: uppercase;
        }

        .verify-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding-top: 16px;
            border-top: 1px solid #f1f5f9;
            flex-wrap: wrap;
            gap: 16px;
        }
        .gps-badge {
            display: inline-block;
            padding: 6px 12px;
            background: #dcfce7;
            color: #15803d;
            border-radius: 6px;
            font-size: 12px;
            font-weight: 700;
        }
        .sign-box {
            width: 200px;
            height: 60px;
            border: 1px dashed #cbd5e1;
            border-radius: 6px;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            background: #fafafa;
        }
        .sign-caption {
            font-size: 10px;
            font-weight: 700;
            color: #94a3b8;
            margin-top: 4px;
        }

        .questions-section {
            display: flex;
            flex-direction: column;
            gap: 10px;
        }
        .audit-row {
            background: #ffffff;
            border: 1px solid #e2e8f0;
            border-radius: 8px;
            padding: 14px 18px;
            display: flex;
            align-items: flex-start;
            gap: 16px;
        }
        .q-no {
            font-size: 13px;
            font-weight: 800;
            color: #64748b;
            min-width: 28px;
        }
        .q-body { flex: 1; }
        .q-title {
            font-size: 13px;
            font-weight: 700;
            color: #1e293b;
            margin-bottom: 4px;
        }
        .q-ans {
            font-size: 13px;
            font-weight: 600;
            color: #2563eb;
        }
        .q-photos {
            display: flex;
            gap: 10px;
            flex-wrap: wrap;
            margin-top: 8px;
        }
        .q-thumb {
            width: 80px;
            height: 65px;
            border-radius: 6px;
            overflow: hidden;
            border: 1.5px solid #cbd5e1;
            cursor: pointer;
        }
        .q-thumb img {
            width: 100%;
            height: 100%;
            object-fit: cover;
        }
        .q-score { flex-shrink: 0; }
        .score-badge {
            display: inline-block;
            padding: 4px 10px;
            border: 1px solid;
            border-radius: 6px;
            font-size: 11px;
            font-weight: 700;
        }

        .footer {
            margin-top: 36px;
            text-align: center;
            font-size: 12px;
            color: #64748b;
            border-top: 1px solid #e2e8f0;
            padding-top: 20px;
        }
        .footer strong { color: #0f172a; }

        .modal {
            display: none;
            position: fixed;
            inset: 0;
            background: rgba(0,0,0,0.88);
            z-index: 9999;
            align-items: center;
            justify-content: center;
            padding: 20px;
        }
        .modal-content {
            max-width: 90vw;
            max-height: 85vh;
            border-radius: 8px;
            object-fit: contain;
        }
        .modal-close {
            position: absolute;
            top: 20px;
            right: 25px;
            color: #ffffff;
            font-size: 32px;
            font-weight: 700;
            cursor: pointer;
        }

        @media print {
            .report-header .header-actions,
            .btn-download,
            .btn-feedback,
            .modal {
                display: none !important;
            }
            body { background: #ffffff !important; font-size: 11px; }
            .report-header { position: static !important; border-bottom: 2px solid #0f172a !important; padding: 10px 0 !important; }
            .report-container { max-width: 100% !important; padding: 0 !important; margin: 0 !important; }
            .audit-row { page-break-inside: avoid; break-inside: avoid; border: 1px solid #cbd5e1 !important; margin-bottom: 6px !important; }
        }
    </style>
</head>
<body>
    <header class="report-header">
        <div class="header-title-box">
            <h1>${siteName} ${siteCode ? `(${siteCode})` : ""}</h1>
            <span class="loc-pill">📍 ${locationTag}</span>
            <div class="header-meta">
                <span>📅 ${visitDateStr}</span>
                <span>👤 Executive: <strong>${auditorName}</strong> ${auditorPhone ? `(${auditorPhone})` : ""}</span>
            </div>
        </div>
        <div class="header-actions">
            <button type="button" class="btn-download" onclick="window.print()">
                📄 DOWNLOAD / PRINT REPORT
            </button>
            <a href="/api/public/feedback/${visit.id}" class="btn-feedback">
                💬 SHARE FEEDBACK
            </a>
        </div>
    </header>

    <main class="report-container">
        <div class="score-banner">
            <span class="category">MSF AUDIT COMPLIANCE</span>
            <span class="score-num">Total Score : ${dynamicScore} / 100</span>
        </div>

        <section class="evidence-card">
            <div class="evidence-header">📷 Site Evidence Photos (Click photo to enlarge)</div>
            <div class="photos-grid">
                <div class="photo-card">
                    <div class="photo-frame" onclick="openPreview('${namePlateImg.replace(/'/g, "\\'")}', 'Client Name Plate Photo')">
                        ${namePlateImg ? `<img src="${namePlateImg}" alt="Nameplate" />` : `<div class="photo-placeholder">Name Plate Photo Not Available</div>`}
                    </div>
                    <span class="photo-label">Client Name Plate</span>
                </div>

                <div class="photo-card">
                    <div class="photo-frame" onclick="openPreview('${selfieImg.replace(/'/g, "\\'")}', 'Supervisor Face Selfie')">
                        ${selfieImg ? `<img src="${selfieImg}" alt="Selfie" />` : `<div class="photo-placeholder">Supervisor Selfie Not Available</div>`}
                    </div>
                    <span class="photo-label">Supervisor Selfie</span>
                </div>

                <div class="photo-card">
                    <div class="photo-frame" onclick="openPreview('${sitePhoto1Img.replace(/'/g, "\\'")}', 'Site Entrance Photo')">
                        ${sitePhoto1Img ? `<img src="${sitePhoto1Img}" alt="Site Photo 1" />` : `<div class="photo-placeholder">Site Photo 1 Not Available</div>`}
                    </div>
                    <span class="photo-label">Site Entrance (Photo 1)</span>
                </div>
            </div>

            <div class="verify-row">
                <div class="gps-badge">📍 GPS Location Verified: [Lat: ${lat}, Long: ${lng}]</div>
                <div class="sign-box">
                    <svg width="100" height="28" viewBox="0 0 100 28">
                        <path d="M 5 18 Q 25 8, 50 15 T 90 12" stroke="#1e3a8a" stroke-width="2" fill="none"/>
                    </svg>
                    <span class="sign-caption">DIGITALLY VERIFIED SIGNATURE</span>
                </div>
            </div>
        </section>

        <section class="questions-section">
            ${questionsHtml}
        </section>

        <footer class="footer">
            <p><strong>VINICIA SECURITY SERVICES PVT LTD</strong> • Modern Security Force</p>
            <p>Verified by Mobile GPS & Digital Timestamp. All Rights Reserved.</p>
        </footer>
    </main>

    <div id="photoModal" class="modal" onclick="closePreview()">
        <span class="modal-close">&times;</span>
        <img id="modalImg" class="modal-content" src="" alt="Enlarged Evidence" />
    </div>

    <script>
        function openPreview(url, title) {
            if (!url) return;
            var m = document.getElementById("photoModal");
            var img = document.getElementById("modalImg");
            img.src = url;
            m.style.display = "flex";
        }
        function closePreview() {
            document.getElementById("photoModal").style.display = "none";
        }
    </script>
</body>
</html>
        `;

        res.setHeader("Content-Type", "text/html");
        return res.status(200).send(html);
    } catch (error) {
        console.error("Public HTML audit view error:", error);
        return res.status(500).send("<h3>Failed to render audit report. Please try again.</h3>");
    }
});

/* =========================================================
   3. STANDALONE HTML WEB VIEW: CLIENT FEEDBACK FORM
   Opened directly from WhatsApp feedback link
   ========================================================= */
router.get("/feedback/:visitId", async (req, res) => {
    try {
        const { visitId } = req.params;

        const visit = await prisma.visit.findFirst({
            where: {
                OR: [
                    { id: visitId },
                    { notes: { contains: visitId } },
                ],
            },
            include: { site: true, user: true },
        });

        const siteName = visit?.site?.name || visit?.clientName || "Client Site";
        const executiveName = visit?.user?.name || "Operation Executive";

        const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8"/>
    <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
    <title>Share Feedback - ${siteName}</title>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
            background: #f8fafc;
            color: #0f172a;
            padding: 24px 16px;
            display: flex;
            justify-content: center;
        }
        .card {
            background: #ffffff;
            border: 1px solid #e2e8f0;
            border-radius: 12px;
            max-width: 540px;
            width: 100%;
            padding: 28px;
            box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);
        }
        h2 { font-size: 20px; color: #1e3a8a; margin-bottom: 6px; }
        p.sub { font-size: 13px; color: #64748b; margin-bottom: 20px; }
        .meta-strip { background: #f1f5f9; padding: 10px 14px; border-radius: 6px; font-size: 13px; margin-bottom: 20px; }
        .field { margin-bottom: 18px; }
        label { display: block; font-size: 13px; font-weight: 600; color: #334155; margin-bottom: 6px; }
        input, select, textarea {
            width: 100%;
            padding: 10px 12px;
            border: 1px solid #cbd5e1;
            border-radius: 6px;
            font-size: 14px;
            font-family: inherit;
            outline: none;
        }
        input:focus, select:focus, textarea:focus { border-color: #2563eb; }
        .btn-submit {
            width: 100%;
            background: #2563eb;
            color: #ffffff;
            border: none;
            padding: 12px;
            border-radius: 8px;
            font-size: 15px;
            font-weight: 700;
            cursor: pointer;
            transition: background 0.2s;
        }
        .btn-submit:hover { background: #1d4ed8; }
        .success-box {
            display: none;
            background: #dcfce7;
            border: 1px solid #86efac;
            color: #15803d;
            padding: 16px;
            border-radius: 8px;
            text-align: center;
            font-weight: 600;
            margin-top: 16px;
        }
    </style>
</head>
<body>
    <div class="card">
        <h2>Client Service Feedback</h2>
        <p class="sub">Please rate your site audit experience with Vinicia Security Services.</p>

        <div class="meta-strip">
            <div>Site: <strong>${siteName}</strong></div>
            <div>Executive: <strong>${executiveName}</strong></div>
        </div>

        <form id="feedbackForm" onsubmit="submitForm(event)">
            <div class="field">
                <label>Overall Experience</label>
                <select id="rating" required>
                    <option value="5">⭐⭐⭐⭐⭐ Excellent (5/5)</option>
                    <option value="4">⭐⭐⭐⭐ Very Good (4/5)</option>
                    <option value="3">⭐⭐⭐ Good (3/5)</option>
                    <option value="2">⭐⭐ Fair (2/5)</option>
                    <option value="1">⭐ Needs Improvement (1/5)</option>
                </select>
            </div>

            <div class="field">
                <label>Your Name</label>
                <input type="text" id="clientName" placeholder="Branch Manager / Incharge Name" required />
            </div>

            <div class="field">
                <label>Your Contact Number (Optional)</label>
                <input type="tel" id="clientPhone" placeholder="Mobile Number" />
            </div>

            <div class="field">
                <label>Feedback & Observations</label>
                <textarea id="comments" rows="4" placeholder="Any comments regarding supervisor audit or guard deployment..."></textarea>
            </div>

            <button type="submit" class="btn-submit" id="submitBtn">Submit Feedback</button>
        </form>

        <div id="successBox" class="success-box">
            ✅ Thank you! Your feedback has been recorded successfully.
        </div>
    </div>

    <script>
        async function submitForm(e) {
            e.preventDefault();
            var btn = document.getElementById("submitBtn");
            btn.disabled = true;
            btn.innerText = "Submitting...";

            var payload = {
                rating: document.getElementById("rating").value,
                clientName: document.getElementById("clientName").value,
                clientPhone: document.getElementById("clientPhone").value,
                comments: document.getElementById("comments").value
            };

            try {
                var res = await fetch("/api/public/feedback/${visitId}", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload)
                });
                if (res.ok) {
                    document.getElementById("feedbackForm").style.display = "none";
                    document.getElementById("successBox").style.display = "block";
                } else {
                    alert("Failed to submit feedback. Please try again.");
                    btn.disabled = false;
                    btn.innerText = "Submit Feedback";
                }
            } catch (err) {
                alert("Network error. Please try again.");
                btn.disabled = false;
                btn.innerText = "Submit Feedback";
            }
        }
    </script>
</body>
</html>
        `;

        res.setHeader("Content-Type", "text/html");
        return res.status(200).send(html);
    } catch (error) {
        console.error("Public HTML feedback view error:", error);
        return res.status(500).send("<h3>Failed to render feedback form.</h3>");
    }
});

/* =========================================================
   4. API: RECEIVE FEEDBACK SUBMISSION
   ========================================================= */
router.post("/feedback/:visitId", async (req, res) => {
    try {
        const { visitId } = req.params;
        const feedbackData = req.body;

        const visit = await prisma.visit.findFirst({
            where: {
                OR: [
                    { id: visitId },
                    { notes: { contains: visitId } },
                ],
            },
        });

        if (!visit) {
            return res.status(404).json({
                success: false,
                message: "Visit not found",
            });
        }

        if (!feedbackData || typeof feedbackData !== "object" || !feedbackData.answers || typeof feedbackData.answers !== "object" || Object.keys(feedbackData.answers).length === 0) {
            return res.status(400).json({
                success: false,
                message: "Feedback answers are required",
            });
        }

        if ((visit.notes || "").includes("[CLIENT_FEEDBACK]:")) {
            return res.status(409).json({
                success: false,
                message: "Feedback has already been submitted for this visit. Thank you!",
            });
        }

        {
            const existingNotes = visit.notes || "";
            const feedbackJsonStr = JSON.stringify({
                submittedAt: new Date().toISOString(),
                ...feedbackData,
            });
            await prisma.visit.update({
                where: { id: visit.id },
                data: {
                    notes: `${existingNotes}\n[CLIENT_FEEDBACK]: ${feedbackJsonStr}`.trim(),
                },
            });
        }

        return res.status(200).json({
            success: true,
            message: "Feedback submitted successfully. Thank you!",
        });
    } catch (error) {
        console.error("Public feedback submit error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to submit feedback",
        });
    }
});

export default router;