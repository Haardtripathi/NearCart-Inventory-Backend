import { type ProductStatus } from "@prisma/client";

import type { DbClient } from "../types/prisma";
import { ApiError } from "./ApiError";

export async function assertOrganizationExists(db: DbClient, organizationId: string) {
  const organization = await db.organization.findFirst({
    where: {
      id: organizationId,
      deletedAt: null,
    },
  });

  if (!organization) {
    throw ApiError.notFound("Organization not found");
  }

  return organization;
}

export async function assertBranchInOrg(db: DbClient, organizationId: string, branchId: string) {
  const branch = await db.branch.findFirst({
    where: {
      id: branchId,
      organizationId,
      deletedAt: null,
    },
  });

  if (!branch) {
    throw ApiError.notFound("Branch not found in this organization");
  }

  return branch;
}

export async function assertCategoryInOrg(db: DbClient, organizationId: string, categoryId: string) {
  const category = await db.category.findFirst({
    where: {
      id: categoryId,
      organizationId,
      deletedAt: null,
    },
  });

  if (!category) {
    throw ApiError.notFound("Category not found in this organization");
  }

  return category;
}

export async function assertBrandInOrg(db: DbClient, organizationId: string, brandId: string) {
  const brand = await db.brand.findFirst({
    where: {
      id: brandId,
      organizationId,
      deletedAt: null,
    },
  });

  if (!brand) {
    throw ApiError.notFound("Brand not found in this organization");
  }

  return brand;
}

export async function assertTaxRateInOrg(db: DbClient, organizationId: string, taxRateId: string) {
  const taxRate = await db.taxRate.findFirst({
    where: {
      id: taxRateId,
      organizationId,
    },
  });

  if (!taxRate) {
    throw ApiError.notFound("Tax rate not found in this organization");
  }

  return taxRate;
}

export async function assertSupplierInOrg(db: DbClient, organizationId: string, supplierId: string) {
  const supplier = await db.supplier.findFirst({
    where: {
      id: supplierId,
      organizationId,
      deletedAt: null,
    },
  });

  if (!supplier) {
    throw ApiError.notFound("Supplier not found in this organization");
  }

  return supplier;
}

export async function assertCustomerInOrg(db: DbClient, organizationId: string, customerId: string) {
  const customer = await db.customer.findFirst({
    where: {
      id: customerId,
      organizationId,
      deletedAt: null,
    },
  });

  if (!customer) {
    throw ApiError.notFound("Customer not found in this organization");
  }

  return customer;
}

export async function assertIndustryExists(db: DbClient, industryId: string) {
  const industry = await db.industry.findFirst({
    where: {
      id: industryId,
      isActive: true,
    },
  });

  if (!industry) {
    throw ApiError.notFound("Industry not found");
  }

  return industry;
}

export async function assertUnitAvailable(db: DbClient, organizationId: string, unitId: string) {
  const unit = await db.unit.findFirst({
    where: {
      id: unitId,
      OR: [
        {
          organizationId,
        },
        {
          organizationId: null,
          isSystem: true,
        },
      ],
    },
  });

  if (!unit) {
    throw ApiError.notFound("Unit not found");
  }

  return unit;
}

export async function assertProductInOrg(
  db: DbClient,
  organizationId: string,
  productId: string,
  status?: ProductStatus,
) {
  const product = await db.product.findFirst({
    where: {
      id: productId,
      organizationId,
      deletedAt: null,
      ...(status ? { status } : {}),
    },
    include: {
      variants: {
        where: {
          deletedAt: null,
        },
      },
    },
  });

  if (!product) {
    throw ApiError.notFound("Product not found in this organization");
  }

  return product;
}

export async function assertVariantInOrg(db: DbClient, organizationId: string, variantId: string) {
  const variant = await db.productVariant.findFirst({
    where: {
      id: variantId,
      organizationId,
      deletedAt: null,
      product: {
        deletedAt: null,
      },
    },
    include: {
      product: true,
    },
  });

  if (!variant) {
    throw ApiError.notFound("Variant not found in this organization");
  }

  return variant;
}
