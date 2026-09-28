// FABRICATION WEIGHTS, BOM TEMPLATES & TOLERANCE VERIFICATION ENGINE

export interface BomMaterialItem {
  material_id: string;
  material_name?: string;
  uom?: string;
  unit_weight_kg: number;
  required_qty_per_product: number;
  total_quantity?: number;
  total_weight_kg?: number;
}

export interface WeightAuditResult {
  expectedBomWeightKg: number;
  actualWeightKg: number;
  varianceKg: number;
  variancePct: number;
  tolerancePct: number;
  minAllowedKg: number;
  maxAllowedKg: number;
  isAlert: boolean;
  status: "pass" | "overweight" | "underweight";
  statusText: string;
}

// Pre-defined standard industry BOM recipes for factory products
export const STANDARD_PRODUCT_BOM_TEMPLATES: Record<string, { desc: string; approxUnitWeightKg: number; materials: { material_id: string; required: number }[] }> = {
  "Trolley": {
    desc: "Heavy Duty Material Handling & Kitting Trolley with 6x2 Castors",
    approxUnitWeightKg: 25.54,
    materials: [
      { material_id: "m-18", required: 12 },   // SS PIPE: 12m * 1.25 = 15.00 kg
      { material_id: "m-19", required: 2 },    // 6X2 PU WHEEL SWIVEL LOCK: 2 * 2.10 = 4.20 kg
      { material_id: "m-20", required: 2 },    // 6X2 PU WHEEL FIXED: 2 * 1.85 = 3.70 kg
      { material_id: "m-7", required: 4 },     // PJ1: 4 * 0.28 = 1.12 kg
      { material_id: "m-12", required: 4 },    // PJ2 JOINT: 4 * 0.30 = 1.20 kg
      { material_id: "m-23", required: 8 },    // END CAP: 8 * 0.04 = 0.32 kg
    ]
  },
  "Table": {
    desc: "Standard Worktable / ESD Assembly Bench with Leveling Base",
    approxUnitWeightKg: 25.08,
    materials: [
      { material_id: "m-18", required: 16 },   // SS PIPE: 16m * 1.25 = 20.00 kg
      { material_id: "m-7", required: 8 },     // PJ1: 8 * 0.28 = 2.24 kg
      { material_id: "m-12", required: 6 },    // PJ2 JOINT: 6 * 0.30 = 1.80 kg
      { material_id: "m-3", required: 4 },     // 40 TYPE A1 JOINT: 4 * 0.18 = 0.72 kg
      { material_id: "m-23", required: 8 },    // END CAP: 8 * 0.04 = 0.32 kg
    ]
  },
  "Rack": {
    desc: "FIFO Gravity Flow Rack with 40 Type Placon Rollers",
    approxUnitWeightKg: 42.68,
    materials: [
      { material_id: "m-18", required: 24 },   // SS PIPE: 24m * 1.25 = 30.00 kg
      { material_id: "m-1", required: 8 },     // 40 TYPE PLACON ROLLER: 8m * 0.85 = 6.80 kg
      { material_id: "m-7", required: 12 },    // PJ1: 12 * 0.28 = 3.36 kg
      { material_id: "m-13", required: 6 },    // PJ3 JOINT: 6 * 0.34 = 2.04 kg
      { material_id: "m-23", required: 12 },   // END CAP: 12 * 0.04 = 0.48 kg
    ]
  },
  "Stand": {
    desc: "Ergonomic Display & Mobile Inspection Stand",
    approxUnitWeightKg: 15.84,
    materials: [
      { material_id: "m-18", required: 8 },    // SS PIPE: 8m * 1.25 = 10.00 kg
      { material_id: "m-7", required: 4 },     // PJ1: 4 * 0.28 = 1.12 kg
      { material_id: "m-14", required: 4 },    // PJ4 JOINT: 4 * 0.32 = 1.28 kg
      { material_id: "m-22", required: 4 },    // 3x1.25 PU WHEEL SWIVEL LOCK: 4 * 0.82 = 3.28 kg
      { material_id: "m-23", required: 4 },    // END CAP: 4 * 0.04 = 0.16 kg
    ]
  }
};

export const STORAGE_KEY_TOLERANCE_PCT = "fems_fabrication_weight_tolerance_pct_v1";
export const DEFAULT_TOLERANCE_PCT = 10; // Default +/- 10%

export function getSavedTolerancePct(): number {
  if (typeof window === "undefined") return DEFAULT_TOLERANCE_PCT;
  try {
    const saved = localStorage.getItem(STORAGE_KEY_TOLERANCE_PCT);
    if (saved) {
      const val = Number(saved);
      if (!isNaN(val) && val > 0 && val <= 50) return val;
    }
  } catch (e) {
    console.warn("Could not read tolerance pct", e);
  }
  return DEFAULT_TOLERANCE_PCT;
}

export function saveTolerancePct(pct: number): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY_TOLERANCE_PCT, String(pct));
  } catch (e) {
    console.warn("Could not save tolerance pct", e);
  }
}

// Evaluate BOM expected weight vs actual physical scale weight
export function evaluateWeightTolerance(
  expectedBomWeightKg: number,
  actualWeightKg: number,
  tolerancePct: number = DEFAULT_TOLERANCE_PCT
): WeightAuditResult {
  const exp = Math.max(0, Number(expectedBomWeightKg || 0));
  const act = Math.max(0, Number(actualWeightKg || 0));
  const tol = Math.max(1, Number(tolerancePct || DEFAULT_TOLERANCE_PCT));

  const minAllowed = Number((exp * (1 - tol / 100)).toFixed(2));
  const maxAllowed = Number((exp * (1 + tol / 100)).toFixed(2));
  const varianceKg = Number((act - exp).toFixed(2));
  const variancePct = exp > 0 ? Number(((varianceKg / exp) * 100).toFixed(2)) : 0;

  let isAlert = false;
  let status: "pass" | "overweight" | "underweight" = "pass";
  let statusText = "Within Allowed Tolerance";

  if (exp > 0 && act > 0) {
    if (act > maxAllowed) {
      isAlert = true;
      status = "overweight";
      statusText = `Overweight Alert (+${variancePct}%)`;
    } else if (act < minAllowed) {
      isAlert = true;
      status = "underweight";
      statusText = `Underweight Alert (${variancePct}%)`;
    } else {
      status = "pass";
      statusText = `Verified (±${tol}%)`;
    }
  }

  return {
    expectedBomWeightKg: exp,
    actualWeightKg: act,
    varianceKg,
    variancePct,
    tolerancePct: tol,
    minAllowedKg: minAllowed,
    maxAllowedKg: maxAllowed,
    isAlert,
    status,
    statusText,
  };
}

// High-quality SVG Digital Weighing Scale Mock Data URL for rapid demo & testing
export const DEMO_WEIGHING_SCALE_IMAGE = "data:image/svg+xml;utf8," + encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 450" width="600" height="450">
  <defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#1e293b"/>
      <stop offset="100%" stop-color="#0f172a"/>
    </linearGradient>
    <linearGradient id="metalPlate" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#cbd5e1"/>
      <stop offset="50%" stop-color="#94a3b8"/>
      <stop offset="100%" stop-color="#64748b"/>
    </linearGradient>
    <linearGradient id="trolleyMetal" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#38bdf8"/>
      <stop offset="100%" stop-color="#0284c7"/>
    </linearGradient>
  </defs>

  <!-- Industrial Workshop Background -->
  <rect width="600" height="450" fill="url(#bgGrad)"/>
  
  <!-- Workshop floor grid lines -->
  <path d="M0 340 L600 340 M0 380 L600 380 M0 420 L600 420" stroke="#334155" stroke-width="1.5" stroke-dasharray="6,6"/>
  <path d="M100 340 L60 450 M250 340 L230 450 M400 340 L410 450 M520 340 L560 450" stroke="#334155" stroke-width="1.5" stroke-dasharray="6,6"/>

  <!-- Industrial Platform Scale Base -->
  <rect x="120" y="320" width="360" height="35" rx="4" fill="url(#metalPlate)" stroke="#475569" stroke-width="2"/>
  <rect x="140" y="355" width="25" height="15" fill="#334155" rx="2"/>
  <rect x="435" y="355" width="25" height="15" fill="#334155" rx="2"/>
  
  <!-- Yellow Safety Edge Stripes on Scale -->
  <path d="M120 345 L135 320 M145 345 L160 320 M170 345 L185 320 M435 345 L450 320 M460 345 L475 320" stroke="#eab308" stroke-width="3"/>

  <!-- Fabricated Trolley on the Scale -->
  <!-- Wheels -->
  <circle cx="190" cy="312" r="14" fill="#0f172a" stroke="#cbd5e1" stroke-width="3"/>
  <circle cx="190" cy="312" r="5" fill="#ef4444"/>
  <circle cx="410" cy="312" r="14" fill="#0f172a" stroke="#cbd5e1" stroke-width="3"/>
  <circle cx="410" cy="312" r="5" fill="#ef4444"/>

  <!-- Trolley Base Frame & Uprights -->
  <rect x="170" y="290" width="260" height="12" rx="3" fill="url(#trolleyMetal)"/>
  <rect x="180" y="160" width="10" height="130" fill="url(#trolleyMetal)"/>
  <rect x="410" y="160" width="10" height="130" fill="url(#trolleyMetal)"/>
  <rect x="180" y="160" width="240" height="10" rx="2" fill="url(#trolleyMetal)"/>
  <rect x="180" y="225" width="240" height="8" rx="2" fill="url(#trolleyMetal)"/>
  
  <!-- Handle -->
  <path d="M180 160 L145 160 L145 220" fill="none" stroke="#0284c7" stroke-width="8" stroke-linecap="round"/>
  
  <!-- Placon Roller Guides on Trolley Shelf -->
  <rect x="200" y="217" width="200" height="6" fill="#f59e0b" rx="2"/>
  <circle cx="215" cy="220" r="3" fill="#ffffff"/>
  <circle cx="235" cy="220" r="3" fill="#ffffff"/>
  <circle cx="255" cy="220" r="3" fill="#ffffff"/>
  <circle cx="275" cy="220" r="3" fill="#ffffff"/>
  <circle cx="295" cy="220" r="3" fill="#ffffff"/>
  <circle cx="315" cy="220" r="3" fill="#ffffff"/>
  <circle cx="335" cy="220" r="3" fill="#ffffff"/>
  <circle cx="355" cy="220" r="3" fill="#ffffff"/>
  <circle cx="375" cy="220" r="3" fill="#ffffff"/>

  <!-- Digital Scale Indicator Pillar & Head -->
  <rect x="495" y="140" width="10" height="185" fill="#64748b"/>
  <rect x="460" y="80" width="115" height="75" rx="6" fill="#1e293b" stroke="#0ea5e9" stroke-width="2.5"/>
  <rect x="470" y="90" width="95" height="40" rx="3" fill="#020617" stroke="#334155"/>
  
  <!-- Digital Display LED Numbers -->
  <text x="555" y="118" font-family="Courier New, monospace" font-size="20" font-weight="900" fill="#22c55e" text-anchor="end" letter-spacing="1">25.50</text>
  <text x="560" y="112" font-family="Arial, sans-serif" font-size="9" font-weight="bold" fill="#22c55e">KG</text>

  <!-- Indicator Status LED -->
  <circle cx="480" cy="142" r="3" fill="#22c55e"/>
  <text x="488" y="145" font-family="Arial, sans-serif" font-size="7" font-weight="bold" fill="#94a3b8">STABLE</text>
  <circle cx="535" cy="142" r="3" fill="#3b82f6"/>
  <text x="543" y="145" font-family="Arial, sans-serif" font-size="7" font-weight="bold" fill="#94a3b8">ZERO</text>

  <!-- Timestamp & Inspection Badge -->
  <g transform="translate(20, 20)">
    <rect width="210" height="52" rx="6" fill="#0f172a" fill-opacity="0.85" stroke="#334155"/>
    <text x="12" y="20" font-family="Arial, sans-serif" font-size="11" font-weight="bold" fill="#38bdf8">SCALE WEIGHING VERIFICATION</text>
    <text x="12" y="34" font-family="Arial, sans-serif" font-size="9" fill="#94a3b8">DIGITAL PLATFORM SCALE #02</text>
    <text x="12" y="45" font-family="Arial, sans-serif" font-size="8" font-weight="bold" fill="#4ade80">● CALIBRATED &amp; VERIFIED</text>
  </g>
</svg>
`);
