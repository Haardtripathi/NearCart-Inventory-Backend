import "dotenv/config";

import { prisma } from "../config/prisma";
import { backfillOrganizationIndustryCatalogDefaults } from "../modules/organizations/organizations.service";

async function main() {
  const result = await backfillOrganizationIndustryCatalogDefaults();
  console.log(`Backfilled industry defaults for ${result.processed} organization-industry configurations.`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error("Industry default backfill failed", error);
    await prisma.$disconnect();
    process.exit(1);
  });
