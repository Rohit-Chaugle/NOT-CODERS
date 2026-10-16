/**
 * Typed client for the Generative AI endpoints:
 * - POST /ai/recommendations
 * - POST /ai/report
 * - GET  /ai/report/pdf
 * - POST /ai/chat
 * - GET  /ai/provider
 */

export type Recommendation = {
  id: string;
  issue_ids: number[];
  title: string;
  action: string;
  rationale: string;
  location: {
    building: string;
    building_code?: string | null;
    zone: string;
    zone_id?: number | null;
  };
  category: "energy" | "water" | "waste" | "efficiency";
  priority: "critical" | "high" | "medium" | "low";
  priority_score: number;
  type: string;
  source: string;
  timeframe: string;
  quick_win: boolean;
  confidence: number;
  est_kwh_saved: number;
  est_litres_saved: number;
  est_kg_saved: number;
};

export type GreenScoreComponent = {
  key: string;
  label: string;
  score: number;
  weight: number;
  detail: string;
};

export type GreenScore = {
  score: number;
  grade: "A" | "B" | "C" | "D" | "E";
  label: string;
  components: GreenScoreComponent[];
};

export type ProviderInfo = {
  name: "openai" | "gemini" | "anthropic" | "template" | string;
  model: string | null;
  live: boolean;
  detail: string;
};

export type RecommendationsResponse = {
  generated_at: string;
  provider: ProviderInfo;
  green_score: GreenScore;
  summary: string;
  recommendations: Recommendation[];
  totals: {
    est_kwh_saved: number;
    est_litres_saved: number;
    est_kg_saved: number;
    count: number;
    quick_wins: number;
  };
};

export type ResourceTrend = {
  resource: string;
  unit: string;
  window_hours: number;
  recent: number;
  previous: number;
  change_pct: number;
};

export type SustainabilityReport = {
  title: string;
  period: string;
  generated_at: string;
  provider: ProviderInfo;
  green_score: GreenScore;
  metrics: {
    energy_current_kw: number;
    energy_today_kwh: number;
    energy_budget_kw: number;
    water_current_lpm: number;
    water_today_liters: number;
    waste_avg_fill_pct: number;
    waste_overflow_bins: number;
    issues_open: number;
    issues_resolved: number;
    issues_resolved_24h: number;
    occupancy_current: number;
    occupancy_capacity: number;
  };
  trends: ResourceTrend[];
  recommendations: Recommendation[];
  markdown: string;
  pdf_base64: string | null;
  pdf_url: string | null;
};

export type ChatMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};

export type ChatResponse = {
  reply: string;
  provider: ProviderInfo;
  suggestions: string[];
  fallback: boolean;
};

async function postJson<T>(url: string, body: unknown = {}): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let detail = `${url} responded ${res.status}`;
    try {
      const err = await res.json();
      if (err?.detail) detail = String(err.detail);
    } catch {
      // fallback
    }
    throw new Error(detail);
  }
  return res.json() as Promise<T>;
}

export async function fetchRecommendations(
  params?: { open_issues?: unknown[]; recent_stats?: unknown },
): Promise<RecommendationsResponse> {
  return postJson<RecommendationsResponse>("/ai/recommendations", params ?? {});
}

export async function fetchReport(
  params?: { period?: string; format?: "json" | "pdf" },
): Promise<SustainabilityReport> {
  return postJson<SustainabilityReport>("/ai/report", params ?? {});
}

export async function sendChatMessage(
  messages: ChatMessage[] | string,
): Promise<ChatResponse> {
  const payload = typeof messages === "string" ? { message: messages } : { messages };
  return postJson<ChatResponse>("/ai/chat", payload);
}

export async function fetchProviderInfo(): Promise<ProviderInfo> {
  const res = await fetch("/ai/provider", { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`/ai/provider responded ${res.status}`);
  return res.json() as Promise<ProviderInfo>;
}

/**
 * Triggers a download of the sustainability report PDF from the backend.
 */
export async function downloadReportPdf(): Promise<void> {
  const res = await fetch("/ai/report/pdf");
  if (!res.ok) throw new Error("Failed to download sustainability report PDF");
  const blob = await res.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "campus-sustainability-report.pdf";
  document.body.appendChild(a);
  a.click();
  window.URL.revokeObjectURL(url);
  document.body.removeChild(a);
}
