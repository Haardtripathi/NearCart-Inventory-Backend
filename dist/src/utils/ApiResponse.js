"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ApiResponse = void 0;
exports.sendSuccess = sendSuccess;
class ApiResponse {
    message;
    data;
    success = true;
    constructor(message, data) {
        this.message = message;
        this.data = data;
    }
}
exports.ApiResponse = ApiResponse;
function sendSuccess(res, statusCode, message, data) {
    return res.status(statusCode).json(new ApiResponse(message, data));
}
