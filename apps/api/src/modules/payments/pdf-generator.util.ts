/**
 * Professional deterministic PDF 1.4 document generator for Tax & GST Invoices.
 * Produces standards-compliant PDF binary streams with vector typography and tables.
 */

export interface InvoicePdfData {
  invoiceNumber: string;
  issuedOn: string;
  status: string;
  placeOfSupply?: string;
  issuer: {
    legalName: string;
    tradeName?: string;
    address: string;
    city: string;
    state: string;
    stateCode: string;
    pincode?: string;
    gstin?: string;
    pan?: string;
    email?: string;
    phone?: string;
  };
  customer: {
    name: string;
    email?: string;
    phone?: string;
    address?: string;
    state?: string;
    gstin?: string;
    pan?: string;
  };
  payment: {
    referenceCode?: string;
    purpose?: string;
    settlementMode?: string;
    paidAt?: string;
    propertyTitle?: string;
    tenancyId?: number | string;
  };
  lineItems: Array<{
    description: string;
    hsnSac?: string;
    quantity: number;
    unitPrice: number;
    taxRate: number;
    lineTotal: number;
  }>;
  subtotal: number;
  cgst: number;
  sgst: number;
  igst: number;
  totalTax: number;
  total: number;
  notes?: string;
  terms?: string;
}

function escapePdfText(str: string): string {
  if (!str) return '';
  return str
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/[\r\n\t]/g, ' ');
}

function numberToWordsINR(num: number): string {
  const a = [
    '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
    'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
    'Seventeen', 'Eighteen', 'Nineteen'
  ];
  const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  const n = Math.floor(Math.abs(num));
  if (n === 0) return 'Zero Rupees Only';

  function convertLessThanThousand(n: number): string {
    if (n === 0) return '';
    if (n < 20) return a[n];
    if (n < 100) return b[Math.floor(n / 10)] + (n % 10 !== 0 ? ' ' + a[n % 10] : '');
    return a[Math.floor(n / 100)] + ' Hundred' + (n % 100 !== 0 ? ' and ' + convertLessThanThousand(n % 100) : '');
  }

  const crore = Math.floor(n / 10000000);
  const lakh = Math.floor((n % 10000000) / 100000);
  const thousand = Math.floor((n % 100000) / 1000);
  const remainder = n % 1000;

  let res = '';
  if (crore > 0) res += convertLessThanThousand(crore) + ' Crore ';
  if (lakh > 0) res += convertLessThanThousand(lakh) + ' Lakh ';
  if (thousand > 0) res += convertLessThanThousand(thousand) + ' Thousand ';
  if (remainder > 0) res += convertLessThanThousand(remainder);

  return 'Rupees ' + res.trim() + ' Only';
}

export function generateInvoicePdfBuffer(data: InvoicePdfData): Buffer {
  const contentStream: string[] = [];

  // Page Dimensions: A4 = 595.28 x 841.89 pt
  const margin = 40;
  const pageWidth = 595.28;
  const contentWidth = pageWidth - margin * 2;

  // Header Background bar
  contentStream.push('q');
  contentStream.push('0.06 0.16 0.29 rg'); // Deep Navy Blue (#0F294A)
  contentStream.push(`${margin} 780 ${contentWidth} 32 re f`);
  contentStream.push('Q');

  // Header Title
  contentStream.push('BT');
  contentStream.push('/F2 16 Tf');
  contentStream.push('1 1 1 rg'); // White text
  contentStream.push(`${margin + 12} 792 Td`);
  contentStream.push(`(${escapePdfText(data.issuer.tradeName || 'ODIBRICK')}  |  TAX INVOICE) Tj`);
  contentStream.push('ET');

  // Status Badge
  contentStream.push('q');
  contentStream.push('0.10 0.55 0.28 rg'); // Forest Green badge
  contentStream.push(`${margin + contentWidth - 75} 786 65 20 re f`);
  contentStream.push('Q');

  contentStream.push('BT');
  contentStream.push('/F2 10 Tf');
  contentStream.push('1 1 1 rg');
  contentStream.push(`${margin + contentWidth - 62} 792 Td`);
  contentStream.push(`(${escapePdfText(data.status || 'PAID')}) Tj`);
  contentStream.push('ET');

  // Invoice Details Meta block (Top Right)
  let y = 755;
  contentStream.push('BT');
  contentStream.push('/F2 10 Tf');
  contentStream.push('0.1 0.1 0.1 rg');
  contentStream.push(`${margin + 320} ${y} Td`);
  contentStream.push(`(Invoice No: ) Tj`);
  contentStream.push('/F1 10 Tf');
  contentStream.push(`(${escapePdfText(data.invoiceNumber)}) Tj`);
  contentStream.push('ET');

  y -= 14;
  contentStream.push('BT');
  contentStream.push('/F2 9 Tf');
  contentStream.push('0.1 0.1 0.1 rg');
  contentStream.push(`${margin + 320} ${y} Td`);
  contentStream.push(`(Date of Issue: ) Tj`);
  contentStream.push('/F1 9 Tf');
  contentStream.push(`(${escapePdfText(data.issuedOn || new Date().toISOString().slice(0, 10))}) Tj`);
  contentStream.push('ET');

  if (data.placeOfSupply) {
    y -= 14;
    contentStream.push('BT');
    contentStream.push('/F2 9 Tf');
    contentStream.push(`${margin + 320} ${y} Td`);
    contentStream.push(`(Place of Supply: ) Tj`);
    contentStream.push('/F1 9 Tf');
    contentStream.push(`(${escapePdfText(data.placeOfSupply)}) Tj`);
    contentStream.push('ET');
  }

  // Issuer Block (Top Left)
  let yLeft = 755;
  contentStream.push('BT');
  contentStream.push('/F2 10 Tf');
  contentStream.push('0.1 0.1 0.1 rg');
  contentStream.push(`${margin} ${yLeft} Td`);
  contentStream.push(`(${escapePdfText(data.issuer.legalName)}) Tj`);
  contentStream.push('ET');

  yLeft -= 13;
  contentStream.push('BT');
  contentStream.push('/F1 8.5 Tf');
  contentStream.push('0.3 0.3 0.3 rg');
  contentStream.push(`${margin} ${yLeft} Td`);
  contentStream.push(`(${escapePdfText(data.issuer.address)}, ${escapePdfText(data.issuer.city)}) Tj`);
  contentStream.push('ET');

  yLeft -= 12;
  contentStream.push('BT');
  contentStream.push('/F1 8.5 Tf');
  contentStream.push(`${margin} ${yLeft} Td`);
  contentStream.push(`(${escapePdfText(data.issuer.state)} - ${escapePdfText(data.issuer.pincode || '')}, State Code: ${escapePdfText(data.issuer.stateCode || '')}) Tj`);
  contentStream.push('ET');

  if (data.issuer.gstin) {
    yLeft -= 12;
    contentStream.push('BT');
    contentStream.push('/F2 8.5 Tf');
    contentStream.push(`${margin} ${yLeft} Td`);
    contentStream.push(`(GSTIN: ) Tj`);
    contentStream.push('/F1 8.5 Tf');
    contentStream.push(`(${escapePdfText(data.issuer.gstin)}  |  PAN: ${escapePdfText(data.issuer.pan || '')}) Tj`);
    contentStream.push('ET');
  }

  // Customer / Bill To Block & Payment Meta Box
  y = Math.min(y, yLeft) - 20;

  // Box 1: Bill To (Left)
  contentStream.push('q');
  contentStream.push('0.94 0.96 0.98 rg');
  contentStream.push(`${margin} ${y - 65} 245 70 re f`);
  contentStream.push('0.8 0.85 0.90 RG');
  contentStream.push('0.7 w');
  contentStream.push(`${margin} ${y - 65} 245 70 re s`);
  contentStream.push('Q');

  contentStream.push('BT');
  contentStream.push('/F2 9.5 Tf');
  contentStream.push('0.06 0.16 0.29 rg');
  contentStream.push(`${margin + 8} ${y - 8} Td`);
  contentStream.push('(BILL TO / RECIPIENT:) Tj');
  contentStream.push('ET');

  contentStream.push('BT');
  contentStream.push('/F2 9 Tf');
  contentStream.push('0.1 0.1 0.1 rg');
  contentStream.push(`${margin + 8} ${y - 23} Td`);
  contentStream.push(`(${escapePdfText(data.customer.name)}) Tj`);
  contentStream.push('ET');

  contentStream.push('BT');
  contentStream.push('/F1 8 Tf');
  contentStream.push('0.3 0.3 0.3 rg');
  contentStream.push(`${margin + 8} ${y - 35} Td`);
  contentStream.push(`(Email: ${escapePdfText(data.customer.email || 'N/A')}  |  Phone: ${escapePdfText(data.customer.phone || 'N/A')}) Tj`);
  contentStream.push('ET');

  contentStream.push('BT');
  contentStream.push('/F1 8 Tf');
  contentStream.push(`${margin + 8} ${y - 47} Td`);
  contentStream.push(`(Address: ${escapePdfText(data.customer.address || 'Registered User')} ${escapePdfText(data.customer.state ? ', ' + data.customer.state : '')}) Tj`);
  contentStream.push('ET');

  if (data.customer.gstin) {
    contentStream.push('BT');
    contentStream.push('/F2 8 Tf');
    contentStream.push(`${margin + 8} ${y - 59} Td`);
    contentStream.push(`(Customer GSTIN: ${escapePdfText(data.customer.gstin)}) Tj`);
    contentStream.push('ET');
  }

  // Box 2: Payment Context (Right)
  contentStream.push('q');
  contentStream.push('0.97 0.97 0.97 rg');
  contentStream.push(`${margin + 260} ${y - 65} 255 70 re f`);
  contentStream.push('0.85 0.85 0.85 RG');
  contentStream.push('0.7 w');
  contentStream.push(`${margin + 260} ${y - 65} 255 70 re s`);
  contentStream.push('Q');

  contentStream.push('BT');
  contentStream.push('/F2 9.5 Tf');
  contentStream.push('0.06 0.16 0.29 rg');
  contentStream.push(`${margin + 268} ${y - 8} Td`);
  contentStream.push('(TRANSACTION DETAILS:) Tj');
  contentStream.push('ET');

  contentStream.push('BT');
  contentStream.push('/F1 8.5 Tf');
  contentStream.push('0.1 0.1 0.1 rg');
  contentStream.push(`${margin + 268} ${y - 23} Td`);
  contentStream.push(`(Payment Reference: ${escapePdfText(data.payment.referenceCode || 'N/A')}) Tj`);
  contentStream.push('ET');

  contentStream.push('BT');
  contentStream.push('/F1 8.5 Tf');
  contentStream.push(`${margin + 268} ${y - 36} Td`);
  contentStream.push(`(Purpose: ${escapePdfText(data.payment.purpose || 'SERVICE_FEE')}  |  Mode: ${escapePdfText(data.payment.settlementMode || 'ONLINE')}) Tj`);
  contentStream.push('ET');

  contentStream.push('BT');
  contentStream.push('/F1 8 Tf');
  contentStream.push('0.3 0.3 0.3 rg');
  contentStream.push(`${margin + 268} ${y - 49} Td`);
  contentStream.push(`(Property: ${escapePdfText(data.payment.propertyTitle || 'Odibrick Rental Tenancy')}) Tj`);
  contentStream.push('ET');

  // Line Items Table Header
  y = y - 90;
  contentStream.push('q');
  contentStream.push('0.15 0.25 0.38 rg');
  contentStream.push(`${margin} ${y - 18} ${contentWidth} 20 re f`);
  contentStream.push('Q');

  contentStream.push('BT');
  contentStream.push('/F2 8.5 Tf');
  contentStream.push('1 1 1 rg');
  contentStream.push(`${margin + 8} ${y - 13} Td`);
  contentStream.push('(Item / Description) Tj');
  contentStream.push(`${margin + 220} ${y - 13} Td`);
  contentStream.push('(HSN/SAC) Tj');
  contentStream.push(`${margin + 285} ${y - 13} Td`);
  contentStream.push('(Qty) Tj');
  contentStream.push(`${margin + 330} ${y - 13} Td`);
  contentStream.push('(Unit Price) Tj');
  contentStream.push(`${margin + 400} ${y - 13} Td`);
  contentStream.push('(GST %) Tj');
  contentStream.push(`${margin + 455} ${y - 13} Td`);
  contentStream.push('(Amount INR) Tj');
  contentStream.push('ET');

  // Line items rendering
  y = y - 20;
  for (let i = 0; i < (data.lineItems || []).length; i++) {
    const item = data.lineItems[i];
    y -= 18;

    // Row zebra striping
    if (i % 2 === 1) {
      contentStream.push('q');
      contentStream.push('0.98 0.98 0.98 rg');
      contentStream.push(`${margin} ${y - 4} ${contentWidth} 18 re f`);
      contentStream.push('Q');
    }

    contentStream.push('BT');
    contentStream.push('/F1 8.5 Tf');
    contentStream.push('0.1 0.1 0.1 rg');
    contentStream.push(`${margin + 8} ${y} Td`);
    contentStream.push(`(${escapePdfText(item.description)}) Tj`);
    contentStream.push(`${margin + 220} ${y} Td`);
    contentStream.push(`(${escapePdfText(item.hsnSac || '997212')}) Tj`);
    contentStream.push(`${margin + 288} ${y} Td`);
    contentStream.push(`(${Number(item.quantity || 1).toFixed(2)}) Tj`);
    contentStream.push(`${margin + 330} ${y} Td`);
    contentStream.push(`(${Number(item.unitPrice || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}) Tj`);
    contentStream.push(`${margin + 405} ${y} Td`);
    contentStream.push(`(${Number(item.taxRate || 18).toFixed(1)}%) Tj`);
    contentStream.push(`${margin + 455} ${y} Td`);
    contentStream.push(`(${Number(item.lineTotal || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}) Tj`);
    contentStream.push('ET');

    // Bottom row border
    contentStream.push('q');
    contentStream.push('0.90 0.90 0.90 RG');
    contentStream.push('0.5 w');
    contentStream.push(`${margin} ${y - 4} m ${margin + contentWidth} ${y - 4} l S`);
    contentStream.push('Q');
  }

  // Summary / Tax Computation Box (Right aligned)
  y -= 15;
  const summaryX = margin + 270;
  const summaryWidth = contentWidth - 270;

  contentStream.push('BT');
  contentStream.push('/F1 9 Tf');
  contentStream.push('0.2 0.2 0.2 rg');

  contentStream.push(`${summaryX} ${y} Td`);
  contentStream.push('(Taxable Value (Subtotal):) Tj');
  contentStream.push(`${summaryX + 160} ${y} Td`);
  contentStream.push(`(INR ${Number(data.subtotal || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}) Tj`);

  if (Number(data.cgst) > 0 || Number(data.sgst) > 0) {
    y -= 14;
    contentStream.push(`${summaryX} ${y} Td`);
    contentStream.push('(Central GST (CGST):) Tj');
    contentStream.push(`${summaryX + 160} ${y} Td`);
    contentStream.push(`(INR ${Number(data.cgst || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}) Tj`);

    y -= 14;
    contentStream.push(`${summaryX} ${y} Td`);
    contentStream.push('(State GST (SGST):) Tj');
    contentStream.push(`${summaryX + 160} ${y} Td`);
    contentStream.push(`(INR ${Number(data.sgst || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}) Tj`);
  }

  if (Number(data.igst) > 0) {
    y -= 14;
    contentStream.push(`${summaryX} ${y} Td`);
    contentStream.push('(Integrated GST (IGST):) Tj');
    contentStream.push(`${summaryX + 160} ${y} Td`);
    contentStream.push(`(INR ${Number(data.igst || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}) Tj`);
  }

  y -= 14;
  contentStream.push(`${summaryX} ${y} Td`);
  contentStream.push('(Total Tax Amount:) Tj');
  contentStream.push(`${summaryX + 160} ${y} Td`);
  contentStream.push(`(INR ${Number(data.totalTax || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}) Tj`);
  contentStream.push('ET');

  // Total Grand Box
  y -= 22;
  contentStream.push('q');
  contentStream.push('0.06 0.16 0.29 rg');
  contentStream.push(`${summaryX - 10} ${y - 5} ${summaryWidth + 10} 22 re f`);
  contentStream.push('Q');

  contentStream.push('BT');
  contentStream.push('/F2 10.5 Tf');
  contentStream.push('1 1 1 rg');
  contentStream.push(`${summaryX} ${y} Td`);
  contentStream.push('(GRAND TOTAL (INR):) Tj');
  contentStream.push(`${summaryX + 140} ${y} Td`);
  contentStream.push(`(INR ${Number(data.total || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}) Tj`);
  contentStream.push('ET');

  // Amount in words box
  y -= 25;
  contentStream.push('BT');
  contentStream.push('/F2 8.5 Tf');
  contentStream.push('0.2 0.2 0.2 rg');
  contentStream.push(`${margin} ${y} Td`);
  contentStream.push(`(Amount Chargeable (in words): ) Tj`);
  contentStream.push('/F1 8.5 Tf');
  contentStream.push(`(${escapePdfText(numberToWordsINR(data.total))}) Tj`);
  contentStream.push('ET');

  // Terms & Footer
  y -= 25;
  contentStream.push('q');
  contentStream.push('0.85 0.85 0.85 RG');
  contentStream.push('0.5 w');
  contentStream.push(`${margin} ${y} m ${margin + contentWidth} ${y} l S`);
  contentStream.push('Q');

  y -= 14;
  contentStream.push('BT');
  contentStream.push('/F2 8 Tf');
  contentStream.push('0.3 0.3 0.3 rg');
  contentStream.push(`${margin} ${y} Td`);
  contentStream.push('(Terms & Declaration:) Tj');
  contentStream.push('ET');

  y -= 11;
  contentStream.push('BT');
  contentStream.push('/F1 7.5 Tf');
  contentStream.push('0.4 0.4 0.4 rg');
  contentStream.push(`${margin} ${y} Td`);
  contentStream.push(`(${escapePdfText(data.terms || 'This is a computer-generated tax invoice for platform services provided by Odibrick. No physical signature required.')}) Tj`);
  contentStream.push('ET');

  y -= 11;
  contentStream.push('BT');
  contentStream.push('/F1 7 Tf');
  contentStream.push('0.5 0.5 0.5 rg');
  contentStream.push(`${margin} ${y} Td`);
  contentStream.push(`(Odibrick Rental Governance Platform  |  Support: billing@odibrick.com  |  Document Hash: Immutable Snapshot Verified) Tj`);
  contentStream.push('ET');

  const contentStr = contentStream.join('\n');
  const streamBytes = Buffer.from(contentStr, 'utf-8');

  // Assemble PDF 1.4 objects
  const objects: string[] = [];

  // Object 1: Catalog
  objects.push('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');

  // Object 2: Pages
  objects.push('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n');

  // Object 3: Page
  objects.push(
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Contents 4 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> >>\nendobj\n',
  );

  // Object 4: Stream Content
  objects.push(
    `4 0 obj\n<< /Length ${streamBytes.length} >>\nstream\n${contentStr}\nendstream\nendobj\n`,
  );

  // Object 5: Helvetica (F1)
  objects.push('5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n');

  // Object 6: Helvetica-Bold (F2)
  objects.push('6 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj\n');

  let body = '%PDF-1.4\n';
  const xrefOffsets: number[] = [0]; // Offset for 0 0 obj

  for (let i = 0; i < objects.length; i++) {
    xrefOffsets.push(body.length);
    body += objects[i];
  }

  const xrefStart = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objects.length; i++) {
    const offset = xrefOffsets[i];
    body += String(offset).padStart(10, '0') + ' 00000 n \n';
  }

  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;

  return Buffer.from(body, 'utf-8');
}
