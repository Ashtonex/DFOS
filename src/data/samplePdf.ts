/** Builds a small, valid single-page PDF (ASCII text only) for seeded sample documents. */
export function makePdf(title: string, lines: string[]): ArrayBuffer {
  const esc = (s: string) => s.replace(/[\\()]/g, (m) => "\\" + m).replace(/[^\x20-\x7e]/g, "?");
  const body: string[] = ["BT", "/F1 16 Tf", "50 790 Td", `(${esc(title)}) Tj`, "/F1 10 Tf", "0 -26 Td"];
  for (const l of lines) body.push(`(${esc(l)}) Tj`, "0 -15 Td");
  body.push("ET");
  const content = body.join("\n");
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objs.forEach((o, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("");
  pdf += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  const bytes = new TextEncoder().encode(pdf);
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}
