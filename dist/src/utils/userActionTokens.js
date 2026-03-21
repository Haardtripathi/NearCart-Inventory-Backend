"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildUserActionLink = buildUserActionLink;
exports.createUserActionToken = createUserActionToken;
exports.getUserActionTokenByRawToken = getUserActionTokenByRawToken;
exports.markUserActionTokenUsed = markUserActionTokenUsed;
const node_crypto_1 = __importDefault(require("node:crypto"));
const env_1 = require("../config/env");
function hashToken(token) {
    return node_crypto_1.default.createHash("sha256").update(token).digest("hex");
}
function createRawToken() {
    return node_crypto_1.default.randomBytes(32).toString("hex");
}
function getAppBaseUrl() {
    return env_1.env.CORS_ORIGIN.replace(/\/+$/, "");
}
function buildUserActionLink(pathname, token) {
    const url = new URL(pathname, `${getAppBaseUrl()}/`);
    url.searchParams.set("token", token);
    return url.toString();
}
async function createUserActionToken(db, input) {
    const rawToken = createRawToken();
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + input.expiresInHours * 60 * 60 * 1000);
    await db.userActionToken.deleteMany({
        where: {
            userId: input.userId,
            purpose: input.purpose,
            organizationId: input.organizationId ?? null,
            usedAt: null,
        },
    });
    const record = await db.userActionToken.create({
        data: {
            userId: input.userId,
            purpose: input.purpose,
            organizationId: input.organizationId ?? null,
            createdByUserId: input.createdByUserId ?? null,
            expiresAt,
            tokenHash,
            metadata: input.metadata,
        },
    });
    return {
        rawToken,
        record,
    };
}
async function getUserActionTokenByRawToken(db, rawToken, purpose) {
    const tokenHash = hashToken(rawToken);
    return db.userActionToken.findFirst({
        where: {
            tokenHash,
            purpose,
            usedAt: null,
            expiresAt: {
                gt: new Date(),
            },
        },
        include: {
            user: true,
            organization: {
                select: {
                    id: true,
                    name: true,
                    slug: true,
                    status: true,
                    defaultLanguage: true,
                },
            },
        },
    });
}
async function markUserActionTokenUsed(db, tokenId) {
    return db.userActionToken.update({
        where: { id: tokenId },
        data: {
            usedAt: new Date(),
        },
    });
}
