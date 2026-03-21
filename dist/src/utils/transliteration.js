"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.translateRomanizedInventoryText = translateRomanizedInventoryText;
const INVENTORY_TRANSLITERATION_GLOSSARY = [
    { aliases: ["tamatar", "tamater"], translations: { EN: "Tomato", HI: "टमाटर", GU: "ટામેટું" } },
    { aliases: ["aloo", "aalu"], translations: { EN: "Potato", HI: "आलू", GU: "બટાકા" } },
    { aliases: ["pyaaz", "pyaz"], translations: { EN: "Onion", HI: "प्याज", GU: "ડુંગળી" } },
    { aliases: ["mirchi", "mirch"], translations: { EN: "Chili", HI: "मिर्च", GU: "મરચું" } },
    { aliases: ["dhaniya"], translations: { EN: "Coriander", HI: "धनिया", GU: "ધાણા" } },
    { aliases: ["haldi"], translations: { EN: "Turmeric", HI: "हल्दी", GU: "હળદર" } },
    { aliases: ["adrak"], translations: { EN: "Ginger", HI: "अदरक", GU: "આદુ" } },
    { aliases: ["lehsun", "lahsun"], translations: { EN: "Garlic", HI: "लहसुन", GU: "લસણ" } },
    { aliases: ["doodh"], translations: { EN: "Milk", HI: "दूध", GU: "દૂધ" } },
    { aliases: ["dahi"], translations: { EN: "Curd", HI: "दही", GU: "દહીં" } },
    { aliases: ["paneer"], translations: { EN: "Paneer", HI: "पनीर", GU: "પનીર" } },
    { aliases: ["atta"], translations: { EN: "Flour", HI: "आटा", GU: "આટા" } },
    { aliases: ["chawal"], translations: { EN: "Rice", HI: "चावल", GU: "ચોખા" } },
    { aliases: ["namak"], translations: { EN: "Salt", HI: "नमक", GU: "મીઠું" } },
    { aliases: ["cheeni", "chini"], translations: { EN: "Sugar", HI: "चीनी", GU: "ખાંડ" } },
    { aliases: ["sabzi", "sabji"], translations: { EN: "Vegetable", HI: "सब्जी", GU: "શાકભાજી" } },
];
const glossaryByAlias = new Map(INVENTORY_TRANSLITERATION_GLOSSARY.flatMap((entry) => entry.aliases.map((alias) => [alias.toLowerCase(), entry.translations])));
function replaceToken(token, targetLanguage) {
    if (!/^[a-z]+$/i.test(token)) {
        return token;
    }
    const translation = glossaryByAlias.get(token.toLowerCase())?.[targetLanguage];
    return translation ?? token;
}
function translateRomanizedInventoryText(value, targetLanguage) {
    const normalizedValue = value.trim();
    if (!normalizedValue || !/^[\x00-\x7F]+$/.test(normalizedValue)) {
        return null;
    }
    const translated = normalizedValue.replace(/[A-Za-z]+/g, (token) => replaceToken(token, targetLanguage));
    return translated !== normalizedValue ? translated : null;
}
