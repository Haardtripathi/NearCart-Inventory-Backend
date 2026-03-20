"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const masterCatalog_1 = require("../src/utils/masterCatalog");
const slug_1 = require("../src/utils/slug");
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
function names(EN, HI, GU) {
    return { EN, HI, GU };
}
function withDescriptions(nameValues, descriptions) {
    return {
        EN: { name: nameValues.EN, description: descriptions?.EN },
        HI: { name: nameValues.HI, description: descriptions?.HI },
        GU: { name: nameValues.GU, description: descriptions?.GU },
    };
}
function sizeVariants() {
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
function mirroredTranslations(name, description) {
    return withDescriptions(names(name, name, name), description
        ? {
            EN: description,
            HI: description,
            GU: description,
        }
        : undefined);
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
function buildGeneratedIndustry(spec) {
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
            defaultTrackMethod: item.trackMethod ?? client_1.TrackMethod.PIECE,
            hasVariants: item.hasVariants,
            variantTemplates: item.variantTemplates,
        })),
    };
}
const generatedIndustries = [
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
            { code: "engine_oil", categoryCode: "lubricants", name: "Engine Oil", description: "Engine oil cans for scheduled maintenance.", unitCode: "l", trackMethod: client_1.TrackMethod.VOLUME },
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
            { code: "dog_food", categoryCode: "food", name: "Dog Food", description: "Dry dog food bags for daily feeding.", unitCode: "kg", trackMethod: client_1.TrackMethod.WEIGHT },
            { code: "cat_food", categoryCode: "food", name: "Cat Food", description: "Cat food packs for retail pet stores.", unitCode: "kg", trackMethod: client_1.TrackMethod.WEIGHT },
            { code: "pet_shampoo", categoryCode: "grooming", name: "Pet Shampoo", description: "Pet-safe shampoo bottles for grooming.", unitCode: "pack" },
            { code: "litter_bag", categoryCode: "litter", name: "Litter Bag", description: "Cat litter refill bags.", unitCode: "kg", trackMethod: client_1.TrackMethod.WEIGHT },
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
            { code: "baking_flour", categoryCode: "ingredients", name: "Baking Flour", description: "Flour bag for baking production.", unitCode: "kg", trackMethod: client_1.TrackMethod.WEIGHT },
            { code: "cocoa_powder", categoryCode: "ingredients", name: "Cocoa Powder", description: "Cocoa powder for cakes and desserts.", unitCode: "kg", trackMethod: client_1.TrackMethod.WEIGHT },
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
            { code: "bio_fertilizer", categoryCode: "fertilizers", name: "Bio Fertilizer", description: "Organic fertilizer for soil enrichment.", unitCode: "kg", trackMethod: client_1.TrackMethod.WEIGHT },
            { code: "spray_pump", categoryCode: "tools", name: "Spray Pump", description: "Manual spray pump for crop care and pesticides." },
            { code: "drip_pipe", categoryCode: "irrigation", name: "Drip Pipe", description: "Drip irrigation pipe rolls.", unitCode: "m", trackMethod: client_1.TrackMethod.LENGTH },
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
            { code: "floor_cleaner", categoryCode: "household", name: "Floor Cleaner", description: "Liquid floor cleaner for daily mopping.", unitCode: "l", trackMethod: client_1.TrackMethod.VOLUME },
            { code: "detergent_powder", categoryCode: "laundry", name: "Detergent Powder", description: "Laundry detergent powder bags.", unitCode: "kg", trackMethod: client_1.TrackMethod.WEIGHT },
            { code: "dishwash_liquid", categoryCode: "kitchen", name: "Dishwash Liquid", description: "Dishwashing liquid bottles.", unitCode: "l", trackMethod: client_1.TrackMethod.VOLUME },
            { code: "toilet_cleaner", categoryCode: "bathroom", name: "Toilet Cleaner", description: "Bathroom cleaner for toilet bowls.", unitCode: "l", trackMethod: client_1.TrackMethod.VOLUME },
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
            { code: "cement_bag", categoryCode: "cementing", name: "Cement Bag", description: "Standard cement bag for civil work.", unitCode: "kg", trackMethod: client_1.TrackMethod.WEIGHT },
            { code: "wall_putty", categoryCode: "cementing", name: "Wall Putty", description: "Wall putty bags for finishing work.", unitCode: "kg", trackMethod: client_1.TrackMethod.WEIGHT },
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
            { code: "potting_soil", categoryCode: "soil", name: "Potting Soil", description: "Potting soil mix for container gardening.", unitCode: "kg", trackMethod: client_1.TrackMethod.WEIGHT },
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
            { code: "protein_powder", categoryCode: "supplements", name: "Protein Powder", description: "Protein powder tubs for nutrition stores.", unitCode: "kg", trackMethod: client_1.TrackMethod.WEIGHT },
            { code: "yoga_block", categoryCode: "yoga", name: "Yoga Block", description: "Yoga block for balance and stretching." },
            { code: "massage_oil", categoryCode: "massage", name: "Massage Oil", description: "Massage oil bottle for therapy and wellness.", unitCode: "l", trackMethod: client_1.TrackMethod.VOLUME },
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
            { code: "coffee_beans", categoryCode: "coffee", name: "Coffee Beans", description: "Whole coffee beans for cafe retail.", unitCode: "kg", trackMethod: client_1.TrackMethod.WEIGHT },
            { code: "tea_leaves", categoryCode: "tea", name: "Tea Leaves", description: "Loose tea leaves for tea counters.", unitCode: "kg", trackMethod: client_1.TrackMethod.WEIGHT },
            { code: "orange_juice", categoryCode: "juices", name: "Orange Juice", description: "Packaged orange juice bottles.", unitCode: "l", trackMethod: client_1.TrackMethod.VOLUME },
            { code: "cold_coffee", categoryCode: "ready_to_drink", name: "Cold Coffee", description: "Ready-to-drink cold coffee bottles.", unitCode: "l", trackMethod: client_1.TrackMethod.VOLUME },
            { code: "sparkling_water", categoryCode: "ready_to_drink", name: "Sparkling Water", description: "Sparkling water bottles for beverage stores.", unitCode: "l", trackMethod: client_1.TrackMethod.VOLUME },
        ],
    }),
];
const industries = [
    {
        code: "grocery",
        canonicalName: "Grocery",
        canonicalDescription: "Retail grocery, fresh produce, packaged foods, and household essentials.",
        translations: withDescriptions(names("Grocery", "किराना", "કરિયાણું"), {
            EN: "Retail grocery, fresh produce, packaged foods, and household essentials.",
            HI: "किराना, ताज़ा उपज, पैकेज्ड खाद्य और घरेलू ज़रूरतों के लिए इन्वेंट्री।",
            GU: "કરિયાણું, તાજી ઉપજ, પેકેજ્ડ ખોરાક અને ઘરગથ્થુ જરૂરિયાતો માટેની ઇન્વેન્ટરી.",
        }),
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
                    { language: client_1.LanguageCode.EN, value: "full cream milk" },
                    { language: client_1.LanguageCode.HI, value: "दूध पैकेट" },
                    { language: client_1.LanguageCode.GU, value: "દૂધ પેકેટ" },
                ],
                defaultTrackMethod: client_1.TrackMethod.VOLUME,
                defaultUnitCode: "l",
                tags: ["dairy", "daily"],
            },
            {
                code: "grocery_curd",
                categoryCode: "dairy",
                canonicalName: "Curd",
                canonicalDescription: "Fresh curd tubs and pouches.",
                translations: withDescriptions(names("Curd", "दही", "દહીં")),
                defaultTrackMethod: client_1.TrackMethod.WEIGHT,
                defaultUnitCode: "kg",
            },
            {
                code: "grocery_paneer",
                categoryCode: "dairy",
                canonicalName: "Paneer",
                canonicalDescription: "Fresh cottage cheese blocks.",
                translations: withDescriptions(names("Paneer", "पनीर", "પનીર")),
                defaultTrackMethod: client_1.TrackMethod.WEIGHT,
                defaultUnitCode: "kg",
            },
            {
                code: "grocery_potato_chips",
                categoryCode: "snacks",
                canonicalName: "Potato Chips",
                canonicalDescription: "Popular flavored potato chips.",
                translations: withDescriptions(names("Potato Chips", "आलू चिप्स", "બટાકા ચીપ્સ")),
                aliases: [{ language: client_1.LanguageCode.EN, value: "chips" }],
                defaultUnitCode: "pack",
            },
            {
                code: "grocery_biscuits",
                categoryCode: "snacks",
                canonicalName: "Biscuits",
                canonicalDescription: "Tea-time sweet and salted biscuits.",
                translations: withDescriptions(names("Biscuits", "बिस्किट", "બિસ્કિટ")),
                defaultUnitCode: "pack",
            },
            {
                code: "grocery_packaged_water",
                categoryCode: "beverages",
                canonicalName: "Packaged Water",
                canonicalDescription: "Sealed drinking water bottles.",
                translations: withDescriptions(names("Packaged Water", "पैक्ड पानी", "પૅકેજ્ડ પાણી")),
                defaultTrackMethod: client_1.TrackMethod.VOLUME,
                defaultUnitCode: "l",
            },
            {
                code: "grocery_rice",
                categoryCode: "staples",
                canonicalName: "Rice",
                canonicalDescription: "Popular everyday rice grades.",
                translations: withDescriptions(names("Rice", "चावल", "ચોખા")),
                aliases: [{ language: client_1.LanguageCode.HI, value: "चावल" }],
                defaultTrackMethod: client_1.TrackMethod.WEIGHT,
                defaultUnitCode: "kg",
            },
            {
                code: "grocery_wheat_flour",
                categoryCode: "staples",
                canonicalName: "Wheat Flour",
                canonicalDescription: "Fresh chakki atta and packaged flour.",
                translations: withDescriptions(names("Wheat Flour", "आटा", "ઘઉંનો લોટ")),
                defaultTrackMethod: client_1.TrackMethod.WEIGHT,
                defaultUnitCode: "kg",
            },
            {
                code: "grocery_cooking_oil",
                categoryCode: "staples",
                canonicalName: "Cooking Oil",
                canonicalDescription: "Refined cooking oil for home use.",
                translations: withDescriptions(names("Cooking Oil", "खाना पकाने का तेल", "રસોઈનું તેલ")),
                defaultTrackMethod: client_1.TrackMethod.VOLUME,
                defaultUnitCode: "l",
            },
        ],
    },
    {
        code: "pharmacy",
        canonicalName: "Pharmacy",
        canonicalDescription: "Pharmacy inventory with expiry awareness and batch traceability.",
        translations: withDescriptions(names("Pharmacy", "फार्मेसी", "ફાર્મસી"), {
            EN: "Pharmacy inventory with expiry awareness and batch traceability.",
            HI: "फार्मेसी इन्वेंट्री जिसमें एक्सपायरी और बैच ट्रेसिंग शामिल है।",
            GU: "ફાર્મસી ઇન્વેન્ટરી જેમાં એક્સપાયરી અને બેચ ટ્રેસિંગ સામેલ છે.",
        }),
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
        ],
        items: [
            {
                code: "pharmacy_paracetamol",
                categoryCode: "otc",
                canonicalName: "Paracetamol",
                canonicalDescription: "Common OTC pain and fever relief tablets.",
                translations: withDescriptions(names("Paracetamol", "पैरासिटामोल", "પેરાસિટામોલ")),
                aliases: [{ language: client_1.LanguageCode.EN, value: "acetaminophen" }],
                defaultUnitCode: "box",
            },
            {
                code: "pharmacy_bandage",
                categoryCode: "hygiene",
                canonicalName: "Bandage",
                canonicalDescription: "Sterile dressing bandages and rolls.",
                translations: withDescriptions(names("Bandage", "पट्टी", "બૅન્ડેજ")),
                defaultUnitCode: "box",
            },
            {
                code: "pharmacy_antiseptic_liquid",
                categoryCode: "hygiene",
                canonicalName: "Antiseptic Liquid",
                canonicalDescription: "Liquid antiseptic for wound cleaning.",
                translations: withDescriptions(names("Antiseptic Liquid", "एंटीसेप्टिक लिक्विड", "એન્ટિસેપ્ટિક લિક્વિડ")),
                defaultTrackMethod: client_1.TrackMethod.VOLUME,
                defaultUnitCode: "ml",
            },
            {
                code: "pharmacy_face_mask",
                categoryCode: "respiratory",
                canonicalName: "Face Mask",
                canonicalDescription: "Disposable protective face masks.",
                translations: withDescriptions(names("Face Mask", "फेस मास्क", "ફેસ માસ્ક")),
                defaultUnitCode: "box",
            },
            {
                code: "pharmacy_sanitizer",
                categoryCode: "hygiene",
                canonicalName: "Sanitizer",
                canonicalDescription: "Alcohol-based hand sanitizer bottles.",
                translations: withDescriptions(names("Sanitizer", "सैनिटाइज़र", "સેનિટાઇઝર")),
                defaultTrackMethod: client_1.TrackMethod.VOLUME,
                defaultUnitCode: "ml",
            },
            {
                code: "pharmacy_toothpaste",
                categoryCode: "personal_care",
                canonicalName: "Toothpaste",
                canonicalDescription: "Daily oral care toothpaste tubes.",
                translations: withDescriptions(names("Toothpaste", "टूथपेस्ट", "ટૂથપેસ્ટ")),
                defaultUnitCode: "pack",
            },
            {
                code: "pharmacy_cough_syrup",
                categoryCode: "respiratory",
                canonicalName: "Cough Syrup",
                canonicalDescription: "Soothing cough relief syrup.",
                translations: withDescriptions(names("Cough Syrup", "कफ सिरप", "કફ સિરપ")),
                defaultTrackMethod: client_1.TrackMethod.VOLUME,
                defaultUnitCode: "ml",
            },
            {
                code: "pharmacy_pain_relief_spray",
                categoryCode: "otc",
                canonicalName: "Pain Relief Spray",
                canonicalDescription: "Topical spray for muscular pain relief.",
                translations: withDescriptions(names("Pain Relief Spray", "दर्द निवारक स्प्रे", "પેઇન રિલીફ સ્પ્રે")),
                defaultUnitCode: "pack",
            },
        ],
    },
    {
        code: "fashion",
        canonicalName: "Fashion",
        canonicalDescription: "Fashion and apparel inventory with multi-variant products.",
        translations: withDescriptions(names("Fashion", "फैशन", "ફેશન"), {
            EN: "Fashion and apparel inventory with multi-variant products.",
            HI: "फैशन और परिधान की इन्वेंट्री जिसमें मल्टी-वेरिएंट उत्पाद शामिल हैं।",
            GU: "ફેશન અને પરિધાનની ઇન્વેન્ટરી જેમાં મલ્ટી-વેરિયન્ટ પ્રોડક્ટ્સ સામેલ છે.",
        }),
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
        translations: withDescriptions(names("Electronics", "इलेक्ट्रॉनिक्स", "ઇલેક્ટ્રોનિક્સ"), {
            EN: "Electronics inventory with serial-number-ready product handling.",
            HI: "इलेक्ट्रॉनिक्स इन्वेंट्री जिसमें सीरियल-नंबर तैयार उत्पाद प्रबंधन शामिल है।",
            GU: "ઇલેક્ટ્રોનિક્સ ઇન્વેન્ટરી જેમાં સિરિયલ નંબર તૈયાર પ્રોડક્ટ હેન્ડલિંગ સામેલ છે.",
        }),
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
        translations: withDescriptions(names("Hardware", "हार्डवेयर", "હાર્ડવેર"), {
            EN: "Hardware and tools inventory with mixed unit-based and measured stock.",
            HI: "हार्डवेयर और टूल्स की इन्वेंट्री जिसमें यूनिट और माप आधारित स्टॉक शामिल है।",
            GU: "હાર્ડવેર અને ટૂલ્સની ઇન્વેન્ટરી જેમાં યુનિટ અને માપ આધારિત સ્ટોક સામેલ છે.",
        }),
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
                defaultTrackMethod: client_1.TrackMethod.LENGTH,
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
        translations: withDescriptions(names("Restaurant", "रेस्टोरेंट", "રેસ્ટોરન્ટ"), {
            EN: "Restaurant and kitchen inventory with batch and expiry awareness.",
            HI: "रेस्टोरेंट और किचन की इन्वेंट्री जिसमें बैच और एक्सपायरी ट्रैकिंग शामिल है।",
            GU: "રેસ્ટોરન્ટ અને રસોડાની ઇન્વેન્ટરી જેમાં બેચ અને એક્સપાયરી ટ્રેકિંગ સામેલ છે.",
        }),
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
                defaultTrackMethod: client_1.TrackMethod.WEIGHT,
                defaultUnitCode: "kg",
            },
            {
                code: "restaurant_tomato",
                categoryCode: "vegetables",
                canonicalName: "Tomato",
                canonicalDescription: "Fresh tomatoes for curries and salads.",
                translations: withDescriptions(names("Tomato", "टमाटर", "ટામેટા")),
                defaultTrackMethod: client_1.TrackMethod.WEIGHT,
                defaultUnitCode: "kg",
            },
            {
                code: "restaurant_milk",
                categoryCode: "dairy",
                canonicalName: "Milk",
                canonicalDescription: "Kitchen milk for tea and cooking.",
                translations: withDescriptions(names("Milk", "दूध", "દૂધ")),
                defaultTrackMethod: client_1.TrackMethod.VOLUME,
                defaultUnitCode: "l",
            },
            {
                code: "restaurant_cheese_block",
                categoryCode: "dairy",
                canonicalName: "Cheese Block",
                canonicalDescription: "Bulk cheese blocks for food prep.",
                translations: withDescriptions(names("Cheese Block", "चीज़ ब्लॉक", "ચીઝ બ્લોક")),
                defaultTrackMethod: client_1.TrackMethod.WEIGHT,
                defaultUnitCode: "kg",
            },
            {
                code: "restaurant_rice",
                categoryCode: "dry_goods",
                canonicalName: "Rice",
                canonicalDescription: "Bulk rice for biryani and thali prep.",
                translations: withDescriptions(names("Rice", "चावल", "ચોખા")),
                defaultTrackMethod: client_1.TrackMethod.WEIGHT,
                defaultUnitCode: "kg",
            },
            {
                code: "restaurant_cooking_oil",
                categoryCode: "oils_spices",
                canonicalName: "Cooking Oil",
                canonicalDescription: "Bulk refined oil for kitchen use.",
                translations: withDescriptions(names("Cooking Oil", "खाना पकाने का तेल", "રસોઈનું તેલ")),
                defaultTrackMethod: client_1.TrackMethod.VOLUME,
                defaultUnitCode: "l",
            },
            {
                code: "restaurant_potato",
                categoryCode: "vegetables",
                canonicalName: "Potato",
                canonicalDescription: "Potatoes for curries, fries, and prep.",
                translations: withDescriptions(names("Potato", "आलू", "બટાટા")),
                defaultTrackMethod: client_1.TrackMethod.WEIGHT,
                defaultUnitCode: "kg",
            },
            {
                code: "restaurant_turmeric_powder",
                categoryCode: "oils_spices",
                canonicalName: "Turmeric Powder",
                canonicalDescription: "Ground turmeric for spice mix prep.",
                translations: withDescriptions(names("Turmeric Powder", "हल्दी पाउडर", "હળદર પાઉડર")),
                defaultTrackMethod: client_1.TrackMethod.WEIGHT,
                defaultUnitCode: "kg",
            },
        ],
    },
    ...generatedIndustries,
];
function translationEntries(translations) {
    return Object.entries(translations).map(([language, value]) => ({
        language: language,
        name: value.name,
        description: value.description ?? null,
    }));
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
async function seedIndustryCatalog(industrySeed) {
    const industry = await prisma.industry.upsert({
        where: { code: industrySeed.code },
        update: {
            name: industrySeed.canonicalName,
            description: industrySeed.canonicalDescription,
            isActive: true,
            defaultFeatures: industrySeed.defaultFeatures,
        },
        create: {
            code: industrySeed.code,
            name: industrySeed.canonicalName,
            description: industrySeed.canonicalDescription,
            isActive: true,
            defaultFeatures: industrySeed.defaultFeatures,
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
                slug: (0, slug_1.slugify)(categorySeed.code),
                sortOrder: categorySeed.sortOrder,
                isActive: true,
            },
            create: {
                industryId: industry.id,
                code: categorySeed.code,
                slug: (0, slug_1.slugify)(categorySeed.code),
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
    const categoriesByCode = new Map((await prisma.masterCatalogCategory.findMany({
        where: {
            industryId: industry.id,
        },
        select: {
            id: true,
            code: true,
        },
    })).map((category) => [category.code, category.id]));
    for (const itemSeed of industrySeed.items) {
        const masterItemSlug = (0, slug_1.slugify)(`${industrySeed.code}-${itemSeed.canonicalName}`);
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
                productType: itemSeed.hasVariants || (itemSeed.variantTemplates?.length ?? 0) > 0
                    ? client_1.ProductType.VARIABLE
                    : itemSeed.productType ?? client_1.ProductType.SIMPLE,
                defaultTrackMethod: itemSeed.defaultTrackMethod ?? client_1.TrackMethod.PIECE,
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
                productType: itemSeed.hasVariants || (itemSeed.variantTemplates?.length ?? 0) > 0
                    ? client_1.ProductType.VARIABLE
                    : itemSeed.productType ?? client_1.ProductType.SIMPLE,
                defaultTrackMethod: itemSeed.defaultTrackMethod ?? client_1.TrackMethod.PIECE,
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
            data: Object.entries(itemSeed.translations).map(([language, value]) => ({
                masterItemId: masterItem.id,
                language: language,
                name: value.name,
                shortName: null,
                description: value.description ?? null,
            })),
        });
        await prisma.masterCatalogItemAlias.deleteMany({
            where: {
                masterItemId: masterItem.id,
            },
        });
        const aliases = (0, masterCatalog_1.normalizeMasterCatalogAliasValues)(itemSeed.aliases ?? []);
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
                    data: Object.entries(variantSeed.translations).map(([language, name]) => ({
                        masterVariantTemplateId: createdVariant.id,
                        language: language,
                        name,
                    })),
                });
            }
        }
        const searchText = (0, masterCatalog_1.buildMasterItemSearchText)({
            canonicalName: itemSeed.canonicalName,
            code: itemSeed.code,
            slug: masterItemSlug,
            translations: Object.entries(itemSeed.translations).map(([, value]) => ({
                name: value.name,
                shortName: null,
            })),
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
async function main() {
    await seedUnits();
    for (const industrySeed of industries) {
        await seedIndustryCatalog(industrySeed);
    }
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
