"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.assertOrganizationExists = assertOrganizationExists;
exports.assertBranchInOrg = assertBranchInOrg;
exports.assertCategoryInOrg = assertCategoryInOrg;
exports.assertBrandInOrg = assertBrandInOrg;
exports.assertTaxRateInOrg = assertTaxRateInOrg;
exports.assertSupplierInOrg = assertSupplierInOrg;
exports.assertCustomerInOrg = assertCustomerInOrg;
exports.assertIndustryExists = assertIndustryExists;
exports.assertUnitAvailable = assertUnitAvailable;
exports.assertProductInOrg = assertProductInOrg;
exports.assertVariantInOrg = assertVariantInOrg;
const ApiError_1 = require("./ApiError");
async function assertOrganizationExists(db, organizationId) {
    const organization = await db.organization.findFirst({
        where: {
            id: organizationId,
            deletedAt: null,
        },
    });
    if (!organization) {
        throw ApiError_1.ApiError.notFound("Organization not found");
    }
    return organization;
}
async function assertBranchInOrg(db, organizationId, branchId) {
    const branch = await db.branch.findFirst({
        where: {
            id: branchId,
            organizationId,
            deletedAt: null,
        },
    });
    if (!branch) {
        throw ApiError_1.ApiError.notFound("Branch not found in this organization");
    }
    return branch;
}
async function assertCategoryInOrg(db, organizationId, categoryId) {
    const category = await db.category.findFirst({
        where: {
            id: categoryId,
            organizationId,
            deletedAt: null,
        },
    });
    if (!category) {
        throw ApiError_1.ApiError.notFound("Category not found in this organization");
    }
    return category;
}
async function assertBrandInOrg(db, organizationId, brandId) {
    const brand = await db.brand.findFirst({
        where: {
            id: brandId,
            organizationId,
            deletedAt: null,
        },
    });
    if (!brand) {
        throw ApiError_1.ApiError.notFound("Brand not found in this organization");
    }
    return brand;
}
async function assertTaxRateInOrg(db, organizationId, taxRateId) {
    const taxRate = await db.taxRate.findFirst({
        where: {
            id: taxRateId,
            organizationId,
        },
    });
    if (!taxRate) {
        throw ApiError_1.ApiError.notFound("Tax rate not found in this organization");
    }
    return taxRate;
}
async function assertSupplierInOrg(db, organizationId, supplierId) {
    const supplier = await db.supplier.findFirst({
        where: {
            id: supplierId,
            organizationId,
            deletedAt: null,
        },
    });
    if (!supplier) {
        throw ApiError_1.ApiError.notFound("Supplier not found in this organization");
    }
    return supplier;
}
async function assertCustomerInOrg(db, organizationId, customerId) {
    const customer = await db.customer.findFirst({
        where: {
            id: customerId,
            organizationId,
            deletedAt: null,
        },
    });
    if (!customer) {
        throw ApiError_1.ApiError.notFound("Customer not found in this organization");
    }
    return customer;
}
async function assertIndustryExists(db, industryId) {
    const industry = await db.industry.findFirst({
        where: {
            id: industryId,
            isActive: true,
        },
    });
    if (!industry) {
        throw ApiError_1.ApiError.notFound("Industry not found");
    }
    return industry;
}
async function assertUnitAvailable(db, organizationId, unitId) {
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
        throw ApiError_1.ApiError.notFound("Unit not found");
    }
    return unit;
}
async function assertProductInOrg(db, organizationId, productId, status) {
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
        throw ApiError_1.ApiError.notFound("Product not found in this organization");
    }
    return product;
}
async function assertVariantInOrg(db, organizationId, variantId) {
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
        throw ApiError_1.ApiError.notFound("Variant not found in this organization");
    }
    return variant;
}
