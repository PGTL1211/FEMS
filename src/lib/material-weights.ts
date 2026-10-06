// Centralized Material Weight Calculation & Smart Weight Formatter
import { DEMO_MATERIALS } from "@/lib/demo-data";

/**
 * Returns unit weight in kg for any material record or PO line item.
 * Evaluates explicit unit_weight_kg, embedded description tag, or matches against DEMO_MATERIALS catalog.
 */
export function getMaterialUnitWeight(m: any): number {
  if (!m) return 0.5;

  if (m.unit_weight_kg != null && !isNaN(Number(m.unit_weight_kg)) && Number(m.unit_weight_kg) > 0) {
    return Number(m.unit_weight_kg);
  }

  if (m.description) {
    const match = String(m.description).match(/weight[:\s=]+([0-9]+(?:\.[0-9]+)?)/i);
    if (match && match[1]) {
      const parsed = parseFloat(match[1]);
      if (!isNaN(parsed) && parsed > 0) return parsed;
    }
  }

  const mId = m.id || m.material_id;
  const mName = (m.name || m.material_name || "").trim().toLowerCase();
  const mCode = (m.code || "").trim().toLowerCase();

  const found = DEMO_MATERIALS.find(
    (dm) =>
      (mId && (dm.id === mId || dm.material_id === mId)) ||
      (mCode && dm.code?.toLowerCase() === mCode) ||
      (mName && dm.name?.toLowerCase() === mName)
  );

  if (found?.unit_weight_kg != null) {
    return Number(found.unit_weight_kg);
  }

  return 0.5;
}

/**
 * Dynamic Standard Weight Formatter (Strictly Whole Integer without decimals):
 * - Small entry (< 1,000 kg): Unit is 'kg' (e.g. 24 kg, 663 kg, -15 kg)
 * - Large entry (>= 1,000 kg): Unit is 'Ton' rounded to whole number with NO decimals (e.g. 26 Ton, -2 Ton)
 */
export function formatSmartWeight(weightKg: number): {
  value: string;
  unit: string;
  fullStr: string;
  exactKgStr: string;
} {
  const w = Number(weightKg) || 0;
  const absW = Math.abs(w);
  const roundedKg = Math.round(w);
  const exactKgStr = `${roundedKg.toLocaleString()} kg`;

  if (absW < 1000) {
    const valStr = roundedKg.toLocaleString();
    return {
      value: valStr,
      unit: "kg",
      fullStr: `${valStr} kg`,
      exactKgStr,
    };
  }

  const isNeg = w < 0;
  const roundedTon = Math.round(absW / 1000) * (isNeg ? -1 : 1);
  const tonStr = roundedTon.toLocaleString();
  return {
    value: tonStr,
    unit: "Ton",
    fullStr: `${tonStr} Ton`,
    exactKgStr,
  };
}
