import { DriverStatus } from "@prisma/client";
import { z } from "zod";

export const listAssignableDriversQuerySchema = z.object({
  status: z.nativeEnum(DriverStatus).optional(),
});
