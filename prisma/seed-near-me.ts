/**
 * Ad-hoc "near me" test-data seed — creates 3 dummy shops + catalog + 2 verified drivers close
 * to the founder's own saved delivery address (23.1117, 72.6028 — Chandkheda, Ahmedabad), for
 * live end-to-end testing on a real device. Modeled directly on seed-multi-city.ts's proven
 * idempotent pattern (guarded by findFirst/findUnique on a natural key, safe to re-run), but this
 * one ALSO creates a real, login-able shop-owner User + ORG_ADMIN OrganizationMembership per shop
 * (seed-multi-city.ts doesn't — it's catalog-only), and marks each Branch's shop-photo
 * verification as VERIFIED so RootNavigator's AppGate won't force a fresh login straight into
 * ShopSetupScreen's onboarding gate.
 *
 * Run with:  node --import tsx prisma/seed-near-me.ts
 *
 * Writes prisma/seed-near-me.manifest.json — NearCart/backend's companion script
 * (prisma/seed-near-me-shops.ts) reads it to create the matching public Shop rows there.
 */
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import bcrypt from "bcrypt";
import {
  BranchType,
  DriverStatus,
  ProductStatus,
  ProductType,
  ShopVerificationStatus,
  TrackMethod,
  UserRole,
} from "@prisma/client";

import { prisma } from "../src/config/prisma";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// The "pcs" system unit's actual id in THIS live database, looked up fresh rather than copying
// seed-multi-city.ts's hardcoded value — that one is already stale for this DB per its own
// comment (cuids regenerate on every from-scratch reseed), and indeed didn't exist here either.
const PCS_UNIT_ID = "cmstvkxgw0000byhsbuhhyhv7";

const OWNER_PASSWORD = "NearMe@Seed123";
const DUMMY_SHOP_PHOTO =
  "https://images.unsplash.com/photo-1604719312566-8912e9227c6a?w=800&auto=format&fit=crop&q=80";

interface ProductSeed {
  name: string;
  categorySlug: string;
  brandSlug: string;
  variantName: string;
  sku: string;
  costPrice: number;
  sellingPrice: number;
  mrp: number;
  qty: number;
}

interface ShopSeed {
  shopName: string;
  shopSlug: string;
  shopCategory: string;
  logoImageUrl: string;
  latitude: number;
  longitude: number;
  addressArea: string;
  categories: { name: string; slug: string }[];
  brands: { name: string; slug: string }[];
  products: ProductSeed[];
}

const GROCERY_PHOTO =
  "https://images.unsplash.com/photo-1759197894183-ffffa3c7fcd4?w=800&auto=format&fit=crop&q=80";
const PHARMACY_PHOTO =
  "https://images.unsplash.com/photo-1696861286643-341a8d7a79e9?w=800&auto=format&fit=crop&q=80";
const BAKERY_PHOTO =
  "https://images.unsplash.com/photo-1774669081553-4ef841520c05?w=800&auto=format&fit=crop&q=80";

// All three sit within ~1.2km of (23.1117, 72.6028) — well inside any sane serviceRadiusKm.
const SHOPS: ShopSeed[] = [
  {
    shopName: "Chandkheda Daily Mart",
    shopSlug: "chandkheda-daily-mart",
    shopCategory: "Grocery",
    logoImageUrl: GROCERY_PHOTO,
    latitude: 23.114,
    longitude: 72.601,
    addressArea: "Nigam Nagar, Chandkheda",
    categories: [
      { name: "Dairy & Bakery", slug: "cdm-dairy-bakery" },
      { name: "Staples & Grains", slug: "cdm-staples-grains" },
    ],
    brands: [
      { name: "Amul", slug: "cdm-amul" },
      { name: "Aashirvaad", slug: "cdm-aashirvaad" },
    ],
    products: [
      {
        name: "Amul Toned Milk 500ml",
        categorySlug: "cdm-dairy-bakery",
        brandSlug: "cdm-amul",
        variantName: "500 ml Pouch",
        sku: "CDM-MILK-500",
        costPrice: 24,
        sellingPrice: 28,
        mrp: 30,
        qty: 100,
      },
      {
        name: "Amul Butter 100g",
        categorySlug: "cdm-dairy-bakery",
        brandSlug: "cdm-amul",
        variantName: "100 g Pack",
        sku: "CDM-BUTTER-100",
        costPrice: 48,
        sellingPrice: 56,
        mrp: 58,
        qty: 60,
      },
      {
        name: "Aashirvaad Atta 5kg",
        categorySlug: "cdm-staples-grains",
        brandSlug: "cdm-aashirvaad",
        variantName: "5 kg Bag",
        sku: "CDM-ATTA-5KG",
        costPrice: 210,
        sellingPrice: 245,
        mrp: 260,
        qty: 40,
      },
      {
        name: "Toor Dal 1kg",
        categorySlug: "cdm-staples-grains",
        brandSlug: "cdm-aashirvaad",
        variantName: "1 kg Pack",
        sku: "CDM-TOORDAL-1KG",
        costPrice: 110,
        sellingPrice: 135,
        mrp: 145,
        qty: 50,
      },
      {
        name: "Basmati Rice 1kg",
        categorySlug: "cdm-staples-grains",
        brandSlug: "cdm-aashirvaad",
        variantName: "1 kg Pack",
        sku: "CDM-RICE-1KG",
        costPrice: 90,
        sellingPrice: 115,
        mrp: 125,
        qty: 50,
      },
    ],
  },
  {
    shopName: "Nigam Nagar Family Pharmacy",
    shopSlug: "nigam-nagar-family-pharmacy",
    shopCategory: "Pharmacy",
    logoImageUrl: PHARMACY_PHOTO,
    latitude: 23.1095,
    longitude: 72.6055,
    addressArea: "Nigam Nagar, Chandkheda",
    categories: [
      { name: "Wellness", slug: "nnp-wellness" },
      { name: "Personal Care", slug: "nnp-personal-care" },
    ],
    brands: [
      { name: "Patanjali", slug: "nnp-patanjali" },
      { name: "Dettol", slug: "nnp-dettol" },
    ],
    products: [
      {
        name: "Multivitamin Tablets (30 tabs)",
        categorySlug: "nnp-wellness",
        brandSlug: "nnp-patanjali",
        variantName: "30 Tablets",
        sku: "NNP-MULTIVIT-30",
        costPrice: 140,
        sellingPrice: 190,
        mrp: 210,
        qty: 40,
      },
      {
        name: "Aloe Vera Gel 150ml",
        categorySlug: "nnp-personal-care",
        brandSlug: "nnp-patanjali",
        variantName: "150 ml Tube",
        sku: "NNP-ALOEVERA-150",
        costPrice: 60,
        sellingPrice: 80,
        mrp: 85,
        qty: 45,
      },
      {
        name: "Dettol Antiseptic Liquid 200ml",
        categorySlug: "nnp-personal-care",
        brandSlug: "nnp-dettol",
        variantName: "200 ml Bottle",
        sku: "NNP-DETTOL-200",
        costPrice: 85,
        sellingPrice: 105,
        mrp: 112,
        qty: 55,
      },
      {
        name: "Hand Sanitizer 100ml",
        categorySlug: "nnp-personal-care",
        brandSlug: "nnp-dettol",
        variantName: "100 ml Bottle",
        sku: "NNP-SANITIZER-100",
        costPrice: 45,
        sellingPrice: 60,
        mrp: 65,
        qty: 70,
      },
    ],
  },
  {
    shopName: "Sunrise Bake House",
    shopSlug: "sunrise-bake-house-chandkheda",
    shopCategory: "Bakery",
    logoImageUrl: BAKERY_PHOTO,
    latitude: 23.116,
    longitude: 72.6045,
    addressArea: "Nigam Nagar, Chandkheda",
    categories: [{ name: "Bakery & Snacks", slug: "sbh-bakery-snacks" }],
    brands: [
      { name: "Britannia", slug: "sbh-britannia" },
      { name: "House Special", slug: "sbh-house-special" },
    ],
    products: [
      {
        name: "Fresh Brown Bread",
        categorySlug: "sbh-bakery-snacks",
        brandSlug: "sbh-house-special",
        variantName: "400 g Loaf",
        sku: "SBH-BROWNBREAD-400",
        costPrice: 30,
        sellingPrice: 45,
        mrp: 48,
        qty: 30,
      },
      {
        name: "Britannia Marie Gold Biscuits",
        categorySlug: "sbh-bakery-snacks",
        brandSlug: "sbh-britannia",
        variantName: "250 g Pack",
        sku: "SBH-MARIEGOLD-250",
        costPrice: 30,
        sellingPrice: 40,
        mrp: 45,
        qty: 60,
      },
      {
        name: "Chocolate Pastry",
        categorySlug: "sbh-bakery-snacks",
        brandSlug: "sbh-house-special",
        variantName: "Single Slice",
        sku: "SBH-CHOCPASTRY-1",
        costPrice: 35,
        sellingPrice: 60,
        mrp: 65,
        qty: 25,
      },
    ],
  },
];

interface DriverSeed {
  fullName: string;
  phone: string;
  email: string;
  vehicleType: string;
  vehicleNumber: string;
  latitude: number;
  longitude: number;
}

const DRIVERS: DriverSeed[] = [
  {
    fullName: "Kiran Patel",
    phone: "+919900000501",
    email: "kiran.patel.chandkheda@nearcart-drivers.local",
    vehicleType: "Motorcycle",
    vehicleNumber: "GJ01AB5001",
    latitude: 23.113,
    longitude: 72.602,
  },
  {
    fullName: "Ramesh Solanki",
    phone: "+919900000502",
    email: "ramesh.solanki.chandkheda@nearcart-drivers.local",
    vehicleType: "Scooter",
    vehicleNumber: "GJ01AB5002",
    latitude: 23.111,
    longitude: 72.604,
  },
];

async function seedShop(shopSeed: ShopSeed, index: number) {
  console.log(`\n--- ${shopSeed.shopName} ---`);

  let organization = await prisma.organization.findUnique({
    where: { slug: shopSeed.shopSlug },
  });

  if (organization) {
    console.log(`  Organization already exists: ${organization.id} — skipping create`);
  } else {
    organization = await prisma.organization.create({
      data: {
        name: shopSeed.shopName,
        slug: shopSeed.shopSlug,
        phone: "+911234500000",
        email: `contact@${shopSeed.shopSlug}.example.com`,
        status: "ACTIVE",
        currencyCode: "INR",
        timezone: "Asia/Kolkata",
      },
    });
    console.log(`  Created Organization: ${organization.id}`);
  }

  let branch = await prisma.branch.findFirst({
    where: { organizationId: organization.id, code: "MAIN" },
  });

  if (branch) {
    console.log(`  Branch already exists: ${branch.id} — skipping create`);
    // Still make sure a re-run keeps the onboarding gate bypassed / photo verified.
    branch = await prisma.branch.update({
      where: { id: branch.id },
      data: {
        shopPhotoUrl: branch.shopPhotoUrl ?? DUMMY_SHOP_PHOTO,
        shopPhotoVerificationStatus: ShopVerificationStatus.VERIFIED,
      },
    });
  } else {
    branch = await prisma.branch.create({
      data: {
        organizationId: organization.id,
        code: "MAIN",
        name: `${shopSeed.shopName} - Main Store`,
        type: BranchType.STORE,
        phone: "+911234500000",
        addressLine1: shopSeed.addressArea,
        city: "Ahmedabad",
        state: "Gujarat",
        country: "India",
        postalCode: "382424",
        isActive: true,
        latitude: shopSeed.latitude,
        longitude: shopSeed.longitude,
        // Pre-verified directly in DB, same rationale as seedDriver below — no OCR/Replicate
        // round-trip needed for throwaway test data, and it keeps RootNavigator's AppGate from
        // forcing a fresh owner login straight into ShopSetupScreen's onboarding photo gate.
        shopPhotoUrl: DUMMY_SHOP_PHOTO,
        shopPhotoVerificationStatus: ShopVerificationStatus.VERIFIED,
        shopPhotoVerifiedAt: new Date(),
      },
    });
    console.log(`  Created Branch: ${branch.id} @ (${shopSeed.latitude}, ${shopSeed.longitude})`);
  }

  // Real, login-able shop-owner account — seed-multi-city.ts doesn't create one of these; this
  // script's whole point is to be usable end-to-end on a real device, including logging into the
  // Inventory app as the shop.
  const ownerEmail = `owner+${shopSeed.shopSlug}@nearcart-seed.local`;
  let ownerUser = await prisma.user.findUnique({ where: { email: ownerEmail } });

  if (!ownerUser) {
    const passwordHash = await bcrypt.hash(OWNER_PASSWORD, 12);
    ownerUser = await prisma.user.create({
      data: {
        fullName: `${shopSeed.shopName} Owner`,
        email: ownerEmail,
        passwordHash,
        emailVerified: true,
      },
    });
    console.log(`  Created owner User: ${ownerUser.email}`);
  } else {
    console.log(`  Owner User already exists: ${ownerUser.email}`);
  }

  const existingMembership = await prisma.organizationMembership.findUnique({
    where: { userId_organizationId: { userId: ownerUser.id, organizationId: organization.id } },
  });

  if (!existingMembership) {
    await prisma.organizationMembership.create({
      data: {
        userId: ownerUser.id,
        organizationId: organization.id,
        role: UserRole.ORG_ADMIN,
        status: "ACTIVE",
        isDefault: true,
        acceptedAt: new Date(),
      },
    });
    console.log(`  Created OrganizationMembership: ORG_ADMIN`);
  } else {
    console.log(`  OrganizationMembership already exists`);
  }

  const categoryIdBySlug = new Map<string, string>();
  for (const categorySeed of shopSeed.categories) {
    let category = await prisma.category.findFirst({
      where: { organizationId: organization.id, slug: categorySeed.slug },
    });
    if (!category) {
      category = await prisma.category.create({
        data: { organizationId: organization.id, name: categorySeed.name, slug: categorySeed.slug, isActive: true },
      });
      console.log(`  Created Category: ${category.name}`);
    }
    categoryIdBySlug.set(categorySeed.slug, category.id);
  }

  const brandIdBySlug = new Map<string, string>();
  for (const brandSeed of shopSeed.brands) {
    let brand = await prisma.brand.findFirst({
      where: { organizationId: organization.id, slug: brandSeed.slug },
    });
    if (!brand) {
      brand = await prisma.brand.create({
        data: { organizationId: organization.id, name: brandSeed.name, slug: brandSeed.slug, isActive: true },
      });
      console.log(`  Created Brand: ${brand.name}`);
    }
    brandIdBySlug.set(brandSeed.slug, brand.id);
  }

  let productCount = 0;
  for (const productSeed of shopSeed.products) {
    const productSlug = productSeed.sku.toLowerCase();
    let product = await prisma.product.findFirst({
      where: { organizationId: organization.id, slug: productSlug },
    });

    if (product) {
      console.log(`  Product "${productSeed.name}" already exists — skipping`);
      productCount += 1;
      continue;
    }

    product = await prisma.product.create({
      data: {
        organizationId: organization.id,
        categoryId: categoryIdBySlug.get(productSeed.categorySlug) ?? null,
        brandId: brandIdBySlug.get(productSeed.brandSlug) ?? null,
        name: productSeed.name,
        slug: productSlug,
        productType: ProductType.SIMPLE,
        status: ProductStatus.ACTIVE,
        hasVariants: false,
        trackInventory: true,
        trackMethod: TrackMethod.PIECE,
        primaryUnitId: PCS_UNIT_ID,
      },
    });

    const variant = await prisma.productVariant.create({
      data: {
        organizationId: organization.id,
        productId: product.id,
        name: productSeed.variantName,
        sku: productSeed.sku,
        costPrice: productSeed.costPrice,
        sellingPrice: productSeed.sellingPrice,
        mrp: productSeed.mrp,
        isDefault: true,
        isActive: true,
        unitId: PCS_UNIT_ID,
      },
    });

    await prisma.inventoryBalance.create({
      data: {
        organizationId: organization.id,
        branchId: branch.id,
        productId: product.id,
        variantId: variant.id,
        onHand: productSeed.qty,
        reserved: 0,
        incoming: 0,
      },
    });

    console.log(`  Created Product: ${product.name} (qty ${productSeed.qty} @ ₹${productSeed.sellingPrice})`);
    productCount += 1;
  }

  return {
    shopName: shopSeed.shopName,
    shopSlug: shopSeed.shopSlug,
    shopCategory: shopSeed.shopCategory,
    logoImageUrl: shopSeed.logoImageUrl,
    latitude: shopSeed.latitude,
    longitude: shopSeed.longitude,
    addressArea: shopSeed.addressArea,
    organizationId: organization.id,
    branchId: branch.id,
    productCount,
    ownerEmail,
    ownerPassword: OWNER_PASSWORD,
  };
}

async function seedDriver(driverSeed: DriverSeed) {
  let driver = await prisma.driver.findUnique({ where: { phone: driverSeed.phone } });
  const passwordHash = await bcrypt.hash("NearMeDriver@123", 12);

  if (driver) {
    console.log(`  Driver ${driverSeed.fullName} already exists (${driver.id}) — updating location/status`);
    driver = await prisma.driver.update({
      where: { id: driver.id },
      data: {
        status: DriverStatus.VERIFIED,
        isAvailableForAssignment: true,
        lastKnownLatitude: driverSeed.latitude,
        lastKnownLongitude: driverSeed.longitude,
        lastLocationAt: new Date(),
      },
    });
    return driver;
  }

  driver = await prisma.driver.create({
    data: {
      fullName: driverSeed.fullName,
      phone: driverSeed.phone,
      email: driverSeed.email,
      passwordHash,
      vehicleType: driverSeed.vehicleType,
      vehicleNumber: driverSeed.vehicleNumber,
      status: DriverStatus.VERIFIED,
      emailVerified: true,
      isAvailableForAssignment: true,
      lastKnownLatitude: driverSeed.latitude,
      lastKnownLongitude: driverSeed.longitude,
      lastLocationAt: new Date(),
    },
  });

  console.log(`  Created Driver: ${driver.fullName} @ (${driverSeed.latitude}, ${driverSeed.longitude}) — VERIFIED, available`);
  return driver;
}

async function main() {
  console.log("=== Seeding 'near me' shops/branches/catalog (NearCart-Inventory) ===");

  const manifestShops = [];
  for (const [index, shopSeed] of SHOPS.entries()) {
    const result = await seedShop(shopSeed, index);
    manifestShops.push(result);
  }

  console.log("\n=== Seeding 'near me' drivers ===");
  const manifestDrivers = [];
  for (const driverSeed of DRIVERS) {
    const driver = await seedDriver(driverSeed);
    manifestDrivers.push({
      id: driver.id,
      fullName: driver.fullName,
      phone: driver.phone,
      email: driverSeed.email,
      password: "NearMeDriver@123",
      latitude: driverSeed.latitude,
      longitude: driverSeed.longitude,
    });
  }

  const manifestPath = path.join(__dirname, "seed-near-me.manifest.json");
  writeFileSync(
    manifestPath,
    JSON.stringify({ generatedAt: new Date().toISOString(), shops: manifestShops, drivers: manifestDrivers }, null, 2),
  );

  console.log(`\n=== Manifest written to ${manifestPath} ===`);
  console.log(`Shops: ${manifestShops.length}, Drivers: ${manifestDrivers.length}`);
}

main()
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
