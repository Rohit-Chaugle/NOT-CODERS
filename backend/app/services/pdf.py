"""Campus Sustainability Report PDF generator using ReportLab.

Produces a styled PDF with the campus Green Score, key metrics,
resource trends, executive summary and prioritized actionable recommendations.
"""

from __future__ import annotations

import io
import logging
from datetime import datetime

from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import (
    HRFlowable,
    KeepTogether,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

logger = logging.getLogger("verdant.pdf")

# Palette tuned for high-contrast, clean document printing
PRIMARY_COLOR = colors.HexColor("#062419")
EMERALD_COLOR = colors.HexColor("#059669")
MINT_BG = colors.HexColor("#ecfdf5")
DARK_INK = colors.HexColor("#0f172a")
MUTED_INK = colors.HexColor("#475569")
LIGHT_GRAY = colors.HexColor("#f8fafc")
BORDER_COLOR = colors.HexColor("#e2e8f0")
AMBER_COLOR = colors.HexColor("#d97706")
CORAL_COLOR = colors.HexColor("#dc2626")


def _score_color(score: int) -> colors.HexColor:
    if score >= 80:
        return EMERALD_COLOR
    if score >= 60:
        return AMBER_COLOR
    return CORAL_COLOR


def generate_sustainability_pdf(report_data: dict) -> bytes:
    """Generate a PDF document from structured sustainability report data."""
    buffer = io.BytesIO()

    doc = SimpleDocTemplate(
        buffer,
        pagesize=letter,
        rightMargin=36,
        leftMargin=36,
        topMargin=36,
        bottomMargin=36,
    )

    styles = getSampleStyleSheet()

    title_style = ParagraphStyle(
        "DocTitle",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=20,
        leading=24,
        textColor=PRIMARY_COLOR,
    )

    subtitle_style = ParagraphStyle(
        "DocSubtitle",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=9,
        leading=12,
        textColor=MUTED_INK,
    )

    h2_style = ParagraphStyle(
        "SectionH2",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=12,
        leading=16,
        textColor=PRIMARY_COLOR,
        spaceBefore=10,
        spaceAfter=4,
    )

    body_style = ParagraphStyle(
        "Body",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=9,
        leading=13,
        textColor=DARK_INK,
    )

    callout_style = ParagraphStyle(
        "Callout",
        parent=styles["Normal"],
        fontName="Helvetica-Oblique",
        fontSize=9.5,
        leading=14,
        textColor=PRIMARY_COLOR,
    )

    table_header_style = ParagraphStyle(
        "TableHeader",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=8.5,
        leading=11,
        textColor=PRIMARY_COLOR,
    )

    table_cell_style = ParagraphStyle(
        "TableCell",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=8,
        leading=11,
        textColor=DARK_INK,
    )

    badge_style = ParagraphStyle(
        "Badge",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=8,
        leading=10,
        textColor=EMERALD_COLOR,
    )

    story = []

    # 1. Header Banner
    score_obj = report_data.get("green_score", {})
    score_val = int(score_obj.get("score", 75))
    grade_val = score_obj.get("grade", "B")
    label_val = score_obj.get("label", "Healthy")
    period_str = report_data.get("period", f"Day to {datetime.now():%Y-%m-%d %H:%M}")
    provider_info = report_data.get("provider", {})
    engine_name = provider_info.get("name", "template")
    engine_model = provider_info.get("model") or "Deterministic model"

    header_table = Table(
        [
            [
                Paragraph("<b>VERDANT TWIN</b> · AI Campus Sustainability Report", title_style),
                Paragraph(
                    f"<b>Green Score</b><br/><font size='18' color='{_score_color(score_val).hexval()}'><b>{score_val}</b></font>/100 (Grade {grade_val} · {label_val})",
                    ParagraphStyle("ScoreBox", parent=styles["Normal"], fontName="Helvetica", fontSize=9, alignment=2),
                ),
            ],
            [
                Paragraph(f"Period: {period_str} | Generated: {report_data.get('generated_at', datetime.now().isoformat())[:16].replace('T', ' ')} | Engine: {engine_name} ({engine_model})", subtitle_style),
                "",
            ],
        ],
        colWidths=[400, 140],
    )
    header_table.setStyle(
        TableStyle([
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ("TOPPADDING", (0, 0), (-1, -1), 0),
            ("SPAN", (0, 1), (1, 1)),
        ])
    )
    story.append(header_table)
    story.append(Spacer(1, 6))
    story.append(HRFlowable(width="100%", thickness=1.5, color=PRIMARY_COLOR, spaceBefore=4, spaceAfter=8))

    # 2. Key Metrics Summary Grid
    metrics = report_data.get("metrics", {})
    story.append(Paragraph("Campus Resource Vital Signs", h2_style))

    metrics_data = [
        [
            Paragraph("<b>Energy Consumption</b>", table_header_style),
            Paragraph("<b>Water Flow</b>", table_header_style),
            Paragraph("<b>Waste Management</b>", table_header_style),
            Paragraph("<b>Issue Health</b>", table_header_style),
        ],
        [
            Paragraph(
                f"• Live Load: <b>{metrics.get('energy_current_kw', 0):.1f} kW</b><br/>"
                f"• Budget: {metrics.get('energy_budget_kw', 0):.1f} kW<br/>"
                f"• Used Today: {metrics.get('energy_today_kwh', 0):.1f} kWh",
                table_cell_style,
            ),
            Paragraph(
                f"• Live Flow: <b>{metrics.get('water_current_lpm', 0):.1f} L/min</b><br/>"
                f"• Used Today: {metrics.get('water_today_liters', 0):.0f} L",
                table_cell_style,
            ),
            Paragraph(
                f"• Avg Bin Fill: <b>{metrics.get('waste_avg_fill_pct', 0):.0f}%</b><br/>"
                f"• Overflowing: {metrics.get('waste_overflow_bins', 0)} bins",
                table_cell_style,
            ),
            Paragraph(
                f"• Open Issues: <b>{metrics.get('issues_open', 0)}</b><br/>"
                f"• Resolved (24h): {metrics.get('issues_resolved_24h', 0)}<br/>"
                f"• Resolved (All): {metrics.get('issues_resolved', 0)}",
                table_cell_style,
            ),
        ],
    ]
    metrics_table = Table(metrics_data, colWidths=[135, 135, 135, 135])
    metrics_table.setStyle(
        TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), MINT_BG),
            ("BACKGROUND", (0, 1), (-1, 1), LIGHT_GRAY),
            ("BOX", (0, 0), (-1, -1), 0.5, BORDER_COLOR),
            ("INNERGRID", (0, 0), (-1, -1), 0.5, BORDER_COLOR),
            ("TOPPADDING", (0, 0), (-1, -1), 5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ("LEFTPADDING", (0, 0), (-1, -1), 6),
            ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ])
    )
    story.append(metrics_table)
    story.append(Spacer(1, 8))

    # 3. Green Score Components Breakdown
    components = score_obj.get("components", [])
    if components:
        story.append(Paragraph("Green Score Breakdown", h2_style))
        comp_rows = [
            [
                Paragraph("<b>Component</b>", table_header_style),
                Paragraph("<b>Score</b>", table_header_style),
                Paragraph("<b>Weight</b>", table_header_style),
                Paragraph("<b>Operational Observation</b>", table_header_style),
            ]
        ]
        for c in components:
            c_score = int(c.get("score", 0))
            score_color_tag = _score_color(c_score).hexval()
            comp_rows.append([
                Paragraph(f"<b>{c.get('label', '')}</b>", table_cell_style),
                Paragraph(f"<font color='{score_color_tag}'><b>{c_score}/100</b></font>", table_cell_style),
                Paragraph(f"{int(c.get('weight', 0) * 100)}%", table_cell_style),
                Paragraph(c.get("detail", ""), table_cell_style),
            ])
        comp_table = Table(comp_rows, colWidths=[120, 65, 55, 300])
        comp_table.setStyle(
            TableStyle([
                ("BACKGROUND", (0, 0), (-1, 0), LIGHT_GRAY),
                ("BOX", (0, 0), (-1, -1), 0.5, BORDER_COLOR),
                ("INNERGRID", (0, 0), (-1, -1), 0.5, BORDER_COLOR),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                ("LEFTPADDING", (0, 0), (-1, -1), 5),
                ("RIGHTPADDING", (0, 0), (-1, -1), 5),
            ])
        )
        story.append(comp_table)
        story.append(Spacer(1, 8))

    # 4. Resource Trends
    trends = report_data.get("trends", [])
    if trends:
        trend_texts = []
        for t in trends:
            chg = t.get("change_pct", 0)
            direction = "▲ increased" if chg > 0 else ("▼ reduced" if chg < 0 else "— steady")
            color_tag = "#dc2626" if (chg > 0 and t.get("resource") != "waste") else "#059669"
            trend_texts.append(
                f"<b>{t.get('resource', '').title()}</b> ({t.get('window_hours')}h window): "
                f"<font color='{color_tag}'><b>{direction} by {abs(chg):.1f}%</b></font> "
                f"({t.get('recent', 0):g} {t.get('unit')} vs {t.get('previous', 0):g} {t.get('unit')})"
            )
        story.append(Paragraph("Resource Trends", h2_style))
        story.append(Paragraph("<br/>".join(f"• {txt}" for txt in trend_texts), body_style))
        story.append(Spacer(1, 8))

    # 5. Prioritized Actionable Recommendations
    recs = report_data.get("recommendations", [])
    if recs:
        story.append(Paragraph("Prioritized Actionable Recommendations", h2_style))
        rec_rows = [
            [
                Paragraph("<b>Priority</b>", table_header_style),
                Paragraph("<b>Action & Location</b>", table_header_style),
                Paragraph("<b>Estimated Savings / Day</b>", table_header_style),
                Paragraph("<b>Timeframe</b>", table_header_style),
            ]
        ]
        for r in recs[:6]:
            prio = r.get("priority", "medium").upper()
            prio_color = CORAL_COLOR.hexval() if prio in ("CRITICAL", "HIGH") else (AMBER_COLOR.hexval() if prio == "MEDIUM" else EMERALD_COLOR.hexval())
            loc = r.get("location", {})
            loc_str = f"{loc.get('zone', 'Campus')} ({loc.get('building', 'Main')})"
            savings_parts = []
            if r.get("est_kwh_saved"):
                savings_parts.append(f"<b>{r.get('est_kwh_saved'):g} kWh</b>")
            if r.get("est_litres_saved"):
                savings_parts.append(f"<b>{r.get('est_litres_saved'):g} L water</b>")
            if r.get("est_kg_saved"):
                savings_parts.append(f"<b>{r.get('est_kg_saved'):g} kg waste</b>")
            savings_str = ", ".join(savings_parts) or "Operational efficiency"

            rec_rows.append([
                Paragraph(f"<font color='{prio_color}'><b>{prio}</b></font>", table_cell_style),
                Paragraph(f"<b>{r.get('title', '')}</b><br/>{r.get('action', '')}<br/><font color='{MUTED_INK.hexval()}'>Location: {loc_str}</font>", table_cell_style),
                Paragraph(savings_str, badge_style),
                Paragraph(r.get("timeframe", "this week"), table_cell_style),
            ])

        rec_table = Table(rec_rows, colWidths=[65, 275, 130, 70])
        rec_table.setStyle(
            TableStyle([
                ("BACKGROUND", (0, 0), (-1, 0), MINT_BG),
                ("BOX", (0, 0), (-1, -1), 0.5, BORDER_COLOR),
                ("INNERGRID", (0, 0), (-1, -1), 0.5, BORDER_COLOR),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("TOPPADDING", (0, 0), (-1, -1), 5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
                ("LEFTPADDING", (0, 0), (-1, -1), 5),
                ("RIGHTPADDING", (0, 0), (-1, -1), 5),
            ])
        )
        story.append(KeepTogether(rec_table))
        story.append(Spacer(1, 8))

    # 6. Executive Summary & Outlook
    markdown_text = report_data.get("markdown", "")
    executive_text = ""
    outlook_text = ""
    if "## Executive summary" in markdown_text:
        parts = markdown_text.split("## Executive summary")
        if len(parts) > 1:
            executive_text = parts[1].split("##")[0].strip()
    if "## Outlook" in markdown_text:
        parts = markdown_text.split("## Outlook")
        if len(parts) > 1:
            outlook_text = parts[1].split("##")[0].strip()

    if executive_text or outlook_text:
        story.append(Spacer(1, 4))
        if executive_text:
            story.append(Paragraph("Executive Summary", h2_style))
            story.append(Paragraph(executive_text.replace("\n", " "), callout_style))
            story.append(Spacer(1, 6))
        if outlook_text:
            story.append(Paragraph("Projected Sustainability Outlook", h2_style))
            story.append(Paragraph(outlook_text.replace("\n", " "), body_style))
            story.append(Spacer(1, 6))

    # Footer note
    story.append(HRFlowable(width="100%", thickness=0.5, color=BORDER_COLOR, spaceBefore=8, spaceAfter=4))
    story.append(
        Paragraph(
            "Verdant Twin · AI-Powered Sustainable Digital Twin · Generated by Generative AI Layer",
            ParagraphStyle("Footer", parent=styles["Normal"], fontName="Helvetica", fontSize=7.5, textColor=MUTED_INK, alignment=1),
        )
    )

    doc.build(story)
    buffer.seek(0)
    return buffer.getvalue()
