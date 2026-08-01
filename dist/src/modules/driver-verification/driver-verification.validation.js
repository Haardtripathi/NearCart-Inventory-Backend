"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.confirmLicenseSchema = void 0;
const zod_1 = require("zod");
const validation_1 = require("../../utils/validation");
// dob/expiry are free-text on purpose (not z.coerce.date()): the /license OCR step returns
// best-effort YYYY-MM-DD strings but a driver may need to type a value the OCR couldn't read at
// all (extracted.dob === null) — over-validating here would block exactly the "user corrects a
// field the model got wrong/missed" case this confirm step exists for.
exports.confirmLicenseSchema = zod_1.z.object({
    name: validation_1.trimmedString,
    licenseNumber: validation_1.trimmedString,
    dob: validation_1.trimmedString,
    expiry: validation_1.trimmedString,
    photoUrl: zod_1.z.string().trim().url(),
});
