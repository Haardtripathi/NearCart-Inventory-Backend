import { z } from "zod";

import { optionalTrimmedString } from "../../utils/validation";

export const analyticsOverviewQuerySchema = z.object({
  branchId: optionalTrimmedString,
});
