"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAuditLogs = getAuditLogs;
const audit_service_1 = require("./audit.service");
const ApiResponse_1 = require("../../utils/ApiResponse");
async function getAuditLogs(req, res) {
    const organizationId = req.auth.activeOrganizationId;
    const query = req.query;
    const data = await (0, audit_service_1.listAuditLogs)(organizationId, query);
    return (0, ApiResponse_1.sendSuccess)(res, 200, "Audit logs fetched successfully", data);
}
