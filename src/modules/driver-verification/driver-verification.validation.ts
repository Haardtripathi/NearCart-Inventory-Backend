import { z } from "zod";

import { trimmedString } from "../../utils/validation";

// dob/expiry are free-text on purpose (not z.coerce.date()): the /license OCR step returns
// best-effort YYYY-MM-DD strings but a driver may need to type a value the OCR couldn't read at
// all (extracted.dob === null) — over-validating here would block exactly the "user corrects a
// field the model got wrong/missed" case this confirm step exists for.
export const confirmLicenseSchema = z.object({
  name: trimmedString,
  licenseNumber: trimmedString,
  dob: trimmedString,
  expiry: trimmedString,
  photoUrl: z.string().trim().url(),
});
