"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerDriverController = registerDriverController;
exports.loginDriverController = loginDriverController;
const driver_auth_service_1 = require("./driver-auth.service");
/**
 * Deliberately NOT using sendSuccess()'s `{success,message,data}` envelope here — the driver API
 * contract in PHASE1_REQUIREMENTS.md locks these two responses to flat top-level shapes
 * (`{ driver }` / `{ token, driver }` / `{ error: { code, message } }`) since the driver mobile
 * app is built against that exact contract. Every other driver/platform/org endpoint in this
 * backend uses the normal envelope.
 */
async function registerDriverController(req, res) {
    const driver = await (0, driver_auth_service_1.registerDriver)(req.body);
    return res.status(201).json({ driver });
}
async function loginDriverController(req, res) {
    try {
        const data = await (0, driver_auth_service_1.loginDriver)(req.body);
        return res.status(200).json(data);
    }
    catch (error) {
        if (error instanceof driver_auth_service_1.DriverStatusError) {
            return res.status(403).json({ error: { code: error.code, message: error.message } });
        }
        throw error;
    }
}
