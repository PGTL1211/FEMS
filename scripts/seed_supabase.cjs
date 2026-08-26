const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || "";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false }
});

const DEMO_PRODUCTS = [
  { id: "p-1", name: "Table", code: "PROD-TBL-01", description: "Standard Worktable / ESD Assembly Bench" },
  { id: "p-2", name: "Rack", code: "PROD-RCK-02", description: "Heavy Duty Pipe & Flow Rack" },
  { id: "p-3", name: "Trolley", code: "PROD-TRL-03", description: "Material Handling & Kitting Trolley" },
  { id: "p-4", name: "Stand", code: "PROD-STD-04", description: "Ergonomic Display & Inspection Stand" }
];

const DEMO_DEPARTMENTS = [
  { id: "dept-1", name: "Fabrication", description: "Sheet Metal Cutting, Bending, Welding & Structural Fabrication" },
  { id: "dept-2", name: "Assembly", description: "Line Assembly, Sub-assembly & Mechanical Fitting" },
  { id: "dept-3", name: "Quality Assurance & Control (QA/QC)", description: "Raw Material Inspection, In-Process QC & Final PDI Inspection" },
  { id: "dept-4", name: "Innovation & R&D", description: "Product Design, CAD/CAM Prototyping & Process Engineering" },
  { id: "dept-5", name: "Production Planning & Control (PPC)", description: "Scheduling, Work Order Dispatch & Capacity Planning" }
];

const DEMO_MATERIALS = [
  { material_id: "m-1", id: "m-1", name: "40 TYPE PLACON ROLLER", code: "PLACON-40", uom: "MTR" },
  { material_id: "m-2", id: "m-2", name: "80 TYPE PLACON ROLLER", code: "PLACON-80", uom: "MTR" },
  { material_id: "m-3", id: "m-3", name: "40 TYPE A1 JOINT", code: "GPA40", uom: "PCS" },
  { material_id: "m-4", id: "m-4", name: "80 TYPE A1 JOINT", code: "GPA80", uom: "PCS" },
  { material_id: "m-5", id: "m-5", name: "40 TYPE B2 JOINT", code: "GPB40", uom: "PCS" },
  { material_id: "m-7", id: "m-7", name: "PJ1", code: "PJ1", uom: "SET" },
  { material_id: "m-12", id: "m-12", name: "PJ2 JOINT", code: "PJ2", uom: "SET" },
  { material_id: "m-18", id: "m-18", name: "SS PIPE", code: "SS-PIPE-28", uom: "MTR" },
  { material_id: "m-23", id: "m-23", name: "END CAP", code: "END-CAP-28", uom: "PCS" }
];

const supervisors = ["Ramesh Sharma", "Amit Kumar", "Suresh Singh", "Vikas Verma", "Rajesh Patel", "Pankaj Sharma", "Deepak Joshi", "Manoj Verma"];

function generateFabRows() {
  const rows = [];
  const dates = [];

  // Jul 2026 (10)
  for (let d = 1; d <= 28; d += 3) dates.push(`2026-07-${String(d).padStart(2, '0')}`);
  // Jun 2026 (10)
  for (let d = 1; d <= 28; d += 3) dates.push(`2026-06-${String(d).padStart(2, '0')}`);
  // May 2026 (10)
  for (let d = 1; d <= 28; d += 3) dates.push(`2026-05-${String(d).padStart(2, '0')}`);
  // Apr 2026 (10)
  for (let d = 1; d <= 28; d += 3) dates.push(`2026-04-${String(d).padStart(2, '0')}`);
  // Mar 2026 (10)
  for (let d = 1; d <= 28; d += 3) dates.push(`2026-03-${String(d).padStart(2, '0')}`);
  // Feb 2026 (10)
  for (let d = 1; d <= 28; d += 3) dates.push(`2026-02-${String(d).padStart(2, '0')}`);

  dates.forEach((dt, idx) => {
    const prod = DEMO_PRODUCTS[idx % DEMO_PRODUCTS.length];
    const dept = DEMO_DEPARTMENTS[idx % DEMO_DEPARTMENTS.length];
    const sup = supervisors[idx % supervisors.length];
    const qty = 10 + ((idx * 7) % 30);
    rows.push({
      fab_date: dt,
      product_id: prod.id,
      department_id: dept.id,
      product_quantity: qty,
      supervisor_name: sup,
      remarks: `Batch #${100 + idx} ${prod.name} production`
    });
  });
  return rows;
}

function generatePORows() {
  const suppliers = ["PRIME LOGITECH INDUSTRY", "Vikas Industrial Supplies", "Apex Hardware Corp", "Precision Tools Co", "Star Fasteners Ltd"];
  const rows = [];
  const dates = [];

  // Jul 2026 (10)
  for (let d = 1; d <= 28; d += 3) dates.push(`2026-07-${String(d).padStart(2, '0')}`);
  // Jun 2026 (10)
  for (let d = 1; d <= 28; d += 3) dates.push(`2026-06-${String(d).padStart(2, '0')}`);
  // May 2026 (10)
  for (let d = 1; d <= 28; d += 3) dates.push(`2026-05-${String(d).padStart(2, '0')}`);
  // Apr 2026 (10)
  for (let d = 1; d <= 28; d += 3) dates.push(`2026-04-${String(d).padStart(2, '0')}`);
  // Mar 2026 (10)
  for (let d = 1; d <= 28; d += 3) dates.push(`2026-03-${String(d).padStart(2, '0')}`);
  // Feb 2026 (10)
  for (let d = 1; d <= 28; d += 3) dates.push(`2026-02-${String(d).padStart(2, '0')}`);

  dates.forEach((dt, idx) => {
    const mat = DEMO_MATERIALS[idx % DEMO_MATERIALS.length];
    const sup = suppliers[idx % suppliers.length];
    const poNum = `PO-2026-${String(150 + idx).padStart(3, '0')}`;
    const qty = 500 + ((idx * 150) % 2500);
    rows.push({
      po_date: dt,
      po_number: poNum,
      supplier_name: sup,
      material_id: mat.id,
      po_quantity: qty,
      remarks: `Purchase order for ${mat.name}`
    });
  });
  return rows;
}

async function runSeed() {
  console.log("Seeding Supabase Database...");

  // 1. Ensure Products
  const { data: existingProds, error: prodErr } = await supabase.from("products").select("id, name");
  console.log("Existing products count:", existingProds ? existingProds.length : 0, prodErr || "");
  if (!existingProds || existingProds.length < 4) {
    const { error } = await supabase.from("products").upsert(DEMO_PRODUCTS);
    console.log("Products upsert result error:", error);
  }

  // 2. Ensure Departments
  const { data: existingDepts, error: deptErr } = await supabase.from("departments").select("id, name");
  console.log("Existing depts count:", existingDepts ? existingDepts.length : 0, deptErr || "");
  if (!existingDepts || existingDepts.length < 5) {
    const { error } = await supabase.from("departments").upsert(DEMO_DEPARTMENTS);
    console.log("Departments upsert result error:", error);
  }

  // 3. Ensure Materials
  const { data: existingMats, error: matErr } = await supabase.from("materials").select("id, name");
  console.log("Existing materials count:", existingMats ? existingMats.length : 0, matErr || "");
  if (!existingMats || existingMats.length < 8) {
    const { error } = await supabase.from("materials").upsert(DEMO_MATERIALS);
    console.log("Materials upsert result error:", error);
  }

  // Fetch created DB IDs
  const { data: dbProds } = await supabase.from("products").select("id, name");
  const { data: dbDepts } = await supabase.from("departments").select("id, name");
  const { data: dbMats } = await supabase.from("materials").select("id, name");

  const prodList = (dbProds && dbProds.length > 0) ? dbProds : DEMO_PRODUCTS;
  const deptList = (dbDepts && dbDepts.length > 0) ? dbDepts : DEMO_DEPARTMENTS;
  const matList = (dbMats && dbMats.length > 0) ? dbMats : DEMO_MATERIALS;

  // 4. Insert Fabrications
  const fabRows = generateFabRows().map((r, idx) => ({
    ...r,
    product_id: prodList[idx % prodList.length].id,
    department_id: deptList[idx % deptList.length].id
  }));

  console.log(`Inserting ${fabRows.length} fabrication rows into Supabase...`);
  const { error: fabErr, data: fabRes } = await supabase.from("fabrications").insert(fabRows).select();
  if (fabErr) console.error("Fabrication insert error:", fabErr);
  else console.log("Fabrication insert SUCCESS! Rows inserted:", fabRes ? fabRes.length : 0);

  // 5. Insert Purchase Orders
  const poRows = generatePORows().map((r, idx) => ({
    ...r,
    material_id: matList[idx % matList.length].id
  }));

  console.log(`Inserting ${poRows.length} purchase order rows into Supabase...`);
  const { error: poErr, data: poRes } = await supabase.from("purchase_orders").insert(poRows).select();
  if (poErr) console.error("Purchase order insert error:", poErr);
  else console.log("Purchase order insert SUCCESS! Rows inserted:", poRes ? poRes.length : 0);

  console.log("Seeding finished!");
}

runSeed().catch(console.error);
