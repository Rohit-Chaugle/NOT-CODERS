/**
 * Browser PDF export for the Campus Sustainability Report using jsPDF.
 *
 * A lightweight port of the ReportLab document in `backend/app/services/pdf.py`
 * (header, vital-sign metrics, Green Score breakdown, trends, prioritized
 * actions, executive summary + outlook).
 */

import { jsPDF } from "jspdf";
import type { SustainabilityReport } from "../api/ai";

const MARGIN = 40;
const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

/** jsPDF's core fonts are Latin-1; fold typographic characters to ASCII. */
function clean(text: string): string {
  return (text ?? "")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\u2014/g, "-")
    .replace(/\u2013/g, "-")
    .replace(/\u00b7/g, "-")
    .replace(/\u00b2/g, "2")
    .replace(/\u2192/g, "->")
    .replace(/\u2026/g, "...")
    .replace(/[^\x00-\xFF]/g, "");
}

function impactPhrase(rec: SustainabilityReport["recommendations"][number]): string {
  const parts: string[] = [];
  if (rec.est_kwh_saved) parts.push(`${rec.est_kwh_saved} kWh`);
  if (rec.est_litres_saved) parts.push(`${rec.est_litres_saved} L water`);
  if (rec.est_kg_saved) parts.push(`${rec.est_kg_saved} kg waste`);
  return parts.join(", ") || "Operational efficiency";
}

function sectionFromMarkdown(markdown: string, heading: string): string {
  const marker = `## ${heading}`;
  if (!markdown.includes(marker)) return "";
  const after = markdown.split(marker)[1] ?? "";
  return after.split("##")[0].trim().replace(/\n/g, " ");
}

export function generateReportPdf(report: SustainabilityReport): void {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  let y = MARGIN;

  const ensureSpace = (needed: number) => {
    if (y + needed > PAGE_HEIGHT - MARGIN) {
      doc.addPage();
      y = MARGIN;
    }
  };

  // Header
  doc.setFont("helvetica", "bold");
  doc.setFontSize(17);
  doc.setTextColor(6, 36, 25);
  doc.text(clean("Verdant Twin - AI Campus Sustainability Report"), MARGIN, y);
  y += 20;

  const score = report.green_score;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(71, 85, 105);
  doc.text(
    clean(`Green Score ${score.score}/100 (Grade ${score.grade} - ${score.label})`),
    MARGIN,
    y,
  );
  y += 14;
  doc.setFontSize(8);
  doc.text(
    clean(
      `Period: ${report.period} | Generated: ${report.generated_at.slice(0, 16).replace("T", " ")} | Engine: ${report.provider.name}`,
    ),
    MARGIN,
    y,
  );
  y += 10;
  doc.setDrawColor(6, 36, 25);
  doc.setLineWidth(1.2);
  doc.line(MARGIN, y, PAGE_WIDTH - MARGIN, y);
  y += 18;

  // Metrics
  const m = report.metrics;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(6, 36, 25);
  doc.text(clean("Campus Resource Vital Signs"), MARGIN, y);
  y += 14;

  const metrics: [string, string][] = [
    ["Live Load", `${m.energy_current_kw} kW (budget ${m.energy_budget_kw} kW)`],
    ["Energy Today", `${m.energy_today_kwh} kWh`],
    ["Live Water Flow", `${m.water_current_lpm} L/min`],
    ["Water Today", `${m.water_today_liters} L`],
    ["Avg Bin Fill", `${m.waste_avg_fill_pct}% (${m.waste_overflow_bins} overflowing)`],
    ["Occupancy", `${m.occupancy_current} / ${m.occupancy_capacity}`],
    ["Open Issues", String(m.issues_open)],
    ["Resolved (24h / all)", `${m.issues_resolved_24h} / ${m.issues_resolved}`],
  ];
  doc.setFontSize(9);
  for (const [label, value] of metrics) {
    ensureSpace(14);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(15, 23, 42);
    doc.text(clean(label), MARGIN, y);
    doc.setFont("helvetica", "normal");
    doc.text(clean(value), MARGIN + 150, y);
    y += 13;
  }
  y += 8;

  // Green Score breakdown
  ensureSpace(30);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(6, 36, 25);
  doc.text(clean("Green Score Breakdown"), MARGIN, y);
  y += 14;
  doc.setFontSize(8.5);
  for (const component of score.components) {
    ensureSpace(24);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(15, 23, 42);
    doc.text(clean(`${component.label}  ${component.score}/100 (weight ${Math.round(component.weight * 100)}%)`), MARGIN, y);
    y += 11;
    doc.setFont("helvetica", "normal");
    const detailLines = doc.splitTextToSize(clean(component.detail), CONTENT_WIDTH) as string[];
    doc.text(detailLines, MARGIN, y);
    y += detailLines.length * 10 + 5;
  }
  y += 4;

  // Trends
  if (report.trends.length) {
    ensureSpace(24);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(6, 36, 25);
    doc.text(clean("Resource Trends"), MARGIN, y);
    y += 14;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    for (const trend of report.trends) {
      ensureSpace(14);
      const direction = trend.change_pct > 0 ? "increased" : trend.change_pct < 0 ? "reduced" : "steady";
      doc.text(
        clean(
          `${trend.resource}: ${direction} ${Math.abs(trend.change_pct).toFixed(1)}% ` +
            `(${trend.recent} ${trend.unit} vs ${trend.previous} ${trend.unit} over ${trend.window_hours}h)`,
        ),
        MARGIN,
        y,
      );
      y += 13;
    }
    y += 6;
  }

  // Recommendations
  if (report.recommendations.length) {
    ensureSpace(30);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(6, 36, 25);
    doc.text(clean("Prioritized Actionable Recommendations"), MARGIN, y);
    y += 14;
    for (const rec of report.recommendations.slice(0, 8)) {
      ensureSpace(40);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(15, 23, 42);
      doc.text(clean(`[${rec.priority.toUpperCase()}] ${rec.title} - ${rec.location.zone}`), MARGIN, y);
      y += 12;
      doc.setFont("helvetica", "normal");
      doc.setTextColor(71, 85, 105);
      const lines = doc.splitTextToSize(clean(rec.action), CONTENT_WIDTH) as string[];
      doc.text(lines, MARGIN, y);
      y += lines.length * 10;
      doc.text(clean(`${impactPhrase(rec)} - ${rec.timeframe}`), MARGIN, y);
      y += 14;
    }
    y += 6;
  }

  // Executive summary + outlook (pulled from the markdown)
  const executive = sectionFromMarkdown(report.markdown, "Executive summary");
  const outlook = sectionFromMarkdown(report.markdown, "Outlook");
  if (executive) {
    ensureSpace(40);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(6, 36, 25);
    doc.text(clean("Executive Summary"), MARGIN, y);
    y += 14;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(15, 23, 42);
    const lines = doc.splitTextToSize(clean(executive), CONTENT_WIDTH) as string[];
    doc.text(lines, MARGIN, y);
    y += lines.length * 11 + 10;
  }
  if (outlook) {
    ensureSpace(40);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(6, 36, 25);
    doc.text(clean("Projected Sustainability Outlook"), MARGIN, y);
    y += 14;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(15, 23, 42);
    const lines = doc.splitTextToSize(clean(outlook), CONTENT_WIDTH) as string[];
    doc.text(lines, MARGIN, y);
    y += lines.length * 11;
  }

  // Footer
  ensureSpace(24);
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.5);
  doc.line(MARGIN, PAGE_HEIGHT - MARGIN - 10, PAGE_WIDTH - MARGIN, PAGE_HEIGHT - MARGIN - 10);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(71, 85, 105);
  doc.text(
    clean("Verdant Twin - AI-Powered Sustainable Digital Twin - Generated by the standalone engine"),
    PAGE_WIDTH / 2,
    PAGE_HEIGHT - MARGIN,
    { align: "center" },
  );

  doc.save("campus-sustainability-report.pdf");
}
