"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
const systemUnits = [
    { code: "pcs", name: "Pieces", symbol: "pcs", allowsDecimal: false },
    { code: "kg", name: "Kilogram", symbol: "kg", allowsDecimal: true },
    { code: "g", name: "Gram", symbol: "g", allowsDecimal: true },
    { code: "l", name: "Liter", symbol: "l", allowsDecimal: true },
    { code: "ml", name: "Milliliter", symbol: "ml", allowsDecimal: true },
    { code: "m", name: "Meter", symbol: "m", allowsDecimal: true },
    { code: "cm", name: "Centimeter", symbol: "cm", allowsDecimal: true },
    { code: "box", name: "Box", symbol: "box", allowsDecimal: false },
    { code: "pack", name: "Pack", symbol: "pack", allowsDecimal: false },
];
const industries = [
    {
        code: "grocery",
        name: "Grocery",
        description: "Retail grocery, fresh produce, packaged foods, and household essentials.",
        defaultFeatures: {
            supportsVariants: true,
            supportsExpiry: true,
            supportsBatchTracking: false,
            supportsSerialTracking: false,
            supportsWeightBasedStock: true,
            supportsTransfers: true,
            supportsPurchaseReceipts: true,
            supportsSalesOrders: true,
            supportsTaxRates: true,
        },
    },
    {
        code: "pharmacy",
        name: "Pharmacy",
        description: "Pharmacy inventory with expiry awareness and batch traceability.",
        defaultFeatures: {
            supportsVariants: true,
            supportsExpiry: true,
            supportsBatchTracking: true,
            supportsSerialTracking: false,
            supportsWeightBasedStock: false,
            supportsTransfers: true,
            supportsPurchaseReceipts: true,
            supportsSalesOrders: true,
            supportsTaxRates: true,
        },
    },
    {
        code: "fashion",
        name: "Fashion",
        description: "Fashion and apparel inventory with multi-variant products.",
        defaultFeatures: {
            supportsVariants: true,
            supportsExpiry: false,
            supportsBatchTracking: false,
            supportsSerialTracking: false,
            supportsWeightBasedStock: false,
            supportsTransfers: true,
            supportsPurchaseReceipts: true,
            supportsSalesOrders: true,
            supportsTaxRates: true,
        },
    },
    {
        code: "electronics",
        name: "Electronics",
        description: "Electronics inventory with serial-number-ready product handling.",
        defaultFeatures: {
            supportsVariants: true,
            supportsExpiry: false,
            supportsBatchTracking: false,
            supportsSerialTracking: true,
            supportsWeightBasedStock: false,
            supportsTransfers: true,
            supportsPurchaseReceipts: true,
            supportsSalesOrders: true,
            supportsTaxRates: true,
        },
    },
    {
        code: "hardware",
        name: "Hardware",
        description: "Hardware and tools inventory with mixed unit-based and measured stock.",
        defaultFeatures: {
            supportsVariants: true,
            supportsExpiry: false,
            supportsBatchTracking: false,
            supportsSerialTracking: false,
            supportsWeightBasedStock: true,
            supportsTransfers: true,
            supportsPurchaseReceipts: true,
            supportsSalesOrders: true,
            supportsTaxRates: true,
        },
    },
    {
        code: "restaurant",
        name: "Restaurant",
        description: "Restaurant and kitchen inventory with batch and expiry awareness.",
        defaultFeatures: {
            supportsVariants: true,
            supportsExpiry: true,
            supportsBatchTracking: true,
            supportsSerialTracking: false,
            supportsWeightBasedStock: true,
            supportsTransfers: true,
            supportsPurchaseReceipts: true,
            supportsSalesOrders: true,
            supportsTaxRates: true,
        },
    },
];
async function seedUnits() {
    for (const unit of systemUnits) {
        const existing = await prisma.unit.findFirst({
            where: {
                organizationId: null,
                code: unit.code,
            },
        });
        if (existing) {
            await prisma.unit.update({
                where: { id: existing.id },
                data: {
                    name: unit.name,
                    symbol: unit.symbol,
                    isSystem: true,
                    allowsDecimal: unit.allowsDecimal,
                },
            });
            continue;
        }
        await prisma.unit.create({
            data: {
                organizationId: null,
                code: unit.code,
                name: unit.name,
                symbol: unit.symbol,
                isSystem: true,
                allowsDecimal: unit.allowsDecimal,
            },
        });
    }
}
async function seedIndustries() {
    for (const industry of industries) {
        await prisma.industry.upsert({
            where: { code: industry.code },
            update: {
                name: industry.name,
                description: industry.description,
                isActive: true,
                defaultFeatures: industry.defaultFeatures,
            },
            create: {
                ...industry,
                isActive: true,
            },
        });
    }
}
async function main() {
    await seedUnits();
    await seedIndustries();
}
main()
    .then(async () => {
    await prisma.$disconnect();
})
    .catch(async (error) => {
    console.error("Seed failed", error);
    await prisma.$disconnect();
    process.exit(1);
});
