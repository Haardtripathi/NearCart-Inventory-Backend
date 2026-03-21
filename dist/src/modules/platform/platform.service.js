"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listIndustries = listIndustries;
exports.createIndustry = createIndustry;
exports.updateIndustry = updateIndustry;
const prisma_1 = require("../../config/prisma");
const localization_1 = require("../../utils/localization");
const translations_1 = require("../../utils/translations");
const json_1 = require("../../utils/json");
const slug_1 = require("../../utils/slug");
const autoTranslate_1 = require("../../utils/autoTranslate");
function serializeIndustry(industry, localeContext) {
    return (0, localization_1.serializeLocalizedEntity)(industry, localeContext);
}
async function getIndustryWithTranslations(industryId) {
    return prisma_1.prisma.industry.findUniqueOrThrow({
        where: {
            id: industryId,
        },
        include: {
            translations: {
                orderBy: {
                    language: "asc",
                },
            },
        },
    });
}
async function listIndustries(localeContext) {
    const industries = await prisma_1.prisma.industry.findMany({
        orderBy: {
            name: "asc",
        },
        include: {
            translations: {
                orderBy: {
                    language: "asc",
                },
            },
        },
    });
    return industries.map((industry) => serializeIndustry(industry, localeContext));
}
async function createIndustry(input, localeContext) {
    const translations = await (0, autoTranslate_1.enrichWithAutoTranslations)({
        baseName: input.name,
        baseDescription: input.description,
        existingTranslations: input.translations,
    });
    const industry = await prisma_1.prisma.$transaction(async (tx) => {
        const created = await tx.industry.create({
            data: {
                code: (0, slug_1.slugify)(input.code).replace(/-/g, "_"),
                name: input.name.trim(),
                description: input.description?.trim(),
                isActive: input.isActive ?? true,
                defaultFeatures: (0, json_1.toJsonValue)(input.defaultFeatures),
                defaultSettings: (0, json_1.toNullableJsonValue)(input.defaultSettings),
                customFieldDefinitions: (0, json_1.toNullableJsonValue)(input.customFieldDefinitions),
            },
        });
        if (translations.length) {
            await tx.industryTranslation.createMany({
                data: translations.map((translation) => ({
                    industryId: created.id,
                    language: translation.language,
                    name: translation.name.trim(),
                    description: translation.description?.trim() ?? null,
                })),
            });
        }
        return created;
    });
    return serializeIndustry(await getIndustryWithTranslations(industry.id), localeContext);
}
async function updateIndustry(industryId, input, localeContext) {
    const existing = await getIndustryWithTranslations(industryId);
    const translations = await (0, autoTranslate_1.enrichWithAutoTranslations)({
        baseName: input.name ?? existing.name,
        baseDescription: input.description ?? existing.description ?? undefined,
        existingTranslations: input.translations ??
            existing.translations.map((translation) => ({
                language: translation.language,
                name: translation.name,
                description: translation.description ?? undefined,
            })),
    });
    await prisma_1.prisma.$transaction(async (tx) => {
        await tx.industry.update({
            where: { id: industryId },
            data: {
                ...(input.code ? { code: (0, slug_1.slugify)(input.code).replace(/-/g, "_") } : {}),
                ...(input.name ? { name: input.name.trim() } : {}),
                ...(input.description !== undefined ? { description: input.description?.trim() || null } : {}),
                ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
                ...(input.defaultFeatures ? { defaultFeatures: (0, json_1.toJsonValue)(input.defaultFeatures) } : {}),
                ...(input.defaultSettings !== undefined ? { defaultSettings: (0, json_1.toNullableJsonValue)(input.defaultSettings) } : {}),
                ...(input.customFieldDefinitions !== undefined
                    ? { customFieldDefinitions: (0, json_1.toNullableJsonValue)(input.customFieldDefinitions) }
                    : {}),
            },
        });
        await (0, translations_1.upsertTranslations)({
            entries: translations,
            listExisting: () => tx.industryTranslation.findMany({
                where: {
                    industryId,
                },
                select: {
                    id: true,
                    language: true,
                },
            }),
            create: (translation) => tx.industryTranslation.create({
                data: {
                    industryId,
                    language: translation.language,
                    name: translation.name.trim(),
                    description: translation.description?.trim() ?? null,
                },
            }),
            update: (existing, translation) => tx.industryTranslation.update({
                where: {
                    id: existing.id,
                },
                data: {
                    name: translation.name.trim(),
                    description: translation.description?.trim() ?? null,
                },
            }),
        });
    });
    return serializeIndustry(await getIndustryWithTranslations(industryId), localeContext);
}
