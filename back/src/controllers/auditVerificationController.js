import prisma from "../config/prisma.js";


/*
 * ============================================================
 * GET SUBMITTED AUDITS
 * ============================================================
 *
 * ADMIN ONLY
 *
 * Returns only visits that have an AuditSubmission.
 *
 * Audit lifecycle:
 *
 * PENDING
 * VERIFIED
 * REJECTED
 *
 * IMPORTANT:
 * REJECTED is stored as Visit.status = REJECTED.
 *
 * UNVERIFIED is retained only so older existing records
 * do not break.
 * ============================================================
 */

const getSubmittedAudits = async (
    req,
    res
) => {

    try {

        const {
            status = "ALL",
            page = "1",
            limit = "50",
            search = "",
        } = req.query;


        const pageNumber =
            Math.max(
                parseInt(
                    page,
                    10
                ) || 1,
                1
            );


        const limitNumber =
            Math.min(
                Math.max(
                    parseInt(
                        limit,
                        10
                    ) || 50,
                    1
                ),
                100
            );


        const normalizedStatus =
            String(
                status || ""
            )
                .trim()
                .toUpperCase();


        /*
         * --------------------------------------------------------
         * BASE WHERE
         * --------------------------------------------------------
         */

        const where = {

            visit: {

                user: {
                    role: "SUPERVISOR",
                },

            },

        };


        /*
         * --------------------------------------------------------
         * STATUS FILTER
         * --------------------------------------------------------
         */

        if (
            normalizedStatus ===
            "PENDING"
        ) {

            where.visit.status =
                "PENDING";

        }


        if (
            normalizedStatus ===
            "VERIFIED"
        ) {

            where.visit.status =
                "VERIFIED";

        }


        if (
            normalizedStatus ===
            "REJECTED"
        ) {

            where.visit.status =
                "REJECTED";

        }


        /*
         * --------------------------------------------------------
         * SEARCH
         * --------------------------------------------------------
         */

        if (
            search &&
            search.trim()
        ) {

            const value =
                search.trim();


            where.visit.user = {

                role:
                    "SUPERVISOR",

                OR: [

                    {
                        name: {
                            contains:
                                value,

                            mode:
                                "insensitive",
                        },
                    },

                    {
                        email: {
                            contains:
                                value,

                            mode:
                                "insensitive",
                        },
                    },

                ],

            };

        }


        /*
         * --------------------------------------------------------
         * PAGINATION
         * --------------------------------------------------------
         */

        const skip =
            (
                pageNumber -
                1
            ) *
            limitNumber;


        const [
            total,
            submissions,
        ] =
            await Promise.all([

                prisma.auditSubmission.count({

                    where,

                }),


                prisma.auditSubmission.findMany({

                    where,

                    skip,

                    take:
                        limitNumber,

                    orderBy: {

                        submittedAt:
                            "desc",

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

                                id:
                                    true,

                                name:
                                    true,

                                description:
                                    true,

                            },

                        },


                        visit: {

                            select: {

                                id:
                                    true,

                                visitAt:
                                    true,

                                status:
                                    true,

                                siteId:
                                    true,


                                user: {

                                    select: {

                                        id:
                                            true,

                                        name:
                                            true,

                                        email:
                                            true,

                                        phone:
                                            true,

                                        role:
                                            true,

                                    },

                                },


                                site: {

                                    select: {

                                        id:
                                            true,

                                        name:
                                            true,

                                        siteCode:
                                            true,

                                        city:
                                            true,

                                        state:
                                            true,

                                        address:
                                            true,

                                    },

                                },

                            },

                        },

                    },

                }),

            ]);


        /*
         * --------------------------------------------------------
         * NORMALIZE RESPONSE
         * --------------------------------------------------------
         */

        const audits =
            submissions.map(
                (
                    submission
                ) => {

                    let auditStatus =
                        "PENDING";


                    if (
                        submission
                            .visit
                            ?.status ===
                        "VERIFIED"
                    ) {

                        auditStatus =
                            "VERIFIED";

                    }


                    if (
                        submission
                            .visit
                            ?.status ===
                        "REJECTED"
                    ) {

                        auditStatus =
                            "REJECTED";

                    }


                    /*
                     * Legacy records.
                     *
                     * Older records may still have
                     * UNVERIFIED in Visit.status.
                     *
                     * Do not convert new REJECTED records
                     * into UNVERIFIED.
                     */

                    if (
                        submission
                            .visit
                            ?.status ===
                        "UNVERIFIED"
                    ) {

                        auditStatus =
                            "UNVERIFIED";

                    }


                    return {

                        id:
                            submission.id,

                        visitId:
                            submission.visitId,

                        templateId:
                            submission.templateId,

                        submittedAt:
                            submission.submittedAt,

                        status:
                            auditStatus,

                        answers:
                            submission.answers,

                        template:
                            submission.template,


                        /*
                         * Compatibility fields for frontend.
                         */

                        user:
                            submission
                                .visit
                                ?.user ||
                            null,

                        supervisor:
                            submission
                                .visit
                                ?.user ||
                            null,

                        site:
                            submission
                                .visit
                                ?.site ||
                            null,

                        visit:
                            submission
                                .visit ||
                            null,


                        auditSubmission: {

                            id:
                                submission.id,

                            submittedAt:
                                submission.submittedAt,

                            templateId:
                                submission.templateId,

                        },

                    };

                }
            );


        return res
            .status(200)
            .json({

                success:
                    true,

                data: {

                    audits,

                },

                pagination: {

                    page:
                        pageNumber,

                    limit:
                        limitNumber,

                    total,

                    totalPages:
                        Math.ceil(
                            total /
                            limitNumber
                        ),

                },

            });


    } catch (error) {

        console.error(
            "Get submitted audits error:",
            error
        );


        return res
            .status(500)
            .json({

                success:
                    false,

                message:
                    "Failed to fetch submitted audits",

                error:
                    error.message,

            });

    }

};



/*
 * ============================================================
 * GET ONE AUDIT
 * ============================================================
 *
 * ADMIN ONLY
 * ============================================================
 */

const getSubmittedAuditById =
    async (
        req,
        res
    ) => {

        try {

            const {
                id,
            } = req.params;


            const submission =
                await prisma
                    .auditSubmission
                    .findUnique({

                        where: {

                            id,

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

                                    id:
                                        true,

                                    name:
                                        true,

                                    description:
                                        true,

                                },

                            },


                            visit: {

                                select: {

                                    id:
                                        true,

                                    visitAt:
                                        true,

                                    status:
                                        true,

                                    siteId:
                                        true,


                                    user: {

                                        select: {

                                            id:
                                                true,

                                            name:
                                                true,

                                            email:
                                                true,

                                            phone:
                                                true,

                                            role:
                                                true,

                                            status:
                                                true,

                                        },

                                    },


                                    site: {

                                        select: {

                                            id:
                                                true,

                                            name:
                                                true,

                                            siteCode:
                                                true,

                                            city:
                                                true,

                                            state:
                                                true,

                                            address:
                                                true,

                                        },

                                    },

                                },

                            },

                        },

                    });


            /*
             * ----------------------------------------------------
             * NOT FOUND
             * ----------------------------------------------------
             */

            if (!submission) {

                return res
                    .status(404)
                    .json({

                        success:
                            false,

                        message:
                            "Audit submission not found",

                    });

            }


            /*
             * ----------------------------------------------------
             * ONLY SUPERVISOR AUDITS
             * ----------------------------------------------------
             */

            if (
                submission
                    .visit
                    ?.user
                    ?.role !==
                "SUPERVISOR"
            ) {

                return res
                    .status(403)
                    .json({

                        success:
                            false,

                        message:
                            "Only Supervisor audits can be reviewed",

                    });

            }


            /*
             * ----------------------------------------------------
             * AUDIT STATUS
             * ----------------------------------------------------
             */

            let auditStatus =
                "PENDING";


            if (
                submission
                    .visit
                    ?.status ===
                "VERIFIED"
            ) {

                auditStatus =
                    "VERIFIED";

            }


            if (
                submission
                    .visit
                    ?.status ===
                "REJECTED"
            ) {

                auditStatus =
                    "REJECTED";

            }


            /*
             * Legacy status.
             */

            if (
                submission
                    .visit
                    ?.status ===
                "UNVERIFIED"
            ) {

                auditStatus =
                    "UNVERIFIED";

            }


            return res
                .status(200)
                .json({

                    success:
                        true,

                    data: {

                        audit: {

                            id:
                                submission.id,

                            visitId:
                                submission.visitId,

                            templateId:
                                submission.templateId,

                            submittedAt:
                                submission.submittedAt,

                            status:
                                auditStatus,

                            answers:
                                submission.answers,

                            template:
                                submission.template,


                            /*
                             * Frontend compatibility.
                             */

                            user:
                                submission
                                    .visit
                                    ?.user ||
                                null,

                            supervisor:
                                submission
                                    .visit
                                    ?.user ||
                                null,

                            site:
                                submission
                                    .visit
                                    ?.site ||
                                null,

                            visit:
                                submission
                                    .visit ||
                                null,


                            auditSubmission: {

                                id:
                                    submission.id,

                                submittedAt:
                                    submission.submittedAt,

                                templateId:
                                    submission.templateId,

                            },

                        },

                    },

                });


        } catch (error) {

            console.error(
                "Get submitted audit error:",
                error
            );


            return res
                .status(500)
                .json({

                    success:
                        false,

                    message:
                        "Failed to fetch audit submission",

                    error:
                        error.message,

                });

        }

    };



/*
 * ============================================================
 * UPDATE AUDIT VERIFICATION STATUS
 * ============================================================
 *
 * ADMIN ONLY
 *
 * VERIFIED:
 *     Visit.status = VERIFIED
 *
 * REJECTED:
 *     Visit.status = REJECTED
 *
 * IMPORTANT:
 * Never convert REJECTED into UNVERIFIED.
 * ============================================================
 */

const updateAuditVerificationStatus =
    async (
        req,
        res
    ) => {

        try {

            /*
             * ----------------------------------------------------
             * PARAMETER
             * ----------------------------------------------------
             */

            const {
                id,
            } = req.params;


            /*
             * ----------------------------------------------------
             * SAFE BODY
             * ----------------------------------------------------
             *
             * Prevent:
             *
             * TypeError:
             * Cannot destructure property 'status'
             * of 'req.body' as it is undefined
             *
             */

            const body =
                req.body || {};


            const status =
                body.status;


            /*
             * ----------------------------------------------------
             * NORMALIZE STATUS
             * ----------------------------------------------------
             */

            const normalizedStatus =
                String(
                    status || ""
                )
                    .trim()
                    .toUpperCase();


            /*
             * ----------------------------------------------------
             * VALID STATUS
             * ----------------------------------------------------
             */

            if (
                ![
                    "VERIFIED",
                    "REJECTED",
                ].includes(
                    normalizedStatus
                )
            ) {

                return res
                    .status(400)
                    .json({

                        success:
                            false,

                        message:
                            "Status must be VERIFIED or REJECTED",

                    });

            }


            /*
             * ----------------------------------------------------
             * FIND AUDIT
             * ----------------------------------------------------
             */

            const submission =
                await prisma
                    .auditSubmission
                    .findUnique({

                        where: {

                            id,

                        },

                        select: {

                            id:
                                true,

                            visitId:
                                true,


                            visit: {

                                select: {

                                    id:
                                        true,

                                    status:
                                        true,


                                    user: {

                                        select: {

                                            id:
                                                true,

                                            role:
                                                true,

                                        },

                                    },

                                },

                            },

                        },

                    });


            /*
             * ----------------------------------------------------
             * AUDIT NOT FOUND
             * ----------------------------------------------------
             */

            if (!submission) {

                return res
                    .status(404)
                    .json({

                        success:
                            false,

                        message:
                            "Audit submission not found",

                    });

            }


            /*
             * ----------------------------------------------------
             * VISIT NOT FOUND
             * ----------------------------------------------------
             */

            if (
                !submission.visit
            ) {

                return res
                    .status(404)
                    .json({

                        success:
                            false,

                        message:
                            "Audit visit not found",

                    });

            }


            /*
             * ----------------------------------------------------
             * ONLY SUPERVISOR AUDITS
             * ----------------------------------------------------
             */

            if (
                submission
                    .visit
                    ?.user
                    ?.role !==
                "SUPERVISOR"
            ) {

                return res
                    .status(403)
                    .json({

                        success:
                            false,

                        message:
                            "Only Supervisor audits can be reviewed",

                    });

            }


            /*
             * ----------------------------------------------------
             * DATABASE STATUS
             * ----------------------------------------------------
             *
             * VERIFIED -> VERIFIED
             * REJECTED -> REJECTED
             */

            const databaseStatus =
                normalizedStatus ===
                    "VERIFIED"
                    ? "VERIFIED"
                    : "REJECTED";


            /*
             * ----------------------------------------------------
             * UPDATE VISIT
             * ----------------------------------------------------
             */

            const updatedVisit =
                await prisma
                    .visit
                    .update({

                        where: {

                            id:
                                submission.visitId,

                        },


                        data: {

                            status:
                                databaseStatus,

                        },


                        select: {

                            id:
                                true,

                            status:
                                true,

                            visitAt:
                                true,

                            siteId:
                                true,


                            user: {

                                select: {

                                    id:
                                        true,

                                    name:
                                        true,

                                    email:
                                        true,

                                    role:
                                        true,

                                },

                            },


                            site: {

                                select: {

                                    id:
                                        true,

                                    name:
                                        true,

                                    siteCode:
                                        true,

                                    city:
                                        true,

                                    state:
                                        true,

                                    address:
                                        true,

                                },

                            },

                        },

                    });


            /*
             * ----------------------------------------------------
             * SUCCESS
             * ----------------------------------------------------
             */

            return res
                .status(200)
                .json({

                    success:
                        true,

                    message:
                        normalizedStatus ===
                            "VERIFIED"

                            ? "Audit verified successfully"

                            : "Audit rejected successfully",


                    data: {

                        audit: {

                            id:
                                submission.id,

                            visitId:
                                updatedVisit.id,

                            status:
                                normalizedStatus,

                            visit:
                                updatedVisit,

                        },

                    },

                });


        } catch (error) {

            console.error(
                "Update audit verification status error:",
                error
            );


            return res
                .status(500)
                .json({

                    success:
                        false,

                    message:
                        "Failed to update audit verification status",

                    error:
                        error.message,

                });

        }

    };



/*
 * ============================================================
 * EXPORTS
 * ============================================================
 */

export {
    getSubmittedAudits,
    getSubmittedAuditById,
    updateAuditVerificationStatus,
};