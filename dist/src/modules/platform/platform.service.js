"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listIndustries = listIndustries;
exports.createIndustry = createIndustry;
exports.updateIndustry = updateIndustry;
exports.listPlatformDrivers = listPlatformDrivers;
exports.verifyPlatformDriver = verifyPlatformDriver;
exports.listPlatformOrganizations = listPlatformOrganizations;
exports.suspendPlatformDriver = suspendPlatformDriver;
const client_1 = require("@prisma/client");
const prisma_1 = require("../../config/prisma");
const localization_1 = require("../../utils/localization");
const translations_1 = require("../../utils/translations");
const json_1 = require("../../utils/json");
const slug_1 = require("../../utils/slug");
const autoTranslate_1 = require("../../utils/autoTranslate");
const ApiError_1 = require("../../utils/ApiError");
const pagination_1 = require("../../utils/pagination");
const audit_service_1 = require("../audit/audit.service");
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
        existingTranslations: (0, translations_1.mergeTranslationsForUpdate)(existing.translations.map((translation) => ({
            language: translation.language,
            name: translation.name,
            description: translation.description ?? undefined,
        })), input.translations),
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
function serializeDriver(driver) {
    return {
        id: driver.id,
        fullName: driver.fullName,
        phone: driver.phone,
        email: driver.email,
        vehicleType: driver.vehicleType,
        vehicleNumber: driver.vehicleNumber,
        status: driver.status,
        createdAt: driver.createdAt,
        updatedAt: driver.updatedAt,
    };
}
async function listPlatformDrivers(query) {
    const { page, limit, skip } = (0, pagination_1.getPagination)(query.page, query.limit);
    const where = query.status ? { status: query.status } : {};
    const [items, totalItems] = await prisma_1.prisma.$transaction([
        prisma_1.prisma.driver.findMany({
            where,
            orderBy: { createdAt: "desc" },
            skip,
            take: limit,
        }),
        prisma_1.prisma.driver.count({ where }),
    ]);
    return {
        items: items.map(serializeDriver),
        pagination: (0, pagination_1.buildPagination)(page, limit, totalItems),
    };
}
async function getDriverOrThrow(driverId) {
    const driver = await prisma_1.prisma.driver.findUnique({ where: { id: driverId } });
    if (!driver) {
        throw ApiError_1.ApiError.notFound("Driver not found");
    }
    return driver;
}
async function verifyPlatformDriver(actorUserId, driverId) {
    const driver = await getDriverOrThrow(driverId);
    const updated = await prisma_1.prisma.driver.update({
        where: { id: driverId },
        data: { status: client_1.DriverStatus.VERIFIED },
    });
    await (0, audit_service_1.createAuditLog)(prisma_1.prisma, {
        actorUserId,
        action: client_1.AuditAction.DRIVER_VERIFY,
        entityType: "Driver",
        entityId: driver.id,
        before: { status: driver.status },
        after: { status: updated.status },
    });
    return serializeDriver(updated);
}
// Contract fixed by the frontend/mobile clients ahead of this endpoint existing — see
// NearCart-Inventory/frontend's `src/types/platform.ts` (`PlatformOrganizationOverview`) and
// `src/features/platform/platform.api.ts`. One row per non-deleted organization with cheap
// activity signals a SUPER_ADMIN needs to pick/triage an org, not full org detail.
async function listPlatformOrganizations() {
    const organizations = await prisma_1.prisma.organization.findMany({
        where: { deletedAt: null },
        orderBy: { createdAt: "desc" },
        select: {
            id: true,
            name: true,
            slug: true,
            status: true,
            createdAt: true,
            _count: {
                select: {
                    branches: true,
                    memberships: true,
                    salesOrders: true,
                },
            },
            salesOrders: {
                orderBy: { createdAt: "desc" },
                take: 1,
                select: { createdAt: true },
            },
        },
    });
    return organizations.map((organization) => ({
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
        status: organization.status,
        createdAt: organization.createdAt.toISOString(),
        branchCount: organization._count.branches,
        memberCount: organization._count.memberships,
        salesOrderCount: organization._count.salesOrders,
        lastSalesOrderAt: organization.salesOrders[0]?.createdAt.toISOString() ?? null,
    }));
}
async function suspendPlatformDriver(actorUserId, driverId) {
    const driver = await getDriverOrThrow(driverId);
    const updated = await prisma_1.prisma.driver.update({
        where: { id: driverId },
        data: { status: client_1.DriverStatus.SUSPENDED },
    });
    await (0, audit_service_1.createAuditLog)(prisma_1.prisma, {
        actorUserId,
        action: client_1.AuditAction.DRIVER_SUSPEND,
        entityType: "Driver",
        entityId: driver.id,
        before: { status: driver.status },
        after: { status: updated.status },
    });
    return serializeDriver(updated);
}
