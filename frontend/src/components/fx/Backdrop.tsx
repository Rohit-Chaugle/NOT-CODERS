/**
 * Full-screen night-garden backdrop: deep abyss + animated aurora blobs,
 * vignette and a fine film-grain layer. Sits behind the 3D scene.
 */
export default function Backdrop() {
  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden bg-abyss">
      {/* Aurora blobs */}
      <div
        className="aurora-blob-b absolute -left-[15%] top-[-20%] h-[65vh] w-[65vw] rounded-full blur-[120px]"
        style={{
          background:
            "radial-gradient(circle at 40% 40%, rgba(92,255,177,0.22), transparent 65%)",
        }}
      />
      <div
        className="aurora-blob-a absolute -right-[10%] top-[15%] h-[55vh] w-[55vw] rounded-full blur-[130px]"
        style={{
          background:
            "radial-gradient(circle at 60% 50%, rgba(139,92,255,0.20), transparent 65%)",
        }}
      />
      <div
        className="aurora-blob-c absolute bottom-[-25%] left-[25%] h-[60vh] w-[70vw] rounded-full blur-[140px]"
        style={{
          background:
            "radial-gradient(circle at 50% 50%, rgba(255,184,77,0.13), transparent 65%)",
        }}
      />

      {/* Horizon glow */}
      <div
        className="absolute inset-x-0 bottom-0 h-1/3"
        style={{
          background:
            "linear-gradient(to top, rgba(92,255,177,0.07), transparent 70%)",
        }}
      />

      {/* Vignette */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at center, transparent 45%, rgba(2,6,5,0.75) 100%)",
        }}
      />

      {/* Film grain */}
      <div className="grain-layer absolute -inset-[15%]" />
    </div>
  );
}
