import { LanguageCode, PrismaClient } from "@prisma/client";

import { translateLanguageCodeText } from "../utils/libreTranslate";
import { SUPPORTED_LANGUAGE_CODES } from "../utils/localization";

const prisma = new PrismaClient();

async function translateName(name: string, language: LanguageCode) {
  return translateLanguageCodeText(name, "AUTO", language);
}

async function translateDescription(language: LanguageCode, description?: string | null) {
  if (!description?.trim()) {
    return null;
  }

  return translateLanguageCodeText(description, "AUTO", language);
}

async function backfillIndustries() {
  const industries = await prisma.industry.findMany({
    include: {
      translations: true,
    },
  });

  for (const industry of industries) {
    for (const language of SUPPORTED_LANGUAGE_CODES.filter((item) => item !== LanguageCode.EN)) {
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
    for (const language of SUPPORTED_LANGUAGE_CODES.filter((item) => item !== LanguageCode.EN)) {
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
    for (const language of SUPPORTED_LANGUAGE_CODES.filter((item) => item !== LanguageCode.EN)) {
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
    for (const language of SUPPORTED_LANGUAGE_CODES.filter((item) => item !== LanguageCode.EN)) {
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
    for (const language of SUPPORTED_LANGUAGE_CODES.filter((item) => item !== LanguageCode.EN)) {
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
