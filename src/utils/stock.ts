import type { Prisma } from "@prisma/client";

import { decimalMax, toDecimal } from "./decimal";

export function getAvailableStock(
  onHand: Prisma.Decimal.Value | null | undefined,
  reserved: Prisma.Decimal.Value | null | undefined,
) {
  return toDecimal(onHand).minus(toDecimal(reserved));
}

export function isLowStock(
  onHand: Prisma.Decimal.Value | null | undefined,
  reorderLevel: Prisma.Decimal.Value | null | undefined,
  minStockLevel: Prisma.Decimal.Value | null | undefined,
) {
  const threshold = decimalMax(reorderLevel, minStockLevel);
  return toDecimal(onHand).lessThanOrEqualTo(threshold);
}
