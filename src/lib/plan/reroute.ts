import { distanceMeters, roomLocation, walkMinutes } from "../geo";
import { formatTimeInZone } from "../time";
import type { PlanChoice, RerouteCandidate, RerouteResult, SessionDoc } from "../types";
import { rankLabel } from "./slots";

/** A similar talk must score at least this fraction of the best match to be preferred for being in the same building. */
export const SAME_BUILDING_SCORE_FLOOR = 0.75;

export function sessionDistance(from: SessionDoc, to: SessionDoc): number {
  return distanceMeters(roomLocation(from.room, from.building), roomLocation(to.room, to.building));
}

function where(s: SessionDoc): string {
  return [s.room, s.building].filter(Boolean).join(", ");
}

/** Distance in plain words, tagged with the Elastic feature that produced it. */
function away(meters: number | null): string {
  if (meters === null) return "distance unknown";
  if (meters < 40) return "right next door (geo)";
  return `${meters} m away, about a ${walkMinutes(meters)} min walk (geo)`;
}

export function fullPhrase(choice: PlanChoice): string {
  if (choice.fullReason === "sold_out") return "is sold out (schedule feed)";
  if (choice.fullReason === "signal" && choice.fullSince)
    return `was reported full at ${formatTimeInZone(choice.fullSince)} (room-signals, last hour)`;
  return "is full";
}

/** How a candidate's start relates to the slot, for the "time range" part of the reason. */
export function timing(candidate: SessionDoc, planA: SessionDoc): string {
  const diff = Math.round((new Date(candidate.starts_at).getTime() - new Date(planA.starts_at).getTime()) / 60_000);
  if (diff === 0) return "starts with your slot";
  if (diff > 0) return `starts ${diff} min into your slot`;
  const left = Math.round((new Date(candidate.ends_at).getTime() - new Date(planA.starts_at).getTime()) / 60_000);
  return `already running, ${left} min left at your slot start`;
}

/** Orders similar talks: drop weak matches, then same building first, then meaning, then distance. */
export function rankSimilar(candidates: RerouteCandidate[]): RerouteCandidate[] {
  const open = candidates.filter((c) => !c.session.full);
  if (open.length === 0) return [];
  const best = Math.max(...open.map((c) => c.score));
  const strong = open.filter((c) => c.score >= best * SAME_BUILDING_SCORE_FLOOR);
  return strong.sort(
    (a, b) =>
      Number(b.sameBuilding) - Number(a.sameBuilding) ||
      b.score - a.score ||
      (a.distanceM ?? Infinity) - (b.distanceM ?? Infinity),
  );
}

/**
 * Decides where to go when Plan A is full. Returns null when Plan A isn't full.
 * 1. The next ranked backup that isn't full.
 * 2. Otherwise the best similar open talk in the same slot (semantic match, nearby, same building preferred).
 * Reasons name the Elastic feature behind each fact: semantic, time range, geo, room-signals.
 */
export function pickReroute(choices: PlanChoice[], similar: RerouteCandidate[]): RerouteResult | null {
  const planA = choices[0];
  if (!planA || !planA.full) return null;
  const head = `${rankLabel(0)} “${planA.session.title}” ${fullPhrase(planA)}`;

  const backup = choices.slice(1).find((c) => !c.full);
  if (backup) {
    const skipped = choices.slice(1, choices.indexOf(backup)).map((c) => rankLabel(c.rank));
    const d = sessionDistance(planA.session, backup.session);
    const skippedNote = skipped.length ? ` (${skipped.join(" and ")} ${skipped.length > 1 ? "are" : "is"} full too)` : "";
    return {
      kind: "backup",
      session: backup.session,
      rank: backup.rank,
      distanceM: d,
      reason: `${head}. Go to ${rankLabel(backup.rank)}: “${backup.session.title}” in ${where(backup.session)}, ${away(d)}. Picked because it's your next ranked backup that isn't full${skippedNote}.`,
    };
  }

  const planIds = new Set(choices.map((c) => c.session.id));
  const pick = rankSimilar(similar.filter((c) => !planIds.has(c.session.id)))[0];
  if (pick) {
    const building = pick.sameBuilding ? `same building (${pick.session.building ?? "nearby"}), ` : "";
    const noBackups = choices.length > 1 ? "every backup is full" : "you have no backup";
    return {
      kind: "similar",
      session: pick.session,
      rank: null,
      distanceM: pick.distanceM,
      reason: `${head}, and ${noBackups}. Go to “${pick.session.title}” in ${where(pick.session)}: closest in meaning to your Plan A (semantic), ${timing(pick.session, planA.session)} (time range), ${building}${away(pick.distanceM)}.`,
    };
  }

  return {
    kind: "none",
    session: null,
    rank: null,
    distanceM: null,
    reason: `${head}. Every backup is full and nothing similar (semantic) is open in this slot (time range) within walking distance (geo).`,
  };
}
