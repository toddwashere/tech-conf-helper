import type { GeoPoint } from "./types";

/**
 * Approximate coordinates for the KubeCon NA 2026 venues in downtown Salt Lake City.
 * Hand-placed from public maps: good enough to tell "same wing" from "across the street",
 * not survey-grade. Rooms inside a building get a point near the wing they sit in.
 */
export const BUILDINGS: Record<string, GeoPoint> = {
  "Salt Palace": { lat: 40.7665, lon: -111.8967 },
  "Hyatt Regency": { lat: 40.7638, lon: -111.8946 },
  "Off-Site": { lat: 40.7608, lon: -111.891 },
};

/** Wing-level points, matched by room-name prefix (first match wins). */
const ROOM_AREAS: { building: string; match: RegExp; point: GeoPoint }[] = [
  { building: "Salt Palace", match: /^Grand Ballroom|Grand Ballroom Foyer/i, point: { lat: 40.7651, lon: -111.8969 } },
  { building: "Salt Palace", match: /^15\d/, point: { lat: 40.766, lon: -111.8978 } },
  { building: "Salt Palace", match: /^25[0-1]/, point: { lat: 40.7663, lon: -111.8976 } },
  { building: "Salt Palace", match: /^25[4-5]/, point: { lat: 40.7669, lon: -111.8971 } },
  { building: "Salt Palace", match: /^Hall DE/i, point: { lat: 40.7676, lon: -111.8953 } },
  { building: "Salt Palace", match: /Solutions Showcase|^Halls/i, point: { lat: 40.7682, lon: -111.8962 } },
  { building: "Salt Palace", match: /Registration|Entrance/i, point: { lat: 40.7657, lon: -111.8951 } },
  { building: "Salt Palace", match: /Mezzanine|Concourse/i, point: { lat: 40.7667, lon: -111.8958 } },
  { building: "Hyatt Regency", match: /^Regency Ballroom/i, point: { lat: 40.7636, lon: -111.8944 } },
  { building: "Hyatt Regency", match: /^Salt Lake Ballroom/i, point: { lat: 40.764, lon: -111.8948 } },
];

/** Normalizes a session's building field, sending unknown venues to "Off-Site". */
export function buildingFor(room: string, building: string | null): string {
  if (building && BUILDINGS[building]) return building;
  if (/Hyatt/i.test(room)) return "Hyatt Regency";
  if (/Foyer/i.test(room)) return "Salt Palace";
  return "Off-Site";
}

/** Small deterministic jitter (up to ~15 m) so rooms in the same wing don't share one point. */
function jitter(name: string): GeoPoint {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) | 0;
  const dLat = (((h & 0xff) / 255) - 0.5) * 0.00025;
  const dLon = ((((h >> 8) & 0xff) / 255) - 0.5) * 0.00025;
  return { lat: dLat, lon: dLon };
}

export function roomLocation(room: string, building: string | null): GeoPoint {
  const b = buildingFor(room, building);
  const area = ROOM_AREAS.find((a) => a.building === b && a.match.test(room));
  const base = area?.point ?? BUILDINGS[b];
  const j = jitter(room);
  return { lat: +(base.lat + j.lat).toFixed(6), lon: +(base.lon + j.lon).toFixed(6) };
}

export function distanceMeters(a: GeoPoint, b: GeoPoint): number {
  const R = 6_371_000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}

/** "about a 3 minute walk" at ~80 m/min, with a floor of one minute. */
export function walkMinutes(meters: number): number {
  return Math.max(1, Math.round(meters / 80));
}

export function roomId(conference: string, room: string): string {
  return `${conference}:${room.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
}
