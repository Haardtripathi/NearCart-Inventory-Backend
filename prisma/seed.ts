import "dotenv/config";
import bcrypt from "bcrypt";
import { AuditAction, BatchStatus, BranchType, LanguageCode, MembershipStatus, OrderSource, PaymentStatus, Prisma, PrismaClient, ProductSourceType, ProductStatus, ProductType, PurchaseReceiptStatus, ReferenceType, SalesOrderStatus, StockMovementType, StockTransferStatus, TrackMethod, UserRole } from "@prisma/client";

import { buildMasterItemSearchText, normalizeMasterCatalogAliasValues } from "../src/utils/masterCatalog";
import { slugify } from "../src/utils/slug";

const prisma = new PrismaClient();

const seedSuperAdminConfig = {
  email: (process.env.SEED_SUPER_ADMIN_EMAIL ?? "superadmin@nearcart.local").trim().toLowerCase(),
  fullName: (process.env.SEED_SUPER_ADMIN_FULL_NAME ?? "NearCart Platform Admin").trim(),
  password: (process.env.SEED_SUPER_ADMIN_PASSWORD ?? "StrongPassword123").trim(),
};

type TranslationTriple = {
  EN: string;
  HI: string;
  GU: string;
};

type TranslationWithDescriptionTriple = {
  EN: { name: string; description?: string };
  HI: { name: string; description?: string };
  GU: { name: string; description?: string };
};

type VariantSeed = {
  code: string;
  name: string;
  skuSuffix?: string;
  unitCode?: string;
  isDefault?: boolean;
  translations?: TranslationTriple;
};

type MasterItemSeed = {
  code: string;
  categoryCode: string;
  canonicalName: string;
  canonicalDescription?: string;
  translations: TranslationWithDescriptionTriple;
  aliases?: Array<{
    language: LanguageCode;
    value: string;
  }>;
  productType?: ProductType;
  defaultTrackMethod?: TrackMethod;
  defaultUnitCode?: string;
  defaultBrandName?: string;
  defaultTaxCode?: string;
  hasVariants?: boolean;
  trackInventory?: boolean;
  allowBackorder?: boolean;
  allowNegativeStock?: boolean;
  defaultImageUrl?: string;
  tags?: string[];
  variantTemplates?: VariantSeed[];
};

type CategorySeed = {
  code: string;
  translations: TranslationWithDescriptionTriple;
  sortOrder: number;
};

type IndustrySeed = {
  code: string;
  canonicalName: string;
  canonicalDescription: string;
  translations: TranslationWithDescriptionTriple;
  defaultFeatures: Record<string, unknown>;
  categories: CategorySeed[];
  items: MasterItemSeed[];
};

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

function names(EN: string, HI: string, GU: string): TranslationTriple {
  return { EN, HI, GU };
}

function withDescriptions(
  nameValues: TranslationTriple,
  descriptions?: Partial<Record<LanguageCode, string>>,
): TranslationWithDescriptionTriple {
  return {
    EN: { name: nameValues.EN, description: descriptions?.EN },
    HI: { name: nameValues.HI, description: descriptions?.HI },
    GU: { name: nameValues.GU, description: descriptions?.GU },
  };
}

function sizeVariants(): VariantSeed[] {
  return [
    {
      code: "SMALL",
      name: "Small",
      skuSuffix: "S",
      unitCode: "pcs",
      isDefault: true,
      translations: names("Small", "छोटा", "નાનું"),
    },
    {
      code: "MEDIUM",
      name: "Medium",
      skuSuffix: "M",
      unitCode: "pcs",
      translations: names("Medium", "मध्यम", "મધ્યમ"),
    },
    {
      code: "LARGE",
      name: "Large",
      skuSuffix: "L",
      unitCode: "pcs",
      translations: names("Large", "बड़ा", "મોટું"),
    },
  ];
}

function mirroredTranslations(name: string, description?: string): TranslationWithDescriptionTriple {
  return withDescriptions(
    names(name, name, name),
    description
      ? {
          EN: description,
          HI: description,
          GU: description,
        }
      : undefined,
  );
}

interface GeneratedCategorySpec {
  code: string;
  name: string;
}

interface GeneratedItemSpec {
  code: string;
  categoryCode: string;
  name: string;
  description: string;
  unitCode?: string;
  trackMethod?: TrackMethod;
  hasVariants?: boolean;
  variantTemplates?: VariantSeed[];
}

interface GeneratedIndustrySpec {
  code: string;
  name: string;
  description: string;
  categories: GeneratedCategorySpec[];
  items: GeneratedItemSpec[];
  defaultFeatures?: Record<string, unknown>;
}

const generatedIndustryFeatureSet = {
  supportsVariants: true,
  supportsExpiry: false,
  supportsBatchTracking: false,
  supportsSerialTracking: false,
  supportsWeightBasedStock: true,
  supportsTransfers: true,
  supportsPurchaseReceipts: true,
  supportsSalesOrders: true,
  supportsTaxRates: true,
};

function buildGeneratedIndustry(spec: GeneratedIndustrySpec): IndustrySeed {
  return {
    code: spec.code,
    canonicalName: spec.name,
    canonicalDescription: spec.description,
    translations: mirroredTranslations(spec.name, spec.description),
    defaultFeatures: spec.defaultFeatures ?? generatedIndustryFeatureSet,
    categories: spec.categories.map((category, index) => ({
      code: category.code,
      sortOrder: index + 1,
      translations: mirroredTranslations(category.name),
    })),
    items: spec.items.map((item) => ({
      code: `${spec.code}_${item.code}`,
      categoryCode: item.categoryCode,
      canonicalName: item.name,
      canonicalDescription: item.description,
      translations: mirroredTranslations(item.name, item.description),
      defaultUnitCode: item.unitCode ?? "pcs",
      defaultTrackMethod: item.trackMethod ?? TrackMethod.PIECE,
      hasVariants: item.hasVariants,
      variantTemplates: item.variantTemplates,
    })),
  };
}

const generatedIndustries: IndustrySeed[] = [
  buildGeneratedIndustry({
    code: "stationery",
    name: "Stationery",
    description: "Stationery inventory for notebooks, desk tools, and school essentials.",
    categories: [
      { code: "notebooks", name: "Notebooks" },
      { code: "writing_tools", name: "Writing Tools" },
      { code: "art_supply", name: "Art Supply" },
      { code: "desk_accessories", name: "Desk Accessories" },
    ],
    items: [
      { code: "spiral_notebook", categoryCode: "notebooks", name: "Spiral Notebook", description: "A4 spiral notebook for school and office use." },
      { code: "daily_planner", categoryCode: "notebooks", name: "Daily Planner", description: "Undated daily planner for task tracking." },
      { code: "ball_pen", categoryCode: "writing_tools", name: "Ball Pen", description: "Smooth-writing ball pen for everyday use." },
      { code: "marker_set", categoryCode: "art_supply", name: "Marker Set", description: "Color marker set for charts and sketching.", unitCode: "box" },
      { code: "stapler", categoryCode: "desk_accessories", name: "Stapler", description: "Compact stapler for office desks." },
    ],
  }),
  buildGeneratedIndustry({
    code: "beauty",
    name: "Beauty",
    description: "Beauty and personal grooming inventory for salons and retail counters.",
    categories: [
      { code: "skin_care", name: "Skin Care" },
      { code: "hair_care", name: "Hair Care" },
      { code: "makeup", name: "Makeup" },
      { code: "fragrance", name: "Fragrance" },
    ],
    items: [
      { code: "face_wash", categoryCode: "skin_care", name: "Face Wash", description: "Daily face wash suitable for normal skin.", unitCode: "pack" },
      { code: "shampoo", categoryCode: "hair_care", name: "Shampoo", description: "Salon and home-use shampoo bottles.", unitCode: "pack" },
      { code: "conditioner", categoryCode: "hair_care", name: "Conditioner", description: "Hair conditioner for smooth finishing.", unitCode: "pack" },
      { code: "lipstick", categoryCode: "makeup", name: "Lipstick", description: "Retail lipstick units for beauty counters." },
      { code: "perfume", categoryCode: "fragrance", name: "Perfume", description: "Fragrance bottles for gifting and personal use." },
    ],
  }),
  buildGeneratedIndustry({
    code: "auto_parts",
    name: "Auto Parts",
    description: "Auto spares inventory for service shops and parts counters.",
    categories: [
      { code: "lubricants", name: "Lubricants" },
      { code: "batteries", name: "Batteries" },
      { code: "filters", name: "Filters" },
      { code: "accessories", name: "Accessories" },
    ],
    items: [
      { code: "engine_oil", categoryCode: "lubricants", name: "Engine Oil", description: "Engine oil cans for scheduled maintenance.", unitCode: "l", trackMethod: TrackMethod.VOLUME },
      { code: "car_battery", categoryCode: "batteries", name: "Car Battery", description: "Automotive battery for replacement service." },
      { code: "air_filter", categoryCode: "filters", name: "Air Filter", description: "Vehicle air filter for engine intake." },
      { code: "spark_plug", categoryCode: "filters", name: "Spark Plug", description: "Spark plug units for ignition systems." },
      { code: "floor_mat", categoryCode: "accessories", name: "Floor Mat", description: "Car floor mat set for retail accessory sales.", unitCode: "pack" },
    ],
  }),
  buildGeneratedIndustry({
    code: "pet_care",
    name: "Pet Care",
    description: "Pet care inventory for food, hygiene, and accessories.",
    categories: [
      { code: "food", name: "Food" },
      { code: "grooming", name: "Grooming" },
      { code: "litter", name: "Litter" },
      { code: "accessories", name: "Accessories" },
    ],
    items: [
      { code: "dog_food", categoryCode: "food", name: "Dog Food", description: "Dry dog food bags for daily feeding.", unitCode: "kg", trackMethod: TrackMethod.WEIGHT },
      { code: "cat_food", categoryCode: "food", name: "Cat Food", description: "Cat food packs for retail pet stores.", unitCode: "kg", trackMethod: TrackMethod.WEIGHT },
      { code: "pet_shampoo", categoryCode: "grooming", name: "Pet Shampoo", description: "Pet-safe shampoo bottles for grooming.", unitCode: "pack" },
      { code: "litter_bag", categoryCode: "litter", name: "Litter Bag", description: "Cat litter refill bags.", unitCode: "kg", trackMethod: TrackMethod.WEIGHT },
      { code: "pet_collar", categoryCode: "accessories", name: "Pet Collar", description: "Adjustable pet collars in multiple sizes.", hasVariants: true, variantTemplates: sizeVariants() },
    ],
  }),
  buildGeneratedIndustry({
    code: "baby_care",
    name: "Baby Care",
    description: "Baby care inventory for feeding, hygiene, and nursery essentials.",
    categories: [
      { code: "feeding", name: "Feeding" },
      { code: "hygiene", name: "Hygiene" },
      { code: "apparel", name: "Apparel" },
      { code: "nursery", name: "Nursery" },
    ],
    items: [
      { code: "baby_diapers", categoryCode: "hygiene", name: "Baby Diapers", description: "Disposable baby diaper packs.", unitCode: "pack" },
      { code: "feeding_bottle", categoryCode: "feeding", name: "Feeding Bottle", description: "Baby feeding bottles for newborn care." },
      { code: "baby_wipes", categoryCode: "hygiene", name: "Baby Wipes", description: "Soft wipes packs for baby hygiene.", unitCode: "pack" },
      { code: "baby_lotion", categoryCode: "hygiene", name: "Baby Lotion", description: "Gentle body lotion for infant skin.", unitCode: "pack" },
      { code: "swaddle_blanket", categoryCode: "nursery", name: "Swaddle Blanket", description: "Lightweight baby swaddle blanket." },
    ],
  }),
  buildGeneratedIndustry({
    code: "sports",
    name: "Sports",
    description: "Sports retail inventory for fitness gear and team game equipment.",
    categories: [
      { code: "fitness", name: "Fitness" },
      { code: "outdoor", name: "Outdoor" },
      { code: "team_sports", name: "Team Sports" },
      { code: "accessories", name: "Accessories" },
    ],
    items: [
      { code: "yoga_mat", categoryCode: "fitness", name: "Yoga Mat", description: "Workout yoga mat for home and studio use." },
      { code: "cricket_bat", categoryCode: "team_sports", name: "Cricket Bat", description: "Cricket bat for practice and club games." },
      { code: "football", categoryCode: "team_sports", name: "Football", description: "Standard football for turf and ground use." },
      { code: "skipping_rope", categoryCode: "fitness", name: "Skipping Rope", description: "Jump rope for cardio routines." },
      { code: "dumbbell", categoryCode: "fitness", name: "Dumbbell", description: "Single dumbbell unit for gym and home use." },
    ],
  }),
  buildGeneratedIndustry({
    code: "books_media",
    name: "Books & Media",
    description: "Books and media inventory for educational and retail bookstores.",
    categories: [
      { code: "textbooks", name: "Textbooks" },
      { code: "fiction", name: "Fiction" },
      { code: "kids_books", name: "Kids Books" },
      { code: "reference", name: "Reference" },
    ],
    items: [
      { code: "school_textbook", categoryCode: "textbooks", name: "School Textbook", description: "Academic textbook for school students." },
      { code: "paperback_novel", categoryCode: "fiction", name: "Paperback Novel", description: "Popular fiction title in paperback format." },
      { code: "coloring_book", categoryCode: "kids_books", name: "Coloring Book", description: "Coloring book for children and early learning." },
      { code: "monthly_magazine", categoryCode: "reference", name: "Monthly Magazine", description: "Monthly subscription-style magazine issues." },
      { code: "puzzle_book", categoryCode: "kids_books", name: "Puzzle Book", description: "Puzzle and activity book for kids." },
    ],
  }),
  buildGeneratedIndustry({
    code: "home_decor",
    name: "Home Decor",
    description: "Home decor inventory for decorative lighting and household styling.",
    categories: [
      { code: "lighting", name: "Lighting" },
      { code: "wall_decor", name: "Wall Decor" },
      { code: "soft_furnishing", name: "Soft Furnishing" },
      { code: "storage", name: "Storage" },
    ],
    items: [
      { code: "table_lamp", categoryCode: "lighting", name: "Table Lamp", description: "Decorative table lamp for bedrooms and work desks." },
      { code: "wall_clock", categoryCode: "wall_decor", name: "Wall Clock", description: "Decor wall clock for homes and offices." },
      { code: "curtain_set", categoryCode: "soft_furnishing", name: "Curtain Set", description: "Window curtain set for living spaces.", unitCode: "pack" },
      { code: "storage_basket", categoryCode: "storage", name: "Storage Basket", description: "Woven storage basket for home organization." },
      { code: "photo_frame", categoryCode: "wall_decor", name: "Photo Frame", description: "Photo frame for tabletop and wall display." },
    ],
  }),
  buildGeneratedIndustry({
    code: "furniture",
    name: "Furniture",
    description: "Furniture inventory for retail showrooms and workspace fit-outs.",
    categories: [
      { code: "seating", name: "Seating" },
      { code: "tables", name: "Tables" },
      { code: "storage", name: "Storage" },
      { code: "office", name: "Office" },
    ],
    items: [
      { code: "office_chair", categoryCode: "office", name: "Office Chair", description: "Adjustable office chair for workstation use." },
      { code: "side_table", categoryCode: "tables", name: "Side Table", description: "Compact side table for living rooms and bedrooms." },
      { code: "bookshelf", categoryCode: "storage", name: "Bookshelf", description: "Open bookshelf unit for storage and display." },
      { code: "plastic_stool", categoryCode: "seating", name: "Plastic Stool", description: "Lightweight stool for daily household use." },
      { code: "study_desk", categoryCode: "office", name: "Study Desk", description: "Study desk for students and home offices." },
    ],
  }),
  buildGeneratedIndustry({
    code: "bakery",
    name: "Bakery",
    description: "Bakery inventory for baked goods, mixes, and display counters.",
    categories: [
      { code: "bread", name: "Bread" },
      { code: "cakes", name: "Cakes" },
      { code: "snacks", name: "Snacks" },
      { code: "ingredients", name: "Ingredients" },
    ],
    items: [
      { code: "sandwich_bread", categoryCode: "bread", name: "Sandwich Bread", description: "Fresh loaf bread for retail bakery shelves.", unitCode: "pack" },
      { code: "cupcake", categoryCode: "cakes", name: "Cupcake", description: "Single cupcake for bakery counter sales." },
      { code: "cookies_pack", categoryCode: "snacks", name: "Cookies Pack", description: "Packaged bakery cookies.", unitCode: "pack" },
      { code: "baking_flour", categoryCode: "ingredients", name: "Baking Flour", description: "Flour bag for baking production.", unitCode: "kg", trackMethod: TrackMethod.WEIGHT },
      { code: "cocoa_powder", categoryCode: "ingredients", name: "Cocoa Powder", description: "Cocoa powder for cakes and desserts.", unitCode: "kg", trackMethod: TrackMethod.WEIGHT },
    ],
  }),
  buildGeneratedIndustry({
    code: "agriculture",
    name: "Agriculture",
    description: "Agriculture inventory for farm inputs, irrigation, and crop care.",
    categories: [
      { code: "seeds", name: "Seeds" },
      { code: "fertilizers", name: "Fertilizers" },
      { code: "irrigation", name: "Irrigation" },
      { code: "tools", name: "Tools" },
    ],
    items: [
      { code: "vegetable_seeds", categoryCode: "seeds", name: "Vegetable Seeds", description: "Seed packets for seasonal vegetable farming.", unitCode: "pack" },
      { code: "bio_fertilizer", categoryCode: "fertilizers", name: "Bio Fertilizer", description: "Organic fertilizer for soil enrichment.", unitCode: "kg", trackMethod: TrackMethod.WEIGHT },
      { code: "spray_pump", categoryCode: "tools", name: "Spray Pump", description: "Manual spray pump for crop care and pesticides." },
      { code: "drip_pipe", categoryCode: "irrigation", name: "Drip Pipe", description: "Drip irrigation pipe rolls.", unitCode: "m", trackMethod: TrackMethod.LENGTH },
      { code: "garden_hoe", categoryCode: "tools", name: "Garden Hoe", description: "Farm hand tool for soil tilling and weeding." },
    ],
  }),
  buildGeneratedIndustry({
    code: "jewelry",
    name: "Jewelry",
    description: "Jewelry inventory for fashion accessories and retail display counters.",
    categories: [
      { code: "earrings", name: "Earrings" },
      { code: "chains", name: "Chains" },
      { code: "bracelets", name: "Bracelets" },
      { code: "rings", name: "Rings" },
    ],
    items: [
      { code: "stud_earrings", categoryCode: "earrings", name: "Stud Earrings", description: "Small stud earrings for fashion retail." },
      { code: "silver_chain", categoryCode: "chains", name: "Silver Chain", description: "Silver-tone chain for gifting and daily wear." },
      { code: "bracelet", categoryCode: "bracelets", name: "Bracelet", description: "Fashion bracelet for casual styling." },
      { code: "finger_ring", categoryCode: "rings", name: "Finger Ring", description: "Retail ring unit for jewelry displays." },
      { code: "anklet", categoryCode: "bracelets", name: "Anklet", description: "Decorative anklet for ethnic wear collections." },
    ],
  }),
  buildGeneratedIndustry({
    code: "footwear",
    name: "Footwear",
    description: "Footwear inventory for casual, formal, and sports retail.",
    categories: [
      { code: "casual", name: "Casual" },
      { code: "formal", name: "Formal" },
      { code: "sports", name: "Sports" },
      { code: "kids", name: "Kids" },
    ],
    items: [
      { code: "sneakers", categoryCode: "sports", name: "Sneakers", description: "Retail sports sneakers in standard sizes.", hasVariants: true, variantTemplates: sizeVariants() },
      { code: "formal_shoes", categoryCode: "formal", name: "Formal Shoes", description: "Formal office shoes for menswear stores.", hasVariants: true, variantTemplates: sizeVariants() },
      { code: "sandals", categoryCode: "casual", name: "Sandals", description: "Everyday sandals for casual use.", hasVariants: true, variantTemplates: sizeVariants() },
      { code: "flip_flops", categoryCode: "casual", name: "Flip Flops", description: "Lightweight flip flops for home and travel.", hasVariants: true, variantTemplates: sizeVariants() },
      { code: "kids_shoes", categoryCode: "kids", name: "Kids Shoes", description: "Footwear for kids and schoolwear ranges.", hasVariants: true, variantTemplates: sizeVariants() },
    ],
  }),
  buildGeneratedIndustry({
    code: "cleaning",
    name: "Cleaning",
    description: "Cleaning inventory for household, laundry, and janitorial supply.",
    categories: [
      { code: "household", name: "Household" },
      { code: "laundry", name: "Laundry" },
      { code: "kitchen", name: "Kitchen" },
      { code: "bathroom", name: "Bathroom" },
    ],
    items: [
      { code: "floor_cleaner", categoryCode: "household", name: "Floor Cleaner", description: "Liquid floor cleaner for daily mopping.", unitCode: "l", trackMethod: TrackMethod.VOLUME },
      { code: "detergent_powder", categoryCode: "laundry", name: "Detergent Powder", description: "Laundry detergent powder bags.", unitCode: "kg", trackMethod: TrackMethod.WEIGHT },
      { code: "dishwash_liquid", categoryCode: "kitchen", name: "Dishwash Liquid", description: "Dishwashing liquid bottles.", unitCode: "l", trackMethod: TrackMethod.VOLUME },
      { code: "toilet_cleaner", categoryCode: "bathroom", name: "Toilet Cleaner", description: "Bathroom cleaner for toilet bowls.", unitCode: "l", trackMethod: TrackMethod.VOLUME },
      { code: "mop_set", categoryCode: "household", name: "Mop Set", description: "Mop and bucket combo set." },
    ],
  }),
  buildGeneratedIndustry({
    code: "toys",
    name: "Toys",
    description: "Toy inventory for retail shelves, gifting, and early learning sections.",
    categories: [
      { code: "learning", name: "Learning" },
      { code: "indoor", name: "Indoor" },
      { code: "outdoor", name: "Outdoor" },
      { code: "infant", name: "Infant" },
    ],
    items: [
      { code: "building_blocks", categoryCode: "learning", name: "Building Blocks", description: "Creative building block set for children.", unitCode: "box" },
      { code: "toy_car", categoryCode: "indoor", name: "Toy Car", description: "Small toy car for gifting and play." },
      { code: "soft_toy", categoryCode: "infant", name: "Soft Toy", description: "Soft plush toy for infant and toddler gifting." },
      { code: "puzzle_cube", categoryCode: "learning", name: "Puzzle Cube", description: "Puzzle cube for learning and focus." },
      { code: "beach_ball", categoryCode: "outdoor", name: "Beach Ball", description: "Inflatable play ball for outdoor activity." },
    ],
  }),
  buildGeneratedIndustry({
    code: "office_supplies",
    name: "Office Supplies",
    description: "Office supply inventory for workspaces, admin desks, and document handling.",
    categories: [
      { code: "paper", name: "Paper" },
      { code: "writing", name: "Writing" },
      { code: "filing", name: "Filing" },
      { code: "desk_tools", name: "Desk Tools" },
    ],
    items: [
      { code: "copier_paper", categoryCode: "paper", name: "Copier Paper", description: "A4 copier paper reams.", unitCode: "pack" },
      { code: "gel_pen", categoryCode: "writing", name: "Gel Pen", description: "Smooth ink gel pen for office writing." },
      { code: "file_folder", categoryCode: "filing", name: "File Folder", description: "File folder for document storage." },
      { code: "calculator", categoryCode: "desk_tools", name: "Calculator", description: "Desktop calculator for office counters." },
      { code: "sticky_notes", categoryCode: "paper", name: "Sticky Notes", description: "Sticky note pad for quick desk reminders.", unitCode: "pack" },
    ],
  }),
  buildGeneratedIndustry({
    code: "construction",
    name: "Construction",
    description: "Construction inventory for building materials, paints, and site tools.",
    categories: [
      { code: "cementing", name: "Cementing" },
      { code: "paints", name: "Paints" },
      { code: "safety", name: "Safety" },
      { code: "tools", name: "Tools" },
    ],
    items: [
      { code: "cement_bag", categoryCode: "cementing", name: "Cement Bag", description: "Standard cement bag for civil work.", unitCode: "kg", trackMethod: TrackMethod.WEIGHT },
      { code: "wall_putty", categoryCode: "cementing", name: "Wall Putty", description: "Wall putty bags for finishing work.", unitCode: "kg", trackMethod: TrackMethod.WEIGHT },
      { code: "paint_roller", categoryCode: "paints", name: "Paint Roller", description: "Paint roller tool for wall finishing." },
      { code: "safety_helmet", categoryCode: "safety", name: "Safety Helmet", description: "Site safety helmet for workers." },
      { code: "measuring_tape", categoryCode: "tools", name: "Measuring Tape", description: "Tape measure for site and workshop use." },
    ],
  }),
  buildGeneratedIndustry({
    code: "appliances",
    name: "Appliances",
    description: "Appliance inventory for kitchen, cooling, and household electronics.",
    categories: [
      { code: "kitchen", name: "Kitchen" },
      { code: "home_care", name: "Home Care" },
      { code: "cooling", name: "Cooling" },
      { code: "personal", name: "Personal" },
    ],
    items: [
      { code: "mixer_grinder", categoryCode: "kitchen", name: "Mixer Grinder", description: "Mixer grinder for kitchen retail sales." },
      { code: "electric_kettle", categoryCode: "kitchen", name: "Electric Kettle", description: "Electric kettle for quick heating." },
      { code: "ceiling_fan", categoryCode: "cooling", name: "Ceiling Fan", description: "Ceiling fan for residential installations." },
      { code: "steam_iron", categoryCode: "personal", name: "Steam Iron", description: "Steam iron for home garment care." },
      { code: "room_heater", categoryCode: "home_care", name: "Room Heater", description: "Portable room heater for winter use." },
    ],
  }),
  buildGeneratedIndustry({
    code: "gardening",
    name: "Gardening",
    description: "Gardening inventory for planters, soil inputs, and maintenance tools.",
    categories: [
      { code: "planters", name: "Planters" },
      { code: "soil", name: "Soil" },
      { code: "seeds", name: "Seeds" },
      { code: "tools", name: "Tools" },
    ],
    items: [
      { code: "planter_pot", categoryCode: "planters", name: "Planter Pot", description: "Decor planter pot for home gardening." },
      { code: "potting_soil", categoryCode: "soil", name: "Potting Soil", description: "Potting soil mix for container gardening.", unitCode: "kg", trackMethod: TrackMethod.WEIGHT },
      { code: "herb_seeds", categoryCode: "seeds", name: "Herb Seeds", description: "Seed packets for herb gardening.", unitCode: "pack" },
      { code: "pruning_shears", categoryCode: "tools", name: "Pruning Shears", description: "Shears for pruning and plant care." },
      { code: "watering_can", categoryCode: "tools", name: "Watering Can", description: "Watering can for home and terrace gardens." },
    ],
  }),
  buildGeneratedIndustry({
    code: "wellness",
    name: "Wellness",
    description: "Wellness inventory for fitness recovery, yoga, and supplements.",
    categories: [
      { code: "supplements", name: "Supplements" },
      { code: "yoga", name: "Yoga" },
      { code: "massage", name: "Massage" },
      { code: "recovery", name: "Recovery" },
    ],
    items: [
      { code: "protein_powder", categoryCode: "supplements", name: "Protein Powder", description: "Protein powder tubs for nutrition stores.", unitCode: "kg", trackMethod: TrackMethod.WEIGHT },
      { code: "yoga_block", categoryCode: "yoga", name: "Yoga Block", description: "Yoga block for balance and stretching." },
      { code: "massage_oil", categoryCode: "massage", name: "Massage Oil", description: "Massage oil bottle for therapy and wellness.", unitCode: "l", trackMethod: TrackMethod.VOLUME },
      { code: "resistance_band", categoryCode: "recovery", name: "Resistance Band", description: "Resistance band for rehab and training." },
      { code: "foam_roller", categoryCode: "recovery", name: "Foam Roller", description: "Foam roller for mobility and recovery." },
    ],
  }),
  buildGeneratedIndustry({
    code: "gifts",
    name: "Gifts",
    description: "Gift shop inventory for hampers, decor items, and greeting products.",
    categories: [
      { code: "greeting", name: "Greeting" },
      { code: "decor", name: "Decor" },
      { code: "hampers", name: "Hampers" },
      { code: "souvenirs", name: "Souvenirs" },
    ],
    items: [
      { code: "greeting_card", categoryCode: "greeting", name: "Greeting Card", description: "Greeting card for birthdays and celebrations." },
      { code: "gift_mug", categoryCode: "souvenirs", name: "Gift Mug", description: "Printed gift mug for personal gifting." },
      { code: "photo_frame_gift", categoryCode: "decor", name: "Gift Photo Frame", description: "Decorative photo frame for gift shops." },
      { code: "chocolate_hamper", categoryCode: "hampers", name: "Chocolate Hamper", description: "Gift hamper with assorted chocolates.", unitCode: "box" },
      { code: "gift_wrap_roll", categoryCode: "greeting", name: "Gift Wrap Roll", description: "Gift wrap paper roll for packing.", unitCode: "pack" },
    ],
  }),
  buildGeneratedIndustry({
    code: "beverage_shop",
    name: "Beverage Shop",
    description: "Specialized beverage inventory for juices, coffees, and ready-to-drink counters.",
    categories: [
      { code: "coffee", name: "Coffee" },
      { code: "tea", name: "Tea" },
      { code: "juices", name: "Juices" },
      { code: "ready_to_drink", name: "Ready To Drink" },
    ],
    items: [
      { code: "coffee_beans", categoryCode: "coffee", name: "Coffee Beans", description: "Whole coffee beans for cafe retail.", unitCode: "kg", trackMethod: TrackMethod.WEIGHT },
      { code: "tea_leaves", categoryCode: "tea", name: "Tea Leaves", description: "Loose tea leaves for tea counters.", unitCode: "kg", trackMethod: TrackMethod.WEIGHT },
      { code: "orange_juice", categoryCode: "juices", name: "Orange Juice", description: "Packaged orange juice bottles.", unitCode: "l", trackMethod: TrackMethod.VOLUME },
      { code: "cold_coffee", categoryCode: "ready_to_drink", name: "Cold Coffee", description: "Ready-to-drink cold coffee bottles.", unitCode: "l", trackMethod: TrackMethod.VOLUME },
      { code: "sparkling_water", categoryCode: "ready_to_drink", name: "Sparkling Water", description: "Sparkling water bottles for beverage stores.", unitCode: "l", trackMethod: TrackMethod.VOLUME },
    ],
  }),
];

const industries: IndustrySeed[] = [
  {
    code: "grocery",
    canonicalName: "Grocery",
    canonicalDescription: "Retail grocery, fresh produce, packaged foods, and household essentials.",
    translations: withDescriptions(
      names("Grocery", "किराना", "કરિયાણું"),
      {
        EN: "Retail grocery, fresh produce, packaged foods, and household essentials.",
        HI: "किराना, ताज़ा उपज, पैकेज्ड खाद्य और घरेलू ज़रूरतों के लिए इन्वेंट्री।",
        GU: "કરિયાણું, તાજી ઉપજ, પેકેજ્ડ ખોરાક અને ઘરગથ્થુ જરૂરિયાતો માટેની ઇન્વેન્ટરી.",
      },
    ),
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
    categories: [
      {
        code: "dairy",
        sortOrder: 1,
        translations: withDescriptions(names("Dairy", "डेयरी", "ડેરી")),
      },
      {
        code: "snacks",
        sortOrder: 2,
        translations: withDescriptions(names("Snacks", "स्नैक्स", "નાસ્તો")),
      },
      {
        code: "beverages",
        sortOrder: 3,
        translations: withDescriptions(names("Beverages", "पेय पदार्थ", "પીણા")),
      },
      {
        code: "staples",
        sortOrder: 4,
        translations: withDescriptions(names("Staples", "राशन", "મૂળભૂત અનાજ")),
      },
    ],
    items: [
      {
        code: "grocery_milk",
        categoryCode: "dairy",
        canonicalName: "Milk",
        canonicalDescription: "Fresh pouch milk for daily retail sales.",
        translations: withDescriptions(names("Milk", "दूध", "દૂધ")),
        aliases: [
          { language: LanguageCode.EN, value: "full cream milk" },
          { language: LanguageCode.HI, value: "दूध पैकेट" },
          { language: LanguageCode.GU, value: "દૂધ પેકેટ" },
        ],
        defaultTrackMethod: TrackMethod.VOLUME,
        defaultUnitCode: "l",
        defaultBrandName: "Amul",
        tags: ["dairy", "daily"],
      },
      {
        code: "grocery_curd",
        categoryCode: "dairy",
        canonicalName: "Curd",
        canonicalDescription: "Fresh curd tubs and pouches.",
        translations: withDescriptions(names("Curd", "दही", "દહીં")),
        defaultTrackMethod: TrackMethod.WEIGHT,
        defaultUnitCode: "kg",
        defaultBrandName: "Mother Dairy",
      },
      {
        code: "grocery_paneer",
        categoryCode: "dairy",
        canonicalName: "Paneer",
        canonicalDescription: "Fresh cottage cheese blocks.",
        translations: withDescriptions(names("Paneer", "पनीर", "પનીર")),
        defaultTrackMethod: TrackMethod.WEIGHT,
        defaultUnitCode: "kg",
        defaultBrandName: "Amul",
      },
      {
        code: "grocery_potato_chips",
        categoryCode: "snacks",
        canonicalName: "Potato Chips",
        canonicalDescription: "Popular flavored potato chips.",
        translations: withDescriptions(names("Potato Chips", "आलू चिप्स", "બટાકા ચીપ્સ")),
        aliases: [{ language: LanguageCode.EN, value: "chips" }],
        defaultUnitCode: "pack",
        defaultBrandName: "Haldiram",
      },
      {
        code: "grocery_biscuits",
        categoryCode: "snacks",
        canonicalName: "Biscuits",
        canonicalDescription: "Tea-time sweet and salted biscuits.",
        translations: withDescriptions(names("Biscuits", "बिस्किट", "બિસ્કિટ")),
        defaultUnitCode: "pack",
        defaultBrandName: "Britannia",
      },
      {
        code: "grocery_packaged_water",
        categoryCode: "beverages",
        canonicalName: "Packaged Water",
        canonicalDescription: "Sealed drinking water bottles.",
        translations: withDescriptions(names("Packaged Water", "पैक्ड पानी", "પૅકેજ્ડ પાણી")),
        defaultTrackMethod: TrackMethod.VOLUME,
        defaultUnitCode: "l",
        defaultBrandName: "Bisleri",
      },
      {
        code: "grocery_rice",
        categoryCode: "staples",
        canonicalName: "Rice",
        canonicalDescription: "Popular everyday rice grades.",
        translations: withDescriptions(names("Rice", "चावल", "ચોખા")),
        aliases: [{ language: LanguageCode.HI, value: "चावल" }],
        defaultTrackMethod: TrackMethod.WEIGHT,
        defaultUnitCode: "kg",
        defaultBrandName: "India Gate",
      },
      {
        code: "grocery_wheat_flour",
        categoryCode: "staples",
        canonicalName: "Wheat Flour",
        canonicalDescription: "Fresh chakki atta and packaged flour.",
        translations: withDescriptions(names("Wheat Flour", "आटा", "ઘઉંનો લોટ")),
        defaultTrackMethod: TrackMethod.WEIGHT,
        defaultUnitCode: "kg",
        defaultBrandName: "Aashirvaad",
      },
      {
        code: "grocery_cooking_oil",
        categoryCode: "staples",
        canonicalName: "Cooking Oil",
        canonicalDescription: "Refined cooking oil for home use.",
        translations: withDescriptions(names("Cooking Oil", "खाना पकाने का तेल", "રસોઈનું તેલ")),
        defaultTrackMethod: TrackMethod.VOLUME,
        defaultUnitCode: "l",
        defaultBrandName: "Fortune",
      },
      {
        code: "grocery_tea",
        categoryCode: "beverages",
        canonicalName: "Tea",
        canonicalDescription: "Daily chai blends and packaged tea leaves.",
        translations: withDescriptions(names("Tea", "चाय", "ચા")),
        aliases: [{ language: LanguageCode.EN, value: "chai" }],
        defaultUnitCode: "pack",
        defaultBrandName: "Tata Tea",
        tags: ["tea", "breakfast", "chai"],
      },
      {
        code: "grocery_noodles",
        categoryCode: "snacks",
        canonicalName: "Instant Noodles",
        canonicalDescription: "Ready-to-cook instant noodles for quick meals.",
        translations: withDescriptions(names("Instant Noodles", "इंस्टेंट नूडल्स", "ઇન્સ્ટન્ટ નૂડલ્સ")),
        aliases: [{ language: LanguageCode.EN, value: "2 minute noodles" }],
        defaultUnitCode: "pack",
        defaultBrandName: "Maggi",
        tags: ["instant-food", "snacks"],
      },
      {
        code: "grocery_toor_dal",
        categoryCode: "staples",
        canonicalName: "Toor Dal",
        canonicalDescription: "Split pigeon peas used in daily Indian cooking.",
        translations: withDescriptions(names("Toor Dal", "तूर दाल", "તુવેર દાળ")),
        aliases: [{ language: LanguageCode.EN, value: "arhar dal" }],
        defaultTrackMethod: TrackMethod.WEIGHT,
        defaultUnitCode: "kg",
        defaultBrandName: "Tata Sampann",
        tags: ["dal", "staples", "indian-kitchen"],
      },
    ],
  },
  {
    code: "pharmacy",
    canonicalName: "Pharmacy",
    canonicalDescription: "Pharmacy inventory with expiry awareness and batch traceability.",
    translations: withDescriptions(
      names("Pharmacy", "फार्मेसी", "ફાર્મસી"),
      {
        EN: "Pharmacy inventory with expiry awareness and batch traceability.",
        HI: "फार्मेसी इन्वेंट्री जिसमें एक्सपायरी और बैच ट्रेसिंग शामिल है।",
        GU: "ફાર્મસી ઇન્વેન્ટરી જેમાં એક્સપાયરી અને બેચ ટ્રેસિંગ સામેલ છે.",
      },
    ),
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
    categories: [
      { code: "otc", sortOrder: 1, translations: withDescriptions(names("OTC", "ओटीसी", "ઓટીસી")) },
      {
        code: "personal_care",
        sortOrder: 2,
        translations: withDescriptions(names("Personal Care", "पर्सनल केयर", "પર્સનલ કેર")),
      },
      { code: "hygiene", sortOrder: 3, translations: withDescriptions(names("Hygiene", "स्वच्छता", "સ્વચ્છતા")) },
      { code: "respiratory", sortOrder: 4, translations: withDescriptions(names("Respiratory", "श्वसन", "શ્વસન")) },
      { code: "devices", sortOrder: 5, translations: withDescriptions(names("Devices", "डिवाइसेज़", "ડિવાઇસીસ")) },
      { code: "wellness", sortOrder: 6, translations: withDescriptions(names("Wellness", "वेलनेस", "વેલનેસ")) },
    ],
    items: [
      {
        code: "pharmacy_paracetamol",
        categoryCode: "otc",
        canonicalName: "Paracetamol",
        canonicalDescription: "Common OTC pain and fever relief tablets.",
        translations: withDescriptions(names("Paracetamol", "पैरासिटामोल", "પેરાસિટામોલ")),
        aliases: [{ language: LanguageCode.EN, value: "acetaminophen" }],
        defaultUnitCode: "box",
        defaultBrandName: "Dolo",
      },
      {
        code: "pharmacy_bandage",
        categoryCode: "hygiene",
        canonicalName: "Bandage",
        canonicalDescription: "Sterile dressing bandages and rolls.",
        translations: withDescriptions(names("Bandage", "पट्टी", "બૅન્ડેજ")),
        defaultUnitCode: "box",
        defaultBrandName: "Safe Touch",
      },
      {
        code: "pharmacy_antiseptic_liquid",
        categoryCode: "hygiene",
        canonicalName: "Antiseptic Liquid",
        canonicalDescription: "Liquid antiseptic for wound cleaning.",
        translations: withDescriptions(names("Antiseptic Liquid", "एंटीसेप्टिक लिक्विड", "એન્ટિસેપ્ટિક લિક્વિડ")),
        defaultTrackMethod: TrackMethod.VOLUME,
        defaultUnitCode: "ml",
        defaultBrandName: "Dettol",
      },
      {
        code: "pharmacy_face_mask",
        categoryCode: "respiratory",
        canonicalName: "Face Mask",
        canonicalDescription: "Disposable protective face masks.",
        translations: withDescriptions(names("Face Mask", "फेस मास्क", "ફેસ માસ્ક")),
        defaultUnitCode: "box",
        defaultBrandName: "Safe Touch",
      },
      {
        code: "pharmacy_sanitizer",
        categoryCode: "hygiene",
        canonicalName: "Sanitizer",
        canonicalDescription: "Alcohol-based hand sanitizer bottles.",
        translations: withDescriptions(names("Sanitizer", "सैनिटाइज़र", "સેનિટાઇઝર")),
        defaultTrackMethod: TrackMethod.VOLUME,
        defaultUnitCode: "ml",
        defaultBrandName: "Savlon",
      },
      {
        code: "pharmacy_toothpaste",
        categoryCode: "personal_care",
        canonicalName: "Toothpaste",
        canonicalDescription: "Daily oral care toothpaste tubes.",
        translations: withDescriptions(names("Toothpaste", "टूथपेस्ट", "ટૂથપેસ્ટ")),
        defaultUnitCode: "pack",
        defaultBrandName: "Colgate",
      },
      {
        code: "pharmacy_cough_syrup",
        categoryCode: "respiratory",
        canonicalName: "Cough Syrup",
        canonicalDescription: "Soothing cough relief syrup.",
        translations: withDescriptions(names("Cough Syrup", "कफ सिरप", "કફ સિરપ")),
        defaultTrackMethod: TrackMethod.VOLUME,
        defaultUnitCode: "ml",
        defaultBrandName: "Benadryl",
      },
      {
        code: "pharmacy_pain_relief_spray",
        categoryCode: "otc",
        canonicalName: "Pain Relief Spray",
        canonicalDescription: "Topical spray for muscular pain relief.",
        translations: withDescriptions(names("Pain Relief Spray", "दर्द निवारक स्प्रे", "પેઇન રિલીફ સ્પ્રે")),
        defaultUnitCode: "pack",
        defaultBrandName: "Moov",
      },
      {
        code: "pharmacy_digital_thermometer",
        categoryCode: "devices",
        canonicalName: "Digital Thermometer",
        canonicalDescription: "Infrared and digital thermometers for pharmacy counters.",
        translations: withDescriptions(names("Digital Thermometer", "डिजिटल थर्मामीटर", "ડિજિટલ થર્મોમીટર")),
        defaultUnitCode: "pcs",
        defaultBrandName: "Omron",
        tags: ["device", "temperature", "diagnostics"],
      },
      {
        code: "pharmacy_ors",
        categoryCode: "wellness",
        canonicalName: "ORS",
        canonicalDescription: "Oral rehydration salts for hydration support.",
        translations: withDescriptions(names("ORS", "ओआरएस", "ઓઆરએસ")),
        aliases: [{ language: LanguageCode.EN, value: "oral rehydration salts" }],
        defaultUnitCode: "box",
        defaultBrandName: "Electral",
        tags: ["hydration", "wellness"],
      },
    ],
  },
  {
    code: "fashion",
    canonicalName: "Fashion",
    canonicalDescription: "Fashion and apparel inventory with multi-variant products.",
    translations: withDescriptions(
      names("Fashion", "फैशन", "ફેશન"),
      {
        EN: "Fashion and apparel inventory with multi-variant products.",
        HI: "फैशन और परिधान की इन्वेंट्री जिसमें मल्टी-वेरिएंट उत्पाद शामिल हैं।",
        GU: "ફેશન અને પરિધાનની ઇન્વેન્ટરી જેમાં મલ્ટી-વેરિયન્ટ પ્રોડક્ટ્સ સામેલ છે.",
      },
    ),
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
    categories: [
      { code: "men", sortOrder: 1, translations: withDescriptions(names("Men", "पुरुष", "પુરુષ")) },
      { code: "women", sortOrder: 2, translations: withDescriptions(names("Women", "महिला", "મહિલા")) },
      { code: "kids", sortOrder: 3, translations: withDescriptions(names("Kids", "बच्चे", "બાળકો")) },
      { code: "essentials", sortOrder: 4, translations: withDescriptions(names("Essentials", "ज़रूरी कपड़े", "આવશ્યક કપડાં")) },
    ],
    items: [
      {
        code: "fashion_tshirt",
        categoryCode: "men",
        canonicalName: "T-Shirt",
        canonicalDescription: "Basic crew-neck t-shirts.",
        translations: withDescriptions(names("T-Shirt", "टी-शर्ट", "ટી-શર્ટ")),
        hasVariants: true,
        variantTemplates: sizeVariants(),
        defaultUnitCode: "pcs",
      },
      {
        code: "fashion_jeans",
        categoryCode: "men",
        canonicalName: "Jeans",
        canonicalDescription: "Denim jeans in standard sizes.",
        translations: withDescriptions(names("Jeans", "जींस", "જીન્સ")),
        hasVariants: true,
        variantTemplates: sizeVariants(),
        defaultUnitCode: "pcs",
      },
      {
        code: "fashion_kurti",
        categoryCode: "women",
        canonicalName: "Kurti",
        canonicalDescription: "Printed and solid casual kurtis.",
        translations: withDescriptions(names("Kurti", "कुर्ती", "કુર્તી")),
        hasVariants: true,
        variantTemplates: sizeVariants(),
        defaultUnitCode: "pcs",
      },
      {
        code: "fashion_leggings",
        categoryCode: "women",
        canonicalName: "Leggings",
        canonicalDescription: "Stretch leggings for daily wear.",
        translations: withDescriptions(names("Leggings", "लेगिंग्स", "લેગિંગ્સ")),
        hasVariants: true,
        variantTemplates: sizeVariants(),
        defaultUnitCode: "pcs",
      },
      {
        code: "fashion_shirt",
        categoryCode: "men",
        canonicalName: "Shirt",
        canonicalDescription: "Formal and casual shirts.",
        translations: withDescriptions(names("Shirt", "शर्ट", "શર્ટ")),
        hasVariants: true,
        variantTemplates: sizeVariants(),
        defaultUnitCode: "pcs",
      },
      {
        code: "fashion_hoodie",
        categoryCode: "essentials",
        canonicalName: "Hoodie",
        canonicalDescription: "Warm hoodies for casual wear.",
        translations: withDescriptions(names("Hoodie", "हुडी", "હુડી")),
        hasVariants: true,
        variantTemplates: sizeVariants(),
        defaultUnitCode: "pcs",
      },
      {
        code: "fashion_polo",
        categoryCode: "men",
        canonicalName: "Polo T-Shirt",
        canonicalDescription: "Collared polo t-shirts.",
        translations: withDescriptions(names("Polo T-Shirt", "पोलो टी-शर्ट", "પોલો ટી-શર્ટ")),
        hasVariants: true,
        variantTemplates: sizeVariants(),
        defaultUnitCode: "pcs",
      },
      {
        code: "fashion_kids_frock",
        categoryCode: "kids",
        canonicalName: "Kids Frock",
        canonicalDescription: "Casual frocks for girls.",
        translations: withDescriptions(names("Kids Frock", "बच्चों की फ्रॉक", "બાળકોની ફ્રોક")),
        hasVariants: true,
        variantTemplates: sizeVariants(),
        defaultUnitCode: "pcs",
      },
    ],
  },
  {
    code: "electronics",
    canonicalName: "Electronics",
    canonicalDescription: "Electronics inventory with serial-number-ready product handling.",
    translations: withDescriptions(
      names("Electronics", "इलेक्ट्रॉनिक्स", "ઇલેક્ટ્રોનિક્સ"),
      {
        EN: "Electronics inventory with serial-number-ready product handling.",
        HI: "इलेक्ट्रॉनिक्स इन्वेंट्री जिसमें सीरियल-नंबर तैयार उत्पाद प्रबंधन शामिल है।",
        GU: "ઇલેક્ટ્રોનિક્સ ઇન્વેન્ટરી જેમાં સિરિયલ નંબર તૈયાર પ્રોડક્ટ હેન્ડલિંગ સામેલ છે.",
      },
    ),
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
    categories: [
      {
        code: "mobile_accessories",
        sortOrder: 1,
        translations: withDescriptions(names("Mobile Accessories", "मोबाइल एक्सेसरीज़", "મોબાઇલ એસેસરીઝ")),
      },
      {
        code: "computing",
        sortOrder: 2,
        translations: withDescriptions(names("Computing", "कंप्यूटिंग", "કમ્પ્યુટિંગ")),
      },
      { code: "audio", sortOrder: 3, translations: withDescriptions(names("Audio", "ऑडियो", "ઓડિયો")) },
      { code: "power", sortOrder: 4, translations: withDescriptions(names("Power", "पावर", "પાવર")) },
    ],
    items: [
      {
        code: "electronics_usb_cable",
        categoryCode: "mobile_accessories",
        canonicalName: "USB Cable",
        canonicalDescription: "Charging and data sync USB cables.",
        translations: withDescriptions(names("USB Cable", "यूएसबी केबल", "યૂએસબી કેબલ")),
        defaultUnitCode: "pcs",
      },
      {
        code: "electronics_charger",
        categoryCode: "power",
        canonicalName: "Charger",
        canonicalDescription: "Wall chargers for smartphones and tablets.",
        translations: withDescriptions(names("Charger", "चार्जर", "ચાર્જર")),
        hasVariants: true,
        defaultUnitCode: "pcs",
        variantTemplates: [
          {
            code: "20W",
            name: "20W",
            skuSuffix: "20W",
            unitCode: "pcs",
            isDefault: true,
            translations: names("20W", "20W", "20W"),
          },
          {
            code: "30W",
            name: "30W",
            skuSuffix: "30W",
            unitCode: "pcs",
            translations: names("30W", "30W", "30W"),
          },
        ],
      },
      {
        code: "electronics_power_bank",
        categoryCode: "power",
        canonicalName: "Power Bank",
        canonicalDescription: "Portable backup battery packs.",
        translations: withDescriptions(names("Power Bank", "पावर बैंक", "પાવર બેંક")),
        hasVariants: true,
        defaultUnitCode: "pcs",
        variantTemplates: [
          {
            code: "10000MAH",
            name: "10000 mAh",
            skuSuffix: "10K",
            unitCode: "pcs",
            isDefault: true,
            translations: names("10000 mAh", "10000 mAh", "10000 mAh"),
          },
          {
            code: "20000MAH",
            name: "20000 mAh",
            skuSuffix: "20K",
            unitCode: "pcs",
            translations: names("20000 mAh", "20000 mAh", "20000 mAh"),
          },
        ],
      },
      {
        code: "electronics_keyboard",
        categoryCode: "computing",
        canonicalName: "Keyboard",
        canonicalDescription: "USB and wireless keyboards.",
        translations: withDescriptions(names("Keyboard", "कीबोर्ड", "કીબોર્ડ")),
        defaultUnitCode: "pcs",
      },
      {
        code: "electronics_mouse",
        categoryCode: "computing",
        canonicalName: "Mouse",
        canonicalDescription: "Optical wired and wireless mouse.",
        translations: withDescriptions(names("Mouse", "माउस", "માઉસ")),
        defaultUnitCode: "pcs",
      },
      {
        code: "electronics_earphones",
        categoryCode: "audio",
        canonicalName: "Earphones",
        canonicalDescription: "Wired earphones for daily use.",
        translations: withDescriptions(names("Earphones", "ईयरफ़ोन", "ઇયરફોન્સ")),
        defaultUnitCode: "pcs",
      },
      {
        code: "electronics_bluetooth_speaker",
        categoryCode: "audio",
        canonicalName: "Bluetooth Speaker",
        canonicalDescription: "Portable wireless speaker.",
        translations: withDescriptions(names("Bluetooth Speaker", "ब्लूटूथ स्पीकर", "બ્લૂટૂથ સ્પીકર")),
        defaultUnitCode: "pcs",
      },
      {
        code: "electronics_extension_board",
        categoryCode: "power",
        canonicalName: "Extension Board",
        canonicalDescription: "Multi-socket power extension board.",
        translations: withDescriptions(names("Extension Board", "एक्सटेंशन बोर्ड", "એક્સ્ટેન્શન બોર્ડ")),
        defaultUnitCode: "pcs",
      },
    ],
  },
  {
    code: "hardware",
    canonicalName: "Hardware",
    canonicalDescription: "Hardware and tools inventory with mixed unit-based and measured stock.",
    translations: withDescriptions(
      names("Hardware", "हार्डवेयर", "હાર્ડવેર"),
      {
        EN: "Hardware and tools inventory with mixed unit-based and measured stock.",
        HI: "हार्डवेयर और टूल्स की इन्वेंट्री जिसमें यूनिट और माप आधारित स्टॉक शामिल है।",
        GU: "હાર્ડવેર અને ટૂલ્સની ઇન્વેન્ટરી જેમાં યુનિટ અને માપ આધારિત સ્ટોક સામેલ છે.",
      },
    ),
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
    categories: [
      { code: "fasteners", sortOrder: 1, translations: withDescriptions(names("Fasteners", "फास्टनर्स", "ફાસ્ટનર્સ")) },
      { code: "tools", sortOrder: 2, translations: withDescriptions(names("Tools", "औज़ार", "ટૂલ્સ")) },
      { code: "plumbing", sortOrder: 3, translations: withDescriptions(names("Plumbing", "प्लंबिंग", "પ્લમ્બિંગ")) },
      { code: "electrical", sortOrder: 4, translations: withDescriptions(names("Electrical", "इलेक्ट्रिकल", "ઇલેક્ટ્રિકલ")) },
    ],
    items: [
      {
        code: "hardware_hammer",
        categoryCode: "tools",
        canonicalName: "Hammer",
        canonicalDescription: "General purpose claw hammer.",
        translations: withDescriptions(names("Hammer", "हथौड़ा", "હથોડું")),
        defaultUnitCode: "pcs",
      },
      {
        code: "hardware_screwdriver_set",
        categoryCode: "tools",
        canonicalName: "Screwdriver Set",
        canonicalDescription: "Multi-piece screwdriver kit.",
        translations: withDescriptions(names("Screwdriver Set", "स्क्रूड्राइवर सेट", "સ્ક્રૂડ્રાઇવર સેટ")),
        defaultUnitCode: "box",
      },
      {
        code: "hardware_pvc_pipe",
        categoryCode: "plumbing",
        canonicalName: "PVC Pipe",
        canonicalDescription: "Common plumbing PVC pipe lengths.",
        translations: withDescriptions(names("PVC Pipe", "पीवीसी पाइप", "પીવીસી પાઇપ")),
        hasVariants: true,
        defaultTrackMethod: TrackMethod.LENGTH,
        defaultUnitCode: "m",
        variantTemplates: [
          {
            code: "1IN",
            name: "1 inch",
            skuSuffix: "1IN",
            unitCode: "m",
            isDefault: true,
            translations: names("1 inch", "1 इंच", "1 ઇંચ"),
          },
          {
            code: "2IN",
            name: "2 inch",
            skuSuffix: "2IN",
            unitCode: "m",
            translations: names("2 inch", "2 इंच", "2 ઇંચ"),
          },
        ],
      },
      {
        code: "hardware_drill_bit",
        categoryCode: "tools",
        canonicalName: "Drill Bit",
        canonicalDescription: "Metal and wall drill bits.",
        translations: withDescriptions(names("Drill Bit", "ड्रिल बिट", "ડ્રિલ બીટ")),
        hasVariants: true,
        defaultUnitCode: "pcs",
        variantTemplates: [
          {
            code: "6MM",
            name: "6 mm",
            skuSuffix: "6MM",
            unitCode: "pcs",
            isDefault: true,
            translations: names("6 mm", "6 मिमी", "6 મીમી"),
          },
          {
            code: "8MM",
            name: "8 mm",
            skuSuffix: "8MM",
            unitCode: "pcs",
            translations: names("8 mm", "8 मिमी", "8 મીમી"),
          },
        ],
      },
      {
        code: "hardware_nails_box",
        categoryCode: "fasteners",
        canonicalName: "Nails Box",
        canonicalDescription: "Assorted iron nails in retail box packs.",
        translations: withDescriptions(names("Nails Box", "कीलों का बॉक्स", "ખીલનો બોક્સ")),
        defaultUnitCode: "box",
      },
      {
        code: "hardware_wrench",
        categoryCode: "tools",
        canonicalName: "Wrench",
        canonicalDescription: "Spanner and wrench tools.",
        translations: withDescriptions(names("Wrench", "रिंच", "રેંચ")),
        defaultUnitCode: "pcs",
      },
      {
        code: "hardware_insulation_tape",
        categoryCode: "electrical",
        canonicalName: "Insulation Tape",
        canonicalDescription: "Electrical insulation tape rolls.",
        translations: withDescriptions(names("Insulation Tape", "इंसुलेशन टेप", "ઇન્સ્યુલેશન ટેપ")),
        defaultUnitCode: "pack",
      },
      {
        code: "hardware_water_tap",
        categoryCode: "plumbing",
        canonicalName: "Water Tap",
        canonicalDescription: "Bathroom and utility water taps.",
        translations: withDescriptions(names("Water Tap", "वॉटर टैप", "વોટર ટેપ")),
        defaultUnitCode: "pcs",
      },
    ],
  },
  {
    code: "restaurant",
    canonicalName: "Restaurant",
    canonicalDescription: "Restaurant and kitchen inventory with batch and expiry awareness.",
    translations: withDescriptions(
      names("Restaurant", "रेस्टोरेंट", "રેસ્ટોરન્ટ"),
      {
        EN: "Restaurant and kitchen inventory with batch and expiry awareness.",
        HI: "रेस्टोरेंट और किचन की इन्वेंट्री जिसमें बैच और एक्सपायरी ट्रैकिंग शामिल है।",
        GU: "રેસ્ટોરન્ટ અને રસોડાની ઇન્વેન્ટરી જેમાં બેચ અને એક્સપાયરી ટ્રેકિંગ સામેલ છે.",
      },
    ),
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
    categories: [
      { code: "vegetables", sortOrder: 1, translations: withDescriptions(names("Vegetables", "सब्ज़ियाँ", "શાકભાજી")) },
      { code: "dairy", sortOrder: 2, translations: withDescriptions(names("Dairy", "डेयरी", "ડેરી")) },
      { code: "dry_goods", sortOrder: 3, translations: withDescriptions(names("Dry Goods", "सूखा सामान", "સુકો માલ")) },
      {
        code: "oils_spices",
        sortOrder: 4,
        translations: withDescriptions(names("Oils & Spices", "तेल और मसाले", "તેલ અને મસાલા")),
      },
    ],
    items: [
      {
        code: "restaurant_onion",
        categoryCode: "vegetables",
        canonicalName: "Onion",
        canonicalDescription: "Fresh onions used for prep kitchens.",
        translations: withDescriptions(names("Onion", "प्याज़", "ડુંગળી")),
        defaultTrackMethod: TrackMethod.WEIGHT,
        defaultUnitCode: "kg",
      },
      {
        code: "restaurant_tomato",
        categoryCode: "vegetables",
        canonicalName: "Tomato",
        canonicalDescription: "Fresh tomatoes for curries and salads.",
        translations: withDescriptions(names("Tomato", "टमाटर", "ટામેટા")),
        defaultTrackMethod: TrackMethod.WEIGHT,
        defaultUnitCode: "kg",
      },
      {
        code: "restaurant_milk",
        categoryCode: "dairy",
        canonicalName: "Milk",
        canonicalDescription: "Kitchen milk for tea and cooking.",
        translations: withDescriptions(names("Milk", "दूध", "દૂધ")),
        defaultTrackMethod: TrackMethod.VOLUME,
        defaultUnitCode: "l",
      },
      {
        code: "restaurant_cheese_block",
        categoryCode: "dairy",
        canonicalName: "Cheese Block",
        canonicalDescription: "Bulk cheese blocks for food prep.",
        translations: withDescriptions(names("Cheese Block", "चीज़ ब्लॉक", "ચીઝ બ્લોક")),
        defaultTrackMethod: TrackMethod.WEIGHT,
        defaultUnitCode: "kg",
      },
      {
        code: "restaurant_rice",
        categoryCode: "dry_goods",
        canonicalName: "Rice",
        canonicalDescription: "Bulk rice for biryani and thali prep.",
        translations: withDescriptions(names("Rice", "चावल", "ચોખા")),
        defaultTrackMethod: TrackMethod.WEIGHT,
        defaultUnitCode: "kg",
      },
      {
        code: "restaurant_cooking_oil",
        categoryCode: "oils_spices",
        canonicalName: "Cooking Oil",
        canonicalDescription: "Bulk refined oil for kitchen use.",
        translations: withDescriptions(names("Cooking Oil", "खाना पकाने का तेल", "રસોઈનું તેલ")),
        defaultTrackMethod: TrackMethod.VOLUME,
        defaultUnitCode: "l",
      },
      {
        code: "restaurant_potato",
        categoryCode: "vegetables",
        canonicalName: "Potato",
        canonicalDescription: "Potatoes for curries, fries, and prep.",
        translations: withDescriptions(names("Potato", "आलू", "બટાટા")),
        defaultTrackMethod: TrackMethod.WEIGHT,
        defaultUnitCode: "kg",
      },
      {
        code: "restaurant_turmeric_powder",
        categoryCode: "oils_spices",
        canonicalName: "Turmeric Powder",
        canonicalDescription: "Ground turmeric for spice mix prep.",
        translations: withDescriptions(names("Turmeric Powder", "हल्दी पाउडर", "હળદર પાઉડર")),
        defaultTrackMethod: TrackMethod.WEIGHT,
        defaultUnitCode: "kg",
      },
    ],
  },
  ...generatedIndustries,
];

function translationEntries(translations: TranslationWithDescriptionTriple) {
  return (Object.entries(translations) as Array<[keyof TranslationWithDescriptionTriple, TranslationWithDescriptionTriple[keyof TranslationWithDescriptionTriple]]>).map(
    ([language, value]) => ({
      language: language as LanguageCode,
      name: value.name,
      description: value.description ?? null,
    }),
  );
}

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



async function seedUnitTranslations() {
  const unitTranslations: Record<string, TranslationTriple> = {
    pcs: names("Pieces", "पीस", "પીસ"),
    kg: names("Kilogram", "किलोग्राम", "કિલોગ્રામ"),
    g: names("Gram", "ग्राम", "ગ્રામ"),
    l: names("Liter", "लीटर", "લિટર"),
    ml: names("Milliliter", "मिलीलीटर", "મિલીલીટર"),
    m: names("Meter", "मीटर", "મીટર"),
    cm: names("Centimeter", "सेंटीमीटर", "સેન્ટીમીટર"),
    box: names("Box", "डिब्बा", "બોક્સ"),
    pack: names("Pack", "पैक", "પેક"),
  };

  for (const [code, translations] of Object.entries(unitTranslations)) {
    const unit = await prisma.unit.findFirst({
      where: {
        organizationId: null,
        code,
      },
    });

    if (!unit) {
      continue;
    }

    await prisma.unitTranslation.deleteMany({
      where: {
        unitId: unit.id,
      },
    });

    await prisma.unitTranslation.createMany({
      data: (Object.entries(translations) as Array<[keyof TranslationTriple, string]>).map(([language, name]) => ({
        unitId: unit.id,
        language: language as LanguageCode,
        name,
      })),
    });
  }
}

async function seedIndustryCatalog(industrySeed: IndustrySeed) {
  const industry = await prisma.industry.upsert({
    where: { code: industrySeed.code },
    update: {
      name: industrySeed.canonicalName,
      description: industrySeed.canonicalDescription,
      isActive: true,
      defaultFeatures: industrySeed.defaultFeatures as Prisma.InputJsonValue,
    },
    create: {
      code: industrySeed.code,
      name: industrySeed.canonicalName,
      description: industrySeed.canonicalDescription,
      isActive: true,
      defaultFeatures: industrySeed.defaultFeatures as Prisma.InputJsonValue,
    },
  });

  await prisma.industryTranslation.deleteMany({
    where: {
      industryId: industry.id,
    },
  });

  await prisma.industryTranslation.createMany({
    data: translationEntries(industrySeed.translations).map((translation) => ({
      industryId: industry.id,
      ...translation,
    })),
  });

  for (const categorySeed of industrySeed.categories) {
    const category = await prisma.masterCatalogCategory.upsert({
      where: {
        industryId_code: {
          industryId: industry.id,
          code: categorySeed.code,
        },
      },
      update: {
        slug: slugify(categorySeed.code),
        sortOrder: categorySeed.sortOrder,
        isActive: true,
      },
      create: {
        industryId: industry.id,
        code: categorySeed.code,
        slug: slugify(categorySeed.code),
        sortOrder: categorySeed.sortOrder,
        isActive: true,
      },
    });

    await prisma.masterCatalogCategoryTranslation.deleteMany({
      where: {
        masterCategoryId: category.id,
      },
    });

    await prisma.masterCatalogCategoryTranslation.createMany({
      data: translationEntries(categorySeed.translations).map((translation) => ({
        masterCategoryId: category.id,
        ...translation,
      })),
    });
  }

  const categoriesByCode = new Map(
    (
      await prisma.masterCatalogCategory.findMany({
        where: {
          industryId: industry.id,
        },
        select: {
          id: true,
          code: true,
        },
      })
    ).map((category) => [category.code, category.id]),
  );

  for (const itemSeed of industrySeed.items) {
    const masterItemSlug = slugify(`${industrySeed.code}-${itemSeed.canonicalName}`);
    const masterItem = await prisma.masterCatalogItem.upsert({
      where: {
        code: itemSeed.code,
      },
      update: {
        industryId: industry.id,
        masterCategoryId: categoriesByCode.get(itemSeed.categoryCode) ?? null,
        slug: masterItemSlug,
        canonicalName: itemSeed.canonicalName,
        canonicalDescription: itemSeed.canonicalDescription ?? null,
        productType:
          itemSeed.hasVariants || (itemSeed.variantTemplates?.length ?? 0) > 0
            ? ProductType.VARIABLE
            : itemSeed.productType ?? ProductType.SIMPLE,
        defaultTrackMethod: itemSeed.defaultTrackMethod ?? TrackMethod.PIECE,
        defaultUnitCode: itemSeed.defaultUnitCode ?? "pcs",
        defaultBrandName: itemSeed.defaultBrandName ?? null,
        defaultTaxCode: itemSeed.defaultTaxCode ?? null,
        hasVariants: itemSeed.hasVariants ?? Boolean(itemSeed.variantTemplates?.length),
        trackInventory: itemSeed.trackInventory ?? true,
        allowBackorder: itemSeed.allowBackorder ?? false,
        allowNegativeStock: itemSeed.allowNegativeStock ?? false,
        defaultImageUrl: itemSeed.defaultImageUrl ?? null,
        tags: itemSeed.tags ?? [],
        customFieldsTemplate: undefined,
        metadata: undefined,
        isActive: true,
      },
      create: {
        industryId: industry.id,
        masterCategoryId: categoriesByCode.get(itemSeed.categoryCode) ?? null,
        code: itemSeed.code,
        slug: masterItemSlug,
        canonicalName: itemSeed.canonicalName,
        canonicalDescription: itemSeed.canonicalDescription ?? null,
        productType:
          itemSeed.hasVariants || (itemSeed.variantTemplates?.length ?? 0) > 0
            ? ProductType.VARIABLE
            : itemSeed.productType ?? ProductType.SIMPLE,
        defaultTrackMethod: itemSeed.defaultTrackMethod ?? TrackMethod.PIECE,
        defaultUnitCode: itemSeed.defaultUnitCode ?? "pcs",
        defaultBrandName: itemSeed.defaultBrandName ?? null,
        defaultTaxCode: itemSeed.defaultTaxCode ?? null,
        hasVariants: itemSeed.hasVariants ?? Boolean(itemSeed.variantTemplates?.length),
        trackInventory: itemSeed.trackInventory ?? true,
        allowBackorder: itemSeed.allowBackorder ?? false,
        allowNegativeStock: itemSeed.allowNegativeStock ?? false,
        defaultImageUrl: itemSeed.defaultImageUrl ?? null,
        tags: itemSeed.tags ?? [],
        customFieldsTemplate: undefined,
        metadata: undefined,
        searchText: "",
        isActive: true,
      },
    });

    await prisma.masterCatalogItemTranslation.deleteMany({
      where: {
        masterItemId: masterItem.id,
      },
    });

    await prisma.masterCatalogItemTranslation.createMany({
      data: (Object.entries(itemSeed.translations) as Array<[keyof TranslationWithDescriptionTriple, TranslationWithDescriptionTriple[keyof TranslationWithDescriptionTriple]]>).map(
        ([language, value]) => ({
          masterItemId: masterItem.id,
          language: language as LanguageCode,
          name: value.name,
          shortName: null,
          description: value.description ?? null,
        }),
      ),
    });

    await prisma.masterCatalogItemAlias.deleteMany({
      where: {
        masterItemId: masterItem.id,
      },
    });

    const aliases = normalizeMasterCatalogAliasValues(itemSeed.aliases ?? []);

    if (aliases.length > 0) {
      await prisma.masterCatalogItemAlias.createMany({
        data: aliases.map((alias) => ({
          masterItemId: masterItem.id,
          language: alias.language,
          value: alias.value,
        })),
      });
    }

    const existingVariantTemplates = await prisma.masterCatalogVariantTemplate.findMany({
      where: {
        masterItemId: masterItem.id,
      },
      select: {
        id: true,
      },
    });

    if (existingVariantTemplates.length > 0) {
      await prisma.masterCatalogVariantTranslation.deleteMany({
        where: {
          masterVariantTemplateId: {
            in: existingVariantTemplates.map((template) => template.id),
          },
        },
      });

      await prisma.masterCatalogVariantTemplate.deleteMany({
        where: {
          masterItemId: masterItem.id,
        },
      });
    }

    for (const [index, variantSeed] of (itemSeed.variantTemplates ?? []).entries()) {
      const createdVariant = await prisma.masterCatalogVariantTemplate.create({
        data: {
          masterItemId: masterItem.id,
          code: variantSeed.code,
          name: variantSeed.name,
          skuSuffix: variantSeed.skuSuffix ?? null,
          barcode: null,
          attributes: undefined,
          defaultCostPrice: null,
          defaultSellingPrice: null,
          defaultMrp: null,
          reorderLevel: 0,
          minStockLevel: 0,
          maxStockLevel: null,
          weight: null,
          unitCode: variantSeed.unitCode ?? itemSeed.defaultUnitCode ?? "pcs",
          isDefault: variantSeed.isDefault ?? index === 0,
          isActive: true,
          sortOrder: index,
          metadata: undefined,
        },
      });

      if (variantSeed.translations) {
        await prisma.masterCatalogVariantTranslation.createMany({
          data: (Object.entries(variantSeed.translations) as Array<[keyof TranslationTriple, string]>).map(([language, name]) => ({
            masterVariantTemplateId: createdVariant.id,
            language: language as LanguageCode,
            name,
          })),
        });
      }
    }

    const searchText = buildMasterItemSearchText({
      canonicalName: itemSeed.canonicalName,
      code: itemSeed.code,
      slug: masterItemSlug,
      translations: (Object.entries(itemSeed.translations) as Array<[keyof TranslationWithDescriptionTriple, TranslationWithDescriptionTriple[keyof TranslationWithDescriptionTriple]]>).map(
        ([, value]) => ({
          name: value.name,
          shortName: null,
        }),
      ),
      aliases,
    });

    await prisma.masterCatalogItem.update({
      where: {
        id: masterItem.id,
      },
      data: {
        searchText,
      },
    });
  }
}



type BilingualName = {
  EN: string;
  HI: string;
};

type BilingualNameDescription = {
  EN: { name: string; description?: string };
  HI: { name: string; description?: string };
};

type OrgBranchSeed = {
  code: string;
  name: string;
  type: BranchType;
  phone?: string;
  email?: string;
  addressLine1?: string;
  city?: string;
  state?: string;
  country?: string;
  postalCode?: string;
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

type OrgSupplierSeed = {
  code: string;
  translations: BilingualName;
  phone?: string;
  email?: string;
  taxNumber?: string;
  address?: Prisma.InputJsonValue;
  notes?: string;
};

type OrgCustomerSeed = {
  name: string;
  phone?: string;
  email?: string;
  notes?: string;
  address?: Prisma.InputJsonValue;
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
  productType?: ProductType;
  sourceType?: ProductSourceType;
  status?: ProductStatus;
  hasVariants?: boolean;
  trackInventory?: boolean;
  allowBackorder?: boolean;
  allowNegativeStock?: boolean;
  trackMethod?: TrackMethod;
  primaryUnitCode?: string;
  imageUrl?: string;
  tags?: string[];
  customFields?: Prisma.InputJsonValue;
  metadata?: Prisma.InputJsonValue;
  variants: OrgVariantSeed[];
};

type InventorySeed = {
  branchCode: string;
  sku: string;
  onHand: string;
  reserved?: string;
  incoming?: string;
  openingCost?: string;
  note?: string;
};

type BatchSeed = {
  branchCode: string;
  sku: string;
  batchNumber: string;
  manufactureDate?: string;
  expiryDate?: string;
  quantityOnHand: string;
  purchasePrice?: string;
  sellingPrice?: string;
  status?: BatchStatus;
  metadata?: Prisma.InputJsonValue;
};

type SerialSeed = {
  branchCode: string;
  sku: string;
  serialNumber: string;
};

type PurchaseReceiptSeed = {
  receiptNumber: string;
  branchCode: string;
  supplierCode?: string;
  invoiceDate?: string;
  receivedAt?: string;
  status?: PurchaseReceiptStatus;
  notes?: string;
  items: Array<{
    sku: string;
    quantity: string;
    unitCost: string;
    taxRate: string;
    discountAmount?: string;
    batchNumber?: string;
    expiryDate?: string;
  }>;
};

type SalesOrderSeed = {
  orderNumber: string;
  branchCode: string;
  customerPhone?: string;
  source: OrderSource;
  status?: SalesOrderStatus;
  paymentStatus?: PaymentStatus;
  notes?: string;
  rejectionReason?: string;
  confirmedAt?: string;
  deliveredAt?: string;
  items: Array<{
    sku: string;
    quantity: string;
    unitPrice: string;
    taxRate: string;
    discountAmount?: string;
  }>;
};

type StockTransferSeed = {
  transferNumber: string;
  fromBranchCode: string;
  toBranchCode: string;
  status?: StockTransferStatus;
  notes?: string;
  approvedAt?: string;
  items: Array<{
    sku: string;
    quantity: string;
    unitCost?: string;
  }>;
};

const extraIndustries: IndustrySeed[] = [
  {
    code: "kitchenware",
    canonicalName: "Kitchenware",
    canonicalDescription: "Kitchenware inventory for utensils, cookware, and food prep tools.",
    translations: withDescriptions(
      names("Kitchenware", "रसोई सामान", "રસોઈ સામાન"),
      {
        EN: "Kitchenware inventory for utensils, cookware, and food prep tools.",
        HI: "बर्तनों, कुकवेयर और फूड प्रेप टूल्स के लिए रसोई इन्वेंट्री।",
        GU: "વાસણો, કુકવેર અને ફૂડ પ્રેપ ટૂલ્સ માટેની રસોઈ ઇન્વેન્ટરી.",
      },
    ),
    defaultFeatures: generatedIndustryFeatureSet,
    categories: [
      { code: "cookware", sortOrder: 1, translations: withDescriptions(names("Cookware", "कुकवेयर", "કુકવેર")) },
      { code: "utensils", sortOrder: 2, translations: withDescriptions(names("Utensils", "बर्तन", "વાસણો")) },
      { code: "storage", sortOrder: 3, translations: withDescriptions(names("Storage", "स्टोरेज", "સ્ટોરેજ")) },
      { code: "prep_tools", sortOrder: 4, translations: withDescriptions(names("Prep Tools", "तैयारी उपकरण", "તૈયારી સાધનો")) },
    ],
    items: [
      {
        code: "kitchenware_frying_pan",
        categoryCode: "cookware",
        canonicalName: "Frying Pan",
        canonicalDescription: "Non-stick frying pan for daily cooking.",
        translations: withDescriptions(names("Frying Pan", "फ्राइंग पैन", "ફ્રાયિંગ પેન")),
        defaultUnitCode: "pcs",
      },
      {
        code: "kitchenware_pressure_cooker",
        categoryCode: "cookware",
        canonicalName: "Pressure Cooker",
        canonicalDescription: "Pressure cooker for home kitchens.",
        translations: withDescriptions(names("Pressure Cooker", "प्रेशर कुकर", "પ્રેશર કુકર")),
        defaultUnitCode: "pcs",
      },
      {
        code: "kitchenware_steel_spoon_set",
        categoryCode: "utensils",
        canonicalName: "Steel Spoon Set",
        canonicalDescription: "Stainless steel spoon set.",
        translations: withDescriptions(names("Steel Spoon Set", "स्टील चम्मच सेट", "સ્ટીલ ચમચી સેટ")),
        defaultUnitCode: "box",
      },
      {
        code: "kitchenware_food_container",
        categoryCode: "storage",
        canonicalName: "Food Container",
        canonicalDescription: "Airtight storage container for kitchen use.",
        translations: withDescriptions(names("Food Container", "फूड कंटेनर", "ફૂડ કન્ટેનર")),
        defaultUnitCode: "pcs",
      },
      {
        code: "kitchenware_cutting_board",
        categoryCode: "prep_tools",
        canonicalName: "Cutting Board",
        canonicalDescription: "Board for vegetable and meat preparation.",
        translations: withDescriptions(names("Cutting Board", "कटिंग बोर्ड", "કટિંગ બોર્ડ")),
        defaultUnitCode: "pcs",
      },
    ],
  },
  {
    code: "optical",
    canonicalName: "Optical",
    canonicalDescription: "Optical shop inventory for frames, lenses, and eye care accessories.",
    translations: withDescriptions(
      names("Optical", "ऑप्टिकल", "ઓપ્ટિકલ"),
      {
        EN: "Optical shop inventory for frames, lenses, and eye care accessories.",
        HI: "फ्रेम, लेंस और आई केयर एक्सेसरीज़ के लिए ऑप्टिकल शॉप इन्वेंट्री।",
        GU: "ફ્રેમ, લેન્સ અને આંખની સંભાળની એક્સેસરીઝ માટેની ઑપ્ટિકલ ઇન્વેન્ટરી.",
      },
    ),
    defaultFeatures: {
      ...generatedIndustryFeatureSet,
      supportsSerialTracking: true,
      supportsWeightBasedStock: false,
    },
    categories: [
      { code: "frames", sortOrder: 1, translations: withDescriptions(names("Frames", "फ्रेम", "ફ્રેમ")) },
      { code: "lenses", sortOrder: 2, translations: withDescriptions(names("Lenses", "लेंस", "લેન્સ")) },
      { code: "sunglasses", sortOrder: 3, translations: withDescriptions(names("Sunglasses", "सनग्लासेस", "સનગ્લાસિસ")) },
      { code: "accessories", sortOrder: 4, translations: withDescriptions(names("Accessories", "एक्सेसरीज़", "એસેસરીઝ")) },
    ],
    items: [
      {
        code: "optical_frame",
        categoryCode: "frames",
        canonicalName: "Optical Frame",
        canonicalDescription: "Prescription frame for daily wear.",
        translations: withDescriptions(names("Optical Frame", "ऑप्टिकल फ्रेम", "ઓપ્ટિકલ ફ્રેમ")),
        hasVariants: true,
        variantTemplates: sizeVariants(),
        defaultUnitCode: "pcs",
      },
      {
        code: "optical_power_lens",
        categoryCode: "lenses",
        canonicalName: "Power Lens",
        canonicalDescription: "Single vision power lens pair.",
        translations: withDescriptions(names("Power Lens", "पावर लेंस", "પાવર લેન્સ")),
        defaultUnitCode: "pack",
      },
      {
        code: "optical_sunglasses",
        categoryCode: "sunglasses",
        canonicalName: "Sunglasses",
        canonicalDescription: "Fashion sunglasses for retail display.",
        translations: withDescriptions(names("Sunglasses", "सनग्लासेस", "સનગ્લાસિસ")),
        defaultUnitCode: "pcs",
      },
      {
        code: "optical_lens_cleaner",
        categoryCode: "accessories",
        canonicalName: "Lens Cleaner",
        canonicalDescription: "Lens cleaning spray bottle.",
        translations: withDescriptions(names("Lens Cleaner", "लेंस क्लीनर", "લેન્સ ક્લીનર")),
        defaultTrackMethod: TrackMethod.VOLUME,
        defaultUnitCode: "ml",
      },
      {
        code: "optical_case",
        categoryCode: "accessories",
        canonicalName: "Eyeglass Case",
        canonicalDescription: "Hard case for eyeglasses.",
        translations: withDescriptions(names("Eyeglass Case", "चश्मा केस", "ચશ્માનો કેસ")),
        defaultUnitCode: "pcs",
      },
    ],
  },
  {
    code: "florist",
    canonicalName: "Florist",
    canonicalDescription: "Florist inventory for flowers, bouquets, gifting, and decor.",
    translations: withDescriptions(
      names("Florist", "फ्लोरिस्ट", "ફ્લોરિસ્ટ"),
      {
        EN: "Florist inventory for flowers, bouquets, gifting, and decor.",
        HI: "फूल, बुके, गिफ्टिंग और डेकोर के लिए फ्लोरिस्ट इन्वेंट्री।",
        GU: "ફૂલ, બુકે, ગિફ્ટિંગ અને ડેકોર માટેની ફ્લોરિસ્ટ ઇન્વેન્ટરી.",
      },
    ),
    defaultFeatures: {
      ...generatedIndustryFeatureSet,
      supportsExpiry: true,
    },
    categories: [
      { code: "fresh_flowers", sortOrder: 1, translations: withDescriptions(names("Fresh Flowers", "ताज़े फूल", "તાજા ફૂલ")) },
      { code: "bouquets", sortOrder: 2, translations: withDescriptions(names("Bouquets", "बुके", "બુકે")) },
      { code: "plants", sortOrder: 3, translations: withDescriptions(names("Plants", "पौधे", "છોડ")) },
      { code: "gift_wrap", sortOrder: 4, translations: withDescriptions(names("Gift Wrap", "गिफ्ट रैप", "ગિફ્ટ રેપ")) },
    ],
    items: [
      {
        code: "florist_rose_stem",
        categoryCode: "fresh_flowers",
        canonicalName: "Rose Stem",
        canonicalDescription: "Single fresh rose stem.",
        translations: withDescriptions(names("Rose Stem", "गुलाब डंडी", "ગુલાબ ડાંડી")),
        defaultUnitCode: "pcs",
      },
      {
        code: "florist_lily_bouquet",
        categoryCode: "bouquets",
        canonicalName: "Lily Bouquet",
        canonicalDescription: "Wrapped bouquet of lilies.",
        translations: withDescriptions(names("Lily Bouquet", "लिली बुके", "લિલી બુકે")),
        defaultUnitCode: "pcs",
      },
      {
        code: "florist_money_plant",
        categoryCode: "plants",
        canonicalName: "Money Plant",
        canonicalDescription: "Indoor potted money plant.",
        translations: withDescriptions(names("Money Plant", "मनी प्लांट", "મની પ્લાન્ટ")),
        defaultUnitCode: "pcs",
      },
      {
        code: "florist_gift_paper",
        categoryCode: "gift_wrap",
        canonicalName: "Gift Wrap Paper",
        canonicalDescription: "Decorative flower wrapping paper.",
        translations: withDescriptions(names("Gift Wrap Paper", "गिफ्ट रैप पेपर", "ગિફ્ટ રેપ પેપર")),
        defaultUnitCode: "pack",
      },
      {
        code: "florist_oasis_foam",
        categoryCode: "bouquets",
        canonicalName: "Floral Foam",
        canonicalDescription: "Foam block for flower arrangement.",
        translations: withDescriptions(names("Floral Foam", "फ्लोरल फोम", "ફ્લોરલ ફોમ")),
        defaultUnitCode: "pcs",
      },
    ],
  },
  {
    code: "frozen_food",
    canonicalName: "Frozen Food",
    canonicalDescription: "Frozen food inventory for cold storage and quick commerce retail.",
    translations: withDescriptions(
      names("Frozen Food", "फ्रोजन फूड", "ફ્રોઝન ફૂડ"),
      {
        EN: "Frozen food inventory for cold storage and quick commerce retail.",
        HI: "कोल्ड स्टोरेज और क्विक कॉमर्स रिटेल के लिए फ्रोजन फूड इन्वेंट्री।",
        GU: "કોલ્ડ સ્ટોરેજ અને ક્વિક કોમર્સ રિટેલ માટેની ફ્રોઝન ફૂડ ઇન્વેન્ટરી.",
      },
    ),
    defaultFeatures: {
      ...generatedIndustryFeatureSet,
      supportsExpiry: true,
      supportsBatchTracking: true,
    },
    categories: [
      { code: "snacks", sortOrder: 1, translations: withDescriptions(names("Snacks", "स्नैक्स", "નાસ્તો")) },
      { code: "desserts", sortOrder: 2, translations: withDescriptions(names("Desserts", "डेज़र्ट", "ડેઝર્ટ")) },
      { code: "meals", sortOrder: 3, translations: withDescriptions(names("Meals", "मील्स", "મીલ્સ")) },
      { code: "ice", sortOrder: 4, translations: withDescriptions(names("Ice", "बर्फ", "બરફ")) },
    ],
    items: [
      {
        code: "frozen_food_fries",
        categoryCode: "snacks",
        canonicalName: "Frozen Fries",
        canonicalDescription: "Ready-to-fry potato fries.",
        translations: withDescriptions(names("Frozen Fries", "फ्रोजन फ्राइज़", "ફ્રોઝન ફ્રાઇઝ")),
        defaultTrackMethod: TrackMethod.WEIGHT,
        defaultUnitCode: "kg",
      },
      {
        code: "frozen_food_icecream_tub",
        categoryCode: "desserts",
        canonicalName: "Ice Cream Tub",
        canonicalDescription: "Frozen dessert tub for retail sale.",
        translations: withDescriptions(names("Ice Cream Tub", "आइस क्रीम टब", "આઈસ ક્રીમ ટબ")),
        defaultUnitCode: "box",
      },
      {
        code: "frozen_food_peas",
        categoryCode: "meals",
        canonicalName: "Frozen Peas",
        canonicalDescription: "Frozen green peas pack.",
        translations: withDescriptions(names("Frozen Peas", "फ्रोजन मटर", "ફ્રોઝન વટાણા")),
        defaultTrackMethod: TrackMethod.WEIGHT,
        defaultUnitCode: "kg",
      },
      {
        code: "frozen_food_ice_cubes",
        categoryCode: "ice",
        canonicalName: "Ice Cubes",
        canonicalDescription: "Bagged ice cubes for beverage counters.",
        translations: withDescriptions(names("Ice Cubes", "आइस क्यूब्स", "આઇસ ક્યુબ્સ")),
        defaultTrackMethod: TrackMethod.WEIGHT,
        defaultUnitCode: "kg",
      },
      {
        code: "frozen_food_momos",
        categoryCode: "snacks",
        canonicalName: "Frozen Momos",
        canonicalDescription: "Frozen momo packs for cafes and stores.",
        translations: withDescriptions(names("Frozen Momos", "फ्रोजन मोमोज", "ફ્રોઝન મોમોઝ")),
        defaultUnitCode: "pack",
      },
    ],
  },
];

const groceryDemoBranches: OrgBranchSeed[] = [
  {
    code: "GROC-STORE-1",
    name: "NearCart Grocery Main Store",
    type: BranchType.STORE,
    phone: "+91-9900001101",
    email: "store.grocery@nearcart.local",
    addressLine1: "12 Market Yard Road",
    city: "Ahmedabad",
    state: "Gujarat",
    country: "India",
    postalCode: "380001",
  },
  {
    code: "GROC-WH-1",
    name: "NearCart Grocery Warehouse",
    type: BranchType.WAREHOUSE,
    phone: "+91-9900001102",
    email: "warehouse.grocery@nearcart.local",
    addressLine1: "Plot 44 Narol Logistics Park",
    city: "Ahmedabad",
    state: "Gujarat",
    country: "India",
    postalCode: "382405",
  },
  {
    code: "GROC-DS-1",
    name: "NearCart Grocery Dark Store",
    type: BranchType.DARK_STORE,
    phone: "+91-9900001103",
    email: "darkstore.grocery@nearcart.local",
    addressLine1: "8 Satellite Quick Commerce Hub",
    city: "Ahmedabad",
    state: "Gujarat",
    country: "India",
    postalCode: "380015",
  },
];

const groceryDemoBrands: OrgBrandSeed[] = [
  { slug: "amul", translations: { EN: "Amul", HI: "अमूल" } },
  { slug: "mother-dairy", translations: { EN: "Mother Dairy", HI: "मदर डेयरी" } },
  { slug: "britannia", translations: { EN: "Britannia", HI: "ब्रिटानिया" } },
  { slug: "haldiram", translations: { EN: "Haldiram", HI: "हल्दीराम" } },
  { slug: "bisleri", translations: { EN: "Bisleri", HI: "बिसलेरी" } },
  { slug: "india-gate", translations: { EN: "India Gate", HI: "इंडिया गेट" } },
  { slug: "aashirvaad", translations: { EN: "Aashirvaad", HI: "आशीर्वाद" } },
  { slug: "fortune", translations: { EN: "Fortune", HI: "फॉर्च्यून" } },
  { slug: "parle", translations: { EN: "Parle", HI: "पारले" } },
  { slug: "tata-sampann", translations: { EN: "Tata Sampann", HI: "टाटा संपन्न" } },
  { slug: "tata-tea", translations: { EN: "Tata Tea", HI: "टाटा टी" } },
  { slug: "maggi", translations: { EN: "Maggi", HI: "मैगी" } },
];

const groceryDemoCategories: OrgCategorySeed[] = [
  {
    slug: "milk-dairy",
    sortOrder: 1,
    translations: {
      EN: { name: "Milk & Dairy", description: "Milk, curd, paneer, and related daily items." },
      HI: { name: "दूध और डेयरी", description: "दूध, दही, पनीर और रोज़मर्रा की डेयरी चीजें।" },
    },
  },
  {
    slug: "snacks-biscuits",
    sortOrder: 2,
    translations: {
      EN: { name: "Snacks & Biscuits", description: "Chips, namkeen, and biscuit packs." },
      HI: { name: "स्नैक्स और बिस्किट", description: "चिप्स, नमकीन और बिस्किट पैक।" },
    },
  },
  {
    slug: "rice-atta",
    sortOrder: 3,
    translations: {
      EN: { name: "Rice & Atta", description: "Rice, wheat flour, and staple packs." },
      HI: { name: "चावल और आटा", description: "चावल, गेहूं का आटा और राशन पैक।" },
    },
  },
  {
    slug: "oils-ghee",
    sortOrder: 4,
    translations: {
      EN: { name: "Oils & Ghee", description: "Edible oils and cooking essentials." },
      HI: { name: "तेल और घी", description: "खाद्य तेल और कुकिंग की ज़रूरी चीजें।" },
    },
  },
  {
    slug: "beverages",
    sortOrder: 5,
    translations: {
      EN: { name: "Beverages", description: "Water and drinkable retail products." },
      HI: { name: "पेय पदार्थ", description: "पानी और पीने वाले रिटेल प्रोडक्ट।" },
    },
  },
  {
    slug: "tea-breakfast",
    sortOrder: 6,
    translations: {
      EN: { name: "Tea & Breakfast", description: "Tea, instant breakfast, and daily pantry picks." },
      HI: { name: "चाय और नाश्ता", description: "चाय, इंस्टेंट नाश्ता और रोज़ के पेंट्री प्रोडक्ट।" },
    },
  },
  {
    slug: "pulses-spices",
    sortOrder: 7,
    translations: {
      EN: { name: "Pulses & Spices", description: "Dal, pulses, and cooking essentials for Indian kitchens." },
      HI: { name: "दाल और मसाले", description: "भारतीय रसोई के लिए दाल, पल्सेस और कुकिंग ज़रूरतें।" },
    },
  },
];

const grocerySuppliers: OrgSupplierSeed[] = [
  {
    code: "SUP-AMUL-01",
    translations: { EN: "Amul Distribution Ahmedabad", HI: "अमूल डिस्ट्रीब्यूशन अहमदाबाद" },
    phone: "+91-9033011001",
    email: "amul.ahd@suppliers.local",
    taxNumber: "24AAACA1111A1Z1",
    address: { city: "Ahmedabad", state: "Gujarat", line1: "Amul Cold Chain Depot, Vatva" },
    notes: "Daily dairy supply partner.",
  },
  {
    code: "SUP-MD-01",
    translations: { EN: "Mother Dairy West Zone", HI: "मदर डेयरी वेस्ट ज़ोन" },
    phone: "+91-9033011002",
    email: "motherdairy.wz@suppliers.local",
    taxNumber: "24AAACM2222B1Z2",
    address: { city: "Ahmedabad", state: "Gujarat", line1: "Shahwadi Cold Storage Road" },
  },
  {
    code: "SUP-DRY-01",
    translations: { EN: "Staple Wholesale Hub", HI: "स्टेपल होलसेल हब" },
    phone: "+91-9033011003",
    email: "staples@suppliers.local",
    taxNumber: "24AACCS3333C1Z3",
    address: { city: "Ahmedabad", state: "Gujarat", line1: "Narol Grain Market" },
  },
  {
    code: "SUP-SNACK-01",
    translations: { EN: "National Snacks Distributor", HI: "नेशनल स्नैक्स डिस्ट्रीब्यूटर" },
    phone: "+91-9033011004",
    email: "snacks@suppliers.local",
    taxNumber: "24AACCN4444D1Z4",
    address: { city: "Ahmedabad", state: "Gujarat", line1: "Odhav FMCG Lane" },
  },
];

const groceryCustomers: OrgCustomerSeed[] = [
  { name: "Rakesh Patel", phone: "+91-9870001001", email: "rakesh.patel@example.com", notes: "Frequent family grocery customer." },
  { name: "Neha Shah", phone: "+91-9870001002", email: "neha.shah@example.com", notes: "Orders through WhatsApp." },
  { name: "Aarav Mehta", phone: "+91-9870001003", email: "aarav.mehta@example.com", notes: "Quick commerce repeat buyer." },
  { name: "Priya Joshi", phone: "+91-9870001004", email: "priya.joshi@example.com", notes: "Weekend bulk orders." },
  { name: "Manan Desai", phone: "+91-9870001005", email: "manan.desai@example.com", notes: "Corporate pantry purchaser." },
];

const groceryProducts: OrgProductSeed[] = [
  {
    slug: "amul-fresh-milk",
    masterItemCode: "grocery_milk",
    industryCode: "grocery",
    categorySlug: "milk-dairy",
    brandSlug: "amul",
    name: "Amul Fresh Milk",
    nameHi: "अमूल फ्रेश दूध",
    description: "Fresh pouch milk for daily retail sale.",
    descriptionHi: "रोज़ाना रिटेल बिक्री के लिए ताज़ा दूध पाउच।",
    primaryUnitCode: "l",
    trackMethod: TrackMethod.VOLUME,
    tags: ["milk", "daily", "cold-chain"],
    variants: [
      {
        name: "500 ml",
        sku: "AMUL-MILK-500",
        attributes: { size: "500 ml" },
        costPrice: "26.00",
        sellingPrice: "29.00",
        mrp: "30.00",
        reorderLevel: "25",
        minStockLevel: "20",
        maxStockLevel: "180",
        unitCode: "ml",
        isDefault: true,
        translations: { EN: "500 ml", HI: "500 मि.ली." },
      },
      {
        name: "1 Liter",
        sku: "AMUL-MILK-1L",
        attributes: { size: "1 Liter" },
        costPrice: "51.00",
        sellingPrice: "56.00",
        mrp: "58.00",
        reorderLevel: "20",
        minStockLevel: "15",
        maxStockLevel: "160",
        unitCode: "l",
        translations: { EN: "1 Liter", HI: "1 लीटर" },
      },
    ],
  },
  {
    slug: "amul-paneer",
    masterItemCode: "grocery_paneer",
    industryCode: "grocery",
    categorySlug: "milk-dairy",
    brandSlug: "amul",
    name: "Amul Paneer",
    nameHi: "अमूल पनीर",
    description: "Fresh paneer cubes for home cooking and quick meals.",
    descriptionHi: "घर के खाना पकाने और क्विक मील्स के लिए ताज़ा पनीर क्यूब्स।",
    primaryUnitCode: "kg",
    trackMethod: TrackMethod.WEIGHT,
    tags: ["paneer", "dairy", "protein"],
    variants: [
      {
        name: "200 g Pack",
        sku: "AMUL-PANEER-200",
        attributes: { size: "200 g" },
        costPrice: "78.00",
        sellingPrice: "88.00",
        mrp: "90.00",
        reorderLevel: "16",
        minStockLevel: "12",
        maxStockLevel: "90",
        unitCode: "g",
        isDefault: true,
        translations: { EN: "200 g Pack", HI: "200 ग्राम पैक" },
      },
      {
        name: "500 g Pack",
        sku: "AMUL-PANEER-500",
        attributes: { size: "500 g" },
        costPrice: "188.00",
        sellingPrice: "210.00",
        mrp: "215.00",
        reorderLevel: "10",
        minStockLevel: "8",
        maxStockLevel: "60",
        unitCode: "g",
        translations: { EN: "500 g Pack", HI: "500 ग्राम पैक" },
      },
    ],
  },
  {
    slug: "mother-dairy-curd",
    masterItemCode: "grocery_curd",
    industryCode: "grocery",
    categorySlug: "milk-dairy",
    brandSlug: "mother-dairy",
    name: "Mother Dairy Curd",
    nameHi: "मदर डेयरी दही",
    description: "Fresh curd tubs for home and hostel use.",
    descriptionHi: "घर और हॉस्टल उपयोग के लिए ताज़ा दही टब।",
    primaryUnitCode: "kg",
    trackMethod: TrackMethod.WEIGHT,
    tags: ["curd", "daily", "cold-chain"],
    variants: [
      {
        name: "400 g",
        sku: "MD-CURD-400G",
        attributes: { size: "400 g" },
        costPrice: "30.00",
        sellingPrice: "35.00",
        mrp: "36.00",
        reorderLevel: "18",
        minStockLevel: "12",
        maxStockLevel: "120",
        unitCode: "g",
        isDefault: true,
        translations: { EN: "400 g", HI: "400 ग्राम" },
      },
      {
        name: "1 kg",
        sku: "MD-CURD-1KG",
        attributes: { size: "1 kg" },
        costPrice: "65.00",
        sellingPrice: "74.00",
        mrp: "76.00",
        reorderLevel: "10",
        minStockLevel: "8",
        maxStockLevel: "90",
        unitCode: "kg",
        translations: { EN: "1 kg", HI: "1 किलो" },
      },
    ],
  },
  {
    slug: "britannia-biscuits",
    masterItemCode: "grocery_biscuits",
    industryCode: "grocery",
    categorySlug: "snacks-biscuits",
    brandSlug: "britannia",
    name: "Britannia Biscuits",
    nameHi: "ब्रिटानिया बिस्किट",
    description: "Tea-time biscuit packs.",
    descriptionHi: "चाय के समय के बिस्किट पैक।",
    primaryUnitCode: "pack",
    trackMethod: TrackMethod.PIECE,
    tags: ["biscuits", "snacks"],
    variants: [
      {
        name: "60 g Pack",
        sku: "BRIT-BISC-60",
        attributes: { size: "60 g" },
        costPrice: "8.50",
        sellingPrice: "10.00",
        mrp: "10.00",
        reorderLevel: "40",
        minStockLevel: "30",
        maxStockLevel: "250",
        unitCode: "pack",
        isDefault: true,
        translations: { EN: "60 g Pack", HI: "60 ग्राम पैक" },
      },
      {
        name: "120 g Pack",
        sku: "BRIT-BISC-120",
        attributes: { size: "120 g" },
        costPrice: "18.00",
        sellingPrice: "22.00",
        mrp: "22.00",
        reorderLevel: "30",
        minStockLevel: "20",
        maxStockLevel: "180",
        unitCode: "pack",
        translations: { EN: "120 g Pack", HI: "120 ग्राम पैक" },
      },
    ],
  },
  {
    slug: "haldiram-potato-chips",
    masterItemCode: "grocery_potato_chips",
    industryCode: "grocery",
    categorySlug: "snacks-biscuits",
    brandSlug: "haldiram",
    name: "Haldiram Potato Chips",
    nameHi: "हल्दीराम आलू चिप्स",
    description: "Popular salted and masala chips.",
    descriptionHi: "लोकप्रिय नमकीन और मसाला चिप्स।",
    primaryUnitCode: "pack",
    trackMethod: TrackMethod.PIECE,
    tags: ["chips", "snacks"],
    variants: [
      {
        name: "52 g Pack",
        sku: "HAL-CHIPS-52",
        attributes: { size: "52 g" },
        costPrice: "17.00",
        sellingPrice: "20.00",
        mrp: "20.00",
        reorderLevel: "35",
        minStockLevel: "25",
        maxStockLevel: "200",
        unitCode: "pack",
        isDefault: true,
        translations: { EN: "52 g Pack", HI: "52 ग्राम पैक" },
      },
      {
        name: "90 g Pack",
        sku: "HAL-CHIPS-90",
        attributes: { size: "90 g" },
        costPrice: "26.00",
        sellingPrice: "30.00",
        mrp: "30.00",
        reorderLevel: "25",
        minStockLevel: "18",
        maxStockLevel: "160",
        unitCode: "pack",
        translations: { EN: "90 g Pack", HI: "90 ग्राम पैक" },
      },
    ],
  },
  {
    slug: "bisleri-mineral-water",
    masterItemCode: "grocery_packaged_water",
    industryCode: "grocery",
    categorySlug: "beverages",
    brandSlug: "bisleri",
    name: "Bisleri Mineral Water",
    nameHi: "बिसलेरी मिनरल वाटर",
    description: "Packaged drinking water for home, office, and travel use.",
    descriptionHi: "घर, ऑफिस और यात्रा के लिए पैक्ड पीने का पानी।",
    primaryUnitCode: "l",
    trackMethod: TrackMethod.VOLUME,
    tags: ["water", "beverages", "daily-use"],
    variants: [
      {
        name: "1 Liter Bottle",
        sku: "BIS-WATER-1L",
        attributes: { size: "1 Liter" },
        costPrice: "16.00",
        sellingPrice: "20.00",
        mrp: "20.00",
        reorderLevel: "36",
        minStockLevel: "24",
        maxStockLevel: "220",
        unitCode: "l",
        isDefault: true,
        translations: { EN: "1 Liter Bottle", HI: "1 लीटर बोतल" },
      },
      {
        name: "2 Liter Bottle",
        sku: "BIS-WATER-2L",
        attributes: { size: "2 Liter" },
        costPrice: "28.00",
        sellingPrice: "35.00",
        mrp: "35.00",
        reorderLevel: "20",
        minStockLevel: "14",
        maxStockLevel: "140",
        unitCode: "l",
        translations: { EN: "2 Liter Bottle", HI: "2 लीटर बोतल" },
      },
    ],
  },
  {
    slug: "india-gate-rice",
    masterItemCode: "grocery_rice",
    industryCode: "grocery",
    categorySlug: "rice-atta",
    brandSlug: "india-gate",
    name: "India Gate Rice",
    nameHi: "इंडिया गेट चावल",
    description: "Everyday rice for families and hostels.",
    descriptionHi: "परिवार और हॉस्टल के लिए रोज़मर्रा का चावल।",
    primaryUnitCode: "kg",
    trackMethod: TrackMethod.WEIGHT,
    tags: ["rice", "staples"],
    variants: [
      {
        name: "5 kg Bag",
        sku: "IG-RICE-5KG",
        attributes: { size: "5 kg" },
        costPrice: "255.00",
        sellingPrice: "290.00",
        mrp: "299.00",
        reorderLevel: "15",
        minStockLevel: "10",
        maxStockLevel: "80",
        unitCode: "kg",
        isDefault: true,
        translations: { EN: "5 kg Bag", HI: "5 किलो बैग" },
      },
      {
        name: "10 kg Bag",
        sku: "IG-RICE-10KG",
        attributes: { size: "10 kg" },
        costPrice: "500.00",
        sellingPrice: "565.00",
        mrp: "580.00",
        reorderLevel: "10",
        minStockLevel: "6",
        maxStockLevel: "60",
        unitCode: "kg",
        translations: { EN: "10 kg Bag", HI: "10 किलो बैग" },
      },
    ],
  },
  {
    slug: "aashirvaad-atta",
    masterItemCode: "grocery_wheat_flour",
    industryCode: "grocery",
    categorySlug: "rice-atta",
    brandSlug: "aashirvaad",
    name: "Aashirvaad Atta",
    nameHi: "आशीर्वाद आटा",
    description: "Whole wheat flour for homes and kitchens.",
    descriptionHi: "घर और रसोई के लिए गेहूं का आटा।",
    primaryUnitCode: "kg",
    trackMethod: TrackMethod.WEIGHT,
    tags: ["atta", "staples"],
    variants: [
      {
        name: "5 kg Pack",
        sku: "AA-ATTA-5KG",
        attributes: { size: "5 kg" },
        costPrice: "210.00",
        sellingPrice: "235.00",
        mrp: "240.00",
        reorderLevel: "14",
        minStockLevel: "10",
        maxStockLevel: "90",
        unitCode: "kg",
        isDefault: true,
        translations: { EN: "5 kg Pack", HI: "5 किलो पैक" },
      },
      {
        name: "10 kg Pack",
        sku: "AA-ATTA-10KG",
        attributes: { size: "10 kg" },
        costPrice: "405.00",
        sellingPrice: "455.00",
        mrp: "465.00",
        reorderLevel: "8",
        minStockLevel: "6",
        maxStockLevel: "60",
        unitCode: "kg",
        translations: { EN: "10 kg Pack", HI: "10 किलो पैक" },
      },
    ],
  },
  {
    slug: "tata-sampann-toor-dal",
    masterItemCode: "grocery_toor_dal",
    industryCode: "grocery",
    categorySlug: "pulses-spices",
    brandSlug: "tata-sampann",
    name: "Tata Sampann Toor Dal",
    nameHi: "टाटा संपन्न तूर दाल",
    description: "Everyday toor dal for Indian home cooking.",
    descriptionHi: "भारतीय घरों के रोज़मर्रा खाना पकाने के लिए तूर दाल।",
    primaryUnitCode: "kg",
    trackMethod: TrackMethod.WEIGHT,
    tags: ["dal", "staples", "protein"],
    variants: [
      {
        name: "1 kg Pack",
        sku: "TS-TOOR-1KG",
        attributes: { size: "1 kg" },
        costPrice: "155.00",
        sellingPrice: "172.00",
        mrp: "175.00",
        reorderLevel: "18",
        minStockLevel: "12",
        maxStockLevel: "110",
        unitCode: "kg",
        isDefault: true,
        translations: { EN: "1 kg Pack", HI: "1 किलो पैक" },
      },
      {
        name: "2 kg Pack",
        sku: "TS-TOOR-2KG",
        attributes: { size: "2 kg" },
        costPrice: "302.00",
        sellingPrice: "334.00",
        mrp: "340.00",
        reorderLevel: "12",
        minStockLevel: "8",
        maxStockLevel: "70",
        unitCode: "kg",
        translations: { EN: "2 kg Pack", HI: "2 किलो पैक" },
      },
    ],
  },
  {
    slug: "fortune-cooking-oil",
    masterItemCode: "grocery_cooking_oil",
    industryCode: "grocery",
    categorySlug: "oils-ghee",
    brandSlug: "fortune",
    name: "Fortune Cooking Oil",
    nameHi: "फॉर्च्यून कुकिंग ऑयल",
    description: "Refined oil for daily cooking.",
    descriptionHi: "रोज़ की कुकिंग के लिए रिफाइंड तेल।",
    primaryUnitCode: "l",
    trackMethod: TrackMethod.VOLUME,
    tags: ["oil", "kitchen"],
    variants: [
      {
        name: "1 Liter Pouch",
        sku: "FORT-OIL-1L",
        attributes: { size: "1 Liter" },
        costPrice: "128.00",
        sellingPrice: "145.00",
        mrp: "148.00",
        reorderLevel: "20",
        minStockLevel: "16",
        maxStockLevel: "120",
        unitCode: "l",
        isDefault: true,
        translations: { EN: "1 Liter Pouch", HI: "1 लीटर पाउच" },
      },
      {
        name: "5 Liter Jar",
        sku: "FORT-OIL-5L",
        attributes: { size: "5 Liter" },
        costPrice: "620.00",
        sellingPrice: "690.00",
        mrp: "710.00",
        reorderLevel: "10",
        minStockLevel: "8",
        maxStockLevel: "70",
        unitCode: "l",
        translations: { EN: "5 Liter Jar", HI: "5 लीटर जार" },
      },
    ],
  },
  {
    slug: "tata-tea-gold",
    masterItemCode: "grocery_tea",
    industryCode: "grocery",
    categorySlug: "tea-breakfast",
    brandSlug: "tata-tea",
    name: "Tata Tea Gold",
    nameHi: "टाटा टी गोल्ड",
    description: "Strong daily chai blend for homes and offices.",
    descriptionHi: "घर और ऑफिस के लिए मज़बूत रोज़ाना चाय ब्लेंड।",
    primaryUnitCode: "pack",
    trackMethod: TrackMethod.PIECE,
    tags: ["tea", "breakfast", "chai"],
    variants: [
      {
        name: "500 g Pack",
        sku: "TT-GOLD-500",
        attributes: { size: "500 g" },
        costPrice: "248.00",
        sellingPrice: "275.00",
        mrp: "280.00",
        reorderLevel: "12",
        minStockLevel: "8",
        maxStockLevel: "70",
        unitCode: "pack",
        isDefault: true,
        translations: { EN: "500 g Pack", HI: "500 ग्राम पैक" },
      },
      {
        name: "1 kg Pack",
        sku: "TT-GOLD-1KG",
        attributes: { size: "1 kg" },
        costPrice: "485.00",
        sellingPrice: "535.00",
        mrp: "545.00",
        reorderLevel: "8",
        minStockLevel: "6",
        maxStockLevel: "45",
        unitCode: "pack",
        translations: { EN: "1 kg Pack", HI: "1 किलो पैक" },
      },
    ],
  },
  {
    slug: "maggi-noodles",
    masterItemCode: "grocery_noodles",
    industryCode: "grocery",
    categorySlug: "tea-breakfast",
    brandSlug: "maggi",
    name: "Maggi 2-Minute Noodles",
    nameHi: "मैगी 2 मिनट नूडल्स",
    description: "Instant masala noodles for quick meals.",
    descriptionHi: "क्विक मील्स के लिए इंस्टेंट मसाला नूडल्स।",
    primaryUnitCode: "pack",
    trackMethod: TrackMethod.PIECE,
    tags: ["instant-food", "noodles", "snacks"],
    variants: [
      {
        name: "70 g Pack",
        sku: "MAGGI-70G",
        attributes: { size: "70 g" },
        costPrice: "12.00",
        sellingPrice: "15.00",
        mrp: "15.00",
        reorderLevel: "45",
        minStockLevel: "30",
        maxStockLevel: "260",
        unitCode: "pack",
        isDefault: true,
        translations: { EN: "70 g Pack", HI: "70 ग्राम पैक" },
      },
      {
        name: "280 g Pack",
        sku: "MAGGI-280G",
        attributes: { size: "280 g" },
        costPrice: "46.00",
        sellingPrice: "56.00",
        mrp: "58.00",
        reorderLevel: "24",
        minStockLevel: "18",
        maxStockLevel: "140",
        unitCode: "pack",
        translations: { EN: "280 g Pack", HI: "280 ग्राम पैक" },
      },
    ],
  },
];

const groceryInventory: InventorySeed[] = [
  { branchCode: "GROC-WH-1", sku: "AMUL-MILK-500", onHand: "90", openingCost: "26.00", note: "Opening stock" },
  { branchCode: "GROC-WH-1", sku: "AMUL-MILK-1L", onHand: "80", openingCost: "51.00", note: "Opening stock" },
  { branchCode: "GROC-WH-1", sku: "MD-CURD-400G", onHand: "70", openingCost: "30.00" },
  { branchCode: "GROC-WH-1", sku: "MD-CURD-1KG", onHand: "45", openingCost: "65.00" },
  { branchCode: "GROC-WH-1", sku: "BRIT-BISC-60", onHand: "220", openingCost: "8.50" },
  { branchCode: "GROC-WH-1", sku: "BRIT-BISC-120", onHand: "140", openingCost: "18.00" },
  { branchCode: "GROC-WH-1", sku: "HAL-CHIPS-52", onHand: "180", openingCost: "17.00" },
  { branchCode: "GROC-WH-1", sku: "HAL-CHIPS-90", onHand: "130", openingCost: "26.00" },
  { branchCode: "GROC-WH-1", sku: "IG-RICE-5KG", onHand: "55", openingCost: "255.00" },
  { branchCode: "GROC-WH-1", sku: "IG-RICE-10KG", onHand: "38", openingCost: "500.00" },
  { branchCode: "GROC-WH-1", sku: "AA-ATTA-5KG", onHand: "58", openingCost: "210.00" },
  { branchCode: "GROC-WH-1", sku: "AA-ATTA-10KG", onHand: "34", openingCost: "405.00" },
  { branchCode: "GROC-WH-1", sku: "FORT-OIL-1L", onHand: "72", openingCost: "128.00" },
  { branchCode: "GROC-WH-1", sku: "FORT-OIL-5L", onHand: "26", openingCost: "620.00" },

  { branchCode: "GROC-STORE-1", sku: "AMUL-MILK-500", onHand: "24", reserved: "3", openingCost: "26.00" },
  { branchCode: "GROC-STORE-1", sku: "AMUL-MILK-1L", onHand: "18", reserved: "2", openingCost: "51.00" },
  { branchCode: "GROC-STORE-1", sku: "MD-CURD-400G", onHand: "20", openingCost: "30.00" },
  { branchCode: "GROC-STORE-1", sku: "BRIT-BISC-60", onHand: "65", reserved: "4", openingCost: "8.50" },
  { branchCode: "GROC-STORE-1", sku: "HAL-CHIPS-52", onHand: "54", openingCost: "17.00" },
  { branchCode: "GROC-STORE-1", sku: "IG-RICE-5KG", onHand: "16", openingCost: "255.00" },
  { branchCode: "GROC-STORE-1", sku: "AA-ATTA-5KG", onHand: "15", openingCost: "210.00" },
  { branchCode: "GROC-STORE-1", sku: "FORT-OIL-1L", onHand: "20", openingCost: "128.00" },

  { branchCode: "GROC-DS-1", sku: "AMUL-MILK-500", onHand: "12", reserved: "4", incoming: "10", openingCost: "26.00" },
  { branchCode: "GROC-DS-1", sku: "BRIT-BISC-60", onHand: "25", reserved: "2", openingCost: "8.50" },
  { branchCode: "GROC-DS-1", sku: "HAL-CHIPS-52", onHand: "22", reserved: "2", openingCost: "17.00" },
  { branchCode: "GROC-DS-1", sku: "FORT-OIL-1L", onHand: "10", reserved: "1", openingCost: "128.00" },
];

const groceryBatches: BatchSeed[] = [
  {
    branchCode: "GROC-WH-1",
    sku: "AMUL-MILK-500",
    batchNumber: "MILK500-APR-01",
    manufactureDate: "2026-03-19T00:00:00.000Z",
    expiryDate: "2026-03-25T00:00:00.000Z",
    quantityOnHand: "50",
    purchasePrice: "26.00",
    sellingPrice: "29.00",
  },
  {
    branchCode: "GROC-WH-1",
    sku: "AMUL-MILK-1L",
    batchNumber: "MILK1L-APR-01",
    manufactureDate: "2026-03-19T00:00:00.000Z",
    expiryDate: "2026-03-25T00:00:00.000Z",
    quantityOnHand: "40",
    purchasePrice: "51.00",
    sellingPrice: "56.00",
  },
  {
    branchCode: "GROC-STORE-1",
    sku: "MD-CURD-400G",
    batchNumber: "CURD400-APR-01",
    manufactureDate: "2026-03-18T00:00:00.000Z",
    expiryDate: "2026-03-26T00:00:00.000Z",
    quantityOnHand: "20",
    purchasePrice: "30.00",
    sellingPrice: "35.00",
  },
];

const groceryReceipts: PurchaseReceiptSeed[] = [
  {
    receiptNumber: "GRN-GROC-0001",
    branchCode: "GROC-WH-1",
    supplierCode: "SUP-AMUL-01",
    invoiceDate: "2026-03-20T00:00:00.000Z",
    receivedAt: "2026-03-20T09:30:00.000Z",
    status: PurchaseReceiptStatus.POSTED,
    notes: "Dairy stock received for weekend cycle.",
    items: [
      { sku: "AMUL-MILK-500", quantity: "60", unitCost: "26.00", taxRate: "5", batchNumber: "MILK500-APR-01", expiryDate: "2026-03-25T00:00:00.000Z" },
      { sku: "AMUL-MILK-1L", quantity: "50", unitCost: "51.00", taxRate: "5", batchNumber: "MILK1L-APR-01", expiryDate: "2026-03-25T00:00:00.000Z" },
      { sku: "MD-CURD-400G", quantity: "40", unitCost: "30.00", taxRate: "5", batchNumber: "CURD400-APR-01", expiryDate: "2026-03-26T00:00:00.000Z" },
    ],
  },
  {
    receiptNumber: "GRN-GROC-0002",
    branchCode: "GROC-WH-1",
    supplierCode: "SUP-DRY-01",
    invoiceDate: "2026-03-20T00:00:00.000Z",
    receivedAt: "2026-03-20T14:00:00.000Z",
    status: PurchaseReceiptStatus.POSTED,
    notes: "Staple refill stock.",
    items: [
      { sku: "IG-RICE-5KG", quantity: "30", unitCost: "255.00", taxRate: "5" },
      { sku: "AA-ATTA-5KG", quantity: "30", unitCost: "210.00", taxRate: "5" },
      { sku: "FORT-OIL-1L", quantity: "24", unitCost: "128.00", taxRate: "5" },
    ],
  },
];

const groceryOrders: SalesOrderSeed[] = [
  {
    orderNumber: "SO-GROC-0001",
    branchCode: "GROC-DS-1",
    customerPhone: "+91-9870001002",
    source: OrderSource.WHATSAPP,
    status: SalesOrderStatus.CONFIRMED,
    paymentStatus: PaymentStatus.PAID,
    confirmedAt: "2026-03-21T10:10:00.000Z",
    notes: "Fast delivery order from WhatsApp.",
    items: [
      { sku: "AMUL-MILK-500", quantity: "2", unitPrice: "29.00", taxRate: "5" },
      { sku: "BRIT-BISC-60", quantity: "3", unitPrice: "10.00", taxRate: "12" },
      { sku: "FORT-OIL-1L", quantity: "1", unitPrice: "145.00", taxRate: "5" },
    ],
  },
  {
    orderNumber: "SO-GROC-0002",
    branchCode: "GROC-STORE-1",
    customerPhone: "+91-9870001005",
    source: OrderSource.WALK_IN,
    status: SalesOrderStatus.DELIVERED,
    paymentStatus: PaymentStatus.PAID,
    confirmedAt: "2026-03-21T18:20:00.000Z",
    deliveredAt: "2026-03-21T18:35:00.000Z",
    notes: "Corporate pantry pickup.",
    items: [
      { sku: "IG-RICE-5KG", quantity: "2", unitPrice: "290.00", taxRate: "5" },
      { sku: "AA-ATTA-5KG", quantity: "2", unitPrice: "235.00", taxRate: "5" },
      { sku: "HAL-CHIPS-52", quantity: "6", unitPrice: "20.00", taxRate: "12" },
    ],
  },
];

const groceryTransfers: StockTransferSeed[] = [
  {
    transferNumber: "TR-GROC-0001",
    fromBranchCode: "GROC-WH-1",
    toBranchCode: "GROC-DS-1",
    status: StockTransferStatus.APPROVED,
    notes: "Dark store replenishment for evening peak.",
    approvedAt: "2026-03-21T08:15:00.000Z",
    items: [
      { sku: "AMUL-MILK-500", quantity: "10", unitCost: "26.00" },
      { sku: "BRIT-BISC-60", quantity: "20", unitCost: "8.50" },
      { sku: "HAL-CHIPS-52", quantity: "15", unitCost: "17.00" },
      { sku: "FORT-OIL-1L", quantity: "8", unitCost: "128.00" },
    ],
  },
];

const pharmacyDemoBranches: OrgBranchSeed[] = [
  {
    code: "PHARM-STORE-1",
    name: "NearCart Pharmacy Main Store",
    type: BranchType.STORE,
    phone: "+91-9900002101",
    email: "store.pharmacy@nearcart.local",
    addressLine1: "18 Health Plaza",
    city: "Ahmedabad",
    state: "Gujarat",
    country: "India",
    postalCode: "380009",
  },
  {
    code: "PHARM-WH-1",
    name: "NearCart Pharmacy Warehouse",
    type: BranchType.WAREHOUSE,
    phone: "+91-9900002102",
    email: "warehouse.pharmacy@nearcart.local",
    addressLine1: "Block C Medical Supply Park",
    city: "Ahmedabad",
    state: "Gujarat",
    country: "India",
    postalCode: "382421",
  },
];

const pharmacyBrands: OrgBrandSeed[] = [
  { slug: "dolo", translations: { EN: "Dolo", HI: "डोलो" } },
  { slug: "crocin", translations: { EN: "Crocin", HI: "क्रोसिन" } },
  { slug: "dettol", translations: { EN: "Dettol", HI: "डेटॉल" } },
  { slug: "savlon", translations: { EN: "Savlon", HI: "सैवलॉन" } },
  { slug: "safe-touch", translations: { EN: "Safe Touch", HI: "सेफ टच" } },
  { slug: "colgate", translations: { EN: "Colgate", HI: "कोलगेट" } },
  { slug: "benadryl", translations: { EN: "Benadryl", HI: "बेनाड्रिल" } },
  { slug: "electral", translations: { EN: "Electral", HI: "इलेक्ट्रल" } },
  { slug: "move", translations: { EN: "Moov", HI: "मूव" } },
  { slug: "omron", translations: { EN: "Omron", HI: "ओमरोन" } },
];

const pharmacyCategories: OrgCategorySeed[] = [
  {
    slug: "medicines",
    sortOrder: 1,
    translations: {
      EN: { name: "Medicines", description: "Tablets, syrups, and common OTC relief." },
      HI: { name: "दवाइयाँ", description: "टैबलेट, सिरप और आम ओटीसी राहत उत्पाद।" },
    },
  },
  {
    slug: "first-aid",
    sortOrder: 2,
    translations: {
      EN: { name: "First Aid", description: "Bandages, antiseptics, and quick care products." },
      HI: { name: "फर्स्ट एड", description: "पट्टी, एंटीसेप्टिक और तुरंत देखभाल वाले उत्पाद।" },
    },
  },
  {
    slug: "hygiene",
    sortOrder: 3,
    translations: {
      EN: { name: "Hygiene", description: "Masks, sanitizers, and personal hygiene stock." },
      HI: { name: "स्वच्छता", description: "मास्क, सैनिटाइज़र और निजी स्वच्छता का स्टॉक।" },
    },
  },
  {
    slug: "oral-care",
    sortOrder: 4,
    translations: {
      EN: { name: "Oral Care", description: "Toothpaste and day-to-day oral care." },
      HI: { name: "ओरल केयर", description: "टूथपेस्ट और रोज़ाना की ओरल केयर।" },
    },
  },
  {
    slug: "devices",
    sortOrder: 5,
    translations: {
      EN: { name: "Devices", description: "Simple medical devices and serial-based products." },
      HI: { name: "डिवाइसेज़", description: "सरल मेडिकल डिवाइस और सीरियल आधारित उत्पाद।" },
    },
  },
  {
    slug: "wellness",
    sortOrder: 6,
    translations: {
      EN: { name: "Wellness", description: "Hydration, recovery, and daily wellness essentials." },
      HI: { name: "वेलनेस", description: "हाइड्रेशन, रिकवरी और रोज़ की वेलनेस ज़रूरतें।" },
    },
  },
];

const pharmacySuppliers: OrgSupplierSeed[] = [
  {
    code: "SUP-MED-01",
    translations: { EN: "Ahmedabad Medical Agencies", HI: "अहमदाबाद मेडिकल एजेंसियां" },
    phone: "+91-9033022001",
    email: "med.agencies@suppliers.local",
    taxNumber: "24AACCA5555E1Z5",
    address: { city: "Ahmedabad", state: "Gujarat", line1: "Relief Road Medicine Market" },
  },
  {
    code: "SUP-HYG-01",
    translations: { EN: "Health Hygiene Distributor", HI: "हेल्थ हाइजीन डिस्ट्रीब्यूटर" },
    phone: "+91-9033022002",
    email: "hygiene@suppliers.local",
    taxNumber: "24AACCH6666F1Z6",
    address: { city: "Ahmedabad", state: "Gujarat", line1: "Ashram Road Healthcare Block" },
  },
  {
    code: "SUP-DEV-01",
    translations: { EN: "Care Device Wholesale", HI: "केयर डिवाइस होलसेल" },
    phone: "+91-9033022003",
    email: "devices@suppliers.local",
    taxNumber: "24AACCC7777G1Z7",
    address: { city: "Ahmedabad", state: "Gujarat", line1: "SG Highway Device Mall" },
  },
];

const pharmacyCustomers: OrgCustomerSeed[] = [
  { name: "Mehul Trivedi", phone: "+91-9860002001", email: "mehul.trivedi@example.com", notes: "Regular OTC buyer." },
  { name: "Sonal Vyas", phone: "+91-9860002002", email: "sonal.vyas@example.com", notes: "Family hygiene products." },
  { name: "Divya Nair", phone: "+91-9860002003", email: "divya.nair@example.com", notes: "Child care and sanitizer orders." },
  { name: "Kishan Parmar", phone: "+91-9860002004", email: "kishan.parmar@example.com", notes: "Buys wellness devices." },
];

const pharmacyProducts: OrgProductSeed[] = [
  {
    slug: "dolo-paracetamol",
    masterItemCode: "pharmacy_paracetamol",
    industryCode: "pharmacy",
    categorySlug: "medicines",
    brandSlug: "dolo",
    name: "Dolo Paracetamol",
    nameHi: "डोलो पैरासिटामोल",
    description: "Common fever and pain relief tablets.",
    descriptionHi: "बुखार और दर्द राहत की आम टैबलेट।",
    primaryUnitCode: "box",
    trackMethod: TrackMethod.PIECE,
    tags: ["otc", "pain-relief"],
    variants: [
      {
        name: "10 Tablets",
        sku: "DOLO-650-10",
        attributes: { size: "10 Tablets", strength: "650 mg" },
        costPrice: "18.00",
        sellingPrice: "24.00",
        mrp: "25.00",
        reorderLevel: "30",
        minStockLevel: "20",
        maxStockLevel: "180",
        unitCode: "box",
        isDefault: true,
        translations: { EN: "10 Tablets", HI: "10 टैबलेट" },
      },
      {
        name: "15 Tablets",
        sku: "DOLO-650-15",
        attributes: { size: "15 Tablets", strength: "650 mg" },
        costPrice: "26.00",
        sellingPrice: "34.00",
        mrp: "35.00",
        reorderLevel: "24",
        minStockLevel: "18",
        maxStockLevel: "160",
        unitCode: "box",
        translations: { EN: "15 Tablets", HI: "15 टैबलेट" },
      },
    ],
  },
  {
    slug: "dettol-antiseptic-liquid",
    masterItemCode: "pharmacy_antiseptic_liquid",
    industryCode: "pharmacy",
    categorySlug: "first-aid",
    brandSlug: "dettol",
    name: "Dettol Antiseptic Liquid",
    nameHi: "डेटॉल एंटीसेप्टिक लिक्विड",
    description: "Liquid antiseptic for wound and skin cleaning.",
    descriptionHi: "घाव और त्वचा की सफाई के लिए लिक्विड एंटीसेप्टिक।",
    primaryUnitCode: "ml",
    trackMethod: TrackMethod.VOLUME,
    tags: ["first-aid", "antiseptic"],
    variants: [
      {
        name: "100 ml",
        sku: "DETTOL-100ML",
        attributes: { size: "100 ml" },
        costPrice: "52.00",
        sellingPrice: "62.00",
        mrp: "65.00",
        reorderLevel: "18",
        minStockLevel: "12",
        maxStockLevel: "110",
        unitCode: "ml",
        isDefault: true,
        translations: { EN: "100 ml", HI: "100 मि.ली." },
      },
      {
        name: "500 ml",
        sku: "DETTOL-500ML",
        attributes: { size: "500 ml" },
        costPrice: "185.00",
        sellingPrice: "215.00",
        mrp: "220.00",
        reorderLevel: "12",
        minStockLevel: "8",
        maxStockLevel: "70",
        unitCode: "ml",
        translations: { EN: "500 ml", HI: "500 मि.ली." },
      },
    ],
  },
  {
    slug: "savlon-sanitizer",
    masterItemCode: "pharmacy_sanitizer",
    industryCode: "pharmacy",
    categorySlug: "hygiene",
    brandSlug: "savlon",
    name: "Savlon Sanitizer",
    nameHi: "सैवलॉन सैनिटाइज़र",
    description: "Alcohol-based sanitizer for hands.",
    descriptionHi: "हाथों के लिए अल्कोहल आधारित सैनिटाइज़र।",
    primaryUnitCode: "ml",
    trackMethod: TrackMethod.VOLUME,
    tags: ["sanitizer", "hygiene"],
    variants: [
      {
        name: "100 ml",
        sku: "SAVLON-100ML",
        attributes: { size: "100 ml" },
        costPrice: "38.00",
        sellingPrice: "48.00",
        mrp: "50.00",
        reorderLevel: "20",
        minStockLevel: "15",
        maxStockLevel: "130",
        unitCode: "ml",
        isDefault: true,
        translations: { EN: "100 ml", HI: "100 मि.ली." },
      },
      {
        name: "500 ml",
        sku: "SAVLON-500ML",
        attributes: { size: "500 ml" },
        costPrice: "145.00",
        sellingPrice: "170.00",
        mrp: "175.00",
        reorderLevel: "10",
        minStockLevel: "8",
        maxStockLevel: "70",
        unitCode: "ml",
        translations: { EN: "500 ml", HI: "500 मि.ली." },
      },
    ],
  },
  {
    slug: "safe-touch-face-mask",
    masterItemCode: "pharmacy_face_mask",
    industryCode: "pharmacy",
    categorySlug: "hygiene",
    brandSlug: "safe-touch",
    name: "Safe Touch Face Mask",
    nameHi: "सेफ टच फेस मास्क",
    description: "Disposable face mask packs.",
    descriptionHi: "डिस्पोज़ेबल फेस मास्क पैक।",
    primaryUnitCode: "box",
    trackMethod: TrackMethod.PIECE,
    tags: ["mask", "hygiene"],
    variants: [
      {
        name: "10 Pieces",
        sku: "MASK-10",
        attributes: { size: "10 Pieces" },
        costPrice: "26.00",
        sellingPrice: "35.00",
        mrp: "36.00",
        reorderLevel: "22",
        minStockLevel: "15",
        maxStockLevel: "100",
        unitCode: "box",
        isDefault: true,
        translations: { EN: "10 Pieces", HI: "10 पीस" },
      },
      {
        name: "50 Pieces",
        sku: "MASK-50",
        attributes: { size: "50 Pieces" },
        costPrice: "110.00",
        sellingPrice: "140.00",
        mrp: "145.00",
        reorderLevel: "10",
        minStockLevel: "8",
        maxStockLevel: "60",
        unitCode: "box",
        translations: { EN: "50 Pieces", HI: "50 पीस" },
      },
    ],
  },
  {
    slug: "colgate-toothpaste",
    masterItemCode: "pharmacy_toothpaste",
    industryCode: "pharmacy",
    categorySlug: "oral-care",
    brandSlug: "colgate",
    name: "Colgate Toothpaste",
    nameHi: "कोलगेट टूथपेस्ट",
    description: "Daily oral care toothpaste tubes.",
    descriptionHi: "रोज़ाना की ओरल केयर टूथपेस्ट ट्यूब।",
    primaryUnitCode: "pack",
    trackMethod: TrackMethod.PIECE,
    tags: ["oral-care", "daily"],
    variants: [
      {
        name: "100 g",
        sku: "COLGATE-100G",
        attributes: { size: "100 g" },
        costPrice: "44.00",
        sellingPrice: "55.00",
        mrp: "58.00",
        reorderLevel: "20",
        minStockLevel: "16",
        maxStockLevel: "120",
        unitCode: "pack",
        isDefault: true,
        translations: { EN: "100 g", HI: "100 ग्राम" },
      },
      {
        name: "200 g",
        sku: "COLGATE-200G",
        attributes: { size: "200 g" },
        costPrice: "79.00",
        sellingPrice: "94.00",
        mrp: "98.00",
        reorderLevel: "14",
        minStockLevel: "10",
        maxStockLevel: "90",
        unitCode: "pack",
        translations: { EN: "200 g", HI: "200 ग्राम" },
      },
    ],
  },
  {
    slug: "benadryl-cough-syrup",
    masterItemCode: "pharmacy_cough_syrup",
    industryCode: "pharmacy",
    categorySlug: "medicines",
    brandSlug: "benadryl",
    name: "Benadryl Cough Syrup",
    nameHi: "बेनाड्रिल कफ सिरप",
    description: "Relief syrup for cough support.",
    descriptionHi: "खांसी राहत के लिए सिरप।",
    primaryUnitCode: "ml",
    trackMethod: TrackMethod.VOLUME,
    tags: ["syrup", "respiratory"],
    variants: [
      {
        name: "100 ml",
        sku: "BENADRYL-100ML",
        attributes: { size: "100 ml" },
        costPrice: "72.00",
        sellingPrice: "88.00",
        mrp: "90.00",
        reorderLevel: "15",
        minStockLevel: "10",
        maxStockLevel: "90",
        unitCode: "ml",
        isDefault: true,
        translations: { EN: "100 ml", HI: "100 मि.ली." },
      },
      {
        name: "200 ml",
        sku: "BENADRYL-200ML",
        attributes: { size: "200 ml" },
        costPrice: "132.00",
        sellingPrice: "155.00",
        mrp: "160.00",
        reorderLevel: "10",
        minStockLevel: "8",
        maxStockLevel: "70",
        unitCode: "ml",
        translations: { EN: "200 ml", HI: "200 मि.ली." },
      },
    ],
  },
  {
    slug: "electral-ors",
    masterItemCode: "pharmacy_ors",
    industryCode: "pharmacy",
    categorySlug: "wellness",
    brandSlug: "electral",
    name: "Electral ORS",
    nameHi: "इलेक्ट्रल ओआरएस",
    description: "Oral rehydration sachets for dehydration support.",
    descriptionHi: "डिहाइड्रेशन सपोर्ट के लिए ओरल रिहाइड्रेशन सैशे।",
    primaryUnitCode: "box",
    trackMethod: TrackMethod.PIECE,
    tags: ["ors", "hydration", "wellness"],
    variants: [
      {
        name: "21 g Sachet",
        sku: "ELEC-ORS-21",
        attributes: { size: "21 g" },
        costPrice: "16.00",
        sellingPrice: "22.00",
        mrp: "22.00",
        reorderLevel: "28",
        minStockLevel: "20",
        maxStockLevel: "180",
        unitCode: "box",
        isDefault: true,
        translations: { EN: "21 g Sachet", HI: "21 ग्राम सैशे" },
      },
      {
        name: "Pack of 5",
        sku: "ELEC-ORS-5PK",
        attributes: { pack: "5 sachets" },
        costPrice: "72.00",
        sellingPrice: "88.00",
        mrp: "90.00",
        reorderLevel: "14",
        minStockLevel: "10",
        maxStockLevel: "90",
        unitCode: "box",
        translations: { EN: "Pack of 5", HI: "5 का पैक" },
      },
    ],
  },
  {
    slug: "move-pain-relief-spray",
    masterItemCode: "pharmacy_pain_relief_spray",
    industryCode: "pharmacy",
    categorySlug: "first-aid",
    brandSlug: "move",
    name: "Moov Pain Relief Spray",
    nameHi: "मूव पेन रिलीफ स्प्रे",
    description: "Topical spray for muscular pain support.",
    descriptionHi: "मांसपेशियों के दर्द के लिए बाहरी स्प्रे।",
    primaryUnitCode: "pack",
    trackMethod: TrackMethod.PIECE,
    tags: ["spray", "pain-relief"],
    variants: [
      {
        name: "80 g",
        sku: "MOOV-80G",
        attributes: { size: "80 g" },
        costPrice: "95.00",
        sellingPrice: "115.00",
        mrp: "118.00",
        reorderLevel: "12",
        minStockLevel: "10",
        maxStockLevel: "65",
        unitCode: "pack",
        isDefault: true,
        translations: { EN: "80 g", HI: "80 ग्राम" },
      },
    ],
  },
  {
    slug: "omron-infrared-thermometer",
    masterItemCode: "pharmacy_digital_thermometer",
    industryCode: "pharmacy",
    categorySlug: "devices",
    brandSlug: "omron",
    name: "Omron Infrared Thermometer",
    nameHi: "ओमरोन इन्फ्रारेड थर्मामीटर",
    description: "Serial-tracked thermometer for pharmacy counters.",
    descriptionHi: "फार्मेसी काउंटर के लिए सीरियल ट्रैक थर्मामीटर।",
    primaryUnitCode: "pcs",
    trackMethod: TrackMethod.PIECE,
    productType: ProductType.SIMPLE,
    hasVariants: false,
    tags: ["device", "serial-tracked"],
    metadata: { serialTracked: true },
    variants: [
      {
        name: "Standard",
        sku: "OMRON-THERM-STD",
        attributes: { model: "Standard" },
        costPrice: "980.00",
        sellingPrice: "1199.00",
        mrp: "1299.00",
        reorderLevel: "4",
        minStockLevel: "2",
        maxStockLevel: "20",
        unitCode: "pcs",
        isDefault: true,
        translations: { EN: "Standard", HI: "स्टैंडर्ड" },
      },
    ],
  },
];

const pharmacyInventory: InventorySeed[] = [
  { branchCode: "PHARM-WH-1", sku: "DOLO-650-10", onHand: "120", openingCost: "18.00" },
  { branchCode: "PHARM-WH-1", sku: "DOLO-650-15", onHand: "90", openingCost: "26.00" },
  { branchCode: "PHARM-WH-1", sku: "DETTOL-100ML", onHand: "65", openingCost: "52.00" },
  { branchCode: "PHARM-WH-1", sku: "DETTOL-500ML", onHand: "40", openingCost: "185.00" },
  { branchCode: "PHARM-WH-1", sku: "SAVLON-100ML", onHand: "80", openingCost: "38.00" },
  { branchCode: "PHARM-WH-1", sku: "SAVLON-500ML", onHand: "35", openingCost: "145.00" },
  { branchCode: "PHARM-WH-1", sku: "MASK-10", onHand: "85", openingCost: "26.00" },
  { branchCode: "PHARM-WH-1", sku: "MASK-50", onHand: "34", openingCost: "110.00" },
  { branchCode: "PHARM-WH-1", sku: "COLGATE-100G", onHand: "70", openingCost: "44.00" },
  { branchCode: "PHARM-WH-1", sku: "COLGATE-200G", onHand: "48", openingCost: "79.00" },
  { branchCode: "PHARM-WH-1", sku: "BENADRYL-100ML", onHand: "42", openingCost: "72.00" },
  { branchCode: "PHARM-WH-1", sku: "BENADRYL-200ML", onHand: "30", openingCost: "132.00" },
  { branchCode: "PHARM-WH-1", sku: "MOOV-80G", onHand: "30", openingCost: "95.00" },
  { branchCode: "PHARM-WH-1", sku: "OMRON-THERM-STD", onHand: "8", openingCost: "980.00" },

  { branchCode: "PHARM-STORE-1", sku: "DOLO-650-10", onHand: "24", reserved: "2", openingCost: "18.00" },
  { branchCode: "PHARM-STORE-1", sku: "DETTOL-100ML", onHand: "12", openingCost: "52.00" },
  { branchCode: "PHARM-STORE-1", sku: "SAVLON-100ML", onHand: "16", reserved: "1", openingCost: "38.00" },
  { branchCode: "PHARM-STORE-1", sku: "MASK-10", onHand: "18", openingCost: "26.00" },
  { branchCode: "PHARM-STORE-1", sku: "COLGATE-100G", onHand: "20", openingCost: "44.00" },
  { branchCode: "PHARM-STORE-1", sku: "BENADRYL-100ML", onHand: "10", openingCost: "72.00" },
  { branchCode: "PHARM-STORE-1", sku: "MOOV-80G", onHand: "8", openingCost: "95.00" },
  { branchCode: "PHARM-STORE-1", sku: "OMRON-THERM-STD", onHand: "3", openingCost: "980.00" },
];

const pharmacyBatches: BatchSeed[] = [
  {
    branchCode: "PHARM-WH-1",
    sku: "DOLO-650-10",
    batchNumber: "DOLO-APR-01",
    manufactureDate: "2026-01-15T00:00:00.000Z",
    expiryDate: "2028-01-14T00:00:00.000Z",
    quantityOnHand: "80",
    purchasePrice: "18.00",
    sellingPrice: "24.00",
  },
  {
    branchCode: "PHARM-WH-1",
    sku: "DETTOL-100ML",
    batchNumber: "DET-100-APR-01",
    manufactureDate: "2025-12-10T00:00:00.000Z",
    expiryDate: "2027-12-09T00:00:00.000Z",
    quantityOnHand: "50",
    purchasePrice: "52.00",
    sellingPrice: "62.00",
  },
  {
    branchCode: "PHARM-STORE-1",
    sku: "BENADRYL-100ML",
    batchNumber: "BEN-100-APR-01",
    manufactureDate: "2026-02-01T00:00:00.000Z",
    expiryDate: "2027-07-31T00:00:00.000Z",
    quantityOnHand: "10",
    purchasePrice: "72.00",
    sellingPrice: "88.00",
  },
];

const pharmacySerials: SerialSeed[] = [
  { branchCode: "PHARM-WH-1", sku: "OMRON-THERM-STD", serialNumber: "OMR-T-10001" },
  { branchCode: "PHARM-WH-1", sku: "OMRON-THERM-STD", serialNumber: "OMR-T-10002" },
  { branchCode: "PHARM-WH-1", sku: "OMRON-THERM-STD", serialNumber: "OMR-T-10003" },
  { branchCode: "PHARM-STORE-1", sku: "OMRON-THERM-STD", serialNumber: "OMR-T-20001" },
  { branchCode: "PHARM-STORE-1", sku: "OMRON-THERM-STD", serialNumber: "OMR-T-20002" },
];

const pharmacyReceipts: PurchaseReceiptSeed[] = [
  {
    receiptNumber: "GRN-PHARM-0001",
    branchCode: "PHARM-WH-1",
    supplierCode: "SUP-MED-01",
    invoiceDate: "2026-03-19T00:00:00.000Z",
    receivedAt: "2026-03-19T11:00:00.000Z",
    status: PurchaseReceiptStatus.POSTED,
    notes: "Medicine stock replenishment.",
    items: [
      { sku: "DOLO-650-10", quantity: "100", unitCost: "18.00", taxRate: "12", batchNumber: "DOLO-APR-01", expiryDate: "2028-01-14T00:00:00.000Z" },
      { sku: "BENADRYL-100ML", quantity: "30", unitCost: "72.00", taxRate: "12", batchNumber: "BEN-100-APR-01", expiryDate: "2027-07-31T00:00:00.000Z" },
      { sku: "MOOV-80G", quantity: "20", unitCost: "95.00", taxRate: "12" },
    ],
  },
  {
    receiptNumber: "GRN-PHARM-0002",
    branchCode: "PHARM-WH-1",
    supplierCode: "SUP-HYG-01",
    invoiceDate: "2026-03-19T00:00:00.000Z",
    receivedAt: "2026-03-19T15:30:00.000Z",
    status: PurchaseReceiptStatus.POSTED,
    notes: "Hygiene items for store and warehouse.",
    items: [
      { sku: "DETTOL-100ML", quantity: "40", unitCost: "52.00", taxRate: "18", batchNumber: "DET-100-APR-01", expiryDate: "2027-12-09T00:00:00.000Z" },
      { sku: "SAVLON-100ML", quantity: "50", unitCost: "38.00", taxRate: "18" },
      { sku: "MASK-10", quantity: "40", unitCost: "26.00", taxRate: "12" },
    ],
  },
];

const pharmacyOrders: SalesOrderSeed[] = [
  {
    orderNumber: "SO-PHARM-0001",
    branchCode: "PHARM-STORE-1",
    customerPhone: "+91-9860002001",
    source: OrderSource.WALK_IN,
    status: SalesOrderStatus.DELIVERED,
    paymentStatus: PaymentStatus.PAID,
    confirmedAt: "2026-03-21T12:20:00.000Z",
    deliveredAt: "2026-03-21T12:25:00.000Z",
    items: [
      { sku: "DOLO-650-10", quantity: "1", unitPrice: "24.00", taxRate: "12" },
      { sku: "DETTOL-100ML", quantity: "1", unitPrice: "62.00", taxRate: "18" },
    ],
  },
  {
    orderNumber: "SO-PHARM-0002",
    branchCode: "PHARM-STORE-1",
    customerPhone: "+91-9860002004",
    source: OrderSource.PHONE,
    status: SalesOrderStatus.CONFIRMED,
    paymentStatus: PaymentStatus.UNPAID,
    confirmedAt: "2026-03-21T19:05:00.000Z",
    notes: "Device kept aside for pickup.",
    items: [
      { sku: "OMRON-THERM-STD", quantity: "1", unitPrice: "1199.00", taxRate: "18" },
      { sku: "MASK-10", quantity: "2", unitPrice: "35.00", taxRate: "12" },
    ],
  },
];

const pharmacyTransfers: StockTransferSeed[] = [
  {
    transferNumber: "TR-PHARM-0001",
    fromBranchCode: "PHARM-WH-1",
    toBranchCode: "PHARM-STORE-1",
    status: StockTransferStatus.APPROVED,
    notes: "Store front refill.",
    approvedAt: "2026-03-20T09:45:00.000Z",
    items: [
      { sku: "DOLO-650-10", quantity: "20", unitCost: "18.00" },
      { sku: "SAVLON-100ML", quantity: "12", unitCost: "38.00" },
      { sku: "MASK-10", quantity: "12", unitCost: "26.00" },
      { sku: "OMRON-THERM-STD", quantity: "2", unitCost: "980.00" },
    ],
  },
];

function decimal(value: string | number | Prisma.Decimal | null | undefined) {
  if (value === null || value === undefined) {
    return null;
  }

  return new Prisma.Decimal(value);
}

function roundMoney(value: Prisma.Decimal) {
  return value.toDecimalPlaces(4);
}

function bilingualTranslationRows(translations: BilingualNameDescription | BilingualName) {
  if ("EN" in translations && typeof translations.EN === "string") {
    const flat = translations as BilingualName;
    return [
      { language: LanguageCode.EN, name: flat.EN, description: null },
      { language: LanguageCode.HI, name: flat.HI, description: null },
    ];
  }

  const detailed = translations as BilingualNameDescription;

  return [
    { language: LanguageCode.EN, name: detailed.EN.name, description: detailed.EN.description ?? null },
    { language: LanguageCode.HI, name: detailed.HI.name, description: detailed.HI.description ?? null },
  ];
}

async function upsertUserSeed(params: {
  email: string;
  fullName: string;
  platformRole?: UserRole | null;
  preferredLanguage?: LanguageCode;
}) {
  return prisma.user.upsert({
    where: { email: params.email },
    update: {
      fullName: params.fullName,
      platformRole: params.platformRole ?? null,
      preferredLanguage: params.preferredLanguage ?? LanguageCode.EN,
      isActive: true,
      passwordSetupRequired: false,
    },
    create: {
      email: params.email,
      fullName: params.fullName,
      passwordHash: "seed-password-not-for-production",
      platformRole: params.platformRole ?? null,
      preferredLanguage: params.preferredLanguage ?? LanguageCode.EN,
      isActive: true,
      passwordSetupRequired: false,
    },
  });
}

async function ensureSeedSuperAdmin() {
  const passwordHash = await bcrypt.hash(seedSuperAdminConfig.password, 12);

  return prisma.user.upsert({
    where: { email: seedSuperAdminConfig.email },
    update: {
      fullName: seedSuperAdminConfig.fullName,
      passwordHash,
      platformRole: UserRole.SUPER_ADMIN,
      preferredLanguage: LanguageCode.EN,
      isActive: true,
      passwordSetupRequired: false,
      passwordChangedAt: new Date(),
    },
    create: {
      email: seedSuperAdminConfig.email,
      fullName: seedSuperAdminConfig.fullName,
      passwordHash,
      platformRole: UserRole.SUPER_ADMIN,
      preferredLanguage: LanguageCode.EN,
      isActive: true,
      passwordSetupRequired: false,
      passwordChangedAt: new Date(),
    },
  });
}

async function upsertOrganizationSeed(params: {
  slug: string;
  name: string;
  legalName?: string;
  email?: string;
  phone?: string;
  currencyCode?: string;
  defaultLanguage?: LanguageCode;
}) {
  return prisma.organization.upsert({
    where: { slug: params.slug },
    update: {
      name: params.name,
      legalName: params.legalName ?? null,
      email: params.email ?? null,
      phone: params.phone ?? null,
      currencyCode: params.currencyCode ?? "INR",
      timezone: "Asia/Kolkata",
      defaultLanguage: params.defaultLanguage ?? LanguageCode.EN,
      enabledLanguages: ["EN", "HI", "GU"],
      settings: {
        seededBy: "extended-seed",
        bilingualCatalog: true,
      },
      deletedAt: null,
    },
    create: {
      slug: params.slug,
      name: params.name,
      legalName: params.legalName ?? null,
      email: params.email ?? null,
      phone: params.phone ?? null,
      currencyCode: params.currencyCode ?? "INR",
      timezone: "Asia/Kolkata",
      defaultLanguage: params.defaultLanguage ?? LanguageCode.EN,
      enabledLanguages: ["EN", "HI", "GU"],
      settings: {
        seededBy: "extended-seed",
        bilingualCatalog: true,
      },
    },
  });
}

async function upsertMembershipSeed(params: {
  userId: string;
  organizationId: string;
  role: UserRole;
  isDefault?: boolean;
}) {
  return prisma.organizationMembership.upsert({
    where: {
      userId_organizationId: {
        userId: params.userId,
        organizationId: params.organizationId,
      },
    },
    update: {
      role: params.role,
      status: MembershipStatus.ACTIVE,
      isDefault: params.isDefault ?? false,
      acceptedAt: new Date("2026-03-21T00:00:00.000Z"),
    },
    create: {
      userId: params.userId,
      organizationId: params.organizationId,
      role: params.role,
      status: MembershipStatus.ACTIVE,
      isDefault: params.isDefault ?? false,
      invitedAt: new Date("2026-03-20T00:00:00.000Z"),
      acceptedAt: new Date("2026-03-21T00:00:00.000Z"),
    },
  });
}

async function upsertOrgIndustryConfig(params: {
  organizationId: string;
  industryCode: string;
  isPrimary?: boolean;
  enabledFeatures?: Prisma.InputJsonValue;
}) {
  const industry = await prisma.industry.findUnique({
    where: { code: params.industryCode },
  });

  if (!industry) {
    throw new Error(`Industry not found: ${params.industryCode}`);
  }

  const enabledFeatures =
    (params.enabledFeatures ?? industry.defaultFeatures ?? Prisma.JsonNull) as Prisma.InputJsonValue | typeof Prisma.JsonNull;

  return prisma.organizationIndustryConfig.upsert({
    where: {
      organizationId_industryId: {
        organizationId: params.organizationId,
        industryId: industry.id,
      },
    },
    update: {
      isPrimary: params.isPrimary ?? false,
      enabledFeatures,
    },
    create: {
      organizationId: params.organizationId,
      industryId: industry.id,
      isPrimary: params.isPrimary ?? false,
      enabledFeatures,
    },
  });
}

async function upsertBranchSeed(organizationId: string, branchSeed: OrgBranchSeed) {
  return prisma.branch.upsert({
    where: {
      organizationId_code: {
        organizationId,
        code: branchSeed.code,
      },
    },
    update: {
      name: branchSeed.name,
      type: branchSeed.type,
      phone: branchSeed.phone ?? null,
      email: branchSeed.email ?? null,
      addressLine1: branchSeed.addressLine1 ?? null,
      city: branchSeed.city ?? null,
      state: branchSeed.state ?? null,
      country: branchSeed.country ?? null,
      postalCode: branchSeed.postalCode ?? null,
      isActive: true,
      deletedAt: null,
    },
    create: {
      organizationId,
      code: branchSeed.code,
      name: branchSeed.name,
      type: branchSeed.type,
      phone: branchSeed.phone ?? null,
      email: branchSeed.email ?? null,
      addressLine1: branchSeed.addressLine1 ?? null,
      city: branchSeed.city ?? null,
      state: branchSeed.state ?? null,
      country: branchSeed.country ?? null,
      postalCode: branchSeed.postalCode ?? null,
      isActive: true,
    },
  });
}

async function upsertBrandSeed(organizationId: string, brandSeed: OrgBrandSeed) {
  const brand = await prisma.brand.upsert({
    where: {
      organizationId_slug: {
        organizationId,
        slug: brandSeed.slug,
      },
    },
    update: {
      name: brandSeed.translations.EN,
      isActive: true,
      deletedAt: null,
    },
    create: {
      organizationId,
      slug: brandSeed.slug,
      name: brandSeed.translations.EN,
      isActive: true,
    },
  });

  await prisma.brandTranslation.deleteMany({
    where: {
      brandId: brand.id,
    },
  });

  await prisma.brandTranslation.createMany({
    data: [
      { brandId: brand.id, language: LanguageCode.EN, name: brandSeed.translations.EN },
      { brandId: brand.id, language: LanguageCode.HI, name: brandSeed.translations.HI },
    ],
  });

  return brand;
}

async function upsertCategorySeed(organizationId: string, categorySeed: OrgCategorySeed) {
  const parent = categorySeed.parentSlug
    ? await prisma.category.findUnique({
        where: {
          organizationId_slug: {
            organizationId,
            slug: categorySeed.parentSlug,
          },
        },
      })
    : null;

  const category = await prisma.category.upsert({
    where: {
      organizationId_slug: {
        organizationId,
        slug: categorySeed.slug,
      },
    },
    update: {
      parentId: parent?.id ?? null,
      name: categorySeed.translations.EN.name,
      description: categorySeed.translations.EN.description ?? null,
      sortOrder: categorySeed.sortOrder,
      isActive: true,
      deletedAt: null,
    },
    create: {
      organizationId,
      parentId: parent?.id ?? null,
      name: categorySeed.translations.EN.name,
      slug: categorySeed.slug,
      description: categorySeed.translations.EN.description ?? null,
      sortOrder: categorySeed.sortOrder,
      isActive: true,
    },
  });

  await prisma.categoryTranslation.deleteMany({
    where: {
      categoryId: category.id,
    },
  });

  await prisma.categoryTranslation.createMany({
    data: bilingualTranslationRows(categorySeed.translations).map((row) => ({
      categoryId: category.id,
      language: row.language,
      name: row.name,
      description: row.description,
    })),
  });

  return category;
}

async function upsertTaxRateSeed(organizationId: string, name: string, code: string, rate: string, isInclusive = false) {
  const existing = await prisma.taxRate.findFirst({
    where: {
      organizationId,
      code,
    },
  });

  if (existing) {
    return prisma.taxRate.update({
      where: { id: existing.id },
      data: {
        name,
        rate: decimal(rate)!,
        isInclusive,
        isActive: true,
      },
    });
  }

  return prisma.taxRate.create({
    data: {
      organizationId,
      name,
      code,
      rate: decimal(rate)!,
      isInclusive,
      isActive: true,
    },
  });
}

async function upsertSupplierSeed(organizationId: string, seed: OrgSupplierSeed) {
  const existing = await prisma.supplier.findFirst({
    where: {
      organizationId,
      code: seed.code,
    },
  });

  const supplier = existing
    ? await prisma.supplier.update({
        where: { id: existing.id },
        data: {
          name: seed.translations.EN,
          phone: seed.phone ?? null,
          email: seed.email ?? null,
          taxNumber: seed.taxNumber ?? null,
          address: seed.address ?? undefined,
          notes: seed.notes ?? null,
          isActive: true,
          deletedAt: null,
        },
      })
    : await prisma.supplier.create({
        data: {
          organizationId,
          code: seed.code,
          name: seed.translations.EN,
          phone: seed.phone ?? null,
          email: seed.email ?? null,
          taxNumber: seed.taxNumber ?? null,
          address: seed.address ?? undefined,
          notes: seed.notes ?? null,
          isActive: true,
        },
      });

  await prisma.supplierTranslation.deleteMany({
    where: {
      supplierId: supplier.id,
    },
  });

  await prisma.supplierTranslation.createMany({
    data: [
      { supplierId: supplier.id, language: LanguageCode.EN, name: seed.translations.EN },
      { supplierId: supplier.id, language: LanguageCode.HI, name: seed.translations.HI },
    ],
  });

  return supplier;
}

async function upsertCustomerSeed(organizationId: string, seed: OrgCustomerSeed) {
  const existing = await prisma.customer.findFirst({
    where: {
      organizationId,
      phone: seed.phone ?? undefined,
      email: seed.email ?? undefined,
    },
  });

  if (existing) {
    return prisma.customer.update({
      where: { id: existing.id },
      data: {
        name: seed.name,
        phone: seed.phone ?? null,
        email: seed.email ?? null,
        notes: seed.notes ?? null,
        address: seed.address ?? undefined,
        isActive: true,
        deletedAt: null,
      },
    });
  }

  return prisma.customer.create({
    data: {
      organizationId,
      name: seed.name,
      phone: seed.phone ?? null,
      email: seed.email ?? null,
      notes: seed.notes ?? null,
      address: seed.address ?? undefined,
      isActive: true,
    },
  });
}

async function getSystemUnitByCode(code: string) {
  const unit = await prisma.unit.findFirst({
    where: {
      organizationId: null,
      code,
    },
  });

  if (!unit) {
    throw new Error(`System unit not found: ${code}`);
  }

  return unit;
}

async function upsertProductSeed(params: {
  organizationId: string;
  createdById?: string;
  updatedById?: string;
  productSeed: OrgProductSeed;
}) {
  const { organizationId, productSeed } = params;

  const category = await prisma.category.findUnique({
    where: {
      organizationId_slug: {
        organizationId,
        slug: productSeed.categorySlug,
      },
    },
  });

  if (!category) {
    throw new Error(`Category not found for org product seed: ${productSeed.categorySlug}`);
  }

  const brand = productSeed.brandSlug
    ? await prisma.brand.findUnique({
        where: {
          organizationId_slug: {
            organizationId,
            slug: productSeed.brandSlug,
          },
        },
      })
    : null;

  const industry = await prisma.industry.findUnique({
    where: { code: productSeed.industryCode },
  });

  if (!industry) {
    throw new Error(`Industry not found for product seed: ${productSeed.industryCode}`);
  }

  const masterItem = productSeed.masterItemCode
    ? await prisma.masterCatalogItem.findUnique({
        where: { code: productSeed.masterItemCode },
      })
    : null;

  const primaryUnit = productSeed.primaryUnitCode
    ? await getSystemUnitByCode(productSeed.primaryUnitCode)
    : null;

  const hasVariants = productSeed.hasVariants ?? productSeed.variants.length > 1;
  const productType =
    productSeed.productType ??
    (hasVariants ? ProductType.VARIABLE : ProductType.SIMPLE);

  const defaultTaxCode = productSeed.trackMethod === TrackMethod.PIECE && productSeed.categorySlug.includes("hygiene") ? "GST18" : "GST5";
  const taxRate = await prisma.taxRate.findFirst({
    where: {
      organizationId,
      code: defaultTaxCode,
    },
  });

  const product = await prisma.product.upsert({
    where: {
      organizationId_slug: {
        organizationId,
        slug: productSeed.slug,
      },
    },
    update: {
      categoryId: category.id,
      brandId: brand?.id ?? null,
      taxRateId: taxRate?.id ?? null,
      industryId: industry.id,
      masterCatalogItemId: masterItem?.id ?? null,
      name: productSeed.name,
      description: productSeed.description ?? null,
      productType,
      sourceType: productSeed.sourceType ?? (masterItem ? ProductSourceType.MASTER_TEMPLATE : ProductSourceType.MANUAL),
      status: productSeed.status ?? ProductStatus.ACTIVE,
      hasVariants,
      trackInventory: productSeed.trackInventory ?? true,
      allowBackorder: productSeed.allowBackorder ?? false,
      allowNegativeStock: productSeed.allowNegativeStock ?? false,
      trackMethod: productSeed.trackMethod ?? masterItem?.defaultTrackMethod ?? TrackMethod.PIECE,
      primaryUnitId: primaryUnit?.id ?? null,
      imageUrl: productSeed.imageUrl ?? null,
      tags: productSeed.tags ?? [],
      customFields: productSeed.customFields ?? undefined,
      metadata: productSeed.metadata ?? undefined,
      updatedById: params.updatedById ?? null,
      deletedAt: null,
    },
    create: {
      organizationId,
      categoryId: category.id,
      brandId: brand?.id ?? null,
      taxRateId: taxRate?.id ?? null,
      industryId: industry.id,
      masterCatalogItemId: masterItem?.id ?? null,
      name: productSeed.name,
      slug: productSeed.slug,
      description: productSeed.description ?? null,
      productType,
      sourceType: productSeed.sourceType ?? (masterItem ? ProductSourceType.MASTER_TEMPLATE : ProductSourceType.MANUAL),
      status: productSeed.status ?? ProductStatus.ACTIVE,
      hasVariants,
      trackInventory: productSeed.trackInventory ?? true,
      allowBackorder: productSeed.allowBackorder ?? false,
      allowNegativeStock: productSeed.allowNegativeStock ?? false,
      trackMethod: productSeed.trackMethod ?? masterItem?.defaultTrackMethod ?? TrackMethod.PIECE,
      primaryUnitId: primaryUnit?.id ?? null,
      imageUrl: productSeed.imageUrl ?? null,
      tags: productSeed.tags ?? [],
      customFields: productSeed.customFields ?? undefined,
      metadata: productSeed.metadata ?? undefined,
      createdById: params.createdById ?? null,
      updatedById: params.updatedById ?? null,
    },
  });

  await prisma.productTranslation.deleteMany({
    where: {
      productId: product.id,
    },
  });

  await prisma.productTranslation.createMany({
    data: [
      {
        productId: product.id,
        language: LanguageCode.EN,
        name: productSeed.name,
        description: productSeed.description ?? null,
      },
      {
        productId: product.id,
        language: LanguageCode.HI,
        name: productSeed.nameHi,
        description: productSeed.descriptionHi ?? null,
      },
    ],
  });

  const variantsBySku = new Map<string, string>();

  for (const [index, variantSeed] of productSeed.variants.entries()) {
    const unit = variantSeed.unitCode ? await getSystemUnitByCode(variantSeed.unitCode) : primaryUnit;

    const variant = await prisma.productVariant.upsert({
      where: {
        organizationId_sku: {
          organizationId,
          sku: variantSeed.sku,
        },
      },
      update: {
        productId: product.id,
        name: variantSeed.name,
        barcode: variantSeed.barcode ?? null,
        attributes: variantSeed.attributes ?? undefined,
        costPrice: decimal(variantSeed.costPrice)!,
        sellingPrice: decimal(variantSeed.sellingPrice)!,
        mrp: decimal(variantSeed.mrp),
        reorderLevel: decimal(variantSeed.reorderLevel ?? "0")!,
        minStockLevel: decimal(variantSeed.minStockLevel ?? "0")!,
        maxStockLevel: decimal(variantSeed.maxStockLevel),
        weight: decimal(variantSeed.weight),
        unitId: unit?.id ?? null,
        isDefault: variantSeed.isDefault ?? index === 0,
        isActive: true,
        imageUrl: variantSeed.imageUrl ?? null,
        deletedAt: null,
      },
      create: {
        organizationId,
        productId: product.id,
        name: variantSeed.name,
        sku: variantSeed.sku,
        barcode: variantSeed.barcode ?? null,
        attributes: variantSeed.attributes ?? undefined,
        costPrice: decimal(variantSeed.costPrice)!,
        sellingPrice: decimal(variantSeed.sellingPrice)!,
        mrp: decimal(variantSeed.mrp),
        reorderLevel: decimal(variantSeed.reorderLevel ?? "0")!,
        minStockLevel: decimal(variantSeed.minStockLevel ?? "0")!,
        maxStockLevel: decimal(variantSeed.maxStockLevel),
        weight: decimal(variantSeed.weight),
        unitId: unit?.id ?? null,
        isDefault: variantSeed.isDefault ?? index === 0,
        isActive: true,
        imageUrl: variantSeed.imageUrl ?? null,
      },
    });

    variantsBySku.set(variantSeed.sku, variant.id);

    await prisma.productVariantTranslation.deleteMany({
      where: {
        variantId: variant.id,
      },
    });

    await prisma.productVariantTranslation.createMany({
      data: [
        { variantId: variant.id, language: LanguageCode.EN, name: variantSeed.translations.EN },
        { variantId: variant.id, language: LanguageCode.HI, name: variantSeed.translations.HI },
      ],
    });
  }

  return {
    product,
    variantsBySku,
  };
}

async function seedInventoryBalances(params: {
  organizationId: string;
  inventory: InventorySeed[];
  branchMap: Map<string, string>;
  variantMap: Map<string, { variantId: string; productId: string }>;
  createdById?: string;
}) {
  for (const inventorySeed of params.inventory) {
    const branchId = params.branchMap.get(inventorySeed.branchCode);

    if (!branchId) {
      throw new Error(`Branch not found for inventory seed: ${inventorySeed.branchCode}`);
    }

    const variantRef = params.variantMap.get(inventorySeed.sku);

    if (!variantRef) {
      throw new Error(`Variant not found for inventory seed: ${inventorySeed.sku}`);
    }

    await prisma.inventoryBalance.upsert({
      where: {
        organizationId_branchId_variantId: {
          organizationId: params.organizationId,
          branchId,
          variantId: variantRef.variantId,
        },
      },
      update: {
        onHand: decimal(inventorySeed.onHand)!,
        reserved: decimal(inventorySeed.reserved ?? "0")!,
        incoming: decimal(inventorySeed.incoming ?? "0")!,
      },
      create: {
        organizationId: params.organizationId,
        branchId,
        productId: variantRef.productId,
        variantId: variantRef.variantId,
        onHand: decimal(inventorySeed.onHand)!,
        reserved: decimal(inventorySeed.reserved ?? "0")!,
        incoming: decimal(inventorySeed.incoming ?? "0")!,
      },
    });

    const referenceId = `OPEN-${inventorySeed.branchCode}-${inventorySeed.sku}`;
    const existingLedger = await prisma.inventoryLedger.findFirst({
      where: {
        organizationId: params.organizationId,
        branchId,
        variantId: variantRef.variantId,
        referenceType: ReferenceType.MANUAL,
        referenceId,
      },
    });

    if (!existingLedger) {
      await prisma.inventoryLedger.create({
        data: {
          organizationId: params.organizationId,
          branchId,
          productId: variantRef.productId,
          variantId: variantRef.variantId,
          movementType: StockMovementType.OPENING,
          referenceType: ReferenceType.MANUAL,
          referenceId,
          quantityDelta: decimal(inventorySeed.onHand)!,
          unitCost: decimal(inventorySeed.openingCost ?? "0"),
          beforeOnHand: decimal("0")!,
          afterOnHand: decimal(inventorySeed.onHand)!,
          beforeReserved: decimal("0")!,
          afterReserved: decimal(inventorySeed.reserved ?? "0")!,
          note: inventorySeed.note ?? "Opening stock from extended seed",
          createdById: params.createdById ?? null,
        },
      });
    }
  }
}

async function seedInventoryBatches(params: {
  organizationId: string;
  batches: BatchSeed[];
  branchMap: Map<string, string>;
  variantMap: Map<string, { variantId: string }>;
}) {
  for (const batchSeed of params.batches) {
    const branchId = params.branchMap.get(batchSeed.branchCode);
    const variantRef = params.variantMap.get(batchSeed.sku);

    if (!branchId || !variantRef) {
      throw new Error(`Missing branch or variant for batch seed: ${batchSeed.batchNumber}`);
    }

    await prisma.inventoryBatch.upsert({
      where: {
        organizationId_branchId_variantId_batchNumber: {
          organizationId: params.organizationId,
          branchId,
          variantId: variantRef.variantId,
          batchNumber: batchSeed.batchNumber,
        },
      },
      update: {
        manufactureDate: batchSeed.manufactureDate ? new Date(batchSeed.manufactureDate) : null,
        expiryDate: batchSeed.expiryDate ? new Date(batchSeed.expiryDate) : null,
        quantityOnHand: decimal(batchSeed.quantityOnHand)!,
        purchasePrice: decimal(batchSeed.purchasePrice),
        sellingPrice: decimal(batchSeed.sellingPrice),
        status: batchSeed.status ?? BatchStatus.ACTIVE,
        metadata: batchSeed.metadata ?? undefined,
      },
      create: {
        organizationId: params.organizationId,
        branchId,
        variantId: variantRef.variantId,
        batchNumber: batchSeed.batchNumber,
        manufactureDate: batchSeed.manufactureDate ? new Date(batchSeed.manufactureDate) : null,
        expiryDate: batchSeed.expiryDate ? new Date(batchSeed.expiryDate) : null,
        quantityOnHand: decimal(batchSeed.quantityOnHand)!,
        purchasePrice: decimal(batchSeed.purchasePrice),
        sellingPrice: decimal(batchSeed.sellingPrice),
        status: batchSeed.status ?? BatchStatus.ACTIVE,
        metadata: batchSeed.metadata ?? undefined,
      },
    });
  }
}

async function seedSerialNumbers(params: {
  organizationId: string;
  serials: SerialSeed[];
  branchMap: Map<string, string>;
  variantMap: Map<string, { variantId: string }>;
}) {
  for (const serialSeed of params.serials) {
    const branchId = params.branchMap.get(serialSeed.branchCode);
    const variantRef = params.variantMap.get(serialSeed.sku);

    if (!branchId || !variantRef) {
      throw new Error(`Missing branch or variant for serial seed: ${serialSeed.serialNumber}`);
    }

    const existing = await prisma.serialNumber.findFirst({
      where: {
        organizationId: params.organizationId,
        serialNumber: serialSeed.serialNumber,
      },
    });

    if (existing) {
      await prisma.serialNumber.update({
        where: { id: existing.id },
        data: {
          branchId,
          variantId: variantRef.variantId,
        },
      });
      continue;
    }

    await prisma.serialNumber.create({
      data: {
        organizationId: params.organizationId,
        branchId,
        variantId: variantRef.variantId,
        serialNumber: serialSeed.serialNumber,
      },
    });
  }
}

async function seedPurchaseReceipts(params: {
  organizationId: string;
  branchMap: Map<string, string>;
  supplierMap: Map<string, string>;
  variantMap: Map<string, { variantId: string; productId: string }>;
  receipts: PurchaseReceiptSeed[];
  createdById?: string;
}) {
  for (const receiptSeed of params.receipts) {
    const branchId = params.branchMap.get(receiptSeed.branchCode);

    if (!branchId) {
      throw new Error(`Branch not found for receipt seed: ${receiptSeed.branchCode}`);
    }

    const supplierId = receiptSeed.supplierCode ? params.supplierMap.get(receiptSeed.supplierCode) ?? null : null;

    const receipt = await prisma.purchaseReceipt.upsert({
      where: {
        organizationId_receiptNumber: {
          organizationId: params.organizationId,
          receiptNumber: receiptSeed.receiptNumber,
        },
      },
      update: {
        branchId,
        supplierId,
        status: receiptSeed.status ?? PurchaseReceiptStatus.POSTED,
        invoiceDate: receiptSeed.invoiceDate ? new Date(receiptSeed.invoiceDate) : null,
        receivedAt: receiptSeed.receivedAt ? new Date(receiptSeed.receivedAt) : null,
        notes: receiptSeed.notes ?? null,
        createdById: params.createdById ?? null,
      },
      create: {
        organizationId: params.organizationId,
        branchId,
        supplierId,
        receiptNumber: receiptSeed.receiptNumber,
        status: receiptSeed.status ?? PurchaseReceiptStatus.POSTED,
        invoiceDate: receiptSeed.invoiceDate ? new Date(receiptSeed.invoiceDate) : null,
        receivedAt: receiptSeed.receivedAt ? new Date(receiptSeed.receivedAt) : null,
        notes: receiptSeed.notes ?? null,
        createdById: params.createdById ?? null,
      },
    });

    await prisma.purchaseReceiptItem.deleteMany({
      where: {
        purchaseReceiptId: receipt.id,
      },
    });

    let subtotal = new Prisma.Decimal(0);
    let taxTotal = new Prisma.Decimal(0);
    let discountTotal = new Prisma.Decimal(0);

    for (const item of receiptSeed.items) {
      const variantRef = params.variantMap.get(item.sku);

      if (!variantRef) {
        throw new Error(`Variant not found for receipt item: ${item.sku}`);
      }

      const quantity = decimal(item.quantity)!;
      const unitCost = decimal(item.unitCost)!;
      const taxRate = decimal(item.taxRate)!;
      const discountAmount = decimal(item.discountAmount ?? "0")!;
      const lineSubTotal = quantity.mul(unitCost);
      const taxAmount = roundMoney(lineSubTotal.mul(taxRate).div(100));
      const lineTotal = roundMoney(lineSubTotal.plus(taxAmount).minus(discountAmount));

      subtotal = subtotal.plus(lineSubTotal);
      taxTotal = taxTotal.plus(taxAmount);
      discountTotal = discountTotal.plus(discountAmount);

      await prisma.purchaseReceiptItem.create({
        data: {
          purchaseReceiptId: receipt.id,
          productId: variantRef.productId,
          variantId: variantRef.variantId,
          quantity,
          unitCost,
          taxRate,
          taxAmount,
          discountAmount,
          lineTotal,
          batchNumber: item.batchNumber ?? null,
          expiryDate: item.expiryDate ? new Date(item.expiryDate) : null,
        },
      });
    }

    await prisma.purchaseReceipt.update({
      where: { id: receipt.id },
      data: {
        subtotal: roundMoney(subtotal),
        taxTotal: roundMoney(taxTotal),
        discountTotal: roundMoney(discountTotal),
        total: roundMoney(subtotal.plus(taxTotal).minus(discountTotal)),
      },
    });
  }
}

async function seedSalesOrders(params: {
  organizationId: string;
  branchMap: Map<string, string>;
  customerMap: Map<string, string>;
  variantMap: Map<string, { variantId: string; productId: string; productName: string; variantName: string }>;
  orders: SalesOrderSeed[];
  createdById?: string;
  confirmedById?: string;
  deliveredById?: string;
}) {
  for (const orderSeed of params.orders) {
    const branchId = params.branchMap.get(orderSeed.branchCode);

    if (!branchId) {
      throw new Error(`Branch not found for sales order seed: ${orderSeed.branchCode}`);
    }

    const customerId = orderSeed.customerPhone ? params.customerMap.get(orderSeed.customerPhone) ?? null : null;

    const order = await prisma.salesOrder.upsert({
      where: {
        organizationId_orderNumber: {
          organizationId: params.organizationId,
          orderNumber: orderSeed.orderNumber,
        },
      },
      update: {
        branchId,
        customerId,
        source: orderSeed.source,
        status: orderSeed.status ?? SalesOrderStatus.PENDING,
        paymentStatus: orderSeed.paymentStatus ?? PaymentStatus.UNPAID,
        notes: orderSeed.notes ?? null,
        rejectionReason: orderSeed.rejectionReason ?? null,
        createdById: params.createdById ?? null,
        confirmedById: orderSeed.confirmedAt ? params.confirmedById ?? null : null,
        deliveredById: orderSeed.deliveredAt ? params.deliveredById ?? null : null,
        confirmedAt: orderSeed.confirmedAt ? new Date(orderSeed.confirmedAt) : null,
        deliveredAt: orderSeed.deliveredAt ? new Date(orderSeed.deliveredAt) : null,
      },
      create: {
        organizationId: params.organizationId,
        branchId,
        customerId,
        orderNumber: orderSeed.orderNumber,
        source: orderSeed.source,
        status: orderSeed.status ?? SalesOrderStatus.PENDING,
        paymentStatus: orderSeed.paymentStatus ?? PaymentStatus.UNPAID,
        notes: orderSeed.notes ?? null,
        rejectionReason: orderSeed.rejectionReason ?? null,
        createdById: params.createdById ?? null,
        confirmedById: orderSeed.confirmedAt ? params.confirmedById ?? null : null,
        deliveredById: orderSeed.deliveredAt ? params.deliveredById ?? null : null,
        confirmedAt: orderSeed.confirmedAt ? new Date(orderSeed.confirmedAt) : null,
        deliveredAt: orderSeed.deliveredAt ? new Date(orderSeed.deliveredAt) : null,
      },
    });

    await prisma.salesOrderItem.deleteMany({
      where: {
        salesOrderId: order.id,
      },
    });

    let subtotal = new Prisma.Decimal(0);
    let taxTotal = new Prisma.Decimal(0);
    let discountTotal = new Prisma.Decimal(0);

    for (const item of orderSeed.items) {
      const variantRef = params.variantMap.get(item.sku);

      if (!variantRef) {
        throw new Error(`Variant not found for sales order item: ${item.sku}`);
      }

      const quantity = decimal(item.quantity)!;
      const unitPrice = decimal(item.unitPrice)!;
      const taxRate = decimal(item.taxRate)!;
      const discountAmount = decimal(item.discountAmount ?? "0")!;
      const lineSubTotal = quantity.mul(unitPrice);
      const taxAmount = roundMoney(lineSubTotal.mul(taxRate).div(100));
      const lineTotal = roundMoney(lineSubTotal.plus(taxAmount).minus(discountAmount));

      subtotal = subtotal.plus(lineSubTotal);
      taxTotal = taxTotal.plus(taxAmount);
      discountTotal = discountTotal.plus(discountAmount);

      await prisma.salesOrderItem.create({
        data: {
          salesOrderId: order.id,
          productId: variantRef.productId,
          variantId: variantRef.variantId,
          productNameSnapshot: variantRef.productName,
          variantNameSnapshot: variantRef.variantName,
          skuSnapshot: item.sku,
          quantity,
          unitPrice,
          taxRate,
          taxAmount,
          discountAmount,
          lineTotal,
        },
      });
    }

    await prisma.salesOrder.update({
      where: { id: order.id },
      data: {
        subtotal: roundMoney(subtotal),
        taxTotal: roundMoney(taxTotal),
        discountTotal: roundMoney(discountTotal),
        total: roundMoney(subtotal.plus(taxTotal).minus(discountTotal)),
      },
    });
  }
}

async function seedStockTransfers(params: {
  organizationId: string;
  branchMap: Map<string, string>;
  variantMap: Map<string, { variantId: string; productId: string }>;
  transfers: StockTransferSeed[];
  createdById?: string;
  approvedById?: string;
}) {
  for (const transferSeed of params.transfers) {
    const fromBranchId = params.branchMap.get(transferSeed.fromBranchCode);
    const toBranchId = params.branchMap.get(transferSeed.toBranchCode);

    if (!fromBranchId || !toBranchId) {
      throw new Error(`Missing branch for stock transfer seed: ${transferSeed.transferNumber}`);
    }

    const transfer = await prisma.stockTransfer.upsert({
      where: {
        organizationId_transferNumber: {
          organizationId: params.organizationId,
          transferNumber: transferSeed.transferNumber,
        },
      },
      update: {
        fromBranchId,
        toBranchId,
        status: transferSeed.status ?? StockTransferStatus.DRAFT,
        notes: transferSeed.notes ?? null,
        createdById: params.createdById ?? null,
        approvedById: transferSeed.approvedAt ? params.approvedById ?? null : null,
        approvedAt: transferSeed.approvedAt ? new Date(transferSeed.approvedAt) : null,
      },
      create: {
        organizationId: params.organizationId,
        fromBranchId,
        toBranchId,
        transferNumber: transferSeed.transferNumber,
        status: transferSeed.status ?? StockTransferStatus.DRAFT,
        notes: transferSeed.notes ?? null,
        createdById: params.createdById ?? null,
        approvedById: transferSeed.approvedAt ? params.approvedById ?? null : null,
        approvedAt: transferSeed.approvedAt ? new Date(transferSeed.approvedAt) : null,
      },
    });

    await prisma.stockTransferItem.deleteMany({
      where: {
        stockTransferId: transfer.id,
      },
    });

    for (const item of transferSeed.items) {
      const variantRef = params.variantMap.get(item.sku);

      if (!variantRef) {
        throw new Error(`Variant not found for transfer item: ${item.sku}`);
      }

      await prisma.stockTransferItem.create({
        data: {
          stockTransferId: transfer.id,
          productId: variantRef.productId,
          variantId: variantRef.variantId,
          quantity: decimal(item.quantity)!,
          unitCost: decimal(item.unitCost),
        },
      });
    }
  }
}

async function seedAuditLogSeed(params: {
  organizationId: string;
  actorUserId?: string;
  action: AuditAction;
  entityType: string;
  entityId: string;
  meta?: Prisma.InputJsonValue;
}) {
  const existing = await prisma.auditLog.findFirst({
    where: {
      organizationId: params.organizationId,
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId,
    },
  });

  if (existing) {
    return;
  }

  await prisma.auditLog.create({
    data: {
      organizationId: params.organizationId,
      actorUserId: params.actorUserId ?? null,
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId,
      meta: params.meta ?? undefined,
    },
  });
}

async function seedDemoOrganizationCatalog(params: {
  organizationSlug: string;
  organizationName: string;
  legalName: string;
  email: string;
  phone: string;
  adminUser: { email: string; fullName: string };
  managerUser: { email: string; fullName: string };
  staffUser: { email: string; fullName: string };
  primaryIndustryCode: string;
  secondaryIndustryCodes?: string[];
  branches: OrgBranchSeed[];
  brands: OrgBrandSeed[];
  categories: OrgCategorySeed[];
  suppliers: OrgSupplierSeed[];
  customers: OrgCustomerSeed[];
  products: OrgProductSeed[];
  inventory: InventorySeed[];
  batches?: BatchSeed[];
  serials?: SerialSeed[];
  receipts?: PurchaseReceiptSeed[];
  orders?: SalesOrderSeed[];
  transfers?: StockTransferSeed[];
}) {
  const superAdmin = await ensureSeedSuperAdmin();

  const adminUser = await upsertUserSeed({
    email: params.adminUser.email,
    fullName: params.adminUser.fullName,
    platformRole: UserRole.ORG_ADMIN,
  });

  const managerUser = await upsertUserSeed({
    email: params.managerUser.email,
    fullName: params.managerUser.fullName,
    platformRole: null,
  });

  const staffUser = await upsertUserSeed({
    email: params.staffUser.email,
    fullName: params.staffUser.fullName,
    platformRole: undefined,
    preferredLanguage: LanguageCode.HI,
  });

  const organization = await upsertOrganizationSeed({
    slug: params.organizationSlug,
    name: params.organizationName,
    legalName: params.legalName,
    email: params.email,
    phone: params.phone,
    currencyCode: "INR",
    defaultLanguage: LanguageCode.EN,
  });

  await upsertMembershipSeed({
    userId: adminUser.id,
    organizationId: organization.id,
    role: UserRole.ORG_ADMIN,
    isDefault: true,
  });

  await upsertMembershipSeed({
    userId: managerUser.id,
    organizationId: organization.id,
    role: UserRole.MANAGER,
  });

  await upsertMembershipSeed({
    userId: staffUser.id,
    organizationId: organization.id,
    role: UserRole.STAFF,
  });

  await upsertMembershipSeed({
    userId: superAdmin.id,
    organizationId: organization.id,
    role: UserRole.ORG_ADMIN,
  });

  await upsertOrgIndustryConfig({
    organizationId: organization.id,
    industryCode: params.primaryIndustryCode,
    isPrimary: true,
  });

  for (const industryCode of params.secondaryIndustryCodes ?? []) {
    await upsertOrgIndustryConfig({
      organizationId: organization.id,
      industryCode,
      isPrimary: false,
    });
  }

  const branchMap = new Map<string, string>();

  for (const branch of params.branches) {
    const created = await upsertBranchSeed(organization.id, branch);
    branchMap.set(branch.code, created.id);
  }

  const brandMap = new Map<string, string>();

  for (const brand of params.brands) {
    const created = await upsertBrandSeed(organization.id, brand);
    brandMap.set(brand.slug, created.id);
  }

  for (const category of params.categories) {
    await upsertCategorySeed(organization.id, category);
  }

  await upsertTaxRateSeed(organization.id, "GST 0%", "GST0", "0");
  await upsertTaxRateSeed(organization.id, "GST 5%", "GST5", "5");
  await upsertTaxRateSeed(organization.id, "GST 12%", "GST12", "12");
  await upsertTaxRateSeed(organization.id, "GST 18%", "GST18", "18");

  const supplierMap = new Map<string, string>();

  for (const supplier of params.suppliers) {
    const created = await upsertSupplierSeed(organization.id, supplier);
    supplierMap.set(supplier.code, created.id);
  }

  const customerMap = new Map<string, string>();

  for (const customer of params.customers) {
    const created = await upsertCustomerSeed(organization.id, customer);
    if (customer.phone) {
      customerMap.set(customer.phone, created.id);
    }
  }

  const variantMap = new Map<string, { variantId: string; productId: string; productName: string; variantName: string }>();

  for (const productSeed of params.products) {
    const { product, variantsBySku } = await upsertProductSeed({
      organizationId: organization.id,
      createdById: adminUser.id,
      updatedById: managerUser.id,
      productSeed,
    });

    for (const variantSeed of productSeed.variants) {
      const variantId = variantsBySku.get(variantSeed.sku);

      if (!variantId) {
        throw new Error(`Variant not returned from product upsert: ${variantSeed.sku}`);
      }

      variantMap.set(variantSeed.sku, {
        variantId,
        productId: product.id,
        productName: product.name,
        variantName: variantSeed.name,
      });
    }
  }

  await seedInventoryBalances({
    organizationId: organization.id,
    inventory: params.inventory,
    branchMap,
    variantMap,
    createdById: managerUser.id,
  });

  if (params.batches?.length) {
    await seedInventoryBatches({
      organizationId: organization.id,
      batches: params.batches,
      branchMap,
      variantMap,
    });
  }

  if (params.serials?.length) {
    await seedSerialNumbers({
      organizationId: organization.id,
      serials: params.serials,
      branchMap,
      variantMap,
    });
  }

  if (params.receipts?.length) {
    await seedPurchaseReceipts({
      organizationId: organization.id,
      branchMap,
      supplierMap,
      variantMap,
      receipts: params.receipts,
      createdById: managerUser.id,
    });
  }

  if (params.orders?.length) {
    await seedSalesOrders({
      organizationId: organization.id,
      branchMap,
      customerMap,
      variantMap,
      orders: params.orders,
      createdById: staffUser.id,
      confirmedById: managerUser.id,
      deliveredById: staffUser.id,
    });
  }

  if (params.transfers?.length) {
    await seedStockTransfers({
      organizationId: organization.id,
      branchMap,
      variantMap,
      transfers: params.transfers,
      createdById: managerUser.id,
      approvedById: adminUser.id,
    });
  }

  const createdOrder = await prisma.salesOrder.findFirst({
    where: {
      organizationId: organization.id,
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  if (createdOrder) {
    await seedAuditLogSeed({
      organizationId: organization.id,
      actorUserId: managerUser.id,
      action: "ORDER_CONFIRM",
      entityType: "SalesOrder",
      entityId: createdOrder.id,
      meta: { seeded: true },
    });
  }

  const createdTransfer = await prisma.stockTransfer.findFirst({
    where: {
      organizationId: organization.id,
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  if (createdTransfer) {
    await seedAuditLogSeed({
      organizationId: organization.id,
      actorUserId: adminUser.id,
      action: "TRANSFER_APPROVE",
      entityType: "StockTransfer",
      entityId: createdTransfer.id,
      meta: { seeded: true },
    });
  }
}

async function main() {
  await seedUnits();
  await seedUnitTranslations();

  for (const industrySeed of [...industries, ...extraIndustries]) {
    await seedIndustryCatalog(industrySeed);
  }

  await seedDemoOrganizationCatalog({
    organizationSlug: "nearcart-grocery-demo",
    organizationName: "NearCart Grocery Demo",
    legalName: "NearCart Grocery Demo Private Limited",
    email: "hello.grocery@nearcart.local",
    phone: "+91-9900001000",
    adminUser: {
      email: "grocery.admin@nearcart.local",
      fullName: "Rohit Grocery Admin",
    },
    managerUser: {
      email: "grocery.manager@nearcart.local",
      fullName: "Pooja Grocery Manager",
    },
    staffUser: {
      email: "grocery.staff@nearcart.local",
      fullName: "Suresh Grocery Staff",
    },
    primaryIndustryCode: "grocery",
    secondaryIndustryCodes: ["restaurant", "beverage_shop", "frozen_food"],
    branches: groceryDemoBranches,
    brands: groceryDemoBrands,
    categories: groceryDemoCategories,
    suppliers: grocerySuppliers,
    customers: groceryCustomers,
    products: groceryProducts,
    inventory: groceryInventory,
    batches: groceryBatches,
    receipts: groceryReceipts,
    orders: groceryOrders,
    transfers: groceryTransfers,
  });

  await seedDemoOrganizationCatalog({
    organizationSlug: "nearcart-pharmacy-demo",
    organizationName: "NearCart Pharmacy Demo",
    legalName: "NearCart Pharmacy Demo Private Limited",
    email: "hello.pharmacy@nearcart.local",
    phone: "+91-9900002000",
    adminUser: {
      email: "pharmacy.admin@nearcart.local",
      fullName: "Anita Pharmacy Admin",
    },
    managerUser: {
      email: "pharmacy.manager@nearcart.local",
      fullName: "Vikas Pharmacy Manager",
    },
    staffUser: {
      email: "pharmacy.staff@nearcart.local",
      fullName: "Reena Pharmacy Staff",
    },
    primaryIndustryCode: "pharmacy",
    secondaryIndustryCodes: ["wellness", "optical"],
    branches: pharmacyDemoBranches,
    brands: pharmacyBrands,
    categories: pharmacyCategories,
    suppliers: pharmacySuppliers,
    customers: pharmacyCustomers,
    products: pharmacyProducts,
    inventory: pharmacyInventory,
    batches: pharmacyBatches,
    serials: pharmacySerials,
    receipts: pharmacyReceipts,
    orders: pharmacyOrders,
    transfers: pharmacyTransfers,
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error("Extended seed failed", error);
    await prisma.$disconnect();
    process.exit(1);
  });
