import { Prisma } from "@prisma/client";

export const Decimal = Prisma.Decimal;

export function toDecimal(value: Prisma.Decimal.Value | null | undefined) {
  return new Prisma.Decimal(value ?? 0);
}

export function decimalMax(...values: Array<Prisma.Decimal.Value | null | undefined>) {
  return values.map((value) => toDecimal(value)).reduce((acc, current) => {
    return current.greaterThan(acc) ? current : acc;
  }, new Prisma.Decimal(0));
}
