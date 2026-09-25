import type { Request, Response } from "express";

import { sendSuccess } from "../../utils/ApiResponse";
import { autocompletePlaces, geocodeAddress, geocodePlaceId, reverseGeocode } from "./location.service";
import { autocompleteQuerySchema, geocodeQuerySchema, reverseGeocodeQuerySchema } from "./location.validation";

export async function autocompleteController(req: Request, res: Response) {
  const query = autocompleteQuerySchema.parse(req.query);
  const result = await autocompletePlaces({
    query: query.input,
    sessionToken: query.sessionToken,
    language: query.language,
    regionBias: query.region,
    latitude: query.lat,
    longitude: query.lng,
    radiusMeters: query.radiusMeters,
  });

  return sendSuccess(res, 200, "Autocomplete predictions fetched successfully", result);
}

export async function geocodeController(req: Request, res: Response) {
  const query = geocodeQuerySchema.parse(req.query);
  const result = query.placeId ? await geocodePlaceId(query.placeId) : await geocodeAddress(query.address as string);

  return sendSuccess(res, 200, "Geocode result fetched successfully", result);
}

export async function reverseGeocodeController(req: Request, res: Response) {
  const query = reverseGeocodeQuerySchema.parse(req.query);
  const result = await reverseGeocode(query.lat, query.lng);

  return sendSuccess(res, 200, "Reverse geocode result fetched successfully", result);
}
