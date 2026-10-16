import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = { children: ReactNode; fallback?: ReactNode };
type State = { hasError: boolean; message: string };

/**
 * Catches render/GL errors from the WebGL scene so the rest of the HUD keeps
 * working (and shows a readable message instead of a blank canvas).
 */
export default class SceneErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: "" };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Twin scene error:", error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <div className="flex h-full items-center justify-center">
            <div className="glass max-w-sm px-5 py-4 text-center" data-accent="coral">
              <p className="label-mono text-coral">3D scene unavailable</p>
              <p className="mt-2 text-[13px] text-ink-dim">
                This device or browser could not start WebGL. The live data panels still work.
              </p>
              <p className="mt-2 font-mono text-[10px] text-ink-dim/60">{this.state.message}</p>
            </div>
          </div>
        )
      );
    }
    return this.props.children;
  }
}
