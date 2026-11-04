import { normalizePlate, validPlate } from "./calendarization-model";
export function inspectSchedulingPlates(plates: readonly string[]) {
  const normalized = plates.map(normalizePlate); const counts = new Map<string, number>();
  for (const plate of normalized) if (plate) counts.set(plate, (counts.get(plate) ?? 0) + 1);
  const duplicates = new Set([...counts].filter(([, count]) => count > 1).map(([plate]) => plate));
  const valid = normalized.filter(plate => validPlate(plate) && !duplicates.has(plate)).length;
  return { normalized, duplicates, valid, filled: normalized.filter(Boolean).length };
}
export function parseSchedulingPlateList(text: string) { return text.trim().split(/[\s,;]+/).filter(Boolean).map(normalizePlate); }
