"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.autocompleteController = autocompleteController;
exports.geocodeController = geocodeController;
exports.reverseGeocodeController = reverseGeocodeController;
const ApiResponse_1 = require("../../utils/ApiResponse");
const location_service_1 = require("./location.service");
const location_validation_1 = require("./location.validation");
async function autocompleteController(req, res) {
    const query = location_validation_1.autocompleteQuerySchema.parse(req.query);
    const result = await (0, location_service_1.autocompletePlaces)({
        query: query.input,
        sessionToken: query.sessionToken,
        language: query.language,
        regionBias: query.region,
        latitude: query.lat,
        longitude: query.lng,
        radiusMeters: query.radiusMeters,
    });
    return (0, ApiResponse_1.sendSuccess)(res, 200, "Autocomplete predictions fetched successfully", result);
}
async function geocodeController(req, res) {
    const query = location_validation_1.geocodeQuerySchema.parse(req.query);
    const result = query.placeId ? await (0, location_service_1.geocodePlaceId)(query.placeId) : await (0, location_service_1.geocodeAddress)(query.address);
    return (0, ApiResponse_1.sendSuccess)(res, 200, "Geocode result fetched successfully", result);
}
async function reverseGeocodeController(req, res) {
    const query = location_validation_1.reverseGeocodeQuerySchema.parse(req.query);
    const result = await (0, location_service_1.reverseGeocode)(query.lat, query.lng);
    return (0, ApiResponse_1.sendSuccess)(res, 200, "Reverse geocode result fetched successfully", result);
}
