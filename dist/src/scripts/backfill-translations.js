"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const libreTranslate_1 = require("../utils/libreTranslate");
const localization_1 = require("../utils/localization");
const prisma = new client_1.PrismaClient();
const NON_ENGLISH_LANGUAGES = localization_1.SUPPORTED_LANGUAGE_CODES.filter((item) => item !== client_1.LanguageCode.EN);
async function translateName(name, language) {
    return (0, libreTranslate_1.translateLanguageCodeText)(name, "AUTO", language);
}
async function translateDescription(language, description) {
    if (!description?.trim()) {
        return null;
    }
    return (0, libreTranslate_1.translateLanguageCodeText)(description, "AUTO", language);
}
async function backfillIndustries() {
    const industries = await prisma.industry.findMany({
        include: {
            translations: true,
        },
    });
    for (const industry of industries) {
        for (const language of NON_ENGLISH_LANGUAGES) {
            const translatedName = await translateName(industry.name, language);
            const translatedDescription = await translateDescription(language, industry.description);
            await prisma.industryTranslation.upsert({
                where: {
                    industryId_language: {
                        industryId: industry.id,
                        language,
                    },
                },
                create: {
                    industryId: industry.id,
                    language,
                    name: translatedName ?? industry.name,
                    description: translatedDescription ?? industry.description ?? null,
                },
                update: {
                    name: translatedName ?? industry.name,
                    description: translatedDescription ?? industry.description ?? null,
                },
            });
        }
    }
}
async function backfillCategories() {
    const categories = await prisma.category.findMany({
        where: {
            deletedAt: null,
        },
        include: {
            translations: true,
        },
    });
    for (const category of categories) {
        for (const language of NON_ENGLISH_LANGUAGES) {
            const translatedName = await translateName(category.name, language);
            const translatedDescription = await translateDescription(language, category.description);
            await prisma.categoryTranslation.upsert({
                where: {
                    categoryId_language: {
                        categoryId: category.id,
                        language,
                    },
                },
                create: {
                    categoryId: category.id,
                    language,
                    name: translatedName ?? category.name,
                    description: translatedDescription ?? category.description ?? null,
                },
                update: {
                    name: translatedName ?? category.name,
                    description: translatedDescription ?? category.description ?? null,
                },
            });
        }
    }
}
async function backfillBrands() {
    const brands = await prisma.brand.findMany({
        where: {
            deletedAt: null,
        },
        include: {
            translations: true,
        },
    });
    for (const brand of brands) {
        for (const language of NON_ENGLISH_LANGUAGES) {
            const translatedName = await translateName(brand.name, language);
            await prisma.brandTranslation.upsert({
                where: {
                    brandId_language: {
                        brandId: brand.id,
                        language,
                    },
                },
                create: {
                    brandId: brand.id,
                    language,
                    name: translatedName ?? brand.name,
                },
                update: {
                    name: translatedName ?? brand.name,
                },
            });
        }
    }
}
async function backfillUnits() {
    const units = await prisma.unit.findMany({
        include: {
            translations: true,
        },
    });
    for (const unit of units) {
        for (const language of NON_ENGLISH_LANGUAGES) {
            const translatedName = await translateName(unit.name, language);
            await prisma.unitTranslation.upsert({
                where: {
                    unitId_language: {
                        unitId: unit.id,
                        language,
                    },
                },
                create: {
                    unitId: unit.id,
                    language,
                    name: translatedName ?? unit.name,
                },
                update: {
                    name: translatedName ?? unit.name,
                },
            });
        }
    }
}
async function backfillSuppliers() {
    const suppliers = await prisma.supplier.findMany({
        where: {
            deletedAt: null,
        },
        include: {
            translations: true,
        },
    });
    for (const supplier of suppliers) {
        for (const language of NON_ENGLISH_LANGUAGES) {
            const translatedName = await translateName(supplier.name, language);
            await prisma.supplierTranslation.upsert({
                where: {
                    supplierId_language: {
                        supplierId: supplier.id,
                        language,
                    },
                },
                create: {
                    supplierId: supplier.id,
                    language,
                    name: translatedName ?? supplier.name,
                },
                update: {
                    name: translatedName ?? supplier.name,
                },
            });
        }
    }
}
async function backfillProducts() {
    const products = await prisma.product.findMany({
        where: {
            deletedAt: null,
        },
        include: {
            translations: true,
            variants: {
                where: {
                    deletedAt: null,
                },
                include: {
                    translations: true,
                },
            },
        },
    });
    for (const product of products) {
        for (const language of NON_ENGLISH_LANGUAGES) {
            const translatedName = await translateName(product.name, language);
            const translatedDescription = await translateDescription(language, product.description);
            await prisma.productTranslation.upsert({
                where: {
                    productId_language: {
                        productId: product.id,
                        language,
                    },
                },
                create: {
                    productId: product.id,
                    language,
                    name: translatedName ?? product.name,
                    description: translatedDescription ?? product.description ?? null,
                },
                update: {
                    name: translatedName ?? product.name,
                    description: translatedDescription ?? product.description ?? null,
                },
            });
        }
        for (const variant of product.variants) {
            for (const language of NON_ENGLISH_LANGUAGES) {
                const translatedName = await translateName(variant.name, language);
                await prisma.productVariantTranslation.upsert({
                    where: {
                        variantId_language: {
                            variantId: variant.id,
                            language,
                        },
                    },
                    create: {
                        variantId: variant.id,
                        language,
                        name: translatedName ?? variant.name,
                    },
                    update: {
                        name: translatedName ?? variant.name,
                    },
                });
            }
        }
    }
}
async function backfillMasterCatalogItems() {
    const items = await prisma.masterCatalogItem.findMany({
        include: {
            translations: true,
            variantTemplates: {
                include: {
                    translations: true,
                },
            },
        },
    });
    for (const item of items) {
        for (const language of NON_ENGLISH_LANGUAGES) {
            const translatedName = await translateName(item.canonicalName, language);
            const translatedDescription = await translateDescription(language, item.canonicalDescription);
            await prisma.masterCatalogItemTranslation.upsert({
                where: {
                    masterItemId_language: {
                        masterItemId: item.id,
                        language,
                    },
                },
                create: {
                    masterItemId: item.id,
                    language,
                    name: translatedName ?? item.canonicalName,
                    description: translatedDescription ?? item.canonicalDescription ?? null,
                },
                update: {
                    name: translatedName ?? item.canonicalName,
                    description: translatedDescription ?? item.canonicalDescription ?? null,
                },
            });
        }
        for (const template of item.variantTemplates) {
            for (const language of NON_ENGLISH_LANGUAGES) {
                const translatedName = await translateName(template.name, language);
                await prisma.masterCatalogVariantTranslation.upsert({
                    where: {
                        masterVariantTemplateId_language: {
                            masterVariantTemplateId: template.id,
                            language,
                        },
                    },
                    create: {
                        masterVariantTemplateId: template.id,
                        language,
                        name: translatedName ?? template.name,
                    },
                    update: {
                        name: translatedName ?? template.name,
                    },
                });
            }
        }
    }
}
async function main() {
    await backfillIndustries();
    await backfillCategories();
    await backfillBrands();
    await backfillUnits();
    await backfillSuppliers();
    await backfillProducts();
    await backfillMasterCatalogItems();
    console.log("Localized translations backfilled successfully.");
}
main()
    .catch((error) => {
    console.error("Localized translation backfill failed", error);
    process.exitCode = 1;
})
    .finally(async () => {
    await prisma.$disconnect();
});
