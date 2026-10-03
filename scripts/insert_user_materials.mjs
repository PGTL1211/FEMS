import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const envText = fs.readFileSync('.env', 'utf-8');
const env = {};
envText.split('\n').forEach(line => {
  const parts = line.split('=');
  if (parts.length >= 2) {
    const key = parts[0].trim();
    let val = parts.slice(1).join('=').trim();
    if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
    env[key] = val;
  }
});

const url = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY || env.VITE_SUPABASE_SERVICE_ROLE_KEY;
const sb = createClient(url, key);

// The materials from the user's table:
const newMaterials = [
  {
    name: "MS Pipe 25mm",
    code: "MS-PIPE-25",
    uom: "MTR",
    weight: 1.75,
    minimum_stock: 200,
    description: "Weight: 1.75 kg"
  },
  {
    name: "SS Pipe Round 25mm",
    code: "SS-PIPE-RD-25",
    uom: "MTR",
    weight: 0.6,
    minimum_stock: 200,
    description: "Weight: 0.60 kg"
  },
  {
    name: "SS Sheet 1.5 mm",
    code: "SS-SHT-1.5",
    uom: "SQMTR",
    weight: 11.75,
    minimum_stock: 50,
    description: "Weight: 11.75 kg"
  },
  {
    name: "Slider rail 2.5 inch",
    code: "SLD-RL-2.5",
    uom: "MTR",
    weight: 1.1,
    minimum_stock: 100,
    description: "Weight: 1.10 kg"
  },
  {
    name: "Slider rail 3.5 inch",
    code: "SLD-RL-3.5",
    uom: "MTR",
    weight: 1.9,
    minimum_stock: 100,
    description: "Weight: 1.90 kg"
  },
  {
    name: "6X2 PU WHEEL FIXED",
    code: "PU-6X2-F", // already in DB
    uom: "PCS",
    weight: 2,
    minimum_stock: 100,
    description: "Weight: 2.00 kg"
  },
  {
    name: "6X2 PU WHEEL brake",
    code: "PU-6X2-BRK",
    uom: "PCS",
    weight: 2.22,
    minimum_stock: 100,
    description: "Weight: 2.22 kg"
  },
  {
    name: "6X2 White WHEEL FIXED",
    code: "WHL-6X2-WHT-FX",
    uom: "PCS",
    weight: 1.9,
    minimum_stock: 100,
    description: "Weight: 1.90 kg"
  },
  {
    name: "6X2 White WHEEL FIXED (2.3kg)",
    code: "WHL-6X2-WHT-FX-23",
    uom: "PCS",
    weight: 2.3,
    minimum_stock: 100,
    description: "Weight: 2.30 kg"
  },
  {
    name: "Wheel fixing clamp",
    code: "WHL-CLMP",
    uom: "SET",
    weight: 0.46,
    minimum_stock: 150,
    description: "Weight: 0.46 kg"
  },
  {
    name: "Bend 45 degree",
    code: "BND-45-DEG",
    uom: "SET",
    weight: 0.16,
    minimum_stock: 150,
    description: "Weight: 0.16 kg"
  },
  {
    name: "Bend 90 degree",
    code: "BND-90-DEG",
    uom: "SET",
    weight: 0.09,
    minimum_stock: 150,
    description: "Weight: 0.09 kg"
  },
  {
    name: "parllel clamp",
    code: "PRL-CLMP",
    uom: "SET",
    weight: 0.11,
    minimum_stock: 150,
    description: "Weight: 0.11 kg"
  },
  {
    name: "End cap",
    code: "END-CAP-SET",
    uom: "SET",
    weight: 0.14,
    minimum_stock: 200,
    description: "Weight: 0.14 kg"
  },
  {
    name: "U band 25mm",
    code: "U-BND-25",
    uom: "SET",
    weight: 0.21,
    minimum_stock: 150,
    description: "Weight: 0.21 kg"
  },
  {
    name: "L band 25 mm",
    code: "L-BND-25",
    uom: "SET",
    weight: 0.22,
    minimum_stock: 150,
    description: "Weight: 0.22 kg"
  },
  {
    name: "Straight Joint",
    code: "STR-JNT",
    uom: "SET",
    weight: 0.21,
    minimum_stock: 150,
    description: "Weight: 0.21 kg"
  }
];

async function insertMaterials() {
  console.log("Checking existing materials...");
  const { data: existing, error: fetchErr } = await sb.from('materials').select('*');
  if (fetchErr) {
    console.error("Fetch error:", fetchErr);
    return;
  }
  const existingByCode = new Map(existing.map(m => [m.code.toLowerCase(), m]));
  const existingByName = new Map(existing.map(m => [m.name.toLowerCase(), m]));

  for (const item of newMaterials) {
    const byCode = existingByCode.get(item.code.toLowerCase());
    const byName = existingByName.get(item.name.toLowerCase());
    const match = byCode || byName;

    if (match) {
      console.log(`Updating existing: ${match.name} (${match.code}) with description: ${item.description}`);
      const { error } = await sb.from('materials').update({
        description: item.description,
        uom: item.uom,
      }).eq('id', match.id);
      if (error) console.error("Update error for", item.name, error);
    } else {
      console.log(`Inserting new: ${item.name} (${item.code})`);
      const { error } = await sb.from('materials').insert({
        name: item.name,
        code: item.code,
        uom: item.uom,
        minimum_stock: item.minimum_stock,
        description: item.description,
        active: true
      });
      if (error) console.error("Insert error for", item.name, error);
    }
  }

  const { data: updated } = await sb.from('materials').select('*').order('name');
  console.log(`Total materials in Supabase now: ${updated?.length}`);
}

insertMaterials();
