import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import type { BoQLineItem } from "../types";

// Theme colours from tailwind.config.js
const COLORS = {
  primary: [123, 47, 247] as [number, number, number],
  primaryDark: [90, 25, 201] as [number, number, number],
  accent: [255, 95, 162] as [number, number, number],
  surface: [246, 243, 255] as [number, number, number],
  white: [255, 255, 255] as [number, number, number],
  gray700: [55, 65, 81] as [number, number, number],
  gray400: [156, 163, 175] as [number, number, number],
};

// ---------------------------------------------------------------------------
// Shared PDF helpers
// ---------------------------------------------------------------------------

function addHeader(doc: jsPDF, title: string, subtitle: string) {
  const pageW = doc.internal.pageSize.getWidth();

  // Gradient-like header band
  doc.setFillColor(...COLORS.primary);
  doc.rect(0, 0, pageW, 38, "F");
  doc.setFillColor(...COLORS.primaryDark);
  doc.rect(0, 34, pageW, 4, "F");

  // Title text
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(...COLORS.white);
  doc.text(title, 14, 18);

  // Subtitle
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(220, 220, 255);
  doc.text(subtitle, 14, 28);

  // Logo-like badge
  doc.setFillColor(...COLORS.white);
  doc.roundedRect(pageW - 36, 8, 24, 22, 4, 4, "F");
  doc.setTextColor(...COLORS.primary);
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text("SOW", pageW - 30, 19);
  doc.setFontSize(6);
  doc.text("Agent", pageW - 29, 25);
}

function addFooter(doc: jsPDF) {
  const pageCount = doc.getNumberOfPages();
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();

  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);

    // Footer line
    doc.setDrawColor(...COLORS.gray400);
    doc.setLineWidth(0.3);
    doc.line(14, pageH - 16, pageW - 14, pageH - 16);

    // Footer text
    doc.setFontSize(7);
    doc.setTextColor(...COLORS.gray400);
    doc.setFont("helvetica", "normal");
    doc.text("Autonomous Procurement \u2022 Scope of Work Agent", 14, pageH - 10);
    doc.text(`Page ${i} of ${pageCount}`, pageW - 14, pageH - 10, { align: "right" });

    // Generated date
    const dateStr = new Date().toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    doc.text(`Generated: ${dateStr}`, pageW / 2, pageH - 10, { align: "center" });
  }
}

function renderMarkdownText(doc: jsPDF, text: string, startY: number, margin: number): number {
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const maxW = pageW - margin * 2;
  let y = startY;

  const lines = text.split("\n");

  for (const line of lines) {
    const trimmed = line.trim();

    // Page break check
    if (y > pageH - 30) {
      doc.addPage();
      y = 20;
    }

    // Headings
    if (trimmed.startsWith("# ")) {
      y += 6;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(16);
      doc.setTextColor(...COLORS.primaryDark);
      const wrapped = doc.splitTextToSize(trimmed.replace(/^#+\s*/, ""), maxW);
      doc.text(wrapped, margin, y);
      y += wrapped.length * 7 + 2;
      // Underline
      doc.setDrawColor(...COLORS.primary);
      doc.setLineWidth(0.5);
      doc.line(margin, y - 2, margin + 60, y - 2);
      y += 4;
      continue;
    }
    if (trimmed.startsWith("## ")) {
      y += 4;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(13);
      doc.setTextColor(...COLORS.primary);
      const wrapped = doc.splitTextToSize(trimmed.replace(/^#+\s*/, ""), maxW);
      doc.text(wrapped, margin, y);
      y += wrapped.length * 6 + 3;
      continue;
    }
    if (trimmed.startsWith("### ")) {
      y += 3;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(...COLORS.gray700);
      const wrapped = doc.splitTextToSize(trimmed.replace(/^#+\s*/, ""), maxW);
      doc.text(wrapped, margin, y);
      y += wrapped.length * 5 + 2;
      continue;
    }
    if (trimmed.startsWith("#### ")) {
      y += 2;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(...COLORS.gray700);
      const wrapped = doc.splitTextToSize(trimmed.replace(/^#+\s*/, ""), maxW);
      doc.text(wrapped, margin, y);
      y += wrapped.length * 5 + 2;
      continue;
    }

    // Horizontal rule
    if (/^-{3,}$/.test(trimmed) || /^\*{3,}$/.test(trimmed)) {
      doc.setDrawColor(...COLORS.gray400);
      doc.setLineWidth(0.3);
      doc.line(margin, y, pageW - margin, y);
      y += 4;
      continue;
    }

    // Bullet points
    if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9.5);
      doc.setTextColor(...COLORS.gray700);
      const content = trimmed.replace(/^[-*]\s*/, "").replace(/\*\*/g, "");
      const wrapped = doc.splitTextToSize(content, maxW - 8);
      // Bullet dot
      doc.setFillColor(...COLORS.primary);
      doc.circle(margin + 2, y - 1.2, 1, "F");
      doc.text(wrapped, margin + 6, y);
      y += wrapped.length * 4.2 + 1.5;
      continue;
    }

    // Empty line
    if (trimmed === "") {
      y += 3;
      continue;
    }

    // Regular paragraph
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    doc.setTextColor(...COLORS.gray700);
    const cleanText = trimmed.replace(/\*\*/g, "");
    const wrapped = doc.splitTextToSize(cleanText, maxW);

    // Page break check for wrapped text
    if (y + wrapped.length * 4.2 > pageH - 30) {
      doc.addPage();
      y = 20;
    }

    doc.text(wrapped, margin, y);
    y += wrapped.length * 4.2 + 1.5;
  }

  return y;
}

// ---------------------------------------------------------------------------
// Export: Detailed Scope PDF
// ---------------------------------------------------------------------------

export function exportDetailedScopePDF(scopeText: string, description?: string) {
  const doc = new jsPDF("p", "mm", "a4");

  addHeader(doc, "Detailed Scope of Work", description || "Autonomous Procurement");
  renderMarkdownText(doc, scopeText, 48, 14);
  addFooter(doc);

  doc.save("Detailed_Scope_of_Work.pdf");
}

// ---------------------------------------------------------------------------
// Export: Executive Summary PDF
// ---------------------------------------------------------------------------

export function exportExecutiveSummaryPDF(summaryText: string, description?: string) {
  const doc = new jsPDF("p", "mm", "a4");

  addHeader(doc, "Executive Summary", description || "Autonomous Procurement");
  renderMarkdownText(doc, summaryText, 48, 14);
  addFooter(doc);

  doc.save("Executive_Summary.pdf");
}

// ---------------------------------------------------------------------------
// Export: Bill of Quantities Excel (ExcelJS — matching Autonomous Sourcing template)
// ---------------------------------------------------------------------------

// Styled constants matching the Autonomous Sourcing dashboard
const HEADER_FILL: ExcelJS.FillPattern = { type: "pattern", pattern: "solid", fgColor: { argb: "FF7C3AED" } };
const HEADER_FONT: Partial<ExcelJS.Font> = { bold: true, color: { argb: "FFFFFFFF" }, size: 11, name: "Calibri" };
const TITLE_FILL: ExcelJS.FillPattern = { type: "pattern", pattern: "solid", fgColor: { argb: "FF581C87" } };
const TITLE_FONT: Partial<ExcelJS.Font> = { bold: true, color: { argb: "FFFFFFFF" }, size: 14, name: "Calibri" };
const SUBTITLE_FONT: Partial<ExcelJS.Font> = { bold: false, color: { argb: "FFFFFFFF" }, size: 10, name: "Calibri", italic: true };
const ALT_ROW_FILL: ExcelJS.FillPattern = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF5F3FF" } };
const TOTAL_FILL: ExcelJS.FillPattern = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEDE9FE" } };
const TOTAL_FONT: Partial<ExcelJS.Font> = { bold: true, color: { argb: "FF581C87" }, size: 12, name: "Calibri" };
const BORDER_THIN: Partial<ExcelJS.Border> = { style: "thin", color: { argb: "FFE9D5FF" } };
const CELL_BORDERS: Partial<ExcelJS.Borders> = { top: BORDER_THIN, bottom: BORDER_THIN, left: BORDER_THIN, right: BORDER_THIN };
const DATA_FONT: Partial<ExcelJS.Font> = { size: 11, name: "Calibri", color: { argb: "FF1E293B" } };

export async function exportBoQExcel(boqItems: BoQLineItem[], description?: string) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Scope of Work Agent";
  wb.created = new Date();

  const ws = wb.addWorksheet("Bill of Quantities");
  const colCount = 6;

  // ── Title row (merged, dark purple) ──
  ws.mergeCells(1, 1, 1, colCount);
  const titleCell = ws.getCell(1, 1);
  titleCell.value = "Bill of Quantities";
  titleCell.fill = TITLE_FILL;
  titleCell.font = TITLE_FONT;
  titleCell.alignment = { vertical: "middle", horizontal: "center" };
  ws.getRow(1).height = 36;

  // ── Subtitle row (description + date) ──
  ws.mergeCells(2, 1, 2, colCount);
  const subtitleCell = ws.getCell(2, 1);
  const dateStr = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  subtitleCell.value = `${description || "Scope of Work"} \u2022 Generated: ${dateStr}`;
  subtitleCell.fill = TITLE_FILL;
  subtitleCell.font = SUBTITLE_FONT;
  subtitleCell.alignment = { vertical: "middle", horizontal: "center" };
  ws.getRow(2).height = 24;

  // ── Blank spacer row ──
  ws.getRow(3).height = 8;

  // ── Header row ──
  const headers = ["#", "Item Description", "Qty", "Unit", "Est. Cost (USD)", "Total (USD)"];
  const headerRow = ws.getRow(4);
  headers.forEach((h, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = h;
    cell.fill = HEADER_FILL;
    cell.font = HEADER_FONT;
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = CELL_BORDERS;
  });
  headerRow.height = 28;

  // ── Data rows ──
  boqItems.forEach((item, idx) => {
    const row = ws.getRow(idx + 5);
    const lineTotal = item.quantity * item.estimated_cost;

    const values: (string | number)[] = [idx + 1, item.item, item.quantity, item.unit, item.estimated_cost, lineTotal];
    values.forEach((val, colIdx) => {
      const cell = row.getCell(colIdx + 1);
      cell.value = val;
      cell.font = DATA_FONT;
      cell.border = CELL_BORDERS;

      // Alternating row fill
      if (idx % 2 === 1) {
        cell.fill = ALT_ROW_FILL;
      }

      // Number formatting + alignment
      if (colIdx === 0) {
        cell.alignment = { vertical: "middle", horizontal: "center" };
      } else if (colIdx === 1) {
        cell.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
      } else if (colIdx === 2) {
        cell.alignment = { vertical: "middle", horizontal: "center" };
      } else if (colIdx === 3) {
        cell.alignment = { vertical: "middle", horizontal: "center" };
      } else {
        cell.numFmt = '#,##0.00';
        cell.alignment = { vertical: "middle", horizontal: "right" };
      }
    });
    row.height = 22;
  });

  // ── Total row ──
  const totalRowNum = boqItems.length + 5;
  const totalRow = ws.getRow(totalRowNum);
  const totalCost = boqItems.reduce((sum, item) => sum + item.quantity * item.estimated_cost, 0);

  // Merge label cells
  ws.mergeCells(totalRowNum, 1, totalRowNum, 5);
  const totalLabelCell = totalRow.getCell(1);
  totalLabelCell.value = "Total Estimated Cost";
  totalLabelCell.fill = TOTAL_FILL;
  totalLabelCell.font = TOTAL_FONT;
  totalLabelCell.alignment = { vertical: "middle", horizontal: "right" };
  totalLabelCell.border = CELL_BORDERS;

  const totalValueCell = totalRow.getCell(6);
  totalValueCell.value = totalCost;
  totalValueCell.numFmt = '#,##0.00';
  totalValueCell.fill = TOTAL_FILL;
  totalValueCell.font = { ...TOTAL_FONT, size: 13 };
  totalValueCell.alignment = { vertical: "middle", horizontal: "right" };
  totalValueCell.border = CELL_BORDERS;
  totalRow.height = 30;

  // ── Column widths ──
  ws.getColumn(1).width = 6;   // #
  ws.getColumn(2).width = 50;  // Item
  ws.getColumn(3).width = 10;  // Qty
  ws.getColumn(4).width = 10;  // Unit
  ws.getColumn(5).width = 20;  // Est Cost
  ws.getColumn(6).width = 20;  // Total

  // ── Freeze header ──
  ws.views = [{ state: "frozen" as const, ySplit: 4, xSplit: 0 }];

  // ── Auto-filter on header row ──
  ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: colCount } };

  // ── Write file ──
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  saveAs(blob, "Bill_of_Quantities.xlsx");
}
