import { useCallback, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useTwinData } from "../hooks/useTwinData";
import TwinScene from "../three/TwinScene";
import { STATUS_HEX } from "../three/layout";
import { ACCENT_HEX, hexA } from "../theme/palette";
import BuildingDetailPanel from "../components/twin/BuildingDetailPanel";
import SceneErrorBoundary from "../components/twin/SceneErrorBoundary";

const LEGEND: { label: string; hex: string }[] = [
  { label: "Healthy", hex: STATUS_HEX.healthy },
  { label: "Warning", hex: STATUS_HEX.warning },
  { label: "Critical", hex: STATUS_HEX.critical },
];

export default function DigitalTwin() {
  const twin = useTwinData();
  const [night, setNight] = useState(true);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const onSelect = useCallback((id: number) => setSelectedId(id), []);
  const onBackground = useCallback(() => setSelectedId(null), []);

  const selectedBuilding = useMemo(
    () => twin.buildings.find((b) => b.id === selectedId) ?? null,
    [twin.buildings, selectedId],
  );

  const issuesForBuilding = useMemo(
    () => (selectedId === null ? [] : twin.issues.filter((i) => i.building_id === selectedId)),
    [twin.issues, selectedId],
  );

  return (
    <div className="relative h-full min-h-[520px] overflow-hidden rounded-2xl">
      {/* 3D scene */}
      <div className="absolute inset-0">
        {twin.buildings.length > 0 && (
          <SceneErrorBoundary>
            <TwinScene
              buildings={twin.buildings}
              statuses={twin.statuses}
              anomalies={twin.anomalies}
              night={night}
              selectedId={selectedId}
              onSelect={onSelect}
              onBackgroundClick={onBackground}
            />
          </SceneErrorBoundary>
        )}
      </div>

      {/* Loading / error */}
      {twin.loading && (
        <div className="absolute inset-0 z-30 flex items-center justify-center">
          <div className="glass flex items-center gap-3 px-5 py-4">
            <span className="live-dot h-2.5 w-2.5 rounded-full" style={{ background: ACCENT_HEX.mint }} />
            <span className="label-mono text-mint">Loading campus twin…</span>
          </div>
        </div>
      )}
      {twin.error && !twin.loading && (
        <div className="absolute inset-0 z-30 flex items-center justify-center">
          <div className="glass max-w-sm px-5 py-4 text-center" data-accent="coral">
            <p className="label-mono text-coral">Backend unreachable</p>
            <p className="mt-2 text-[13px] text-ink-dim">{twin.error}</p>
            <button
              onClick={twin.reload}
              className="label-mono mt-3 rounded-full bg-coral px-4 py-1.5 text-abyss"
            >
              Retry
            </button>
          </div>
        </div>
      )}

      {/* Top-left: title + legend */}
      <div className="pointer-events-none absolute left-3 top-3 z-20 flex flex-col gap-2">
        <div className="glass pointer-events-auto px-3.5 py-2.5">
          <h2 className="font-display text-sm font-semibold text-ink">Campus Digital Twin</h2>
          <p className="label-mono mt-1">
            {twin.summary
              ? `${twin.summary.buildings} buildings · ${twin.summary.zones} zones · ${twin.summary.sensors} sensors`
              : "live topology"}
          </p>
        </div>
        <div className="glass pointer-events-auto flex items-center gap-3 px-3 py-2">
          {LEGEND.map((l) => (
            <span key={l.label} className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full" style={{ background: l.hex, boxShadow: `0 0 8px ${l.hex}` }} />
              <span className="label-mono" style={{ color: l.hex }}>
                {l.label}
              </span>
            </span>
          ))}
        </div>
      </div>

      {/* Top-right: controls */}
      <div className="absolute right-3 top-3 z-20 flex items-center gap-2">
        <button
          onClick={() => setNight((n) => !n)}
          className="glass label-mono px-3 py-2 transition-colors hover:text-ink"
          data-accent={night ? "violet" : "amber"}
        >
          {night ? "☾ Night" : "☀ Day"}
        </button>
        <button
          onClick={onBackground}
          className="glass label-mono px-3 py-2 transition-colors hover:text-ink"
        >
          ⌂ Reset view
        </button>
        <div className="glass flex items-center gap-2 px-3 py-2">
          <span
            className="live-dot h-2 w-2 rounded-full"
            style={{ background: twin.connected ? ACCENT_HEX.mint : ACCENT_HEX.coral }}
          />
          <span className="label-mono">{twin.connected ? "Live" : "Offline"}</span>
        </div>
      </div>

      {/* Bottom hint */}
      <div className="pointer-events-none absolute bottom-3 left-3 z-20">
        <div className="glass px-3 py-1.5">
          <span className="label-mono text-ink-dim">Click a building to inspect · drag to orbit · scroll to zoom</span>
        </div>
      </div>

      {/* Anomaly summary chip */}
      {twin.anomalies.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="absolute bottom-3 right-3 z-20"
        >
          <div className="glass flex items-center gap-2 px-3 py-2" data-accent="coral">
            <span className="live-dot h-2 w-2 rounded-full" style={{ background: ACCENT_HEX.coral }} />
            <span className="label-mono text-coral">
              {twin.anomalies.length} active anomal{twin.anomalies.length === 1 ? "y" : "ies"}
            </span>
          </div>
        </motion.div>
      )}

      {/* Detail panel */}
      <AnimatePresence>
        {selectedBuilding && (
          <BuildingDetailPanel
            building={selectedBuilding}
            status={twin.statuses[selectedBuilding.id] ?? "healthy"}
            totals={twin.totals[selectedBuilding.id] ?? { energy: 0, water: 0, waste: 0, occupancy: 0 }}
            series={twin.series[selectedBuilding.id] ?? null}
            issues={issuesForBuilding}
            onClose={() => setSelectedId(null)}
          />
        )}
      </AnimatePresence>

      {/* subtle inner accent border */}
      <div
        className="pointer-events-none absolute inset-0 z-10 rounded-2xl"
        style={{ boxShadow: `inset 0 0 60px ${hexA(ACCENT_HEX.mint, 0.06)}` }}
      />
    </div>
  );
}
