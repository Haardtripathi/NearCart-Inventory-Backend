import { z } from "zod";

import { paginationQuerySchema, optionalTrimmedString, trimmedString } from "../../utils/validation";

export const unitQuerySchema = paginationQuerySchema;

export const createUnitSchema = z.object({
  code: trimmedString,
  name: trimmedString,
  symbol: optionalTrimmedString,
  allowsDecimal: z.boolean().optional(),
});
