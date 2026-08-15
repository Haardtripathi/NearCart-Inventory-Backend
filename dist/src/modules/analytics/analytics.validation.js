"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.analyticsOverviewQuerySchema = void 0;
const zod_1 = require("zod");
const validation_1 = require("../../utils/validation");
exports.analyticsOverviewQuerySchema = zod_1.z.object({
    branchId: validation_1.optionalTrimmedString,
});
