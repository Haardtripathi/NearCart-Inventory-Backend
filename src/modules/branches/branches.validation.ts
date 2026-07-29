import { BranchType } from "@prisma/client";
import { z } from "zod";

import {
  optionalEmailSchema,
  optionalLatitudeSchema,
  optionalLongitudeSchema,
  paginationQuerySchema,
  optionalTrimmedString,
  strictBooleanQueryParam,
  trimmedString,
} from "../../utils/validation";

export const branchQuerySchema = paginationQuerySchema.extend({
  // strictBooleanQueryParam (not z.coerce.boolean()): the latter treats the query string
  // "false" as truthy, silently inverting an explicit ?isActive=false filter.
  isActive: strictBooleanQueryParam,
});

export const createBranchSchema = z.object({
  code: optionalTrimmedString, // Auto-generated if not provided
  name: trimmedString,
  type: z.nativeEnum(BranchType),
  phone: optionalTrimmedString,
  email: optionalEmailSchema,
  addressLine1: optionalTrimmedString,
  addressLine2: optionalTrimmedString,
  city: optionalTrimmedString,
  state: optionalTrimmedString,
  country: optionalTrimmedString,
  postalCode: optionalTrimmedString,
  // Pickup-point coordinates for nearest-free-driver auto-assignment (see
  // `findNearestFreeDriver` in sales-orders.service.ts) — optional since not every shop owner has
  // coordinates handy at creation time; can be backfilled later via PATCH.
  latitude: optionalLatitudeSchema,
  longitude: optionalLongitudeSchema,
  isActive: z.boolean().optional(),
});

export const updateBranchSchema = createBranchSchema.partial();
