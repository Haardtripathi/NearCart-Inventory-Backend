"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const libreTranslate_1 = require("../utils/libreTranslate");
const localization_1 = require("../utils/localization");
const prisma = new client_1.PrismaClient();
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
        for (const language of localization_1.SUPPORTED_LANGUAGE_CODES.filter((item) => item !== client_1.LanguageCode.EN)) {
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
        for (const language of localization_1.SUPPORTED_LANGUAGE_CODES.filter((item) => item !== client_1.LanguageCode.EN)) {
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
        for (const language of localization_1.SUPPORTED_LANGUAGE_CODES.filter((item) => item !== client_1.LanguageCode.EN)) {
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
        for (const language of localization_1.SUPPORTED_LANGUAGE_CODES.filter((item) => item !== client_1.LanguageCode.EN)) {
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
        for (const language of localization_1.SUPPORTED_LANGUAGE_CODES.filter((item) => item !== client_1.LanguageCode.EN)) {
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
async function main() {
    await backfillIndustries();
    await backfillCategories();
    await backfillBrands();
    await backfillUnits();
    await backfillSuppliers();
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
