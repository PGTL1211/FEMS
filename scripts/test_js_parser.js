
const testText = `Tax Invoice
PRIME LOGITECH INDUSTRY
KHASRA NO. 297, VILL. - PARSON
HAPUR ROAD NH - 24
DISTT. - HAPUR 245304 (U.P.)
PHONE NO. -: 9910414125
GSTIN/UIN: 09AEUPT5538A1Z1
State Name : Uttar Pradesh, Code : 09
E-Mail : primelogitechindustry@gmail.com
Consignee (Ship to)
PG TECHNOPLST PRIVATE LIMITED (SUPA PLANT)
A - 18, SUPA, MIDC TALUKA PARNER HANGA
AHMEDNAGAR, MAHARASHTRA 414301
GSTIN/UIN : 27AALCP4806B1ZK
State Name : Maharashtra, Code : 27
Buyer (Bill to)
PG TECHNOPLST PRIVATE LIMITED (SUPA PLANT)
A - 18, SUPA, MIDC TALUKA PARNER HANGA
AHMEDNAGAR, MAHARASHTRA 414301
GSTIN/UIN : 27AALCP4806B1ZK
State Name : Maharashtra, Code : 27
Invoice No. e-Way Bill No.
PLI/2025-26/147 431648104043
Delivery Note
Reference No. & Date.
PLI/2025-26/147 dt. 18-Nov-25
Buyer's Order No.
4800001327
Dispatch Doc No.
Dispatched through
LALJI MULJI TRANSPORT
Bill of Lading/LR-RR No.
Dated
18-Nov-25
Mode/Terms of Payment
15 DAS
Other References
Dated
11-Nov-25
Delivery Note Date
Destination
HANGA 414301
Motor Vehicle No.
UP14PT5232
Terms of Delivery
FREIGHT PAID DOOR DELIVERY
30 BAG + 75 BDL = 105 NAG
TOTAL WEIGHT = 2654 KGS
Sl Description of Goods Amount per Rate Quantity HSN/SAC
No.
1 SS PIPE 28MM OD 4,78,800.00 MTR 159.60 3,000 MTR 7306
SS PIPE 28MM OD - 4010004622
2 PIPE JOINTS 96,900.00 SET 32.30 3,000.00 SET 7307
PIPE JOINTS PJ1 - 4010004619
3 PIPE JOINTS 23,465.00 SET 46.93 500.00 SET 7307
PIPE JOINTS PJ2 - 4010004545
4 PIPE JOINTS 58,900.00 SET 58.90 1,000.00 SET 7307
PIPE JOINTS PJ15 - 4010004620
5 PIPE JOINTS 34,200.00 SET 68.40 500.00 SET 7307
PIPE JOINTS PJ16 - 4010004621
6 PIPE JOINTS 3,515.00 SET 70.30 50.00 SET 7307
PIPE JOINTS P100 - 4010005051
continued ...
This is a Computer Generated Invoice
Tax Invoice(Page 2)
PRIME LOGITECH INDUSTRY
KHASRA NO. 297, VILL. - PARSON
HAPUR ROAD NH - 24
DISTT. - HAPUR 245304 (U.P.)
Sl Description of Goods Amount per Rate Quantity HSN/SAC
No.
7 Industrial Trolley Wheel 20,662.50 PCS 413.25 50 PCS 8431
PUPSC FIXED 6X2 - 4010005056
7,16,442.50
IGST 1,28,959.65 % 18
Total Rs. 8,45,402.15`;

const rawLines = testText.split('\n').map(l => l.trim()).filter(Boolean);
let inTable = false;
const items = [];
const rowPattern = /^\s*(\d{1,2})\s*(.+?)\s+([\d,]+\.\d{2})\s*([A-Za-z]+)\s*([\d,]+\.\d{2})\s*([\d,]+(?:\.\d+)?)\s*(?:[A-Za-z]+)?\s*(\d{4,8})?$/;

for (let i = 0; i < rawLines.length; i++) {
  const line = rawLines[i];
  if (/(?:Description of Goods|Sl\s*No|Particulars)/i.test(line)) {
    inTable = true;
    continue;
  }
  if (inTable && /(?:Total\s*Rs\.|continued|Amount Chargeable|Declaration|Bank Details|Tax Amount|HSN\/SAC Total)/i.test(line)) {
    inTable = false;
    continue;
  }
  if (!inTable) continue;

  const match = line.match(rowPattern);
  if (match) {
    let desc = match[2].trim();
    const amount = parseFloat(match[3].replace(/,/g, '')) || 0;
    const uom = match[4].trim().toUpperCase();
    const rate = parseFloat(match[5].replace(/,/g, '')) || 0;
    const quantity = parseFloat(match[6].replace(/,/g, '')) || 0;

    if (quantity > 500000 || rate > 500000) continue;
    if (/(?:KHASRA|PHONE|GSTIN|CONSIGNEE|BUYER|VEHICLE|TRANSPORT)/i.test(desc)) continue;

    if (i + 1 < rawLines.length) {
      const nextLine = rawLines[i + 1];
      if (!rowPattern.test(nextLine) && !/^(?:IGST|CGST|SGST|Total|Amount|continued|Declaration|Tax\s*Invoice|Page)/i.test(nextLine) && !nextLine.includes('Sl Description')) {
        desc = `${desc} (${nextLine.trim()})`;
      }
    }

    items.push({ desc, quantity, uom, rate, amount });
  }
}

console.log('EXTRACTED ITEMS COUNT:', items.length);
items.forEach((it, idx) => console.log(`#${idx+1}: ${it.desc} | Qty: ${it.quantity} ${it.uom} | Rate: ${it.rate} | Amount: ${it.amount}`));
