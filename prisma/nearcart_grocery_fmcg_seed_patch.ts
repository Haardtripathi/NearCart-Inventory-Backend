import { Prisma, TrackMethod } from "@prisma/client";

/**
 * NearCart Grocery FMCG seed patch
 *
 * Purpose:
 * 1. Keep the current Product -> ProductVariant design.
 * 2. Use Brand as the consumer-facing shelf brand.
 * 3. Use Product as the product family / product line.
 * 4. Use ProductVariant as the sellable SKU / pack.
 * 5. Keep deeper hierarchy inside metadata + attributes for now.
 *
 * Drop-in usage:
 * - Copy this file into prisma/seed.fmcg.patch.ts
 * - Import the arrays into prisma/seed.ts
 * - Merge them into groceryDemoCategories, groceryDemoBrands, and groceryProducts
 *
 * Example:
 *   const groceryDemoCategories = [...baseCategories, ...groceryFmcgCategoryPatch]
 *   const groceryDemoBrands = [...baseBrands, ...groceryFmcgBrandPatch]
 *   const groceryProducts = [...baseProducts, ...groceryFmcgProductPatch]
 */

type BilingualName = {
  EN: string;
  HI: string;
};

type BilingualNameDescription = {
  EN: { name: string; description?: string };
  HI: { name: string; description?: string };
};

type OrgBrandSeed = {
  slug: string;
  translations: BilingualName;
};

type OrgCategorySeed = {
  slug: string;
  parentSlug?: string;
  translations: BilingualNameDescription;
  sortOrder: number;
};

type OrgVariantSeed = {
  name: string;
  sku: string;
  barcode?: string;
  attributes?: Prisma.InputJsonValue;
  costPrice: string;
  sellingPrice: string;
  mrp?: string;
  reorderLevel?: string;
  minStockLevel?: string;
  maxStockLevel?: string;
  weight?: string;
  unitCode?: string;
  isDefault?: boolean;
  imageUrl?: string;
  translations: BilingualName;
};

type OrgProductSeed = {
  slug: string;
  masterItemCode?: string;
  industryCode: string;
  categorySlug: string;
  brandSlug?: string;
  name: string;
  nameHi: string;
  description?: string;
  descriptionHi?: string;
  trackMethod?: TrackMethod;
  primaryUnitCode?: string;
  imageUrl?: string;
  tags?: string[];
  customFields?: Prisma.InputJsonValue;
  metadata?: Prisma.InputJsonValue;
  variants: OrgVariantSeed[];
};

export const groceryFmcgCategoryPatch: OrgCategorySeed[] = [
  {
    slug: "noodles-pasta",
    parentSlug: "tea-breakfast",
    sortOrder: 2,
    translations: {
      EN: { name: "Noodles & Pasta", description: "Instant noodles, cup noodles, and quick meal packs." },
      HI: { name: "नूडल्स और पास्ता", description: "इंस्टेंट नूडल्स, कप नूडल्स और क्विक मील पैक।" },
    },
  },
  {
    slug: "coffee-mixes",
    parentSlug: "beverages",
    sortOrder: 2,
    translations: {
      EN: { name: "Coffee & Mixes", description: "Instant coffee, premix sachets, and hot beverage packs." },
      HI: { name: "कॉफी और मिक्स", description: "इंस्टेंट कॉफी, प्रीमिक्स सैशे और हॉट बेवरेज पैक।" },
    },
  },
  {
    slug: "chocolates-confectionery",
    parentSlug: "snacks",
    sortOrder: 2,
    translations: {
      EN: { name: "Chocolates & Confectionery", description: "Chocolate bars, wafer bars, and sweet treats." },
      HI: { name: "चॉकलेट और कन्फेक्शनरी", description: "चॉकलेट बार, वेफर बार और मीठे स्नैक।" },
    },
  },
  {
    slug: "sauces-spreads",
    sortOrder: 8,
    translations: {
      EN: { name: "Sauces & Spreads", description: "Ketchup, sauces, and table-use spread products." },
      HI: { name: "सॉस और स्प्रेड", description: "कैचप, सॉस और टेबल यूज़ स्प्रेड प्रोडक्ट।" },
    },
  },
  {
    slug: "baby-nutrition",
    sortOrder: 9,
    translations: {
      EN: { name: "Baby Nutrition", description: "Baby cereal, formula, and child nutrition packs." },
      HI: { name: "बेबी न्यूट्रिशन", description: "बेबी सीरियल, फॉर्मूला और बच्चों के न्यूट्रिशन पैक।" },
    },
  },
  {
    slug: "dairy-whitener",
    parentSlug: "milk-dairy",
    sortOrder: 3,
    translations: {
      EN: { name: "Dairy Whitener", description: "Tea whitener and milk powder style retail packs." },
      HI: { name: "डेयरी व्हाइटनर", description: "चाय व्हाइटनर और मिल्क पाउडर जैसे रिटेल पैक।" },
    },
  },
];

/**
 * IMPORTANT:
 * In FMCG shelves, the visible brand is often more useful than the parent company.
 * Example:
 * - ownerCompany: Nestle
 * - shelf brand: Maggi / Nescafe / KitKat
 * So Brand should usually be the shelf brand, and ownerCompany goes in metadata.
 */
export const groceryFmcgBrandPatch: OrgBrandSeed[] = [
  { slug: "parle-g", translations: { EN: "Parle-G", HI: "पारले-जी" } },
  { slug: "monaco", translations: { EN: "Monaco", HI: "मोनाको" } },
  { slug: "krackjack", translations: { EN: "KrackJack", HI: "क्रैकजैक" } },
  { slug: "good-day", translations: { EN: "Good Day", HI: "गुड डे" } },
  { slug: "marie-gold", translations: { EN: "Marie Gold", HI: "मैरी गोल्ड" } },
  { slug: "nescafe", translations: { EN: "Nescafe", HI: "नेसकैफे" } },
  { slug: "kitkat", translations: { EN: "KitKat", HI: "किटकैट" } },
  { slug: "milkybar", translations: { EN: "Milkybar", HI: "मिल्कीबार" } },
  { slug: "everyday", translations: { EN: "Everyday", HI: "एवरीडे" } },
  { slug: "cerelac", translations: { EN: "Cerelac", HI: "सेरेलैक" } },
  { slug: "lactogen", translations: { EN: "Lactogen", HI: "लैक्टोजन" } },
  { slug: "kissan", translations: { EN: "Kissan", HI: "किसान" } },
];

export const groceryFmcgProductPatch: OrgProductSeed[] = [
  {
    slug: "maggi-2-minute-noodles-masala",
    masterItemCode: "grocery_noodles",
    industryCode: "grocery",
    categorySlug: "noodles-pasta",
    brandSlug: "maggi",
    name: "2-Minute Noodles Masala",
    nameHi: "2 मिनट नूडल्स मसाला",
    description: "Classic instant masala noodles family with multiple pack sizes.",
    descriptionHi: "मल्टीपल पैक साइज़ वाला क्लासिक इंस्टेंट मसाला नूडल्स प्रोडक्ट।",
    primaryUnitCode: "pack",
    trackMethod: TrackMethod.PIECE,
    tags: ["instant-food", "noodles", "masala", "fmcg"],
    metadata: {
      ownerCompany: "Nestle India",
      manufacturerName: "Nestle India Limited",
      brandHierarchy: {
        ownerCompany: "Nestle",
        brand: "Maggi",
        subBrand: "2-Minute Noodles",
        flavourFamily: "Masala",
      },
      merchandisingType: "packaged-fmcg",
      useTrackMethodRule: "count-packs-not-grams",
    },
    variants: [
      {
        name: "70 g Pack",
        sku: "MAGGI-MASALA-70G",
        attributes: {
          sizeLabel: "70 g",
          netQuantity: 70,
          netQuantityUnit: "g",
          packType: "pouch",
          flavour: "masala",
          shelfBrand: "Maggi",
          ownerCompany: "Nestle",
        },
        costPrice: "11.50",
        sellingPrice: "14.00",
        mrp: "14.00",
        reorderLevel: "60",
        minStockLevel: "40",
        maxStockLevel: "320",
        unitCode: "pack",
        isDefault: true,
        translations: { EN: "70 g Pack", HI: "70 ग्राम पैक" },
      },
      {
        name: "140 g Pack",
        sku: "MAGGI-MASALA-140G",
        attributes: {
          sizeLabel: "140 g",
          netQuantity: 140,
          netQuantityUnit: "g",
          packType: "pouch",
          flavour: "masala",
          shelfBrand: "Maggi",
          ownerCompany: "Nestle",
        },
        costPrice: "27.00",
        sellingPrice: "32.00",
        mrp: "32.00",
        reorderLevel: "30",
        minStockLevel: "22",
        maxStockLevel: "180",
        unitCode: "pack",
        translations: { EN: "140 g Pack", HI: "140 ग्राम पैक" },
      },
      {
        name: "280 g Pack",
        sku: "MAGGI-MASALA-280G",
        attributes: {
          sizeLabel: "280 g",
          netQuantity: 280,
          netQuantityUnit: "g",
          packType: "family pack",
          flavour: "masala",
          shelfBrand: "Maggi",
          ownerCompany: "Nestle",
        },
        costPrice: "50.00",
        sellingPrice: "58.00",
        mrp: "60.00",
        reorderLevel: "20",
        minStockLevel: "14",
        maxStockLevel: "120",
        unitCode: "pack",
        translations: { EN: "280 g Pack", HI: "280 ग्राम पैक" },
      },
    ],
  },
  {
    slug: "maggi-cuppa-noodles-masala",
    industryCode: "grocery",
    categorySlug: "noodles-pasta",
    brandSlug: "maggi",
    name: "Cuppa Noodles Masala",
    nameHi: "कप्पा नूडल्स मसाला",
    description: "Ready cup noodle format for quick eating.",
    descriptionHi: "जल्दी खाने के लिए रेडी कप नूडल्स फॉर्मेट।",
    primaryUnitCode: "pack",
    trackMethod: TrackMethod.PIECE,
    tags: ["instant-food", "cup-noodles", "maggi"],
    metadata: {
      ownerCompany: "Nestle India",
      brandHierarchy: {
        ownerCompany: "Nestle",
        brand: "Maggi",
        subBrand: "Cuppa Noodles",
        flavourFamily: "Masala",
      },
      merchandisingType: "packaged-fmcg",
    },
    variants: [
      {
        name: "70 g Cup",
        sku: "MAGGI-CUP-MASALA-70G",
        attributes: {
          sizeLabel: "70 g",
          netQuantity: 70,
          netQuantityUnit: "g",
          packType: "cup",
          flavour: "masala",
        },
        costPrice: "28.00",
        sellingPrice: "35.00",
        mrp: "35.00",
        reorderLevel: "18",
        minStockLevel: "12",
        maxStockLevel: "90",
        unitCode: "pack",
        isDefault: true,
        translations: { EN: "70 g Cup", HI: "70 ग्राम कप" },
      },
      {
        name: "4 Cup Combo",
        sku: "MAGGI-CUP-COMBO-4",
        attributes: {
          comboCount: 4,
          netQuantityEach: 70,
          netQuantityUnit: "g",
          packType: "combo-pack",
          flavour: "masala",
        },
        costPrice: "108.00",
        sellingPrice: "132.00",
        mrp: "140.00",
        reorderLevel: "8",
        minStockLevel: "6",
        maxStockLevel: "40",
        unitCode: "pack",
        translations: { EN: "4 Cup Combo", HI: "4 कप कॉम्बो" },
      },
    ],
  },
  {
    slug: "kissan-fresh-tomato-ketchup",
    industryCode: "grocery",
    categorySlug: "sauces-spreads",
    brandSlug: "kissan",
    name: "Fresh Tomato Ketchup",
    nameHi: "फ्रेश टोमैटो कैचप",
    description: "Table-use tomato ketchup in squeeze and family packs.",
    descriptionHi: "स्क्वीज़ और फैमिली पैक में टेबल यूज़ टोमैटो कैचप।",
    primaryUnitCode: "pack",
    trackMethod: TrackMethod.PIECE,
    tags: ["ketchup", "sauce", "table-use"],
    metadata: {
      ownerCompany: "Hindustan Unilever",
      brandHierarchy: {
        ownerCompany: "HUL",
        brand: "Kissan",
        subBrand: "Fresh Tomato Ketchup",
      },
      merchandisingType: "packaged-fmcg",
    },
    variants: [
      {
        name: "500 g Pouch",
        sku: "KISSAN-KETCHUP-500G",
        attributes: {
          sizeLabel: "500 g",
          netQuantity: 500,
          netQuantityUnit: "g",
          packType: "pouch",
          flavour: "tomato",
        },
        costPrice: "52.00",
        sellingPrice: "65.00",
        mrp: "70.00",
        reorderLevel: "20",
        minStockLevel: "15",
        maxStockLevel: "110",
        unitCode: "pack",
        isDefault: true,
        translations: { EN: "500 g Pouch", HI: "500 ग्राम पाउच" },
      },
      {
        name: "950 g Bottle",
        sku: "KISSAN-KETCHUP-950G",
        attributes: {
          sizeLabel: "950 g",
          netQuantity: 950,
          netQuantityUnit: "g",
          packType: "bottle",
          flavour: "tomato",
        },
        costPrice: "92.00",
        sellingPrice: "115.00",
        mrp: "120.00",
        reorderLevel: "12",
        minStockLevel: "8",
        maxStockLevel: "70",
        unitCode: "pack",
        translations: { EN: "950 g Bottle", HI: "950 ग्राम बोतल" },
      },
    ],
  },
  {
    slug: "nescafe-classic-coffee",
    industryCode: "grocery",
    categorySlug: "coffee-mixes",
    brandSlug: "nescafe",
    name: "Classic Coffee",
    nameHi: "क्लासिक कॉफी",
    description: "Instant coffee line with jar and refill formats.",
    descriptionHi: "जार और रिफिल फॉर्मेट वाली इंस्टेंट कॉफी लाइन।",
    primaryUnitCode: "pack",
    trackMethod: TrackMethod.PIECE,
    tags: ["coffee", "instant-coffee", "hot-beverage"],
    metadata: {
      ownerCompany: "Nestle India",
      brandHierarchy: {
        ownerCompany: "Nestle",
        brand: "Nescafe",
        subBrand: "Classic",
      },
      merchandisingType: "packaged-fmcg",
    },
    variants: [
      {
        name: "50 g Jar",
        sku: "NESCAFE-CLASSIC-50G",
        attributes: {
          sizeLabel: "50 g",
          netQuantity: 50,
          netQuantityUnit: "g",
          packType: "jar",
          roastType: "classic",
        },
        costPrice: "138.00",
        sellingPrice: "155.00",
        mrp: "160.00",
        reorderLevel: "10",
        minStockLevel: "8",
        maxStockLevel: "50",
        unitCode: "pack",
        isDefault: true,
        translations: { EN: "50 g Jar", HI: "50 ग्राम जार" },
      },
      {
        name: "100 g Jar",
        sku: "NESCAFE-CLASSIC-100G",
        attributes: {
          sizeLabel: "100 g",
          netQuantity: 100,
          netQuantityUnit: "g",
          packType: "jar",
          roastType: "classic",
        },
        costPrice: "275.00",
        sellingPrice: "310.00",
        mrp: "320.00",
        reorderLevel: "8",
        minStockLevel: "6",
        maxStockLevel: "40",
        unitCode: "pack",
        translations: { EN: "100 g Jar", HI: "100 ग्राम जार" },
      },
      {
        name: "200 g Refill",
        sku: "NESCAFE-CLASSIC-200G",
        attributes: {
          sizeLabel: "200 g",
          netQuantity: 200,
          netQuantityUnit: "g",
          packType: "refill-pack",
          roastType: "classic",
        },
        costPrice: "520.00",
        sellingPrice: "575.00",
        mrp: "590.00",
        reorderLevel: "5",
        minStockLevel: "4",
        maxStockLevel: "24",
        unitCode: "pack",
        translations: { EN: "200 g Refill", HI: "200 ग्राम रिफिल" },
      },
    ],
  },
  {
    slug: "nescafe-sunrise-coffee",
    industryCode: "grocery",
    categorySlug: "coffee-mixes",
    brandSlug: "nescafe",
    name: "Sunrise Coffee",
    nameHi: "सनराइज़ कॉफी",
    description: "Chicory blend instant coffee line.",
    descriptionHi: "चिकोरी ब्लेंड वाली इंस्टेंट कॉफी लाइन।",
    primaryUnitCode: "pack",
    trackMethod: TrackMethod.PIECE,
    tags: ["coffee", "instant-coffee", "chicory"],
    metadata: {
      ownerCompany: "Nestle India",
      brandHierarchy: {
        ownerCompany: "Nestle",
        brand: "Nescafe",
        subBrand: "Sunrise",
      },
      merchandisingType: "packaged-fmcg",
    },
    variants: [
      {
        name: "45 g Jar",
        sku: "NESCAFE-SUNRISE-45G",
        attributes: {
          sizeLabel: "45 g",
          netQuantity: 45,
          netQuantityUnit: "g",
          packType: "jar",
          blendType: "coffee-chicory",
        },
        costPrice: "108.00",
        sellingPrice: "125.00",
        mrp: "130.00",
        reorderLevel: "8",
        minStockLevel: "6",
        maxStockLevel: "40",
        unitCode: "pack",
        isDefault: true,
        translations: { EN: "45 g Jar", HI: "45 ग्राम जार" },
      },
      {
        name: "100 g Jar",
        sku: "NESCAFE-SUNRISE-100G",
        attributes: {
          sizeLabel: "100 g",
          netQuantity: 100,
          netQuantityUnit: "g",
          packType: "jar",
          blendType: "coffee-chicory",
        },
        costPrice: "238.00",
        sellingPrice: "270.00",
        mrp: "278.00",
        reorderLevel: "6",
        minStockLevel: "4",
        maxStockLevel: "32",
        unitCode: "pack",
        translations: { EN: "100 g Jar", HI: "100 ग्राम जार" },
      },
    ],
  },
  {
    slug: "kitkat-4-finger-wafer-bar",
    industryCode: "grocery",
    categorySlug: "chocolates-confectionery",
    brandSlug: "kitkat",
    name: "4 Finger Wafer Bar",
    nameHi: "4 फिंगर वेफर बार",
    description: "Crispy wafer bar with chocolate coating.",
    descriptionHi: "चॉकलेट कोटिंग वाला क्रिस्पी वेफर बार।",
    primaryUnitCode: "pack",
    trackMethod: TrackMethod.PIECE,
    tags: ["chocolate", "wafer", "snack"],
    metadata: {
      ownerCompany: "Nestle India",
      brandHierarchy: {
        ownerCompany: "Nestle",
        brand: "KitKat",
        subBrand: "4 Finger",
      },
      merchandisingType: "packaged-fmcg",
    },
    variants: [
      {
        name: "37.3 g Bar",
        sku: "KITKAT-4F-37G",
        attributes: {
          sizeLabel: "37.3 g",
          netQuantity: 37.3,
          netQuantityUnit: "g",
          packType: "bar",
        },
        costPrice: "16.00",
        sellingPrice: "20.00",
        mrp: "20.00",
        reorderLevel: "50",
        minStockLevel: "35",
        maxStockLevel: "250",
        unitCode: "pack",
        isDefault: true,
        translations: { EN: "37.3 g Bar", HI: "37.3 ग्राम बार" },
      },
      {
        name: "72 g Share Pack",
        sku: "KITKAT-4F-72G",
        attributes: {
          sizeLabel: "72 g",
          netQuantity: 72,
          netQuantityUnit: "g",
          packType: "share-pack",
        },
        costPrice: "32.00",
        sellingPrice: "40.00",
        mrp: "45.00",
        reorderLevel: "20",
        minStockLevel: "14",
        maxStockLevel: "120",
        unitCode: "pack",
        translations: { EN: "72 g Share Pack", HI: "72 ग्राम शेयर पैक" },
      },
    ],
  },
  {
    slug: "milkybar-white-chocolate",
    industryCode: "grocery",
    categorySlug: "chocolates-confectionery",
    brandSlug: "milkybar",
    name: "White Chocolate",
    nameHi: "व्हाइट चॉकलेट",
    description: "White chocolate bar for impulse retail shelf.",
    descriptionHi: "इम्पल्स रिटेल शेल्फ के लिए व्हाइट चॉकलेट बार।",
    primaryUnitCode: "pack",
    trackMethod: TrackMethod.PIECE,
    tags: ["chocolate", "white-chocolate"],
    metadata: {
      ownerCompany: "Nestle India",
      brandHierarchy: {
        ownerCompany: "Nestle",
        brand: "Milkybar",
      },
      merchandisingType: "packaged-fmcg",
    },
    variants: [
      {
        name: "50 g Bar",
        sku: "MILKYBAR-50G",
        attributes: {
          sizeLabel: "50 g",
          netQuantity: 50,
          netQuantityUnit: "g",
          packType: "bar",
        },
        costPrice: "18.00",
        sellingPrice: "22.00",
        mrp: "25.00",
        reorderLevel: "24",
        minStockLevel: "16",
        maxStockLevel: "120",
        unitCode: "pack",
        isDefault: true,
        translations: { EN: "50 g Bar", HI: "50 ग्राम बार" },
      },
      {
        name: "100 g Bar",
        sku: "MILKYBAR-100G",
        attributes: {
          sizeLabel: "100 g",
          netQuantity: 100,
          netQuantityUnit: "g",
          packType: "bar",
        },
        costPrice: "36.00",
        sellingPrice: "44.00",
        mrp: "50.00",
        reorderLevel: "14",
        minStockLevel: "10",
        maxStockLevel: "80",
        unitCode: "pack",
        translations: { EN: "100 g Bar", HI: "100 ग्राम बार" },
      },
    ],
  },
  {
    slug: "everyday-dairy-whitener",
    industryCode: "grocery",
    categorySlug: "dairy-whitener",
    brandSlug: "everyday",
    name: "Dairy Whitener",
    nameHi: "डेयरी व्हाइटनर",
    description: "Tea whitener sold in refill and economy packs.",
    descriptionHi: "रिफिल और इकॉनमी पैक में बिकने वाला चाय व्हाइटनर।",
    primaryUnitCode: "pack",
    trackMethod: TrackMethod.PIECE,
    tags: ["tea-whitener", "dairy", "powder"],
    metadata: {
      ownerCompany: "Nestle India",
      brandHierarchy: {
        ownerCompany: "Nestle",
        brand: "Everyday",
      },
      merchandisingType: "packaged-fmcg",
    },
    variants: [
      {
        name: "200 g Refill",
        sku: "EVERYDAY-200G",
        attributes: {
          sizeLabel: "200 g",
          netQuantity: 200,
          netQuantityUnit: "g",
          packType: "refill-pack",
        },
        costPrice: "82.00",
        sellingPrice: "95.00",
        mrp: "98.00",
        reorderLevel: "16",
        minStockLevel: "12",
        maxStockLevel: "90",
        unitCode: "pack",
        isDefault: true,
        translations: { EN: "200 g Refill", HI: "200 ग्राम रिफिल" },
      },
      {
        name: "400 g Refill",
        sku: "EVERYDAY-400G",
        attributes: {
          sizeLabel: "400 g",
          netQuantity: 400,
          netQuantityUnit: "g",
          packType: "refill-pack",
        },
        costPrice: "158.00",
        sellingPrice: "182.00",
        mrp: "188.00",
        reorderLevel: "10",
        minStockLevel: "8",
        maxStockLevel: "60",
        unitCode: "pack",
        translations: { EN: "400 g Refill", HI: "400 ग्राम रिफिल" },
      },
      {
        name: "1 kg Economy Pack",
        sku: "EVERYDAY-1KG",
        attributes: {
          sizeLabel: "1 kg",
          netQuantity: 1,
          netQuantityUnit: "kg",
          packType: "economy-pack",
        },
        costPrice: "372.00",
        sellingPrice: "420.00",
        mrp: "435.00",
        reorderLevel: "6",
        minStockLevel: "4",
        maxStockLevel: "24",
        unitCode: "pack",
        translations: { EN: "1 kg Economy Pack", HI: "1 किलो इकॉनमी पैक" },
      },
    ],
  },
  {
    slug: "cerelac-wheat-apple-baby-cereal",
    industryCode: "grocery",
    categorySlug: "baby-nutrition",
    brandSlug: "cerelac",
    name: "Wheat Apple Baby Cereal",
    nameHi: "व्हीट एप्पल बेबी सीरियल",
    description: "Baby cereal product family for infants and toddlers.",
    descriptionHi: "शिशुओं और टॉडलर्स के लिए बेबी सीरियल प्रोडक्ट फैमिली।",
    primaryUnitCode: "pack",
    trackMethod: TrackMethod.PIECE,
    tags: ["baby-food", "cereal", "nutrition"],
    metadata: {
      ownerCompany: "Nestle India",
      brandHierarchy: {
        ownerCompany: "Nestle",
        brand: "Cerelac",
        subBrand: "Wheat Apple",
      },
      merchandisingType: "packaged-fmcg",
      ageGroup: "6+ months",
    },
    variants: [
      {
        name: "300 g Pack",
        sku: "CERELAC-WA-300G",
        attributes: {
          sizeLabel: "300 g",
          netQuantity: 300,
          netQuantityUnit: "g",
          packType: "box",
          ageGroup: "6+ months",
        },
        costPrice: "188.00",
        sellingPrice: "215.00",
        mrp: "220.00",
        reorderLevel: "8",
        minStockLevel: "6",
        maxStockLevel: "36",
        unitCode: "pack",
        isDefault: true,
        translations: { EN: "300 g Pack", HI: "300 ग्राम पैक" },
      },
    ],
  },
  {
    slug: "lactogen-stage-1-infant-formula",
    industryCode: "grocery",
    categorySlug: "baby-nutrition",
    brandSlug: "lactogen",
    name: "Stage 1 Infant Formula",
    nameHi: "स्टेज 1 इन्फेंट फॉर्मूला",
    description: "Infant milk formula powder for early months.",
    descriptionHi: "शुरुआती महीनों के लिए इन्फेंट मिल्क फॉर्मूला पाउडर।",
    primaryUnitCode: "pack",
    trackMethod: TrackMethod.PIECE,
    tags: ["baby-food", "formula", "nutrition"],
    metadata: {
      ownerCompany: "Nestle India",
      brandHierarchy: {
        ownerCompany: "Nestle",
        brand: "Lactogen",
        subBrand: "Stage 1",
      },
      merchandisingType: "packaged-fmcg",
      ageGroup: "0-6 months",
    },
    variants: [
      {
        name: "400 g Tin",
        sku: "LACTOGEN-S1-400G",
        attributes: {
          sizeLabel: "400 g",
          netQuantity: 400,
          netQuantityUnit: "g",
          packType: "tin",
          ageGroup: "0-6 months",
        },
        costPrice: "348.00",
        sellingPrice: "395.00",
        mrp: "410.00",
        reorderLevel: "6",
        minStockLevel: "4",
        maxStockLevel: "28",
        unitCode: "pack",
        isDefault: true,
        translations: { EN: "400 g Tin", HI: "400 ग्राम टिन" },
      },
    ],
  },
  {
    slug: "parle-g-gluco-biscuits",
    masterItemCode: "grocery_biscuits",
    industryCode: "grocery",
    categorySlug: "biscuits",
    brandSlug: "parle-g",
    name: "Gluco Biscuits",
    nameHi: "ग्लूको बिस्किट",
    description: "Core glucose biscuit line sold under the Parle-G shelf brand.",
    descriptionHi: "पारले-जी ब्रांड के तहत बिकने वाली मुख्य ग्लूको बिस्किट लाइन।",
    primaryUnitCode: "pack",
    trackMethod: TrackMethod.PIECE,
    tags: ["biscuits", "glucose", "tea-time"],
    metadata: {
      ownerCompany: "Parle Products",
      brandHierarchy: {
        ownerCompany: "Parle",
        brand: "Parle-G",
        subBrand: "Gluco Biscuits",
      },
      merchandisingType: "packaged-fmcg",
    },
    variants: [
      {
        name: "79.9 g Pack",
        sku: "PARLEG-79G",
        attributes: {
          sizeLabel: "79.9 g",
          netQuantity: 79.9,
          netQuantityUnit: "g",
          packType: "pouch",
        },
        costPrice: "8.50",
        sellingPrice: "10.00",
        mrp: "10.00",
        reorderLevel: "50",
        minStockLevel: "35",
        maxStockLevel: "260",
        unitCode: "pack",
        isDefault: true,
        translations: { EN: "79.9 g Pack", HI: "79.9 ग्राम पैक" },
      },
      {
        name: "143 g Family Pack",
        sku: "PARLEG-143G",
        attributes: {
          sizeLabel: "143 g",
          netQuantity: 143,
          netQuantityUnit: "g",
          packType: "family-pack",
        },
        costPrice: "18.00",
        sellingPrice: "22.00",
        mrp: "22.00",
        reorderLevel: "26",
        minStockLevel: "20",
        maxStockLevel: "180",
        unitCode: "pack",
        translations: { EN: "143 g Family Pack", HI: "143 ग्राम फैमिली पैक" },
      },
    ],
  },
  {
    slug: "monaco-classic-salted-biscuits",
    industryCode: "grocery",
    categorySlug: "biscuits",
    brandSlug: "monaco",
    name: "Classic Salted Biscuits",
    nameHi: "क्लासिक साल्टेड बिस्किट",
    description: "Salted tea-time cracker style biscuits.",
    descriptionHi: "नमकीन चाय-समय क्रैकर स्टाइल बिस्किट।",
    primaryUnitCode: "pack",
    trackMethod: TrackMethod.PIECE,
    tags: ["biscuits", "salted", "cracker"],
    metadata: {
      ownerCompany: "Parle Products",
      brandHierarchy: {
        ownerCompany: "Parle",
        brand: "Monaco",
      },
      merchandisingType: "packaged-fmcg",
    },
    variants: [
      {
        name: "75 g Pack",
        sku: "MONACO-75G",
        attributes: {
          sizeLabel: "75 g",
          netQuantity: 75,
          netQuantityUnit: "g",
          packType: "pack",
        },
        costPrice: "9.00",
        sellingPrice: "10.00",
        mrp: "10.00",
        reorderLevel: "34",
        minStockLevel: "24",
        maxStockLevel: "180",
        unitCode: "pack",
        isDefault: true,
        translations: { EN: "75 g Pack", HI: "75 ग्राम पैक" },
      },
      {
        name: "200 g Pack",
        sku: "MONACO-200G",
        attributes: {
          sizeLabel: "200 g",
          netQuantity: 200,
          netQuantityUnit: "g",
          packType: "family-pack",
        },
        costPrice: "24.00",
        sellingPrice: "28.00",
        mrp: "30.00",
        reorderLevel: "18",
        minStockLevel: "12",
        maxStockLevel: "90",
        unitCode: "pack",
        translations: { EN: "200 g Pack", HI: "200 ग्राम पैक" },
      },
    ],
  },
  {
    slug: "krackjack-sweet-salty-biscuits",
    industryCode: "grocery",
    categorySlug: "biscuits",
    brandSlug: "krackjack",
    name: "Sweet & Salty Biscuits",
    nameHi: "स्वीट और साल्टी बिस्किट",
    description: "Sweet-salty biscuit line for daily snacking.",
    descriptionHi: "रोज़ के स्नैक के लिए स्वीट-साल्टी बिस्किट लाइन।",
    primaryUnitCode: "pack",
    trackMethod: TrackMethod.PIECE,
    tags: ["biscuits", "sweet-salty", "tea-time"],
    metadata: {
      ownerCompany: "Parle Products",
      brandHierarchy: {
        ownerCompany: "Parle",
        brand: "KrackJack",
      },
      merchandisingType: "packaged-fmcg",
    },
    variants: [
      {
        name: "60 g Pack",
        sku: "KRACKJACK-60G",
        attributes: {
          sizeLabel: "60 g",
          netQuantity: 60,
          netQuantityUnit: "g",
          packType: "pack",
        },
        costPrice: "9.00",
        sellingPrice: "10.00",
        mrp: "10.00",
        reorderLevel: "34",
        minStockLevel: "24",
        maxStockLevel: "180",
        unitCode: "pack",
        isDefault: true,
        translations: { EN: "60 g Pack", HI: "60 ग्राम पैक" },
      },
      {
        name: "200 g Pack",
        sku: "KRACKJACK-200G",
        attributes: {
          sizeLabel: "200 g",
          netQuantity: 200,
          netQuantityUnit: "g",
          packType: "family-pack",
        },
        costPrice: "24.00",
        sellingPrice: "28.00",
        mrp: "30.00",
        reorderLevel: "18",
        minStockLevel: "12",
        maxStockLevel: "90",
        unitCode: "pack",
        translations: { EN: "200 g Pack", HI: "200 ग्राम पैक" },
      },
    ],
  },
  {
    slug: "good-day-cashew-cookies",
    industryCode: "grocery",
    categorySlug: "biscuits",
    brandSlug: "good-day",
    name: "Cashew Cookies",
    nameHi: "काजू कुकीज़",
    description: "Premium cookie line under the Good Day shelf brand.",
    descriptionHi: "गुड डे ब्रांड के तहत प्रीमियम कुकी लाइन।",
    primaryUnitCode: "pack",
    trackMethod: TrackMethod.PIECE,
    tags: ["biscuits", "cookies", "premium"],
    metadata: {
      ownerCompany: "Britannia",
      brandHierarchy: {
        ownerCompany: "Britannia",
        brand: "Good Day",
        variantFamily: "Cashew",
      },
      merchandisingType: "packaged-fmcg",
    },
    variants: [
      {
        name: "100 g Pack",
        sku: "GOODDAY-CASHEW-100G",
        attributes: {
          sizeLabel: "100 g",
          netQuantity: 100,
          netQuantityUnit: "g",
          packType: "pack",
        },
        costPrice: "26.00",
        sellingPrice: "30.00",
        mrp: "30.00",
        reorderLevel: "24",
        minStockLevel: "18",
        maxStockLevel: "120",
        unitCode: "pack",
        isDefault: true,
        translations: { EN: "100 g Pack", HI: "100 ग्राम पैक" },
      },
      {
        name: "200 g Family Pack",
        sku: "GOODDAY-CASHEW-200G",
        attributes: {
          sizeLabel: "200 g",
          netQuantity: 200,
          netQuantityUnit: "g",
          packType: "family-pack",
        },
        costPrice: "50.00",
        sellingPrice: "58.00",
        mrp: "60.00",
        reorderLevel: "14",
        minStockLevel: "10",
        maxStockLevel: "70",
        unitCode: "pack",
        translations: { EN: "200 g Family Pack", HI: "200 ग्राम फैमिली पैक" },
      },
    ],
  },
  {
    slug: "marie-gold-biscuits",
    industryCode: "grocery",
    categorySlug: "biscuits",
    brandSlug: "marie-gold",
    name: "Marie Biscuits",
    nameHi: "मैरी बिस्किट",
    description: "Light tea-time biscuit line under the Marie Gold shelf brand.",
    descriptionHi: "मैरी गोल्ड ब्रांड के तहत हल्की चाय-समय बिस्किट लाइन।",
    primaryUnitCode: "pack",
    trackMethod: TrackMethod.PIECE,
    tags: ["biscuits", "tea-time", "marie"],
    metadata: {
      ownerCompany: "Britannia",
      brandHierarchy: {
        ownerCompany: "Britannia",
        brand: "Marie Gold",
      },
      merchandisingType: "packaged-fmcg",
    },
    variants: [
      {
        name: "70 g Pack",
        sku: "MARIEGOLD-70G",
        attributes: {
          sizeLabel: "70 g",
          netQuantity: 70,
          netQuantityUnit: "g",
          packType: "pack",
        },
        costPrice: "9.00",
        sellingPrice: "10.00",
        mrp: "10.00",
        reorderLevel: "28",
        minStockLevel: "20",
        maxStockLevel: "150",
        unitCode: "pack",
        isDefault: true,
        translations: { EN: "70 g Pack", HI: "70 ग्राम पैक" },
      },
      {
        name: "150 g Pack",
        sku: "MARIEGOLD-150G",
        attributes: {
          sizeLabel: "150 g",
          netQuantity: 150,
          netQuantityUnit: "g",
          packType: "family-pack",
        },
        costPrice: "18.00",
        sellingPrice: "22.00",
        mrp: "22.00",
        reorderLevel: "18",
        minStockLevel: "12",
        maxStockLevel: "90",
        unitCode: "pack",
        translations: { EN: "150 g Pack", HI: "150 ग्राम पैक" },
      },
    ],
  },
];

/**
 * Suggested edits inside your existing master catalog definitions in seed.ts:
 *
 * 1. Make master item names generic, not brand-locked.
 *    Bad:  grocery_biscuits -> "Parle-G Gluco Biscuits"
 *    Good: grocery_biscuits -> "Glucose Biscuits"
 *
 * 2. Avoid putting one fixed brand into reusable master catalog items unless that industry truly has only one practical default.
 *
 * 3. Keep ownerCompany / subBrand / flavourFamily inside product metadata until you really need normalized reporting tables.
 */
export const suggestedMasterCatalogRenames = [
  {
    code: "grocery_biscuits",
    currentName: "Parle-G Gluco Biscuits",
    suggestedName: "Glucose Biscuits",
    reason: "Master catalog should stay generic and reusable across brands.",
  },
  {
    code: "grocery_noodles",
    currentName: "Instant Noodles",
    suggestedName: "Instant Noodles",
    reason: "Already generic. Keep as template and push flavour + pack size into product/variant data.",
  },
  {
    code: "grocery_tea",
    currentName: "Tea",
    suggestedName: "Packaged Tea",
    reason: "Helps separate pack-count tea from loose-weight tea if both exist later.",
  },
];
