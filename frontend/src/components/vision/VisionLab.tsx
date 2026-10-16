import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";

import GlassPanel from "../ui/GlassPanel";
import { CameraIcon, Glyph } from "../ui/Icons";
import { fetchCampus, type CampusBuilding } from "../../api/twin";
import { analyzeImage, type VisionDetection, type VisionResponse } from "../../api/vision";
import { ACCENT_HEX, ISSUE_TYPE_META, SEVERITY_ACCENT, hexA } from "../../theme/palette";

type Phase = "idle" | "scanning" | "done" | "error";

/** Keep the sweep visible even when the response is instant. */
const SCAN_MIN_MS = 1500;

function accentFor(severity: string) {
  return ACCENT_HEX[SEVERITY_ACCENT[severity] ?? "amber"];
}

/** One detection drawn over the image, positioned from normalized coords. */
function DetectionBox({ detection, index }: { detection: VisionDetection; index: number }) {
  const hex = accentFor(detection.severity);
  const [x1, y1, x2, y2] = detection.bbox;
  // Put the caption above the box, or below it when the box hugs the top edge.
  const captionBelow = y1 < 0.14;

  const corners: CSSProperties[] = [
    { top: -1, left: -1, borderTop: `2.5px solid ${hex}`, borderLeft: `2.5px solid ${hex}` },
    { top: -1, right: -1, borderTop: `2.5px solid ${hex}`, borderRight: `2.5px solid ${hex}` },
    { bottom: -1, left: -1, borderBottom: `2.5px solid ${hex}`, borderLeft: `2.5px solid ${hex}` },
    { bottom: -1, right: -1, borderBottom: `2.5px solid ${hex}`, borderRight: `2.5px solid ${hex}` },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: 0.12 + index * 0.16, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className="absolute rounded-[3px]"
      style={{
        left: `${x1 * 100}%`,
        top: `${y1 * 100}%`,
        width: `${(x2 - x1) * 100}%`,
        height: `${(y2 - y1) * 100}%`,
        border: `1.5px solid ${hex}`,
        boxShadow: `0 0 0 1px ${hexA(hex, 0.28)}, inset 0 0 24px ${hexA(hex, 0.18)}`,
      }}
      data-testid="vision-box"
    >
      {corners.map((style, i) => (
        <span key={i} className="absolute h-2.5 w-2.5" style={style} />
      ))}

      <span
        className="label-mono absolute whitespace-nowrap rounded px-1.5 py-0.5 backdrop-blur-sm"
        style={{
          color: hex,
          background: hexA(hex, 0.18),
          border: `1px solid ${hexA(hex, 0.45)}`,
          ...(captionBelow
            ? { top: "100%", left: 0, marginTop: 4 }
            : { bottom: "100%", left: 0, marginBottom: 4 }),
        }}
      >
        {detection.label} · {Math.round(detection.confidence * 100)}%
      </span>
    </motion.div>
  );
}

export default function VisionLab() {
  const [buildings, setBuildings] = useState<CampusBuilding[]>([]);
  const [zoneId, setZoneId] = useState<number | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [result, setResult] = useState<VisionResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const zones = useMemo(
    () =>
      buildings.flatMap((b) =>
        b.zones.map((z) => ({ id: z.id, name: z.name, building: `${b.code} · ${b.name}` })),
      ),
    [buildings],
  );

  // Zone picker is populated from the live twin topology.
  useEffect(() => {
    const ctrl = new AbortController();
    fetchCampus(ctrl.signal)
      .then((campus) => {
        setBuildings(campus.buildings);
        const first = campus.buildings[0]?.zones[0];
        if (first) setZoneId((prev) => prev ?? first.id);
      })
      .catch(() => {
        /* the analyze call surfaces connection problems */
      });
    return () => ctrl.abort();
  }, []);

  // Object URL lifecycle for the dropped frame.
  useEffect(() => {
    if (!file) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const run = useCallback(async (frame: File, zone: number) => {
    setPhase("scanning");
    setError(null);
    setResult(null);
    const started = Date.now();
    const settle = async () => {
      const elapsed = Date.now() - started;
      if (elapsed < SCAN_MIN_MS) await new Promise((resolve) => setTimeout(resolve, SCAN_MIN_MS - elapsed));
    };
    try {
      const response = await analyzeImage(frame, zone);
      await settle();
      setResult(response);
      setPhase("done");
    } catch (err: unknown) {
      await settle();
      setError(err instanceof Error ? err.message : "Analysis failed");
      setPhase("error");
    }
  }, []);

  // Auto-run as soon as a frame and a zone are both available — and re-run if
  // the operator switches zone afterwards.
  useEffect(() => {
    if (file && zoneId !== null) void run(file, zoneId);
  }, [file, zoneId, run]);

  const accept = useCallback(
    (candidate: File | undefined) => {
      if (!candidate) return;
      if (!candidate.type.startsWith("image/")) {
        setError(`${candidate.name} is not an image.`);
        setPhase("error");
        return;
      }
      setFile(candidate);
    },
    [],
  );

  const reset = useCallback(() => {
    setFile(null);
    setResult(null);
    setError(null);
    setPhase("idle");
    if (inputRef.current) inputRef.current.value = "";
  }, []);

  const scanMore = useCallback(() => {
    setFile(null);
    setResult(null);
    setError(null);
    setPhase("idle");
    if (inputRef.current) {
      inputRef.current.value = "";
      inputRef.current.click();
    }
  }, []);

  const engineBadge = result ? (
    result.engine === "yolo" ? (
      <span
        className="label-mono inline-flex items-center gap-1 rounded-full px-2 py-0.5"
        style={{ color: ACCENT_HEX.mint, background: hexA(ACCENT_HEX.mint, 0.14) }}
      >
        YOLO · {result.model ?? result.config.model}
      </span>
    ) : (
      <span
        className="label-mono inline-flex items-center gap-1 rounded-full px-2 py-0.5"
        style={{ color: ACCENT_HEX.amber, background: hexA(ACCENT_HEX.amber, 0.14) }}
        title={result.reason ?? "mock detector"}
        data-testid="vision-engine"
      >
        mock detector
      </span>
    )
  ) : null;

  return (
    <GlassPanel
      title="Vision Lab"
      subtitle="Drop a campus frame — CV findings become issues"
      accent="violet"
      delay={0.1}
    >
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        {/* ---------------- capture / image ---------------- */}
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <label className="label-mono">Zone</label>
            <select
              value={zoneId ?? ""}
              onChange={(e) => setZoneId(Number(e.target.value))}
              disabled={zones.length === 0 || phase === "scanning"}
              className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/40 px-3 py-1.5 text-[13px] text-ink outline-none transition-colors focus:border-violet/60 disabled:opacity-50"
            >
              {zones.length === 0 && <option value="">loading zones…</option>}
              {zones.map((z) => (
                <option key={z.id} value={z.id}>
                  {z.building} — {z.name}
                </option>
              ))}
            </select>
          </div>

          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="sr-only"
            data-testid="vision-file"
            onChange={(e) => accept(e.target.files?.[0])}
          />

          {!file ? (
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                accept(e.dataTransfer.files?.[0]);
              }}
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              className="dropzone flex w-full cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-6 py-14 text-center transition-all duration-300"
              data-testid="vision-dropzone"
              style={{
                borderColor: dragging ? ACCENT_HEX.violet : "rgba(216,239,228,0.16)",
                background: dragging ? hexA(ACCENT_HEX.violet, 0.08) : "transparent",
              }}
            >
              <span
                className="rounded-xl p-3"
                style={{ color: ACCENT_HEX.violet, background: hexA(ACCENT_HEX.violet, 0.12) }}
              >
                <CameraIcon size={22} />
              </span>
              <span className="font-display text-sm font-semibold text-ink">
                {dragging ? "Release to scan" : "Drop an image or click to browse"}
              </span>
              <span className="label-mono">jpg · png · webp — up to 8 MB</span>
            </button>
          ) : (
            <div className="flex justify-center">
              <div className="relative w-fit">
                {preview && (
                  <img
                    src={preview}
                    alt="Frame sent for analysis"
                    className="block max-h-[42vh] w-auto max-w-full rounded-xl border border-white/10 lg:max-h-[52vh]"
                  />
                )}

                {/* bounding boxes */}
                {phase === "done" &&
                  result?.detections.map((detection, i) => (
                    <DetectionBox key={`${detection.kind}-${i}`} detection={detection} index={i} />
                  ))}

                {/* scanning sweep */}
                {phase === "scanning" && (
                  <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-xl">
                    <div className="scan-grid absolute inset-0 opacity-40" />
                    <div
                      className="scan-line absolute left-0 right-0 h-[2px]"
                      style={{
                        background: `linear-gradient(90deg, transparent, ${ACCENT_HEX.mint}, transparent)`,
                        boxShadow: `0 0 18px ${ACCENT_HEX.mint}`,
                      }}
                    />
                    <div className="absolute inset-x-0 bottom-2 flex justify-center">
                      <span
                        className="label-mono rounded-full px-3 py-1"
                        style={{ color: ACCENT_HEX.mint, background: "rgba(4,11,9,0.7)" }}
                      >
                        Analysing frame…
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={phase === "scanning"}
              className="rounded-lg border border-violet/30 bg-violet/10 px-3 py-1.5 text-[12px] text-violet transition-colors hover:bg-violet/20 disabled:opacity-50"
            >
              Choose another
            </button>
            {file && (
              <button
                type="button"
                onClick={reset}
                className="rounded-lg border border-white/10 px-3 py-1.5 text-[12px] text-ink-dim transition-colors hover:text-ink"
              >
                Clear
              </button>
            )}
            {result && <span className="ml-auto">{engineBadge}</span>}
          </div>
        </div>

        {/* ---------------- results ---------------- */}
        <div className="min-w-0">
          {phase === "idle" && (
            <div className="rounded-xl border border-white/8 bg-white/[0.02] p-4 text-[12px] leading-relaxed text-ink-dim">
              The detector looks for three things: overflowing waste, lights left on in empty
              rooms, and water pooling on the floor. High-confidence findings are written to the
              issues board with <span className="text-violet">source = vision</span>.
            </div>
          )}

          {phase === "scanning" && (
            <div className="space-y-2">
              <p className="label-mono">Running inference…</p>
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-14 animate-pulse rounded-xl border border-white/5 bg-white/[0.03]" />
              ))}
            </div>
          )}

          {phase === "error" && (
            <div className="rounded-xl border border-coral/30 bg-coral/[0.07] p-4 text-[12px] text-ink-dim">
              <p className="font-display mb-1 text-[13px] text-coral">Scan failed</p>
              {error}
              <button
                type="button"
                onClick={() => (file && zoneId !== null ? void run(file, zoneId) : reset())}
                className="mt-3 block rounded-lg border border-coral/40 px-3 py-1.5 text-[12px] text-coral transition-colors hover:bg-coral/10"
              >
                Retry
              </button>
            </div>
          )}

          {phase === "done" && result && (
              <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
              className="space-y-3"
              data-testid="vision-result"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="label-mono">
                  {result.zone.building_name ?? "Campus"} / {result.zone.name}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: "Detections", value: result.detections.length, hex: ACCENT_HEX.mint },
                  { label: "Issues raised", value: result.issues.length, hex: ACCENT_HEX.coral },
                  { label: "Already open", value: result.suppressed.length, hex: ACCENT_HEX.amber },
                ].map((stat) => (
                  <div
                    key={stat.label}
                    className="rounded-xl border p-2.5"
                    style={{ borderColor: hexA(stat.hex, 0.22), background: hexA(stat.hex, 0.05) }}
                  >
                    <div className="font-display text-lg font-semibold" style={{ color: stat.hex }}>
                      {stat.value}
                    </div>
                    <div className="label-mono">{stat.label}</div>
                  </div>
                ))}
              </div>

              {result.detections.length === 0 && (
                <p className="rounded-xl border border-white/8 bg-white/[0.02] p-3 text-[12px] text-ink-dim">
                  No findings in this frame.
                </p>
              )}

              {result.detections.map((detection, i) => {
                const hex = accentFor(detection.severity);
                const meta = ISSUE_TYPE_META[detection.issue_type];
                return (
                  <motion.div
                    key={`${detection.kind}-${i}`}
                    initial={{ opacity: 0, x: 16 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.1 + i * 0.12, duration: 0.35 }}
                    className="rounded-xl border p-3"
                    style={{ borderColor: hexA(hex, 0.24), background: hexA(hex, 0.05) }}
                  >
                    <div className="flex items-center gap-2">
                      {meta && (
                        <span
                          className="rounded-md p-1"
                          style={{ color: ACCENT_HEX[meta.accent], background: hexA(ACCENT_HEX[meta.accent], 0.14) }}
                        >
                          <Glyph name={meta.glyph} size={13} />
                        </span>
                      )}
                      <h3 className="font-display truncate text-[13px] font-semibold text-ink">
                        {detection.label}
                      </h3>
                      <span
                        className="label-mono ml-auto shrink-0 rounded-full px-2 py-0.5"
                        style={{ color: hex, background: hexA(hex, 0.14) }}
                      >
                        {Math.round(detection.confidence * 100)}%
                      </span>
                    </div>
                    <p className="mt-1 text-[12px] leading-snug text-ink-dim">{detection.detail}</p>
                  </motion.div>
                );
              })}

              {result.issues.length > 0 && (
                <div className="rounded-xl border border-violet/25 bg-violet/[0.06] p-3" data-testid="vision-issued">
                  <p className="label-mono mb-1">Broadcast to live feed + 3D twin</p>
                  <ul className="space-y-1 text-[12px] text-ink-dim">
                    {result.issues.map((issue) => (
                      <li key={issue.id} className="flex items-center gap-2">
                        <span
                          className="h-1.5 w-1.5 shrink-0 rounded-full"
                          style={{ background: accentFor(issue.severity) }}
                        />
                        <span className="truncate text-ink">{issue.title}</span>
                        <span className="label-mono ml-auto shrink-0 opacity-70">#{issue.id}</span>
                      </li>
                    ))}
                  </ul>
                  <Link
                    to="/twin"
                    className="label-mono mt-2 inline-flex items-center gap-1 text-violet hover:underline"
                  >
                    See it on the 3D twin →
                  </Link>
                </div>
              )}

              {result.suppressed.length > 0 && (
                <p className="rounded-xl border border-amber/25 bg-amber/[0.06] p-3 text-[12px] text-ink-dim">
                  {result.suppressed.length} finding{result.suppressed.length > 1 ? "s" : ""} skipped —{" "}
                  {result.suppressed[0].reason}.
                </p>
              )}

              {result.engine === "mock" && (
                <p className="text-[11px] leading-relaxed text-ink-dim/70">
                  Mock detector in use{result.reason ? `: ${result.reason}` : ""}. Install{" "}
                  <span className="text-ink-dim">requirements-vision.txt</span> for real YOLO inference.
                </p>
              )}

              <button
                type="button"
                onClick={scanMore}
                className="w-full rounded-lg border border-violet/30 bg-violet/10 px-3 py-2 text-[12px] text-violet transition-colors hover:bg-violet/20"
              >
                Scan another frame
              </button>
            </motion.div>
          )}
        </div>
      </div>
    </GlassPanel>
  );
}
