"use strict";
/**
 * Branch code generation utility
 *
 * When a branch is created without a code (common for small stores),
 * this generates a unique code in the format: BRANCH_YYYYMMDD_XXXX
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateBranchCode = generateBranchCode;
exports.generateUniqueBranchCode = generateUniqueBranchCode;
function generateBranchCode() {
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, ''); // YYYYMMDD
    const randomStr = Math.random().toString(36).substring(2, 6).toUpperCase(); // 4 random alphanumeric chars
    return `BRANCH_${dateStr}_${randomStr}`;
}
/**
 * Generate a branch code with retry logic
 * Ensures uniqueness by checking existing codes in organization
 */
async function generateUniqueBranchCode(checkExists, maxRetries = 5) {
    for (let i = 0; i < maxRetries; i++) {
        const code = generateBranchCode();
        const exists = await checkExists(code);
        if (!exists) {
            return code;
        }
    }
    // Fallback: use timestamp-based code with milliseconds
    const timestamp = Date.now().toString(36).toUpperCase();
    return `BRANCH_${timestamp}`;
}
