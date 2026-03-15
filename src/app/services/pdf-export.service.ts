import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class PdfExportService {
  downloadSimplePdf(fileName: string, title: string, lines: string[]): void {
    const allLines = [title, '', ...lines].map((line) => this.escapePdfText(line));
    let content = 'BT /F1 12 Tf 50 780 Td 0 -18 Td ';
    content += allLines.map((line) => `(${line}) Tj T*`).join(' ');
    content += ' ET';

    const pdfParts = [
      '%PDF-1.4\n',
      '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n',
      '2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n',
      '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj\n',
      '4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj\n',
      `5 0 obj << /Length ${content.length} >> stream\n${content}\nendstream endobj\n`
    ];

    const offsets: number[] = [];
    let cursor = 0;
    pdfParts.forEach((part) => {
      offsets.push(cursor);
      cursor += part.length;
    });

    const xrefStart = cursor;
    let xref = 'xref\n0 6\n0000000000 65535 f \n';
    for (let i = 0; i < offsets.length; i += 1) {
      xref += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
    }
    const trailer = `trailer << /Size 6 /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
    const pdf = pdfParts.join('') + xref + trailer;

    const blob = new Blob([pdf], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  private escapePdfText(input: string): string {
    return input.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  }
}
