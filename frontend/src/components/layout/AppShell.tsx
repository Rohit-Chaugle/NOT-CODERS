import type { ReactNode } from "react";
import { useLocation } from "react-router-dom";
import Backdrop from "../fx/Backdrop";
import CursorGlow from "../fx/CursorGlow";
import CampusScene from "../scene/CampusScene";
import TopHud from "../hud/TopHud";
import IssueFeed from "../hud/IssueFeed";
import AiCopilotPanel from "../hud/AiCopilotPanel";
import Ticker from "../hud/Ticker";

type AppShellProps = { children: ReactNode };

/**
 * Living Campus app shell: full-screen 3D scene + aurora backdrop with
 * floating glass HUD panels (top bar, left feed, center content, right
 * insight, bottom ticker). On small screens the side panels collapse below
 * the content.
 *
 * The ambient backdrop scene is skipped on /twin — that page runs its own
 * (full-detail) WebGL canvas, so rendering a second one would be wasteful.
 */
export default function AppShell({ children }: AppShellProps) {
  const { pathname } = useLocation();
  const showBackdropScene = pathname !== "/twin";

  return (
    <div className="relative min-h-dvh text-ink">
      <Backdrop />
      {showBackdropScene && <CampusScene />}
      <CursorGlow />

      <div className="relative z-10 flex h-dvh flex-col gap-3 p-3 md:gap-4 md:p-4 overflow-hidden">
        <TopHud />

        {/* Desktop: feed | content | insights. Mobile: content stacked with panels. */}
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 md:gap-4 xl:grid-cols-[minmax(240px,320px)_minmax(0,1fr)_minmax(260px,340px)]">
          {/* Left feed — hidden on small screens, shown below content */}
          <aside className="order-2 hidden h-full min-h-0 flex-col xl:order-1 xl:flex">
            <IssueFeed />
          </aside>

          {/* Center stage — the routed page */}
          <main className="order-1 h-full min-h-0 overflow-hidden xl:order-2">{children}</main>

          {/* Right AI Copilot panel */}
          <aside className="order-3 hidden h-full min-h-0 flex-col xl:flex">
            <AiCopilotPanel />
          </aside>
        </div>

        {/* Mobile panels below content */}
        <div className="flex flex-col gap-3 xl:hidden">
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="flex-1">
              <IssueFeed />
            </div>
            <div className="flex-1">
              <AiCopilotPanel />
            </div>
          </div>
        </div>

        <Ticker />
      </div>
    </div>
  );
}
