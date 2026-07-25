"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.signDriverAuthToken = signDriverAuthToken;
exports.verifyDriverAuthToken = verifyDriverAuthToken;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const env_1 = require("../config/env");
/**
 * Driver tokens are signed with the same JWT_SECRET as org-user tokens (mirroring utils/jwt.ts)
 * but carry a distinct payload shape (`driverId` + `type: "driver"`) so a Driver JWT can never be
 * mistaken for / reused as a User JWT (or vice versa) by the respective authenticate middlewares
 * — a Driver is not a User (see prisma schema + modules/driver-auth).
 */
function signDriverAuthToken(payload) {
    return jsonwebtoken_1.default.sign({ driverId: payload.driverId, type: "driver" }, env_1.env.JWT_SECRET, {
        expiresIn: env_1.env.JWT_EXPIRES_IN,
    });
}
function verifyDriverAuthToken(token) {
    const payload = jsonwebtoken_1.default.verify(token, env_1.env.JWT_SECRET);
    if (payload.type !== "driver" || !payload.driverId) {
        throw new Error("Not a valid driver token");
    }
    return payload;
}
