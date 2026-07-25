"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildUserActionLink = buildUserActionLink;
exports.createUserActionToken = createUserActionToken;
exports.getUserActionTokenByRawToken = getUserActionTokenByRawToken;
exports.markUserActionTokenUsed = markUserActionTokenUsed;
exports.sendUserActionEmail = sendUserActionEmail;
const node_crypto_1 = __importDefault(require("node:crypto"));
const client_1 = require("@prisma/client");
const env_1 = require("../config/env");
const mailer_1 = require("./mailer");
function hashToken(token) {
    return node_crypto_1.default.createHash("sha256").update(token).digest("hex");
}
function createRawToken() {
    return node_crypto_1.default.randomBytes(32).toString("hex");
}
function getAppBaseUrl() {
    const candidateOrigins = env_1.env.CORS_ORIGIN.split(",")
        .map((origin) => origin.trim())
        .filter(Boolean);
    for (const origin of candidateOrigins) {
        try {
            return new URL(origin).toString().replace(/\/+$/, "");
        }
        catch {
            continue;
        }
    }
    throw new Error("CORS_ORIGIN must contain at least one valid absolute URL");
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
const ACTION_LINK_COPY = {
    [client_1.UserActionTokenPurpose.ACCOUNT_SETUP]: {
        pathname: "/account-setup",
        heading: "Set up your NearCart Inventory account",
        intro: "You've been invited to NearCart Inventory. Click below to set your password and activate your account.",
        actionLabel: "Set up account",
    },
    [client_1.UserActionTokenPurpose.PASSWORD_RESET]: {
        pathname: "/reset-password",
        heading: "Reset your NearCart Inventory password",
        intro: "We received a request to reset your password. Click below to choose a new one.",
        actionLabel: "Reset password",
    },
};
/**
 * Emails the given user their account-setup/password-reset link. The raw token/url is
 * intentionally NOT returned to callers — it must only ever reach the intended user's inbox.
 * See CLAUDE.md / PHASE1_REQUIREMENTS.md: returning this in an API response is the security hole
 * this function replaces.
 */
async function sendUserActionEmail(input) {
    const copy = ACTION_LINK_COPY[input.purpose];
    const url = buildUserActionLink(copy.pathname, input.rawToken);
    const { html, text } = (0, mailer_1.renderActionLinkEmail)({
        heading: copy.heading,
        intro: copy.intro,
        actionLabel: copy.actionLabel,
        url,
        expiresAt: input.expiresAt,
    });
    await (0, mailer_1.sendMail)({
        to: input.to,
        subject: copy.heading,
        html,
        text,
    });
}
