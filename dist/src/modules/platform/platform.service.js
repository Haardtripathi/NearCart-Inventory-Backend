"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listIndustries = listIndustries;
exports.createIndustry = createIndustry;
exports.updateIndustry = updateIndustry;
const prisma_1 = require("../../config/prisma");
const json_1 = require("../../utils/json");
const slug_1 = require("../../utils/slug");
async function listIndustries() {
    return prisma_1.prisma.industry.findMany({
        orderBy: {
            name: "asc",
        },
    });
}
async function createIndustry(input) {
    return prisma_1.prisma.industry.create({
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
}
async function updateIndustry(industryId, input) {
    return prisma_1.prisma.industry.update({
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
}
