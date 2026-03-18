"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.importMasterCatalogItem = importMasterCatalogItem;
exports.importManyMasterCatalogItems = importManyMasterCatalogItems;
const client_1 = require("@prisma/client");
const prisma_1 = require("../../config/prisma");
const ApiError_1 = require("../../utils/ApiError");
const guards_1 = require("../../utils/guards");
const decimal_1 = require("../../utils/decimal");
const json_1 = require("../../utils/json");
const slug_1 = require("../../utils/slug");
const audit_service_1 = require("../audit/audit.service");
const products_service_1 = require("../products/products.service");
const importMasterCatalogItemInclude = {
    category: {
        include: {
            translations: {
                orderBy: {
                    language: "asc",
                },
            },
        },
    },
    translations: {
        orderBy: {
            language: "asc",
        },
    },
    variantTemplates: {
        include: {
            translations: {
                orderBy: {
                    language: "asc",
                },
            },
        },
        orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
    },
    aliases: true,
};
function getCategoryCanonicalFields(category) {
    const englishTranslation = category.translations.find((translation) => translation.language === "EN");
    const fallbackTranslation = englishTranslation ?? category.translations[0];
    return {
        name: fallbackTranslation?.name ?? category.code,
        description: fallbackTranslation?.description ?? null,
    };
}
async function resolveImportOrganizationId(activeOrganizationId, bodyOrganizationId) {
    if (bodyOrganizationId && bodyOrganizationId !== activeOrganizationId) {
        throw ApiError_1.ApiError.badRequest("organizationId must match the active organization context");
    }
    return activeOrganizationId;
}
async function getImportMasterCatalogItem(itemId) {
    const item = await prisma_1.prisma.masterCatalogItem.findUnique({
        where: {
            id: itemId,
        },
        include: importMasterCatalogItemInclude,
    });
    if (!item) {
        throw ApiError_1.ApiError.notFound("Master catalog item not found");
    }
    if (!item.isActive) {
        throw ApiError_1.ApiError.badRequest("Master catalog item is inactive");
    }
    return item;
}
async function resolveUnitByCode(db, organizationId, unitCode) {
    if (!unitCode) {
        return null;
    }
    const organizationUnit = await db.unit.findFirst({
        where: {
            organizationId,
            code: unitCode,
        },
    });
    if (organizationUnit) {
        return organizationUnit;
    }
    return db.unit.findFirst({
        where: {
            organizationId: null,
            isSystem: true,
            code: unitCode,
        },
    });
}
async function resolveTaxRateId(db, organizationId, taxCode) {
    if (!taxCode) {
        return null;
    }
    const taxRate = await db.taxRate.findFirst({
        where: {
            organizationId,
            code: taxCode,
            isActive: true,
        },
        select: {
            id: true,
        },
    });
    return taxRate?.id ?? null;
}
async function resolveBrandId(db, organizationId, brandName) {
    if (!brandName) {
        return null;
    }
    const slug = (0, slug_1.slugify)(brandName);
    const existingBrand = await db.brand.findFirst({
        where: {
            organizationId,
            slug,
        },
    });
    if (existingBrand) {
        if (existingBrand.deletedAt) {
            const restored = await db.brand.update({
                where: {
                    id: existingBrand.id,
                },
                data: {
                    name: brandName.trim(),
                    isActive: true,
                    deletedAt: null,
                },
            });
            return restored.id;
        }
        return existingBrand.id;
    }
    const created = await db.brand.create({
        data: {
            organizationId,
            name: brandName.trim(),
            slug,
            isActive: true,
        },
    });
    return created.id;
}
async function syncCategoryTranslationsFromMaster(db, categoryId, masterCategory) {
    for (const translation of masterCategory.translations) {
        const existing = await db.categoryTranslation.findFirst({
            where: {
                categoryId,
                language: translation.language,
            },
            select: {
                id: true,
            },
        });
        if (existing) {
            await db.categoryTranslation.update({
                where: {
                    id: existing.id,
                },
                data: {
                    name: translation.name,
                    description: translation.description,
                },
            });
            continue;
        }
        await db.categoryTranslation.create({
            data: {
                categoryId,
                language: translation.language,
                name: translation.name,
                description: translation.description,
            },
        });
    }
}
async function ensureImportCategory(db, organizationId, input, masterItem) {
    if (input.categoryMode === "USE_EXISTING") {
        await (0, guards_1.assertCategoryInOrg)(db, organizationId, input.existingCategoryId);
        return input.existingCategoryId;
    }
    if (!masterItem.category) {
        return null;
    }
    const canonicalFields = getCategoryCanonicalFields(masterItem.category);
    const existingCategory = await db.category.findFirst({
        where: {
            organizationId,
            slug: masterItem.category.slug,
        },
    });
    if (existingCategory) {
        const restoredCategory = existingCategory.deletedAt
            ? await db.category.update({
                where: {
                    id: existingCategory.id,
                },
                data: {
                    name: canonicalFields.name,
                    description: canonicalFields.description,
                    isActive: true,
                    deletedAt: null,
                    customFields: (0, json_1.toNullableJsonValue)({
                        masterCatalogCategoryId: masterItem.category.id,
                        importedFromMasterCatalog: true,
                    }),
                },
            })
            : existingCategory;
        await syncCategoryTranslationsFromMaster(db, restoredCategory.id, masterItem.category);
        return restoredCategory.id;
    }
    const createdCategory = await db.category.create({
        data: {
            organizationId,
            name: canonicalFields.name,
            slug: masterItem.category.slug,
            description: canonicalFields.description,
            isActive: true,
            sortOrder: masterItem.category.sortOrder,
            customFields: (0, json_1.toNullableJsonValue)({
                masterCatalogCategoryId: masterItem.category.id,
                importedFromMasterCatalog: true,
            }),
        },
    });
    await syncCategoryTranslationsFromMaster(db, createdCategory.id, masterItem.category);
    return createdCategory.id;
}
async function generateUniqueProductSlug(db, organizationId, baseName) {
    const baseSlug = (0, slug_1.slugify)(baseName);
    let candidate = baseSlug;
    let index = 2;
    while (true) {
        const existing = await db.product.findFirst({
            where: {
                organizationId,
                slug: candidate,
            },
            select: {
                id: true,
            },
        });
        if (!existing) {
            return candidate;
        }
        candidate = `${baseSlug}-${index}`;
        index += 1;
    }
}
async function generateUniqueVariantSku(db, organizationId, baseSku) {
    const normalizedBaseSku = baseSku.trim().toUpperCase();
    let candidate = normalizedBaseSku;
    let index = 2;
    while (true) {
        const existing = await db.productVariant.findFirst({
            where: {
                organizationId,
                sku: candidate,
            },
            select: {
                id: true,
            },
        });
        if (!existing) {
            return candidate;
        }
        candidate = `${normalizedBaseSku}-${index}`;
        index += 1;
    }
}
async function resolveAvailableBarcode(db, organizationId, barcode) {
    if (!barcode) {
        return null;
    }
    const existing = await db.productVariant.findFirst({
        where: {
            organizationId,
            barcode,
        },
        select: {
            id: true,
        },
    });
    return existing ? null : barcode;
}
function getVariantPriceOverride(pricingOverrides, masterVariantTemplateId) {
    return pricingOverrides?.variantPrices?.find((price) => masterVariantTemplateId ? price.masterVariantTemplateId === masterVariantTemplateId : !price.masterVariantTemplateId);
}
async function validateIndustryCompatibility(organizationId, masterItem, input) {
    const compatibleIndustry = await prisma_1.prisma.organizationIndustryConfig.findFirst({
        where: {
            organizationId,
            industryId: masterItem.industryId,
        },
        select: {
            id: true,
        },
    });
    const strictIndustryMatch = input.strictIndustryMatch ?? true;
    if (compatibleIndustry) {
        return null;
    }
    if (input.forceImport) {
        return "Industry mismatch allowed by forceImport";
    }
    if (strictIndustryMatch) {
        throw ApiError_1.ApiError.badRequest("Master catalog item industry is not enabled for this organization");
    }
    return "Industry mismatch allowed because strictIndustryMatch is disabled";
}
async function createProductTranslations(db, productId, masterItem) {
    for (const translation of masterItem.translations) {
        await db.productTranslation.create({
            data: {
                productId,
                language: translation.language,
                name: translation.name,
                description: translation.description,
            },
        });
    }
}
async function createVariantTranslations(db, variantId, translations) {
    for (const translation of translations) {
        await db.productVariantTranslation.create({
            data: {
                variantId,
                language: translation.language,
                name: translation.name,
            },
        });
    }
}
function normalizeTemplateDefaultFlags(templates) {
    const preferredDefaultId = templates.find((template) => template.isDefault)?.id ?? templates[0]?.id ?? null;
    return templates.map((template) => ({
        ...template,
        isDefault: template.id === preferredDefaultId,
    }));
}
async function createImportedVariants(db, organizationId, productId, productName, masterItem, primaryUnitId, pricingOverrides) {
    if (masterItem.variantTemplates.length === 0) {
        const priceOverride = getVariantPriceOverride(pricingOverrides);
        const sku = await generateUniqueVariantSku(db, organizationId, masterItem.code);
        const variant = await db.productVariant.create({
            data: {
                organizationId,
                productId,
                name: productName,
                sku,
                barcode: null,
                attributes: undefined,
                costPrice: priceOverride?.costPrice !== undefined ? (0, decimal_1.toDecimal)(priceOverride.costPrice) : new client_1.Prisma.Decimal(0),
                sellingPrice: priceOverride?.sellingPrice !== undefined ? (0, decimal_1.toDecimal)(priceOverride.sellingPrice) : new client_1.Prisma.Decimal(0),
                mrp: priceOverride?.mrp !== undefined ? (0, decimal_1.toDecimal)(priceOverride.mrp) : null,
                reorderLevel: new client_1.Prisma.Decimal(0),
                minStockLevel: new client_1.Prisma.Decimal(0),
                maxStockLevel: null,
                weight: null,
                unitId: primaryUnitId,
                isDefault: true,
                isActive: true,
                imageUrl: masterItem.defaultImageUrl,
                customFields: undefined,
                metadata: undefined,
            },
        });
        await createVariantTranslations(db, variant.id, masterItem.translations.map((translation) => ({
            language: translation.language,
            name: translation.name,
        })));
        return;
    }
    const templates = normalizeTemplateDefaultFlags(masterItem.variantTemplates);
    for (const template of templates) {
        const priceOverride = getVariantPriceOverride(pricingOverrides, template.id);
        const templateUnit = await resolveUnitByCode(db, organizationId, template.unitCode ?? masterItem.defaultUnitCode);
        const skuBase = [masterItem.code, template.skuSuffix ?? template.code]
            .filter(Boolean)
            .map((part) => String(part).trim().toUpperCase())
            .join("-");
        const sku = await generateUniqueVariantSku(db, organizationId, skuBase);
        const barcode = await resolveAvailableBarcode(db, organizationId, template.barcode);
        const variant = await db.productVariant.create({
            data: {
                organizationId,
                productId,
                name: template.name,
                sku,
                barcode,
                attributes: (0, json_1.toNullableJsonValue)(template.attributes),
                costPrice: priceOverride?.costPrice !== undefined
                    ? (0, decimal_1.toDecimal)(priceOverride.costPrice)
                    : template.defaultCostPrice ?? new client_1.Prisma.Decimal(0),
                sellingPrice: priceOverride?.sellingPrice !== undefined
                    ? (0, decimal_1.toDecimal)(priceOverride.sellingPrice)
                    : template.defaultSellingPrice ?? new client_1.Prisma.Decimal(0),
                mrp: priceOverride?.mrp !== undefined ? (0, decimal_1.toDecimal)(priceOverride.mrp) : template.defaultMrp,
                reorderLevel: template.reorderLevel,
                minStockLevel: template.minStockLevel,
                maxStockLevel: template.maxStockLevel,
                weight: template.weight,
                unitId: templateUnit?.id ?? primaryUnitId,
                isDefault: template.isDefault,
                isActive: template.isActive,
                imageUrl: masterItem.defaultImageUrl,
                customFields: undefined,
                metadata: (0, json_1.toNullableJsonValue)({
                    masterCatalogVariantTemplateId: template.id,
                }),
            },
        });
        await createVariantTranslations(db, variant.id, template.translations.map((translation) => ({
            language: translation.language,
            name: translation.name,
        })));
    }
}
async function importMasterCatalogItem(masterItemId, actorUserId, activeOrganizationId, input, localeContext) {
    const organizationId = await resolveImportOrganizationId(activeOrganizationId, input.organizationId);
    await (0, guards_1.assertOrganizationExists)(prisma_1.prisma, organizationId);
    if (input.existingCategoryId) {
        await (0, guards_1.assertCategoryInOrg)(prisma_1.prisma, organizationId, input.existingCategoryId);
    }
    const masterItem = await getImportMasterCatalogItem(masterItemId);
    const industryWarning = await validateIndustryCompatibility(organizationId, masterItem, input);
    const existingProduct = await prisma_1.prisma.product.findFirst({
        where: {
            organizationId,
            masterCatalogItemId: masterItemId,
            deletedAt: null,
        },
        select: {
            id: true,
        },
    });
    if (existingProduct && !input.allowDuplicate) {
        await (0, audit_service_1.createAuditLog)(prisma_1.prisma, {
            organizationId,
            actorUserId,
            action: client_1.AuditAction.CREATE,
            entityType: "MasterCatalogItemImport",
            entityId: masterItemId,
            meta: {
                returnedExistingProductId: existingProduct.id,
                industryWarning,
            },
        });
        return {
            alreadyExisted: true,
            warning: industryWarning,
            product: await (0, products_service_1.getProductById)(organizationId, existingProduct.id, localeContext),
        };
    }
    const product = await prisma_1.prisma.$transaction(async (tx) => {
        const categoryId = await ensureImportCategory(tx, organizationId, input, masterItem);
        const primaryUnit = await resolveUnitByCode(tx, organizationId, masterItem.defaultUnitCode);
        const brandId = await resolveBrandId(tx, organizationId, masterItem.defaultBrandName);
        const taxRateId = await resolveTaxRateId(tx, organizationId, masterItem.defaultTaxCode);
        const productName = input.namingOverrides?.canonicalName?.trim() || masterItem.canonicalName;
        const slug = await generateUniqueProductSlug(tx, organizationId, productName);
        const productType = masterItem.variantTemplates.length > 0 || masterItem.hasVariants ? client_1.ProductType.VARIABLE : masterItem.productType;
        const createdProduct = await tx.product.create({
            data: {
                organizationId,
                categoryId,
                brandId,
                taxRateId,
                industryId: masterItem.industryId,
                masterCatalogItemId: masterItem.id,
                name: productName,
                slug,
                description: masterItem.canonicalDescription,
                productType,
                sourceType: client_1.ProductSourceType.MASTER_TEMPLATE,
                status: client_1.ProductStatus.ACTIVE,
                hasVariants: masterItem.variantTemplates.length > 0 || masterItem.hasVariants,
                trackInventory: masterItem.trackInventory,
                allowBackorder: masterItem.allowBackorder,
                allowNegativeStock: masterItem.allowNegativeStock,
                trackMethod: masterItem.defaultTrackMethod,
                primaryUnitId: primaryUnit?.id ?? null,
                imageUrl: masterItem.defaultImageUrl,
                tags: (0, json_1.toNullableJsonValue)(masterItem.tags),
                customFields: (0, json_1.toNullableJsonValue)(masterItem.customFieldsTemplate),
                metadata: (0, json_1.toNullableJsonValue)({
                    importedFromMasterCatalog: true,
                    masterCatalogItemId: masterItem.id,
                    industryWarning,
                }),
                createdById: actorUserId,
                updatedById: actorUserId,
            },
        });
        await createProductTranslations(tx, createdProduct.id, masterItem);
        await createImportedVariants(tx, organizationId, createdProduct.id, productName, masterItem, primaryUnit?.id ?? null, input.pricingOverrides);
        return createdProduct;
    });
    await (0, audit_service_1.createAuditLog)(prisma_1.prisma, {
        organizationId,
        actorUserId,
        action: client_1.AuditAction.CREATE,
        entityType: "MasterCatalogItemImport",
        entityId: masterItemId,
        meta: {
            importedProductId: product.id,
            categoryMode: input.categoryMode,
            forceImport: input.forceImport ?? false,
            industryWarning,
        },
    });
    return {
        alreadyExisted: false,
        warning: industryWarning,
        product: await (0, products_service_1.getProductById)(organizationId, product.id, localeContext),
    };
}
async function importManyMasterCatalogItems(actorUserId, activeOrganizationId, input, localeContext) {
    const results = [];
    for (const item of input.items) {
        const result = await importMasterCatalogItem(item.masterItemId, actorUserId, activeOrganizationId, {
            organizationId: input.organizationId,
            categoryMode: input.categoryMode,
            existingCategoryId: input.existingCategoryId,
            allowDuplicate: input.allowDuplicate,
            strictIndustryMatch: input.strictIndustryMatch,
            forceImport: input.forceImport,
            pricingOverrides: item.pricingOverrides,
            namingOverrides: item.namingOverrides,
        }, localeContext);
        results.push({
            masterItemId: item.masterItemId,
            ...result,
        });
    }
    return {
        items: results,
    };
}
