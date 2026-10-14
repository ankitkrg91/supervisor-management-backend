import jwt from "jsonwebtoken";

const generateAccessToken = (user) => {
    return jwt.sign(
        {
            userId: user.id,
            role: user.role,
        },
        process.env.JWT_SECRET,
        {
            // Token tab tak valid rahega jab tak supervisor explicitly logout na kare
            expiresIn: "365d",
        }
    );
};

const generateRefreshToken = (user) => {
    return jwt.sign(
        {
            userId: user.id,
        },
        process.env.JWT_REFRESH_SECRET,
        {
            expiresIn: "365d",
        }
    );
};

const verifyAccessToken = (token) => {
    return jwt.verify(token, process.env.JWT_SECRET);
};

const verifyRefreshToken = (token) => {
    return jwt.verify(token, process.env.JWT_REFRESH_SECRET);
};

export {
    generateAccessToken,
    generateRefreshToken,
    verifyAccessToken,
    verifyRefreshToken,
};