import { env } from "../config/env";

export interface PlaceCandidate {
  name: string;
  placeId: string;
  distanceMeters: number;
}

export interface PlaceLocationMatchResult {
  placeLocationMatch: boolean;
  matchedPlaceCandidates: PlaceCandidate[];
  reasons: string[];
}

export function isGooglePlacesConfigured(): boolean {
  return Boolean(env.GOOGLE_MAPS_API_KEY);
}

// Haversine distance in meters — used to compute matchedPlaceCandidates[].distanceMeters and to
// decide whether a returned Nearby Search result is "at" the shop's registered lat/lng rather
// than just somewhere in the same neighbourhood.
function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// Cheap fuzzy name match: normalize (lowercase, strip punctuation), then compare as token sets.
// A real product would want something stronger (Jaro-Winkler / trigram similarity), but this is
// enough to tell "Sharma General Store" apart from "Sharma Electronics" while still matching
// "Sharma General Store" against "SHARMA GENERAL STORE (Kirana)".
function normalizeName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function nameSimilarity(a: string, b: string): number {
  const tokensA = new Set(normalizeName(a).split(" ").filter(Boolean));
  const tokensB = new Set(normalizeName(b).split(" ").filter(Boolean));
  if (tokensA.size === 0 || tokensB.size === 0) return 0;

  let overlap = 0;
  for (const token of tokensA) {
    if (tokensB.has(token)) overlap += 1;
  }

  return overlap / Math.max(tokensA.size, tokensB.size);
}

const NAME_MATCH_THRESHOLD = 0.4;
const SEARCH_RADIUS_METERS = 150;

/**
 * Checks whether a real listed business with a matching/similar name exists at the shop's
 * registered lat/lng, via Google Places Nearby Search (keyword=shop name, radius=150m). Used by
 * POST /branches/:id/verification/photo's `placeLocationMatch` field.
 *
 * Fails soft (never throws) when GOOGLE_MAPS_API_KEY is unset or the Places API call itself
 * fails — the caller decides what that means for `verified` overall; a failed/unavailable place
 * check should not by itself hard-block onboarding (see PHASE1 shop-verification requirements:
 * only the compulsory-photo-upload gate is hard, everything else is a flagged signal).
 */
export async function checkPlaceLocationMatch(input: {
  name: string;
  latitude: number;
  longitude: number;
}): Promise<PlaceLocationMatchResult> {
  if (!isGooglePlacesConfigured()) {
    return {
      placeLocationMatch: false,
      matchedPlaceCandidates: [],
      reasons: ["Google Places lookup skipped: GOOGLE_MAPS_API_KEY is not configured"],
    };
  }

  const url = new URL("https://maps.googleapis.com/maps/api/place/nearbysearch/json");
  url.searchParams.set("location", `${input.latitude},${input.longitude}`);
  url.searchParams.set("radius", String(SEARCH_RADIUS_METERS));
  url.searchParams.set("keyword", input.name);
  url.searchParams.set("key", env.GOOGLE_MAPS_API_KEY!);

  try {
    const response = await fetch(url.toString());
    const body = (await response.json()) as {
      status: string;
      results?: Array<{
        name: string;
        place_id: string;
        geometry?: { location?: { lat: number; lng: number } };
      }>;
      error_message?: string;
    };

    if (body.status !== "OK" && body.status !== "ZERO_RESULTS") {
      return {
        placeLocationMatch: false,
        matchedPlaceCandidates: [],
        reasons: [`Google Places lookup failed: ${body.status}${body.error_message ? ` (${body.error_message})` : ""}`],
      };
    }

    const candidates: PlaceCandidate[] = (body.results ?? [])
      .filter((result) => result.geometry?.location)
      .map((result) => ({
        name: result.name,
        placeId: result.place_id,
        distanceMeters: Math.round(
          distanceMeters(
            input.latitude,
            input.longitude,
            result.geometry!.location!.lat,
            result.geometry!.location!.lng,
          ),
        ),
      }))
      .sort((a, b) => a.distanceMeters - b.distanceMeters)
      .slice(0, 5);

    const bestMatch = candidates.find(
      (candidate) => nameSimilarity(candidate.name, input.name) >= NAME_MATCH_THRESHOLD,
    );

    return {
      placeLocationMatch: Boolean(bestMatch),
      matchedPlaceCandidates: candidates,
      reasons: bestMatch
        ? [`Found a listed business ("${bestMatch.name}") matching the shop name within ${SEARCH_RADIUS_METERS}m`]
        : candidates.length > 0
          ? ["Nearby businesses were found, but none closely matched the registered shop name"]
          : ["No listed businesses were found near the registered shop location"],
    };
  } catch (error) {
    return {
      placeLocationMatch: false,
      matchedPlaceCandidates: [],
      reasons: [`Google Places lookup failed: ${error instanceof Error ? error.message : "unknown error"}`],
    };
  }
}
