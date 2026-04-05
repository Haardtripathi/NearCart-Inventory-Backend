"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const prisma_1 = require("../config/prisma");
const organizations_service_1 = require("../modules/organizations/organizations.service");
async function main() {
    const result = await (0, organizations_service_1.backfillOrganizationIndustryCatalogDefaults)();
    console.log(`Backfilled industry defaults for ${result.processed} organization-industry configurations.`);
}
main()
    .then(async () => {
    await prisma_1.prisma.$disconnect();
})
    .catch(async (error) => {
    console.error("Industry default backfill failed", error);
    await prisma_1.prisma.$disconnect();
    process.exit(1);
});
