/**
 * Multi-city dev data seed — adds realistic multi-city shops/branches/products/drivers
 * ALONGSIDE the existing seeded data (does not touch "NearCart Grocery Demo" / Ahmedabad /
 * the pre-existing driver rows). Safe to re-run: every create is guarded by a findFirst/
 * findUnique lookup on a natural key (org slug, [org,code] branch, [org,slug] category/brand,
 * [org,slug] product, driver phone/email), so re-running just logs "already exists, skipping"
 * for anything already created.
 *
 * Run with:  node --import tsx prisma/seed-multi-city.ts
 *
 * Writes a manifest of created organizationId/branchId per shop to
 * prisma/seed-multi-city.manifest.json — NearCart/backend's companion script
 * (prisma/seed-multi-city-shops.ts) reads that manifest to create matching Shop rows.
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
  TrackMethod,
} from "@prisma/client";

import { prisma } from "../src/config/prisma";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Global system unit (organizationId null) already present in every environment — reused
// across all seeded variants here rather than creating a new per-org unit for each product.
const PCS_UNIT_ID = "cmn21f4xf0001hsd19wti285c";

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

interface CategorySeed {
  name: string;
  slug: string;
}

interface BrandSeed {
  name: string;
  slug: string;
}

interface ShopSeed {
  city: string;
  cityLat: number;
  cityLng: number;
  shopName: string;
  shopSlug: string;
  shopCategory: string; // NearCart Shop.category (flat shop-type string)
  logoImageUrl: string;
  latitude: number;
  longitude: number;
  addressArea: string;
  categories: CategorySeed[];
  brands: BrandSeed[];
  products: ProductSeed[];
}

const GROCERY_PHOTO =
  "https://images.unsplash.com/photo-1759197894183-ffffa3c7fcd4?w=800&auto=format&fit=crop&q=80";
const PHARMACY_PHOTO =
  "https://images.unsplash.com/photo-1696861286643-341a8d7a79e9?w=800&auto=format&fit=crop&q=80";
const BAKERY_PHOTO =
  "https://images.unsplash.com/photo-1774669081553-4ef841520c05?w=800&auto=format&fit=crop&q=80";
const ELECTRONICS_PHOTO =
  "https://images.unsplash.com/photo-1571857089849-f6390447191a?w=800&auto=format&fit=crop&q=80";
const RESTAURANT_PHOTO =
  "https://images.unsplash.com/photo-1753727471014-efe38840c7c7?w=800&auto=format&fit=crop&q=80";
const STATIONERY_PHOTO =
  "https://images.unsplash.com/photo-1761322572550-967ea8c0bfd9?w=800&auto=format&fit=crop&q=80";

const SHOPS: ShopSeed[] = [
  // ---------------------------------------------------------------- Mumbai --
  {
    city: "Mumbai",
    cityLat: 19.076,
    cityLng: 72.8777,
    shopName: "Bandra Fresh Mart",
    shopSlug: "bandra-fresh-mart",
    shopCategory: "Grocery",
    logoImageUrl: GROCERY_PHOTO,
    latitude: 19.0596,
    longitude: 72.8295,
    addressArea: "Bandra West",
    categories: [
      { name: "Dairy & Bakery", slug: "dairy-bakery" },
      { name: "Staples & Grains", slug: "staples-grains" },
    ],
    brands: [
      { name: "Amul", slug: "amul" },
      { name: "Aashirvaad", slug: "aashirvaad" },
    ],
    products: [
      {
        name: "Amul Toned Milk 500ml",
        categorySlug: "dairy-bakery",
        brandSlug: "amul",
        variantName: "500 ml Pouch",
        sku: "BFM-MILK-500",
        costPrice: 24,
        sellingPrice: 27,
        mrp: 28,
        qty: 120,
      },
      {
        name: "Whole Wheat Brown Bread 400g",
        categorySlug: "dairy-bakery",
        brandSlug: "amul",
        variantName: "400 g Pack",
        sku: "BFM-BREAD-400",
        costPrice: 32,
        sellingPrice: 38,
        mrp: 40,
        qty: 50,
      },
      {
        name: "Aashirvaad Atta 5kg",
        categorySlug: "staples-grains",
        brandSlug: "aashirvaad",
        variantName: "5 kg Bag",
        sku: "BFM-ATTA-5KG",
        costPrice: 210,
        sellingPrice: 235,
        mrp: 245,
        qty: 40,
      },
      {
        name: "Toor Dal 1kg",
        categorySlug: "staples-grains",
        brandSlug: "aashirvaad",
        variantName: "1 kg Pack",
        sku: "BFM-TOORDAL-1KG",
        costPrice: 105,
        sellingPrice: 122,
        mrp: 130,
        qty: 60,
      },
    ],
  },
  {
    city: "Mumbai",
    cityLat: 19.076,
    cityLng: 72.8777,
    shopName: "Colaba Corner Pharmacy",
    shopSlug: "colaba-corner-pharmacy",
    shopCategory: "Pharmacy",
    logoImageUrl: PHARMACY_PHOTO,
    latitude: 18.9067,
    longitude: 72.8147,
    addressArea: "Colaba",
    categories: [
      { name: "Medicines", slug: "medicines" },
      { name: "Personal Care", slug: "personal-care" },
    ],
    brands: [
      { name: "Cipla", slug: "cipla" },
      { name: "Himalaya", slug: "himalaya" },
    ],
    products: [
      {
        name: "Crocin Paracetamol 650mg (Strip of 10)",
        categorySlug: "medicines",
        brandSlug: "cipla",
        variantName: "Strip of 10",
        sku: "CCP-CROCIN-650",
        costPrice: 18,
        sellingPrice: 22,
        mrp: 25,
        qty: 200,
      },
      {
        name: "Digene Antacid Gel 200ml",
        categorySlug: "medicines",
        brandSlug: "cipla",
        variantName: "200 ml Bottle",
        sku: "CCP-DIGENE-200",
        costPrice: 60,
        sellingPrice: 72,
        mrp: 78,
        qty: 90,
      },
      {
        name: "Himalaya Neem Face Wash 100ml",
        categorySlug: "personal-care",
        brandSlug: "himalaya",
        variantName: "100 ml Tube",
        sku: "CCP-NEEMFW-100",
        costPrice: 70,
        sellingPrice: 85,
        mrp: 90,
        qty: 75,
      },
      {
        name: "Hand Sanitizer 200ml",
        categorySlug: "personal-care",
        brandSlug: "himalaya",
        variantName: "200 ml Bottle",
        sku: "CCP-SANITIZER-200",
        costPrice: 55,
        sellingPrice: 65,
        mrp: 70,
        qty: 100,
      },
    ],
  },
  // ------------------------------------------------------------- Bengaluru --
  {
    city: "Bengaluru",
    cityLat: 12.9716,
    cityLng: 77.5946,
    shopName: "Indiranagar Bake House",
    shopSlug: "indiranagar-bake-house",
    shopCategory: "Bakery",
    logoImageUrl: BAKERY_PHOTO,
    latitude: 12.9784,
    longitude: 77.6408,
    addressArea: "Indiranagar",
    categories: [
      { name: "Breads", slug: "breads" },
      { name: "Cakes & Pastries", slug: "cakes-pastries" },
    ],
    brands: [
      { name: "House Bake", slug: "house-bake" },
      { name: "Artisan Select", slug: "artisan-select" },
    ],
    products: [
      {
        name: "Sourdough Loaf 500g",
        categorySlug: "breads",
        brandSlug: "house-bake",
        variantName: "500 g Loaf",
        sku: "IBH-SOURDOUGH-500",
        costPrice: 90,
        sellingPrice: 130,
        mrp: 140,
        qty: 30,
      },
      {
        name: "Butter Croissant (Pack of 2)",
        categorySlug: "breads",
        brandSlug: "house-bake",
        variantName: "Pack of 2",
        sku: "IBH-CROISSANT-2",
        costPrice: 60,
        sellingPrice: 90,
        mrp: 95,
        qty: 40,
      },
      {
        name: "Chocolate Truffle Cake 500g",
        categorySlug: "cakes-pastries",
        brandSlug: "artisan-select",
        variantName: "500 g Cake",
        sku: "IBH-CHOCCAKE-500",
        costPrice: 250,
        sellingPrice: 350,
        mrp: 380,
        qty: 15,
      },
      {
        name: "Assorted Cookies 250g",
        categorySlug: "cakes-pastries",
        brandSlug: "artisan-select",
        variantName: "250 g Box",
        sku: "IBH-COOKIES-250",
        costPrice: 80,
        sellingPrice: 120,
        mrp: 130,
        qty: 50,
      },
    ],
  },
  {
    city: "Bengaluru",
    cityLat: 12.9716,
    cityLng: 77.5946,
    shopName: "Koramangala Tech Bazaar",
    shopSlug: "koramangala-tech-bazaar",
    shopCategory: "Electronics",
    logoImageUrl: ELECTRONICS_PHOTO,
    latitude: 12.9352,
    longitude: 77.6245,
    addressArea: "Koramangala",
    categories: [
      { name: "Mobile Accessories", slug: "mobile-accessories" },
      { name: "Audio", slug: "audio" },
    ],
    brands: [
      { name: "boAt", slug: "boat" },
      { name: "Portronics", slug: "portronics" },
    ],
    products: [
      {
        name: "boAt USB-C Cable 1.5m",
        categorySlug: "mobile-accessories",
        brandSlug: "boat",
        variantName: "1.5 m Cable",
        sku: "KTB-USBC-150",
        costPrice: 150,
        sellingPrice: 249,
        mrp: 299,
        qty: 100,
      },
      {
        name: "20000mAh Power Bank",
        categorySlug: "mobile-accessories",
        brandSlug: "boat",
        variantName: "20000 mAh",
        sku: "KTB-POWERBANK-20K",
        costPrice: 900,
        sellingPrice: 1299,
        mrp: 1499,
        qty: 35,
      },
      {
        name: "boAt Rockerz Bluetooth Earbuds",
        categorySlug: "audio",
        brandSlug: "boat",
        variantName: "Single Pair",
        sku: "KTB-EARBUDS-RCKZ",
        costPrice: 900,
        sellingPrice: 1399,
        mrp: 1999,
        qty: 40,
      },
      {
        name: "Portronics Bluetooth Speaker",
        categorySlug: "audio",
        brandSlug: "portronics",
        variantName: "Single Unit",
        sku: "KTB-SPEAKER-BT",
        costPrice: 700,
        sellingPrice: 999,
        mrp: 1199,
        qty: 25,
      },
    ],
  },
  // ------------------------------------------------------------- Hyderabad --
  {
    city: "Hyderabad",
    cityLat: 17.385,
    cityLng: 78.4867,
    shopName: "Banjara Hills Grocery",
    shopSlug: "banjara-hills-grocery",
    shopCategory: "Grocery",
    logoImageUrl: GROCERY_PHOTO,
    latitude: 17.4156,
    longitude: 78.4347,
    addressArea: "Banjara Hills",
    categories: [
      { name: "Dairy & Bakery", slug: "dairy-bakery" },
      { name: "Staples & Grains", slug: "staples-grains" },
    ],
    brands: [
      { name: "Heritage", slug: "heritage" },
      { name: "India Gate", slug: "india-gate-bhg" },
    ],
    products: [
      {
        name: "Heritage Toned Milk 500ml",
        categorySlug: "dairy-bakery",
        brandSlug: "heritage",
        variantName: "500 ml Pouch",
        sku: "BHG-MILK-500",
        costPrice: 25,
        sellingPrice: 28,
        mrp: 30,
        qty: 110,
      },
      {
        name: "Heritage Curd 400g",
        categorySlug: "dairy-bakery",
        brandSlug: "heritage",
        variantName: "400 g Cup",
        sku: "BHG-CURD-400",
        costPrice: 28,
        sellingPrice: 34,
        mrp: 36,
        qty: 70,
      },
      {
        name: "India Gate Basmati Rice 5kg",
        categorySlug: "staples-grains",
        brandSlug: "india-gate-bhg",
        variantName: "5 kg Bag",
        sku: "BHG-BASMATI-5KG",
        costPrice: 420,
        sellingPrice: 465,
        mrp: 490,
        qty: 45,
      },
      {
        name: "Toor Dal 1kg",
        categorySlug: "staples-grains",
        brandSlug: "india-gate-bhg",
        variantName: "1 kg Pack",
        sku: "BHG-TOORDAL-1KG",
        costPrice: 105,
        sellingPrice: 122,
        mrp: 130,
        qty: 60,
      },
    ],
  },
  {
    city: "Hyderabad",
    cityLat: 17.385,
    cityLng: 78.4867,
    shopName: "Hitech Diner",
    shopSlug: "hitech-diner",
    shopCategory: "Restaurant",
    logoImageUrl: RESTAURANT_PHOTO,
    latitude: 17.4435,
    longitude: 78.3772,
    addressArea: "HITEC City",
    categories: [
      { name: "Starters", slug: "starters" },
      { name: "Main Course", slug: "main-course" },
    ],
    brands: [{ name: "Hitech Diner Kitchen", slug: "hitech-diner-kitchen" }],
    products: [
      {
        name: "Paneer Tikka (Half)",
        categorySlug: "starters",
        brandSlug: "hitech-diner-kitchen",
        variantName: "Half Plate",
        sku: "HD-PANEERTIKKA-H",
        costPrice: 90,
        sellingPrice: 180,
        mrp: 190,
        qty: 500,
      },
      {
        name: "Chicken 65 (Full)",
        categorySlug: "starters",
        brandSlug: "hitech-diner-kitchen",
        variantName: "Full Plate",
        sku: "HD-CHICKEN65-F",
        costPrice: 140,
        sellingPrice: 260,
        mrp: 270,
        qty: 500,
      },
      {
        name: "Hyderabadi Chicken Biryani",
        categorySlug: "main-course",
        brandSlug: "hitech-diner-kitchen",
        variantName: "Single Serving",
        sku: "HD-BIRYANI-CHK",
        costPrice: 160,
        sellingPrice: 280,
        mrp: 290,
        qty: 500,
      },
      {
        name: "Butter Naan",
        categorySlug: "main-course",
        brandSlug: "hitech-diner-kitchen",
        variantName: "Single Piece",
        sku: "HD-NAAN-BUTTER",
        costPrice: 15,
        sellingPrice: 40,
        mrp: 45,
        qty: 1000,
      },
    ],
  },
  // ------------------------------------------------------------------ Pune --
  {
    city: "Pune",
    cityLat: 18.5204,
    cityLng: 73.8567,
    shopName: "FC Road Stationery Hub",
    shopSlug: "fc-road-stationery-hub",
    shopCategory: "Stationery",
    logoImageUrl: STATIONERY_PHOTO,
    latitude: 18.5246,
    longitude: 73.8412,
    addressArea: "FC Road",
    categories: [
      { name: "Notebooks & Paper", slug: "notebooks-paper" },
      { name: "Writing Instruments", slug: "writing-instruments" },
    ],
    brands: [
      { name: "Classmate", slug: "classmate" },
      { name: "Cello", slug: "cello" },
    ],
    products: [
      {
        name: "Classmate Notebook 200pg (Single Line)",
        categorySlug: "notebooks-paper",
        brandSlug: "classmate",
        variantName: "200 Pages",
        sku: "FSH-NOTEBOOK-200SL",
        costPrice: 35,
        sellingPrice: 50,
        mrp: 55,
        qty: 200,
      },
      {
        name: "Classmate Notebook 172pg (Long)",
        categorySlug: "notebooks-paper",
        brandSlug: "classmate",
        variantName: "172 Pages",
        sku: "FSH-NOTEBOOK-172L",
        costPrice: 40,
        sellingPrice: 55,
        mrp: 60,
        qty: 150,
      },
      {
        name: "Cello Gripper Ball Pen (Pack of 5)",
        categorySlug: "writing-instruments",
        brandSlug: "cello",
        variantName: "Pack of 5",
        sku: "FSH-PEN-GRIPPER5",
        costPrice: 30,
        sellingPrice: 50,
        mrp: 55,
        qty: 180,
      },
      {
        name: "Cello Highlighter Set (5 Colors)",
        categorySlug: "writing-instruments",
        brandSlug: "cello",
        variantName: "Set of 5",
        sku: "FSH-HIGHLIGHTER5",
        costPrice: 55,
        sellingPrice: 90,
        mrp: 99,
        qty: 90,
      },
    ],
  },
  {
    city: "Pune",
    cityLat: 18.5204,
    cityLng: 73.8567,
    shopName: "Kothrud Family Pharmacy",
    shopSlug: "kothrud-family-pharmacy",
    shopCategory: "Pharmacy",
    logoImageUrl: PHARMACY_PHOTO,
    latitude: 18.5074,
    longitude: 73.8077,
    addressArea: "Kothrud",
    categories: [
      { name: "Medicines", slug: "medicines" },
      { name: "Wellness", slug: "wellness" },
    ],
    brands: [
      { name: "Sun Pharma", slug: "sun-pharma" },
      { name: "Patanjali", slug: "patanjali" },
    ],
    products: [
      {
        name: "Paracetamol 500mg (Strip of 15)",
        categorySlug: "medicines",
        brandSlug: "sun-pharma",
        variantName: "Strip of 15",
        sku: "KFP-PARA-500-15",
        costPrice: 12,
        sellingPrice: 18,
        mrp: 20,
        qty: 250,
      },
      {
        name: "ORS Electrolyte Sachets (Pack of 5)",
        categorySlug: "medicines",
        brandSlug: "sun-pharma",
        variantName: "Pack of 5",
        sku: "KFP-ORS-5",
        costPrice: 25,
        sellingPrice: 35,
        mrp: 40,
        qty: 150,
      },
      {
        name: "Patanjali Aloe Vera Gel 150ml",
        categorySlug: "wellness",
        brandSlug: "patanjali",
        variantName: "150 ml Tube",
        sku: "KFP-ALOEVERA-150",
        costPrice: 60,
        sellingPrice: 80,
        mrp: 85,
        qty: 80,
      },
      {
        name: "Multivitamin Tablets (30 tabs)",
        categorySlug: "wellness",
        brandSlug: "patanjali",
        variantName: "30 Tablets",
        sku: "KFP-MULTIVIT-30",
        costPrice: 140,
        sellingPrice: 190,
        mrp: 210,
        qty: 60,
      },
    ],
  },
];

interface DriverSeed {
  city: string;
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
    city: "Mumbai",
    fullName: "Rajesh Kadam",
    phone: "+919821000101",
    email: "rajesh.kadam.mumbai@nearcart-drivers.local",
    vehicleType: "Motorcycle",
    vehicleNumber: "MH01AB1101",
    latitude: 19.055,
    longitude: 72.84,
  },
  {
    city: "Mumbai",
    fullName: "Suresh Pawar",
    phone: "+919821000102",
    email: "suresh.pawar.mumbai@nearcart-drivers.local",
    vehicleType: "Scooter",
    vehicleNumber: "MH01AB1102",
    latitude: 18.91,
    longitude: 72.82,
  },
  {
    city: "Bengaluru",
    fullName: "Manjunath Gowda",
    phone: "+919845000201",
    email: "manjunath.gowda.blr@nearcart-drivers.local",
    vehicleType: "Motorcycle",
    vehicleNumber: "KA01AB1201",
    latitude: 12.975,
    longitude: 77.635,
  },
  {
    city: "Bengaluru",
    fullName: "Naveen Kumar",
    phone: "+919845000202",
    email: "naveen.kumar.blr@nearcart-drivers.local",
    vehicleType: "Scooter",
    vehicleNumber: "KA01AB1202",
    latitude: 12.93,
    longitude: 77.62,
  },
  {
    city: "Hyderabad",
    fullName: "Srinivas Reddy",
    phone: "+919440000301",
    email: "srinivas.reddy.hyd@nearcart-drivers.local",
    vehicleType: "Motorcycle",
    vehicleNumber: "TS01AB1301",
    latitude: 17.41,
    longitude: 78.44,
  },
  {
    city: "Hyderabad",
    fullName: "Mahesh Rao",
    phone: "+919440000302",
    email: "mahesh.rao.hyd@nearcart-drivers.local",
    vehicleType: "Scooter",
    vehicleNumber: "TS01AB1302",
    latitude: 17.448,
    longitude: 78.38,
  },
  {
    city: "Pune",
    fullName: "Ganesh Jadhav",
    phone: "+919922000401",
    email: "ganesh.jadhav.pune@nearcart-drivers.local",
    vehicleType: "Motorcycle",
    vehicleNumber: "MH12AB1401",
    latitude: 18.52,
    longitude: 73.845,
  },
  {
    city: "Pune",
    fullName: "Vikas Deshmukh",
    phone: "+919922000402",
    email: "vikas.deshmukh.pune@nearcart-drivers.local",
    vehicleType: "Scooter",
    vehicleNumber: "MH12AB1402",
    latitude: 18.505,
    longitude: 73.81,
  },
];

async function seedShop(shopSeed: ShopSeed) {
  console.log(`\n--- ${shopSeed.shopName} (${shopSeed.city}) ---`);

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
  } else {
    branch = await prisma.branch.create({
      data: {
        organizationId: organization.id,
        code: "MAIN",
        name: `${shopSeed.shopName} - Main Store`,
        type: BranchType.STORE,
        phone: "+911234500000",
        addressLine1: shopSeed.addressArea,
        city: shopSeed.city,
        state: "",
        country: "India",
        postalCode: "000000",
        isActive: true,
        latitude: shopSeed.latitude,
        longitude: shopSeed.longitude,
      },
    });
    console.log(`  Created Branch: ${branch.id} @ (${shopSeed.latitude}, ${shopSeed.longitude})`);
  }

  const categoryIdBySlug = new Map<string, string>();
  for (const categorySeed of shopSeed.categories) {
    let category = await prisma.category.findFirst({
      where: { organizationId: organization.id, slug: categorySeed.slug },
    });

    if (category) {
      console.log(`  Category "${categorySeed.name}" already exists — skipping`);
    } else {
      category = await prisma.category.create({
        data: {
          organizationId: organization.id,
          name: categorySeed.name,
          slug: categorySeed.slug,
          isActive: true,
        },
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

    if (brand) {
      console.log(`  Brand "${brandSeed.name}" already exists — skipping`);
    } else {
      brand = await prisma.brand.create({
        data: {
          organizationId: organization.id,
          name: brandSeed.name,
          slug: brandSeed.slug,
          isActive: true,
        },
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
    city: shopSeed.city,
    logoImageUrl: shopSeed.logoImageUrl,
    latitude: shopSeed.latitude,
    longitude: shopSeed.longitude,
    addressArea: shopSeed.addressArea,
    organizationId: organization.id,
    branchId: branch.id,
    productCount,
  };
}

async function seedDriver(driverSeed: DriverSeed) {
  let driver = await prisma.driver.findUnique({ where: { phone: driverSeed.phone } });

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

  const passwordHash = await bcrypt.hash("SeedDriver@123", 12);

  driver = await prisma.driver.create({
    data: {
      fullName: driverSeed.fullName,
      phone: driverSeed.phone,
      email: driverSeed.email,
      passwordHash,
      vehicleType: driverSeed.vehicleType,
      vehicleNumber: driverSeed.vehicleNumber,
      // Pre-verified directly in DB — self-serve registration starts PENDING_VERIFICATION and
      // there's no email-click flow to run in a seed context (see task brief).
      status: DriverStatus.VERIFIED,
      isAvailableForAssignment: true,
      lastKnownLatitude: driverSeed.latitude,
      lastKnownLongitude: driverSeed.longitude,
      lastLocationAt: new Date(),
    },
  });

  console.log(
    `  Created Driver: ${driver.fullName} (${driverSeed.city}) @ (${driverSeed.latitude}, ${driverSeed.longitude}) — VERIFIED, available`,
  );

  return driver;
}

async function main() {
  console.log("=== Seeding multi-city shops/branches/catalog (NearCart-Inventory) ===");

  const manifestShops = [];
  for (const shopSeed of SHOPS) {
    const result = await seedShop(shopSeed);
    manifestShops.push(result);
  }

  console.log("\n=== Seeding multi-city drivers ===");
  const manifestDrivers = [];
  for (const driverSeed of DRIVERS) {
    const driver = await seedDriver(driverSeed);
    manifestDrivers.push({
      id: driver.id,
      fullName: driver.fullName,
      city: driverSeed.city,
      phone: driver.phone,
      latitude: driverSeed.latitude,
      longitude: driverSeed.longitude,
    });
  }

  const manifestPath = path.join(__dirname, "seed-multi-city.manifest.json");
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
