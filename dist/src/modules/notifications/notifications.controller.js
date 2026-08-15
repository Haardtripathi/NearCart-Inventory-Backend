"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listNotificationLogsController = listNotificationLogsController;
exports.markNotificationReadController = markNotificationReadController;
exports.markAllNotificationsReadController = markAllNotificationsReadController;
const ApiResponse_1 = require("../../utils/ApiResponse");
const notifications_service_1 = require("./notifications.service");
async function listNotificationLogsController(req, res) {
    const organizationId = req.auth.activeOrganizationId;
    const query = req.query;
    const data = await (0, notifications_service_1.listNotificationLogs)(organizationId, query);
    return (0, ApiResponse_1.sendSuccess)(res, 200, "Notifications fetched successfully", data);
}
async function markNotificationReadController(req, res) {
    const organizationId = req.auth.activeOrganizationId;
    const data = await (0, notifications_service_1.markNotificationRead)(organizationId, req.params.id);
    return (0, ApiResponse_1.sendSuccess)(res, 200, "Notification marked as read", data);
}
async function markAllNotificationsReadController(req, res) {
    const organizationId = req.auth.activeOrganizationId;
    const data = await (0, notifications_service_1.markAllNotificationsRead)(organizationId);
    return (0, ApiResponse_1.sendSuccess)(res, 200, "All notifications marked as read", data);
}
