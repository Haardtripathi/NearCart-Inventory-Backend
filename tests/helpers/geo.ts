// Deliberately independent of src/modules/sales-orders/sales-orders.service.ts's own
// haversineDistanceKm/computeDriverFare — importing those into the test would make the
// distance-based-fare assertions tautological (the test would just be re-checking the app's math
// against itself). This is a from-scratch reimplementation used only to compute expected values.

export interface LatLng {
  lat: number;
  lng: number;
}

const EARTH_RADIUS_KM = 6371;

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/** Standard haversine great-circle distance between two lat/lng points, in kilometers. */
export function haversineKm(a: LatLng, b: LatLng): number {
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);

  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);

  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/**
 * Offsets a coordinate by an approximate number of kilometers north/east. Approximate (uses a
 * flat-earth degrees-per-km conversion, not a geodesic), which is fine here — it's only used to
 * PLACE test fixtures at roughly-controlled distances from a origin; every assertion about the
 * actual resulting distance re-derives it from the real coordinates via haversineKm above, never
 * from the intended offset.
 */
export function offsetCoords(origin: LatLng, offsetKm: { north: number; east: number }): LatLng {
  const latDegreesPerKm = 1 / 110.574;
  const lngDegreesPerKm = 1 / (111.320 * Math.cos(toRadians(origin.lat)));

  return {
    lat: origin.lat + offsetKm.north * latDegreesPerKm,
    lng: origin.lng + offsetKm.east * lngDegreesPerKm,
  };
}

/** Mirrors computeDriverFare's clamp(base + perKm*distance, min, max) formula, independently. */
export function expectedDriverFare(
  distanceKm: number,
  rates: { base: number; perKm: number; min: number; max: number },
): number {
  const raw = rates.base + rates.perKm * distanceKm;
  const clamped = Math.min(Math.max(raw, rates.min), rates.max);
  return Math.round(clamped * 100) / 100;
}
