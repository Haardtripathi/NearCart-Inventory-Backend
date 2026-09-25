import { env } from "../../config/env";
import { ApiError } from "../../utils/ApiError";

const GOOGLE_MAPS_BASE_URL = "https://maps.googleapis.com/maps/api";
const GOOGLE_PLACES_BASE_URL = "https://places.googleapis.com/v1";

/** Every shop/branch on this platform is in India; an unbiased global autocomplete is what made
 *  address search return the wrong city in the sibling NearCart app (2026-09-20) — same fix
 *  applied here for the shop-location picker (signup onboarding, branch create/edit). */
const DEFAULT_REGION_CODE = "in";
/** ~50 km — a soft bias, not a hard filter: results outside it still appear, just ranked lower. */
const DEFAULT_BIAS_RADIUS_METERS = 50_000;

interface GoogleAddressComponent {
  long_name: string;
  short_name: string;
  types: string[];
}

interface GoogleGeometry {
  location: { lat: number; lng: number };
}

interface GoogleGeocodeResult {
  formatted_address: string;
  place_id: string;
  geometry: GoogleGeometry;
  address_components: GoogleAddressComponent[];
}

interface GoogleGeocodeResponse {
  status: string;
  error_message?: string;
  results: GoogleGeocodeResult[];
}

interface GooglePlaceText {
  text?: string;
}

interface GooglePlacePrediction {
  placeId?: string;
  text?: GooglePlaceText;
  structuredFormat?: {
    mainText?: GooglePlaceText;
    secondaryText?: GooglePlaceText;
  };
}

interface GooglePlacesAutocompleteResponse {
  suggestions?: {
    placePrediction?: GooglePlacePrediction;
  }[];
}

function assertMapsConfigured(): void {
  if (!env.GOOGLE_MAPS_API_KEY) {
    throw ApiError.serviceUnavailable("Google Maps is not configured on the server (GOOGLE_MAPS_API_KEY is unset).");
  }
}

async function callGoogleMaps<T extends { status: string; error_message?: string }>(
  path: string,
  query: Record<string, string | undefined>,
): Promise<T> {
  assertMapsConfigured();

  const url = new URL(`${GOOGLE_MAPS_BASE_URL}${path}`);

  for (const [key, value] of Object.entries(query)) {
    if (value) {
      url.searchParams.set(key, value);
    }
  }

  url.searchParams.set("key", env.GOOGLE_MAPS_API_KEY as string);

  let response: Response;

  try {
    response = await fetch(url.toString());
  } catch {
    throw new ApiError(502, "Could not reach Google Maps right now.");
  }

  if (!response.ok) {
    throw new ApiError(502, `Google Maps request failed with ${response.status}.`);
  }

  const payload = (await response.json()) as T;

  if (payload.status !== "OK" && payload.status !== "ZERO_RESULTS") {
    throw new ApiError(502, payload.error_message || `Google Maps returned status ${payload.status}.`);
  }

  return payload;
}

async function callGooglePlaces<T>(path: string, body: Record<string, unknown>): Promise<T> {
  assertMapsConfigured();

  let response: Response;

  try {
    response = await fetch(`${GOOGLE_PLACES_BASE_URL}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": env.GOOGLE_MAPS_API_KEY as string,
      },
      body: JSON.stringify(body),
    });
  } catch {
    throw new ApiError(502, "Could not reach Google Places right now.");
  }

  const payload = (await response.json().catch(() => null)) as (T & { error?: { message?: string } }) | null;

  if (!response.ok) {
    throw new ApiError(502, payload?.error?.message || `Google Places request failed with ${response.status}.`);
  }

  return payload as T;
}

function findComponent(components: GoogleAddressComponent[], type: string): string | null {
  return components.find((component) => component.types.includes(type))?.long_name ?? null;
}

function findComponentShort(components: GoogleAddressComponent[], type: string): string | null {
  return components.find((component) => component.types.includes(type))?.short_name ?? null;
}

function extractComponents(components: GoogleAddressComponent[]) {
  const subpremise = findComponent(components, "subpremise");
  const premise = findComponent(components, "premise");
  const streetNumber = findComponent(components, "street_number");
  const route = findComponent(components, "route");
  const street = [streetNumber, route].filter(Boolean).join(" ") || null;

  return {
    city:
      findComponent(components, "locality") ??
      findComponent(components, "administrative_area_level_3") ??
      findComponent(components, "administrative_area_level_2"),
    area:
      findComponent(components, "sublocality_level_1") ??
      findComponent(components, "sublocality") ??
      findComponent(components, "neighborhood"),
    pincode: findComponent(components, "postal_code"),
    state: findComponent(components, "administrative_area_level_1"),
    country: findComponent(components, "country"),
    stateCode: findComponentShort(components, "administrative_area_level_1"),
    countryCode: findComponentShort(components, "country"),
    streetAddress: [subpremise, premise, street].filter(Boolean).join(", ") || null,
  };
}

function mapGeocodeResult(result: GoogleGeocodeResult) {
  return {
    formattedAddress: result.formatted_address,
    placeId: result.place_id,
    latitude: result.geometry.location.lat,
    longitude: result.geometry.location.lng,
    components: extractComponents(result.address_components),
  };
}

/**
 * Proxies Google Places Autocomplete — ported from NearCart/backend's maps.service.ts (same
 * key, same region-bias fix). This is what NearCart-Inventory/mobile's LocationPickerMapNative
 * should call instead of running `google.maps.places.AutocompleteSuggestion` directly inside its
 * WebView: that path is a client-exposed, HTTP-referrer-restricted key, which is fragile inside a
 * native WebView (see that file's "KNOWN UNRESOLVED ISSUE" doc comment) — going through this
 * server-side proxy with a server-only key avoids the referrer problem for search entirely.
 */
async function autocompletePlaces(input: {
  query: string;
  sessionToken?: string;
  language?: string;
  regionBias?: string;
  latitude?: number;
  longitude?: number;
  radiusMeters?: number;
}) {
  const hasOrigin = input.latitude !== undefined && input.longitude !== undefined;

  const payload = await callGooglePlaces<GooglePlacesAutocompleteResponse>("/places:autocomplete", {
    input: input.query,
    sessionToken: input.sessionToken,
    languageCode: input.language,
    includedRegionCodes: [input.regionBias ?? DEFAULT_REGION_CODE],
    locationBias: hasOrigin
      ? {
          circle: {
            center: { latitude: input.latitude, longitude: input.longitude },
            radius: input.radiusMeters ?? DEFAULT_BIAS_RADIUS_METERS,
          },
        }
      : undefined,
    origin: hasOrigin ? { latitude: input.latitude, longitude: input.longitude } : undefined,
  });

  return {
    predictions: (payload.suggestions ?? [])
      .map((suggestion) => suggestion.placePrediction)
      .filter((prediction): prediction is GooglePlacePrediction => Boolean(prediction?.placeId))
      .map((prediction) => {
        const description = prediction.text?.text ?? "";

        return {
          placeId: prediction.placeId as string,
          description,
          mainText: prediction.structuredFormat?.mainText?.text ?? description,
          secondaryText: prediction.structuredFormat?.secondaryText?.text ?? null,
        };
      }),
  };
}

/** Proxies Google Geocoding (forward: free-text address -> coordinates). */
async function geocodeAddress(address: string) {
  const payload = await callGoogleMaps<GoogleGeocodeResponse>("/geocode/json", { address });
  const [result] = payload.results;
  return { result: result ? mapGeocodeResult(result) : null };
}

/**
 * Resolves an autocomplete suggestion by its `place_id` rather than re-geocoding its display
 * text — forward-geocoding a label Google already resolved can land on a different place for a
 * short/repeated name (same "wrong location" bug class as the sibling app's fix).
 */
async function geocodePlaceId(placeId: string) {
  const payload = await callGoogleMaps<GoogleGeocodeResponse>("/geocode/json", { place_id: placeId });
  const [result] = payload.results;
  return { result: result ? mapGeocodeResult(result) : null };
}

/** Proxies Google Geocoding (reverse: coordinates -> formatted address + components). */
async function reverseGeocode(latitude: number, longitude: number) {
  const payload = await callGoogleMaps<GoogleGeocodeResponse>("/geocode/json", {
    latlng: `${latitude},${longitude}`,
  });
  const [result] = payload.results;
  return { result: result ? mapGeocodeResult(result) : null };
}

export { autocompletePlaces, geocodeAddress, geocodePlaceId, reverseGeocode };
