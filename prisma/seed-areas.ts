/**
 * Demo-data seed (2026-09-24) for a freshly reset database: 4 Ahmedabad areas (Shivranjani,
 * Makarba, Shyamal, Chandkheda), each with 4 shops (grocery, pharmacy, dairy & bakery, fruits &
 * veg) × 10 products with real product images, stock, a login-able ORG_ADMIN owner per shop, and
 * 2 approved drivers — one general, one linked as the area grocery shop's own driver. Also creates
 * the platform SUPER_ADMIN using the same email/password as NearCart's bootstrap admin
 * (read from NearCart/backend/.env, never printed).
 *
 * Expects `SEED_SCOPE=core` of prisma/seed.ts to have run first (system units, industries,
 * master catalog). Product data + verified image URLs come from prisma/seed-areas.catalog.json.
 *
 * Run with:  node --import tsx prisma/seed-areas.ts
 * Writes prisma/seed-areas.manifest.json for NearCart/backend/prisma/seed-areas-shops.ts.
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import bcrypt from "bcrypt";
import dotenv from "dotenv";
import {
  BranchType,
  DriverStatus,
  DriverVerificationStatus,
  LanguageCode,
  ProductStatus,
  ProductType,
  ShopVerificationStatus,
  TrackMethod,
  UserRole,
} from "@prisma/client";

import { prisma } from "../src/config/prisma";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const DEMO_PASSWORD = "NearCart@123";

type ShopType = "grocery" | "pharmacy" | "dairy" | "fruitveg";

interface CatalogProduct {
  sku: string;
  name: string;
  variantName: string;
  category: string;
  brand: string;
  costPrice: number;
  sellingPrice: number;
  mrp: number;
  imageUrl: string;
}

export const AREAS = [
  { key: "shivranjani", name: "Shivranjani", lat: 23.019795, lng: 72.529433, pincode: "380015", locality: "Shivranjani Cross Road, Satellite" },
  { key: "makarba", name: "Makarba", lat: 22.997009, lng: 72.498117, pincode: "380051", locality: "Makarba" },
  { key: "shyamal", name: "Shyamal", lat: 23.011972, lng: 72.528385, pincode: "380015", locality: "Shyamal Cross Road" },
  { key: "chandkheda", name: "Chandkheda", lat: 23.1117, lng: 72.6028, pincode: "382424", locality: "Chandkheda" },
] as const;

const SHOP_TYPES: Record<ShopType, { label: string; category: string; names: string[]; photo: string }> = {
  grocery: {
    label: "Kirana",
    category: "Grocery",
    names: ["Shree Krishna Kirana", "Patel Provision Store", "Jay Ambe Kirana", "Om Sai General Store"],
    photo: "https://images.unsplash.com/photo-1759197894183-ffffa3c7fcd4?w=800&auto=format&fit=crop&q=80",
  },
  pharmacy: {
    label: "Pharmacy",
    category: "Pharmacy",
    names: ["Satellite Medical Store", "Sanjivani Chemist", "Arogya Pharmacy", "Shiv Medical & General"],
    photo: "https://images.unsplash.com/photo-1696861286643-341a8d7a79e9?w=800&auto=format&fit=crop&q=80",
  },
  dairy: {
    label: "Dairy & Bakery",
    category: "Dairy & Bakery",
    names: ["Gokul Dairy & Bakery", "Amrut Dairy Parlour", "Krishna Milk & Bakes", "Nandan Dairy Corner"],
    photo: "https://images.unsplash.com/photo-1774669081553-4ef841520c05?w=800&auto=format&fit=crop&q=80",
  },
  fruitveg: {
    label: "Fruits & Vegetables",
    category: "Fruits & Vegetables",
    names: ["Harit Fresh Fruits & Veg", "Kisan Sabji Mandi", "Green Basket Fruits", "Fresh Farm Sabji"],
    photo: "",
  },
};

// ~300–450 m apart around each area's centre, so every shop is walkable from the area customer.
const SHOP_OFFSETS: Record<ShopType, [number, number]> = {
  grocery: [0.0025, 0.0018],
  pharmacy: [-0.0018, 0.0026],
  dairy: [0.0017, -0.0027],
  fruitveg: [-0.0026, -0.0016],
};

const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

async function ensureSuperAdmin() {
  const nearcartEnv = dotenv.parse(readFileSync(process.env.NEARCART_ENV_PATH ?? path.join(__dirname, "../../../NearCart/backend/.env")));
  const email = nearcartEnv.ADMIN_BOOTSTRAP_EMAIL?.trim().toLowerCase();
  const password = nearcartEnv.ADMIN_BOOTSTRAP_PASSWORD;
  if (!email || !password) {
    throw new Error("NearCart/backend/.env has no ADMIN_BOOTSTRAP_EMAIL/PASSWORD");
  }
  const passwordHash = await bcrypt.hash(password, 12);
  const admin = await prisma.user.upsert({
    where: { email },
    update: { passwordHash, platformRole: UserRole.SUPER_ADMIN, isActive: true, emailVerified: true },
    create: {
      email,
      fullName: nearcartEnv.ADMIN_BOOTSTRAP_FULL_NAME || "NearCart Platform Admin",
      passwordHash,
      platformRole: UserRole.SUPER_ADMIN,
      preferredLanguage: LanguageCode.EN,
      isActive: true,
      emailVerified: true,
      passwordSetupRequired: false,
      passwordChangedAt: new Date(),
    },
  });
  console.log(`SUPER_ADMIN ready: ${admin.email}`);
  return admin.email;
}

async function seedShop(params: {
  area: (typeof AREAS)[number];
  areaIndex: number;
  type: ShopType;
  products: CatalogProduct[];
  unitId: string;
  ownerHash: string;
  fruitVegPhoto: string;
}) {
  const { area, areaIndex, type, products, unitId, ownerHash } = params;
  const spec = SHOP_TYPES[type];
  const shopName = `${spec.names[areaIndex]} · ${area.name}`;
  const slug = slugify(`${spec.names[areaIndex]}-${area.key}`);
  const [dLat, dLng] = SHOP_OFFSETS[type];
  const latitude = Number((area.lat + dLat).toFixed(6));
  const longitude = Number((area.lng + dLng).toFixed(6));
  const photo = spec.photo || params.fruitVegPhoto;
  const phone = `+9198250${String(areaIndex * 10 + Object.keys(SHOP_TYPES).indexOf(type)).padStart(5, "0")}`;

  const organization = await prisma.organization.create({
    data: {
      name: shopName,
      slug,
      phone,
      email: `contact@${slug}.nearcart-seed.local`,
      status: "ACTIVE",
      currencyCode: "INR",
      timezone: "Asia/Kolkata",
    },
  });

  const branch = await prisma.branch.create({
    data: {
      organizationId: organization.id,
      code: "MAIN",
      name: `${spec.names[areaIndex]} - ${area.name}`,
      type: BranchType.STORE,
      phone,
      addressLine1: `Shop ${areaIndex + 3}, ${area.locality}`,
      city: "Ahmedabad",
      state: "Gujarat",
      country: "India",
      postalCode: area.pincode,
      isActive: true,
      latitude,
      longitude,
      shopPhotoUrl: photo,
      shopPhotoVerificationStatus: ShopVerificationStatus.VERIFIED,
      shopPhotoVerifiedAt: new Date(),
    },
  });

  const ownerEmail = `owner.${slug}@nearcart-seed.local`;
  const owner = await prisma.user.create({
    data: {
      fullName: `${spec.names[areaIndex]} Owner`,
      email: ownerEmail,
      passwordHash: ownerHash,
      emailVerified: true,
      isActive: true,
    },
  });
  await prisma.organizationMembership.create({
    data: {
      userId: owner.id,
      organizationId: organization.id,
      role: UserRole.ORG_ADMIN,
      status: "ACTIVE",
      isDefault: true,
      acceptedAt: new Date(),
    },
  });

  const categoryIds = new Map<string, string>();
  const brandIds = new Map<string, string>();
  for (const product of products) {
    if (!categoryIds.has(product.category)) {
      const category = await prisma.category.create({
        data: { organizationId: organization.id, name: product.category, slug: slugify(product.category), isActive: true },
      });
      categoryIds.set(product.category, category.id);
    }
    if (!brandIds.has(product.brand)) {
      const brand = await prisma.brand.create({
        data: { organizationId: organization.id, name: product.brand, slug: slugify(product.brand), isActive: true },
      });
      brandIds.set(product.brand, brand.id);
    }
  }

  for (const [index, product] of products.entries()) {
    // Small per-area price differences so the four areas don't look copy-pasted.
    const sellingPrice = Math.max(product.costPrice + 1, product.sellingPrice - (areaIndex % 3));
    const created = await prisma.product.create({
      data: {
        organizationId: organization.id,
        categoryId: categoryIds.get(product.category)!,
        brandId: brandIds.get(product.brand)!,
        name: product.name,
        slug: slugify(`${product.sku}-${product.name}`),
        productType: ProductType.SIMPLE,
        status: ProductStatus.ACTIVE,
        hasVariants: false,
        trackInventory: true,
        trackMethod: TrackMethod.PIECE,
        primaryUnitId: unitId,
        imageUrl: product.imageUrl,
      },
    });
    const variant = await prisma.productVariant.create({
      data: {
        organizationId: organization.id,
        productId: created.id,
        name: product.variantName,
        sku: `${product.sku}-${area.key.toUpperCase().slice(0, 3)}${areaIndex}`,
        costPrice: product.costPrice,
        sellingPrice,
        mrp: product.mrp,
        isDefault: true,
        isActive: true,
        unitId,
        imageUrl: product.imageUrl,
      },
    });
    await prisma.inventoryBalance.create({
      data: {
        organizationId: organization.id,
        branchId: branch.id,
        productId: created.id,
        variantId: variant.id,
        onHand: 25 + ((index * 7 + areaIndex * 11) % 50),
        reserved: 0,
        incoming: 0,
      },
    });
  }

  console.log(`  ${shopName}: ${products.length} products @ (${latitude}, ${longitude})`);

  return {
    shopName,
    shopSlug: slug,
    shopCategory: spec.category,
    shopType: type,
    logoImageUrl: photo,
    area: area.name,
    areaKey: area.key,
    addressLine1: `Shop ${areaIndex + 3}, ${area.locality}`,
    pincode: area.pincode,
    latitude,
    longitude,
    organizationId: organization.id,
    branchId: branch.id,
    phone,
    productCount: products.length,
    ownerEmail,
  };
}

async function main() {
  const url = (process.env.DATABASE_URL ?? "").toLowerCase();
  console.log(`=== seed-areas against ${url.startsWith("libsql://") ? "REMOTE libsql" : url.split(":")[0]} ===`);

  const catalog = JSON.parse(readFileSync(path.join(__dirname, "seed-areas.catalog.json"), "utf8")) as {
    products: Record<ShopType, CatalogProduct[]>;
    fruitVegShopPhoto: string;
  };
  for (const [type, list] of Object.entries(catalog.products)) {
    const missing = list.filter((p) => !p.imageUrl);
    if (missing.length) throw new Error(`${type}: products without an image: ${missing.map((p) => p.name).join(", ")}`);
  }

  const pcs = await prisma.unit.findFirst({ where: { code: "pcs", organizationId: null } });
  if (!pcs) throw new Error('System unit "pcs" not found — run SEED_SCOPE=core prisma/seed.ts first');

  const adminEmail = await ensureSuperAdmin();
  const ownerHash = await bcrypt.hash(DEMO_PASSWORD, 12);

  const shops = [];
  const drivers = [];
  for (const [areaIndex, area] of AREAS.entries()) {
    console.log(`\n--- ${area.name} ---`);
    const areaShops = [];
    for (const type of Object.keys(SHOP_TYPES) as ShopType[]) {
      const pool = catalog.products[type];
      // 10 of the 14 per type, rotated per area so neighbouring areas stock different things.
      const picked = Array.from({ length: 10 }, (_, j) => pool[(areaIndex * 3 + j) % pool.length]!);
      areaShops.push(
        await seedShop({ area, areaIndex, type, products: picked, unitId: pcs.id, ownerHash, fruitVegPhoto: catalog.fruitVegShopPhoto }),
      );
    }
    shops.push(...areaShops);

    const grocery = areaShops.find((shop) => shop.shopType === "grocery")!;
    for (const n of [1, 2]) {
      const shopDriver = n === 2;
      const email = `driver${n}.${area.key}@nearcart-seed.local`;
      const driver = await prisma.driver.create({
        data: {
          fullName: `${["Ramesh", "Suresh", "Mahesh", "Dinesh", "Jignesh", "Hitesh", "Paresh", "Nilesh"][areaIndex * 2 + n - 1]} ${area.name}`,
          phone: `+919712${String(areaIndex * 10 + n).padStart(6, "0")}`,
          email,
          passwordHash: ownerHash,
          vehicleType: n === 1 ? "BIKE" : "SCOOTER",
          vehicleNumber: `GJ01${String.fromCharCode(65 + areaIndex)}${String.fromCharCode(65 + n)}${1000 + areaIndex * 10 + n}`,
          status: DriverStatus.VERIFIED,
          emailVerified: true,
          onboardingVerificationStatus: DriverVerificationStatus.VERIFIED,
          isAvailableForAssignment: false,
          lastKnownLatitude: area.lat,
          lastKnownLongitude: area.lng,
          lastLocationAt: new Date(),
          ...(shopDriver ? { shopBranchId: grocery.branchId, shopJoinedAt: new Date() } : {}),
        },
      });
      drivers.push({
        id: driver.id,
        fullName: driver.fullName,
        phone: driver.phone,
        email,
        area: area.name,
        shopDriverFor: shopDriver ? grocery.shopName : null,
      });
      console.log(`  Driver ${driver.fullName}${shopDriver ? ` (own driver of ${grocery.shopName})` : " (general)"}`);
    }
  }

  const manifestPath = path.join(__dirname, "seed-areas.manifest.json");
  writeFileSync(
    manifestPath,
    JSON.stringify(
      { generatedAt: new Date().toISOString(), demoPassword: DEMO_PASSWORD, superAdminEmail: adminEmail, areas: AREAS, shops, drivers },
      null,
      2,
    ),
  );
  console.log(`\nShops: ${shops.length}, drivers: ${drivers.length}. Manifest: ${manifestPath}`);
}

main()
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
