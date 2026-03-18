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
